// Tipos de domínio NÚCLEO compartilhados entre módulos.
// Tipos específicos de módulo ficam em src/modules/<modulo>/types.ts.
// Convenções: dinheiro em centavos (Cents), instantes ISO UTC, datas civis "YYYY-MM-DD".
import type { Cents } from '@/lib/money'
import type { CivilDate, ISOInstant } from '@/lib/dates'

export type ID = string

export interface Entity {
  id: ID
  tenantId: ID
  createdAt: ISOInstant
  updatedAt?: ISOInstant
}

// ---------- Plataforma / tenancy ----------
export type Segment = 'odontologia' | 'medicina' | 'veterinaria' | 'estetica' | 'psicologia' | 'fisioterapia' | 'nutricao'

export const SEGMENT_LABEL: Record<Segment, string> = {
  odontologia: 'Odontologia', medicina: 'Medicina ambulatorial', veterinaria: 'Veterinária', estetica: 'Estética',
  psicologia: 'Psicologia', fisioterapia: 'Fisioterapia', nutricao: 'Nutrição',
}

/** Módulos habilitáveis (feature flag por tenant). Habilitar módulo NÃO concede permissão. */
export type ModuleKey =
  | 'agenda' | 'recepcao' | 'pacientes' | 'prontuario' | 'documentos'
  | 'odontologia' | 'medicina' | 'veterinaria' | 'estetica' | 'psicologia' | 'fisioterapia' | 'nutricao' | 'multidisciplinar'
  | 'convenios' | 'crm' | 'orcamentos' | 'financeiro' | 'comissoes' | 'estoque' | 'compras'
  | 'comunicacao' | 'ia' | 'automacoes' | 'portal' | 'pwa' | 'importacao' | 'relatorios'

export const MODULE_LABEL: Record<ModuleKey, string> = {
  agenda: 'Agenda', recepcao: 'Recepção', pacientes: 'Pacientes', prontuario: 'Prontuário', documentos: 'Documentos',
  odontologia: 'Odontologia', medicina: 'Medicina', veterinaria: 'Veterinária', estetica: 'Estética', psicologia: 'Psicologia',
  fisioterapia: 'Fisioterapia', nutricao: 'Nutrição', multidisciplinar: 'Multidisciplinar', convenios: 'Convênios',
  crm: 'CRM', orcamentos: 'Orçamentos', financeiro: 'Financeiro', comissoes: 'Comissões e repasses', estoque: 'Estoque',
  compras: 'Compras', comunicacao: 'Comunicação', ia: 'IA (simulada)', automacoes: 'Automações', portal: 'Portal do paciente',
  pwa: 'App instalável (PWA)', importacao: 'Importação', relatorios: 'Relatórios',
}

export const BASE_MODULES: ModuleKey[] = ['agenda', 'recepcao', 'pacientes', 'prontuario', 'documentos', 'orcamentos', 'financeiro', 'portal', 'pwa', 'comunicacao', 'relatorios', 'importacao']

export interface BrandIdentity {
  /** Cor de marca informada pela clínica. Tokens acessíveis são DERIVADOS (lib/color). */
  primary: string
  /** Data URL (demo, local) ou URL persistente (futuro). */
  logoUrl?: string
  logoDarkUrl?: string
  symbolUrl?: string
  /** Fallback quando não há símbolo. */
  initials: string
  /** Versão da identidade (incrementa a cada publicação). */
  version: number
  themeMode: 'light' | 'dark' | 'system'
}

export type TenantStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled' | 'onboarding'

