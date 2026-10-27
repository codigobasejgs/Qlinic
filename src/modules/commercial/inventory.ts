// Regras de estoque (puras + aplicação no store). Quantidades sempre na UNIDADE BASE do produto.
// FEFO: baixa pelo lote com validade mais próxima; lotes VENCIDOS não são usados em saída/consumo (só perda/ajuste).
// Negativo: bloqueado, salvo Product.allowNegative OU política payments.allowNegativeStock.
import type { Lot, Product, StockMovement, StockMovementKind } from '@/domain/modules'
import type { Appointment, ID } from '@/domain/types'
import { db } from '@/data/store'
import { emit } from '@/data/events'
import { getPolicies } from '@/domain/settings'
import { nowISO, todayCivil } from '@/lib/dates'
import { uid } from '@/lib/util'
import './types'

export function roundQty(qty: number, decimals: number): number {
  const f = 10 ** Math.max(0, decimals)
  return Math.round(qty * f) / f
}

/** Converte quantidade numa unidade (base ou de compra) para a unidade base. Conversão desconhecida = erro. */
export function toBase(p: Pick<Product, 'baseUnit' | 'conversions' | 'decimals'>, qty: number, unit: string): number {
  if (!Number.isFinite(qty)) throw new Error('Quantidade inválida.')
  if (unit === p.baseUnit) return roundQty(qty, p.decimals)
  const c = p.conversions.find((x) => x.unit === unit)
  if (!c) throw new Error(`Conversão de "${unit}" para "${p.baseUnit}" não cadastrada.`)
  return roundQty(qty * c.factor, p.decimals)
}

export function lotAvailable(l: Lot) { return l.qty - l.reserved }
export function isExpired(l: Lot, today = todayCivil()) { return !!l.expiresOn && l.expiresOn < today }

/** Ordem FEFO dos lotes utilizáveis (não vencidos, com saldo livre). */
export function fefoLots(lots: Lot[], productId: ID, unitId: ID, today = todayCivil()): Lot[] {
  return lots
    .filter((l) => l.productId === productId && l.unitId === unitId && !isExpired(l, today) && lotAvailable(l) > 0)
    .sort((a, b) => (a.expiresOn ?? '9999-12-31').localeCompare(b.expiresOn ?? '9999-12-31') || a.createdAt.localeCompare(b.createdAt))
}

/** Plano de baixa FEFO. Retorna partes por lote e o que faltou. Puro. */
export function planFefo(lots: Lot[], productId: ID, unitId: ID, qty: number, decimals: number, today = todayCivil()) {
  let rest = roundQty(qty, decimals)
  const parts: { lotId: ID; qty: number }[] = []
  for (const l of fefoLots(lots, productId, unitId, today)) {
    if (rest <= 0) break
    const take = roundQty(Math.min(rest, lotAvailable(l)), decimals)
    if (take <= 0) continue
    parts.push({ lotId: l.id, qty: take })
    rest = roundQty(rest - take, decimals)
  }
  return { parts, shortfall: Math.max(0, rest) }
}

export function stockOf(lots: Lot[], productId: ID, unitId?: ID) {
  const ls = lots.filter((l) => l.productId === productId && (!unitId || l.unitId === unitId))
  return { qty: ls.reduce((a, l) => a + l.qty, 0), reserved: ls.reduce((a, l) => a + l.reserved, 0) }
}

export function negativeAllowed(tenantId: ID, p: Product, unitId?: ID) {
  return p.allowNegative || getPolicies(tenantId, unitId).payments.allowNegativeStock
}

function getProduct(tenantId: ID, productId: ID): Product {
  const p = db.get(tenantId, 'products', productId)
  if (!p) throw new Error('Produto não encontrado.')
  return p
}

function mv(tenantId: ID, m: Omit<StockMovement, 'id' | 'tenantId' | 'createdAt'>): StockMovement {
  return { ...m, id: uid('mv_'), tenantId, createdAt: nowISO() }
}

function commit(tenantId: ID, lots: Lot[], movements: StockMovement[], touched: { productId: ID; unitId: ID }[]) {
  db.set(tenantId, 'lots', lots)
  db.set(tenantId, 'stockMovements', [...db.list(tenantId, 'stockMovements'), ...movements])
  checkLow(tenantId, touched)
}

