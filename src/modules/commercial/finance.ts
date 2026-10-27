// Regras financeiras do módulo (Contexto B: paciente → clínica). Dinheiro em centavos inteiros.
// Nunca apagar movimento liquidado: estornos/reversões são registros vinculados.
import type { Charge, ID, PaymentMethod } from '@/domain/types'
import type { ClinicPolicies } from '@/domain/settings'
import { getPolicies } from '@/domain/settings'
import { db } from '@/data/store'
import { audit, chargeBalance, chargeNet } from '@/data/repositories'
import { percentOf, splitInstallments, type Cents } from '@/lib/money'
import { addDaysCivil, nowISO, todayCivil, type CivilDate } from '@/lib/dates'
import { uid } from '@/lib/util'
import type { Agreement, ChargeAdjustment, Payable } from './types'

export function daysBetween(a: CivilDate, b: CivilDate): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000)
}

/**
 * Encargos por atraso (memória de cálculo). Puro.
 * - Multa: lateFeePercent sobre o saldo principal, UMA vez.
 * - Juros: monthlyInterestPercent/30 ao dia (simples) sobre o saldo, apenas pelos dias ainda não cobrados.
 * - Desconto de antecipação: earlyDiscountPercent sobre o saldo se pago até o vencimento (aplicado no ato).
 */
export function computeLateCharges(c: Pick<Charge, 'amountCents' | 'adjustmentsCents' | 'dueDate' | 'payments' | 'refunds' | 'status'>, pol: ClinicPolicies['payments'], today: CivilDate, prior: Pick<ChargeAdjustment, 'interestDaysCharged' | 'feeApplied'>[]) {
  const lines: { label: string; cents: Cents }[] = []
  const principal = Math.max(0, c.amountCents - chargeNet(c as Charge))
  const late = daysBetween(c.dueDate, today)
  const feeApplied = prior.some((p) => p.feeApplied)
  const daysCharged = prior.reduce((a, p) => a + p.interestDaysCharged, 0)
  let fee = false
  let newDays = 0
  if (late > 0 && principal > 0) {
    if (!feeApplied && pol.lateFeePercent > 0) {
      const v = percentOf(principal, pol.lateFeePercent)
      lines.push({ label: `Multa ${pol.lateFeePercent}% × ${(principal / 100).toFixed(2)}`, cents: v })
      fee = true
    }
    newDays = Math.max(0, late - daysCharged)
    if (newDays > 0 && pol.monthlyInterestPercent > 0) {
      const v = Math.round((principal * pol.monthlyInterestPercent * newDays) / 3000)
      lines.push({ label: `Juros ${pol.monthlyInterestPercent}% a.m. pró-rata × ${newDays} dia(s) (dias ${daysCharged + 1}–${late})`, cents: v })
    }
  }
  return { lines, totalCents: lines.reduce((a, l) => a + l.cents, 0), interestDaysCharged: newDays, feeApplied: fee, lateDays: Math.max(0, late), principal }
}

export function applyLateCharges(tenantId: ID, chargeId: ID, by: string) {
  const c = db.get(tenantId, 'charges', chargeId)
  if (!c) throw new Error('Cobrança não encontrada.')
  if (['paga', 'cancelada', 'estornada'].includes(c.status)) throw new Error('Cobrança sem saldo para encargos.')
  const prior = db.list(tenantId, 'chargeAdjustments').filter((a) => a.chargeId === chargeId)
  const r = computeLateCharges(c, getPolicies(tenantId, c.unitId).payments, todayCivil(), prior)
  if (r.totalCents <= 0) throw new Error(r.lateDays <= 0 ? 'Cobrança não está vencida.' : 'Encargos já aplicados até hoje.')
  const adj: ChargeAdjustment = { id: uid('adj_'), tenantId, createdAt: nowISO(), chargeId, by, lines: r.lines, totalCents: r.totalCents, interestDaysCharged: r.interestDaysCharged, feeApplied: r.feeApplied }
  db.insert(tenantId, 'chargeAdjustments', adj)
  db.update(tenantId, 'charges', chargeId, { adjustmentsCents: c.adjustmentsCents + r.totalCents })
  audit(tenantId, { actorId: by, actorName: by, action: 'cobranca.encargos', resource: 'charges', resourceId: chargeId, detail: r.lines.map((l) => l.label).join('; ') })
  return adj
}