export interface Organization {
  id: ID
  slug: string
  name: string
  legalName: string
  document: string // CNPJ fictício
  segment: Segment
  modules: ModuleKey[]
  brand: BrandIdentity
  status: TenantStatus
  planId: ID
  timezone: string
  contactEmail: string // domínio .exemplo / .test — nunca acionável
  contactPhone: string
  city: string
  /** Disponível no seletor de demonstração (tem dados completos gerados por seed). */
  demo: boolean
  /** Criada pelo visitante na demonstração (sem seed; começa vazia). */
  sandbox?: boolean
  createdAt: ISOInstant
  onboarding?: { step: number; completed: boolean; data?: Record<string, unknown> }
  publicPage: { enabled: boolean; headline: string; about: string; showPrices: boolean; showProfessionals: boolean }
  domain?: { hostname?: string; status: 'nenhum' | 'pendente' | 'verificando' | 'verificado' | 'erro'; customHostname?: string }
}

export interface Unit extends Entity {
  name: string
  document?: string
  timezone: string
  address: string
  phone: string
  /** Horário de funcionamento por dia da semana (0=dom). Intervalos em minutos do dia. */
  hours: Record<number, { start: number; end: number }[]>
  holidays: { date: CivilDate; name: string }[]
  specialHours: { date: CivilDate; intervals: { start: number; end: number }[]; reason: string }[]
  /** Overrides de configuração por unidade (herança da rede). */
  overrides?: Record<string, unknown>
}

export type ResourceKind = 'sala' | 'cadeira' | 'equipamento' | 'box' | 'consultorio'
export interface Resource extends Entity {
  unitId: ID
  kind: ResourceKind
  name: string
  active: boolean
  /** Indisponibilidades (manutenção etc.) */
  blocks: { start: ISOInstant; end: ISOInstant; reason: string }[]
}

export interface Professional extends Entity {
  name: string
  council: string // ex.: "CRO-SP 00000 (fictício)"
  specialty: string
  unitIds: ID[]
  color: string
  userId?: ID
  /** Jornada semanal por unidade. */
  schedule: { unitId: ID; weekday: number; start: number; end: number }[]
  absences: { start: ISOInstant; end: ISOInstant; reason: string }[]
  active: boolean
}

export interface Service extends Entity {
  name: string
  category: string
  durationMin: number
  bufferMin: number
  priceCents: Cents
  /** Tipos de recurso exigidos (ex.: cadeira odontológica). */
  resourceKinds: ResourceKind[]
  /** Código interno (TUSS/procedimento apenas demonstrativo). */
  code?: string
  /** Ficha técnica: consumo de insumos (estoque) na conclusão. */
  kit?: { productId: ID; qty: number }[]
  publicBookable: boolean
  depositPercent?: number
  active: boolean
}

// ---------- Identidade / acesso ----------
export type PlatformRole = 'platform_owner' | 'platform_finance' | 'platform_support'
export type TenantRole = 'clinic_owner' | 'network_manager' | 'unit_manager' | 'reception' | 'professional' | 'assistant' | 'finance' | 'inventory'
export type PortalRole = 'patient' | 'tutor' | 'guardian'
export type Role = PlatformRole | TenantRole | PortalRole

export interface Membership {
  role: TenantRole
  /** 'all' = todas as unidades da organização. */
  unitIds: ID[] | 'all'
}

export interface StaffUser extends Entity {
  name: string
  email: string
  memberships: Membership[]
  professionalId?: ID
  active: boolean
  mfa: boolean
}

export interface PlatformUser {
  id: ID
  name: string
  email: string
  role: PlatformRole
  active: boolean
}

// ---------- Pessoas, pacientes, animais ----------
/** Pessoa: tutor, responsável legal/financeiro, ou o próprio paciente adulto (identidade de portal). */
export interface Person extends Entity {
  name: string
  cpf?: string // fictício
  birthDate?: CivilDate
  phone?: string
  email?: string
  communication: { whatsapp: boolean; email: boolean; push: boolean; marketing: boolean; quietHours?: { start: number; end: number } }
}

