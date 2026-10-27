// Catálogo dos eventos de comunicação (spec §15) + rótulos. Sem React.
import type { Channel, NotificationEvent, OutboxMessage, TenantRole } from '@/domain/types'
import type { Recipient, TemplateCategory, AlertKey, AutomationTrigger, AutomationAction } from './types'

export interface EventMeta {
  label: string
  recipient: Recipient
  scope: string
  category: TemplateCategory
  channels: Channel[]
  /** Texto padrão SEM diagnóstico/procedimento. Variáveis: {{nome}} {{clinica}} {{data}} {{link}}. */
  text: string
  subject: string
}

const P: Recipient = 'paciente_responsavel'
export const EVENTS: Record<NotificationEvent, EventMeta> = {
  convite: { label: 'Convite de acesso', recipient: 'convidado', scope: 'Equipe convidada e portal', category: 'transacional', channels: ['email'], subject: 'Convite para acessar {{clinica}}', text: 'Olá, {{nome}}. Você foi convidado(a) para acessar {{clinica}}. Ative seu acesso: {{link}}' },
  recuperacao_acesso: { label: 'Recuperação de acesso', recipient: P, scope: 'Portal e equipe (quem solicitou)', category: 'transacional', channels: ['email'], subject: 'Redefinição de acesso — {{clinica}}', text: 'Recebemos um pedido de redefinição de acesso. Se foi você, use o link: {{link}}. Se não foi, ignore esta mensagem.' },
  consulta_solicitada: { label: 'Consulta solicitada', recipient: P, scope: 'Paciente/tutor da solicitação', category: 'transacional', channels: ['whatsapp', 'email'], subject: 'Solicitação recebida — {{clinica}}', text: 'Olá, {{nome}}. Recebemos sua solicitação para {{data}}. Ainda não é uma reserva confirmada. Acompanhe: {{link}}' },
  confirmacao: { label: 'Confirmação de consulta', recipient: P, scope: 'Paciente/tutor do agendamento', category: 'transacional', channels: ['whatsapp', 'email'], subject: 'Atendimento confirmado — {{clinica}}', text: 'Olá, {{nome}}. Seu atendimento em {{clinica}} está confirmado para {{data}}. Detalhes no portal: {{link}}' },
  lembrete: { label: 'Lembrete de consulta', recipient: P, scope: 'Paciente/tutor do agendamento', category: 'transacional', channels: ['whatsapp', 'push'], subject: 'Lembrete — {{clinica}}', text: 'Lembrete: você tem um horário em {{clinica}} em {{data}}. Detalhes no portal: {{link}}' },
  reagendamento: { label: 'Reagendamento', recipient: P, scope: 'Paciente/tutor do agendamento', category: 'transacional', channels: ['whatsapp', 'email'], subject: 'Horário alterado — {{clinica}}', text: 'Seu horário em {{clinica}} foi alterado para {{data}}. Confira no portal: {{link}}' },
  cancelamento: { label: 'Cancelamento', recipient: P, scope: 'Paciente/tutor do agendamento', category: 'transacional', channels: ['whatsapp', 'email'], subject: 'Atendimento cancelado — {{clinica}}', text: 'Seu horário de {{data}} em {{clinica}} foi cancelado. Para remarcar: {{link}}' },
  vaga_ofertada: { label: 'Vaga ofertada (lista de espera)', recipient: P, scope: 'Pessoas compatíveis na lista de espera', category: 'transacional', channels: ['whatsapp'], subject: 'Vaga disponível — {{clinica}}', text: 'Surgiu uma vaga em {{data}}. Não é reserva até você confirmar no portal: {{link}}' },
  checkin: { label: 'Check-in registrado', recipient: P, scope: 'Paciente/tutor presente', category: 'transacional', channels: ['push'], subject: 'Chegada registrada', text: 'Sua chegada em {{clinica}} foi registrada. Aguarde a chamada.' },
  documento_disponivel: { label: 'Documento disponível', recipient: P, scope: 'Paciente/tutor com acesso ao documento', category: 'transacional', channels: ['email', 'push'], subject: 'Novo documento no portal — {{clinica}}', text: 'Há um novo documento disponível no portal de {{clinica}}. Acesse com sua conta: {{link}}' },
  proposta_disponivel: { label: 'Proposta disponível', recipient: P, scope: 'Paciente/responsável financeiro', category: 'transacional', channels: ['email', 'whatsapp'], subject: 'Sua proposta está disponível — {{clinica}}', text: 'Olá, {{nome}}. Sua proposta de {{clinica}} está disponível para consulta: {{link}}' },
  aceite: { label: 'Aceite de proposta', recipient: P, scope: 'Responsável que aceitou', category: 'transacional', channels: ['email'], subject: 'Aceite registrado — {{clinica}}', text: 'Registramos seu aceite em {{data}}. A cópia está no portal: {{link}}' },
  cobranca_proxima: { label: 'Cobrança próxima', recipient: P, scope: 'Responsável financeiro', category: 'transacional', channels: ['whatsapp', 'email'], subject: 'Vencimento próximo — {{clinica}}', text: 'Há uma cobrança de {{clinica}} com vencimento em {{data}}. Veja no portal: {{link}}' },
  atraso: { label: 'Cobrança em atraso', recipient: P, scope: 'Responsável financeiro', category: 'transacional', channels: ['email'], subject: 'Pagamento pendente — {{clinica}}', text: 'Identificamos uma cobrança pendente de {{clinica}}. Se já pagou, desconsidere. Detalhes: {{link}}' },
  pagamento_confirmado: { label: 'Pagamento confirmado', recipient: P, scope: 'Responsável financeiro', category: 'transacional', channels: ['email'], subject: 'Pagamento confirmado — {{clinica}}', text: 'Confirmamos o recebimento do seu pagamento. Recibo no portal: {{link}}' },
  retorno: { label: 'Retorno', recipient: P, scope: 'Paciente/tutor (data definida pelo profissional)', category: 'transacional', channels: ['whatsapp', 'email'], subject: 'Retorno — {{clinica}}', text: 'Olá, {{nome}}. O profissional indicou um retorno por volta de {{data}}. Agende pelo portal: {{link}}' },
  vacina: { label: 'Vacina/aplicação', recipient: P, scope: 'Tutor/paciente (data definida pelo profissional)', category: 'transacional', channels: ['whatsapp', 'push'], subject: 'Aplicação programada — {{clinica}}', text: 'Há uma aplicação programada pelo profissional para {{data}}. Agende pelo portal: {{link}}' },
  sessao: { label: 'Sessão de pacote/plano', recipient: P, scope: 'Paciente do pacote/plano', category: 'transacional', channels: ['whatsapp'], subject: 'Próxima sessão — {{clinica}}', text: 'Sua próxima sessão em {{clinica}} é {{data}}. Detalhes no portal: {{link}}' },
  estoque_baixo: { label: 'Estoque baixo', recipient: 'equipe', scope: 'Perfis com alerta de estoque', category: 'transacional', channels: ['email', 'push'], subject: 'Estoque baixo — {{nome}}', text: 'O item {{nome}} atingiu o estoque mínimo. Verifique compras.' },
  integracao_falha: { label: 'Integração com falha', recipient: 'equipe', scope: 'Proprietário e gestores', category: 'transacional', channels: ['email', 'push'], subject: 'Integração com falha — {{nome}}', text: 'A integração {{nome}} reportou falha em {{data}}. Verifique em Comunicação › Integrações.' },
  assinatura_saas_vencendo: { label: 'Assinatura Qlinic vencendo', recipient: 'proprietario', scope: 'Proprietário (Contexto A — plataforma)', category: 'transacional', channels: ['email'], subject: 'Sua assinatura vence em {{data}}', text: 'A assinatura de {{clinica}} na plataforma vence em {{data}}. Gerencie em Configurações.' },
}
export const EVENT_KEYS = Object.keys(EVENTS) as NotificationEvent[]