/** Emite 'stock.low' quando o saldo livre da unidade fica abaixo do mínimo. */
export function checkLow(tenantId: ID, touched: { productId: ID; unitId: ID }[]) {
  const lots = db.list(tenantId, 'lots')
  const seen = new Set<string>()
  for (const t of touched) {
    const k = `${t.productId}:${t.unitId}`
    if (seen.has(k)) continue
    seen.add(k)
    const p = db.get(tenantId, 'products', t.productId)
    if (!p) continue
    const s = stockOf(lots, p.id, t.unitId)
    if (s.qty - s.reserved < p.minQty) emit('stock.low', { tenantId, productId: p.id, name: p.name })
  }
}

/** Entrada por lote (com conversão de unidade de compra). Lote existente (mesmo código/unidade) é somado. */
export function receiveStock(tenantId: ID, a: { productId: ID; unitId: ID; qty: number; unit: string; lotCode: string; expiresOn?: string; reason?: string; refId?: ID; by: string; kind?: 'entrada' | 'transferencia_entrada' }) {
  const p = getProduct(tenantId, a.productId)
  const base = toBase(p, a.qty, a.unit)
  if (base <= 0) throw new Error('Quantidade deve ser maior que zero.')
  if (!a.lotCode.trim()) throw new Error('Informe o código do lote.')
  const lots = [...db.list(tenantId, 'lots')]
  let lot = lots.find((l) => l.productId === p.id && l.unitId === a.unitId && l.code === a.lotCode.trim())
  if (lot) {
    if (a.expiresOn && lot.expiresOn && lot.expiresOn !== a.expiresOn) throw new Error('Mesmo código de lote com validade diferente. Verifique a nota.')
    lot = { ...lot, qty: roundQty(lot.qty + base, p.decimals), expiresOn: lot.expiresOn ?? a.expiresOn }
    lots[lots.findIndex((l) => l.id === lot!.id)] = lot
  } else {
    lot = { id: uid('lot_'), tenantId, createdAt: nowISO(), productId: p.id, unitId: a.unitId, code: a.lotCode.trim(), expiresOn: a.expiresOn || undefined, qty: base, reserved: 0 }
    lots.push(lot)
  }
  const m = mv(tenantId, { productId: p.id, lotId: lot.id, unitId: a.unitId, kind: a.kind ?? 'entrada', qty: base, reason: a.reason ?? (a.unit !== p.baseUnit ? `${a.qty} ${a.unit} = ${base} ${p.baseUnit}` : undefined), by: a.by, refId: a.refId })
  commit(tenantId, lots, [m], [])
  return { lot, movement: m }
}

/** Saída FEFO (saída, consumo, transferência). Respeita regra de negativo. */
export function issueStock(tenantId: ID, a: { productId: ID; unitId: ID; qty: number; unit?: string; kind: Extract<StockMovementKind, 'saida' | 'consumo_procedimento' | 'transferencia_saida'>; reason?: string; appointmentId?: ID; refId?: ID; by: string; partialOnShortfall?: boolean }) {
  const p = getProduct(tenantId, a.productId)
  const base = toBase(p, a.qty, a.unit ?? p.baseUnit)
  if (base <= 0) throw new Error('Quantidade deve ser maior que zero.')
  const lots = [...db.list(tenantId, 'lots')]
  const plan = planFefo(lots, p.id, a.unitId, base, p.decimals)
  const allowNeg = negativeAllowed(tenantId, p, a.unitId)
  if (plan.shortfall > 0 && !allowNeg && !a.partialOnShortfall) {
    throw new Error(`Saldo insuficiente de "${p.name}": faltam ${plan.shortfall} ${p.baseUnit} (lotes vencidos não são usados). Estoque negativo bloqueado pela política.`)
  }
  const movements: StockMovement[] = []
  for (const part of plan.parts) {
    const i = lots.findIndex((l) => l.id === part.lotId)
    lots[i] = { ...lots[i], qty: roundQty(lots[i].qty - part.qty, p.decimals) }
    movements.push(mv(tenantId, { productId: p.id, lotId: part.lotId, unitId: a.unitId, kind: a.kind, qty: -part.qty, reason: a.reason, appointmentId: a.appointmentId, refId: a.refId, by: a.by }))
  }
  let unmet = 0
  if (plan.shortfall > 0) {
    if (allowNeg) {
      // Negativo permitido: remanescente sem lote identificado (exige conferência).
      movements.push(mv(tenantId, { productId: p.id, unitId: a.unitId, kind: a.kind, qty: -plan.shortfall, reason: `${a.reason ?? ''} [saldo negativo — sem lote, conferir]`.trim(), appointmentId: a.appointmentId, refId: a.refId, by: a.by }))
      const neg = lots.find((l) => l.productId === p.id && l.unitId === a.unitId && l.code === 'SEM-LOTE')
      if (neg) lots[lots.indexOf(neg)] = { ...neg, qty: roundQty(neg.qty - plan.shortfall, p.decimals) }
      else lots.push({ id: uid('lot_'), tenantId, createdAt: nowISO(), productId: p.id, unitId: a.unitId, code: 'SEM-LOTE', qty: -plan.shortfall, reserved: 0 })
    } else unmet = plan.shortfall
  }
  commit(tenantId, lots, movements, [{ productId: p.id, unitId: a.unitId }])
  return { movements, unmet }
}

