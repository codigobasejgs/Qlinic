// Casos de uso da contratação SaaS (demonstração local). Produção: os mesmos passos rodam no servidor
// (snapshot, PDF, hash, envelope, webhooks verificados, cobrança) — ver docs/contratacao/MODELO_SUPABASE.md.
import './seed'
import { db, platformDb } from '@/data/store'
import {
  applyEnvelopeEvent, applyPaymentEvent, buildOffer, canActivate, contractStatusFromEnvelope, findPlaceholders, renderContract, selfSignatory, snapshotHash, validateParties,
  type Acceptances, type CommercialTerms, type ContractorParty, type ContractorSignatory, type ContractTemplateVersion, type EnvelopeEvent, type LegalProfile, type PaymentEventType, type SaasContract, type SignatureEnvelope,
} from '@/domain/contracts'
import { CYCLE_MONTHS, type BillingCycle } from '@/domain/platform'
import { createTrialOrganization, slugify, validateSlug } from '@/domain/tenancy'
import { getSimScenario } from '@/domain/payments'
import { isConnectedEnv } from '@/lib/env'
import { addDaysCivil, nowISO, todayCivil } from '@/lib/dates'
import { sha256Hex } from '@/lib/sha256'
import { uid } from '@/lib/util'
import { cancelSubscription, changeCycle, changePlan, logAudit, type Actor } from '@/modules/platform/actions'
import { nextInvoiceNumber } from '@/modules/platform/metrics'
import { saveProfile } from '@/modules/settings/lib'
import { signatureProvider } from './signature'

const SYS: Actor = { id: 'sistema', name: 'Sistema (simulação)' }
export const contractorActor = (draftKey: string): Actor => ({ id: draftKey, name: 'Contratante (simulação)' })

export const legalProfile = (): LegalProfile => { const p = platformDb.list('legalProfile')[0]; if (!p) throw new Error('Cadastro da contratada ausente.'); return p }
export const currentTerms = (): CommercialTerms => platformDb.list('commercialTerms').reduce((a, b) => (b.version > a.version ? b : a))
/** Modelo vigente: publicado; sem publicação, a minuta mais recente (identificada como minuta). */
export function currentTemplate(): ContractTemplateVersion {
  const all = platformDb.list('contractTemplates')
  return all.find((t) => t.status === 'publicado') ?? all.reduce((a, b) => (b.version > a.version ? b : a))
}
export const getContract = (id: string) => { const c = platformDb.list('saasContracts').find((x) => x.id === id); if (!c) throw new Error('Contrato não encontrado.'); return c }
const getEnvelope = (id?: string) => platformDb.list('signatureEnvelopes').find((x) => x.id === id)
const plan = (id: string) => { const p = platformDb.list('plans').find((x) => x.id === id && x.active); if (!p) throw new Error('Plano indisponível.'); return p }

function patch(id: string, p: Partial<SaasContract>, event?: { type: string; detail: string; by: string }) {
  platformDb.update('saasContracts', id, (c: SaasContract) => ({ ...c, ...p, updatedAt: nowISO(), events: event ? [...c.events, { at: nowISO(), ...event }] : c.events }))
  return getContract(id)
}
function nextNumber(): string {
  const y = todayCivil().slice(0, 4)
  const max = platformDb.list('saasContracts').reduce((a, c) => Math.max(a, Number(c.number.split('-')[2]) || 0), 0)
  return `QLC-${y}-${String(max + 1).padStart(4, '0')}`
}
function fingerprint(c: Pick<SaasContract, 'offer' | 'contractor' | 'signatory' | 'templateId' | 'templateVersion'>, p: LegalProfile) {
  const { updatedAt: _u, tasks: _t, ...prov } = p
  void _u; void _t
  return sha256Hex(JSON.stringify([c.offer, c.contractor, c.signatory, c.templateId, c.templateVersion, prov]))
}

// ---------------- rascunho ----------------
/** tenantId: contratação feita por clínica existente (proprietário autorizado) → vira alteração de plano, nunca 2ª assinatura. */
export interface DraftInput { planId: string; cycle: BillingCycle; trial: boolean; contractor: ContractorParty; signatory: ContractorSignatory; marketing?: boolean; tenantId?: string | null }

