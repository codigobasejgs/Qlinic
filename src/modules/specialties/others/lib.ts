// Regras puras (sem React/window) dos módulos de especialidade. Testadas em others.test.ts.
import type { VaccineRecord, AestheticPackage } from '@/domain/modules'
import type { ID } from '@/domain/types'
import { addDaysCivil, type CivilDate, type ISOInstant } from '@/lib/dates'
import type { Hospitalization, HospTask, Prescription, TaskState, NutritionAssessment } from './types'

// ======================= Calculadora de conversão (veterinária) =======================
// Só CONVERTE uma dose já prescrita pelo profissional em volume. Não sugere medicamento nem dose; não grava prescrição.
export type DoseUnit = 'mg/kg' | 'mcg/kg' | 'UI/kg' | 'mg' | 'mcg' | 'UI'
export type ConcUnit = 'mg/mL' | 'mcg/mL' | 'UI/mL'
export const DOSE_UNITS: DoseUnit[] = ['mg/kg', 'mcg/kg', 'UI/kg', 'mg', 'mcg', 'UI']
export const CONC_UNITS: ConcUnit[] = ['mg/mL', 'mcg/mL', 'UI/mL']

type Base = 'mg' | 'mcg' | 'UI'
const DIMENSION: Record<Base, 'massa' | 'UI'> = { mg: 'massa', mcg: 'massa', UI: 'UI' }
/** Fator para mg (massa). UI não converte para massa. */
const TO_MG: Record<'mg' | 'mcg', number> = { mg: 1, mcg: 0.001 }

export interface CalcInput {
  species?: string
  context?: string
  dose?: number | null
  doseUnit: DoseUnit
  weightKg?: number | null
  concentration?: number | null
  concUnit: ConcUnit
}
export type CalcResult =
  | { ok: true; volumeMl: number; totalAmount: number; totalUnit: Base; steps: string[] }
  | { ok: false; errors: string[] }

const fmtN = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(n)
const valid = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

export function calcVolume(i: CalcInput): CalcResult {
  const errors: string[] = []
  if (!DOSE_UNITS.includes(i.doseUnit) || !CONC_UNITS.includes(i.concUnit)) return { ok: false, errors: ['Unidade inválida.'] }
  if (!i.species?.trim()) errors.push('Selecione a espécie do animal (o cálculo não é aplicado sem espécie).')
  if (!i.context?.trim()) errors.push('Informe o contexto clínico/prescrição de referência.')
  const perKg = i.doseUnit.endsWith('/kg')
  const doseBase = i.doseUnit.replace('/kg', '') as Base
  const concBase = i.concUnit.replace('/mL', '') as Base
  if (!valid(i.dose)) errors.push('Dado ausente: dose prescrita.')
  else if (i.dose <= 0) errors.push('A dose deve ser maior que zero.')
  if (perKg) {
    if (!valid(i.weightKg)) errors.push('Dado ausente: peso (kg) — obrigatório para dose por kg.')
    else if (i.weightKg <= 0) errors.push('O peso deve ser maior que zero.')
  }
  if (!valid(i.concentration)) errors.push('Dado ausente: concentração do produto.')
  else if (i.concentration <= 0) errors.push('A concentração deve ser maior que zero.')
  if (DIMENSION[doseBase] !== DIMENSION[concBase]) errors.push(`Unidades incompatíveis: dose em ${i.doseUnit} e concentração em ${i.concUnit}. UI não converte para massa (mg/mcg).`)
  if (errors.length) return { ok: false, errors }

  const dose = i.dose as number
  const total = perKg ? dose * (i.weightKg as number) : dose
  const steps: string[] = []
  if (perKg) steps.push(`Quantidade total = ${fmtN(dose)} ${i.doseUnit} × ${fmtN(i.weightKg as number)} kg = ${fmtN(total)} ${doseBase}`)
  else steps.push(`Quantidade total = ${fmtN(total)} ${doseBase} (dose total informada)`)
  let totalInConc = total
  if (doseBase !== concBase) {
    totalInConc = (total * TO_MG[doseBase as 'mg' | 'mcg']) / TO_MG[concBase as 'mg' | 'mcg']
    steps.push(`Conversão: ${fmtN(total)} ${doseBase} = ${fmtN(totalInConc)} ${concBase}`)
  }
  const volume = totalInConc / (i.concentration as number)
  const volumeMl = Math.round(volume * 1000) / 1000
  if (!Number.isFinite(volume) || volumeMl <= 0) return { ok: false, errors: ['Resultado fora da precisão suportada (0,001 mL). Confira os dados.'] }
  steps.push(`Volume = ${fmtN(totalInConc)} ${concBase} ÷ ${fmtN(i.concentration as number)} ${i.concUnit} = ${fmtN(volumeMl)} mL`)
  return { ok: true, volumeMl, totalAmount: total, totalUnit: doseBase, steps }
}

