// Helpers do módulo de agenda (sem JSX).
import { useEffect, useState } from 'react'
import type { Appointment, AppointmentStatus, ID, Professional, Resource, Unit } from '@/domain/types'
import type { useTenant } from '@/app/session'
import { db } from '@/data/store'
import { addDaysCivil, civilWeekday, nowISO, todayCivil, zonedParts, zonedToInstant, minutesToHHMM, type CivilDate, type ISOInstant } from '@/lib/dates'
import type { Tone } from '@/ui/core'

type T = ReturnType<typeof useTenant>

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const WEEKDAY_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export const STATUS_TONE: Record<AppointmentStatus, Tone> = {
  solicitada: 'info', aguardando_confirmacao: 'warning', confirmada: 'brand', chegou: 'success', em_atendimento: 'info',
  concluida: 'neutral', faltou: 'danger', cancelada: 'neutral',
}
export const FIN_LABEL: Record<Appointment['financialStatus'], string> = { nao_cobrado: 'Não cobrado', cobrado: 'Cobrado', pago: 'Pago', parcial: 'Pago parcialmente', isento: 'Isento' }
export const FIN_TONE: Record<Appointment['financialStatus'], Tone> = { nao_cobrado: 'neutral', cobrado: 'warning', pago: 'success', parcial: 'warning', isento: 'neutral' }

/** Unidades em escopo: selecionada, ou todas as permitidas. */
export function scopeUnitIds(t: T): ID[] {
  return t.unitId ? [t.unitId] : t.allowedUnits.map((u) => u.id)
}
/** Fuso de exibição: da unidade selecionada (ou da primeira permitida). */
export function tzOf(t: T): string {
  return t.unit?.timezone ?? t.allowedUnits[0]?.timezone ?? t.org.timezone
}
export function today(tz: string): CivilDate { return todayCivil(tz) }

export function dayBounds(date: CivilDate, tz: string): [number, number] {
  return [new Date(zonedToInstant(date, 0, tz)).getTime(), new Date(zonedToInstant(addDaysCivil(date, 1), 0, tz)).getTime()]
}
export function onDay(a: { start: ISOInstant }, date: CivilDate, tz: string) {
  return zonedParts(a.start, tz).date === date
}

/** Re-render periódico (relógios, contagens regressivas). */
export function useNow(ms = 1000): number {
  const [n, setN] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setN(Date.now()), ms); return () => clearInterval(id) }, [ms])
  return n
}

export function fmtElapsed(fromIso: ISOInstant | undefined, now: number): string {
  if (!fromIso) return '—'
  const min = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60000))
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}
export function fmtCountdown(toIso: ISOInstant, now: number): string {
  const s = Math.max(0, Math.floor((new Date(toIso).getTime() - now) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export const hhmm = minutesToHHMM

/** Intervalos abertos da unidade no dia (horário especial substitui; feriado fecha). */
export function unitOpen(unit: Unit, date: CivilDate): { start: number; end: number }[] {
  if (unit.holidays.some((h) => h.date === date)) return []
  const sp = unit.specialHours.find((h) => h.date === date)
  return sp ? sp.intervals : unit.hours[civilWeekday(date)] ?? []
}
export function closedReason(unit: Unit, date: CivilDate): string | null {
  const h = unit.holidays.find((x) => x.date === date)
  if (h) return `Feriado: ${h.name}`
  const sp = unit.specialHours.find((x) => x.date === date)
  return sp ? `Horário especial: ${sp.reason}` : null
}
const intersect = (a: { start: number; end: number }[], b: { start: number; end: number }[]) =>
  a.flatMap((x) => b.map((y) => ({ start: Math.max(x.start, y.start), end: Math.min(x.end, y.end) }))).filter((i) => i.end > i.start)

/** Minutos abertos do profissional no dia (jornada ∩ funcionamento) nas unidades informadas. */
export function proOpen(pro: Professional, units: Unit[], date: CivilDate): { start: number; end: number }[] {
  const wd = civilWeekday(date)
  return units.flatMap((u) => intersect(pro.schedule.filter((j) => j.unitId === u.id && j.weekday === wd), unitOpen(u, date)))
}

/** Converte janela [início,fim) instantânea em minutos do dia (recortada ao dia). */
export function clipMinutes(startIso: ISOInstant, endIso: ISOInstant, date: CivilDate, tz: string): { start: number; end: number } | null {
  const [d0, d1] = dayBounds(date, tz)
  const s = Math.max(new Date(startIso).getTime(), d0), e = Math.min(new Date(endIso).getTime(), d1)
  if (e <= s) return null
  return { start: Math.round((s - d0) / 60000), end: Math.round((e - d0) / 60000) }
}
export function blocksOf(r: Resource | Professional, date: CivilDate, tz: string) {
  const list = 'blocks' in r ? r.blocks : r.absences
  return list.map((b) => ({ ...clipMinutes(b.start, b.end, date, tz), reason: b.reason })).filter((b): b is { start: number; end: number; reason: string } => b.start !== undefined)
}

/** Senha de chamada para chegada registrada na recepção (sem token): prefixo R. */
export function assignDeskTicket(tenantId: ID, id: ID, tz: string): string {
  const a = db.get(tenantId, 'appointments', id)
  if (!a) throw new Error('Agendamento não encontrado.')
  if (a.checkIn?.ticket) return a.checkIn.ticket
  const day = zonedParts(a.start, tz).date
  const n = db.list(tenantId, 'appointments').filter((x) => x.checkIn?.ticket?.startsWith('R') && zonedParts(x.start, tz).date === day).length
  const ticket = `R${String(n + 1).padStart(3, '0')}`
  db.update(tenantId, 'appointments', id, (p) => ({ ...p, checkIn: { token: p.checkIn?.token ?? '', expiresAt: p.checkIn?.expiresAt ?? nowISO(), ...p.checkIn, usedAt: nowISO(), ticket } }))
  return ticket
}

/** Faixas de sobreposição para posicionar eventos lado a lado numa coluna. */
export function layoutLanes<E extends { s: number; e: number }>(evs: E[]): (E & { lane: number; lanes: number })[] {
  const sorted = [...evs].sort((a, b) => a.s - b.s || b.e - a.e)
  const out: (E & { lane: number; lanes: number })[] = []
  let group: (E & { lane: number; lanes: number })[] = []
  let groupEnd = -Infinity
  const flush = () => { const n = Math.max(1, ...group.map((g) => g.lane + 1)); group.forEach((g) => { g.lanes = n }); out.push(...group); group = [] }
  for (const ev of sorted) {
    if (ev.s >= groupEnd && group.length) { flush(); groupEnd = -Infinity }
    const used = new Set(group.filter((g) => g.e > ev.s).map((g) => g.lane))
    let lane = 0
    while (used.has(lane)) lane++
    group.push({ ...ev, lane, lanes: 1 })
    groupEnd = Math.max(groupEnd, ev.e)
  }
  if (group.length) flush()
  return out
}
