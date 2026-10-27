// Casos de uso de agenda com efeitos colaterais (eventos + notificações). Componentes usam ESTES, não o repo direto,
// para que estoque, automações e comunicação reajam de forma consistente.
import type { Appointment, AppointmentStatus, ID } from './types'
import { APPOINTMENT_STATUS_LABEL } from './types'
import { appointmentRepo, audit, notificationProvider } from '@/data/repositories'
import { db } from '@/data/store'
import { emit } from '@/data/events'
import { findConflicts, type Conflict } from './scheduling'
import { addMinutes, formatDateTime, nowISO, zonedParts } from '@/lib/dates'
import { uid } from '@/lib/util'

function notifyPatient(tenantId: ID, a: Appointment, event: 'confirmacao' | 'cancelamento' | 'reagendamento' | 'consulta_solicitada' | 'checkin', subject: string) {
  const p = db.get(tenantId, 'patients', a.patientId)
  if (!p) return
  const link = db.list(tenantId, 'links').find((l) => l.patientId === p.id && l.canSchedule)
  const ref = p.personId ?? link?.personId
  if (!ref) return
  const unit = db.get(tenantId, 'units', a.unitId)
  for (const channel of ['whatsapp', 'email'] as const) {
    notificationProvider.enqueue(tenantId, {
      event, channel, recipientName: p.name, recipientRef: ref, subject,
      // Sem nome de procedimento/diagnóstico no texto: apenas data e link para o portal.
      preview: `${subject}: ${formatDateTime(a.start, unit?.timezone)}. Detalhes no portal.`,
      dedupeKey: `${event}:${a.id}:${a.start}:${channel}`,
    })
  }
}

export interface CreateAppointmentInput {
  unitId: ID; patientId: ID; professionalId: ID; serviceId: ID; resourceIds: ID[]; start: string; end: string
  status?: AppointmentStatus; source: Appointment['source']; notes?: string; seriesId?: ID
  /** Gestor autorizou encaixe mesmo com conflito. */
  acknowledgeConflicts?: boolean
}

export function validateAppointment(tenantId: ID, input: CreateAppointmentInput, ignoreId?: ID): Conflict[] {
  const unit = db.get(tenantId, 'units', input.unitId)
  const professional = db.get(tenantId, 'professionals', input.professionalId)
  const service = db.get(tenantId, 'services', input.serviceId)
  if (!unit || !professional || !service) return [{ kind: 'duracao', message: 'Unidade, profissional ou serviço inválido.' }]
  return findConflicts({ unit, professional, service, resourceIds: input.resourceIds, patientId: input.patientId, start: input.start, end: input.end, ignoreId, now: new Date() }, db.list(tenantId, 'appointments'), db.list(tenantId, 'resources'))
}

export function createAppointment(tenantId: ID, input: CreateAppointmentInput, by: string): Appointment {
  const conflicts = validateAppointment(tenantId, input)
  if (conflicts.length && !input.acknowledgeConflicts) throw new Error(conflicts.map((c) => c.message).join(' '))
  const a = appointmentRepo.create(tenantId, {
    unitId: input.unitId, patientId: input.patientId, professionalId: input.professionalId, serviceId: input.serviceId, resourceIds: input.resourceIds,
    start: input.start, end: input.end, status: input.status ?? 'aguardando_confirmacao', source: input.source, notes: input.notes, seriesId: input.seriesId,
    financialStatus: 'nao_cobrado', conflictAcknowledged: conflicts.length > 0 || undefined,
  }, by)
  audit(tenantId, { actorId: by, actorName: by, action: 'agendamento.criado', resource: 'appointments', resourceId: a.id, unitId: a.unitId, detail: conflicts.length ? `Encaixe com conflito reconhecido: ${conflicts.map((c) => c.kind).join(', ')}` : undefined })
  emit('appointment.created', { tenantId, appointment: a, by })
  notifyPatient(tenantId, a, a.status === 'confirmada' ? 'confirmacao' : 'consulta_solicitada', a.status === 'confirmada' ? 'Consulta confirmada' : 'Solicitação de consulta recebida')
  return a
}