/** Assinatura SaaS vigente da clínica (bloqueia segunda assinatura). */
export const liveSubscription = (tenantId: string) => platformDb.list('subscriptions').find((s) => s.tenantId === tenantId && ['ativa', 'trial', 'inadimplente', 'pausada'].includes(s.status))

/** Salvamento explícito. Mudança após a revisão volta a rascunho e descarta aceites (nova revisão). */
export function saveDraft(draftKey: string, input: DraftInput, id?: string): SaasContract {
  const p = plan(input.planId)
  const terms = currentTerms()
  const tpl = currentTemplate()
  const live = input.tenantId ? liveSubscription(input.tenantId) : undefined
  if (live && live.planId === input.planId && live.cycle === input.cycle && live.status === 'ativa') throw new Error('Este já é o plano e o ciclo atuais da clínica.')
  const offer = buildOffer(p, terms, input.cycle, live ? false : input.trial, todayCivil(), live ? 'proxima_fatura' : undefined)
  const signatory = input.contractor.kind === 'pf' ? selfSignatory(input.contractor) : input.signatory
  const data = { offer, contractor: input.contractor, signatory, templateId: tpl.templateId, templateVersion: tpl.version }
  if (id) {
    const c = getContract(id)
    if (c.draftKey !== draftKey) throw new Error('Rascunho pertence a outra sessão.')
    if (c.status !== 'draft' && c.status !== 'ready_for_review') throw new Error('Contrato já enviado para assinatura: use “Alterar dados” para gerar nova versão.')
    const changed = !c.fingerprint || c.fingerprint !== fingerprint(data, legalProfile())
    const reset = c.status === 'ready_for_review' && changed
    return patch(id, { ...data, acceptances: { marketing: input.marketing }, ...(reset ? { status: 'draft', snapshot: undefined, fingerprint: undefined, revision: c.revision + 1 } : {}) },
      reset ? { type: 'revisao_invalidada', detail: 'Dados alterados após a revisão: aceites descartados, nova revisão necessária.', by: 'Contratante' } : { type: 'rascunho', detail: 'Rascunho salvo.', by: 'Contratante' })
  }
  const at = nowISO()
  const c: SaasContract = {
    id: uid('ctr_'), number: nextNumber(), kind: live ? 'aditivo' : 'contrato', draftKey, tenantId: input.tenantId ?? null, revision: 1, ...data, provider: null, acceptances: { marketing: input.marketing },
    ...(live ? { amendmentNote: `alteração de plano/ciclo para ${p.name} ${input.cycle}, solicitada pelo proprietário da clínica`, amendsContractId: platformDb.list('saasContracts').find((x) => x.tenantId === input.tenantId && x.kind === 'contrato' && x.status === 'signed')?.id } : {}),
    status: 'draft', payment: { status: 'not_created', provider: terms.gateway, amountCents: live ? 0 : offer.totalCents, attempts: 0, processedEvents: [] }, saasStatus: 'pending_activation',
    createdAt: at, updatedAt: at, events: [{ at, type: 'rascunho', detail: 'Rascunho criado (simulação).', by: 'Contratante' }], simulated: true,
  }
  platformDb.insert('saasContracts', c)
  return c
}
export const listDrafts = (draftKey: string) => platformDb.list('saasContracts').filter((c) => c.draftKey === draftKey && !c.tenantId && !['superseded', 'voided'].includes(c.status))

