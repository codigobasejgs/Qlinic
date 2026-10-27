// Contratos de repositório/serviço (o que os componentes conhecem) + implementações MOCK sobre o store local.
// Futuro: implementar os mesmos contratos com Supabase (src/data/supabase/*) sem alterar componentes.
import type {
  Appointment, AppointmentStatus, AuditEvent, Charge, ClinicDocument, ClinicalRecord, ID, NotificationEvent, Channel,
  Organization, OutboxMessage, Patient, Payment, PaymentMethod, ProviderKey, Proposal, StatusChange,
} from '@/domain/types'
import { canTransition } from '@/domain/scheduling'
import { db, platformDb } from './store'
import { nowISO } from '@/lib/dates'
import { uid } from '@/lib/util'
import type { Cents } from '@/lib/money'

// ---------------- Contratos ----------------
export interface TenantRepository {
  list(): Organization[]
  getBySlug(slug: string): Organization | undefined
  update(id: ID, patch: Partial<Organization>): void
  create(org: Organization): void
}
export interface PatientRepository {
  list(tenantId: ID): Patient[]
  get(tenantId: ID, id: ID): Patient | undefined
  create(tenantId: ID, p: Omit<Patient, 'id' | 'tenantId' | 'createdAt'>): Patient
  update(tenantId: ID, id: ID, patch: Partial<Patient>): Patient
  findDuplicates(tenantId: ID, candidate: Pick<Patient, 'name' | 'cpf' | 'phone' | 'birthDate'>): Patient[]
}
export interface AppointmentRepository {
  list(tenantId: ID): Appointment[]
  create(tenantId: ID, a: Omit<Appointment, 'id' | 'tenantId' | 'createdAt' | 'history'>, by: string): Appointment
  transition(tenantId: ID, id: ID, to: AppointmentStatus, by: string, reason?: string): Appointment
  reschedule(tenantId: ID, id: ID, patch: Pick<Appointment, 'start' | 'end'> & Partial<Pick<Appointment, 'professionalId' | 'resourceIds' | 'unitId'>>, by: string, reason: string): Appointment
}
export interface ClinicalRecordRepository {
  list(tenantId: ID, patientId?: ID): ClinicalRecord[]
  save(tenantId: ID, rec: ClinicalRecord): ClinicalRecord
  finalize(tenantId: ID, id: ID, by: string): ClinicalRecord
  addAddendum(tenantId: ID, id: ID, a: { authorId: ID; authorName: string; reason: string; text: string }): ClinicalRecord
}
export interface DocumentRepository {
  list(tenantId: ID, patientId?: ID): ClinicDocument[]
  save(tenantId: ID, doc: ClinicDocument): ClinicDocument
}
export interface BillingRepository {
  listCharges(tenantId: ID): Charge[]
  createCharges(tenantId: ID, charges: Charge[]): void
  registerPayment(tenantId: ID, chargeId: ID, p: { amountCents: Cents; method: PaymentMethod; provider: ProviderKey; receivedBy: ID; cashSessionId?: ID; pendingApproval?: boolean; providerPaymentId?: string }): Charge
  refund(tenantId: ID, chargeId: ID, paymentId: ID, amountCents: Cents, reason: string, kind: 'estorno' | 'reembolso' | 'chargeback'): Charge
}
/** Contrato de estoque: implementação em src/modules/commercial/inventory.ts (consumo disparado por src/modules/commercial/effects.ts). */
export interface InventoryRepository {
  consumeForAppointment(tenantId: ID, appointmentId: ID, by: string): { consumed: boolean; reason?: string }
}
export interface NotificationProvider {
  enqueue(tenantId: ID, m: { event: NotificationEvent; channel: Channel; recipientName: string; recipientRef: string; subject: string; preview: string; dedupeKey: string; link?: string }): OutboxMessage
}
export interface PaymentCapabilities { checkout: Cap; pix: Cap; boleto: Cap; cartao: Cap; recorrencia: Cap; parcelamento: Cap; estorno: Cap; split: Cap }
/** 'homologacao' = depende de homologação/elegibilidade da conta — NUNCA habilitar por suposição. */
export type Cap = 'sim' | 'nao' | 'homologacao'
export interface PaymentProvider {
  key: ProviderKey
  name: string
  capabilities: PaymentCapabilities
  /** Demo: simula. Futuro: chamada ao backend (nunca direto do navegador com segredo). */
  createCharge(input: { tenantId: ID; amountCents: Cents; description: string; idempotencyKey: string; method: PaymentMethod }): Promise<{ status: 'pendente' | 'erro' | 'timeout'; providerPaymentId?: string; checkoutUrl?: string; error?: string }>
}
export interface IdentityService {
  /** Demo: seletor de perfil. Futuro: Supabase Auth (sessão host-only). */
  currentUserLabel(): string
}

