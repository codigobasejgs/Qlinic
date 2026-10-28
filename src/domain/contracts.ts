// Contratação SaaS (Contexto A): contrato entre a FORNECEDORA do Qlinic e a clínica/profissional contratante.
// Não confundir com documentos clínicos (clínica ↔ paciente). Regras puras: sem React, sem window, sem store.
// Estados independentes: contrato ≠ pagamento ≠ assinatura SaaS. Nada aqui comprova assinatura real.
import type { Cents } from '@/lib/money'
import { formatBRL } from '@/lib/money'
import type { CivilDate, ISOInstant } from '@/lib/dates'
import { addDaysCivil, formatCivil, formatDateTime } from '@/lib/dates'
import { isValidCNPJ, isValidCPF, maskCEP, maskCNPJ, maskCPF, maskCPFPartial, maskPhone } from '@/lib/util'
import { sha256Hex } from '@/lib/sha256'
import { MODULE_LABEL, SEGMENT_LABEL, type ID, type ModuleKey, type Segment } from './types'
import { CYCLE_MONTHS, type BillingCycle, type Plan, type PlanLimits } from './platform'

// ---------------- contratada ----------------
export type SignatureMethod = 'simulacao' | 'provedor_externo'
export interface LegalProfile {
  id: 'contratada'
  productName: string
  legalName: string
  taxId: string // só dígitos
  legalNature: string
  tradeNameRegistered: string | null
  address: { street: string; number: string; complement: string | null; district: string; city: string; state: string; postalCode: string }
  registeredEmail: string
  registeredPhone: string // E.164
  source: string
  sourceIsLiveRegistryCheck: boolean
  /** Titular ou procurador que assina pela contratada. null = não definido (nenhuma assinatura presumida). */
  authorizedSignatory: { name: string; role: string; email: string; method: SignatureMethod } | null
  contractChannel: string | null
  privacyContact: string | null
  supportChannels: { channel: string; hours: string }[]
  legalReviewStatus: 'pending' | 'done'
  commercialTermsStatus: 'pending' | 'done'
  productionSignatureEnabled: boolean
  signatureProvider: 'mock' | 'future'
  reminderDays: number
  envelopeExpiryDays: number
  draftRetentionDays: number
  tasks: { id: ID; title: string; detail: string; status: 'aberta' | 'concluida' }[]
  updatedAt: ISOInstant
}

/** Cadastro inicial a partir de docs/contratacao/dados-contratada.json (comprovante, não consulta online). */
export function legalProfileFromJson(j: {
  product_name: string; legal_name: string; tax_id: string; legal_nature: string; trade_name_registered: string | null
  address: { street: string; number: string; complement: string | null; district: string; city: string; state: string; postal_code: string }
  registered_email: string; registered_phone: string; source: string; source_is_live_registry_check: boolean
  legal_review_status: string; commercial_terms_status: string; production_signature_enabled: boolean
}, at: ISOInstant): LegalProfile {
  return {
    id: 'contratada', productName: j.product_name, legalName: j.legal_name, taxId: j.tax_id, legalNature: j.legal_nature, tradeNameRegistered: j.trade_name_registered,
    address: { ...j.address, postalCode: j.address.postal_code }, registeredEmail: j.registered_email, registeredPhone: j.registered_phone,
    source: j.source, sourceIsLiveRegistryCheck: j.source_is_live_registry_check,
    authorizedSignatory: null, contractChannel: null, privacyContact: null, supportChannels: [],
    legalReviewStatus: j.legal_review_status === 'done' ? 'done' : 'pending', commercialTermsStatus: j.commercial_terms_status === 'done' ? 'done' : 'pending',
    productionSignatureEnabled: j.production_signature_enabled, signatureProvider: 'mock', reminderDays: 2, envelopeExpiryDays: 7, draftRetentionDays: 30,
    tasks: [{ id: 'task_cnae', title: 'Conferência contábil do CNAE e emissão fiscal', detail: 'O CNAE principal do comprovante é treinamento em informática e os secundários exibidos não identificam expressamente licenciamento/desenvolvimento de software. Conferir enquadramento e emissão de nota com a contabilidade antes do lançamento. Não altera o CNPJ e não indica irregularidade.', status: 'aberta' }],
    updatedAt: at,
  }
}
export const formatPhoneE164 = (v: string) => maskPhone(v.replace(/\D/g, '').replace(/^55/, ''))
export function providerAddress(p: LegalProfile) {
  const a = p.address
  return `${a.street}, nº ${a.number}${a.complement ? `, ${a.complement}` : ''}, ${a.district}, ${a.city}/${a.state}, CEP ${maskCEP(a.postalCode)}`
}