/** Perda (inclui vencidos) de um lote específico. */
export function lossStock(tenantId: ID, a: { lotId: ID; qty: number; reason: string; by: string }) {
  if (!a.reason.trim()) throw new Error('Informe o motivo da perda.')
  const lots = [...db.list(tenantId, 'lots')]
  const i = lots.findIndex((l) => l.id === a.lotId)
  if (i < 0) throw new Error('Lote não encontrado.')
  const p = getProduct(tenantId, lots[i].productId)
  const q = roundQty(a.qty, p.decimals)
  if (q <= 0) throw new Error('Quantidade deve ser maior que zero.')
  if (q > lotAvailable(lots[i]) && !negativeAllowed(tenantId, p, lots[i].unitId)) throw new Error('Perda maior que o saldo livre do lote.')
  lots[i] = { ...lots[i], qty: roundQty(lots[i].qty - q, p.decimals) }
  const m = mv(tenantId, { productId: p.id, lotId: a.lotId, unitId: lots[i].unitId, kind: 'perda', qty: -q, reason: a.reason, by: a.by })
  commit(tenantId, lots, [m], [{ productId: p.id, unitId: lots[i].unitId }])
  return m
}

/** Ajuste/inventário: informa quantidade CONTADA; movimento = diferença (pode ser 0 → não gera movimento). */
export function countLot(tenantId: ID, a: { lotId: ID; counted: number; reason: string; by: string; kind: 'ajuste' | 'inventario' }) {
  if (!a.reason.trim()) throw new Error('Informe o motivo/identificação da contagem.')
  const lots = [...db.list(tenantId, 'lots')]
  const i = lots.findIndex((l) => l.id === a.lotId)
  if (i < 0) throw new Error('Lote não encontrado.')
  const p = getProduct(tenantId, lots[i].productId)
  const counted = roundQty(a.counted, p.decimals)
  if (counted < 0 && !negativeAllowed(tenantId, p, lots[i].unitId)) throw new Error('Contagem negativa não permitida.')
  if (counted < lots[i].reserved) throw new Error(`Contagem menor que a quantidade reservada (${lots[i].reserved}). Libere reservas antes.`)
  const diff = roundQty(counted - lots[i].qty, p.decimals)
  if (diff === 0) return { diff, movement: null }
  lots[i] = { ...lots[i], qty: counted }
  const m = mv(tenantId, { productId: p.id, lotId: a.lotId, unitId: lots[i].unitId, kind: a.kind, qty: diff, reason: `${a.reason} (sistema ${roundQty(counted - diff, p.decimals)} → contado ${counted})`, by: a.by })
  commit(tenantId, lots, [m], [{ productId: p.id, unitId: lots[i].unitId }])
  return { diff, movement: m }
}

/** Transferência entre unidades: saída FEFO na origem + entrada com mesmo código/validade no destino. */
export function transferStock(tenantId: ID, a: { productId: ID; fromUnitId: ID; toUnitId: ID; qty: number; by: string; reason?: string }) {
  if (a.fromUnitId === a.toUnitId) throw new Error('Origem e destino devem ser diferentes.')
  const p = getProduct(tenantId, a.productId)
  const plan = planFefo(db.list(tenantId, 'lots'), p.id, a.fromUnitId, toBase(p, a.qty, p.baseUnit), p.decimals)
  if (plan.shortfall > 0) throw new Error(`Saldo livre insuficiente na origem (faltam ${plan.shortfall} ${p.baseUnit}). Transferência não usa saldo negativo.`)
  const ref = uid('trf_')
  const snapshot = new Map(db.list(tenantId, 'lots').map((l) => [l.id, l]))
  issueStock(tenantId, { productId: p.id, unitId: a.fromUnitId, qty: a.qty, kind: 'transferencia_saida', reason: a.reason ?? 'Transferência entre unidades', refId: ref, by: a.by })
  for (const part of plan.parts) {
    const src = snapshot.get(part.lotId)!
    receiveStock(tenantId, { productId: p.id, unitId: a.toUnitId, qty: part.qty, unit: p.baseUnit, lotCode: src.code, expiresOn: src.expiresOn, reason: a.reason ?? 'Transferência entre unidades', refId: ref, by: a.by, kind: 'transferencia_entrada' })
  }
  return ref
}

