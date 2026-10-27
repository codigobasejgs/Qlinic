// Regras PURAS de Odontologia (sem React/window): numeração FDI, faces, condições, periodontograma,
// laboratório, ortodontia e esterilização. Testadas em odonto.test.ts.
import type { StatusChange } from '@/domain/types'
import { addDaysCivil, nowISO, type CivilDate } from '@/lib/dates'
import type { Face, LabOrder, LabStatus, MarkState, OdontogramEntry, PerioExam, PerioTooth, SterilizationCycle, ToothCondition } from './types'

// ---------------- FDI ----------------
const range = (q: number, n: number, desc: boolean) => Array.from({ length: n }, (_, i) => q * 10 + (desc ? n - i : i + 1))
/** Paciente visto de frente: lado direito do paciente aparece à ESQUERDA da tela. */
export const PERMANENT_UPPER = [...range(1, 8, true), ...range(2, 8, false)] // 18..11 | 21..28
export const PERMANENT_LOWER = [...range(4, 8, true), ...range(3, 8, false)] // 48..41 | 31..38
export const DECIDUOUS_UPPER = [...range(5, 5, true), ...range(6, 5, false)] // 55..51 | 61..65
export const DECIDUOUS_LOWER = [...range(8, 5, true), ...range(7, 5, false)] // 85..81 | 71..75

export type Dentition = 'permanente' | 'decidua' | 'mista'
/** Linhas exibidas (de cima para baixo). Mista: decíduos entre os permanentes, como na arcada. */
export function dentitionRows(d: Dentition): number[][] {
  if (d === 'permanente') return [PERMANENT_UPPER, PERMANENT_LOWER]
  if (d === 'decidua') return [DECIDUOUS_UPPER, DECIDUOUS_LOWER]
  return [PERMANENT_UPPER, DECIDUOUS_UPPER, DECIDUOUS_LOWER, PERMANENT_LOWER]
}

export const quadrantOf = (t: number) => Math.floor(t / 10)
export const positionOf = (t: number) => t % 10
export const isDeciduous = (t: number) => quadrantOf(t) >= 5
export function isValidTooth(t: number): boolean {
  if (!Number.isInteger(t)) return false
  const q = quadrantOf(t), p = positionOf(t)
  return (q >= 1 && q <= 4 && p >= 1 && p <= 8) || (q >= 5 && q <= 8 && p >= 1 && p <= 5)
}
export const isUpper = (t: number) => [1, 2, 5, 6].includes(quadrantOf(t))
/** Quadrantes do lado DIREITO do paciente (exibidos à esquerda da tela). */
export const isPatientRight = (t: number) => [1, 4, 5, 8].includes(quadrantOf(t))
export const isPosterior = (t: number) => positionOf(t) >= 4
/** Molares (permanentes e decíduos) e primeiros pré-molares superiores: avaliação de furca aplicável. */
export function isMultiRooted(t: number): boolean {
  const p = positionOf(t)
  if (isDeciduous(t)) return p >= 4
  return p >= 6 || (isUpper(t) && p === 4)
}

const QUADRANT_LABEL: Record<number, string> = {
  1: 'superior direito', 2: 'superior esquerdo', 3: 'inferior esquerdo', 4: 'inferior direito',
  5: 'superior direito (decíduo)', 6: 'superior esquerdo (decíduo)', 7: 'inferior esquerdo (decíduo)', 8: 'inferior direito (decíduo)',
}
export const quadrantLabel = (q: number) => QUADRANT_LABEL[q] ?? `quadrante ${q}`
const PERM_NAME = ['', 'Incisivo central', 'Incisivo lateral', 'Canino', 'Primeiro pré-molar', 'Segundo pré-molar', 'Primeiro molar', 'Segundo molar', 'Terceiro molar']
const DEC_NAME = ['', 'Incisivo central decíduo', 'Incisivo lateral decíduo', 'Canino decíduo', 'Primeiro molar decíduo', 'Segundo molar decíduo']
export function toothName(t: number): string {
  if (!isValidTooth(t)) return `Dente ${t}`
  const base = (isDeciduous(t) ? DEC_NAME : PERM_NAME)[positionOf(t)]
  return `${base} ${isUpper(t) ? 'superior' : 'inferior'} ${isPatientRight(t) ? 'direito' : 'esquerdo'}`
}