export const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: 'WhatsApp', email: 'E-mail', push: 'Push' }

export const OUTBOX_STATUS: Record<OutboxMessage['status'], { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; help: string }> = {
  pendente: { label: 'Pendente', tone: 'neutral', help: 'Na fila, ainda não entregue ao provedor.' },
  aguardando_janela: { label: 'Aguardando janela', tone: 'info', help: 'Fora do horário permitido (horário silencioso). Envio no próximo horário permitido.' },
  aceito_provedor: { label: 'Aceito pelo provedor', tone: 'info', help: 'O provedor aceitou a mensagem. NÃO significa entregue.' },
  entregue: { label: 'Entregue', tone: 'success', help: 'Evidência de entrega recebida do provedor.' },
  lido: { label: 'Lido', tone: 'success', help: 'Evidência de leitura recebida (quando o canal fornece).' },
  falhou: { label: 'Falhou', tone: 'warning', help: 'Tentativa falhou; pode ser retentada.' },
  falha_definitiva: { label: 'Falha definitiva', tone: 'danger', help: 'Não será retentada (ex.: bounce permanente ou limite de tentativas).' },
  suprimido: { label: 'Suprimido', tone: 'neutral', help: 'Não enviado: opt-out, suppression list ou marketing sem opt-in.' },
  duplicado: { label: 'Duplicado', tone: 'neutral', help: 'Mesmo evento/destinatário/canal já enfileirado — não reenviado.' },
}

