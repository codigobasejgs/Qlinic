// Seed da plataforma (Super Admin) + registro dos seeds núcleo por tenant.
import '@/domain/platform'
import type { DataRequest, DomainConfig, FeatureFlag, IntegrationHealth, Plan, SaasInvoice, Subscription, SupportTicket, UsageRecord } from '@/domain/platform'
import type { Organization } from '@/domain/types'
import { platformDb, registerPlatformSeed, registerSeed, setSeedPolicy } from './store'
import { buildOrganizations } from './seed/orgs'
import { addDaysCivil, demoBaseDate, zonedParts } from '@/lib/dates'
import * as T from './seed/tenant'
import { hashString, rng } from '@/lib/util'

const base = () => demoBaseDate()
const iso = (daysAgo = 0) => new Date(base().getTime() - daysAgo * 86400000).toISOString()
const today = () => zonedParts(base()).date

export function getOrganization(id: string): Organization | undefined {
  return platformDb.list('organizations').find((o) => o.id === id)
}
export function getOrganizationBySlug(slug: string): Organization | undefined {
  return platformDb.list('organizations').find((o) => o.slug === slug)
}

const PLANS: Plan[] = [
  { id: 'plan_essencial', name: 'Essencial', description: 'Para consultórios e clínicas pequenas.', prices: { mensal: 24900, trimestral: 69900, anual: 249000 }, limits: { users: 5, professionals: 3, units: 1, storageGb: 20, messagesMonth: 1000, aiCreditsMonth: 200 }, modules: ['agenda', 'recepcao', 'pacientes', 'prontuario', 'documentos', 'orcamentos', 'financeiro', 'portal', 'pwa', 'comunicacao', 'relatorios', 'importacao'], overage: { messageCents: 12, storageGbCents: 150, aiCreditCents: 8, extraProfessionalCents: 4900 }, upgradeRule: 'imediato_pro_rata', downgradeRule: 'proximo_ciclo', active: true, version: 1 },
  { id: 'plan_pro', name: 'Profissional', description: 'Clínicas com equipe e módulos de especialidade.', prices: { mensal: 49900, trimestral: 139900, anual: 499000 }, limits: { users: 20, professionals: 10, units: 2, storageGb: 100, messagesMonth: 5000, aiCreditsMonth: 1500 }, modules: ['agenda', 'recepcao', 'pacientes', 'prontuario', 'documentos', 'orcamentos', 'financeiro', 'portal', 'pwa', 'comunicacao', 'relatorios', 'importacao', 'crm', 'comissoes', 'estoque', 'compras', 'convenios', 'automacoes', 'ia', 'multidisciplinar', 'odontologia', 'medicina', 'veterinaria', 'estetica', 'psicologia', 'fisioterapia', 'nutricao'], overage: { messageCents: 10, storageGbCents: 120, aiCreditCents: 6, extraProfessionalCents: 3900 }, upgradeRule: 'imediato_pro_rata', downgradeRule: 'proximo_ciclo', active: true, version: 1 },
  { id: 'plan_rede', name: 'Rede', description: 'Redes multiunidade com gestão centralizada.', prices: { mensal: 129900, trimestral: 369900, anual: 1299000 }, limits: { users: 80, professionals: 40, units: 10, storageGb: 500, messagesMonth: 20000, aiCreditsMonth: 6000 }, modules: ['agenda', 'recepcao', 'pacientes', 'prontuario', 'documentos', 'orcamentos', 'financeiro', 'portal', 'pwa', 'comunicacao', 'relatorios', 'importacao', 'crm', 'comissoes', 'estoque', 'compras', 'convenios', 'automacoes', 'ia', 'multidisciplinar', 'odontologia', 'medicina', 'veterinaria', 'estetica', 'psicologia', 'fisioterapia', 'nutricao'], overage: { messageCents: 8, storageGbCents: 100, aiCreditCents: 5, extraProfessionalCents: 2900 }, upgradeRule: 'imediato_pro_rata', downgradeRule: 'proximo_ciclo', active: true, version: 1 },
]

