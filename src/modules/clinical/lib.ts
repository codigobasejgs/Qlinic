// Casos de uso do módulo clínico (sem React). Usados pelas páginas e testados em clinical.test.ts.
import type { ClinicDocument, ClinicalRecord, FileAsset, ID, LinkRelation, Patient, PatientLink, Person, RecordStatus, Segment, SignatureFlow } from '@/domain/types'
import type { FormResponse, FormTemplate } from '@/domain/modules'
import { db } from '@/data/store'
import { audit, clinicalRepo, documentRepo, notificationProvider, patientRepo } from '@/data/repositories'
import { emit } from '@/data/events'
import { nowISO, addMinutes } from '@/lib/dates'
import { uid, isValidCPF } from '@/lib/util'
import { TRANSCRIPT_FIXTURES, type RecordTemplate, validateRecordContent } from './templates'
import type { Dictation, PatientMerge } from './types'
import './types'

export interface Actor { id: ID; name: string }

// ---------------- Pacientes ----------------
export const RELATION_LABEL: Record<LinkRelation, string> = { self: 'Próprio paciente', tutor: 'Tutor', responsavel_legal: 'Responsável legal', responsavel_financeiro: 'Responsável financeiro' }

export interface PatientInput {
  kind: Patient['kind']
  name: string; socialName?: string; birthDate?: string; birthDateEstimated?: boolean; sex?: Patient['sex']
  cpf?: string; phone?: string; email?: string
  species?: string; breed?: string; coat?: string; microchip?: string
  insurance?: Patient['insurance']
  tags: string[]; unitId: ID; status: Patient['status']
  sharing: Patient['sharing']
}
export interface ResponsibleInput {
  personId?: ID
  newPerson?: { name: string; cpf?: string; phone?: string; email?: string }
  relation: Exclude<LinkRelation, 'self'>
  canSeeClinical: boolean; canSeeFinancial: boolean; canSchedule: boolean
}

/** Validação de cadastro (trust boundary do formulário). CPF opcional, mas se informado precisa ser válido. */
export function validatePatient(p: PatientInput, today: string): Record<string, string> {
  const e: Record<string, string> = {}
  if (p.name.trim().length < 2) e.name = 'Informe o nome.'
  if (p.cpf && !isValidCPF(p.cpf)) e.cpf = 'CPF inválido (verifique os dígitos).'
  if (p.birthDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate)) e.birthDate = 'Data inválida.'
    else if (p.birthDate > today) e.birthDate = 'Data de nascimento no futuro.'
    else if (p.birthDate < '1900-01-01') e.birthDate = 'Data muito antiga.'
  }
  if (p.phone && p.phone.replace(/\D/g, '').length < 10) e.phone = 'Telefone incompleto.'
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) e.email = 'E-mail inválido.'
  if (p.kind === 'animal' && !p.species?.trim()) e.species = 'Informe a espécie.'
  if (p.insurance && (!p.insurance.name.trim() || !p.insurance.cardNumber.trim())) e.insurance = 'Informe convênio e número da carteirinha (ou remova o convênio).'
  return e
}

/** Pares já revisados como "manter separados" não voltam a ser sugeridos. */
export function filterReviewed(tenantId: ID, selfId: ID | undefined, dups: Patient[]): Patient[] {
  const merges = db.list(tenantId, 'patientMerges')
  return dups.filter((d) => d.id !== selfId && d.status === 'ativo' && !merges.some((m) => m.kind === 'separados' && selfId && ((m.keepId === selfId && m.dupId === d.id) || (m.keepId === d.id && m.dupId === selfId))))
}