/** Congela o documento para revisão: valida partes, renderiza, bloqueia campos pendentes, calcula hash. */
export function freezeForReview(id: string, draftKey: string): SaasContract {
  const c = getContract(id)
  if (c.draftKey !== draftKey) throw new Error('Rascunho pertence a outra sessão.')
  if (c.status !== 'draft' && c.status !== 'ready_for_review') throw new Error('Este contrato não está em edição.')
  const errs = validateParties(c.contractor, c.signatory, c.offer.limits.units)
  if (Object.keys(errs).length) throw new Error(`Corrija os dados: ${Object.values(errs)[0]}`)
  const tpl = platformDb.list('contractTemplates').find((t) => t.templateId === c.templateId && t.version === c.templateVersion) ?? currentTemplate()
  const provider = legalProfile()
  const amends = c.amendsContractId ? getContract(c.amendsContractId) : undefined
  const sections = renderContract({ number: c.number, kind: c.kind, amendmentNote: c.amendmentNote, amendsNumber: amends?.number, templateVersion: tpl.version, templateBody: tpl.body, offer: c.offer, contractor: c.contractor, signatory: c.signatory, provider })
  const pending = findPlaceholders(sections)
  if (pending.length) throw new Error(`O documento tem campos pendentes e não pode seguir para assinatura: ${pending.slice(0, 3).join('; ')}`)
  return patch(id, { status: 'ready_for_review', provider, snapshot: { sections, hash: snapshotHash(sections), frozenAt: nowISO() }, fingerprint: fingerprint(c, provider) },
    { type: 'revisao', detail: `Documento congelado para revisão (revisão ${c.revision}).`, by: 'Sistema' })
}

// ---------------- assinatura ----------------
/** Aceites distintos e não pré-marcados → envelope (idempotente por contrato+revisão) → assinatura simulada do contratante. */
export function acceptAndSign(id: string, draftKey: string, acc: { terms: boolean; powers: boolean; privacyNotice: boolean; marketing: boolean }): SaasContract {
  let c = getContract(id)
  if (c.draftKey !== draftKey) throw new Error('Contrato pertence a outra sessão.')
  if (c.status === 'pending_signatures' || c.status === 'partially_signed' || c.status === 'signed') return c // duplo clique / retry
  if (c.status !== 'ready_for_review' || !c.snapshot) throw new Error('Revise o contrato completo antes de assinar.')
  if (!acc.terms) throw new Error('Marque a concordância com o contrato.')
  if (!acc.powers) throw new Error(c.contractor.kind === 'pj' ? 'Confirme a declaração de poderes de representação.' : 'Confirme que contrata em nome próprio.')
  if (!acc.privacyNotice) throw new Error('Confirme a ciência do aviso de privacidade.')
  if (fingerprint(c, c.provider ?? legalProfile()) !== c.fingerprint) throw new Error('Os dados mudaram após a revisão. Revise o contrato novamente.')
  const at = nowISO()
  const acceptances: Acceptances = { terms: at, powers: at, privacyNotice: at, marketing: acc.marketing }
  const prof = legalProfile()
  const adapter = signatureProvider(prof.signatureProvider === 'future' && prof.productionSignatureEnabled ? 'future' : 'mock')
  const key = `${c.id}:r${c.revision}`
  let env = platformDb.list('signatureEnvelopes').find((e) => e.id === `env_${key.replace(/[^a-z0-9]/gi, '_')}`)
  if (!env) {
    env = adapter.createEnvelope({ contractId: c.id, documentHash: c.snapshot.hash, expiresInDays: prof.envelopeExpiryDays, idempotencyKey: key, signers: [
      { role: 'contratante', name: c.signatory.name, email: c.signatory.email, order: 1, method: '' },
      { role: 'contratada', name: prof.authorizedSignatory?.name ?? 'Signatário da contratada (a definir no cadastro)', email: prof.authorizedSignatory?.email ?? '—', order: 2, method: '' },
    ] })
    platformDb.insert('signatureEnvelopes', env)
    const sent = applyEnvelopeEvent(env, { ...adapter.signEvent(env, 'contratante'), type: 'sent', signerRole: undefined }).env
    env = applyEnvelopeEvent(sent, adapter.signEvent(sent, 'contratante')).env
    platformDb.update('signatureEnvelopes', env.id, env)
  }
  c = patch(id, { acceptances, envelopeId: env.id }, { type: 'aceites', detail: 'Concordância, declaração de poderes e ciência do aviso de privacidade registradas separadamente.', by: 'Contratante' })
  return reflect(c, env)
}

/** Reflete o envelope no contrato (estado derivado, sem regredir) e tenta ativar quando assinado. */
function reflect(c: SaasContract, env: SignatureEnvelope): SaasContract {
  const next = contractStatusFromEnvelope(env.status)
  if (next === c.status) return c
  const out = patch(c.id, { status: next }, { type: 'assinatura', detail: `Estado do envelope: ${env.status} (simulação).`, by: 'Provedor simulado' })
  if (out.status === 'signed') tryActivate(out.id)
  return getContract(out.id)
}