registerPlatformSeed('organizations', () => buildOrganizations(base()))
registerPlatformSeed('plans', () => PLANS)
registerPlatformSeed('subscriptions', () => platformDb.list('organizations').map((o, i): Subscription => {
  const t = today()
  const status: Subscription['status'] = o.status === 'trial' ? 'trial' : o.status === 'past_due' ? 'inadimplente' : o.status === 'suspended' ? 'pausada' : o.status === 'cancelled' ? 'cancelada' : 'ativa'
  const cycle: Subscription['cycle'] = i % 4 === 1 ? 'anual' : i % 4 === 2 ? 'trimestral' : 'mensal'
  const created = o.createdAt.slice(0, 10)
  return {
    id: `sub_${o.id}`, tenantId: o.id, planId: o.planId, cycle, status, startedAt: created, currentPeriodEnd: addDaysCivil(t, 5 + i * 3),
    trial: status === 'trial' ? { start: created, end: addDaysCivil(created, 14), extensions: [] } : { start: created, end: addDaysCivil(created, 14), extensions: [], convertedAt: addDaysCivil(created, 14) },
    coupon: i === 2 ? { code: 'LANCAMENTO20', percent: 20, validUntil: addDaysCivil(t, 60) } : undefined,
    cancelAt: status === 'cancelada' ? addDaysCivil(t, -20) : undefined, cancelReason: status === 'cancelada' ? 'Encerramento das atividades (fictício)' : undefined,
    pausedAt: status === 'pausada' ? addDaysCivil(t, -10) : undefined,
    history: [{ at: o.createdAt, event: 'Assinatura criada', by: 'Sistema' }],
  }
}))
registerPlatformSeed('saasInvoices', () => {
  const out: SaasInvoice[] = []
  const subs = platformDb.list('subscriptions')
  const plans = platformDb.list('plans')
  const t = today()
  subs.forEach((s, si) => {
    if (s.status === 'trial') return
    const plan = plans.find((p) => p.id === s.planId)!
    for (let m = 5; m >= 0; m--) {
      const due = addDaysCivil(t, -30 * m + 5)
      if (due < s.startedAt) continue
      const amount = Math.round(plan.prices.mensal * (1 - (s.coupon?.percent ?? 0) / 100))
      const overdue = (s.status === 'inadimplente' && m === 0) || (s.status === 'pausada' && m <= 1)
      const cancelled = s.status === 'cancelada' && m === 0
      out.push({
        id: `inv_${s.tenantId}_${m}`, tenantId: s.tenantId, subscriptionId: s.id, number: `QL-${String(1000 + si * 10 + m)}`, competence: due.slice(0, 7), dueDate: due,
        amountCents: amount, status: cancelled ? 'cancelada' : overdue ? 'vencida' : m === 0 ? 'aberta' : 'paga', gateway: si % 2 ? 'mercadopago' : 'asaas',
        paidAt: !overdue && !cancelled && m > 0 ? iso(30 * m - 4) : undefined, providerRef: `sim_${s.tenantId}_${m}`, reconciled: m > 1, simulated: true,
      })
    }
  })
  return out
})
registerPlatformSeed('coupons', () => [
  { id: 'cp1', code: 'LANCAMENTO20', percent: 20, validUntil: addDaysCivil(today(), 60), maxUses: 50, uses: 7, active: true },
  { id: 'cp2', code: 'REDE10', percent: 10, validUntil: addDaysCivil(today(), -5), maxUses: 10, uses: 10, active: false },
])
registerPlatformSeed('usage', () => {
  const out: UsageRecord[] = []
  platformDb.list('organizations').forEach((o) => {
    const r = rng(hashString(o.id + 'usage'))
    for (let m = 2; m >= 0; m--) {
      const d = new Date(base().getTime() - m * 30 * 86400000)
      const storage = +(r.int(2, 60) + (o.planId === 'plan_rede' ? 120 : 0)).toFixed(1)
      const messages = r.int(150, o.planId === 'plan_essencial' ? 1150 : 4800)
      const ai = r.int(10, o.planId === 'plan_essencial' ? 240 : 1200)
      out.push({ id: `use_${o.id}_${m}`, tenantId: o.id, month: d.toISOString().slice(0, 7), storageGb: storage, messages, aiCredits: ai, estCostCents: Math.round(storage * 25 + messages * 4 + ai * 3 + 1500) })
    }
  })
  return out
})
registerPlatformSeed('integrations', () => {
  const out: IntegrationHealth[] = [
    { id: 'int_plat_asaas', tenantId: null, provider: 'asaas', context: 'plataforma', status: 'simulada', environment: 'simulado', lastEventAt: iso(0.1), errorRate: 0.01, queue: { pending: 2, failed: 0, retrying: 0 }, events: [{ id: 'e1', at: iso(0.1), type: 'PAYMENT_RECEIVED', result: 'ok', detail: 'Fatura QL-1003 conciliada (simulado)' }, { id: 'e2', at: iso(0.09), type: 'PAYMENT_RECEIVED', result: 'duplicado', detail: 'eventId repetido ignorado (idempotência)' }] },
    { id: 'int_plat_mp', tenantId: null, provider: 'mercadopago', context: 'plataforma', status: 'degradada', environment: 'simulado', lastEventAt: iso(0.5), errorRate: 0.12, queue: { pending: 5, failed: 2, retrying: 3 }, events: [{ id: 'e3', at: iso(0.5), type: 'payment.updated', result: 'erro', detail: 'Timeout ao consultar status (simulado) — sem troca automática de gateway' }] },
    { id: 'int_plat_resend', tenantId: null, provider: 'resend', context: 'plataforma', status: 'simulada', environment: 'simulado', lastEventAt: iso(0.02), errorRate: 0.003, queue: { pending: 0, failed: 1, retrying: 0 }, events: [{ id: 'e4', at: iso(0.02), type: 'email.bounced', result: 'ok', detail: 'Destinatário suprimido após bounce (simulado)' }] },
  ]
  platformDb.list('organizations').filter((o) => o.demo).forEach((o, i) => {
    out.push({ id: `int_${o.id}_evo`, tenantId: o.id, provider: 'evolution', context: 'clinica', status: i === 3 ? 'erro' : i === 5 ? 'desconectada' : 'simulada', environment: 'simulado', lastEventAt: iso(i * 0.3), errorRate: i === 3 ? 0.4 : 0.02, queue: { pending: i, failed: i === 3 ? 12 : 0, retrying: i === 3 ? 4 : 0 }, events: [{ id: `ev${i}`, at: iso(i * 0.3), type: 'connection.update', result: i === 3 ? 'erro' : 'ok', detail: i === 3 ? 'Instância desconectada — reconexão necessária (simulado)' : 'Instância ativa (simulado)' }] })
    out.push({ id: `int_${o.id}_pay`, tenantId: o.id, provider: i % 3 === 0 ? 'asaas' : i % 3 === 1 ? 'mercadopago' : 'infinitepay', context: 'clinica', status: i === 2 ? 'expirada' : 'simulada', environment: 'simulado', lastEventAt: iso(i * 0.2), errorRate: 0.01, queue: { pending: 0, failed: 0, retrying: 0 }, events: [] })
  })
  return out
})
registerPlatformSeed('domains', () => platformDb.list('organizations').filter((o) => o.demo).map((o, i): DomainConfig => ({
  id: `dom_${o.id}`, tenantId: o.id, kind: i === 1 ? 'proprio' : 'subdominio', hostname: i === 1 ? `app.${o.slug}.exemplo` : `${o.slug}.dominio-da-plataforma.exemplo`,
  status: i === 1 ? 'verificando' : i === 4 ? 'erro' : 'verificado', certificate: i === 1 ? 'pendente' : i === 4 ? 'erro' : 'ativo', brandVersion: 1, lastCheckAt: iso(0.3),
  diagnostics: i === 1 ? ['Aguardando registro de verificação informado pelo provedor de hospedagem (valor real retornado somente no momento da configuração).'] : i === 4 ? ['Registro não encontrado na última verificação (simulado).'] : ['Hostname mapeado ao tenant (simulado).'],
})))
registerPlatformSeed('tickets', () => {
  const orgs = platformDb.list('organizations')
  const mk = (i: number, tenantId: string, subject: string, priority: SupportTicket['priority'], status: SupportTicket['status'], hoursAgo: number, assisted?: SupportTicket['assistedAccess']): SupportTicket => ({
    id: `tk${i}`, tenantId, number: `SUP-${2000 + i}`, subject, description: `${subject}. Descrição fictícia para demonstração.`, priority, status, assigneeId: i % 2 ? 'pu_support' : undefined,
    createdAt: new Date(base().getTime() - hoursAgo * 3600000).toISOString(), slaHours: priority === 'critica' ? 4 : priority === 'alta' ? 8 : priority === 'media' ? 24 : 72,
    attachments: i === 1 ? [{ name: 'captura-tela-ficticia.png', sizeKb: 240 }] : [], messages: [{ at: new Date(base().getTime() - hoursAgo * 3600000).toISOString(), from: 'cliente', author: 'Proprietária (demo)', text: subject }], assistedAccess: assisted,
  })
  return [
    mk(1, orgs[0].id, 'Dúvida sobre configuração de comissão', 'media', 'em_andamento', 20),
    mk(2, orgs[3].id, 'WhatsApp desconectado', 'alta', 'aberto', 9, { reason: 'Verificar configuração da instância de comunicação', requestedAt: iso(0.3), requestedBy: 'Suporte (demo)', status: 'solicitado', scope: 'configuracoes' }),
    mk(3, orgs[1].id, 'Importação de pacientes com erro', 'baixa', 'aguardando_cliente', 50),
    mk(4, orgs[2].id, 'Agenda não carrega (simulado)', 'critica', 'resolvido', 100),
  ]
})
registerPlatformSeed('flags', (): FeatureFlag[] => [
  { id: 'ff1', key: 'agenda.arrastar', description: 'Arrastar e soltar na agenda', enabledGlobally: true, tenantOverrides: {}, rollout: 100 },
  { id: 'ff2', key: 'ia.recepcionista', description: 'Recepcionista virtual (simulada)', enabledGlobally: false, tenantOverrides: { org_sorriso: true, org_vitta: true }, rollout: 30 },
  { id: 'ff3', key: 'portal.pagamento', description: 'Pagamento no portal (simulado)', enabledGlobally: true, tenantOverrides: { org_escuta: false }, rollout: 100 },
  { id: 'ff4', key: 'odontograma.3d', description: 'Odontograma 3D (futuro, desligado)', enabledGlobally: false, tenantOverrides: {}, rollout: 0 },
])
registerPlatformSeed('incidents', () => [
  { id: 'inc1', title: 'Lentidão no envio de lembretes (simulado)', severity: 'menor', status: 'resolvido', startedAt: iso(6), resolvedAt: iso(5.9), components: ['Comunicação'], updates: [{ at: iso(6), text: 'Investigando atraso na fila.' }, { at: iso(5.9), text: 'Fila normalizada.' }] },
  { id: 'inc2', title: 'Gateway de pagamento degradado (simulado)', severity: 'maior', status: 'monitorando', startedAt: iso(0.5), components: ['Cobrança SaaS'], updates: [{ at: iso(0.5), text: 'Timeouts intermitentes; retentativas controladas sem nova cobrança.' }] },
])
registerPlatformSeed('announcements', () => [{ id: 'an1', title: 'Nova central de ajuda', body: 'Artigos com passo a passo e tours guiados.', audience: 'todos', publishedAt: iso(2), active: true }])
registerPlatformSeed('changelog', () => [
  { id: 'cl1', version: '0.1.0', date: today(), items: ['Frontend de demonstração completo', 'PWA por clínica', 'Odontograma 2D', 'Super Admin'] },
])
registerPlatformSeed('platformAudit', () => [{ id: 'pa1', at: iso(1), actor: 'Proprietário da plataforma (demo)', action: 'plano.atualizado', target: 'plan_pro', detail: 'Limite de mensagens alterado (demo)' }])
registerPlatformSeed('dataRequests', (): DataRequest[] => [{ id: 'dr1', tenantId: 'org_odontomais', kind: 'exportacao', status: 'em_analise', requestedAt: iso(15), requestedBy: 'Proprietário (demo)', notes: 'Exportação completa antes do encerramento. Dados preservados durante análise.' }])
registerPlatformSeed('platformUsers', () => [
  { id: 'pu_owner', name: 'Proprietário da plataforma (demo)', email: 'owner@qlinic.exemplo.test', role: 'platform_owner', active: true },
  { id: 'pu_finance', name: 'Financeiro SaaS (demo)', email: 'financeiro@qlinic.exemplo.test', role: 'platform_finance', active: true },
  { id: 'pu_support', name: 'Suporte SaaS (demo)', email: 'suporte@qlinic.exemplo.test', role: 'platform_support', active: true },
])

