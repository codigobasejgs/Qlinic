// Casos de uso do Super Admin. TODA alteração registra platformAudit. Fluxos externos = simulados.
import { isConnectedEnv } from '@/lib/env'
import '@/domain/platform'
import { platformDb } from '@/data/store'
import { createTrialOrganization } from '@/domain/tenancy'
import type { BillingCycle, Coupon, DataRequest, FeatureFlag, Incident, Plan, SaasInvoice, Subscription, SupportTicket } from '@/domain/platform'
import type { ID, PlatformRole, Segment } from '@/domain/types'
import { nowISO, todayCivil } from '@/lib/dates'
import { uid } from '@/lib/util'
import { addDays, canTransitionRequest, monthlyCents, nextInvoiceNumber } from './metrics'

export interface Actor { id: ID; name: string }

export function logAudit(actor: Actor, action: string, target: string, detail?: string) {
  platformDb.insert('platformAudit', { id: uid('pa_'), at: nowISO(), actor: actor.name, action, target, detail })
}
function requireReason(reason: string | undefined, min = 5) {
  const r = (reason ?? '').trim()
  if (r.length < min) throw new Error(`Informe o motivo (mínimo ${min} caracteres).`)
  return r
}
const sub = (id: ID) => { const s = platformDb.list('subscriptions').find((x) => x.id === id); if (!s) throw new Error('Assinatura não encontrada.'); return s }
const subOf = (tenantId: ID) => platformDb.list('subscriptions').find((x) => x.tenantId === tenantId)
const org = (id: ID) => { const o = platformDb.list('organizations').find((x) => x.id === id); if (!o) throw new Error('Contratante não encontrado.'); return o }
const plan = (id: ID) => { const p = platformDb.list('plans').find((x) => x.id === id); if (!p) throw new Error('Plano não encontrado.'); return p }
function updateSub(id: ID, actor: Actor, event: string, patch: (s: Subscription) => Partial<Subscription>) {
  platformDb.update('subscriptions', id, (s: Subscription) => ({ ...s, ...patch(s), history: [...s.history, { at: nowISO(), event, by: actor.name }] }))
}

// ---------- Contratantes ----------
export function createTenant(input: { name: string; segment: Segment; slug?: string; ownerName?: string; trialDays: number; city?: string; contactEmail?: string }, actor: Actor) {
  if (!Number.isInteger(input.trialDays) || input.trialDays < 1 || input.trialDays > 90) throw new Error('Duração do teste: 1 a 90 dias.')
  const email = input.contactEmail?.trim()
  if (email && !isConnectedEnv() && !/^[^@\s]+@[^@\s]+\.(exemplo|test|example)(\.[a-z]+)?$/i.test(email)) throw new Error('Use um e-mail fictício (.exemplo ou .test) na demonstração.')
  if (!['odontologia', 'medicina', 'veterinaria', 'estetica', 'psicologia', 'fisioterapia', 'nutricao'].includes(input.segment)) throw new Error('Segmento inválido.')
  // Materializa seeds antes da criação para não gerar uma segunda assinatura do novo tenant.
  platformDb.list('subscriptions')
  platformDb.list('saasInvoices')
  const { org: o } = createTrialOrganization({ name: input.name, segment: input.segment, slug: input.slug || undefined, ownerName: input.ownerName, trialDays: input.trialDays })
  platformDb.update('organizations', o.id, { status: 'trial', city: input.city?.trim() ?? '', ...(email ? { contactEmail: email } : {}) })
  const s = subOf(o.id)
  if (s) updateSub(s.id, actor, `Teste de ${input.trialDays} dias iniciado pelo Super Admin`, () => ({}))
  logAudit(actor, 'contratante.criado', o.id, `${o.name} · ${input.segment} · teste ${input.trialDays} dias`)
  return o
}

/** Muda plano: organização.planId + assinatura; módulos do tenant = interseção com o plano. NÃO altera permissões de usuários. */
export function changePlan(tenantId: ID, planId: ID, actor: Actor) {
  const o = org(tenantId)
  const p = plan(planId)
  if (!p.active) throw new Error('Plano inativo não pode ser atribuído.')
  if (o.planId === planId) throw new Error('O contratante já está neste plano.')
  const modules = o.modules.filter((m) => p.modules.includes(m))
  const lost = o.modules.filter((m) => !p.modules.includes(m))
  platformDb.update('organizations', tenantId, { planId, modules })
  const s = subOf(tenantId)
  if (s) updateSub(s.id, actor, `Plano alterado de ${o.planId} para ${planId} (v${p.version})`, () => ({ planId }))
  logAudit(actor, 'contratante.plano_alterado', tenantId, `${o.planId} → ${planId}; módulos removidos: ${lost.join(', ') || 'nenhum'}`)
}

