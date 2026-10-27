// Instantes: ISO 8601 UTC (string). Datas civis (nascimento, vencimento): "YYYY-MM-DD" sem fuso.
// Exibição sempre no fuso da unidade (IANA), ex.: "America/Sao_Paulo".

export type ISOInstant = string
export type CivilDate = string

export const DEFAULT_TZ = 'America/Sao_Paulo'

/** Data-base da demonstração. Configurável por localStorage para a demo não envelhecer. */
export function demoBaseDate(): Date {
  try {
    const v = localStorage.getItem('qlinic.demoBase')
    if (v) return new Date(v)
  } catch {
    /* sem storage */
  }
  const d = new Date()
  d.setSeconds(0, 0)
  return d
}

/** Partes de data/hora de um instante no fuso indicado. */
export function zonedParts(instant: ISOInstant | Date, tz = DEFAULT_TZ) {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  })
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  return {
    date: `${p.year}-${p.month}-${p.day}` as CivilDate,
    hour: Number(p.hour), minute: Number(p.minute),
    minutesOfDay: Number(p.hour) * 60 + Number(p.minute),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
  }
}

/** Offset (min) do fuso em relação ao UTC num instante. */
function tzOffsetMinutes(utcMs: number, tz: string): number {
  const d = new Date(utcMs)
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  const asUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  return Math.round((asUTC - utcMs) / 60000)
}

/** Converte data civil + minutos do dia no fuso → instante UTC ISO. Lida com DST por iteração. */
export function zonedToInstant(date: CivilDate, minutesOfDay: number, tz = DEFAULT_TZ): ISOInstant {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, 0, minutesOfDay)
  let off = tzOffsetMinutes(guess, tz)
  let utc = guess - off * 60000
  const off2 = tzOffsetMinutes(utc, tz)
  if (off2 !== off) { off = off2; utc = guess - off * 60000 }
  return new Date(utc).toISOString()
}

export function addMinutes(instant: ISOInstant, minutes: number): ISOInstant {
  return new Date(new Date(instant).getTime() + minutes * 60000).toISOString()
}

export function addDaysCivil(date: CivilDate, days: number): CivilDate {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

export function civilWeekday(date: CivilDate): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function todayCivil(tz = DEFAULT_TZ): CivilDate {
  return zonedParts(demoBaseDate(), tz).date
}

export function nowISO(): ISOInstant {
  return new Date().toISOString()
}

export function formatDateTime(instant: ISOInstant, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(new Date(instant))
}
export function formatTime(instant: ISOInstant, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(instant))
}
export function formatDateLong(instant: ISOInstant, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(instant))
}
/** Data civil → "dd/mm/aaaa" sem conversão de fuso. */
export function formatCivil(date: CivilDate | undefined | null): string {
  if (!date) return '—'
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}
export function formatCivilLong(date: CivilDate): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(Date.UTC(y, m - 1, d)))
}
export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}
export function ageFromBirth(birth: CivilDate, ref: CivilDate): number {
  const [by, bm, bd] = birth.split('-').map(Number)
  const [ry, rm, rd] = ref.split('-').map(Number)
  let age = ry - by
  if (rm < bm || (rm === bm && rd < bd)) age--
  return age
}
export function relativeFromNow(instant: ISOInstant): string {
  const diff = (new Date(instant).getTime() - Date.now()) / 60000
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(Math.round(diff), 'minute')
  if (abs < 1440) return rtf.format(Math.round(diff / 60), 'hour')
  return rtf.format(Math.round(diff / 1440), 'day')
}