export const FACES: Face[] = ['V', 'L', 'M', 'D', 'O']
/** Nome da face conforme o dente: L = palatina (superior) / lingual (inferior); O = oclusal (posterior) / incisal (anterior). */
export function faceLabel(t: number, f: Face): string {
  if (f === 'V') return 'vestibular'
  if (f === 'M') return 'mesial'
  if (f === 'D') return 'distal'
  if (f === 'L') return isUpper(t) ? 'palatina' : 'lingual'
  return isPosterior(t) ? 'oclusal' : 'incisal'
}
export function faceCode(t: number, f: Face): string {
  if (f === 'L') return isUpper(t) ? 'P' : 'L'
  if (f === 'O') return isPosterior(t) ? 'O' : 'I'
  return f
}
export const facesCode = (t: number, faces: Face[]) => FACES.filter((f) => faces.includes(f)).map((f) => faceCode(t, f)).join('')

/** Face em cada região do desenho (vista frontal). Superior: vestibular em cima. Mesial voltada para a linha média. */
export function faceAt(t: number, region: 'top' | 'bottom' | 'left' | 'right' | 'center'): Face {
  if (region === 'center') return 'O'
  if (region === 'top') return isUpper(t) ? 'V' : 'L'
  if (region === 'bottom') return isUpper(t) ? 'L' : 'V'
  const mesialOnRight = isPatientRight(t)
  if (region === 'right') return mesialOnRight ? 'M' : 'D'
  return mesialOnRight ? 'D' : 'M'
}

/** Navegação por setas na grade de dentes (linhas da dentição exibida). */
export function moveInRows(rows: number[][], tooth: number, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'): number {
  const r = rows.findIndex((row) => row.includes(tooth))
  if (r < 0) return rows[0][0]
  const c = rows[r].indexOf(tooth)
  if (key === 'ArrowLeft') return rows[r][Math.max(0, c - 1)]
  if (key === 'ArrowRight') return rows[r][Math.min(rows[r].length - 1, c + 1)]
  if (key === 'Home') return rows[r][0]
  if (key === 'End') return rows[r][rows[r].length - 1]
  const nr = key === 'ArrowUp' ? Math.max(0, r - 1) : Math.min(rows.length - 1, r + 1)
  if (nr === r) return tooth
  // mantém a distância à linha média (linhas podem ter 16 ou 10 dentes); negativo = lado esquerdo da tela
  const off = c - rows[r].length / 2, nhalf = rows[nr].length / 2
  return rows[nr][nhalf + (off < 0 ? Math.max(off, -nhalf) : Math.min(off, nhalf - 1))]
}

// ---------------- Condições / marcações ----------------
export interface ConditionDef { key: ToothCondition; label: string; scope: 'face' | 'dente'; states: MarkState[] }
export const CONDITIONS: ConditionDef[] = [
  { key: 'carie', label: 'Cárie', scope: 'face', states: ['existente'] },
  { key: 'restauracao', label: 'Restauração', scope: 'face', states: ['existente', 'planejado', 'realizado'] },
  { key: 'selante', label: 'Selante', scope: 'face', states: ['existente', 'planejado', 'realizado'] },
  { key: 'fratura', label: 'Fratura', scope: 'face', states: ['existente'] },
  { key: 'ausente', label: 'Ausente', scope: 'dente', states: ['existente'] },
  { key: 'extracao', label: 'Extração indicada', scope: 'dente', states: ['planejado', 'realizado'] },
  { key: 'endodontia', label: 'Endodontia (canal)', scope: 'dente', states: ['existente', 'planejado', 'realizado'] },
  { key: 'coroa', label: 'Coroa', scope: 'dente', states: ['existente', 'planejado', 'realizado'] },
  { key: 'implante', label: 'Implante', scope: 'dente', states: ['existente', 'planejado', 'realizado'] },
  { key: 'protese', label: 'Prótese', scope: 'dente', states: ['existente', 'planejado', 'realizado'] },
]
export const conditionDef = (k?: ToothCondition) => CONDITIONS.find((c) => c.key === k)
export const STATE_LABEL: Record<MarkState, string> = { existente: 'Existente', planejado: 'Planejado', realizado: 'Realizado' }