export type SimSignAction = 'sign_provider' | 'sign_contractor' | 'decline' | 'expire' | 'cancel' | 'replay'
/** Eventos simulados do provedor. replay = webhook duplicado (deve ser ignorado). */
export function simulateEnvelope(id: string, action: SimSignAction, actor: Actor, reason = ''): { contract: SaasContract; result: string } {
  const c = getContract(id)
  const env = getEnvelope(c.envelopeId)
  if (!env) throw new Error('Sem envelope de assinatura para este contrato.')
  if (env.provider !== 'mock') throw new Error('Envelope de provedor real: eventos chegam somente pelo webhook verificado no servidor.')
  const adapter = signatureProvider('mock')
  let ev: EnvelopeEvent
  if (action === 'replay') {
    const last = env.events.filter((x) => x.result === 'aplicado').pop()
    if (!last) throw new Error('Nenhum evento para reenviar.')
    ev = { eventId: last.id, envelopeId: env.id, contractId: c.id, type: last.type as EnvelopeEvent['type'], occurredAt: nowISO(), signerRole: last.type.startsWith('signer') ? (last.detail.includes('contratada') ? 'contratada' : 'contratante') : undefined }
  } else if (action === 'sign_provider' || action === 'sign_contractor') ev = adapter.signEvent(env, action === 'sign_provider' ? 'contratada' : 'contratante')
  else if (action === 'decline') { if (reason.trim().length < 5) throw new Error('Informe o motivo da recusa (mínimo 5 caracteres).'); ev = adapter.declineEvent(env, 'contratante', reason.trim()) }
  else if (action === 'cancel') { if (reason.trim().length < 5) throw new Error('Informe o motivo do cancelamento (mínimo 5 caracteres).'); ev = adapter.cancelEvent(env, reason.trim()) }
  else ev = adapter.expireEvent(env)
  const r = applyEnvelopeEvent(env, ev)
  platformDb.update('signatureEnvelopes', env.id, r.env)
  logAudit(actor, `contrato.envelope.${action}`, c.number, `${r.result}: ${r.detail}`)
  return { contract: reflect(c, r.env), result: `${r.result === 'aplicado' ? 'Aplicado' : r.result === 'duplicado' ? 'Duplicado (ignorado)' : 'Ignorado'}: ${r.detail}` }
}
export function resendInvite(id: string, actor: Actor) {
  const c = getContract(id)
  const env = getEnvelope(c.envelopeId)
  if (!env || !['created', 'sent', 'partially_signed'].includes(env.status)) throw new Error('Reenvio só para envelope em andamento.')
  patch(id, {}, { type: 'reenvio', detail: 'Reenvio de convite registrado (simulação: nenhuma mensagem enviada).', by: actor.name })
  logAudit(actor, 'contrato.convite.reenvio_simulado', c.number)
}

/** Alterar plano/partes depois de enviado: anula envelope pendente, contrato vira “substituído”, nova versão em rascunho. */
export function reviseAfterSending(id: string, draftKey: string): SaasContract {
  const c = getContract(id)
  if (c.draftKey !== draftKey) throw new Error('Contrato pertence a outra sessão.')
  if (!['pending_signatures', 'partially_signed', 'declined', 'expired', 'voided'].includes(c.status)) throw new Error('Este contrato não pode ser revisado.')
  if (c.payment.status === 'confirmed' || c.payment.status === 'pending' || c.payment.uncertain) throw new Error('Há pagamento vinculado a este contrato. Fale com o suporte para revisão.')
  const env = getEnvelope(c.envelopeId)
  if (env && ['created', 'sent', 'partially_signed'].includes(env.status)) {
    const r = applyEnvelopeEvent(env, signatureProvider('mock').cancelEvent(env, 'Substituído por nova versão'))
    platformDb.update('signatureEnvelopes', env.id, r.env)
  }
  const at = nowISO()
  const n: SaasContract = { ...c, id: uid('ctr_'), number: nextNumber(), revision: c.revision + 1, status: 'draft', snapshot: undefined, fingerprint: undefined, envelopeId: undefined, acceptances: { marketing: c.acceptances.marketing }, supersedes: c.id, payment: { ...c.payment, status: 'not_created', attempts: 0, processedEvents: [], idempotencyKey: undefined, providerRef: undefined, uncertain: false }, createdAt: at, updatedAt: at, events: [{ at, type: 'rascunho', detail: `Nova versão de ${c.number}.`, by: 'Contratante' }] }
  platformDb.insert('saasContracts', n)
  patch(c.id, { status: 'superseded', supersededBy: n.id }, { type: 'substituido', detail: `Substituído por ${n.number}; envelope pendente anulado.`, by: 'Contratante' })
  return n
}

