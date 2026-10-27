// Regras de agenda puras (sem React). Testadas em scheduling.test.ts.
// Validação final de reserva (concorrência) é responsabilidade FUTURA do servidor (transação).
import type { Appointment, AppointmentStatus, ID, Professional, Resource, Service, Unit } from './types'
import { addDaysCivil, civilWeekday, zonedParts, zonedToInstant, type CivilDate, type ISOInstant } from '@/lib/dates'

export const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  solicitada: ['aguardando_confirmacao', 'confirmada', 'cancelada'],
  aguardando_confirmacao: ['confirmada', 'cancelada'],
  confirmada: ['chegou', 'faltou', 'cancelada', 'aguardando_confirmacao'],
  chegou: ['em_atendimento', 'cancelada', 'confirmada'],
  em_atendimento: ['concluida'],
  concluida: [],
  faltou: [],
  cancelada: [],
}

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** Status que ocupam a agenda (bloqueiam horário). */
export const BLOCKING: AppointmentStatus[] = ['solicitada', 'aguardando_confirmacao', 'confirmada', 'chegou', 'em_atendimento', 'concluida']

export type ConflictKind = 'profissional' | 'recurso' | 'fora_horario' | 'feriado' | 'ausencia' | 'recurso_bloqueado' | 'duracao' | 'paciente' | 'passado' | 'unidade_profissional'
export interface Conflict { kind: ConflictKind; message: string; refId?: ID }

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE
const ms = (i: ISOInstant) => new Date(i).getTime()

export interface SlotCandidate {
  unit: Unit
  professional: Professional
  service: Service
  resourceIds: ID[]
  patientId?: ID
  start: ISOInstant
  end: ISOInstant
  /** Ignora este agendamento (edição/mover). */
  ignoreId?: ID
  /** Ignora ocorrências da mesma série (edição da série inteira). */
  ignoreSeriesId?: ID
  now?: Date
}

export function findConflicts(c: SlotCandidate, appointments: Appointment[], resources: Resource[]): Conflict[] {
  const out: Conflict[] = []
  const s = ms(c.start), e = ms(c.end)
  const tz = c.unit.timezone
  if (e <= s) out.push({ kind: 'duracao', message: 'O término deve ser depois do início.' })
  if ((e - s) / 60000 < c.service.durationMin) out.push({ kind: 'duracao', message: `Duração menor que a do serviço (${c.service.durationMin} min).` })
  if (c.now && s < c.now.getTime() - 5 * 60000) out.push({ kind: 'passado', message: 'Horário no passado.' })

  const ps = zonedParts(c.start, tz), pe = zonedParts(c.end, tz)
  const crossesDay = ps.date !== pe.date && !(pe.minutesOfDay === 0 && addDaysCivil(ps.date, 1) === pe.date)
  const endMin = pe.date !== ps.date ? 24 * 60 : pe.minutesOfDay
  if (crossesDay) out.push({ kind: 'fora_horario', message: 'O atendimento atravessa a virada do dia no fuso da unidade.' })

  // Funcionamento da unidade (horário especial substitui o padrão; feriado fecha)
  const holiday = c.unit.holidays.find((h) => h.date === ps.date)
  if (holiday) out.push({ kind: 'feriado', message: `Unidade fechada: ${holiday.name}.` })
  const special = c.unit.specialHours.find((h) => h.date === ps.date)
  const intervals = special ? special.intervals : c.unit.hours[ps.weekday] ?? []
  if (!holiday && !intervals.some((iv) => ps.minutesOfDay >= iv.start && endMin <= iv.end)) {
    out.push({ kind: 'fora_horario', message: special ? `Fora do horário especial (${special.reason}).` : 'Fora do horário de funcionamento da unidade.' })
  }
  // Jornada do profissional na unidade
  if (!c.professional.unitIds.includes(c.unit.id)) out.push({ kind: 'unidade_profissional', message: 'Profissional não atende nesta unidade.' })
  else if (!c.professional.schedule.some((j) => j.unitId === c.unit.id && j.weekday === ps.weekday && ps.minutesOfDay >= j.start && endMin <= j.end)) {
    out.push({ kind: 'fora_horario', message: 'Fora da jornada do profissional nesta unidade.' })
  }
  for (const ab of c.professional.absences) if (overlaps(s, e, ms(ab.start), ms(ab.end))) out.push({ kind: 'ausencia', message: `Profissional ausente: ${ab.reason}.` })

  // Sobreposição considerando buffer do serviço existente e do novo
  const buf = c.service.bufferMin * 60000
  for (const a of appointments) {
    if (a.id === c.ignoreId || (c.ignoreSeriesId && a.seriesId === c.ignoreSeriesId) || !BLOCKING.includes(a.status)) continue
    const aS = ms(a.start), aE = ms(a.end)
    if (a.professionalId === c.professional.id && overlaps(s, e + buf, aS, aE + buf)) out.push({ kind: 'profissional', message: `Profissional já ocupado das ${fmt(a.start, tz)} às ${fmt(a.end, tz)}.`, refId: a.id })
    const shared = a.resourceIds.filter((r) => c.resourceIds.includes(r))
    if (shared.length && overlaps(s, e, aS, aE)) {
      const names = shared.map((id) => resources.find((r) => r.id === id)?.name ?? id).join(', ')
      out.push({ kind: 'recurso', message: `Recurso ocupado (${names}) das ${fmt(a.start, tz)} às ${fmt(a.end, tz)}.`, refId: a.id })
    }
    if (c.patientId && a.patientId === c.patientId && overlaps(s, e, aS, aE)) out.push({ kind: 'paciente', message: 'Paciente já tem atendimento neste horário.', refId: a.id })
  }
  for (const rid of c.resourceIds) {
    const r = resources.find((x) => x.id === rid)
    if (!r) continue
    if (!r.active) out.push({ kind: 'recurso_bloqueado', message: `${r.name} está inativo.` })
    for (const b of r.blocks) if (overlaps(s, e, ms(b.start), ms(b.end))) out.push({ kind: 'recurso_bloqueado', message: `${r.name} indisponível: ${b.reason}.` })
  }
  // Recursos exigidos pelo serviço
  for (const kind of c.service.resourceKinds) {
    if (!c.resourceIds.some((id) => resources.find((r) => r.id === id)?.kind === kind)) out.push({ kind: 'recurso', message: `Serviço exige recurso do tipo "${kind}".` })
  }
  return out
}