export function changeAppointmentStatus(tenantId: ID, id: ID, to: AppointmentStatus, by: string, reason?: string): Appointment {
  const prev = db.get(tenantId, 'appointments', id)
  if (!prev) throw new Error('Agendamento não encontrado.')
  if ((to === 'cancelada' || to === 'faltou') && !reason?.trim() && to === 'cancelada') throw new Error('Informe o motivo do cancelamento.')
  const a = appointmentRepo.transition(tenantId, id, to, by, reason)
  audit(tenantId, { actorId: by, actorName: by, action: `agendamento.${to}`, resource: 'appointments', resourceId: id, unitId: a.unitId, detail: `${APPOINTMENT_STATUS_LABEL[prev.status]} → ${APPOINTMENT_STATUS_LABEL[to]}${reason ? ` (${reason})` : ''}` })
  emit('appointment.status', { tenantId, appointment: a, from: prev.status, by, reason })
  if (to === 'concluida') emit('appointment.completed', { tenantId, appointment: a, by })
  if (to === 'cancelada') { emit('appointment.cancelled', { tenantId, appointment: a, by, reason }); notifyPatient(tenantId, a, 'cancelamento', 'Consulta cancelada') }
  if (to === 'confirmada' && prev.status !== 'chegou') notifyPatient(tenantId, a, 'confirmacao', 'Consulta confirmada')
  return a
}

export function rescheduleAppointment(tenantId: ID, id: ID, patch: { start: string; end: string; professionalId?: ID; resourceIds?: ID[]; unitId?: ID }, by: string, reason: string, acknowledgeConflicts = false): Appointment {
  const prev = db.get(tenantId, 'appointments', id)
  if (!prev) throw new Error('Agendamento não encontrado.')
  if (!reason.trim()) throw new Error('Informe o motivo do reagendamento.')
  const input: CreateAppointmentInput = { unitId: patch.unitId ?? prev.unitId, patientId: prev.patientId, professionalId: patch.professionalId ?? prev.professionalId, serviceId: prev.serviceId, resourceIds: patch.resourceIds ?? prev.resourceIds, start: patch.start, end: patch.end, source: prev.source }
  const conflicts = validateAppointment(tenantId, input, id)
  if (conflicts.length && !acknowledgeConflicts) throw new Error(conflicts.map((c) => c.message).join(' '))
  const a = appointmentRepo.reschedule(tenantId, id, { start: patch.start, end: patch.end, professionalId: input.professionalId, resourceIds: input.resourceIds, unitId: input.unitId }, by, reason)
  audit(tenantId, { actorId: by, actorName: by, action: 'agendamento.reagendado', resource: 'appointments', resourceId: id, unitId: a.unitId, detail: reason })
  emit('appointment.rescheduled', { tenantId, appointment: a, by })
  notifyPatient(tenantId, a, 'reagendamento', 'Consulta reagendada')
  return a
}

/** Token de check-in de curta duração (10 min). QR contém apenas o token opaco — nunca dados clínicos. */
export function issueCheckInToken(tenantId: ID, id: ID): Appointment {
  return db.update(tenantId, 'appointments', id, (prev) => ({ ...prev, checkIn: { token: uid('ck').slice(0, 10).toUpperCase(), expiresAt: addMinutes(nowISO(), 10) } })) as Appointment
}

/** Check-in por token (totem). Retorna senha de chamada. Token expirado/usado é recusado. */
export function checkInWithToken(tenantId: ID, token: string, by = 'Totem'): { appointment: Appointment; ticket: string } {
  const list = db.list(tenantId, 'appointments')
  const a = list.find((x) => x.checkIn?.token === token.trim().toUpperCase())
  if (!a || !a.checkIn) throw new Error('Código não encontrado. Procure a recepção.')
  if (a.checkIn.usedAt) throw new Error('Este código já foi utilizado.')
  if (new Date(a.checkIn.expiresAt).getTime() < Date.now()) throw new Error('Código expirado. Gere um novo código ou procure a recepção.')
  if (a.status !== 'confirmada' && a.status !== 'aguardando_confirmacao') throw new Error('Este atendimento não está disponível para check-in. Procure a recepção.')
  const tz = db.get(tenantId, 'units', a.unitId)?.timezone
  const day = zonedParts(a.start, tz).date
  const numbers = list.filter((x) => x.unitId === a.unitId && x.checkIn?.ticket && zonedParts(x.start, tz).date === day)
    .map((x) => /^A(\d+)$/.exec(x.checkIn!.ticket!)?.[1]).map((n) => Number(n) || 0)
  const ticket = `A${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`
  if (a.status === 'aguardando_confirmacao') appointmentRepo.transition(tenantId, a.id, 'confirmada', by, 'Confirmado no check-in')
  changeAppointmentStatus(tenantId, a.id, 'chegou', by)
  const updated = db.update(tenantId, 'appointments', a.id, (p) => ({ ...p, checkIn: { ...p.checkIn!, usedAt: nowISO(), ticket } })) as Appointment
  notifyPatient(tenantId, updated, 'checkin', 'Chegada registrada')
  return { appointment: updated, ticket }
}

export function callPatient(tenantId: ID, id: ID): Appointment {
  return db.update(tenantId, 'appointments', id, { calledAt: nowISO() }) as Appointment
}