export interface EntryDraft { tooth: number; faces: Face[]; condition?: ToothCondition; serviceId?: string; state: MarkState }
export function validateEntry(e: EntryDraft): string[] {
  const errs: string[] = []
  if (!isValidTooth(e.tooth)) errs.push(`Dente ${e.tooth} não existe na numeração FDI.`)
  if (!e.condition && !e.serviceId) errs.push('Escolha uma condição e/ou um procedimento.')
  const def = conditionDef(e.condition)
  if (def) {
    if (def.scope === 'face' && e.faces.length === 0) errs.push(`"${def.label}" exige ao menos uma face.`)
    if (!def.states.includes(e.state)) errs.push(`"${def.label}" não pode ser registrada como ${STATE_LABEL[e.state].toLowerCase()}.`)
  }
  if (e.faces.some((f) => !FACES.includes(f))) errs.push('Face inválida.')
  if (e.state === 'planejado' && !e.serviceId) errs.push('Marcação planejada exige procedimento (serviço) para entrar no plano de tratamento.')
  return errs
}
/** Faces normalizadas: condição de dente inteiro não guarda faces. */
export function normalizeFaces(e: EntryDraft): Face[] {
  return conditionDef(e.condition)?.scope === 'dente' ? [] : FACES.filter((f) => e.faces.includes(f))
}
export const activeEntries = (list: OdontogramEntry[], tooth?: number) =>
  list.filter((e) => !e.voided && (tooth === undefined || e.tooth === tooth)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))

// ---------------- Periodontograma ----------------
export const emptyPerioTooth = (): PerioTooth => ({ mobility: null, furcation: null, sites: Array.from({ length: 6 }, () => ({ pd: null, rec: null, bleeding: false, suppuration: false })) })
const intIn = (v: number | null, min: number, max: number) => v === null || (Number.isInteger(v) && v >= min && v <= max)

/** Validações estruturais (não clínicas): faixas, inteiros, furca só em multirradiculares, dente ausente sem medidas. */
export function validatePerioTooth(t: number, d: PerioTooth): string[] {
  const errs: string[] = []
  const n = `Dente ${t}`
  if (!isValidTooth(t) || isDeciduous(t)) errs.push(`${n}: periodontograma aceita somente dentes permanentes válidos.`)
  if (d.sites.length !== 6) errs.push(`${n}: são necessários 6 sítios.`)
  if (d.missing) {
    if (d.sites.some((s) => s.pd !== null || s.rec !== null || s.bleeding || s.suppuration) || d.mobility !== null || d.furcation !== null) errs.push(`${n}: marcado como ausente não pode ter medições.`)
    return errs
  }
  d.sites.forEach((s, i) => {
    const site = ['MV', 'V', 'DV', 'ML', 'L', 'DL'][i]
    if (!intIn(s.pd, 0, 15)) errs.push(`${n} ${site}: profundidade de sondagem deve ser inteiro de 0 a 15 mm.`)
    if (!intIn(s.rec, -5, 15)) errs.push(`${n} ${site}: recessão deve ser inteiro de −5 a 15 mm.`)
    if ((s.bleeding || s.suppuration) && s.pd === null) errs.push(`${n} ${site}: registre a profundidade antes de sangramento/supuração.`)
  })
  if (!intIn(d.mobility, 0, 3)) errs.push(`${n}: mobilidade deve ser 0, 1, 2 ou 3.`)
  if (d.furcation !== null) {
    if (!isMultiRooted(t)) errs.push(`${n}: furca não se aplica (dente unirradicular).`)
    else if (!intIn(d.furcation, 0, 3)) errs.push(`${n}: furca deve ser 0, 1, 2 ou 3.`)
  }
  return errs
}
/** Nível de inserção clínica = profundidade de sondagem + recessão (recessão negativa = margem coronal à JCE). */
export function attachmentLevel(pd: number | null, rec: number | null): number | null {
  return pd === null || rec === null ? null : pd + rec
}
export function perioSummary(exam: Pick<PerioExam, 'teeth'>) {
  let sites = 0, bleeding = 0, deep4 = 0, deep6 = 0, suppuration = 0, pdSum = 0, calSum = 0, calN = 0, present = 0, missing = 0
  for (const [, d] of Object.entries(exam.teeth)) {
    if (d.missing) { missing++; continue }
    if (d.sites.some((s) => s.pd !== null)) present++
    for (const s of d.sites) {
      if (s.pd === null) continue
      sites++; pdSum += s.pd
      if (s.bleeding) bleeding++
      if (s.suppuration) suppuration++
      if (s.pd >= 4) deep4++
      if (s.pd >= 6) deep6++
      const cal = attachmentLevel(s.pd, s.rec)
      if (cal !== null) { calSum += cal; calN++ }
    }
  }
  const r1 = (v: number) => Math.round(v * 10) / 10
  return { sites, present, missing, bleeding, suppuration, deep4, deep6, bleedingPct: sites ? r1((bleeding / sites) * 100) : 0, meanPd: sites ? r1(pdSum / sites) : 0, meanCal: calN ? r1(calSum / calN) : 0 }
}
export function maxPd(d?: PerioTooth): number | null {
  if (!d || d.missing) return null
  const v = d.sites.map((s) => s.pd).filter((x): x is number => x !== null)
  return v.length ? Math.max(...v) : null
}
export function compareExams(a: PerioExam, b: PerioExam) {
  const teeth = [...PERMANENT_UPPER, ...PERMANENT_LOWER]
  const rows = teeth.map((t) => {
    const pa = maxPd(a.teeth[t]), pb = maxPd(b.teeth[t])
    return { tooth: t, a: pa, b: pb, delta: pa !== null && pb !== null ? pb - pa : null }
  }).filter((r) => r.a !== null || r.b !== null)
  return { rows, a: perioSummary(a), b: perioSummary(b) }
}