// ---------------- pagamento (gateway da plataforma, simulado) ----------------
/** Pagamento depois da assinatura do contratante. Estado incerto (timeout) nunca gera nova tentativa. */
export async function startPayment(id: string, draftKey: string): Promise<SaasContract> {
  const c = getContract(id)
  if (c.draftKey !== draftKey) throw new Error('Contrato pertence a outra sessão.')
  if (c.offer.billing !== 'imediata') throw new Error('Esta oferta não tem cobrança no ato.')
  if (!['partially_signed', 'signed'].includes(c.status)) throw new Error('O pagamento é liberado após a sua assinatura.')
  if (c.payment.status === 'confirmed') throw new Error('Pagamento já confirmado.')
  if (c.payment.uncertain) throw new Error('Há um pagamento em confirmação. Aguarde a consulta ao provedor; não pague de novo.')
  if (c.payment.status === 'pending') throw new Error('Pagamento já em processamento.')
  const attempts = c.payment.attempts + 1
  const key = `${c.id}:pay:${attempts}`
  patch(id, { payment: { ...c.payment, status: 'pending', attempts, idempotencyKey: key, providerRef: `sim_${key}`, uncertain: false } }, { type: 'pagamento', detail: `Cobrança simulada criada (${c.payment.provider}, tentativa ${attempts}).`, by: 'Gateway simulado' })
  await new Promise((r) => setTimeout(r, 400))
  const sc = getSimScenario()
  if (sc === 'timeout') return patch(id, { payment: { ...getContract(id).payment, uncertain: true } }, { type: 'pagamento', detail: 'Tempo esgotado ao consultar o provedor: resultado desconhecido, nova cobrança bloqueada até reconciliar.', by: 'Gateway simulado' })
  return paymentEvent(id, sc === 'falha' ? 'failed' : 'confirmed', `pay_${key}`, SYS)
}
/** Webhook/consulta de pagamento (idempotente por eventId). */
export function paymentEvent(id: string, type: PaymentEventType, eventId: string, actor: Actor): SaasContract {
  const c = getContract(id)
  const r = applyPaymentEvent(c.payment, { eventId, type, at: nowISO() })
  const out = patch(id, { payment: r.payment }, { type: 'pagamento', detail: `Evento ${type}: ${r.result} (simulação).`, by: actor.name })
  if (r.result === 'aplicado' && type === 'confirmed') tryActivate(id)
  if (r.result === 'aplicado' && type === 'refunded') logAudit(actor, 'contrato.pagamento.estornado', c.number, 'Contrato preservado; estorno não apaga o documento.')
  return getContract(out.id)
}
/** Consulta ao provedor resolve o estado incerto sem cobrar de novo. */
export function reconcilePayment(id: string, actor: Actor): SaasContract {
  const c = getContract(id)
  if (!c.payment.uncertain) throw new Error('Nada a reconciliar.')
  return paymentEvent(id, 'confirmed', `pay_${c.payment.idempotencyKey}`, actor)
}