export function createPatient(tenantId: ID, input: PatientInput, opts: { selfPortal: boolean; communication: Person['communication']; responsibles: ResponsibleInput[]; duplicateOf?: ID[] }, actor: Actor): Patient {
  const at = nowISO()
  let personId: ID | undefined
  if (opts.selfPortal && input.kind === 'human') {
    personId = uid('per_')
    db.insert(tenantId, 'persons', { id: personId, tenantId, createdAt: at, name: input.name.trim(), cpf: input.cpf || undefined, birthDate: input.birthDate || undefined, phone: input.phone || undefined, email: input.email || undefined, communication: opts.communication })
  }
  const p = patientRepo.create(tenantId, {
    ...input, name: input.name.trim(), cpf: input.cpf || undefined, phone: input.phone || undefined, email: input.email || undefined, birthDate: input.birthDate || undefined,
    personId, allergies: [], clinicalAlerts: [], pendingDocuments: [], duplicateOf: opts.duplicateOf?.length ? opts.duplicateOf : undefined,
    weights: input.kind === 'animal' ? [] : undefined,
  })
  if (personId) db.insert(tenantId, 'links', { id: uid('lk_'), tenantId, createdAt: at, patientId: p.id, personId, relation: 'self', canSeeClinical: true, canSeeFinancial: true, canSchedule: true })
  opts.responsibles.forEach((r) => addResponsible(tenantId, p.id, r, opts.communication))
  audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'paciente.criado', resource: 'patients', resourceId: p.id, unitId: p.unitId, detail: opts.duplicateOf?.length ? 'Salvo com possível duplicidade — enviado para revisão' : undefined })
  return p
}

export function addResponsible(tenantId: ID, patientId: ID, r: ResponsibleInput, communication: Person['communication']): PatientLink {
  let personId = r.personId
  if (!personId) {
    if (!r.newPerson || r.newPerson.name.trim().length < 2) throw new Error('Informe o nome do responsável.')
    if (r.newPerson.cpf && !isValidCPF(r.newPerson.cpf)) throw new Error('CPF do responsável inválido.')
    personId = uid('per_')
    db.insert(tenantId, 'persons', { id: personId, tenantId, createdAt: nowISO(), name: r.newPerson.name.trim(), cpf: r.newPerson.cpf || undefined, phone: r.newPerson.phone || undefined, email: r.newPerson.email || undefined, communication })
  }
  const dup = db.list(tenantId, 'links').find((l) => l.patientId === patientId && l.personId === personId && l.relation === r.relation)
  if (dup) throw new Error('Este vínculo já existe.')
  return db.insert(tenantId, 'links', { id: uid('lk_'), tenantId, createdAt: nowISO(), patientId, personId, relation: r.relation, canSeeClinical: r.canSeeClinical, canSeeFinancial: r.canSeeFinancial, canSchedule: r.canSchedule }) as PatientLink
}

/** Campos mescláveis (identificação/contato). Clínicos (alergias/alertas) são UNIDOS, nunca descartados. */
export const MERGE_FIELDS: { key: keyof Patient; label: string }[] = [
  { key: 'name', label: 'Nome' }, { key: 'socialName', label: 'Nome social' }, { key: 'birthDate', label: 'Nascimento' }, { key: 'sex', label: 'Sexo' },
  { key: 'cpf', label: 'CPF' }, { key: 'phone', label: 'Telefone' }, { key: 'email', label: 'E-mail' }, { key: 'unitId', label: 'Unidade' },
  { key: 'species', label: 'Espécie' }, { key: 'breed', label: 'Raça' }, { key: 'microchip', label: 'Microchip' },
]

/** Coleções com patientId reatribuídas ao cadastro mantido. */
const PATIENT_REF_COLLECTIONS = ['appointments', 'records', 'documents', 'files', 'charges', 'proposals', 'treatmentItems', 'waitlist', 'formResponses', 'anamneses', 'vaccines', 'exercisePlans', 'nutritionPlans', 'aestheticPackages'] as const

