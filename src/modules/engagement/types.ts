// Tipos privados do módulo de relacionamento (comunicação, IA simulada, automações).
// Coleções novas por declaration merging. Tudo DEMONSTRATIVO: sem envio real, sem credenciais.
import type { Channel, Entity, ID, NotificationEvent, TenantRole } from '@/domain/types'
import type { IntegrationProviderKey, IntegrationStatus } from '@/domain/platform'
import type { ISOInstant } from '@/lib/dates'

export type TemplateCategory = 'transacional' | 'marketing'
export type Recipient = 'paciente_responsavel' | 'equipe' | 'proprietario' | 'convidado'

export interface NotificationTemplate extends Entity {
  event: NotificationEvent
  /** Nome próprio (ex.: comunicação de marketing); senão usa o rótulo do evento. */
  name?: string
  category: TemplateCategory
  recipient: Recipient
  channels: Record<Channel, boolean>
  bodies: { whatsapp: string; push: string; emailSubject: string; email: string }
  version: number
  history: { version: number; at: ISOInstant; by: string; note?: string }[]
  active: boolean
}

export type AutomationTrigger = 'appointment.cancelled' | 'proposal.pending' | 'lot.expiring' | 'record.finalized' | 'vaccine.due' | 'payment.confirmed' | 'proposal.accepted'
export type AutomationAction = 'offer_waitlist' | 'crm_task' | 'stock_alert' | 'send_reminder' | 'notify_patient'
export type CondOp = 'eq' | 'neq' | 'gte' | 'lte'
export interface AutomationCondition { field: string; op: CondOp; value: string }
export interface AutomationLimits {
  /** Máximo de execuções por pessoa por dia (0 = sem limite). */
  maxPerPersonPerDay: number
  /** Janela permitida para efeitos que contatam pessoas (minutos do dia, fuso da unidade). */
  windowStart: number
  windowEnd: number
}
export interface Automation extends Entity {
  name: string
  template?: 'cancel_waitlist' | 'proposal_followup' | 'lot_expiry' | 'return_reminder'
  trigger: AutomationTrigger
  conditions: AutomationCondition[]
  action: AutomationAction
  /** days: limiar definido PELO USUÁRIO (nunca periodicidade clínica universal). */
  params: { days?: number; maxOffers?: number }
  waitMinutes: number
  limits: AutomationLimits
  active: boolean
  version: number
  updatedBy?: string
}
export type RunStatus = 'executada' | 'ignorada' | 'limitada' | 'adiada' | 'falhou' | 'simulada'
export interface AutomationRun extends Entity {
  automationId: ID
  automationName: string
  trigger: string
  status: RunStatus
  /** Pessoas contatadas/afetadas (para limite por pessoa/dia). */
  personRefs: string[]
  /** Chave do gatilho (evita reexecução para o mesmo fato). */
  ctxKey: string
  subject: string
  detail: string
  actions: string[]
  source: 'evento' | 'varredura' | 'adiada' | 'sistema'
  /** Execução adiada (janela/horário permitido): contexto mínimo para reprocessar. */
  deferredUntil?: ISOInstant
  deferredCtx?: TriggerCtx
  processedAt?: ISOInstant
}

/** Contexto mínimo de um gatilho (sem conteúdo clínico). */
export interface TriggerCtx {
  key: string
  subject: string
  personRef?: string
  personName?: string
  patientId?: ID
  fields: Record<string, string | number>
  slot?: { start: string; end: string; professionalId: ID; unitId: ID; serviceId?: ID; resourceIds: ID[] }
  refId?: ID
  dueOn?: string
}

export interface WaMessage { id: ID; at: ISOInstant; from: 'contato' | 'clinica' | 'sistema'; author?: string; text: string; media?: { kind: 'imagem' | 'audio' | 'documento'; name: string }; status?: 'aceito_provedor' | 'falhou' }
export interface WaConversation extends Entity {
  personRef?: ID
  name: string
  phoneMasked: string
  status: 'aberta' | 'aguardando_humano' | 'em_atendimento_humano' | 'encerrada'
  unread: number
  handoff?: { toId: ID; toName: string; at: ISOInstant; reason: string }
  messages: WaMessage[]
}

export type ClinicIntegrationKind = 'pagamento' | 'email' | 'whatsapp' | 'interface'
export interface ClinicIntegration extends Entity {
  provider: IntegrationProviderKey
  kind: ClinicIntegrationKind
  status: IntegrationStatus
  environment: 'sandbox' | 'producao' | 'simulado'
  lastEvent?: { at: ISOInstant; type: string; result: 'ok' | 'erro' | 'duplicado' | 'ignorado' }
  /** Logs SANITIZADOS (sem token, sem dado pessoal). */
  logs: { at: ISOInstant; level: 'info' | 'aviso' | 'erro'; message: string }[]
  /** Identificação da instância (placeholder; nunca credencial). */
  instanceLabel?: string
}

export interface EmailDomain extends Entity {
  domain: string
  status: 'nao_verificado' | 'pendente' | 'verificado' | 'falhou'
  records: { kind: 'SPF' | 'DKIM' | 'DMARC'; status: 'nao_verificado' | 'pendente' | 'verificado' | 'falhou' }[]
  lastCheckAt?: ISOInstant
}
export interface EmailConfig extends Entity {
  fromMode: 'plataforma' | 'proprio'
  fromLocal: string
  customDomainId?: ID
  displayName: string
  replyTo: string
}
export interface Suppression extends Entity {
  address: string
  reason: 'bounce' | 'complaint' | 'manual' | 'opt_out'
  note?: string
}

/** Regras de envio do tenant (singleton id 'main'). */
export interface CommConfig extends Entity {
  /** Horário silencioso {start,end} em minutos do dia (fuso da unidade). Permitido = complemento. */
  quietHours: { start: number; end: number }
  fallback: Record<Channel, Channel | 'nenhum'>
  maxAttempts: number
}

export type AlertKey = 'estoque_baixo' | 'integracao_falha' | 'assinatura_saas_vencendo' | 'falha_envio' | 'atendimento_humano' | 'pagamento_confirmado' | 'proposta_aceita'
export interface StaffAlertPref extends Entity {
  role: TenantRole
  alerts: Record<AlertKey, boolean>
}

export interface HandoffTask extends Entity {
  source: 'ia' | 'whatsapp' | 'automacao'
  priority: 'urgente' | 'normal'
  reason: string
  personRef?: ID
  name: string
  status: 'aberta' | 'em_andamento' | 'concluida'
  assigneeId?: ID
  assigneeName?: string
  conversationId?: ID
}

export interface AiLog extends Entity {
  kind: 'recepcionista' | 'busca' | 'resumo'
  intent: string
  tools: string[]
  flags: ('urgencia' | 'injecao' | 'sem_permissao' | 'limite')[]
  credits: number
}

declare module '@/data/store' {
  interface TenantCollections {
    notificationTemplates: NotificationTemplate[]
    automations: Automation[]
    automationRuns: AutomationRun[]
    waConversations: WaConversation[]
    clinicIntegrations: ClinicIntegration[]
    emailDomains: EmailDomain[]
    emailConfig: EmailConfig[]
    suppressions: Suppression[]
    staffAlertPrefs: StaffAlertPref[]
    handoffTasks: HandoffTask[]
    aiLogs: AiLog[]
    commConfig: CommConfig[]
  }
}