// ---------------- ativação ----------------
function uniqueSlug(name: string) {
  const base = slugify(name) || 'clinica'
  for (let i = 0; i < 50; i++) { const s = i ? `${base.slice(0, 36)}-${i + 1}` : base; if (!validateSlug(s)) return s }
  throw new Error('Não foi possível gerar endereço único para a clínica.')
}
/** Ativa somente se as regras da oferta forem cumpridas (todas as assinaturas + pagamento quando exigido). */
export function tryActivate(id: string): SaasContract | null {
  const c = getContract(id)
  if (!canActivate(c)) return null
  if (c.kind === 'aditivo') {
    if (c.tenantId && platformDb.list('organizations').find((o) => o.id === c.tenantId)?.planId !== c.offer.planId) changePlan(c.tenantId, c.offer.planId, SYS)
    const live = c.tenantId ? liveSubscription(c.tenantId) : undefined
    if (live && live.cycle !== c.offer.cycle) changeCycle(live.id, c.offer.cycle, SYS)
    return patch(id, { saasStatus: 'active' }, { type: 'ativacao', detail: 'Aditivo vigente: plano ajustado; diferença na próxima fatura.', by: 'Sistema' })
  }
  if (isConnectedEnv()) return null // ponytail: ativação real exige backend de contratação; ambiente conectado não cria tenant a partir da simulação.
  const name = c.contractor.tradeName.trim() || c.contractor.legalName.trim()
  const { org, owner } = createTrialOrganization({ name, segment: c.contractor.segment || 'odontologia', slug: uniqueSlug(name), ownerName: c.signatory.name, trialDays: c.offer.trial?.days ?? 14 })
  const p = plan(c.offer.planId)
  const trial = !!c.offer.trial
  const a = c.contractor.address
  platformDb.update('organizations', org.id, {
    planId: p.id, modules: org.modules.filter((m) => p.modules.includes(m)), status: trial ? 'trial' : 'active',
    legalName: c.contractor.legalName.trim(), document: c.contractor.kind === 'pj' ? c.contractor.document : '', contactEmail: c.contractor.email.trim(), contactPhone: c.contractor.phone, city: `${a.city}/${a.uf.toUpperCase()}`,
    onboarding: { step: 1, completed: false, data: { fromContract: c.id } },
  })
  db.update(org.id, 'staff', owner.id, { email: c.signatory.email.trim(), name: c.signatory.name.trim() })
  saveProfile({ ...org, city: `${a.city}/${a.uf}` }, { address: { cep: a.cep, street: a.street, number: a.number, district: a.district, city: a.city, uf: a.uf.toUpperCase() }, whatsapp: '' })
  const sub = platformDb.list('subscriptions').find((s) => s.tenantId === org.id)
  const t = todayCivil()
  if (sub) platformDb.update('subscriptions', sub.id, {
    planId: p.id, cycle: c.offer.cycle, status: trial ? 'trial' : 'ativa', startedAt: t,
    currentPeriodEnd: trial ? c.offer.trial!.end : addDaysCivil(t, CYCLE_MONTHS[c.offer.cycle] * 30),
    ...(trial ? {} : { trial: undefined }),
    history: [...sub.history, { at: nowISO(), event: `Contratação ${c.number} (simulação): ${trial ? 'teste gratuito' : 'assinatura ativa'}`, by: 'Sistema' }],
  })
  if (!trial && sub) {
    const invs = platformDb.list('saasInvoices')
    platformDb.insert('saasInvoices', { id: uid('inv_'), tenantId: org.id, subscriptionId: sub.id, number: nextInvoiceNumber(invs), competence: t.slice(0, 7), dueDate: t, amountCents: c.offer.totalCents, status: 'paga', gateway: c.payment.provider, paidAt: nowISO(), providerRef: c.payment.providerRef, reconciled: true, simulated: true })
  }
  logAudit(SYS, 'contrato.ativado', org.id, `${c.number} · ${p.name} ${c.offer.cycle}${trial ? ' · teste' : ''}`)
  return patch(id, { tenantId: org.id, saasStatus: trial ? 'trialing' : 'active' }, { type: 'ativacao', detail: `Acesso liberado (${trial ? 'teste gratuito' : 'assinatura paga'}) para ${org.name}.`, by: 'Sistema' })
}
export function ownerOf(tenantId: string) { return db.list(tenantId, 'staff').find((u) => u.memberships.some((m) => m.role === 'clinic_owner')) }