/** Mesclagem MANUAL: só após escolha campo a campo e confirmação. Duplicado fica inativo (não apagado) e com trilha. */
export function mergePatients(tenantId: ID, keepId: ID, dupId: ID, fromDup: (keyof Patient)[], actor: Actor, reason?: string): Patient {
  if (keepId === dupId) throw new Error('Selecione cadastros diferentes.')
  const keep = db.get(tenantId, 'patients', keepId)
  const dup = db.get(tenantId, 'patients', dupId)
  if (!keep || !dup) throw new Error('Cadastro não encontrado nesta organização.')
  if (keep.tenantId !== dup.tenantId) throw new Error('Não é permitido mesclar cadastros de organizações diferentes.')
  const patch: Partial<Patient> = {}
  for (const k of fromDup) (patch as Record<string, unknown>)[k] = dup[k]
  patch.allergies = Array.from(new Set([...keep.allergies, ...dup.allergies]))
  patch.clinicalAlerts = Array.from(new Set([...keep.clinicalAlerts, ...dup.clinicalAlerts]))
  patch.tags = Array.from(new Set([...keep.tags, ...dup.tags.filter((t) => t !== 'Importado')]))
  patch.duplicateOf = undefined
  const merged = patientRepo.update(tenantId, keepId, patch)
  for (const col of PATIENT_REF_COLLECTIONS) {
    const list = db.list(tenantId, col) as { patientId?: ID }[]
    if (list.some((x) => x.patientId === dupId)) db.set(tenantId, col, list.map((x) => (x.patientId === dupId ? { ...x, patientId: keepId } : x)) as never)
  }
  const links = db.list(tenantId, 'links')
  db.set(tenantId, 'links', links.filter((l) => !(l.patientId === dupId && links.some((k) => k.patientId === keepId && k.personId === l.personId && k.relation === l.relation))).map((l) => (l.patientId === dupId ? { ...l, patientId: keepId } : l)))
  patientRepo.update(tenantId, dupId, { status: 'inativo', duplicateOf: undefined, tags: [...dup.tags, `Mesclado em ${keep.name}`] })
  db.insert(tenantId, 'patientMerges', { id: uid('mg_'), tenantId, createdAt: nowISO(), kind: 'mesclado', keepId, dupId, by: actor.name, reason, fieldsFromDup: fromDup } satisfies PatientMerge)
  audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'paciente.mesclado', resource: 'patients', resourceId: keepId, detail: `Cadastro ${dupId} mesclado manualmente. Campos do duplicado: ${fromDup.join(', ') || 'nenhum'}.${reason ? ` Motivo: ${reason}` : ''}` })
  return merged
}

export function keepSeparate(tenantId: ID, dupId: ID, otherId: ID, actor: Actor, reason?: string) {
  const dup = db.get(tenantId, 'patients', dupId)
  if (!dup) throw new Error('Cadastro não encontrado.')
  const rest = (dup.duplicateOf ?? []).filter((x) => x !== otherId)
  patientRepo.update(tenantId, dupId, { duplicateOf: rest.length ? rest : undefined })
  db.insert(tenantId, 'patientMerges', { id: uid('mg_'), tenantId, createdAt: nowISO(), kind: 'separados', keepId: otherId, dupId, by: actor.name, reason, fieldsFromDup: [] } satisfies PatientMerge)
  audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'paciente.duplicidade_descartada', resource: 'patients', resourceId: dupId, detail: `Mantidos separados de ${otherId}.${reason ? ` Motivo: ${reason}` : ''}` })
}

// ---------------- Arquivos ----------------
export const FILE_CATEGORY_LABEL: Record<FileAsset['category'], string> = {
  exame: 'Exame', imagem_intraoral: 'Imagem intraoral', radiografia: 'Radiografia', foto_clinica: 'Foto clínica', antes_depois: 'Antes/depois', documento: 'Documento', outro: 'Outro',
}
export const FILE_ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']

