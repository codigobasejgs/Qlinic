// Domínio da PLATAFORMA (Contexto A: clínica paga assinatura à Qlinic).
// Nunca misturar com receita de pacientes (Contexto B, src/domain/types.ts Charge).
import type { Cents } from '@/lib/money'
import type { CivilDate, ISOInstant } from '@/lib/dates'
import type { ID, ModuleKey, Organization, PlatformUser } from './types'

export type BillingCycle = 'mensal' | 'trimestral' | 'anual'
export const CYCLE_MONTHS: Record<BillingCycle, number> = { mensal: 1, trimestral: 3, anual: 12 }

export interface PlanLimits {
  users: number
  professionals: number
  units: number
  storageGb: number
  messagesMonth: number
  aiCreditsMonth: number
}
export interface Plan {
  id: ID
  name: string
  description: string
  /** Preço DEMONSTRATIVO e editável, por ciclo (centavos, valor do ciclo inteiro). */
  prices: Record<BillingCycle, Cents>
  limits: PlanLimits
  modules: ModuleKey[]
  /** Excedentes por unidade além da franquia. */
  overage: { messageCents: Cents; storageGbCents: Cents; aiCreditCents: Cents; extraProfessionalCents: Cents }
  upgradeRule: 'imediato_pro_rata' | 'proximo_ciclo'
  downgradeRule: 'proximo_ciclo' | 'imediato_sem_reembolso'
  active: boolean
  version: number
}

export type SubscriptionStatus = 'trial' | 'ativa' | 'inadimplente' | 'pausada' | 'cancelada' | 'expirada'
export interface Subscription {
  id: ID
  tenantId: ID
  planId: ID
  cycle: BillingCycle
  status: SubscriptionStatus
  startedAt: CivilDate
  currentPeriodEnd: CivilDate
  trial?: { start: CivilDate; end: CivilDate; extensions: { at: ISOInstant; days: number; reason: string; by: string }[]; convertedAt?: CivilDate }
  coupon?: { code: string; percent: number; validUntil: CivilDate }
  /** Desconto manual com validade. */
  discount?: { percent: number; validUntil: CivilDate; reason: string }
  cancelAt?: CivilDate
  cancelReason?: string
  pausedAt?: CivilDate
  history: { at: ISOInstant; event: string; by: string }[]
}

export interface SaasInvoice {
  id: ID
  tenantId: ID
  subscriptionId: ID
  number: string
  competence: string // YYYY-MM
  dueDate: CivilDate
  amountCents: Cents
  status: 'aberta' | 'paga' | 'vencida' | 'estornada' | 'cancelada'
  gateway: 'asaas' | 'mercadopago' | 'infinitepay'
  paidAt?: ISOInstant
  providerRef?: string
  reconciled: boolean
  simulated: true
}

export interface Coupon { id: ID; code: string; percent: number; validUntil: CivilDate; maxUses: number; uses: number; active: boolean }

export interface UsageRecord {
  id: ID
  tenantId: ID
  month: string // YYYY-MM
  storageGb: number
  messages: number
  aiCredits: number
  /** Custo estimado de infraestrutura/provedores (centavos). */
  estCostCents: Cents
}

export type IntegrationProviderKey = 'infinitepay' | 'asaas' | 'mercadopago' | 'resend' | 'evolution' | 'pix_manual' | 'assinatura' | 'ia' | 'teleatendimento' | 'prescricao' | 'nfse'
export type IntegrationStatus = 'desconectada' | 'configurando' | 'conectada' | 'degradada' | 'expirada' | 'erro' | 'simulada'

export interface IntegrationHealth {
  id: ID
  /** null = conta da própria plataforma (Contexto A). */
  tenantId: ID | null
  provider: IntegrationProviderKey
  context: 'plataforma' | 'clinica'
  status: IntegrationStatus
  environment: 'sandbox' | 'producao' | 'simulado'
  lastEventAt?: ISOInstant
  errorRate: number // 0..1
  queue: { pending: number; failed: number; retrying: number }
  events: { id: ID; at: ISOInstant; type: string; result: 'ok' | 'erro' | 'duplicado' | 'ignorado'; detail: string }[]
}

export interface DomainConfig {
  id: ID
  tenantId: ID
  kind: 'subdominio' | 'proprio'
  hostname: string
  status: 'pendente' | 'verificando' | 'verificado' | 'erro' | 'removido'
  certificate: 'nao_emitido' | 'pendente' | 'ativo' | 'expirando' | 'erro'
  brandVersion: number
  lastCheckAt?: ISOInstant
  diagnostics: string[]
}

export interface SupportTicket {
  id: ID
  tenantId: ID
  number: string
  subject: string
  description: string
  priority: 'baixa' | 'media' | 'alta' | 'critica'
  status: 'aberto' | 'em_andamento' | 'aguardando_cliente' | 'resolvido' | 'fechado'
  assigneeId?: ID
  createdAt: ISOInstant
  slaHours: number
  attachments: { name: string; sizeKb: number }[]
  messages: { at: ISOInstant; from: 'cliente' | 'suporte'; author: string; text: string }[]
  /** Acesso assistido: exige motivo, autorização da clínica, prazo e registro. */
  assistedAccess?: { reason: string; requestedAt: ISOInstant; requestedBy: string; status: 'solicitado' | 'autorizado' | 'negado' | 'expirado' | 'revogado'; expiresAt?: ISOInstant; authorizedBy?: string; scope: 'configuracoes' | 'agenda' | 'financeiro' }
}

export interface FeatureFlag { id: ID; key: string; description: string; enabledGlobally: boolean; tenantOverrides: Record<ID, boolean>; rollout: number }
export interface Incident { id: ID; title: string; severity: 'menor' | 'maior' | 'critico'; status: 'investigando' | 'identificado' | 'monitorando' | 'resolvido'; startedAt: ISOInstant; resolvedAt?: ISOInstant; components: string[]; updates: { at: ISOInstant; text: string }[] }
export interface Announcement { id: ID; title: string; body: string; audience: 'todos' | 'owners' | 'plano'; publishedAt?: ISOInstant; active: boolean }
export interface ChangelogEntry { id: ID; version: string; date: CivilDate; items: string[] }
export interface PlatformAudit { id: ID; at: ISOInstant; actor: string; action: string; target: string; detail?: string }
export interface DataRequest { id: ID; tenantId: ID; kind: 'exportacao' | 'encerramento'; status: 'recebida' | 'em_analise' | 'aprovada' | 'concluida' | 'recusada'; requestedAt: ISOInstant; requestedBy: string; notes: string }

declare module '@/data/store' {
  interface PlatformCollections {
    organizations: Organization[]
    plans: Plan[]
    subscriptions: Subscription[]
    saasInvoices: SaasInvoice[]
    coupons: Coupon[]
    usage: UsageRecord[]
    integrations: IntegrationHealth[]
    domains: DomainConfig[]
    tickets: SupportTicket[]
    flags: FeatureFlag[]
    incidents: Incident[]
    announcements: Announcement[]
    changelog: ChangelogEntry[]
    platformAudit: PlatformAudit[]
    dataRequests: DataRequest[]
    platformUsers: PlatformUser[]
  }
}