// ---------------- quadro comercial ----------------
export interface CommercialTerms {
  id: ID
  version: number
  status: 'pending' | 'approved'
  approvedBy?: string
  approvedAt?: ISOInstant
  trialDays: number
  setupFeeCents: Cents
  paymentDueDays: number
  gateway: 'asaas' | 'mercadopago' | 'infinitepay'
  signaturesIncluded: number
  renewal: string; accessStart: string; billingStart: string; trialRule: string
  cancellation: string; lateFees: string; adjustment: string; loyalty: string
  support: string; sla: string; backup: string; exportWindow: string; deletion: string; backupExpiry: string
}
export const TERMS_TEXT_FIELDS = ['renewal', 'accessStart', 'billingStart', 'trialRule', 'cancellation', 'lateFees', 'adjustment', 'loyalty', 'support', 'sla', 'backup', 'exportWindow', 'deletion', 'backupExpiry'] as const
export const TERMS_LABEL: Record<(typeof TERMS_TEXT_FIELDS)[number], string> = {
  renewal: 'Renovação', accessStart: 'Início do acesso contratado', billingStart: 'Início da cobrança', trialRule: 'Regra do teste gratuito',
  cancellation: 'Cancelamento', lateFees: 'Encargos por atraso', adjustment: 'Reajuste', loyalty: 'Fidelidade e multa',
  support: 'Suporte', sla: 'Disponibilidade/SLA', backup: 'Backup/restauração', exportWindow: 'Exportação após encerramento', deletion: 'Eliminação dos dados ativos', backupExpiry: 'Expiração dos backups',
}
export const GATEWAY_LABEL: Record<CommercialTerms['gateway'], string> = { asaas: 'Asaas', mercadopago: 'Mercado Pago', infinitepay: 'InfinitePay' }

export interface OfferSnapshot {
  /** plano@versão / termos vN / ciclo [/ teste]: identifica a oferta aceita. */
  offerVersion: string
  planId: ID; planName: string; planVersion: number
  cycle: BillingCycle
  trial: { days: number; start: CivilDate; end: CivilDate } | null
  totalCents: Cents; monthlyEqCents: Cents; discountText: string; afterDiscountText: string; setupFeeCents: Cents
  limits: PlanLimits; modules: ModuleKey[]; overage: Plan['overage']
  terms: Omit<CommercialTerms, 'id' | 'approvedBy' | 'approvedAt'>
  startDate: CivilDate
  /** Aditivo: cobrança ajustada na próxima fatura, sem pagamento no ato. */
  billing: 'imediata' | 'proxima_fatura' | 'sem_cobranca_no_teste'
}

export function buildOffer(plan: Plan, terms: CommercialTerms, cycle: BillingCycle, trial: boolean, today: CivilDate, billing?: OfferSnapshot['billing']): OfferSnapshot {
  const months = CYCLE_MONTHS[cycle]
  const total = plan.prices[cycle]
  const base = plan.prices.mensal * months
  const saving = base > 0 ? Math.round(((base - total) / base) * 100) : 0
  const { id: _id, approvedBy: _b, approvedAt: _a, ...t } = terms
  void _id; void _b; void _a
  return {
    offerVersion: `${plan.id}@v${plan.version}/termos-v${terms.version}/${cycle}${trial ? '/teste' : ''}`,
    planId: plan.id, planName: plan.name, planVersion: plan.version, cycle,
    trial: trial ? { days: terms.trialDays, start: today, end: addDaysCivil(today, terms.trialDays) } : null,
    totalCents: total, monthlyEqCents: Math.round(total / months),
    discountText: saving > 0 ? `${saving}% abaixo de ${months}× o valor mensal, válido durante este ciclo` : 'sem desconto',
    afterDiscountText: saving > 0 ? 'na renovação vale o preço do ciclo vigente na tabela, observada a cláusula de reajuste' : 'não se aplica (sem desconto)',
    setupFeeCents: terms.setupFeeCents, limits: { ...plan.limits }, modules: [...plan.modules], overage: { ...plan.overage }, terms: t, startDate: today,
    billing: billing ?? (trial ? 'sem_cobranca_no_teste' : 'imediata'),
  }
}
export const CYCLE_NAME: Record<BillingCycle, string> = { mensal: 'mensal', trimestral: 'trimestral', anual: 'anual' }

// ---------------- partes ----------------
export type PartyKind = 'pj' | 'pf'
export interface ContractorParty {
  kind: PartyKind
  legalName: string
  tradeName: string
  document: string // dígitos (CNPJ ou CPF)
  segment: Segment | ''
  units: number
  address: { cep: string; street: string; number: string; complement: string; district: string; city: string; uf: string }
  email: string
  phone: string
}
/** CPF completo: acesso restrito (signatário, partes e quem precisa do documento). Listas e logs usam máscara. */
export interface ContractorSignatory { name: string; document: string; role: string; email: string }
export interface Acceptances { terms?: ISOInstant; powers?: ISOInstant; privacyNotice?: ISOInstant; marketing?: boolean }

