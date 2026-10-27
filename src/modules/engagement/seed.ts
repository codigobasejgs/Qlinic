// Seeds determinísticos do módulo (somente tenants demo, relativos a demoBaseDate()). Dados fictícios.
import { registerSeed } from '@/data/store'
import { getOrganization } from '@/data/platformSeed'
import { seedOutbox } from '@/data/seed/tenant'
import { demoBaseDate } from '@/lib/dates'
import { hashString, rng } from '@/lib/util'
import type { OutboxMessage, TenantRole } from '@/domain/types'
import type { IntegrationProviderKey, IntegrationStatus } from '@/domain/platform'
import type { AlertKey, Automation, ClinicIntegration, ClinicIntegrationKind, NotificationTemplate, StaffAlertPref, WaConversation } from './types'
import { EVENTS, EVENT_KEYS, ALERT_KEYS } from './catalog'
import { DEFAULT_COMM } from './engine'

const iso = (hoursAgo: number) => new Date(demoBaseDate().getTime() - hoursAgo * 3600000).toISOString()
const org = (t: string) => getOrganization(t)

registerSeed('notificationTemplates', (c) => {
  const o = org(c.tenantId)
  return EVENT_KEYS.map((ev): NotificationTemplate => {
    const m = EVENTS[ev]
    const text = m.text
    return {
      id: `${c.tenantId}_tpl_${ev}`, tenantId: c.tenantId, createdAt: o?.createdAt ?? iso(2000), event: ev, category: m.category, recipient: m.recipient,
      channels: { whatsapp: m.channels.includes('whatsapp'), email: m.channels.includes('email'), push: m.channels.includes('push') },
      bodies: { whatsapp: text, push: text.split('.')[0].slice(0, 110), emailSubject: m.subject, email: `${text}\n\nEsta é uma mensagem automática de {{clinica}}. Informações clínicas ficam somente no portal, com acesso autenticado.` },
      version: ev === 'lembrete' ? 2 : 1,
      history: ev === 'lembrete' ? [{ version: 1, at: iso(900), by: 'Proprietária (demo)' }, { version: 2, at: iso(120), by: 'Proprietária (demo)', note: 'Removido nome do serviço do texto do lembrete' }] : [{ version: 1, at: iso(900), by: 'Qlinic (modelo padrão)' }],
      active: true,
    }
  }).concat([{
    id: `${c.tenantId}_tpl_mkt`, tenantId: c.tenantId, createdAt: iso(400), event: 'retorno', name: 'Novidades da clínica (marketing)', category: 'marketing', recipient: 'paciente_responsavel',
    channels: { whatsapp: false, email: true, push: false },
    bodies: { whatsapp: '', push: '', emailSubject: 'Novidades de {{clinica}}', email: 'Olá, {{nome}}. Confira as novidades de {{clinica}} no portal: {{link}}\n\nVocê recebe esta mensagem porque autorizou comunicações de marketing. Para deixar de receber, ajuste suas preferências no portal.' },
    version: 1, history: [{ version: 1, at: iso(400), by: 'Proprietária (demo)' }], active: false,
  }])
})

