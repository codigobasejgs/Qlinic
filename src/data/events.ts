// Barramento de eventos de domínio (síncrono, em memória). Desacopla módulos:
// ex.: agenda emite 'appointment.completed' → estoque consome ficha técnica; automações reagem a 'appointment.cancelled'.
// Futuro: eventos persistidos no servidor (outbox transacional) + fila durável.
import type { Appointment, ID, Proposal, Charge } from '@/domain/types'

export interface DomainEvents {
  'appointment.created': { tenantId: ID; appointment: Appointment; by: string }
  'appointment.status': { tenantId: ID; appointment: Appointment; from: Appointment['status']; by: string; reason?: string }
  'appointment.completed': { tenantId: ID; appointment: Appointment; by: string }
  'appointment.cancelled': { tenantId: ID; appointment: Appointment; by: string; reason?: string }
  'appointment.rescheduled': { tenantId: ID; appointment: Appointment; by: string }
  'proposal.accepted': { tenantId: ID; proposal: Proposal; charges: Charge[] }
  'payment.confirmed': { tenantId: ID; charge: Charge; amountCents: number }
  'record.finalized': { tenantId: ID; recordId: ID; patientId: ID }
  'document.released': { tenantId: ID; documentId: ID; patientId: ID }
  'stock.low': { tenantId: ID; productId: ID; name: string }
}
type Handler<K extends keyof DomainEvents> = (p: DomainEvents[K]) => void
const handlers = new Map<string, Set<(p: unknown) => void>>()

export function on<K extends keyof DomainEvents>(event: K, h: Handler<K>): () => void {
  let set = handlers.get(event)
  if (!set) handlers.set(event, (set = new Set()))
  const fn = h as (p: unknown) => void
  set.add(fn)
  return () => set!.delete(fn)
}
export function emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]) {
  for (const h of handlers.get(event) ?? []) {
    try { h(payload) } catch (e) { console.error(`[qlinic] handler de ${event} falhou`, e) }
  }
}