export const emptyContractor = (): ContractorParty => ({ kind: 'pj', legalName: '', tradeName: '', document: '', segment: '', units: 1, address: { cep: '', street: '', number: '', complement: '', district: '', city: '', uf: '' }, email: '', phone: '' })
export const emptySignatory = (): ContractorSignatory => ({ name: '', document: '', role: '', email: '' })

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const MAX = 120
const demoEmail = (e: string) => /^[^\s@]+@[^\s@]+\.(test|exemplo)$/i.test(e.trim())
/** Simulação: só documentos fictícios (CPF 000…, CNPJ 00.000…) para nunca guardar dado real no navegador. */
const fakeCpfOk = (d: string) => d.startsWith('000')
const fakeCnpjOk = (d: string) => d.startsWith('00000')

/** Validação de formato/dígitos. NÃO verifica identidade nem poderes. Erros por campo (para aria-describedby). */
export function validateParties(c: ContractorParty, s: ContractorSignatory, maxUnits: number): Record<string, string> {
  const e: Record<string, string> = {}
  const doc = c.document.replace(/\D/g, '')
  const len = (k: string, v: string, min: number, label: string) => { const t = v.trim(); if (t.length < min) e[k] = `Informe ${label}.`; else if (t.length > MAX) e[k] = `${label[0].toUpperCase()}${label.slice(1)}: máximo ${MAX} caracteres.` }
  len('legalName', c.legalName, 3, c.kind === 'pj' ? 'a razão social' : 'o nome civil completo')
  if (c.tradeName.trim().length > MAX) e.tradeName = `Nome comercial: máximo ${MAX} caracteres.`
  if (c.kind === 'pj') {
    if (!isValidCNPJ(doc)) e.document = 'CNPJ inválido (confira os dígitos).'
    else if (!fakeCnpjOk(doc)) e.document = 'Na simulação use CNPJ fictício iniciado por 00.000 (botão “Preencher com dados fictícios”).'
  } else {
    if (!isValidCPF(doc)) e.document = 'CPF inválido (confira os dígitos).'
    else if (!fakeCpfOk(doc)) e.document = 'Na simulação use CPF fictício iniciado por 000 (botão “Preencher com dados fictícios”).'
  }
  if (!c.segment) e.segment = 'Selecione o segmento.'
  if (!Number.isInteger(c.units) || c.units < 1) e.units = 'Informe ao menos 1 unidade.'
  else if (c.units > maxUnits) e.units = `O plano escolhido inclui até ${maxUnits} unidade(s). Escolha outro plano ou reduza.`
  const a = c.address
  if (a.cep.replace(/\D/g, '').length !== 8) e.cep = 'CEP deve ter 8 dígitos.'
  len('street', a.street, 3, 'o logradouro')
  if (!a.number.trim()) e.number = 'Informe o número (ou “s/n”).'
  len('district', a.district, 2, 'o bairro')
  len('city', a.city, 2, 'a cidade')
  if (!UFS.includes(a.uf.toUpperCase())) e.uf = 'Selecione a UF.'
  if (!demoEmail(c.email)) e.email = 'Na simulação use e-mail fictício terminado em .test ou .exemplo.'
  const ph = c.phone.replace(/\D/g, '')
  if (ph.length < 10 || ph.length > 11) e.phone = 'Telefone com DDD (10 ou 11 dígitos).'
  else if (!ph.startsWith('00')) e.phone = 'Na simulação use telefone fictício com DDD 00.'
  if (c.kind === 'pj') {
    len('sigName', s.name, 5, 'o nome completo do representante')
    if (!/\s/.test(s.name.trim()) && !e.sigName) e.sigName = 'Informe nome e sobrenome.'
    const sd = s.document.replace(/\D/g, '')
    if (!isValidCPF(sd)) e.sigDocument = 'CPF do representante inválido.'
    else if (!fakeCpfOk(sd)) e.sigDocument = 'Na simulação use CPF fictício iniciado por 000.'
    len('sigRole', s.role, 3, 'o cargo ou qualidade')
    if (!demoEmail(s.email)) e.sigEmail = 'Na simulação use e-mail fictício terminado em .test ou .exemplo.'
  }
  return e
}
/** PF assina em nome próprio: signatário = contratante (sem empresa fictícia). */
export function selfSignatory(c: ContractorParty): ContractorSignatory {
  return { name: c.legalName.trim(), document: c.document.replace(/\D/g, ''), role: 'titular, em nome próprio', email: c.email.trim() }
}

