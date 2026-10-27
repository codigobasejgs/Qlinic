// CRM: etapas configuráveis por tenant, movimentação com motivo de perda obrigatório, conversão em paciente,
// relacionamento (NPS/indicação) com opt-out e limite de frequência. Nunca diagnóstico em dados comerciais.
import type { Lead, LeadStage } from '@/domain/modules'
import type { ID } from '@/domain/types'
import { db } from '@/data/store'
import { audit, patientRepo } from '@/data/repositories'
import { nowISO } from '@/lib/dates'
import { uid } from '@/lib/util'
import type { CrmStageConfig, RelationshipMessage } from './types'

export const STAGES: { stage: LeadStage; label: string }[] = [
  { stage: 'novo', label: 'Novo contato' }, { stage: 'qualificacao', label: 'Qualificação' }, { stage: 'agendamento', label: 'Agendamento' },
  { stage: 'avaliacao', label: 'Avaliação' }, { stage: 'proposta', label: 'Proposta' }, { stage: 'negociacao', label: 'Negociação' },
  { stage: 'convertido', label: 'Convertido' }, { stage: 'perdido', label: 'Perdido' },
]
export const SOURCE_LABEL: Record<Lead['source'], string> = { site: 'Site', indicacao: 'Indicação', instagram: 'Instagram', whatsapp: 'WhatsApp', google: 'Google', evento: 'Evento', outro: 'Outro' }

/** Termos que indicam condição de saúde — bloqueados no campo "interesse" comercial (heurística de proteção). */
const HEALTH_TERMS = /\b(diagn[oó]stic|doen[cç]a|depress|ansiedade|c[aâ]ncer|diabet|hipertens|hiv|gravidez|gestante|transtorno|s[ií]ndrome|cid\b|tumor|infec[cç])/i
export function validateInterest(text: string): string | null {
  if (!text.trim()) return 'Informe o interesse comercial (ex.: "clareamento", "avaliação de implante").'
  if (HEALTH_TERMS.test(text)) return 'Não registre condição de saúde/diagnóstico no CRM. Use apenas o interesse comercial (serviço desejado).'
  return null
}

export function stageConfig(configs: CrmStageConfig[]) {
  return STAGES.map((s, i) => {
    const c = configs.find((x) => x.stage === s.stage)
    return { stage: s.stage, label: c?.label || s.label, hidden: c?.hidden ?? false, order: c?.order ?? i, id: c?.id }
  }).sort((a, b) => a.order - b.order)
}

export function moveLead(tenantId: ID, id: ID, to: LeadStage, by: string, lostReason?: string, labelOf: (s: LeadStage) => string = (s) => s) {
  return db.update(tenantId, 'leads', id, (l) => {
    if (l.stage === to) return l
    if (to === 'perdido' && !lostReason?.trim()) throw new Error('Motivo de perda é obrigatório.')
    if (to === 'convertido' && !l.patientId) throw new Error('Converta o lead em paciente antes de mover para "Convertido".')
    return { ...l, stage: to, lostReason: to === 'perdido' ? lostReason!.trim() : l.lostReason, history: [...l.history, { at: nowISO(), by, text: `Etapa: ${labelOf(l.stage)} → ${labelOf(to)}${to === 'perdido' ? ` (motivo: ${lostReason})` : ''}` }] }
  }) as Lead
}

export function convertLead(tenantId: ID, id: ID, unitId: ID, by: string) {
  const l = db.get(tenantId, 'leads', id)
  if (!l) throw new Error('Lead não encontrado.')
  if (l.patientId) throw new Error('Lead já convertido.')
  const dups = patientRepo.findDuplicates(tenantId, { name: l.name, phone: l.phone })
  const patient = dups[0] ?? patientRepo.create(tenantId, {
    kind: 'human', name: l.name, phone: l.phone, email: l.email, allergies: [], clinicalAlerts: [], tags: ['Origem CRM'], unitId, status: 'ativo', pendingDocuments: [], sharing: { portal: true, multidisciplinar: false },
  })
  const upd = db.update(tenantId, 'leads', id, { patientId: patient.id, stage: 'convertido', history: [...l.history, { at: nowISO(), by, text: dups[0] ? `Vinculado a paciente existente (possível duplicidade): ${patient.name}` : `Convertido em paciente: ${patient.name}` }] }) as Lead
  audit(tenantId, { actorId: by, actorName: by, action: 'crm.convertido', resource: 'leads', resourceId: id, detail: patient.id })
  return { lead: upd, patient, reused: !!dups[0] }
}

/** Limite de frequência: 1 pesquisa NPS por paciente a cada 90 dias; convites de indicação a cada 180 dias. */
export const FREQ_DAYS: Record<RelationshipMessage['kind'], number> = { nps: 90, indicacao: 180 }
export function canSendRelationship(msgs: RelationshipMessage[], patientId: ID, kind: RelationshipMessage['kind'], optOut: boolean, now = Date.now()): { ok: boolean; reason?: string } {
  if (optOut) return { ok: false, reason: 'Paciente optou por não receber mensagens de relacionamento.' }
  const last = msgs.filter((m) => m.patientId === patientId && m.kind === kind).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0]
  if (last && now - new Date(last.sentAt).getTime() < FREQ_DAYS[kind] * 86400000) return { ok: false, reason: `Limite de frequência: já enviado em ${new Date(last.sentAt).toLocaleDateString('pt-BR')} (1 a cada ${FREQ_DAYS[kind]} dias).` }
  return { ok: true }
}

export function npsScore(msgs: RelationshipMessage[]) {
  const s = msgs.filter((m) => m.kind === 'nps' && m.score != null).map((m) => m.score!)
  if (!s.length) return { nps: null as number | null, n: 0, promoters: 0, detractors: 0 }
  const promoters = s.filter((x) => x >= 9).length, detractors = s.filter((x) => x <= 6).length
  return { nps: Math.round(((promoters - detractors) / s.length) * 100), n: s.length, promoters, detractors }
}

export function newLeadDraft(tenantId: ID): Lead {
  return { id: uid('lead_'), tenantId, createdAt: nowISO(), name: '', source: 'site', stage: 'novo', interest: '', tasks: [], history: [], optOut: false }
}