// ---------- Seeds núcleo por tenant ----------
// Somente clínicas demo recebem dados; contratantes "só métricas" e clínicas criadas pelo visitante começam vazias.
setSeedPolicy((tenantId) => getOrganization(tenantId)?.demo === true)
registerSeed('units', (c) => T.seedUnits(c.tenantId))
registerSeed('resources', (c) => T.seedResources(c.tenantId, c.get('units')))
registerSeed('professionals', (c) => T.seedProfessionals(c.tenantId, c.get('units')))
registerSeed('services', (c) => T.seedServices(c.tenantId))
registerSeed('staff', (c) => T.seedStaff(c.tenantId, c.get('units'), c.get('professionals')))
const peopleCache = new Map<string, ReturnType<typeof T.seedPeopleAndPatients>>()
const people = (id: string, units: ReturnType<typeof T.seedUnits>) => { let p = peopleCache.get(id); if (!p) peopleCache.set(id, (p = T.seedPeopleAndPatients(id, units))); return p }
registerSeed('persons', (c) => people(c.tenantId, c.get('units')).persons)
registerSeed('patients', (c) => people(c.tenantId, c.get('units')).patients)
registerSeed('links', (c) => people(c.tenantId, c.get('units')).links)
registerSeed('appointments', (c) => T.seedAppointments(c.tenantId, c.get('units'), c.get('professionals'), c.get('services'), c.get('patients'), c.get('resources')))
registerSeed('waitlist', (c) => T.seedWaitlist(c.tenantId, c.get('patients'), c.get('services'), c.get('units')))
const clinCache = new Map<string, ReturnType<typeof T.seedClinical>>()
const clin = (c: Parameters<Parameters<typeof registerSeed>[1]>[0]) => { let v = clinCache.get(c.tenantId); if (!v) clinCache.set(c.tenantId, (v = T.seedClinical(c.tenantId, c.get('appointments'), c.get('professionals'), c.get('patients')))); return v }
registerSeed('records', (c) => clin(c).records)
registerSeed('documents', (c) => clin(c).documents)
registerSeed('files', () => [])
const finCache = new Map<string, ReturnType<typeof T.seedFinance>>()
const fin = (c: Parameters<Parameters<typeof registerSeed>[1]>[0]) => { let v = finCache.get(c.tenantId); if (!v) finCache.set(c.tenantId, (v = T.seedFinance(c.tenantId, c.get('appointments'), c.get('services'), c.get('patients'), c.get('units'), c.get('professionals')))); return v }
registerSeed('charges', (c) => fin(c).charges)
registerSeed('proposals', (c) => fin(c).proposals)
registerSeed('treatmentItems', (c) => fin(c).treatmentItems)
registerSeed('outbox', (c) => T.seedOutbox(c.tenantId, c.get('patients')))
registerSeed('audit', (c) => T.seedAudit(c.tenantId))

/** Limpa caches de seed (após reset da demo). */
export function clearSeedCaches() { peopleCache.clear(); clinCache.clear(); finCache.clear() }