export const ALERT_LABEL: Record<AlertKey, string> = {
  estoque_baixo: 'Estoque baixo', integracao_falha: 'Integração com falha', assinatura_saas_vencendo: 'Assinatura Qlinic vencendo', falha_envio: 'Falha definitiva de envio',
  atendimento_humano: 'Pedido de atendimento humano', pagamento_confirmado: 'Pagamento confirmado', proposta_aceita: 'Proposta aceita',
}
export const ALERT_KEYS = Object.keys(ALERT_LABEL) as AlertKey[]
export const ROLES_FOR_PREFS: TenantRole[] = ['clinic_owner', 'network_manager', 'unit_manager', 'reception', 'professional', 'assistant', 'finance', 'inventory']

export const TRIGGER_LABEL: Record<AutomationTrigger, string> = {
  'appointment.cancelled': 'Consulta cancelada', 'proposal.pending': 'Proposta pendente há X dias', 'lot.expiring': 'Material próximo do vencimento',
  'record.finalized': 'Registro finalizado com retorno definido', 'vaccine.due': 'Aplicação programada pelo profissional', 'payment.confirmed': 'Pagamento confirmado', 'proposal.accepted': 'Proposta aceita',
}
export const ACTION_LABEL: Record<AutomationAction, string> = {
  offer_waitlist: 'Ofertar vaga à lista de espera', crm_task: 'Criar tarefa de contato (CRM)', stock_alert: 'Alertar equipe de estoque',
  send_reminder: 'Enviar lembrete ao paciente', notify_patient: 'Notificar paciente',
}
/** Ações válidas por gatilho (o construtor só oferece combinações coerentes). */
export const ACTIONS_BY_TRIGGER: Record<AutomationTrigger, AutomationAction[]> = {
  'appointment.cancelled': ['offer_waitlist'], 'proposal.pending': ['crm_task'], 'lot.expiring': ['stock_alert'], 'record.finalized': ['send_reminder', 'crm_task'],
  'vaccine.due': ['send_reminder'], 'payment.confirmed': ['notify_patient'], 'proposal.accepted': ['notify_patient', 'crm_task'],
}
/** Campos disponíveis para condições por gatilho. */
export const FIELDS_BY_TRIGGER: Record<AutomationTrigger, { id: string; label: string }[]> = {
  'appointment.cancelled': [{ id: 'antecedencia_horas', label: 'Antecedência da vaga (horas)' }, { id: 'duracao_min', label: 'Duração (min)' }, { id: 'unidade', label: 'Unidade' }],
  'proposal.pending': [{ id: 'dias_pendente', label: 'Dias pendente' }, { id: 'valor_reais', label: 'Valor (R$)' }],
  'lot.expiring': [{ id: 'dias_para_vencer', label: 'Dias para vencer' }, { id: 'quantidade', label: 'Quantidade' }],
  'record.finalized': [{ id: 'dias_para_retorno', label: 'Dias até o retorno' }],
  'vaccine.due': [{ id: 'dias_para_aplicacao', label: 'Dias até a aplicação' }],
  'payment.confirmed': [{ id: 'valor_reais', label: 'Valor (R$)' }],
  'proposal.accepted': [{ id: 'valor_reais', label: 'Valor (R$)' }],
}
/** Gatilhos que contatam pessoas externas (sujeitos à janela/horário permitido). */
export const CONTACTS_PERSON: Record<AutomationAction, boolean> = { offer_waitlist: true, send_reminder: true, notify_patient: true, crm_task: false, stock_alert: false }

export { OP_LABEL } from './rules'
