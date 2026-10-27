// Compras: solicitação → aprovação → pedido → recebimento parcial (entrada por lote) → conta a pagar.
// Equipamentos: manutenção bloqueia o recurso vinculado na agenda (Resource.blocks).
import type { ID } from '@/domain/types'
import { db } from '@/data/store'
import { audit } from '@/data/repositories'
import { nowISO, todayCivil, addDaysCivil } from '@/lib/dates'
import { uid } from '@/lib/util'
import { receiveStock, toBase } from './inventory'
import { createPayables } from './finance'
import type { Equipment, Maintenance, PurchaseOrder, PurchaseStatus } from './types'

const NEXT: Record<PurchaseStatus, PurchaseStatus[]> = {
  solicitada: ['aprovada', 'recusada', 'cancelada'], aprovada: ['pedido', 'cancelada'], recusada: [], pedido: ['parcial', 'recebida', 'cancelada'],
  parcial: ['parcial', 'recebida'], recebida: [], cancelada: [],
}

export function poTotal(po: Pick<PurchaseOrder, 'items'>) { return po.items.reduce((a, i) => a + Math.round(i.qty * i.unitCostCents), 0) }

export function transitionPO(tenantId: ID, id: ID, to: PurchaseStatus, by: string, reason?: string) {
  return db.update(tenantId, 'purchaseOrders', id, (po) => {
    if (!NEXT[po.status].includes(to)) throw new Error(`Transição inválida: ${po.status} → ${to}`)
    if (to === 'recusada' && !reason?.trim()) throw new Error('Informe o motivo da recusa.')
    return { ...po, status: to, history: [...po.history, { at: nowISO(), from: po.status, to, by, reason }] }
  }) as PurchaseOrder
}

/**
 * Recebimento (parcial ou total). Cada linha recebida gera entrada em estoque por lote (com conversão da unidade de compra)
 * e uma conta a pagar proporcional ao recebido (não paga o que não chegou).
 */
export function receivePO(tenantId: ID, id: ID, lines: { lineId: ID; qty: number; lotCode: string; expiresOn?: string }[], by: string, invoice: string) {
  const po = db.get(tenantId, 'purchaseOrders', id)
  if (!po) throw new Error('Pedido não encontrado.')
  if (po.status !== 'pedido' && po.status !== 'parcial') throw new Error('Somente pedidos emitidos podem ser recebidos.')
  const valid = lines.filter((l) => l.qty > 0)
  if (!valid.length) throw new Error('Informe ao menos uma quantidade recebida.')
  let total = 0
  for (const l of valid) {
    const line = po.items.find((i) => i.id === l.lineId)
    if (!line) throw new Error('Linha inválida.')
    if (l.qty > line.qty - line.receivedQty + 1e-9) throw new Error(`Recebido acima do pedido em ${db.get(tenantId, 'products', line.productId)?.name ?? 'item'}.`)
    const p = db.get(tenantId, 'products', line.productId)
    if (!p) throw new Error('Produto não encontrado.')
    toBase(p, l.qty, line.unit) // valida conversão antes de gravar
    if (!l.lotCode.trim()) throw new Error('Informe o lote de cada item recebido.')
  }
  for (const l of valid) {
    const line = po.items.find((i) => i.id === l.lineId)!
    receiveStock(tenantId, { productId: line.productId, unitId: po.unitId, qty: l.qty, unit: line.unit, lotCode: l.lotCode, expiresOn: l.expiresOn, reason: `Recebimento ${po.number} (NF ${invoice || 's/n'})`, refId: po.id, by })
    total += Math.round(l.qty * line.unitCostCents)
  }
  const items = po.items.map((i) => { const r = valid.find((l) => l.lineId === i.id); return r ? { ...i, receivedQty: i.receivedQty + r.qty } : i })
  const full = items.every((i) => i.receivedQty >= i.qty - 1e-9)
  const pays = createPayables(tenantId, { unitId: po.unitId, supplierId: po.supplierId, description: `${po.number} — recebimento NF ${invoice || 's/n'}`, category: 'Insumos', costCenter: db.get(tenantId, 'units', po.unitId)?.name, competenceDate: todayCivil(), firstDue: addDaysCivil(todayCivil(), 28), totalCents: total, installments: 1, origin: { kind: 'compra', refId: po.id } })
  const to: PurchaseStatus = full ? 'recebida' : 'parcial'
  const upd = db.update(tenantId, 'purchaseOrders', id, { items, status: to, payableIds: [...po.payableIds, ...pays.map((p) => p.id)], history: [...po.history, { at: nowISO(), from: po.status, to, by, reason: `NF ${invoice || 's/n'}: ${valid.length} item(ns)` }] }) as PurchaseOrder
  audit(tenantId, { actorId: by, actorName: by, action: 'compra.recebimento', resource: 'purchaseOrders', resourceId: id, detail: `${to}; conta a pagar ${(total / 100).toFixed(2)}` })
  return upd
}

/** Manutenção: registra no equipamento E bloqueia o recurso vinculado (agenda passa a recusar o horário). */
export function scheduleMaintenance(tenantId: ID, equipmentId: ID, m: Omit<Maintenance, 'id' | 'status'>) {
  if (!m.reason.trim()) throw new Error('Informe o motivo da manutenção.')
  if (!(m.start < m.end)) throw new Error('Fim deve ser depois do início.')
  const eq = db.get(tenantId, 'equipment', equipmentId)
  if (!eq) throw new Error('Equipamento não encontrado.')
  const mt: Maintenance = { ...m, id: uid('mt_'), status: 'agendada' }
  db.update(tenantId, 'equipment', equipmentId, { maintenances: [...eq.maintenances, mt] })
  if (eq.resourceId && db.get(tenantId, 'resources', eq.resourceId)) {
    db.update(tenantId, 'resources', eq.resourceId, (r) => ({ ...r, blocks: [...r.blocks, { start: m.start, end: m.end, reason: `Manutenção ${m.kind}: ${m.reason}` }] }))
  }
  return mt
}

export function completeMaintenance(tenantId: ID, equipmentId: ID, mtId: ID) {
  return db.update(tenantId, 'equipment', equipmentId, (e) => ({ ...e, maintenances: e.maintenances.map((x) => x.id === mtId ? { ...x, status: 'concluida' as const } : x) })) as Equipment
}