// ======================= Vacinas =======================
/** Carteira de UM animal. Registro de outro animal nunca aparece (isolamento por patientId). */
export function vaccinesFor(list: VaccineRecord[], patientId: ID): VaccineRecord[] {
  return list.filter((v) => v.patientId === patientId).sort((a, b) => b.appliedOn.localeCompare(a.appliedOn))
}

export function validateVaccine(v: Partial<VaccineRecord>): string[] {
  const e: string[] = []
  if (!v.patientId) e.push('Selecione o animal.')
  if (!v.product?.trim()) e.push('Informe o produto.')
  if (!v.lot?.trim()) e.push('Informe o lote.')
  if (!v.professionalId) e.push('Informe o profissional responsável.')
  if (!v.appliedOn) e.push('Informe a data de aplicação.')
  if (v.nextDueOn && v.appliedOn && v.nextDueOn <= v.appliedOn) e.push('A data de retorno deve ser posterior à aplicação.')
  return e
}

// ======================= Internação =======================
/** Tolerância antes de considerar uma tarefa agendada como atrasada. */
export const LATE_TOLERANCE_MIN = 30

export function taskState(t: HospTask, now: Date): TaskState {
  if (t.status !== 'agendado') return t.status
  return new Date(t.dueAt).getTime() + LATE_TOLERANCE_MIN * 60000 < now.getTime() ? 'atrasado' : 'agendado'
}

export const TASK_LABEL: Record<TaskState, string> = {
  agendado: 'Agendado', administrado: 'Administrado', atrasado: 'Atrasado', nao_administrado: 'Não administrado', suspenso: 'Suspenso',
}

/** Horários a partir da prescrição (início + a cada N h, dentro da duração). */
export function scheduleTimes(firstAt: ISOInstant, everyHours: number, durationHours: number): ISOInstant[] {
  if (!(everyHours > 0)) throw new Error('Frequência deve ser maior que zero (a cada N horas).')
  if (!(durationHours > 0)) throw new Error('Duração deve ser maior que zero.')
  const n = Math.floor(durationHours / everyHours) || 1
  if (n > 200) throw new Error('Prescrição gera tarefas demais (máx. 200). Revise frequência/duração.')
  const start = new Date(firstAt).getTime()
  if (Number.isNaN(start)) throw new Error('Horário inicial inválido.')
  return Array.from({ length: n }, (_, k) => new Date(start + k * everyHours * 3600000).toISOString())
}

export function addPrescription(h: Hospitalization, p: Prescription, makeId: () => ID): Hospitalization {
  if (h.status !== 'internado') throw new Error('Paciente já recebeu alta.')
  if (!p.medication.trim() || !p.dose.trim() || !p.route.trim()) throw new Error('Medicamento, dose e via são obrigatórios (digitados pelo profissional).')
  const tasks: HospTask[] = scheduleTimes(p.firstAt, p.everyHours, p.durationHours).map((dueAt) => ({ id: makeId(), prescriptionId: p.id, dueAt, status: 'agendado' }))
  return { ...h, prescriptions: [...h.prescriptions, p], tasks: [...h.tasks, ...tasks] }
}