registerSeed('automations', (c) => {
  const t = c.tenantId
  const base = { tenantId: t, createdAt: iso(500), version: 1, updatedBy: 'Proprietária (demo)' }
  const list: Automation[] = [
    { ...base, id: `${t}_auto1`, name: 'Consulta cancelada → oferta à lista de espera', template: 'cancel_waitlist', trigger: 'appointment.cancelled', conditions: [{ field: 'antecedencia_horas', op: 'gte', value: '4' }], action: 'offer_waitlist', params: { maxOffers: 2 }, waitMinutes: 0, limits: { maxPerPersonPerDay: 2, windowStart: 8 * 60, windowEnd: 20 * 60 }, active: true },
    { ...base, id: `${t}_auto2`, name: 'Proposta pendente → tarefa de contato', template: 'proposal_followup', trigger: 'proposal.pending', conditions: [], action: 'crm_task', params: { days: 3 }, waitMinutes: 0, limits: { maxPerPersonPerDay: 1, windowStart: 0, windowEnd: 0 }, active: true },
    { ...base, id: `${t}_auto3`, name: 'Material próximo do vencimento → alerta ao estoque', template: 'lot_expiry', trigger: 'lot.expiring', conditions: [], action: 'stock_alert', params: { days: 30 }, waitMinutes: 0, limits: { maxPerPersonPerDay: 0, windowStart: 0, windowEnd: 0 }, active: false },
    { ...base, id: `${t}_auto4`, name: 'Retorno definido pelo profissional → lembrete', template: 'return_reminder', trigger: 'record.finalized', conditions: [], action: 'send_reminder', params: { days: 7 }, waitMinutes: 0, limits: { maxPerPersonPerDay: 1, windowStart: 9 * 60, windowEnd: 18 * 60 }, active: false },
  ]
  return list
})

registerSeed('automationRuns', (c) => {
  const t = c.tenantId
  return [
    { id: `${t}_run1`, tenantId: t, createdAt: iso(26), automationId: `${t}_auto1`, automationName: 'Consulta cancelada → oferta à lista de espera', trigger: 'Consulta cancelada', status: 'executada', personRefs: [`${t}_per4`], ctxKey: `cancel:seed1`, subject: 'Vaga liberada (exemplo)', detail: 'Oferta temporária enviada a 1 pessoa compatível (simulado).', actions: ['Ofertar vaga (WhatsApp)'], source: 'evento' },
    { id: `${t}_run2`, tenantId: t, createdAt: iso(22), automationId: `${t}_auto1`, automationName: 'Consulta cancelada → oferta à lista de espera', trigger: 'Consulta cancelada', status: 'ignorada', personRefs: [], ctxKey: `cancel:seed2`, subject: 'Vaga liberada (exemplo)', detail: 'Condições não atendidas: antecedencia_horas ≥ 4 (atual: 2).', actions: [], source: 'evento' },
    { id: `${t}_run3`, tenantId: t, createdAt: iso(3), automationId: `${t}_auto2`, automationName: 'Proposta pendente → tarefa de contato', trigger: 'Proposta pendente há X dias', status: 'limitada', personRefs: [], ctxKey: `proposal:seed`, subject: 'Proposta ORC-0000 (exemplo)', detail: 'Limite de 1 execução(ões) por pessoa/dia atingido.', actions: [], source: 'varredura' },
  ]
})

registerSeed('outbox', (c) => {
  // Estende o seed da fundação com estados adicionais (todos simulados), para a legenda da fila ser observável.
  const t = c.tenantId
  const patients = c.get('patients')
  const base = seedOutbox(t, patients)
  const p = patients[1] ?? patients[0]
  const p2 = patients[2] ?? patients[0]
  if (!p) return base
  const mk = (i: number, who: typeof p, event: OutboxMessage['event'], channel: OutboxMessage['channel'], status: OutboxMessage['status'], subject: string, attempts: string[], extra: Partial<OutboxMessage> = {}): OutboxMessage => ({
    id: `${t}_obx${i}`, tenantId: t, createdAt: iso(10 - i), event, channel, recipientName: who.name, recipientRef: who.personId ?? who.id, subject, preview: `${subject} — detalhes no portal.`,
    dedupeKey: `${event}:${who.id}:${channel}:x${i}`, status, attempts: attempts.map((r, k) => ({ at: iso(10 - i - k * 0.2), result: r })), simulated: true, ...extra,
  })
  const tomorrow8 = new Date(demoBaseDate().getTime() + 86400000)
  tomorrow8.setUTCHours(11, 0, 0, 0)
  return [
    ...base,
    mk(1, p, 'lembrete', 'whatsapp', 'aguardando_janela', 'Lembrete de horário', ['Fora do horário permitido — aguardando janela.'], { scheduledFor: tomorrow8.toISOString() }),
    mk(2, p, 'documento_disponivel', 'email', 'falha_definitiva', 'Novo documento no portal', ['Aceito pelo provedor (simulado)', 'Bounce permanente (simulado) — endereço adicionado à suppression list.']),
    mk(3, p2, 'confirmacao', 'whatsapp', 'duplicado', 'Atendimento confirmado', ['Mesmo evento/destinatário/canal já enfileirado — não reenviado.']),
    mk(4, p2, 'retorno', 'email', 'suprimido', 'Novidades da clínica', ['Marketing sem opt-in do destinatário — não enviado.']),
    mk(5, p2, 'cobranca_proxima', 'email', 'pendente', 'Vencimento próximo', ['Na fila (simulado).']),
  ]
})