// ---------------- Mocks ----------------
export const tenantRepo: TenantRepository = {
  list: () => platformDb.list('organizations'),
  getBySlug: (slug) => platformDb.list('organizations').find((o) => o.slug === slug),
  update: (id, patch) => platformDb.update('organizations', id, patch),
  create: (org) => { platformDb.insert('organizations', org) },
}

const norm = (s?: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
export const patientRepo: PatientRepository = {
  list: (t) => db.list(t, 'patients'),
  get: (t, id) => db.get(t, 'patients', id),
  create: (t, p) => db.insert(t, 'patients', { ...p, id: uid('pat_'), tenantId: t, createdAt: nowISO() }) as Patient,
  update: (t, id, patch) => db.update(t, 'patients', id, patch) as Patient,
  findDuplicates: (t, c) => {
    const digits = (s?: string) => (s ?? '').replace(/\D/g, '')
    return db.list(t, 'patients').filter((p) =>
      (c.cpf && digits(p.cpf) && digits(p.cpf) === digits(c.cpf)) ||
      (c.phone && digits(p.phone) && digits(p.phone) === digits(c.phone) && norm(p.name).split(' ')[0] === norm(c.name).split(' ')[0]) ||
      (norm(p.name) === norm(c.name) && (!c.birthDate || p.birthDate === c.birthDate)))
  },
}

export const appointmentRepo: AppointmentRepository = {
  list: (t) => db.list(t, 'appointments'),
  create: (t, a, by) => {
    const at = nowISO()
    return db.insert(t, 'appointments', { ...a, id: uid('ap_'), tenantId: t, createdAt: at, history: [{ at, from: null, to: a.status, by }] }) as Appointment
  },
  transition: (t, id, to, by, reason) => db.update(t, 'appointments', id, (prev) => {
    if (!canTransition(prev.status, to)) throw new Error(`Transição inválida: ${prev.status} → ${to}`)
    const at = nowISO()
    const h: StatusChange<AppointmentStatus> = { at, from: prev.status, to, by, reason }
    return {
      ...prev, status: to, history: [...prev.history, h],
      arrivedAt: to === 'chegou' ? at : prev.arrivedAt, startedAt: to === 'em_atendimento' ? at : prev.startedAt, finishedAt: to === 'concluida' ? at : prev.finishedAt,
    }
  }) as Appointment,
  reschedule: (t, id, patch, by, reason) => db.update(t, 'appointments', id, (prev) => {
    if (['concluida', 'cancelada', 'faltou', 'em_atendimento'].includes(prev.status)) throw new Error('Este atendimento não pode ser reagendado.')
    return { ...prev, ...patch, history: [...prev.history, { at: nowISO(), from: prev.status, to: prev.status, by, reason: `Reagendado: ${reason}` }] }
  }) as Appointment,
}

export const clinicalRepo: ClinicalRecordRepository = {
  list: (t, pid) => db.list(t, 'records').filter((r) => !pid || r.patientId === pid),
  save: (t, rec) => {
    const existing = db.get(t, 'records', rec.id)
    if (existing?.status === 'finalizado') throw new Error('Registro finalizado não pode ser sobrescrito. Use um adendo.')
    if (existing) return db.update(t, 'records', rec.id, rec) as ClinicalRecord
    return db.insert(t, 'records', rec) as ClinicalRecord
  },
  finalize: (t, id, by) => db.update(t, 'records', id, (prev) => {
    if (prev.status === 'finalizado') return prev
    return { ...prev, status: 'finalizado', finalizedAt: nowISO(), history: [...prev.history, { at: nowISO(), from: prev.status, to: 'finalizado', by }] }
  }) as ClinicalRecord,
  addAddendum: (t, id, a) => db.update(t, 'records', id, (prev) => {
    if (prev.status !== 'finalizado') throw new Error('Adendo só se aplica a registro finalizado.')
    if (!a.reason.trim() || !a.text.trim()) throw new Error('Motivo e texto do adendo são obrigatórios.')
    return { ...prev, addenda: [...prev.addenda, { id: uid('add_'), at: nowISO(), ...a }] }
  }) as ClinicalRecord,
}

export const documentRepo: DocumentRepository = {
  list: (t, pid) => db.list(t, 'documents').filter((d) => !pid || d.patientId === pid),
  save: (t, doc) => (db.get(t, 'documents', doc.id) ? db.update(t, 'documents', doc.id, doc) : db.insert(t, 'documents', doc)) as ClinicDocument,
}

/** Valor líquido recebido: pagamentos liquidados (inclusive os depois estornados) menos reversões vinculadas. */
export function chargeNet(c: Charge): Cents {
  const confirmed = c.payments.filter((p) => p.status === 'confirmado' || p.status === 'estornado' || p.status === 'chargeback').reduce((a, p) => a + p.amountCents, 0)
  const refunded = c.refunds.reduce((a, r) => a + r.amountCents, 0)
  return confirmed - refunded
}
export function chargeBalance(c: Charge): Cents {
  return Math.max(0, c.amountCents + c.adjustmentsCents - chargeNet(c))
}

/** Disponibilidade do dinheiro (demonstrativa): crédito D+30, débito/boleto D+1, demais no dia. Prazos reais dependem do contrato com o provedor. */
const AVAILABILITY_DAYS: Partial<Record<PaymentMethod, number>> = { cartao_credito: 30, cartao_debito: 1, boleto: 1 }
function availableOn(method: PaymentMethod): string {
  const d = new Date(Date.now() + (AVAILABILITY_DAYS[method] ?? 0) * 86400000)
  return d.toISOString().slice(0, 10)
}

/** Status derivado (inclui 'vencida' por data). Use em telas em vez de recalcular localmente. */
export function effectiveChargeStatus(c: Charge, today = nowISO().slice(0, 10)): Charge['status'] {
  if (c.status === 'aberta' && c.dueDate < today) return 'vencida'
  if (c.status === 'vencida' && c.dueDate >= today) return 'aberta'
  return c.status
}

function recomputeStatus(c: Charge, today: string): Charge['status'] {
  if (c.status === 'cancelada') return 'cancelada'
  const total = c.amountCents + c.adjustmentsCents
  const net = chargeNet(c)
  const everPaid = c.payments.some((p) => p.status !== 'pendente_aprovacao' && p.status !== 'recusado')
  if (everPaid && net <= 0 && c.refunds.length) return 'estornada'
  if (net >= total) return 'paga'
  if (net > 0) return 'parcial'
  return c.dueDate < today ? 'vencida' : 'aberta'
}

export const billingRepo: BillingRepository = {
  listCharges: (t) => db.list(t, 'charges'),
  createCharges: (t, charges) => db.set(t, 'charges', [...db.list(t, 'charges'), ...charges]),
  registerPayment: (t, chargeId, p) => db.update(t, 'charges', chargeId, (prev) => {
    if (p.amountCents <= 0) throw new Error('Valor deve ser maior que zero.')
    if (prev.status === 'cancelada' || prev.status === 'estornada') throw new Error('Cobrança cancelada/estornada não recebe pagamento.')
    if (!p.pendingApproval && p.amountCents > chargeBalance(prev)) throw new Error('Valor maior que o saldo em aberto.')
    if (p.providerPaymentId && prev.payments.some((x) => x.providerPaymentId === p.providerPaymentId)) return prev // idempotência
    const pay: Payment = { id: uid('pay_'), at: nowISO(), amountCents: p.amountCents, method: p.method, provider: p.provider, providerPaymentId: p.providerPaymentId, status: p.pendingApproval ? 'pendente_aprovacao' : 'confirmado', simulated: true, receivedBy: p.receivedBy, cashSessionId: p.cashSessionId, availableOn: availableOn(p.method) }
    const next = { ...prev, payments: [...prev.payments, pay] }
    return { ...next, status: recomputeStatus(next, nowISO().slice(0, 10)) }
  }) as Charge,
  refund: (t, chargeId, paymentId, amountCents, reason, kind) => db.update(t, 'charges', chargeId, (prev) => {
    const pay = prev.payments.find((x) => x.id === paymentId)
    if (!pay || pay.status !== 'confirmado') throw new Error('Pagamento não elegível para estorno.')
    const already = prev.refunds.filter((r) => r.paymentId === paymentId).reduce((a, r) => a + r.amountCents, 0)
    if (amountCents <= 0 || amountCents + already > pay.amountCents) throw new Error('Valor de estorno excede o pagamento.')
    if (!reason.trim()) throw new Error('Informe o motivo.')
    const refunds = [...prev.refunds, { id: uid('rf_'), at: nowISO(), amountCents, reason, paymentId, kind }]
    const payments = prev.payments.map((x) => x.id === paymentId && amountCents + already === pay.amountCents ? { ...x, status: kind === 'chargeback' ? 'chargeback' as const : 'estornado' as const } : x)
    const next = { ...prev, refunds, payments }
    return { ...next, status: recomputeStatus(next, nowISO().slice(0, 10)) }
  }) as Charge,
}

export function approveManualPayment(t: ID, chargeId: ID, paymentId: ID, approve: boolean): Charge {
  return db.update(t, 'charges', chargeId, (prev) => {
    // Recusa mantém o registro (status 'recusado') para histórico; nunca apaga.
    const next = { ...prev, payments: prev.payments.map((p) => p.id === paymentId ? { ...p, status: approve ? 'confirmado' as const : 'recusado' as const } : p) }
    if (approve) {
      const pay = next.payments.find((p) => p.id === paymentId)!
      if (pay.amountCents > chargeBalance({ ...prev, payments: prev.payments.filter((p) => p.id !== paymentId) })) throw new Error('Comprovante maior que o saldo.')
    }
    return { ...next, status: recomputeStatus(next, nowISO().slice(0, 10)) }
  }) as Charge
}

export type EnqueueInput = Parameters<NotificationProvider['enqueue']>[1]
/** Regra extra de envio (horário silencioso, suppression list…) registrada pelo módulo de comunicação. null = segue. */
export type EnqueueGate = (t: ID, m: EnqueueInput) => { status: OutboxMessage['status']; result: string; scheduledFor?: string } | null
let enqueueGate: EnqueueGate | null = null
export function setNotificationGate(g: EnqueueGate | null) { enqueueGate = g }

/** Fila de comunicação com deduplicação por evento/destinatário/canal e respeito a preferências. */
export const notificationProvider: NotificationProvider = {
  enqueue: (t, m) => {
    const existing = db.list(t, 'outbox').find((x) => x.dedupeKey === m.dedupeKey)
    const person = db.get(t, 'persons', m.recipientRef)
    const optedOut = person && !person.communication[m.channel]
    const gated = !existing && !optedOut ? enqueueGate?.(t, m) ?? null : null
    const msg: OutboxMessage = {
      ...m, id: uid('ob_'), tenantId: t, createdAt: nowISO(), simulated: true, attempts: gated ? [{ at: nowISO(), result: gated.result }] : [],
      status: existing ? 'duplicado' : optedOut ? 'suprimido' : gated ? gated.status : 'pendente', scheduledFor: gated?.scheduledFor,
    }
    db.insert(t, 'outbox', msg)
    if (msg.status === 'pendente') simulateDelivery(t, msg.id)
    return msg
  },
}

/** Simula aceite pelo provedor. NÃO marca como entregue/lido sem evidência. */
function simulateDelivery(t: ID, id: ID) {
  setTimeout(() => {
    try {
      db.update(t, 'outbox', id, (prev) => ({ ...prev, status: 'aceito_provedor', attempts: [...prev.attempts, { at: nowISO(), result: 'Aceito pelo provedor (simulado) — entrega não confirmada' }] }))
    } catch { /* coleção trocada */ }
  }, 900)
}

export function audit(t: ID, e: Omit<AuditEvent, 'id' | 'tenantId' | 'createdAt'>) {
  db.insert(t, 'audit', { ...e, id: uid('au_'), tenantId: t, createdAt: nowISO() })
}

export function saveProposal(t: ID, p: Proposal) {
  return (db.get(t, 'proposals', p.id) ? db.update(t, 'proposals', p.id, p) : db.insert(t, 'proposals', p)) as Proposal
}