// ---------------- contrato, envelope, pagamento ----------------
export type ContractStatus = 'draft' | 'ready_for_review' | 'pending_signatures' | 'partially_signed' | 'signed' | 'declined' | 'expired' | 'voided' | 'superseded'
export type PaymentStatus = 'not_created' | 'pending' | 'confirmed' | 'failed' | 'refunded' | 'disputed'
export type SaasLifecycle = 'pending_activation' | 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled'

export interface DocSection { id: string; title: string; paras: string[]; rows?: [string, string][]; pageBreakBefore?: boolean }
export interface ContractPayment {
  status: PaymentStatus
  provider: CommercialTerms['gateway']
  amountCents: Cents
  attempts: number
  idempotencyKey?: string
  providerRef?: string
  /** Resultado desconhecido (timeout): nunca recobrar até reconciliar. */
  uncertain?: boolean
  processedEvents: string[]
  updatedAt?: ISOInstant
}
export interface ContractEvent { at: ISOInstant; type: string; detail: string; by: string }
export interface SaasContract {
  id: ID
  number: string
  kind: 'contrato' | 'aditivo'
  amendsContractId?: ID
  amendmentNote?: string
  /** Dono do rascunho anônimo na demonstração (produção: usuário autenticado no servidor). */
  draftKey: string
  tenantId: ID | null
  revision: number
  templateId: ID
  templateVersion: number
  offer: OfferSnapshot
  contractor: ContractorParty
  signatory: ContractorSignatory
  /** Cópia da contratada congelada na revisão. */
  provider: LegalProfile | null
  acceptances: Acceptances
  status: ContractStatus
  payment: ContractPayment
  saasStatus: SaasLifecycle
  envelopeId?: ID
  snapshot?: { sections: DocSection[]; hash: string; frozenAt: ISOInstant }
  supersededBy?: ID
  supersedes?: ID
  /** Impressão digital de oferta + partes + modelo: muda → aceites e envelope pendente deixam de valer. */
  fingerprint?: string
  cancellation?: { protocol: string; requestedAt: ISOInstant; effectiveOn: CivilDate; reason: string }
  createdAt: ISOInstant
  updatedAt: ISOInstant
  events: ContractEvent[]
  simulated: true
}

export type EnvelopeStatus = 'created' | 'sent' | 'partially_signed' | 'completed' | 'declined' | 'expired' | 'canceled'
export interface EnvelopeSigner { id: ID; role: 'contratante' | 'contratada'; name: string; email: string; order: number; status: 'pending' | 'signed' | 'declined'; at?: ISOInstant; eventId?: string; method: string }
export interface SignatureEnvelope {
  id: ID
  contractId: ID
  provider: 'mock' | 'future'
  status: EnvelopeStatus
  documentHash: string
  signers: EnvelopeSigner[]
  createdAt: ISOInstant
  expiresAt: ISOInstant
  completedAt?: ISOInstant
  processedEvents: string[]
  events: { id: string; at: ISOInstant; type: string; detail: string; result: 'aplicado' | 'duplicado' | 'ignorado' }[]
  simulated: boolean
}
export type EnvelopeEventType = 'sent' | 'signer.signed' | 'signer.declined' | 'expired' | 'canceled'
export interface EnvelopeEvent { eventId: string; envelopeId: ID; contractId: ID; type: EnvelopeEventType; signerRole?: EnvelopeSigner['role']; occurredAt: ISOInstant; reason?: string }

