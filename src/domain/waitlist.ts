// Lista de espera: oferta temporária de vaga liberada. Disputa simulada: primeira confirmação válida vence;
// reserva definitiva futura exige transação no servidor (SELECT ... FOR UPDATE / constraint de sobreposição).
import type { Appointment, ID, WaitlistEntry } from './types'
import { db } from '@/data/store'
import { createAppointment } from './appointments'
import { notificationProvider, audit } from '@/data/repositories'
import { zonedParts, addMinutes, nowISO, formatDateTime } from '@/lib/dates'

export const OFFER_TTL_MIN = 30

/** Entradas compatíveis com a vaga: mesmo serviço/duração cabível, disponibilidade declarada e profissional (se exigido). */
export function matchWaitlist(tenantId: ID, slot: { start: string; end: string; professionalId: ID; unitId: ID; serviceId?: ID }): WaitlistEntry[] {
  const unit = db.get(tenantId, 'units', slot.unitId)
  const tz = unit?.timezone
  const ps = zonedParts(slot.start, tz)
  const dur = (new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60000
  return db.list(tenantId, 'waitlist')
    .filter((w) => w.status === 'aguardando' && w.unitId === slot.unitId && w.durationMin <= dur)
    .filter((w) => !w.professionalId || w.professionalId === slot.professionalId)
    .filter((w) => !slot.serviceId || w.serviceId === slot.serviceId || w.durationMin <= dur)
    .filter((w) => w.availability.some((a) => a.weekday === ps.weekday && ps.minutesOfDay >= a.start && ps.minutesOfDay + w.durationMin <= a.end))
    .sort((a, b) => (a.priority === b.priority ? a.createdAt.localeCompare(b.createdAt) : a.priority === 'alta' ? -1 : 1))
}

export function offerSlot(tenantId: ID, entryIds: ID[], slot: { start: string; end: string; professionalId: ID; resourceIds: ID[] }, by: string) {
  const expiresAt = addMinutes(nowISO(), OFFER_TTL_MIN)
  for (const id of entryIds) {
    const w = db.update(tenantId, 'waitlist', id, { status: 'ofertado', offer: { appointmentSlot: slot, expiresAt, offeredAt: nowISO() } }) as WaitlistEntry
    const p = db.get(tenantId, 'patients', w.patientId)
    const ref = p?.personId ?? db.list(tenantId, 'links').find((l) => l.patientId === w.patientId)?.personId
    if (p && ref) notificationProvider.enqueue(tenantId, { event: 'vaga_ofertada', channel: 'whatsapp', recipientName: p.name, recipientRef: ref, subject: 'Vaga disponível', preview: `Vaga em ${formatDateTime(slot.start)} — responda em até ${OFFER_TTL_MIN} min. Não é reserva até a confirmação.`, dedupeKey: `vaga:${w.id}:${slot.start}` })
  }
  audit(tenantId, { actorId: by, actorName: by, action: 'lista_espera.oferta', resource: 'waitlist', detail: `${entryIds.length} pessoa(s) — expira em ${OFFER_TTL_MIN} min` })
}

/** Aceite da oferta. Se outra pessoa já ocupou a vaga, recusa com mensagem clara (sem dupla reserva). */
export function acceptOffer(tenantId: ID, entryId: ID, by: string): Appointment {
  const w = db.get(tenantId, 'waitlist', entryId)
  if (!w || w.status !== 'ofertado' || !w.offer) throw new Error('Não há oferta ativa para esta pessoa.')
  if (new Date(w.offer.expiresAt).getTime() < Date.now()) {
    db.update(tenantId, 'waitlist', entryId, { status: 'expirado' })
    throw new Error('A oferta expirou.')
  }
  const s = w.offer.appointmentSlot
  try {
    const a = createAppointment(tenantId, { unitId: w.unitId, patientId: w.patientId, professionalId: s.professionalId, serviceId: w.serviceId, resourceIds: s.resourceIds, start: s.start, end: addMinutes(s.start, w.durationMin), status: 'confirmada', source: 'lista_espera' }, by)
    db.update(tenantId, 'waitlist', entryId, { status: 'aceito' })
    // Demais ofertas do mesmo horário voltam para a fila
    for (const o of db.list(tenantId, 'waitlist').filter((x) => x.id !== entryId && x.status === 'ofertado' && x.offer?.appointmentSlot.start === s.start && x.offer.appointmentSlot.professionalId === s.professionalId)) {
      db.update(tenantId, 'waitlist', o.id, { status: 'aguardando', offer: undefined })
    }
    return a
  } catch (e) {
    db.update(tenantId, 'waitlist', entryId, { status: 'aguardando', offer: undefined })
    throw new Error(`A vaga já foi ocupada por outra pessoa. Você continua na lista de espera. (${e instanceof Error ? e.message : ''})`, { cause: e })
  }
}

export function expireOffers(tenantId: ID) {
  const now = Date.now()
  for (const w of db.list(tenantId, 'waitlist')) if (w.status === 'ofertado' && w.offer && new Date(w.offer.expiresAt).getTime() < now) db.update(tenantId, 'waitlist', w.id, { status: 'aguardando', offer: undefined })
}