export function applyEarlyDiscount(tenantId: ID, chargeId: ID, by: string) {
  const c = db.get(tenantId, 'charges', chargeId)
  if (!c) throw new Error('Cobrança não encontrada.')
  const pol = getPolicies(tenantId, c.unitId).payments
  if (pol.earlyDiscountPercent <= 0) throw new Error('Política sem desconto de antecipação configurado (Configurações → Pagamentos).')
  if (todayCivil() > c.dueDate) throw new Error('Desconto de antecipação só até o vencimento.')
  if (db.list(tenantId, 'chargeAdjustments').some((a) => a.chargeId === chargeId && a.totalCents < 0)) throw new Error('Desconto já aplicado.')
  const bal = chargeBalance(c)
  const v = -percentOf(bal, pol.earlyDiscountPercent)
  if (v === 0) throw new Error('Sem saldo para desconto.')
  const adj: ChargeAdjustment = { id: uid('adj_'), tenantId, createdAt: nowISO(), chargeId, by, lines: [{ label: `Desconto antecipação ${pol.earlyDiscountPercent}% × ${(bal / 100).toFixed(2)}`, cents: v }], totalCents: v, interestDaysCharged: 0, feeApplied: false }
  db.insert(tenantId, 'chargeAdjustments', adj)
  db.update(tenantId, 'charges', chargeId, { adjustmentsCents: c.adjustmentsCents + v })
  return adj
}

/** Acordo: cancela saldo das cobranças originais (com vínculo) e gera parcelas origin 'acordo'. Pagamentos antigos permanecem. */
export function createAgreement(tenantId: ID, a: { chargeIds: ID[]; installments: number; firstDue: CivilDate; reason: string; by: string }) {
  if (!a.reason.trim()) throw new Error('Informe o motivo do acordo.')
  if (!a.chargeIds.length) throw new Error('Selecione ao menos uma cobrança.')
  const charges = a.chargeIds.map((id) => db.get(tenantId, 'charges', id)).filter((c): c is Charge => !!c)
  const patient = charges[0]?.patientId
  if (charges.some((c) => c.patientId !== patient)) throw new Error('Acordo deve envolver cobranças do mesmo paciente.')
  if (charges.some((c) => ['paga', 'cancelada', 'estornada'].includes(c.status))) throw new Error('Inclua apenas cobranças com saldo em aberto.')
  if (charges.some((c) => c.payments.some((p) => p.status === 'pendente_aprovacao'))) throw new Error('Há comprovante Pix pendente de aprovação numa das cobranças. Decida antes do acordo.')
  const total = charges.reduce((s, c) => s + chargeBalance(c), 0)
  if (total <= 0) throw new Error('Sem saldo para renegociar.')
  const agId = uid('ag_')
  const groupId = uid('grp_')
  const today = todayCivil()
  const first = charges[0]
  const parts = splitInstallments(total, a.installments)
  const news: Charge[] = parts.map((amt, k) => ({
    id: uid('ch_'), tenantId, createdAt: nowISO(), unitId: first.unitId, patientId: first.patientId, payerPersonId: first.payerPersonId,
    origin: { kind: 'acordo', refId: agId }, description: `Acordo ${agId.slice(-5).toUpperCase()} — parcela ${k + 1}/${a.installments}`,
    competenceDate: today, dueDate: addDaysCivil(a.firstDue, k * 30), amountCents: amt, adjustmentsCents: 0,
    installment: { n: k + 1, of: a.installments, groupId }, status: 'aberta', payments: [], refunds: [], professionalId: first.professionalId, serviceId: first.serviceId, category: first.category, costCenter: first.costCenter,
  }))
  db.set(tenantId, 'charges', [...db.list(tenantId, 'charges').map((c) => a.chargeIds.includes(c.id) ? { ...c, status: 'cancelada' as const, description: `${c.description} [renegociada no acordo ${agId.slice(-5).toUpperCase()}]`, updatedAt: nowISO() } : c), ...news])
  const ag: Agreement = { id: agId, tenantId, createdAt: nowISO(), patientId: first.patientId, originalChargeIds: a.chargeIds, newChargeIds: news.map((c) => c.id), totalCents: total, installments: a.installments, reason: a.reason, by: a.by }
  db.insert(tenantId, 'agreements', ag)
  audit(tenantId, { actorId: a.by, actorName: a.by, action: 'cobranca.acordo', resource: 'charges', resourceId: agId, detail: `${a.chargeIds.length} cobrança(s) → ${a.installments} parcela(s); ${a.reason}` })
  return ag
}