export function reserveStock(tenantId: ID, a: { lotId: ID; qty: number; by: string; reason?: string; appointmentId?: ID; release?: boolean }) {
  const lots = [...db.list(tenantId, 'lots')]
  const i = lots.findIndex((l) => l.id === a.lotId)
  if (i < 0) throw new Error('Lote não encontrado.')
  const p = getProduct(tenantId, lots[i].productId)
  const q = roundQty(a.qty, p.decimals)
  if (q <= 0) throw new Error('Quantidade deve ser maior que zero.')
  if (a.release) { if (q > lots[i].reserved) throw new Error('Liberação maior que o reservado.') }
  else if (q > lotAvailable(lots[i])) throw new Error('Reserva maior que o saldo livre do lote.')
  else if (isExpired(lots[i])) throw new Error('Lote vencido não pode ser reservado.')
  lots[i] = { ...lots[i], reserved: roundQty(lots[i].reserved + (a.release ? -q : q), p.decimals) }
  // Reserva não altera quantidade física: movimento informativo com qty 0 e a quantidade reservada no motivo.
  const m = mv(tenantId, { productId: p.id, lotId: a.lotId, unitId: lots[i].unitId, kind: a.release ? 'liberacao_reserva' : 'reserva', qty: 0, reason: `${a.release ? 'Liberado' : 'Reservado'} ${q} ${p.baseUnit}${a.reason ? ` — ${a.reason}` : ''}`, appointmentId: a.appointmentId, by: a.by })
  commit(tenantId, lots, [m], [{ productId: p.id, unitId: lots[i].unitId }])
  return m
}

export function kitFor(tenantId: ID, serviceId: ID) {
  const kit = db.list(tenantId, 'serviceKits').find((k) => k.serviceId === serviceId)
  if (kit?.items.length) return kit.items
  return db.get(tenantId, 'services', serviceId)?.kit ?? []
}

/**
 * Consome a ficha técnica UMA ÚNICA VEZ por atendimento (Appointment.stockConsumedAt é a trava).
 * Procedimento já realizado: se faltar saldo e negativo for bloqueado, baixa o disponível e registra a falta
 * para conferência (não perde o registro do consumo real).
 */
export function consumeForAppointment(tenantId: ID, appointmentId: ID, by: string): { consumed: boolean; reason?: string; unmet?: { productId: ID; qty: number }[] } {
  const a = db.get(tenantId, 'appointments', appointmentId) as Appointment | undefined
  if (!a) return { consumed: false, reason: 'Atendimento não encontrado.' }
  if (a.stockConsumedAt) return { consumed: false, reason: 'Ficha técnica já consumida para este atendimento.' }
  if (a.status !== 'concluida') return { consumed: false, reason: 'Atendimento não concluído.' }
  const items = kitFor(tenantId, a.serviceId)
  // Trava ANTES da baixa: reentrância/evento duplicado não consome duas vezes.
  db.update(tenantId, 'appointments', a.id, { stockConsumedAt: nowISO() })
  if (!items.length) return { consumed: false, reason: 'Serviço sem ficha técnica.' }
  const unmet: { productId: ID; qty: number }[] = []
  for (const it of items) {
    if (!db.get(tenantId, 'products', it.productId)) continue
    const r = issueStock(tenantId, { productId: it.productId, unitId: a.unitId, qty: it.qty, kind: 'consumo_procedimento', reason: 'Consumo da ficha técnica', appointmentId: a.id, by, partialOnShortfall: true })
    if (r.unmet > 0) {
      unmet.push({ productId: it.productId, qty: r.unmet })
      db.set(tenantId, 'stockMovements', [...db.list(tenantId, 'stockMovements'), mv(tenantId, { productId: it.productId, unitId: a.unitId, kind: 'consumo_procedimento', qty: 0, reason: `FALTA de ${r.unmet} na baixa — conferir estoque/lançar entrada`, appointmentId: a.id, by })])
    }
  }
  return { consumed: true, unmet }
}