export interface Patient extends Entity {
  kind: 'human' | 'animal'
  name: string
  socialName?: string
  birthDate?: CivilDate
  birthDateEstimated?: boolean
  sex?: 'F' | 'M' | 'I' | 'nao_informado'
  cpf?: string
  phone?: string
  email?: string
  /** Pessoa que representa o próprio paciente (adulto). */
  personId?: ID
  // animal
  species?: string
  breed?: string
  coat?: string
  microchip?: string
  weights?: { date: CivilDate; kg: number }[]
  // comuns
  insurance?: { name: string; cardNumber: string; plan?: string; validUntil?: CivilDate }
  allergies: string[]
  /** Alertas clínicos: exibidos somente a quem tem permissão clinical:read. */
  clinicalAlerts: string[]
  tags: string[]
  unitId: ID
  status: 'ativo' | 'inativo'
  pendingDocuments: string[]
  sharing: { portal: boolean; multidisciplinar: boolean }
  /** Sugestões de duplicidade para revisão (nunca merge automático). */
  duplicateOf?: ID[]
}

export type LinkRelation = 'self' | 'tutor' | 'responsavel_legal' | 'responsavel_financeiro'
export interface PatientLink extends Entity {
  patientId: ID
  personId: ID
  relation: LinkRelation
  /** Permissões separadas no portal. */
  canSeeClinical: boolean
  canSeeFinancial: boolean
  canSchedule: boolean
}

// ---------- Agenda ----------
export type AppointmentStatus = 'solicitada' | 'aguardando_confirmacao' | 'confirmada' | 'chegou' | 'em_atendimento' | 'concluida' | 'faltou' | 'cancelada'

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  solicitada: 'Solicitada', aguardando_confirmacao: 'Aguardando confirmação', confirmada: 'Confirmada', chegou: 'Chegou',
  em_atendimento: 'Em atendimento', concluida: 'Concluída', faltou: 'Faltou', cancelada: 'Cancelada',
}

export interface StatusChange<S extends string = string> {
  at: ISOInstant
  from: S | null
  to: S
  by: string
  reason?: string
}

export interface Appointment extends Entity {
  unitId: ID
  patientId: ID
  professionalId: ID
  serviceId: ID
  resourceIds: ID[]
  start: ISOInstant
  end: ISOInstant
  status: AppointmentStatus
  history: StatusChange<AppointmentStatus>[]
  source: 'recepcao' | 'publico' | 'portal' | 'ia' | 'lista_espera' | 'importacao'
  seriesId?: ID
  notes?: string // administrativas
  /** Token demonstrativo de check-in (curta duração). Nunca contém dados clínicos. */
  checkIn?: { token: string; expiresAt: ISOInstant; usedAt?: ISOInstant; ticket?: string }
  arrivedAt?: ISOInstant
  startedAt?: ISOInstant
  finishedAt?: ISOInstant
  calledAt?: ISOInstant
  /** Status financeiro separado do de agendamento. */
  financialStatus: 'nao_cobrado' | 'cobrado' | 'pago' | 'parcial' | 'isento'
  /** Estoque já consumido (garante consumo único). */
  stockConsumedAt?: ISOInstant
  conflictAcknowledged?: boolean
}

export interface WaitlistEntry extends Entity {
  unitId: ID
  patientId: ID
  serviceId: ID
  professionalId?: ID
  durationMin: number
  /** Disponibilidade declarada. */
  availability: { weekday: number; start: number; end: number }[]
  priority: 'normal' | 'alta'
  notes?: string
  status: 'aguardando' | 'ofertado' | 'aceito' | 'expirado' | 'removido'
  offer?: { appointmentSlot: { start: ISOInstant; end: ISOInstant; professionalId: ID; resourceIds: ID[] }; expiresAt: ISOInstant; offeredAt: ISOInstant }
}

// ---------- Clínico ----------
export type RecordStatus = 'rascunho' | 'revisado' | 'finalizado'
export interface Addendum { id: ID; at: ISOInstant; authorId: ID; authorName: string; reason: string; text: string }

