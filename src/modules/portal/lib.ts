// Regras puras do portal (sem React/window) — testadas em lib.test.ts.
// Visibilidade aqui é DEMONSTRATIVA: em produção o servidor (RLS + autorização) é quem filtra.
import type { Appointment, AppointmentStatus, ClinicDocument, ClinicalRecord, ID, PatientLink, Proposal, ProposalItem } from '@/domain/types'
import type { FormField } from '@/domain/modules'

// ---------- Janela de cancelamento/reagendamento ----------
/** Status que o paciente ainda pode alterar pelo portal. */
export const CHANGEABLE: AppointmentStatus[] = ['solicitada', 'aguardando_confirmacao', 'confirmada']

export interface BookingWindow { cancelWindowHours: number; rescheduleWindowHours: number }
export interface ApptActions {
  hoursUntil: number
  canConfirm: boolean
  canCancel: boolean
  canReschedule: boolean
  cancelBlocked?: string
  rescheduleBlocked?: string
}

export function appointmentActions(a: Pick<Appointment, 'start' | 'status'>, nowMs: number, w: BookingWindow, canSchedule = true): ApptActions {
  const hoursUntil = (new Date(a.start).getTime() - nowMs) / 3_600_000
  const open = CHANGEABLE.includes(a.status) && hoursUntil > 0
  const base = !canSchedule ? 'Seu vínculo não permite alterar consultas deste paciente.' : !open ? 'Esta consulta não pode mais ser alterada pelo portal.' : undefined
  const cancelBlocked = base ?? (hoursUntil < w.cancelWindowHours ? `Cancelamento pelo portal só até ${w.cancelWindowHours} h antes do horário.` : undefined)
  const rescheduleBlocked = base ?? (hoursUntil < w.rescheduleWindowHours ? `Reagendamento pelo portal só até ${w.rescheduleWindowHours} h antes do horário.` : undefined)
  return {
    hoursUntil,
    canConfirm: canSchedule && a.status === 'aguardando_confirmacao' && hoursUntil > 0,
    canCancel: !cancelBlocked, canReschedule: !rescheduleBlocked, cancelBlocked, rescheduleBlocked,
  }
}

// ---------- Visibilidade no portal ----------
export type PortalPerms = Pick<PatientLink, 'canSeeClinical' | 'canSeeFinancial' | 'canSchedule'>
const FINANCIAL_KINDS: ClinicDocument['kind'][] = ['recibo']

/** Só documentos EMITIDOS e explicitamente liberados; recibo exige permissão financeira, os demais, clínica. */
export function portalDocuments(docs: ClinicDocument[], patientId: ID, perms: PortalPerms): ClinicDocument[] {
  return docs.filter((d) => d.patientId === patientId && d.releasedToPortal === true && d.status === 'emitido'
    && (FINANCIAL_KINDS.includes(d.kind) ? perms.canSeeFinancial : perms.canSeeClinical))
}

export interface PortalGuidance { id: ID; at: string; professionalId: ID; text: string }
/** Projeção: devolve SOMENTE o texto de orientação liberado — nunca o conteúdo do registro. Registros restritos nunca aparecem. */
export function portalGuidance(records: ClinicalRecord[], patientId: ID, perms: PortalPerms): PortalGuidance[] {
  if (!perms.canSeeClinical) return []
  return records
    .filter((r) => r.patientId === patientId && r.releasedToPortal === true && r.status === 'finalizado' && r.confidentiality !== 'restrito' && !!r.portalGuidance?.trim())
    .map((r) => ({ id: r.id, at: r.finalizedAt ?? r.createdAt, professionalId: r.professionalId, text: r.portalGuidance!.trim() }))
    .sort((a, b) => b.at.localeCompare(a.at))
}

// ---------- Seleção na proposta ----------
export const isMandatory = (i: ProposalItem) => !i.optional && !i.optionGroup

export function optionGroups(p: Proposal): { group: string; items: ProposalItem[] }[] {
  const out: { group: string; items: ProposalItem[] }[] = []
  for (const i of p.items) if (i.optionGroup) {
    const g = out.find((x) => x.group === i.optionGroup)
    if (g) g.items.push(i); else out.push({ group: i.optionGroup, items: [i] })
  }
  return out
}

/** Seleção inicial: itens obrigatórios + já aceitos. Alternativas ficam para o paciente escolher. */
export function defaultSelection(p: Proposal): ID[] {
  return Array.from(new Set([...p.items.filter(isMandatory).map((i) => i.id), ...p.acceptedItemIds]))
}

/** Rádio por grupo: remove as demais alternativas do grupo e adiciona a escolhida (null = decidir depois). */
export function chooseAlternative(p: Proposal, selected: ID[], group: string, itemId: ID | null): ID[] {
  const inGroup = new Set(p.items.filter((i) => i.optionGroup === group).map((i) => i.id))
  const next = selected.filter((id) => !inGroup.has(id))
  if (itemId && inGroup.has(itemId)) next.push(itemId)
  return next
}

/** Checkbox para itens obrigatórios/opcionais (alternativas usam chooseAlternative). */
export function toggleItem(p: Proposal, selected: ID[], itemId: ID, on: boolean): ID[] {
  const it = p.items.find((i) => i.id === itemId)
  if (!it || it.optionGroup) return selected
  if (!on) return p.acceptedItemIds.includes(itemId) ? selected : selected.filter((id) => id !== itemId)
  return selected.includes(itemId) ? selected : [...selected, itemId]
}

// ---------- Formulários ----------
const BOOL_TRUE = ['true', 'sim', 's', 'yes']
const BOOL_FALSE = ['false', 'nao', 'não', 'n', 'no']

export function isFieldVisible(f: FormField, answers: Record<ID, unknown>): boolean {
  if (!f.showIf) return true
  const v = answers[f.showIf.fieldId]
  const eq = f.showIf.equals.trim().toLowerCase()
  if (Array.isArray(v)) return v.map((x) => String(x).toLowerCase()).includes(eq)
  if (typeof v === 'boolean') return v ? BOOL_TRUE.includes(eq) : BOOL_FALSE.includes(eq)
  return String(v ?? '').trim().toLowerCase() === eq
}

const isEmpty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

/** Erros por campo (somente campos visíveis). */
export function validateForm(fields: FormField[], answers: Record<ID, unknown>): Record<ID, string> {
  const errs: Record<ID, string> = {}
  for (const f of fields) {
    if (f.type === 'section' || !isFieldVisible(f, answers)) continue
    const v = answers[f.id]
    if (f.required && (f.type === 'boolean' ? typeof v !== 'boolean' : isEmpty(v))) { errs[f.id] = f.type === 'boolean' ? 'Responda sim ou não.' : 'Campo obrigatório.'; continue }
    if (f.type === 'number' && !isEmpty(v)) {
      const n = Number(v)
      if (!Number.isFinite(n)) errs[f.id] = 'Informe um número.'
      else if (f.min != null && n < f.min) errs[f.id] = `Valor mínimo: ${f.min}.`
      else if (f.max != null && n > f.max) errs[f.id] = `Valor máximo: ${f.max}.`
    }
  }
  return errs
}

/** Remove respostas de campos ocultos por condição (não envia dado que o paciente não viu). */
export function cleanAnswers(fields: FormField[], answers: Record<ID, unknown>): Record<ID, unknown> {
  const out: Record<ID, unknown> = {}
  for (const f of fields) if (f.type !== 'section' && isFieldVisible(f, answers) && !isEmpty(answers[f.id])) out[f.id] = answers[f.id]
  return out
}