registerSeed('waConversations', (c) => {
  const t = c.tenantId
  const pats = c.get('patients').filter((p) => p.personId || c.get('links').some((l) => l.patientId === p.id))
  const persons = c.get('persons')
  const r = rng(hashString(t + 'wa'))
  const vet = org(t)?.segment === 'veterinaria'
  const scripts: { status: WaConversation['status']; msgs: [WaConversation['messages'][number]['from'], string, WaConversation['messages'][number]['media']?][] }[] = [
    { status: 'aberta', msgs: [['contato', 'Olá! Gostaria de confirmar meu horário de amanhã.'], ['clinica', 'Olá! Seu horário está confirmado. Detalhes no portal.'], ['contato', 'Obrigado! Posso chegar 10 minutos antes?']] },
    { status: 'aguardando_humano', msgs: [['contato', vet ? 'Segue a foto da carteirinha de vacinação.' : 'Segue a foto da carteirinha do convênio.', { kind: 'imagem', name: 'foto-carteirinha-ficticia.jpg' }], ['sistema', 'Mídia recebida (fictícia). Conteúdo não é processado automaticamente.'], ['contato', 'Quero falar com uma pessoa, por favor.']] },
    { status: 'em_atendimento_humano', msgs: [['contato', 'Preciso remarcar para a semana que vem.'], ['sistema', 'Conversa transferida para Recepção — Carolina (demo).'], ['clinica', 'Claro! Tenho opções na terça à tarde. Prefere algum horário?']] },
    { status: 'encerrada', msgs: [['contato', 'Recebi o lembrete, obrigado.', { kind: 'audio', name: 'audio-0007-ficticio.ogg' }], ['clinica', 'Nós que agradecemos!']] },
  ]
  return scripts.map((s, i): WaConversation => {
    const p = pats[(i * 3) % Math.max(1, pats.length)]
    const ref = p?.personId ?? c.get('links').find((l) => l.patientId === p?.id)?.personId
    const person = persons.find((x) => x.id === ref)
    const hours = 2 + i * 7 + r.int(0, 3)
    return {
      id: `${t}_wa${i + 1}`, tenantId: t, createdAt: iso(hours + 1), personRef: ref, name: person?.name ?? p?.name ?? 'Contato (demo)', phoneMasked: `(00) 9****-${String(2000 + i * 3).slice(-4)}`,
      status: s.status, unread: s.status === 'aguardando_humano' ? 2 : s.status === 'aberta' ? 1 : 0,
      handoff: s.status === 'em_atendimento_humano' ? { toId: `${t}_usr_recepcao`, toName: 'Recepção — Carolina (demo)', at: iso(hours - 0.5), reason: 'Reagendamento' } : undefined,
      messages: s.msgs.map(([from, text, media], k) => ({ id: `${t}_wa${i + 1}_m${k}`, at: iso(hours - k * 0.3), from, text, media, author: from === 'clinica' ? 'Recepção (demo)' : undefined, status: from === 'clinica' ? 'aceito_provedor' : undefined })),
    }
  })
})