// ---------------- Laboratório ----------------
export const LAB_LABEL: Record<LabStatus, string> = { solicitado: 'Solicitado', enviado: 'Enviado', recebido: 'Recebido', ajuste: 'Em ajuste', entregue: 'Entregue', cancelado: 'Cancelado' }
export const LAB_TRANSITIONS: Record<LabStatus, LabStatus[]> = {
  solicitado: ['enviado', 'cancelado'],
  enviado: ['recebido', 'cancelado'],
  recebido: ['ajuste', 'entregue'],
  ajuste: ['enviado', 'entregue'],
  entregue: [],
  cancelado: [],
}
export function transitionLab(o: LabOrder, to: LabStatus, by: string, reason?: string): LabOrder {
  if (!LAB_TRANSITIONS[o.status].includes(to)) throw new Error(`Transição inválida: ${LAB_LABEL[o.status]} → ${LAB_LABEL[to]}.`)
  if ((to === 'cancelado' || to === 'ajuste') && !reason?.trim()) throw new Error(to === 'cancelado' ? 'Informe o motivo do cancelamento.' : 'Descreva o ajuste necessário.')
  const h: StatusChange<LabStatus> = { at: nowISO(), from: o.status, to, by, reason: reason?.trim() || undefined }
  return { ...o, status: to, history: [...o.history, h] }
}
/** Atrasado: prazo vencido e peça ainda não recebida/entregue. */
export const isLabLate = (o: LabOrder, today: CivilDate) => ['solicitado', 'enviado', 'ajuste'].includes(o.status) && o.dueOn < today

// ---------------- Ortodontia ----------------
export function planVisits(start: CivilDate, intervalDays: number, count: number): CivilDate[] {
  if (!Number.isInteger(intervalDays) || intervalDays < 7 || intervalDays > 120) throw new Error('Intervalo entre manutenções deve ser de 7 a 120 dias.')
  if (!Number.isInteger(count) || count < 1 || count > 36) throw new Error('Quantidade de manutenções: 1 a 36.')
  return Array.from({ length: count }, (_, i) => addDaysCivil(start, intervalDays * (i + 1)))
}
export function planAligners(start: CivilDate, total: number, changeDays: number) {
  if (!Number.isInteger(total) || total < 1 || total > 80) throw new Error('Total de placas: 1 a 80.')
  if (!Number.isInteger(changeDays) || changeDays < 5 || changeDays > 30) throw new Error('Troca de placa: a cada 5 a 30 dias.')
  return Array.from({ length: total }, (_, i) => ({ n: i + 1, plannedChangeOn: addDaysCivil(start, changeDays * i) }))
}

// ---------------- Esterilização ----------------
/** Liberação é REGISTRO do responsável — o sistema só confere se os indicadores foram informados. Não declara conformidade. */
export function releaseBlockers(c: Pick<SterilizationCycle, 'indicators' | 'packages'>): string[] {
  const errs: string[] = []
  if (!c.indicators.length) errs.push('Registre ao menos um indicador.')
  if (c.indicators.some((i) => i.result === 'pendente')) errs.push('Há indicador com resultado pendente.')
  if (c.indicators.some((i) => i.result === 'reprovado')) errs.push('Indicador reprovado: o lote não pode ser liberado.')
  if (!c.packages.length) errs.push('Inclua ao menos um pacote/kit.')
  return errs
}
export const packageExpired = (expiresOn: CivilDate, today: CivilDate) => expiresOn < today