/** Suspensão comercial: muda status, NÃO apaga dados e NÃO bloqueia exportação (política para validação). */
export function suspendTenant(tenantId: ID, reason: string, actor: Actor) {
  const r = requireReason(reason)
  const o = org(tenantId)
  if (o.status === 'suspended') throw new Error('Contratante já está suspenso.')
  if (o.status === 'cancelled') throw new Error('Contratante cancelado não pode ser suspenso.')
  platformDb.update('organizations', tenantId, { status: 'suspended' })
  const s = subOf(tenantId)
  if (s) updateSub(s.id, actor, `Suspensão comercial: ${r}`, () => ({ status: 'pausada', pausedAt: todayCivil() }))
  logAudit(actor, 'contratante.suspenso', tenantId, r)
}
export function reactivateTenant(tenantId: ID, reason: string, actor: Actor) {
  const r = requireReason(reason)
  const o = org(tenantId)
  if (o.status !== 'suspended' && o.status !== 'past_due') throw new Error('Somente contratantes suspensos ou inadimplentes podem ser reativados.')
  platformDb.update('organizations', tenantId, { status: 'active' })
  const s = subOf(tenantId)
  if (s) updateSub(s.id, actor, `Reativação: ${r}`, () => ({ status: 'ativa', pausedAt: undefined }))
  logAudit(actor, 'contratante.reativado', tenantId, r)
}

// ---------- Planos ----------
export function savePlan(next: Plan, actor: Actor) {
  if (next.name.trim().length < 2) throw new Error('Informe o nome do plano.')
  for (const [k, v] of Object.entries(next.prices)) if (!Number.isInteger(v) || v <= 0) throw new Error(`Preço ${k} inválido.`)
  for (const [k, v] of Object.entries(next.limits)) if (!Number.isFinite(v) || v < 0) throw new Error(`Limite ${k} inválido.`)
  if (!next.modules.length) throw new Error('Selecione ao menos um módulo.')
  const exists = platformDb.list('plans').some((p) => p.id === next.id)
  if (exists) platformDb.update('plans', next.id, (p: Plan) => ({ ...next, version: p.version + 1 }))
  else platformDb.insert('plans', { ...next, version: 1 })
  logAudit(actor, exists ? 'plano.atualizado' : 'plano.criado', next.id, `${next.name} — versão ${exists ? 'incrementada' : '1'}`)
}
export function togglePlan(id: ID, actor: Actor) {
  // Desativar só impede novas atribuições; contratantes atuais seguem no plano.
  const p = plan(id)
  platformDb.update('plans', id, { active: !p.active })
  logAudit(actor, p.active ? 'plano.desativado' : 'plano.ativado', id, p.name)
}

// ---------- Testes ----------
export function extendTrial(subId: ID, days: number, reason: string, actor: Actor) {
  const r = requireReason(reason)
  if (!Number.isInteger(days) || days < 1 || days > 60) throw new Error('Extensão: 1 a 60 dias.')
  const s = sub(subId)
  if (!s.trial || (s.status !== 'trial' && s.status !== 'expirada')) throw new Error('Somente testes em andamento ou expirados podem ser estendidos.')
  const base = s.trial.end < todayCivil() ? todayCivil() : s.trial.end
  const end = addDays(base, days)
  updateSub(subId, actor, `Teste estendido em ${days} dia(s): ${r}`, (x) => ({ status: 'trial', currentPeriodEnd: end, trial: { ...x.trial!, end, extensions: [...x.trial!.extensions, { at: nowISO(), days, reason: r, by: actor.name }] } }))
  platformDb.update('organizations', s.tenantId, { status: 'trial' })
  logAudit(actor, 'teste.estendido', s.tenantId, `+${days} dias até ${end}: ${r}`)
}
export function expireTrial(subId: ID, actor: Actor) {
  const s = sub(subId)
  if (s.status !== 'trial') throw new Error('Assinatura não está em teste.')
  const t = todayCivil()
  updateSub(subId, actor, 'Teste expirado manualmente (dados preservados)', (x) => ({ status: 'expirada', trial: { ...x.trial!, end: t < x.trial!.end ? t : x.trial!.end } }))
  logAudit(actor, 'teste.expirado', s.tenantId, 'Dados preservados; acesso comercial a definir')
}
export function convertTrial(subId: ID, cycle: BillingCycle, actor: Actor) {
  const s = sub(subId)
  if (s.status !== 'trial' && s.status !== 'expirada') throw new Error('Somente testes podem ser convertidos.')
  const t = todayCivil()
  const p = plan(s.planId)
  if (!p.active) throw new Error('Plano inativo. Escolha um plano ativo antes da conversão.')
  platformDb.list('saasInvoices')
  updateSub(subId, actor, `Teste convertido (${cycle})`, (x) => ({ status: 'ativa', cycle, startedAt: x.startedAt, currentPeriodEnd: addDays(t, 30 * ({ mensal: 1, trimestral: 3, anual: 12 } as const)[cycle]), trial: { ...x.trial!, convertedAt: t } }))
  platformDb.update('organizations', s.tenantId, { status: 'active' })
  const inv = issueInvoice(subId, actor, `Primeira fatura após conversão`)
  logAudit(actor, 'teste.convertido', s.tenantId, `${p.name} ${cycle}; fatura ${inv.number}`)
  return inv
}