export interface ClinicalRecord extends Entity {
  patientId: ID
  appointmentId?: ID
  professionalId: ID
  specialty: Segment | 'multidisciplinar'
  templateId: string
  templateVersion: number
  title: string
  /** Conteúdo estruturado conforme template (valores por fieldId). */
  content: Record<string, unknown>
  status: RecordStatus
  addenda: Addendum[]
  /** 'restrito' = somente autor/profissionais com clinical.restricted (ex.: psicologia). */
  confidentiality: 'padrao' | 'restrito'
  /** Orientações liberadas ao portal (texto separado do registro). */
  portalGuidance?: string
  releasedToPortal: boolean
  finalizedAt?: ISOInstant
  history: StatusChange<RecordStatus>[]
}

export type DocumentKind = 'receita' | 'atestado' | 'orientacao' | 'recibo' | 'termo' | 'laudo' | 'pedido_exame' | 'encaminhamento' | 'declaracao' | 'contrato' | 'relatorio'
export interface SignatureFlow {
  status: 'nao_requerida' | 'pendente' | 'parcial' | 'assinado' | 'recusado' | 'expirado'
  provider: 'demonstracao'
  signers: { name: string; role: string; order: number; status: 'pendente' | 'assinado' | 'recusado'; at?: ISOInstant; method?: 'rubrica_demo' | 'aceite_demo' }[]
  expiresAt?: ISOInstant
  trail: { at: ISOInstant; event: string }[]
}
export interface ClinicDocument extends Entity {
  patientId: ID
  kind: DocumentKind
  title: string
  body: string
  templateId?: string
  templateVersion?: number
  status: 'rascunho' | 'emitido' | 'cancelado'
  releasedToPortal: boolean
  confidentiality: 'padrao' | 'restrito'
  signature: SignatureFlow
  createdBy: ID
  /** Sempre true nesta fase: documento sem validade legal/fiscal. */
  demoWatermark: true
}

export interface FileAsset extends Entity {
  patientId: ID
  category: 'exame' | 'imagem_intraoral' | 'radiografia' | 'foto_clinica' | 'antes_depois' | 'documento' | 'outro'
  name: string
  mime: string
  sizeBytes: number
  /** Versões (substituição versionada). Original nunca é recomprimido. */
  versions: { version: number; at: ISOInstant; by: ID; dataUrl?: string; note?: string }[]
  thumbnailUrl?: string
  consent?: { clinical: boolean; marketing: boolean }
  restricted: boolean
}

// ---------- Plano de tratamento / orçamento ----------
export type TreatmentItemStatus = 'planejado' | 'orcado' | 'aprovado' | 'em_execucao' | 'concluido' | 'cancelado' | 'recusado'
export interface TreatmentItem extends Entity {
  patientId: ID
  professionalId?: ID
  serviceId: ID
  description: string
  /** Origem: odontograma (dente/face), mapa estético, manual... */
  origin: { kind: 'odontograma' | 'mapa_estetico' | 'manual' | 'plano_cuidado'; tooth?: number; faces?: string[]; region?: string; refId?: ID }
  priceCents: Cents
  status: TreatmentItemStatus
  proposalId?: ID
}

export type ProposalStatus = 'rascunho' | 'enviada' | 'visualizada' | 'aceita' | 'aceita_parcial' | 'recusada' | 'expirada' | 'revogada'
export interface ProposalItem {
  id: ID
  treatmentItemId?: ID
  serviceId: ID
  description: string
  qty: number
  unitCents: Cents
  discountCents: Cents
  /** Itens com mesmo optionGroup são alternativas: aceitar no máximo um. */
  optionGroup?: string
  optional?: boolean
  explanation?: string
}
export interface Proposal extends Entity {
  unitId: ID
  patientId: ID
  professionalId?: ID
  number: string
  version: number
  /** Token opaco aleatório (demo). Produção: token com expiração/revogação e autenticação. */
  token: string
  items: ProposalItem[]
  validUntil: CivilDate
  maxInstallments: number
  conditions: string
  maxDiscountPercent: number
  financialResponsibleId?: ID
  status: ProposalStatus
  acceptedItemIds: ID[]
  chosenInstallments?: number
  questions: { id: ID; at: ISOInstant; from: 'paciente' | 'clinica'; text: string }[]
  signature?: SignatureFlow
  history: StatusChange<ProposalStatus>[]
  /** IDs das cobranças geradas (evita duplicidade em novo aceite). */
  chargeIds: ID[]
  estimatedCostCents?: Cents
}