const PROVIDERS: { provider: IntegrationProviderKey; kind: ClinicIntegrationKind }[] = [
  { provider: 'infinitepay', kind: 'pagamento' }, { provider: 'asaas', kind: 'pagamento' }, { provider: 'mercadopago', kind: 'pagamento' }, { provider: 'pix_manual', kind: 'pagamento' },
  { provider: 'resend', kind: 'email' }, { provider: 'evolution', kind: 'whatsapp' },
  { provider: 'assinatura', kind: 'interface' }, { provider: 'ia', kind: 'interface' }, { provider: 'teleatendimento', kind: 'interface' }, { provider: 'prescricao', kind: 'interface' }, { provider: 'nfse', kind: 'interface' },
]
/** Estados por tenant: Lumière com Evolution em erro; Vet Amigo com pagamento expirado; demais variados. */
const STATUS_BY_TENANT: Record<string, Partial<Record<IntegrationProviderKey, IntegrationStatus>>> = {
  org_sorriso: { asaas: 'simulada', infinitepay: 'expirada', mercadopago: 'desconectada', pix_manual: 'simulada', resend: 'simulada', evolution: 'degradada' },
  org_vitta: { mercadopago: 'simulada', asaas: 'configurando', infinitepay: 'desconectada', pix_manual: 'simulada', resend: 'simulada', evolution: 'simulada' },
  org_vet: { infinitepay: 'expirada', asaas: 'desconectada', mercadopago: 'desconectada', pix_manual: 'simulada', resend: 'simulada', evolution: 'simulada' },
  org_lumiere: { asaas: 'simulada', infinitepay: 'desconectada', mercadopago: 'erro', pix_manual: 'simulada', resend: 'simulada', evolution: 'erro' },
}
registerSeed('clinicIntegrations', (c) => {
  const t = c.tenantId
  const over = STATUS_BY_TENANT[t] ?? { asaas: 'simulada', resend: 'simulada', evolution: 'expirada', pix_manual: 'simulada', mercadopago: 'erro' }
  return PROVIDERS.map(({ provider, kind }, i): ClinicIntegration => {
    const status: IntegrationStatus = over[provider] ?? 'desconectada'
    const err = status === 'erro', exp = status === 'expirada', deg = status === 'degradada'
    const logs: ClinicIntegration['logs'] = status === 'desconectada' ? [] : [
      { at: iso(48 + i), level: 'info', message: 'Configuração demonstrativa criada (sem credencial).' },
      ...(err ? [{ at: iso(1 + i * 0.1), level: 'erro' as const, message: provider === 'evolution' ? 'Instância desconectada — sessão do aparelho encerrada (simulado). Reconexão necessária.' : 'Falha de autenticação no provedor (simulado). Token: [REDACTED].' }] : []),
      ...(exp ? [{ at: iso(30), level: 'aviso' as const, message: 'Autorização expirada — reconecte a conta (simulado).' }] : []),
      ...(deg ? [{ at: iso(2), level: 'aviso' as const, message: 'Latência elevada nas últimas confirmações (simulado). Fila com retentativa controlada.' }] : []),
      ...(status === 'simulada' ? [{ at: iso(0.5 + i * 0.1), level: 'info' as const, message: 'Evento recebido e validado (simulado). Identificador: evt_***' }] : []),
    ]
    return {
      id: `${t}_int_${provider}`, tenantId: t, createdAt: iso(500), provider, kind, status, environment: status === 'desconectada' ? 'simulado' : status === 'simulada' ? 'simulado' : 'sandbox',
      lastEvent: logs.length ? { at: logs[logs.length - 1].at, type: err ? 'connection.error' : exp ? 'auth.expired' : 'event.received', result: err ? 'erro' : 'ok' } : undefined,
      logs, instanceLabel: provider === 'evolution' ? `instancia-${org(t)?.slug ?? t}` : undefined,
    }
  })
})