// ---------- Contas a pagar ----------
export function payablePaid(p: Payable): Cents { return p.payments.reduce((a, x) => a + x.amountCents, 0) }
export function payableBalance(p: Payable): Cents { return Math.max(0, p.amountCents - payablePaid(p)) }

export function createPayables(tenantId: ID, a: { unitId: ID; supplierId?: ID; description: string; category: string; costCenter?: string; competenceDate: CivilDate; firstDue: CivilDate; totalCents: Cents; installments: number; origin?: Payable['origin'] }): Payable[] {
  if (!a.description.trim()) throw new Error('Informe a descrição.')
  if (!Number.isInteger(a.totalCents) || a.totalCents <= 0) throw new Error('Valor deve ser maior que zero.')
  const groupId = uid('pg_')
  const list = splitInstallments(a.totalCents, a.installments).map((amt, k): Payable => ({
    id: uid('pay_'), tenantId, createdAt: nowISO(), unitId: a.unitId, supplierId: a.supplierId, description: a.installments > 1 ? `${a.description} — ${k + 1}/${a.installments}` : a.description,
    category: a.category, costCenter: a.costCenter, competenceDate: a.competenceDate, dueDate: addDaysCivil(a.firstDue, k * 30), amountCents: amt,
    installment: { n: k + 1, of: a.installments, groupId }, status: 'aberta', payments: [], origin: a.origin ?? { kind: 'manual' },
  }))
  db.set(tenantId, 'payables', [...db.list(tenantId, 'payables'), ...list])
  return list
}

export function payPayable(tenantId: ID, id: ID, amountCents: Cents, method: PaymentMethod, by: string) {
  return db.update(tenantId, 'payables', id, (p) => {
    if (p.status === 'cancelada') throw new Error('Conta cancelada.')
    if (amountCents <= 0 || amountCents > payableBalance(p)) throw new Error('Valor inválido (maior que o saldo ou zero).')
    const payments = [...p.payments, { id: uid('pp_'), at: nowISO(), amountCents, method, by }]
    const next = { ...p, payments }
    return { ...next, status: payableBalance(next) === 0 ? 'paga' : 'aberta' }
  }) as Payable
}

/** Estorno de pagamento de conta a pagar: lançamento negativo vinculado (o original permanece). */
export function reversePayablePayment(tenantId: ID, id: ID, paymentId: ID, reason: string, by: string) {
  if (!reason.trim()) throw new Error('Informe o motivo do estorno.')
  return db.update(tenantId, 'payables', id, (p) => {
    const orig = p.payments.find((x) => x.id === paymentId && x.amountCents > 0)
    if (!orig) throw new Error('Pagamento não encontrado.')
    if (p.payments.some((x) => x.reversalOf === paymentId)) throw new Error('Pagamento já estornado.')
    const payments = [...p.payments, { id: uid('pp_'), at: nowISO(), amountCents: -orig.amountCents, method: orig.method, by, reversalOf: paymentId, reason }]
    return { ...p, payments, status: 'aberta' }
  }) as Payable
}

// ---------- Fluxo de caixa ----------
export interface FlowBucket { key: string; competence: Cents; received: Cents; available: Cents }
/** Agrega por mês: competência (valor da cobrança), caixa (recebido líquido no mês do recebimento) e disponibilidade (availableOn). */
export function cashFlow(charges: Charge[], months: string[]): FlowBucket[] {
  const map = new Map(months.map((m) => [m, { key: m, competence: 0, received: 0, available: 0 }]))
  for (const c of charges) {
    if (c.status !== 'cancelada') { const b = map.get(c.competenceDate.slice(0, 7)); if (b) b.competence += c.amountCents }
    for (const p of c.payments) {
      if (p.status === 'pendente_aprovacao') continue
      const r = map.get(p.at.slice(0, 7)); if (r) r.received += p.amountCents
      const a = map.get((p.availableOn ?? p.at.slice(0, 10)).slice(0, 7)); if (a) a.available += p.amountCents
    }
    for (const rf of c.refunds) {
      const r = map.get(rf.at.slice(0, 7)); if (r) { r.received -= rf.amountCents; r.available -= rf.amountCents }
    }
  }
  return months.map((m) => map.get(m)!)
}