const ENV_TERMINAL: EnvelopeStatus[] = ['completed', 'declined', 'expired', 'canceled']
/** Webhook do provedor: idempotente, confere contrato, nunca regride estado terminal nem assinatura já registrada. */
export function applyEnvelopeEvent(env: SignatureEnvelope, ev: EnvelopeEvent): { env: SignatureEnvelope; result: 'aplicado' | 'duplicado' | 'ignorado'; detail: string } {
  const log = (result: 'aplicado' | 'duplicado' | 'ignorado', detail: string, next = env) => ({ env: { ...next, events: [...next.events, { id: ev.eventId, at: ev.occurredAt, type: ev.type, detail, result }] }, result, detail })
  if (env.processedEvents.includes(ev.eventId)) return log('duplicado', 'Evento já processado (idempotência).')
  const seen = { ...env, processedEvents: [...env.processedEvents, ev.eventId] }
  if (ev.envelopeId !== env.id || ev.contractId !== env.contractId) return log('ignorado', 'Evento não corresponde a este envelope/contrato.', seen)
  if (ENV_TERMINAL.includes(env.status)) return log('ignorado', `Envelope já encerrado (${env.status}); estado preservado.`, seen)
  if (ev.type === 'sent') return env.status === 'created' ? log('aplicado', 'Envelope enviado.', { ...seen, status: 'sent' }) : log('ignorado', 'Envio fora de ordem; estado mantido.', seen)
  if (ev.type === 'expired' || ev.type === 'canceled') return log('aplicado', ev.type === 'expired' ? 'Prazo de assinatura expirou.' : `Envelope cancelado${ev.reason ? `: ${ev.reason}` : ''}.`, { ...seen, status: ev.type })
  const signer = env.signers.find((s) => s.role === ev.signerRole)
  if (!signer) return log('ignorado', 'Signatário não pertence ao envelope.', seen)
  if (signer.status !== 'pending') return log('ignorado', 'Signatário já registrou manifestação.', seen)
  if (ev.type === 'signer.declined') {
    const signers = env.signers.map((s) => (s.id === signer.id ? { ...s, status: 'declined' as const, at: ev.occurredAt, eventId: ev.eventId } : s))
    return log('aplicado', `Recusa de ${signer.role}${ev.reason ? `: ${ev.reason}` : ''}.`, { ...seen, signers, status: 'declined' })
  }
  const signers = env.signers.map((s) => (s.id === signer.id ? { ...s, status: 'signed' as const, at: ev.occurredAt, eventId: ev.eventId } : s))
  const all = signers.every((s) => s.status === 'signed')
  return log('aplicado', `Assinatura de ${signer.role} registrada.`, { ...seen, signers, status: all ? 'completed' : 'partially_signed', ...(all ? { completedAt: ev.occurredAt } : {}) })
}
export function contractStatusFromEnvelope(s: EnvelopeStatus): ContractStatus {
  return ({ created: 'pending_signatures', sent: 'pending_signatures', partially_signed: 'partially_signed', completed: 'signed', declined: 'declined', expired: 'expired', canceled: 'voided' } as const)[s]
}

export type PaymentEventType = 'confirmed' | 'failed' | 'refunded' | 'disputed'
/** Webhook de pagamento: idempotente; confirmado não volta a falho; estorno/disputa só após confirmação. */
export function applyPaymentEvent(p: ContractPayment, ev: { eventId: string; type: PaymentEventType; at: ISOInstant }): { payment: ContractPayment; result: 'aplicado' | 'duplicado' | 'ignorado' } {
  if (p.processedEvents.includes(ev.eventId)) return { payment: p, result: 'duplicado' }
  const seen = { ...p, processedEvents: [...p.processedEvents, ev.eventId], updatedAt: ev.at }
  const ok = (ev.type === 'confirmed' && (p.status === 'pending' || p.status === 'failed'))
    || (ev.type === 'failed' && p.status === 'pending')
    || ((ev.type === 'refunded' || ev.type === 'disputed') && (p.status === 'confirmed' || (ev.type === 'refunded' && p.status === 'disputed')))
  return ok ? { payment: { ...seen, status: ev.type, uncertain: false }, result: 'aplicado' } : { payment: seen, result: 'ignorado' }
}

/** Ativação: TODOS os signatários + regra da oferta (teste: sem pagamento; pago: pagamento confirmado). Nunca por parâmetro de URL. */
export function canActivate(c: Pick<SaasContract, 'status' | 'offer' | 'payment' | 'saasStatus'>): boolean {
  if (c.status !== 'signed' || c.saasStatus !== 'pending_activation') return false
  return c.offer.billing === 'imediata' ? c.payment.status === 'confirmed' : true
}
export function activationNote(c: Pick<SaasContract, 'status' | 'offer' | 'payment' | 'saasStatus'>): string {
  if (c.saasStatus !== 'pending_activation') return ''
  const sig = c.status === 'signed' ? null : c.status === 'partially_signed' ? 'aguarda a assinatura da contratada' : c.status === 'pending_signatures' ? 'aguarda as assinaturas' : 'contrato não formalizado'
  const pay = c.offer.billing !== 'imediata' ? null : c.payment.status === 'confirmed' ? null : c.payment.uncertain ? 'pagamento em confirmação (não tente pagar de novo)' : c.payment.status === 'failed' ? 'pagamento recusado — tente novamente' : 'aguarda a confirmação do pagamento'
  const parts = [sig, pay].filter(Boolean)
  return parts.length ? `Acesso pago ainda não ativado: ${parts.join(' e ')}.` : 'Requisitos cumpridos; ativação em processamento.'
}