/** Original guardado como recebido (sem recompressão). Miniatura = referência ao original nesta fase. */
export function addFile(tenantId: ID, patientId: ID, f: { name: string; mime: string; size: number; dataUrl: string }, category: FileAsset['category'], restricted: boolean, actor: Actor): FileAsset {
  if (!FILE_ACCEPT.includes(f.mime)) throw new Error('Tipo de arquivo não permitido.')
  const at = nowISO()
  const asset: FileAsset = { id: uid('fl_'), tenantId, createdAt: at, patientId, category, name: f.name, mime: f.mime, sizeBytes: f.size, restricted, versions: [{ version: 1, at, by: actor.name, dataUrl: f.dataUrl, note: 'Original' }], thumbnailUrl: f.mime.startsWith('image/') ? f.dataUrl : undefined }
  db.insert(tenantId, 'files', asset)
  audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'arquivo.enviado', resource: 'files', resourceId: asset.id, detail: `${FILE_CATEGORY_LABEL[category]} · ${f.name}` })
  return asset
}
/** Substituição versionada: nova versão no topo, anteriores preservadas. */
export function replaceFile(tenantId: ID, fileId: ID, f: { name: string; mime: string; size: number; dataUrl: string }, note: string, actor: Actor): FileAsset {
  if (!FILE_ACCEPT.includes(f.mime)) throw new Error('Tipo de arquivo não permitido.')
  if (!note.trim()) throw new Error('Informe o motivo da substituição.')
  const r = db.update(tenantId, 'files', fileId, (prev) => {
    const version = Math.max(...prev.versions.map((v) => v.version)) + 1
    return { ...prev, name: f.name, mime: f.mime, sizeBytes: f.size, thumbnailUrl: f.mime.startsWith('image/') ? f.dataUrl : undefined, versions: [...prev.versions, { version, at: nowISO(), by: actor.name, dataUrl: f.dataUrl, note: note.trim() }] }
  }) as FileAsset
  audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'arquivo.substituido', resource: 'files', resourceId: fileId, detail: `Versão ${r.versions.length}: ${note.trim()}` })
  return r
}

// ---------------- Registro clínico ----------------
export function newRecord(tenantId: ID, o: { patientId: ID; appointmentId?: ID; professionalId: ID; segment: Segment; template: RecordTemplate; content: Record<string, unknown>; portalGuidance?: string; releasedToPortal: boolean }, actor: Actor): ClinicalRecord {
  const at = nowISO()
  return clinicalRepo.save(tenantId, {
    id: uid('rec_'), tenantId, createdAt: at, patientId: o.patientId, appointmentId: o.appointmentId, professionalId: o.professionalId, specialty: o.segment,
    templateId: o.template.id, templateVersion: o.template.version, title: o.template.title, content: o.content, status: 'rascunho', addenda: [],
    confidentiality: o.template.restricted ? 'restrito' : 'padrao', portalGuidance: o.portalGuidance, releasedToPortal: o.releasedToPortal,
    history: [{ at, from: null, to: 'rascunho', by: actor.name }],
  })
}

/** Salva conteúdo e (opcional) muda estado. Finalizado é bloqueado pelo repositório. */
export function saveRecord(tenantId: ID, rec: ClinicalRecord, patch: Pick<ClinicalRecord, 'content' | 'portalGuidance' | 'releasedToPortal'>, actor: Actor, to?: Exclude<RecordStatus, 'finalizado'>, tpl?: RecordTemplate): ClinicalRecord {
  if (to === 'revisado' && tpl) {
    const errs = validateRecordContent(tpl, patch.content)
    if (Object.keys(errs).length) throw new Error('Preencha os campos obrigatórios antes de marcar como revisado.')
  }
  const status = to ?? rec.status
  return clinicalRepo.save(tenantId, { ...rec, ...patch, status, history: to && to !== rec.status ? [...rec.history, { at: nowISO(), from: rec.status, to, by: actor.name }] : rec.history })
}

/** Finalização: valida schema, salva o último conteúdo, finaliza (imutável) e emite evento. */
export function finalizeRecord(tenantId: ID, rec: ClinicalRecord, patch: Pick<ClinicalRecord, 'content' | 'portalGuidance' | 'releasedToPortal'>, tpl: RecordTemplate, actor: Actor): ClinicalRecord {
  const errs = validateRecordContent(tpl, patch.content)
  if (Object.keys(errs).length) throw new Error('Há campos obrigatórios ou inválidos. Revise antes de finalizar.')
  if (rec.status !== 'finalizado') clinicalRepo.save(tenantId, { ...rec, ...patch })
  const fin = clinicalRepo.finalize(tenantId, rec.id, actor.name)
  audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'registro.finalizado', resource: 'records', resourceId: rec.id })
  emit('record.finalized', { tenantId, recordId: fin.id, patientId: fin.patientId })
  return fin
}