registerSeed('emailDomains', (c) => {
  const t = c.tenantId
  const slug = org(t)?.slug ?? t
  if (t === 'org_vitta') return [{ id: `${t}_dom1`, tenantId: t, createdAt: iso(72), domain: `${slug}.exemplo`, status: 'pendente', records: [{ kind: 'SPF', status: 'verificado' }, { kind: 'DKIM', status: 'pendente' }, { kind: 'DMARC', status: 'nao_verificado' }], lastCheckAt: iso(2) }]
  if (t === 'org_sorriso') return [{ id: `${t}_dom1`, tenantId: t, createdAt: iso(300), domain: `${slug}.exemplo`, status: 'verificado', records: [{ kind: 'SPF', status: 'verificado' }, { kind: 'DKIM', status: 'verificado' }, { kind: 'DMARC', status: 'verificado' }], lastCheckAt: iso(5) }]
  if (t === 'org_lumiere') return [{ id: `${t}_dom1`, tenantId: t, createdAt: iso(100), domain: `${slug}.exemplo`, status: 'falhou', records: [{ kind: 'SPF', status: 'falhou' }, { kind: 'DKIM', status: 'falhou' }, { kind: 'DMARC', status: 'nao_verificado' }], lastCheckAt: iso(8) }]
  return []
})

registerSeed('emailConfig', (c) => {
  const o = org(c.tenantId)
  return [{ id: 'main', tenantId: c.tenantId, createdAt: iso(500), fromMode: 'plataforma', fromLocal: 'contato', displayName: o?.name ?? 'Clínica', replyTo: o?.contactEmail ?? '' }]
})

registerSeed('suppressions', (c) => [
  { id: `${c.tenantId}_sup1`, tenantId: c.tenantId, createdAt: iso(200), address: 'endereco-inexistente@exemplo.test', reason: 'bounce', note: 'Bounce permanente (simulado)' },
  { id: `${c.tenantId}_sup2`, tenantId: c.tenantId, createdAt: iso(90), address: 'nao-quero-receber@exemplo.test', reason: 'complaint', note: 'Marcado como spam (simulado)' },
])

const PREFS: Record<TenantRole, AlertKey[]> = {
  clinic_owner: ['integracao_falha', 'assinatura_saas_vencendo', 'falha_envio', 'proposta_aceita'],
  network_manager: ['integracao_falha', 'falha_envio', 'estoque_baixo'],
  unit_manager: ['estoque_baixo', 'atendimento_humano'],
  reception: ['atendimento_humano', 'falha_envio'],
  professional: [],
  assistant: [],
  finance: ['pagamento_confirmado', 'integracao_falha'],
  inventory: ['estoque_baixo'],
}
registerSeed('staffAlertPrefs', (c) => (Object.keys(PREFS) as TenantRole[]).map((role): StaffAlertPref => ({
  id: `${c.tenantId}_pref_${role}`, tenantId: c.tenantId, createdAt: iso(500), role, alerts: Object.fromEntries(ALERT_KEYS.map((k) => [k, PREFS[role].includes(k)])) as Record<AlertKey, boolean>,
})))

registerSeed('handoffTasks', (c) => {
  const conv = c.get('waConversations').find((w) => w.status === 'aguardando_humano')
  return conv ? [{ id: `${c.tenantId}_ho1`, tenantId: c.tenantId, createdAt: conv.messages[conv.messages.length - 1].at, source: 'whatsapp', priority: 'normal', reason: 'Contato pediu para falar com uma pessoa.', name: conv.name, personRef: conv.personRef, status: 'aberta', conversationId: conv.id }] : []
})

registerSeed('aiLogs', () => [])
registerSeed('commConfig', (c) => [{ id: 'main', tenantId: c.tenantId, createdAt: iso(500), ...DEFAULT_COMM }])
