// Efeitos do módulo de agenda: cancelamento futuro → vaga liberada (coleção freedSlots), usada pela Lista de espera.
// Oferta automática NÃO é feita aqui (é do módulo engagement/automações).
import type { Appointment, Entity, ID, WaitlistEntry } from '@/domain/types'
import { db, registerSeed } from '@/data/store'
import { on } from '@/data/events'
import { availableSlots } from '@/domain/scheduling'
import { addDaysCivil, civilWeekday, demoBaseDate, nowISO, zonedParts, type ISOInstant } from '@/lib/dates'
import { uid } from '@/lib/util'

export interface FreedSlot extends Entity {
  appointmentId?: ID
  unitId: ID
  professionalId: ID
  serviceId: ID
  resourceIds: ID[]
  start: ISOInstant
  end: ISOInstant
  reason?: string
  status: 'livre' | 'ofertado' | 'preenchido' | 'descartado'
  filledAppointmentId?: ID
}

declare module '@/data/store' {
  interface TenantCollections { freedSlots: FreedSlot[] }
}

export function freedSlotFrom(tenantId: ID, a: Appointment, reason?: string): FreedSlot {
  return { id: uid('fs_'), tenantId, createdAt: nowISO(), appointmentId: a.id, unitId: a.unitId, professionalId: a.professionalId, serviceId: a.serviceId, resourceIds: a.resourceIds, start: a.start, end: a.end, reason, status: 'livre' }
}

on('appointment.cancelled', ({ tenantId, appointment, reason }) => {
  if (new Date(appointment.start).getTime() <= Date.now()) return // só vagas futuras
  if (db.list(tenantId, 'freedSlots').some((f) => f.appointmentId === appointment.id)) return
  db.insert(tenantId, 'freedSlots', freedSlotFrom(tenantId, appointment, reason))
})

const fitsAvailability = (w: WaitlistEntry, start: ISOInstant, tz: string) => {
  const p = zonedParts(start, tz)
  return w.availability.some((a) => a.weekday === p.weekday && p.minutesOfDay >= a.start && p.minutesOfDay + w.durationMin <= a.end)
}

// Seed: uma vaga liberada compatível com a lista de espera (de preferência com 2 pessoas aptas, para simular disputa).
registerSeed('freedSlots', (ctx) => {
  const entries = ctx.get('waitlist').filter((w) => w.status === 'aguardando')
  if (!entries.length) return []
  const units = ctx.get('units'), services = ctx.get('services'), pros = ctx.get('professionals'), resources = ctx.get('resources'), appts = ctx.get('appointments')
  const now = demoBaseDate()
  const unit = units.find((u) => u.id === entries[0].unitId)
  if (!unit) return []
  const tz = unit.timezone
  const today = zonedParts(now, tz).date
  // Procura o primeiro horário livre em que mais pessoas da lista cabem (a de maior duração define o serviço da vaga).
  let best: { s: ReturnType<typeof availableSlots>[number]; serviceId: ID; n: number } | null = null
  for (let i = 1; i <= 14 && (best?.n ?? 0) < 2; i++) {
    const date = addDaysCivil(today, i)
    const fit = entries.filter((w) => w.unitId === unit.id && w.availability.some((a) => a.weekday === civilWeekday(date))).sort((a, b) => b.durationMin - a.durationMin)
    const top = fit[0]
    const svc = top && services.find((s) => s.id === top.serviceId)
    if (!svc) continue
    const slots = availableSlots({ date, unit, service: svc, professionals: pros.filter((p) => !top.professionalId || p.id === top.professionalId), resources, appointments: appts, stepMin: 30, now })
    for (const s of slots) {
      const n = fit.filter((o) => fitsAvailability(o, s.start, tz)).length
      if (n > (best?.n ?? 0)) best = { s, serviceId: svc.id, n }
      if (n >= 2) break
    }
  }
  if (!best) return []
  const { s, serviceId } = best
  return [{ id: `${ctx.tenantId}_fs1`, tenantId: ctx.tenantId, createdAt: now.toISOString(), unitId: unit.id, professionalId: s.professionalId, serviceId, resourceIds: s.resourceIds, start: s.start, end: s.end, reason: 'Cancelamento pelo paciente (dado de demonstração)', status: 'livre' }]
})