export function addAddendum(tenantId: ID, recId: ID, reason: string, text: string, actor: Actor): ClinicalRecord {
  const r = clinicalRepo.addAddendum(tenantId, recId, { authorId: actor.id, authorName: actor.name, reason: reason.trim(), text: text.trim() })
  audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'registro.adendo', resource: 'records', resourceId: recId, detail: reason.trim() })
  return r
}

// ---------------- Ditado SIMULADO ----------------
export const RETENTION_LABEL: Record<Dictation['retention'], string> = { apos_revisao: 'Excluir áudio após revisão de todos os trechos', '7_dias': 'Manter áudio por 7 dias', '30_dias': 'Manter áudio por 30 dias' }
export const ORIGIN_LABEL: Record<Dictation['origin'], string> = { microfone_consultorio: 'Microfone do consultório', dispositivo_profissional: 'Dispositivo do profissional', teleconsulta: 'Teleconsulta' }

export function startDictation(tenantId: ID, o: { appointmentId: ID; patientId: ID; origin: Dictation['origin']; retention: Dictation['retention']; consentStatement: string }, actor: Actor): Dictation {
  if (!o.consentStatement.trim()) throw new Error('Registre o consentimento antes de gravar.')
  const active = db.list(tenantId, 'dictations').find((d) => d.appointmentId === o.appointmentId && d.status !== 'encerrado')
  if (active) throw new Error('Já existe uma gravação em andamento neste atendimento.')
  const at = nowISO()
  const d: Dictation = { id: uid('dic_'), tenantId, createdAt: at, appointmentId: o.appointmentId, patientId: o.patientId, consent: { at, by: actor.name, statement: o.consentStatement.trim() }, origin: o.origin, retention: o.retention, status: 'gravando', startedAt: at, resumedAt: at, elapsedSec: 0, segments: [] }
  db.insert(tenantId, 'dictations', d)
  audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'gravacao.iniciada', resource: 'dictations', resourceId: d.id, detail: `Consentimento: ${o.consentStatement.trim()}` })
  return d
}
export function dictationElapsed(d: Dictation, nowMs = Date.now()): number {
  return d.elapsedSec + (d.status === 'gravando' && d.resumedAt ? Math.max(0, Math.round((nowMs - new Date(d.resumedAt).getTime()) / 1000)) : 0)
}
export function pauseDictation(tenantId: ID, id: ID): Dictation {
  return db.update(tenantId, 'dictations', id, (d) => (d.status !== 'gravando' ? d : { ...d, status: 'pausado', elapsedSec: dictationElapsed(d), resumedAt: undefined })) as Dictation
}
export function resumeDictation(tenantId: ID, id: ID): Dictation {
  return db.update(tenantId, 'dictations', id, (d) => (d.status !== 'pausado' ? d : { ...d, status: 'gravando', resumedAt: nowISO() })) as Dictation
}
/** Encerra e gera transcrição DETERMINÍSTICA (fixture) como sugestões pendentes. */
export function stopDictation(tenantId: ID, id: ID, segment: Segment, actor: Actor): Dictation {
  const d = db.update(tenantId, 'dictations', id, (prev) => {
    if (prev.status === 'encerrado') return prev
    const dur = Math.max(1, dictationElapsed(prev))
    const keepDays = prev.retention === '7_dias' ? 7 : prev.retention === '30_dias' ? 30 : undefined
    return {
      ...prev, status: 'encerrado', elapsedSec: dur, resumedAt: undefined,
      audio: { durationSec: dur, sizeKb: dur * 16, deleteAfter: keepDays ? addMinutes(nowISO(), keepDays * 1440) : undefined },
      segments: TRANSCRIPT_FIXTURES[segment].map((s) => ({ id: uid('seg_'), field: s.field, text: s.text, status: 'pendente' as const })),
    }
  }) as Dictation
  audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'gravacao.encerrada', resource: 'dictations', resourceId: id, detail: `${d.elapsedSec}s · transcrição simulada gerada como sugestão` })
  return d
}
export function deleteDictationAudio(tenantId: ID, id: ID, actor: Actor, why: string): Dictation {
  const d = db.update(tenantId, 'dictations', id, (prev) => (prev.audioDeletedAt ? prev : { ...prev, audioDeletedAt: nowISO(), audioDeletedBy: actor.name })) as Dictation
  audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'gravacao.audio_excluido', resource: 'dictations', resourceId: id, detail: why })
  return d
}
/** Decide um trecho. Retorna o ditado atualizado; política 'apos_revisao' exclui o áudio quando todos foram decididos. */
export function decideSegment(tenantId: ID, id: ID, segId: ID, accept: boolean, actor: Actor): Dictation {
  let d = db.update(tenantId, 'dictations', id, (prev) => ({ ...prev, segments: prev.segments.map((s) => (s.id === segId && s.status === 'pendente' ? { ...s, status: accept ? 'aceito' as const : 'descartado' as const, decidedAt: nowISO(), decidedBy: actor.name } : s)) })) as Dictation
  if (d.retention === 'apos_revisao' && !d.audioDeletedAt && d.segments.every((s) => s.status !== 'pendente')) d = deleteDictationAudio(tenantId, id, actor, 'Política: excluir após revisão de todos os trechos')
  return d
}
/** Acrescenta texto aceito ao campo (nunca substitui o que o profissional escreveu). */
export function appendToField(content: Record<string, unknown>, field: string, text: string): Record<string, unknown> {
  const cur = String(content[field] ?? '').trim()
  return { ...content, [field]: cur ? `${cur}\n${text}` : text }
}