// ---------------- modelo (template) ----------------
export interface ContractTemplateVersion {
  id: ID
  templateId: ID
  version: number
  title: string
  body: string // markdown: "### Título", parágrafos, "<!-- PAGE -->"; variável {{contratada.privacidade}}
  status: 'minuta' | 'publicado' | 'arquivado'
  legalReviewDone: boolean
  commercialReviewDone: boolean
  reviewedBy?: string
  publishedAt?: ISOInstant
  createdAt: ISOInstant
  createdBy: string
}
export const TEMPLATE_VARS = ['{{contratada.privacidade}}']

/** Cláusulas gerais (1 a 13 e Anexo B) da minuta; identificação, Anexo A e registro das partes são gerados pelo sistema. */
export function templateBodyFromMinuta(md: string): string {
  const t = md.replace(/\r\n/g, '\n')
  const start = t.indexOf('### 1.')
  const reg = t.indexOf('### Registro das partes')
  const annexB = t.indexOf('### Anexo B')
  if (start < 0 || reg < 0 || annexB < 0) throw new Error('Minuta fora do formato esperado.')
  return `${t.slice(start, reg).trim()}\n\n<!-- PAGE -->\n${t.slice(annexB).trim()}\n`.replace('[canal aprovado antes da publicação]', '{{contratada.privacidade}}').replace(/\n{3,}/g, '\n\n')
}

export function parseBody(body: string): DocSection[] {
  const out: DocSection[] = []
  let brk = false
  for (const raw of body.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line === '<!-- PAGE -->') { brk = true; continue }
    if (line.startsWith('### ')) { const title = line.slice(4).trim(); out.push({ id: `s-${out.length + 1}`, title, paras: [], pageBreakBefore: brk }); brk = false; continue }
    if (!out.length) out.push({ id: 's-0', title: 'Disposições', paras: [] })
    out[out.length - 1].paras.push(line)
  }
  return out
}

const fmtDoc = (c: ContractorParty) => (c.kind === 'pj' ? maskCNPJ(c.document) : maskCPF(c.document))
const yes = (n: number, unit: string) => (n > 0 ? `${n.toLocaleString('pt-BR')} ${unit}` : 'não incluído')