// ---------------- painel da clínica ----------------
export function requestCancellation(id: string, reason: string, actor: Actor) {
  const c = getContract(id)
  if (!c.tenantId) throw new Error('Contrato sem clínica vinculada.')
  if (c.cancellation) throw new Error(`Cancelamento já registrado (protocolo ${c.cancellation.protocol}).`)
  const r = reason.trim()
  if (r.length < 5) throw new Error('Informe o motivo (mínimo 5 caracteres).')
  const sub = platformDb.list('subscriptions').find((s) => s.tenantId === c.tenantId)
  const effectiveOn = sub && sub.currentPeriodEnd > todayCivil() ? sub.currentPeriodEnd : todayCivil()
  const protocol = `CAN-${c.number.slice(4)}-${String(Date.now()).slice(-5)}`
  if (sub && sub.status !== 'cancelada') cancelSubscription(sub.id, effectiveOn, r, actor)
  return patch(id, { cancellation: { protocol, requestedAt: nowISO(), effectiveOn, reason: r }, ...(effectiveOn <= todayCivil() ? { saasStatus: 'canceled' as const } : {}) },
    { type: 'cancelamento', detail: `Protocolo ${protocol}; efeito em ${effectiveOn}. O contrato assinado permanece no histórico.`, by: actor.name })
}

// ---------------- Super Admin ----------------
export function createAmendment(contractId: string, planId: string, cycle: BillingCycle, note: string, actor: Actor): SaasContract {
  const base = getContract(contractId)
  if (base.status !== 'signed' || !base.tenantId) throw new Error('Aditivo só para contrato assinado e ativo.')
  if (note.trim().length < 10) throw new Error('Descreva a alteração (mínimo 10 caracteres).')
  if (platformDb.list('saasContracts').some((c) => c.amendsContractId === contractId && ['draft', 'ready_for_review', 'pending_signatures', 'partially_signed'].includes(c.status))) throw new Error('Já existe aditivo em andamento para este contrato.')
  const p = plan(planId)
  const tpl = currentTemplate()
  const offer = buildOffer(p, currentTerms(), cycle, false, todayCivil(), 'proxima_fatura')
  const at = nowISO()
  const c: SaasContract = {
    ...base, id: uid('ctr_'), number: nextNumber(), kind: 'aditivo', amendsContractId: base.id, amendmentNote: note.trim(), draftKey: `tenant:${base.tenantId}`, revision: 1,
    templateId: tpl.templateId, templateVersion: tpl.version, offer, provider: null, acceptances: {}, status: 'draft', envelopeId: undefined, snapshot: undefined, fingerprint: undefined,
    payment: { status: 'not_created', provider: base.payment.provider, amountCents: 0, attempts: 0, processedEvents: [] }, saasStatus: 'pending_activation', cancellation: undefined, supersedes: undefined, supersededBy: undefined,
    createdAt: at, updatedAt: at, events: [{ at, type: 'aditivo', detail: `Aditivo de ${base.number}: ${note.trim()}`, by: actor.name }],
  }
  platformDb.insert('saasContracts', c)
  freezeForReview(c.id, c.draftKey)
  logAudit(actor, 'contrato.aditivo.criado', base.number, `${c.number}: ${p.name} ${cycle}`)
  return getContract(c.id)
}