// ---------------- Documentos ----------------
export function newSignatureFlow(): SignatureFlow {
  return { status: 'nao_requerida', provider: 'demonstracao', signers: [], trail: [{ at: nowISO(), event: 'Documento criado (demonstração)' }] }
}
export function requestSignatures(doc: ClinicDocument, signers: { name: string; role: string }[], expiresAt: string | undefined): ClinicDocument {
  if (doc.status !== 'emitido') throw new Error('Emita o documento antes de solicitar assinaturas.')
  const clean = signers.filter((s) => s.name.trim())
  if (!clean.length) throw new Error('Adicione ao menos um signatário.')
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) throw new Error('A expiração deve ser futura.')
  return { ...doc, signature: { ...doc.signature, status: 'pendente', signers: clean.map((s, i) => ({ name: s.name.trim(), role: s.role.trim() || 'Signatário', order: i + 1, status: 'pendente' })), expiresAt, trail: [...doc.signature.trail, { at: nowISO(), event: `Assinaturas solicitadas (${clean.length}, em ordem)${expiresAt ? ` · expira ${expiresAt.slice(0, 10)}` : ''}` }] } }
}
/** Assina/recusa respeitando a ORDEM (só o próximo pendente pode agir). Expirado bloqueia. */
export function signerAct(doc: ClinicDocument, order: number, act: 'assinar' | 'recusar', detail: { method?: 'rubrica_demo' | 'aceite_demo'; reason?: string }): ClinicDocument {
  const s = doc.signature
  if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) return { ...doc, signature: { ...s, status: 'expirado', trail: [...s.trail, { at: nowISO(), event: 'Fluxo expirado' }] } }
  if (s.status !== 'pendente' && s.status !== 'parcial') throw new Error('Fluxo de assinatura não está aberto.')
  const next = s.signers.filter((x) => x.status === 'pendente').sort((a, b) => a.order - b.order)[0]
  if (!next || next.order !== order) throw new Error('Aguarde a vez deste signatário (ordem definida).')
  if (act === 'recusar' && !detail.reason?.trim()) throw new Error('Informe o motivo da recusa.')
  const at = nowISO()
  const signers = s.signers.map((x) => (x.order === order ? { ...x, status: act === 'assinar' ? 'assinado' as const : 'recusado' as const, at, method: detail.method } : x))
  const status: SignatureFlow['status'] = act === 'recusar' ? 'recusado' : signers.every((x) => x.status === 'assinado') ? 'assinado' : 'parcial'
  return { ...doc, signature: { ...s, signers, status, trail: [...s.trail, { at, event: act === 'assinar' ? `${next.name} assinou (${detail.method === 'rubrica_demo' ? 'rubrica' : 'aceite'} demonstrativo)` : `${next.name} recusou: ${detail.reason!.trim()}` }] } }
}
export function expireFlow(doc: ClinicDocument): ClinicDocument {
  if (doc.signature.status !== 'pendente' && doc.signature.status !== 'parcial') throw new Error('Não há fluxo aberto.')
  return { ...doc, signature: { ...doc.signature, status: 'expirado', expiresAt: nowISO(), trail: [...doc.signature.trail, { at: nowISO(), event: 'Fluxo expirado (simulação)' }] } }
}