export interface RenderInput {
  number: string
  kind: SaasContract['kind']
  amendmentNote?: string
  amendsNumber?: string
  templateVersion: number
  templateBody: string
  offer: OfferSnapshot
  contractor: ContractorParty
  signatory: ContractorSignatory
  provider: LegalProfile
}
/** Documento canônico a assinar. Sem colchetes/“a definir”/null: o que não se aplica é dito expressamente. */
export function renderContract(r: RenderInput): DocSection[] {
  const p = r.provider, c = r.contractor, s = r.signatory, o = r.offer, t = o.terms
  const sig = p.authorizedSignatory ? `${p.authorizedSignatory.name}, ${p.authorizedSignatory.role}` : 'a ser identificado no processo de assinatura (não definido no cadastro da contratada; nenhuma assinatura, procuração ou representação é presumida)'
  const kindLabel = c.kind === 'pj' ? 'pessoa jurídica' : 'profissional pessoa física'
  const a = c.address
  const addr = `${a.street}, nº ${a.number}${a.complement ? `, ${a.complement}` : ''}, ${a.district}, ${a.city}/${a.uf.toUpperCase()}, CEP ${maskCEP(a.cep)}`
  const ident: DocSection = {
    id: 'identificacao', title: r.kind === 'aditivo' ? 'Aditivo contratual — quadro de identificação' : 'Quadro de identificação', paras: [
      `Número do contrato: ${r.number}. Versão do modelo: ${r.templateVersion}. Oferta: ${o.offerVersion}. Data: a da conclusão das manifestações de vontade das partes, conforme o registro do processo de assinatura.`,
      ...(r.kind === 'aditivo' ? [`Este aditivo integra o contrato ${r.amendsNumber ?? 'anterior'} e altera somente: ${r.amendmentNote ?? 'condições indicadas no Anexo A'}. As demais condições do contrato anterior permanecem inalteradas.`] : []),
      `CONTRATADA: ${p.legalName}, ${p.legalNature.toLowerCase().includes('individual') ? 'empresário individual' : p.legalNature}, inscrito no CNPJ sob nº ${maskCNPJ(p.taxId)}, com endereço na ${providerAddress(p)}, fornecedora da plataforma denominada ${p.productName}. E-mail cadastral: ${p.registeredEmail}. Telefone cadastral: ${formatPhoneE164(p.registeredPhone)}. Signatário da contratada: ${sig}.`,
      `${p.productName} é a denominação do produto neste instrumento, não substitui o nome empresarial acima nem representa declaração de registro de marca. O comprovante apresentado não informa nome fantasia. Nenhuma assinatura, procuração ou autorização de representação foi presumida.`,
      `CONTRATANTE: ${c.legalName.trim()}, ${kindLabel}, inscrito no ${c.kind === 'pj' ? 'CNPJ' : 'CPF'} nº ${fmtDoc(c)}, com endereço em ${addr}, e-mail ${c.email.trim()}, telefone ${maskPhone(c.phone)}. Estabelecimento identificado comercialmente como ${c.tradeName.trim() || c.legalName.trim()}, segmento ${c.segment ? SEGMENT_LABEL[c.segment] : 'não informado'}, unidades abrangidas: ${c.units}.`,
      c.kind === 'pj'
        ? `Representante/signatário do contratante: ${s.name.trim()}, CPF ${maskCPF(s.document)}, cargo ou qualidade ${s.role.trim()}, e-mail de assinatura ${s.email.trim()}. O signatário declara possuir poderes para contratar, sujeitos a verificação quando necessária.`
        : `Signatário: o próprio contratante, ${s.name}, em nome próprio, e-mail de assinatura ${s.email}.`,
    ],
  }
  const trial = o.trial ? `teste gratuito de ${o.trial.days} dias, de ${formatCivil(o.trial.start)} a ${formatCivil(o.trial.end)}. ${t.trialRule}` : 'não se aplica'
  const annexA: DocSection = {
    id: 'anexo-a', title: 'Anexo A — quadro comercial integrante do contrato', paras: ['Itens não incluídos estão identificados expressamente como não contratados. O resumo exibido antes de assinar e este documento contêm os mesmos valores e condições.'], rows: [
      ['Plano e versão', `${o.planName} (versão ${o.planVersion}) — oferta ${o.offerVersion}`],
      ['Módulos incluídos', o.modules.map((m) => MODULE_LABEL[m]).join(', ')],
      ['Unidades', `até ${o.limits.units}; contratadas: ${c.units}`],
      ['Usuários / profissionais', `${o.limits.users} usuários; ${o.limits.professionals} profissionais`],
      ['Armazenamento', `${o.limits.storageGb} GB`],
      ['Franquias', `mensagens: ${yes(o.limits.messagesMonth, 'por mês')}; IA: ${yes(o.limits.aiCreditsMonth, 'créditos por mês')}; assinaturas eletrônicas: ${yes(t.signaturesIncluded, 'por mês')}`],
      ['Ciclo', CYCLE_NAME[o.cycle]],
      ['Valor total do ciclo', o.billing === 'proxima_fatura' ? `${formatBRL(o.totalCents)} (ajuste aplicado a partir da próxima fatura)` : formatBRL(o.totalCents)],
      ['Equivalente mensal (informativo)', formatBRL(o.monthlyEqCents)],
      ['Implantação/importação', o.setupFeeCents > 0 ? formatBRL(o.setupFeeCents) : 'não cobrada'],
      ['Desconto', o.discountText],
      ['Preço após o desconto', o.afterDiscountText],
      ['Excedentes', `mensagem ${formatBRL(o.overage.messageCents)}; GB/mês ${formatBRL(o.overage.storageGbCents)}; crédito de IA ${formatBRL(o.overage.aiCreditCents)}; profissional adicional/mês ${formatBRL(o.overage.extraProfessionalCents)} — somente com autorização prévia`],
      ['Meio de pagamento', `${GATEWAY_LABEL[t.gateway]} (conta da plataforma ${p.productName}, distinta das contas das clínicas)`],
      ['Vencimento', o.billing === 'sem_cobranca_no_teste' ? 'sem cobrança durante o teste' : `${t.paymentDueDays} dia(s) após a emissão da cobrança`],
      ['Teste gratuito', trial],
      ...TERMS_TEXT_FIELDS.filter((k) => k !== 'trialRule').map((k): [string, string] => [TERMS_LABEL[k], t[k]]),
      ['Data inicial', formatCivil(o.startDate)],
    ],
  }
  const clauses = parseBody(r.templateBody.replaceAll('{{contratada.privacidade}}', p.privacyContact ?? 'canal de privacidade ainda não definido pela contratada (pendência impeditiva de assinatura real)'))
  const registro: DocSection = { id: 'registro', title: 'Registro das partes', pageBreakBefore: true, paras: [
    `CONTRATADA: ${p.legalName} — CNPJ ${maskCNPJ(p.taxId)}. CONTRATANTE: ${c.legalName.trim()} — ${c.kind === 'pj' ? 'CNPJ' : 'CPF'} ${fmtDoc(c)}.`,
    'Signatários, método de identificação, identificadores de evento e data/hora com fuso constam da página de evidências do processo de assinatura, anexada a este documento sem alterar seu conteúdo.',
    'Testemunhas: não previstas no processo aprovado.',
  ] }
  const iB = clauses.findIndex((x) => x.title.startsWith('Anexo B'))
  const body = iB < 0 ? [...clauses, registro] : [...clauses.slice(0, iB), registro, ...clauses.slice(iB)]
  if (body[0]) body[0] = { ...body[0], pageBreakBefore: true }
  return [ident, annexA, ...body]
}