export function recordAdministration(h: Hospitalization, taskId: ID, r: { by: string; at: ISOInstant; note?: string } & ({ given: true } | { given: false; reason: string })): Hospitalization {
  const t = h.tasks.find((x) => x.id === taskId)
  if (!t) throw new Error('Tarefa não encontrada.')
  if (t.status !== 'agendado') throw new Error('Tarefa já registrada. Correções exigem nova evolução.')
  if (!r.by.trim()) throw new Error('Informe quem administrou.')
  if (!r.given && !r.reason.trim()) throw new Error('Informe o motivo da não administração.')
  const next: HospTask = r.given ? { ...t, status: 'administrado', doneAt: r.at, by: r.by, note: r.note } : { ...t, status: 'nao_administrado', doneAt: r.at, by: r.by, reason: r.reason, note: r.note }
  return { ...h, tasks: h.tasks.map((x) => (x.id === taskId ? next : x)) }
}

export function suspendPrescription(h: Hospitalization, prescriptionId: ID, reason: string, at: ISOInstant): Hospitalization {
  if (!reason.trim()) throw new Error('Informe o motivo da suspensão.')
  return {
    ...h,
    prescriptions: h.prescriptions.map((p) => (p.id === prescriptionId ? { ...p, active: false, suspendedAt: at, suspendReason: reason } : p)),
    tasks: h.tasks.map((t) => (t.prescriptionId === prescriptionId && t.status === 'agendado' && t.dueAt > at ? { ...t, status: 'suspenso', reason } : t)),
  }
}

export function discharge(h: Hospitalization, summary: string, by: string, at: ISOInstant): Hospitalization {
  if (h.status !== 'internado') throw new Error('Alta já registrada.')
  if (!summary.trim()) throw new Error('Sumário de alta é obrigatório.')
  return {
    ...h, status: 'alta', discharge: { at, by, summary },
    prescriptions: h.prescriptions.map((p) => (p.active ? { ...p, active: false, suspendedAt: at, suspendReason: 'Alta' } : p)),
    tasks: h.tasks.map((t) => (t.status === 'agendado' && t.dueAt > at ? { ...t, status: 'suspenso', reason: 'Alta' } : t)),
  }
}

// ======================= Estética: pacotes =======================
export function packageState(p: AestheticPackage, today: CivilDate) {
  const done = p.sessions.length
  const remaining = Math.max(0, p.sessionsTotal - done)
  const expired = p.validUntil < today
  const expiringSoon = !expired && p.validUntil <= addDaysCivil(today, 30)
  return { done, remaining, expired, expiringSoon, complete: remaining === 0 }
}

export function addPackageSession(p: AestheticPackage, s: AestheticPackage['sessions'][number], today: CivilDate): AestheticPackage {
  const st = packageState(p, today)
  if (p.status === 'cancelado') throw new Error('Pacote cancelado.')
  if (st.expired) throw new Error('Pacote com validade contratual vencida. Renove ou registre exceção com a gestão.')
  if (st.complete) throw new Error('Todas as sessões previstas já foram realizadas.')
  const sessions = [...p.sessions, s]
  return { ...p, sessions, status: sessions.length >= p.sessionsTotal ? 'concluido' : 'ativo' }
}

// ======================= Nutrição: comparação =======================
export function bmi(weightKg: number, heightCm: number): number {
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10
}
export function diffAssessments(a: NutritionAssessment, b: NutritionAssessment) {
  const rows: { label: string; unit: string; before?: number; after?: number }[] = [
    { label: 'Peso', unit: 'kg', before: a.weightKg, after: b.weightKg },
    { label: 'IMC (cálculo)', unit: 'kg/m²', before: bmi(a.weightKg, a.heightCm), after: bmi(b.weightKg, b.heightCm) },
    { label: 'Cintura', unit: 'cm', before: a.waistCm, after: b.waistCm },
    { label: 'Quadril', unit: 'cm', before: a.hipCm, after: b.hipCm },
    { label: 'Braço', unit: 'cm', before: a.armCm, after: b.armCm },
    { label: '% gordura (informado)', unit: '%', before: a.bodyFatPct, after: b.bodyFatPct },
  ]
  return rows.map((r) => ({ ...r, delta: r.before != null && r.after != null ? Math.round((r.after - r.before) * 10) / 10 : undefined }))
}