/** Destinatários do aviso: o próprio paciente (pessoa) ou responsáveis com permissão clínica. */
export function portalRecipients(tenantId: ID, patientId: ID): Person[] {
  const p = db.get(tenantId, 'patients', patientId)
  const links = db.list(tenantId, 'links').filter((l) => l.patientId === patientId && l.canSeeClinical)
  const ids = new Set([...(p?.personId ? [p.personId] : []), ...links.map((l) => l.personId)])
  return db.list(tenantId, 'persons').filter((x) => ids.has(x.id))
}

/** Libera ao portal de forma EXPLÍCITA: evento + aviso com link, SEM conteúdo clínico na mensagem. */
export function releaseDocument(tenantId: ID, doc: ClinicDocument, orgSlug: string, actor: Actor): { doc: ClinicDocument; notified: number } {
  if (doc.status !== 'emitido') throw new Error('Somente documentos emitidos podem ser liberados ao portal.')
  const p = db.get(tenantId, 'patients', doc.patientId)
  if (p && !p.sharing.portal) throw new Error('O compartilhamento com o portal está desativado no cadastro deste paciente.')
  const saved = documentRepo.save(tenantId, { ...doc, releasedToPortal: true, signature: { ...doc.signature, trail: [...doc.signature.trail, { at: nowISO(), event: `Liberado ao portal por ${actor.name}` }] } })
  emit('document.released', { tenantId, documentId: doc.id, patientId: doc.patientId })
  let notified = 0
  for (const person of portalRecipients(tenantId, doc.patientId)) {
    for (const channel of ['email', 'whatsapp'] as const) {
      const m = notificationProvider.enqueue(tenantId, { event: 'documento_disponivel', channel, recipientName: person.name, recipientRef: person.id, subject: 'Novo documento disponível', preview: 'Há um novo documento disponível no portal. Acesse para visualizar.', dedupeKey: `documento_disponivel:${doc.id}:${person.id}:${channel}`, link: `/c/${orgSlug}/portal/documentos` })
      if (m.status === 'pendente') notified++
    }
  }
  audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'documento.liberado', resource: 'documents', resourceId: doc.id })
  return { doc: saved, notified }
}

// ---------------- Formulários ----------------
export function sendForm(tenantId: ID, tpl: FormTemplate, patientId: ID, actor: Actor, appointmentId?: ID): FormResponse {
  if (!tpl.active) throw new Error('Formulário inativo.')
  if (!tpl.versions.some((v) => v.version === tpl.currentVersion && v.publishedAt)) throw new Error('Publique uma versão antes de enviar.')
  const pending = db.list(tenantId, 'formResponses').find((r) => r.templateId === tpl.id && r.patientId === patientId && r.status === 'pendente')
  if (pending) throw new Error('Já existe um envio pendente deste formulário para o paciente.')
  const r: FormResponse = { id: uid('fr_'), tenantId, createdAt: nowISO(), templateId: tpl.id, templateVersion: tpl.currentVersion, patientId, appointmentId, answers: {}, submittedBy: 'paciente', status: 'pendente' }
  db.insert(tenantId, 'formResponses', r)
  audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'formulario.enviado', resource: 'formResponses', resourceId: r.id, detail: `${tpl.name} v${tpl.currentVersion}` })
  return r
}