function fmt(i: ISOInstant, tz: string) {
  const p = zonedParts(i, tz)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

export interface Slot { start: ISOInstant; end: ISOInstant; professionalId: ID; resourceIds: ID[] }

/** Calcula horários disponíveis para um serviço num dia (passo configurável). */
export function availableSlots(args: {
  date: CivilDate
  unit: Unit
  service: Service
  professionals: Professional[]
  resources: Resource[]
  appointments: Appointment[]
  stepMin?: number
  now?: Date
}): Slot[] {
  const { date, unit, service, professionals, resources, appointments } = args
  const step = args.stepMin ?? 15
  const out: Slot[] = []
  const wd = civilWeekday(date)
  for (const pro of professionals) {
    if (!pro.active || !pro.unitIds.includes(unit.id)) continue
    for (const j of pro.schedule.filter((x) => x.unitId === unit.id && x.weekday === wd)) {
      for (let m = j.start; m + service.durationMin <= j.end; m += step) {
        const start = zonedToInstant(date, m, unit.timezone)
        const end = zonedToInstant(date, m + service.durationMin, unit.timezone)
        const resIds: ID[] = []
        let ok = true
        for (const kind of service.resourceKinds) {
          const cands = resources.filter((r) => r.unitId === unit.id && r.kind === kind && r.active)
          const free = cands.find((r) => findConflicts({ unit, professional: pro, service, resourceIds: [r.id], start, end, now: args.now }, appointments, resources).every((c) => c.kind !== 'recurso' && c.kind !== 'recurso_bloqueado'))
          if (!free) { ok = false; break }
          resIds.push(free.id)
        }
        if (!ok) continue
        const conflicts = findConflicts({ unit, professional: pro, service, resourceIds: resIds, start, end, now: args.now }, appointments, resources)
        if (conflicts.length === 0) out.push({ start, end, professionalId: pro.id, resourceIds: resIds })
      }
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

/** Gera datas de recorrência semanal (n ocorrências, a cada k semanas). */
export function weeklyRecurrence(start: CivilDate, count: number, everyWeeks = 1): CivilDate[] {
  return Array.from({ length: count }, (_, i) => addDaysCivil(start, i * 7 * everyWeeks))
}