/** Resquícios proibidos no documento final. */
export function findPlaceholders(sections: DocSection[]): string[] {
  const bad = /\[[^\]]*\]|\{\{[^}]*\}\}|\bundefined\b|\bnull\b|\bNaN\b|a definir/i
  const out: string[] = []
  for (const s of sections) for (const v of [s.title, ...s.paras, ...(s.rows ?? []).flat()]) { const m = v.match(bad); if (m) out.push(`${s.title}: “${m[0]}”`) }
  return out
}
/** Hash do snapshot canônico (identificador de integridade). Hash sozinho não comprova autoria nem data. */
export function snapshotHash(sections: DocSection[]): string {
  return sha256Hex(JSON.stringify(sections.map((s) => [s.title, s.paras, s.rows ?? []])))
}
/** Para listas/visualização restrita: troca o CPF formatado pelo mascarado. */
export function maskSectionsCpf(sections: DocSection[], cpfs: string[]): DocSection[] {
  const pairs = cpfs.filter((x) => x.replace(/\D/g, '').length === 11).map((x) => [maskCPF(x), maskCPFPartial(x)] as const)
  const f = (v: string) => pairs.reduce((acc, [a, b]) => acc.replaceAll(a, b), v)
  return sections.map((s) => ({ ...s, paras: s.paras.map(f), rows: s.rows?.map(([k, v]) => [k, f(v)] as [string, string]) }))
}
export function sectionsToText(sections: DocSection[], header: string): string {
  return [header, '', ...sections.flatMap((s) => [`## ${s.title}`, '', ...s.paras.flatMap((p) => [p, '']), ...(s.rows ?? []).map(([k, v]) => `- ${k}: ${v}`), ''])].join('\n')
}

/** Impeditivos de assinatura REAL (provedor). A simulação segue permitida e sempre identificada. */
export function realSignatureBlockers(p: LegalProfile, terms: CommercialTerms, tpl: ContractTemplateVersion | undefined): string[] {
  const b: string[] = []
  if (!p.authorizedSignatory) b.push('Signatário autorizado da contratada não definido.')
  if (!p.contractChannel) b.push('Canal de comunicação contratual não definido.')
  if (!p.privacyContact) b.push('Canal de privacidade não definido.')
  if (!p.supportChannels.length) b.push('Canais e horários de suporte não definidos.')
  if (p.legalReviewStatus !== 'done') b.push('Revisão jurídica do contrato pendente.')
  if (p.commercialTermsStatus !== 'done' || terms.status !== 'approved') b.push('Quadro comercial não aprovado.')
  if (!tpl || tpl.status !== 'publicado') b.push('Nenhum modelo publicado com revisão jurídica e comercial.')
  if (!p.productionSignatureEnabled) b.push('Assinatura em produção desabilitada (provedor real não contratado/homologado).')
  if (p.signatureProvider !== 'future') b.push('Provedor de assinatura real não selecionado.')
  return b
}

export const CONTRACT_STATUS: Record<ContractStatus, [string, 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'brand']> = {
  draft: ['Rascunho', 'neutral'], ready_for_review: ['Em revisão', 'info'], pending_signatures: ['Aguardando assinaturas', 'warning'], partially_signed: ['Assinado parcialmente', 'warning'],
  signed: ['Assinado (todas as partes)', 'success'], declined: ['Recusado', 'danger'], expired: ['Expirado', 'neutral'], voided: ['Anulado', 'neutral'], superseded: ['Substituído', 'neutral'],
}
export const PAYMENT_STATUS: Record<PaymentStatus, [string, 'neutral' | 'info' | 'warning' | 'success' | 'danger']> = {
  not_created: ['Não criado', 'neutral'], pending: ['Pendente', 'info'], confirmed: ['Confirmado', 'success'], failed: ['Falhou', 'danger'], refunded: ['Estornado', 'warning'], disputed: ['Em disputa', 'warning'],
}
export const SAAS_STATUS: Record<SaasLifecycle, [string, 'neutral' | 'info' | 'warning' | 'success' | 'danger']> = {
  pending_activation: ['Aguardando ativação', 'info'], trialing: ['Em teste', 'info'], active: ['Ativa', 'success'], past_due: ['Em atraso', 'danger'], suspended: ['Suspensa', 'warning'], canceled: ['Cancelada', 'neutral'],
}
export const fmtWhen = (iso?: ISOInstant) => (iso ? `${formatDateTime(iso)} (horário de Brasília)` : 'pendente')