// ---------- Financeiro da clínica (Contexto B) ----------
export type PaymentMethod = 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'dinheiro' | 'pix_manual' | 'convenio' | 'link_pagamento'
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', boleto: 'Boleto', dinheiro: 'Dinheiro',
  pix_manual: 'Pix manual (comprovante)', convenio: 'Convênio', link_pagamento: 'Link de pagamento',
}
export type ProviderKey = 'infinitepay' | 'asaas' | 'mercadopago' | 'manual'

export interface Payment {
  id: ID
  at: ISOInstant
  amountCents: Cents
  method: PaymentMethod
  provider: ProviderKey
  providerPaymentId?: string
  /** Data de disponibilidade do dinheiro (difere do recebimento). */
  availableOn?: CivilDate
  /** 'recusado' = comprovante de Pix manual recusado (mantido no histórico, sem efeito no saldo). */
  status: 'confirmado' | 'pendente_aprovacao' | 'estornado' | 'chargeback' | 'recusado'
  simulated: true
  cashSessionId?: ID
  receivedBy: ID
  /** Reversões vinculadas (nunca apagar pagamento liquidado). */
  reversalOf?: ID
}

export type ChargeStatus = 'aberta' | 'parcial' | 'paga' | 'vencida' | 'cancelada' | 'estornada'
export interface Charge extends Entity {
  unitId: ID
  patientId: ID
  payerPersonId?: ID
  origin: { kind: 'proposta' | 'consulta' | 'pacote' | 'manual' | 'acordo' | 'convenio'; refId?: ID }
  description: string
  competenceDate: CivilDate
  dueDate: CivilDate
  amountCents: Cents
  /** Juros/multa/desconto aplicados (configurados), em centavos. */
  adjustmentsCents: Cents
  installment: { n: number; of: number; groupId: ID }
  status: ChargeStatus
  payments: Payment[]
  refunds: { id: ID; at: ISOInstant; amountCents: Cents; reason: string; paymentId: ID; kind: 'estorno' | 'reembolso' | 'chargeback' }[]
  professionalId?: ID
  serviceId?: ID
  costCenter?: string
  category: string
}

// ---------- Comunicação (outbox) ----------
export type Channel = 'whatsapp' | 'email' | 'push'
export type NotificationEvent =
  | 'convite' | 'recuperacao_acesso' | 'consulta_solicitada' | 'confirmacao' | 'lembrete' | 'reagendamento' | 'cancelamento'
  | 'vaga_ofertada' | 'checkin' | 'documento_disponivel' | 'proposta_disponivel' | 'aceite' | 'cobranca_proxima' | 'atraso'
  | 'pagamento_confirmado' | 'retorno' | 'vacina' | 'sessao' | 'estoque_baixo' | 'integracao_falha' | 'assinatura_saas_vencendo'

export interface OutboxMessage extends Entity {
  event: NotificationEvent
  channel: Channel
  recipientName: string
  recipientRef: string // id da pessoa/usuário, nunca o contato real
  subject: string
  preview: string
  dedupeKey: string
  /** aceito_provedor ≠ entregue ≠ lido. */
  status: 'pendente' | 'aguardando_janela' | 'aceito_provedor' | 'entregue' | 'lido' | 'falhou' | 'falha_definitiva' | 'suprimido' | 'duplicado'
  attempts: { at: ISOInstant; result: string }[]
  scheduledFor?: ISOInstant
  simulated: true
  link?: string
}

export interface AuditEvent extends Entity {
  actorId: ID
  actorName: string
  action: string
  resource: string
  resourceId?: ID
  detail?: string
  unitId?: ID
}