export function updateLegalProfile(p: Partial<Pick<LegalProfile, 'authorizedSignatory' | 'contractChannel' | 'privacyContact' | 'supportChannels' | 'legalReviewStatus' | 'commercialTermsStatus' | 'signatureProvider' | 'reminderDays' | 'envelopeExpiryDays' | 'draftRetentionDays' | 'productionSignatureEnabled' | 'tasks'>>, actor: Actor) {
  if (p.authorizedSignatory && (p.authorizedSignatory.name.trim().length < 5 || p.authorizedSignatory.role.trim().length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.authorizedSignatory.email))) throw new Error('Signatário: nome, cargo/qualidade e e-mail válidos.')
  for (const k of ['reminderDays', 'envelopeExpiryDays', 'draftRetentionDays'] as const) if (p[k] !== undefined && (!Number.isInteger(p[k]) || p[k]! < 1 || p[k]! > 365)) throw new Error('Prazos: inteiro entre 1 e 365 dias.')
  if (p.productionSignatureEnabled) throw new Error('Assinatura em produção só pode ser habilitada pelo backend após homologação do provedor.')
  platformDb.update('legalProfile', 'contratada', { ...p, updatedAt: nowISO() })
  logAudit(actor, 'contratada.atualizada', 'contratada', Object.keys(p).join(', '))
}
export function saveTerms(next: Omit<CommercialTerms, 'id' | 'version' | 'status' | 'approvedBy' | 'approvedAt'>, actor: Actor) {
  const cur = currentTerms()
  for (const [k, v] of Object.entries(next)) if (typeof v === 'string' && v.trim().length < 5) throw new Error(`Campo “${k}”: descreva a regra (ou declare expressamente “não incluído”).`)
  if (!Number.isInteger(next.trialDays) || next.trialDays < 1 || next.trialDays > 90) throw new Error('Teste: 1 a 90 dias.')
  if (!Number.isInteger(next.paymentDueDays) || next.paymentDueDays < 1 || next.paymentDueDays > 30) throw new Error('Prazo de pagamento: 1 a 30 dias.')
  const t: CommercialTerms = { ...next, id: `terms_v${cur.version + 1}`, version: cur.version + 1, status: 'pending' }
  platformDb.insert('commercialTerms', t)
  logAudit(actor, 'quadro_comercial.versao', t.id, 'Nova versão pendente de aprovação; contratos existentes não mudam.')
  return t
}
export function approveTerms(reviewer: string, actor: Actor) {
  if (reviewer.trim().length < 5) throw new Error('Informe quem realizou a aprovação comercial.')
  const t = currentTerms()
  platformDb.update('commercialTerms', t.id, { status: 'approved', approvedBy: reviewer.trim(), approvedAt: nowISO() })
  logAudit(actor, 'quadro_comercial.aprovado', t.id, reviewer.trim())
}
export function saveTemplateDraft(body: string, actor: Actor) {
  if (body.trim().length < 200) throw new Error('Texto do modelo muito curto.')
  const all = platformDb.list('contractTemplates')
  const latest = all.reduce((a, b) => (b.version > a.version ? b : a))
  const v: ContractTemplateVersion = { id: `tpl_saas_v${latest.version + 1}`, templateId: latest.templateId, version: latest.version + 1, title: latest.title, body, status: 'minuta', legalReviewDone: false, commercialReviewDone: false, createdAt: nowISO(), createdBy: actor.name }
  platformDb.insert('contractTemplates', v)
  logAudit(actor, 'modelo.versao_criada', v.id, 'Minuta nova; contratos antigos mantêm o snapshot assinado.')
  return v
}
/** Publicação exige revisões efetivamente realizadas (marcadas por quem publica) e texto sem pendências. */
export function publishTemplate(id: string, review: { legal: boolean; commercial: boolean; reviewer: string }, actor: Actor) {
  const v = platformDb.list('contractTemplates').find((t) => t.id === id)
  if (!v) throw new Error('Versão não encontrada.')
  if (v.status !== 'minuta') throw new Error('Somente minutas podem ser publicadas.')
  if (!review.legal || !review.commercial) throw new Error('Publicação exige revisão jurídica e comercial efetivamente realizadas.')
  if (review.reviewer.trim().length < 5) throw new Error('Informe quem realizou as revisões.')
  const pend = findPlaceholders([{ id: 'x', title: v.title, paras: v.body.replaceAll('{{contratada.privacidade}}', '').split('\n') }])
  if (pend.length) throw new Error(`Modelo com campos pendentes: ${pend.slice(0, 2).join('; ')}`)
  for (const t of platformDb.list('contractTemplates')) if (t.status === 'publicado') platformDb.update('contractTemplates', t.id, { status: 'arquivado' })
  platformDb.update('contractTemplates', id, { status: 'publicado', legalReviewDone: true, commercialReviewDone: true, reviewedBy: review.reviewer.trim(), publishedAt: nowISO() })
  logAudit(actor, 'modelo.publicado', id, `v${v.version} · revisão: ${review.reviewer.trim()}`)
}