// ---------- Assinaturas ----------
export function createCoupon(input: { code: string; percent: number; validUntil: string; maxUses: number }, actor: Actor) {
  const code = input.code.trim().toUpperCase()
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) throw new Error('Código: 3 a 20 letras, números, hífen ou sublinhado.')
  if (platformDb.list('coupons').some((c) => c.code === code)) throw new Error('Código já existe.')
  if (!(input.percent > 0 && input.percent <= 100)) throw new Error('Percentual entre 1 e 100.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil) || input.validUntil < todayCivil()) throw new Error('Validade deve ser hoje ou futura.')
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1) throw new Error('Usos máximos: inteiro ≥ 1.')
  const c: Coupon = { id: uid('cp_'), code, percent: input.percent, validUntil: input.validUntil, maxUses: input.maxUses, uses: 0, active: true }
  platformDb.insert('coupons', c)
  logAudit(actor, 'cupom.criado', c.id, `${code} ${input.percent}% até ${input.validUntil}`)
}
export function toggleCoupon(id: ID, actor: Actor) {
  const c = platformDb.list('coupons').find((x) => x.id === id)
  if (!c) throw new Error('Cupom não encontrado.')
  platformDb.update('coupons', id, { active: !c.active })
  logAudit(actor, c.active ? 'cupom.desativado' : 'cupom.ativado', id, c.code)
}
export function applyCoupon(subId: ID, code: string, actor: Actor) {
  const c = platformDb.list('coupons').find((x) => x.code === code.trim().toUpperCase())
  if (!c) throw new Error('Cupom não encontrado.')
  if (!c.active) throw new Error('Cupom inativo.')
  if (c.validUntil < todayCivil()) throw new Error('Cupom vencido.')
  if (c.uses >= c.maxUses) throw new Error('Cupom atingiu o limite de usos.')
  const s = sub(subId)
  if (s.coupon?.code === c.code) throw new Error('Cupom já aplicado nesta assinatura.')
  updateSub(subId, actor, `Cupom ${c.code} (${c.percent}%) aplicado até ${c.validUntil}`, () => ({ coupon: { code: c.code, percent: c.percent, validUntil: c.validUntil } }))
  platformDb.update('coupons', c.id, { uses: c.uses + 1 })
  logAudit(actor, 'assinatura.cupom', s.tenantId, c.code)
}
export function removeCoupon(subId: ID, actor: Actor) {
  const s = sub(subId)
  if (!s.coupon) throw new Error('Sem cupom aplicado.')
  updateSub(subId, actor, `Cupom ${s.coupon.code} removido`, () => ({ coupon: undefined }))
  logAudit(actor, 'assinatura.cupom_removido', s.tenantId, s.coupon.code)
}
export function setDiscount(subId: ID, percent: number, validUntil: string, reason: string, actor: Actor) {
  const r = requireReason(reason)
  if (!(percent > 0 && percent <= 100)) throw new Error('Desconto entre 1 e 100%.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || validUntil < todayCivil()) throw new Error('Validade deve ser hoje ou futura.')
  const s = sub(subId)
  updateSub(subId, actor, `Desconto ${percent}% até ${validUntil}: ${r}`, () => ({ discount: { percent, validUntil, reason: r } }))
  logAudit(actor, 'assinatura.desconto', s.tenantId, `${percent}% até ${validUntil}: ${r}`)
}
export function changeCycle(subId: ID, cycle: BillingCycle, actor: Actor) {
  const s = sub(subId)
  if (s.cycle === cycle) throw new Error('Ciclo já selecionado.')
  updateSub(subId, actor, `Ciclo alterado de ${s.cycle} para ${cycle} (vale no próximo vencimento)`, () => ({ cycle }))
  logAudit(actor, 'assinatura.ciclo', s.tenantId, `${s.cycle} → ${cycle}`)
}
export function cancelSubscription(subId: ID, date: string, reason: string, actor: Actor) {
  const r = requireReason(reason)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Informe a data do cancelamento.')
  const s = sub(subId)
  if (s.status === 'cancelada') throw new Error('Assinatura já cancelada.')
  const immediate = date <= todayCivil()
  updateSub(subId, actor, `Cancelamento ${immediate ? 'efetivado' : 'agendado'} para ${date}: ${r} (dados preservados)`, () => ({ cancelAt: date, cancelReason: r, ...(immediate ? { status: 'cancelada' as const } : {}) }))
  if (immediate) platformDb.update('organizations', s.tenantId, { status: 'cancelled' })
  logAudit(actor, 'assinatura.cancelada', s.tenantId, `${date}: ${r}`)
}
export function pauseSubscription(subId: ID, reason: string, actor: Actor) {
  const r = requireReason(reason)
  const s = sub(subId)
  if (s.status !== 'ativa' && s.status !== 'inadimplente') throw new Error('Somente assinaturas ativas ou inadimplentes podem ser pausadas.')
  updateSub(subId, actor, `Pausada: ${r}`, () => ({ status: 'pausada', pausedAt: todayCivil() }))
  logAudit(actor, 'assinatura.pausada', s.tenantId, r)
}
export function reactivateSubscription(subId: ID, actor: Actor) {
  const s = sub(subId)
  if (s.status !== 'pausada' && s.status !== 'cancelada' && s.status !== 'expirada') throw new Error('Assinatura já está ativa.')
  updateSub(subId, actor, 'Reativada', () => ({ status: 'ativa', pausedAt: undefined, cancelAt: undefined, cancelReason: undefined }))
  platformDb.update('organizations', s.tenantId, { status: 'active' })
  logAudit(actor, 'assinatura.reativada', s.tenantId)
}

// ---------- Cobrança SaaS (simulada) ----------
export function issueInvoice(subId: ID, actor: Actor, note = 'Fatura avulsa') {
  const s = sub(subId)
  const p = plan(s.planId)
  const t = todayCivil()
  const invoices = platformDb.list('saasInvoices')
  const months = ({ mensal: 1, trimestral: 3, anual: 12 } as const)[s.cycle]
  const inv: SaasInvoice = {
    id: uid('inv_'), tenantId: s.tenantId, subscriptionId: s.id, number: nextInvoiceNumber(invoices), competence: t.slice(0, 7), dueDate: addDays(t, 5),
    amountCents: monthlyCents(s, p, t) * months, status: 'aberta', gateway: invoices.find((i) => i.tenantId === s.tenantId)?.gateway ?? 'asaas', reconciled: false, simulated: true,
  }
  platformDb.insert('saasInvoices', inv)
  logAudit(actor, 'fatura.emitida', inv.number, `${note} (simulada)`)
  return inv
}
const inv = (id: ID) => { const i = platformDb.list('saasInvoices').find((x) => x.id === id); if (!i) throw new Error('Fatura não encontrada.'); return i }
export function payInvoice(id: ID, actor: Actor) {
  const i = inv(id)
  if (i.status !== 'aberta' && i.status !== 'vencida') throw new Error('Somente faturas abertas ou vencidas podem receber pagamento.')
  platformDb.update('saasInvoices', id, { status: 'paga', paidAt: nowISO(), providerRef: i.providerRef ?? uid('sim_') })
  const s = subOf(i.tenantId)
  if (s?.status === 'inadimplente' && !platformDb.list('saasInvoices').some((x) => x.tenantId === i.tenantId && x.id !== id && x.status === 'vencida')) {
    updateSub(s.id, actor, 'Regularizada após pagamento', () => ({ status: 'ativa' }))
    platformDb.update('organizations', i.tenantId, { status: 'active' })
  }
  logAudit(actor, 'fatura.paga', i.number, `Pagamento simulado via ${i.gateway}`)
}
export function refundInvoice(id: ID, reason: string, actor: Actor) {
  const r = requireReason(reason)
  const i = inv(id)
  if (i.status !== 'paga') throw new Error('Somente faturas pagas podem ser estornadas.')
  platformDb.update('saasInvoices', id, { status: 'estornada', reconciled: false })
  logAudit(actor, 'fatura.estornada', i.number, `${r} (simulado)`)
}
export function setReconciled(id: ID, value: boolean, actor: Actor) {
  const i = inv(id)
  if (value && i.status !== 'paga' && i.status !== 'estornada') throw new Error('Só é possível conciliar faturas pagas ou estornadas.')
  platformDb.update('saasInvoices', id, { reconciled: value })
  logAudit(actor, value ? 'fatura.conciliada' : 'fatura.desconciliada', i.number)
}

// ---------- Integrações (simulado) ----------
export function reprocessIntegration(id: ID, actor: Actor) {
  const it = platformDb.list('integrations').find((x) => x.id === id)
  if (!it) throw new Error('Integração não encontrada.')
  const n = it.queue.failed + it.queue.retrying
  if (!n) throw new Error('Não há falhas na fila para reprocessar.')
  const at = nowISO()
  platformDb.update('integrations', id, {
    queue: { pending: it.queue.pending, failed: 0, retrying: 0 }, lastEventAt: at, errorRate: Math.max(0, +(it.errorRate / 2).toFixed(3)),
    status: it.status === 'erro' || it.status === 'degradada' ? 'simulada' : it.status,
    events: [{ id: uid('ev_'), at, type: 'retry.batch', result: 'ok', detail: `${n} item(ns) reprocessado(s) com a mesma chave de idempotência (simulado) — nenhuma cobrança/mensagem nova criada` }, ...it.events].slice(0, 20),
  })
  logAudit(actor, 'integracao.reprocessada', id, `${n} itens (simulado)`)
}
export function simulateDuplicateEvent(id: ID, actor: Actor) {
  const it = platformDb.list('integrations').find((x) => x.id === id)
  if (!it) throw new Error('Integração não encontrada.')
  const at = nowISO()
  const eventId = uid('evt_')
  platformDb.update('integrations', id, {
    lastEventAt: at,
    events: [
      { id: uid('ev_'), at, type: 'webhook.recebido', result: 'duplicado', detail: `eventId ${eventId} repetido — ignorado (idempotência)` },
      { id: uid('ev_'), at, type: 'webhook.recebido', result: 'ok', detail: `eventId ${eventId} processado` },
      ...it.events,
    ].slice(0, 20),
  })
  logAudit(actor, 'integracao.evento_simulado', id, 'Webhook duplicado simulado')
}

// ---------- Domínios (diagnóstico demonstrativo) ----------
export function recheckDomain(id: ID, actor: Actor) {
  const d = platformDb.list('domains').find((x) => x.id === id)
  if (!d) throw new Error('Domínio não encontrado.')
  const at = nowISO()
  const next = d.status === 'pendente' || d.status === 'erro' ? 'verificando' : d.status === 'verificando' ? 'verificado' : d.status
  const cert = next === 'verificado' ? (d.certificate === 'ativo' ? 'ativo' : 'pendente') : d.certificate === 'erro' ? 'pendente' : d.certificate
  const certFinal = d.status === 'verificado' && d.certificate === 'pendente' ? 'ativo' : cert
  const msg = next === 'verificado' ? (certFinal === 'ativo' ? 'Hostname verificado e certificado ativo (simulado).' : 'Hostname verificado; emissão de certificado pendente (simulado).') : 'Nova verificação em andamento — aguarde o registro informado pelo provedor de hospedagem/DNS (simulado).'
  platformDb.update('domains', id, { status: next, certificate: certFinal, lastCheckAt: at, diagnostics: [`${new Date(at).toLocaleString('pt-BR')}: ${msg}`, ...d.diagnostics].slice(0, 6) })
  logAudit(actor, 'dominio.verificado', d.hostname, `${d.status} → ${next}; certificado ${certFinal} (simulado)`)
}

// ---------- Suporte ----------
export function createTicket(input: { tenantId: ID; subject: string; description: string; priority: SupportTicket['priority']; slaHours: number }, actor: Actor) {
  if (input.subject.trim().length < 4) throw new Error('Informe o assunto.')
  org(input.tenantId)
  if (!(input.slaHours > 0 && input.slaHours <= 720)) throw new Error('SLA entre 1 e 720 horas.')
  const list = platformDb.list('tickets')
  const n = list.reduce((a, t) => Math.max(a, Number(t.number.replace(/\D/g, '')) || 0), 2000) + 1
  const t: SupportTicket = {
    id: uid('tk_'), tenantId: input.tenantId, number: `SUP-${n}`, subject: input.subject.trim(), description: input.description.trim(), priority: input.priority, status: 'aberto',
    createdAt: nowISO(), slaHours: input.slaHours, attachments: [], messages: [{ at: nowISO(), from: 'suporte', author: actor.name, text: `Chamado aberto: ${input.description.trim() || input.subject.trim()}` }],
  }
  platformDb.insert('tickets', t)
  logAudit(actor, 'ticket.criado', t.number, t.subject)
  return t
}
function updTicket(id: ID, actor: Actor, action: string, patch: (t: SupportTicket) => Partial<SupportTicket>, detail?: string) {
  const t = platformDb.list('tickets').find((x) => x.id === id)
  if (!t) throw new Error('Chamado não encontrado.')
  platformDb.update('tickets', id, (x: SupportTicket) => ({ ...x, ...patch(x) }))
  logAudit(actor, action, t.number, detail)
}
export const setTicketStatus = (id: ID, status: SupportTicket['status'], a: Actor) => updTicket(id, a, 'ticket.status', () => ({ status }), status)
export const setTicketAssignee = (id: ID, assigneeId: ID | undefined, a: Actor) => updTicket(id, a, 'ticket.responsavel', () => ({ assigneeId }), assigneeId ?? 'sem responsável')
export const setTicketPriority = (id: ID, priority: SupportTicket['priority'], a: Actor) => updTicket(id, a, 'ticket.prioridade', () => ({ priority }), priority)
export function setTicketSla(id: ID, hours: number, a: Actor) {
  if (!(hours > 0 && hours <= 720)) throw new Error('SLA entre 1 e 720 horas.')
  updTicket(id, a, 'ticket.sla', () => ({ slaHours: hours }), `${hours}h`)
}
export function addTicketMessage(id: ID, from: 'cliente' | 'suporte', text: string, a: Actor) {
  const v = text.trim()
  if (v.length < 2) throw new Error('Escreva a mensagem.')
  updTicket(id, a, 'ticket.mensagem', (t) => ({ messages: [...t.messages, { at: nowISO(), from, author: from === 'suporte' ? a.name : 'Clínica (simulado)', text: v }], status: from === 'suporte' && t.status === 'aberto' ? 'em_andamento' : t.status }))
}
export function addFakeAttachment(id: ID, name: string, a: Actor) {
  const n = name.trim()
  if (!/^[\w\-. ]{3,60}\.(png|jpg|pdf|txt)$/i.test(n)) throw new Error('Nome de anexo fictício inválido (ex.: captura.png).')
  updTicket(id, a, 'ticket.anexo', (t) => ({ attachments: [...t.attachments, { name: n, sizeKb: 40 + (n.length * 13) % 400 }] }), `${n} (fictício)`)
}

// Acesso assistido: solicitar → clínica autoriza → ativo até expirar → revogar. Nunca leitura automática de prontuário.
export function requestAssistedAccess(id: ID, input: { reason: string; scope: NonNullable<SupportTicket['assistedAccess']>['scope']; hours: number }, a: Actor) {
  const r = requireReason(input.reason, 10)
  if (!(input.hours >= 1 && input.hours <= 72)) throw new Error('Prazo entre 1 e 72 horas.')
  const t = platformDb.list('tickets').find((x) => x.id === id)
  if (t?.assistedAccess && (t.assistedAccess.status === 'solicitado' || t.assistedAccess.status === 'autorizado')) throw new Error('Já existe acesso assistido pendente ou ativo neste chamado.')
  // expiresAt na solicitação = prazo PROPOSTO (requestedAt + horas); a contagem real recomeça na autorização.
  const at = nowISO()
  const proposed = new Date(new Date(at).getTime() + input.hours * 3600000).toISOString()
  updTicket(id, a, 'acesso_assistido.solicitado', () => ({ assistedAccess: { reason: r, requestedAt: at, requestedBy: a.name, status: 'solicitado', scope: input.scope, expiresAt: proposed } }), `${input.scope}, ${input.hours}h: ${r}`)
}
/** Simula decisão da CLÍNICA (em produção: usuário proprietário do tenant, autenticado no ambiente da clínica). */
export function clinicDecision(id: ID, approve: boolean, a: Actor) {
  const t = platformDb.list('tickets').find((x) => x.id === id)
  const aa = t?.assistedAccess
  if (!aa || aa.status !== 'solicitado') throw new Error('Não há solicitação pendente.')
  const durMs = aa.expiresAt ? Math.max(3600000, new Date(aa.expiresAt).getTime() - new Date(aa.requestedAt).getTime()) : 4 * 3600000
  const expiresAt = new Date(Date.now() + durMs).toISOString()
  updTicket(id, a, approve ? 'acesso_assistido.autorizado' : 'acesso_assistido.negado', () => ({ assistedAccess: { ...aa, status: approve ? 'autorizado' : 'negado', authorizedBy: 'Proprietária da clínica (simulado)', expiresAt: approve ? expiresAt : undefined } }), approve ? `Autorizado pela clínica (simulado) até ${expiresAt}` : 'Negado pela clínica (simulado)')
}
export function revokeAssistedAccess(id: ID, a: Actor) {
  const t = platformDb.list('tickets').find((x) => x.id === id)
  if (t?.assistedAccess?.status !== 'autorizado') throw new Error('Não há acesso ativo para revogar.')
  updTicket(id, a, 'acesso_assistido.revogado', (x) => ({ assistedAccess: { ...x.assistedAccess!, status: 'revogado' } }))
}
export function expireAssistedAccess(id: ID, a: Actor) {
  updTicket(id, a, 'acesso_assistido.expirado', (x) => ({ assistedAccess: { ...x.assistedAccess!, status: 'expirado' } }), 'Prazo encerrado automaticamente')
}

// ---------- Operação ----------
export function updateFlag(id: ID, patch: Partial<FeatureFlag>, a: Actor, detail: string) {
  if (patch.rollout != null && !(Number.isInteger(patch.rollout) && patch.rollout >= 0 && patch.rollout <= 100)) throw new Error('Rollout entre 0 e 100%.')
  const f = platformDb.list('flags').find((x) => x.id === id)
  if (!f) throw new Error('Flag não encontrada.')
  platformDb.update('flags', id, patch)
  logAudit(a, 'flag.alterada', f.key, detail)
}
export function createFlag(key: string, description: string, a: Actor) {
  const k = key.trim()
  if (!/^[a-z0-9]+(\.[a-z0-9_-]+)+$/.test(k)) throw new Error('Chave no formato area.recurso (minúsculas).')
  if (platformDb.list('flags').some((f) => f.key === k)) throw new Error('Chave já existe.')
  platformDb.insert('flags', { id: uid('ff_'), key: k, description: description.trim() || k, enabledGlobally: false, tenantOverrides: {}, rollout: 0 })
  logAudit(a, 'flag.criada', k)
}
export function createIncident(input: { title: string; severity: Incident['severity']; components: string[]; text: string }, a: Actor) {
  if (input.title.trim().length < 4) throw new Error('Informe o título.')
  if (!input.components.length) throw new Error('Selecione ao menos um componente afetado.')
  const at = nowISO()
  platformDb.insert('incidents', { id: uid('inc_'), title: input.title.trim(), severity: input.severity, status: 'investigando', startedAt: at, components: input.components, updates: [{ at, text: input.text.trim() || 'Incidente aberto; investigando.' }] })
  logAudit(a, 'incidente.criado', input.title.trim(), `${input.severity}: ${input.components.join(', ')}`)
}
export function updateIncident(id: ID, status: Incident['status'], text: string, a: Actor) {
  const inc = platformDb.list('incidents').find((x) => x.id === id)
  if (!inc) throw new Error('Incidente não encontrado.')
  if (inc.status === 'resolvido') throw new Error('Incidente já resolvido.')
  if (text.trim().length < 3) throw new Error('Descreva a atualização.')
  const at = nowISO()
  platformDb.update('incidents', id, { status, resolvedAt: status === 'resolvido' ? at : undefined, updates: [...inc.updates, { at, text: text.trim() }] })
  logAudit(a, 'incidente.atualizado', inc.title, `${status}: ${text.trim()}`)
}
export function createAnnouncement(input: { title: string; body: string; audience: 'todos' | 'owners' | 'plano'; publish: boolean }, a: Actor) {
  if (input.title.trim().length < 3) throw new Error('Informe o título.')
  platformDb.insert('announcements', { id: uid('an_'), title: input.title.trim(), body: input.body.trim(), audience: input.audience, publishedAt: input.publish ? nowISO() : undefined, active: input.publish })
  logAudit(a, 'aviso.criado', input.title.trim(), input.publish ? 'publicado' : 'rascunho')
}
export function toggleAnnouncement(id: ID, a: Actor) {
  const an = platformDb.list('announcements').find((x) => x.id === id)
  if (!an) throw new Error('Aviso não encontrado.')
  platformDb.update('announcements', id, { active: !an.active, publishedAt: an.publishedAt ?? nowISO() })
  logAudit(a, an.active ? 'aviso.despublicado' : 'aviso.publicado', an.title)
}
export function addChangelog(version: string, items: string[], a: Actor) {
  const v = version.trim()
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error('Versão no formato 0.0.0.')
  if (platformDb.list('changelog').some((c) => c.version === v)) throw new Error('Versão já registrada.')
  const it = items.map((s) => s.trim()).filter(Boolean)
  if (!it.length) throw new Error('Informe ao menos um item.')
  platformDb.insert('changelog', { id: uid('cl_'), version: v, date: todayCivil(), items: it })
  logAudit(a, 'changelog.publicado', v, `${it.length} item(ns)`)
}

// ---------- Governança ----------
export function createPlatformUser(input: { name: string; email: string; role: PlatformRole }, a: Actor) {
  if (input.name.trim().length < 3) throw new Error('Informe o nome.')
  const email = input.email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.')
  if (!isConnectedEnv() && !/^[^@\s]+@[^@\s]+\.(exemplo|test)(\.[a-z]+)?$/.test(email)) throw new Error('Use e-mail fictício (.exemplo ou .test).')
  if (platformDb.list('platformUsers').some((u) => u.email === email)) throw new Error('E-mail já cadastrado.')
  const id = uid('pu_')
  platformDb.insert('platformUsers', { id, name: input.name.trim(), email, role: input.role, active: true })
  logAudit(a, 'usuario_interno.criado', email, input.role)
}
export function updatePlatformUser(id: ID, patch: { role?: PlatformRole; active?: boolean }, a: Actor) {
  const list = platformDb.list('platformUsers')
  const u = list.find((x) => x.id === id)
  if (!u) throw new Error('Usuário não encontrado.')
  if (id === a.id) throw new Error('Você não pode alterar o próprio papel/estado.')
  const nextRole = patch.role ?? u.role, nextActive = patch.active ?? u.active
  const owners = list.filter((x) => x.role === 'platform_owner' && x.active && x.id !== id).length
  if (u.role === 'platform_owner' && (nextRole !== 'platform_owner' || !nextActive) && owners === 0) throw new Error('É necessário manter ao menos um proprietário ativo.')
  platformDb.update('platformUsers', id, patch)
  logAudit(a, 'usuario_interno.alterado', u.email, JSON.stringify(patch))
}
export function createDataRequest(input: { tenantId: ID; kind: DataRequest['kind']; notes: string }, a: Actor) {
  org(input.tenantId)
  platformDb.insert('dataRequests', { id: uid('dr_'), tenantId: input.tenantId, kind: input.kind, status: 'recebida', requestedAt: nowISO(), requestedBy: a.name, notes: input.notes.trim() })
  logAudit(a, 'solicitacao.recebida', input.tenantId, input.kind)
}
export function transitionDataRequest(id: ID, to: DataRequest['status'], note: string, a: Actor) {
  const r = platformDb.list('dataRequests').find((x) => x.id === id)
  if (!r) throw new Error('Solicitação não encontrada.')
  if (!canTransitionRequest(r.status, to)) throw new Error(`Transição inválida: ${r.status} → ${to}.`)
  if ((to === 'recusada' || to === 'concluida') && note.trim().length < 5) throw new Error('Registre uma observação (mínimo 5 caracteres).')
  platformDb.update('dataRequests', id, { status: to, notes: note.trim() ? `${r.notes}\n${new Date().toLocaleString('pt-BR')} — ${to}: ${note.trim()}`.trim() : r.notes })
  logAudit(a, `solicitacao.${to}`, r.tenantId, note.trim() || undefined)
}
