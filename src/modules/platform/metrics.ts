// Regras e métricas PURAS do Super Admin (Contexto A: clínica paga a Qlinic).
// Nada aqui lê receita de pacientes (Contexto B). Datas civis "YYYY-MM-DD" comparáveis como string.
import { CYCLE_MONTHS, type DataRequest, type Incident, type IntegrationHealth, type Plan, type PlanLimits, type SaasInvoice, type Subscription, type SupportTicket, type UsageRecord } from '@/domain/platform'
import type { ModuleKey } from '@/domain/types'
import type { Cents } from '@/lib/money'

type CivilDate = string

export function addDays(date: CivilDate, days: number): CivilDate {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
export function daysBetween(from: CivilDate, to: CivilDate): number {
  const p = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((p(to) - p(from)) / 86400000)
}

// ---------- Receita recorrente ----------
/** Início da fase paga (fim do teste convertido ou início da assinatura sem teste). */
function paidStart(s: Subscription): CivilDate | undefined {
  if (s.status === 'trial' || s.status === 'expirada') return undefined
  return s.trial ? (s.trial.convertedAt ?? s.trial.end) : s.startedAt
}

/** Assinatura ativa em `date`: já convertida, não cancelada até a data e não pausada. Inadimplentes ficam fora do MRR. */
export function isPayingOn(s: Subscription, date: CivilDate): boolean {
  const start = paidStart(s)
  if (!start || start > date) return false
  if (s.cancelAt && s.cancelAt <= date) return false
  if (s.status === 'pausada' && (!s.pausedAt || s.pausedAt <= date)) return false
  if (s.status === 'cancelada' && !s.cancelAt) return false
  if (s.status === 'inadimplente') return false
  return true
}

/** Valor mensal normalizado: preço do ciclo ÷ meses do ciclo, com cupom e desconto válidos na data (multiplicativos). */
export function monthlyCents(s: Subscription, plan: Plan | undefined, date: CivilDate): Cents {
  if (!plan) return 0
  let factor = 1
  if (s.coupon && s.coupon.validUntil >= date) factor *= 1 - s.coupon.percent / 100
  if (s.discount && s.discount.validUntil >= date) factor *= 1 - s.discount.percent / 100
  return Math.round((plan.prices[s.cycle] / CYCLE_MONTHS[s.cycle]) * factor)
}

export function mrr(subs: Subscription[], plans: Plan[], date: CivilDate): Cents {
  return subs.filter((s) => isPayingOn(s, date)).reduce((a, s) => a + monthlyCents(s, plans.find((p) => p.id === s.planId), date), 0)
}
export const arr = (mrrCents: Cents): Cents => mrrCents * 12

function monthEnd(ym: string): CivilDate {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
/** MRR no fim de cada mês (mês corrente = até hoje). Usa plano/ciclo atuais (sem histórico de troca — limitação). */
export function mrrSeries(subs: Subscription[], plans: Plan[], today: CivilDate, months = 6): { month: string; date: CivilDate; cents: Cents }[] {
  const [y, m] = today.split('-').map(Number)
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (months - 1 - i), 1))
    const ym = d.toISOString().slice(0, 7)
    const date = i === months - 1 ? today : monthEnd(ym)
    return { month: ym, date, cents: mrr(subs, plans, date) }
  })
}

// ---------- Retenção ----------
/** Churn = canceladas no período ÷ pagantes no início do período. */
export function churn(subs: Subscription[], start: CivilDate, end: CivilDate) {
  const base = subs.filter((s) => isPayingOn(s, start))
  const churned = base.filter((s) => s.cancelAt && s.cancelAt > start && s.cancelAt <= end)
  return { base: base.length, churned: churned.length, rate: base.length ? churned.length / base.length : 0 }
}

/** Conversão de teste = convertidos ÷ testes encerrados (convertidos + expirados/cancelados) com encerramento no período. */
export function trialConversion(subs: Subscription[], start: CivilDate, end: CivilDate) {
  let converted = 0, ended = 0
  for (const s of subs) {
    if (!s.trial) continue
    const closedAt = s.trial.convertedAt ?? (s.status === 'expirada' || s.status === 'cancelada' ? (s.cancelAt ?? s.trial.end) : undefined)
    if (!closedAt || closedAt <= start || closedAt > end) continue
    ended++
    if (s.trial.convertedAt) converted++
  }
  return { converted, ended, rate: ended ? converted / ended : 0 }
}

export function trialDaysLeft(s: Subscription, today: CivilDate): number | null {
  return s.trial ? daysBetween(today, s.trial.end) : null
}

// ---------- Inadimplência SaaS ----------
export function isOverdue(i: SaasInvoice, today: CivilDate) {
  return i.status === 'vencida' || (i.status === 'aberta' && i.dueDate < today)
}
/** Inadimplência = valor vencido e não pago ÷ valor com vencimento no período (exclui canceladas/estornadas). */
export function delinquency(invoices: SaasInvoice[], start: CivilDate, today: CivilDate) {
  const overdue = invoices.filter((i) => isOverdue(i, today))
  const due = invoices.filter((i) => i.dueDate > start && i.dueDate <= today && i.status !== 'cancelada' && i.status !== 'estornada')
  const overdueCents = overdue.reduce((a, i) => a + i.amountCents, 0)
  const dueCents = due.reduce((a, i) => a + i.amountCents, 0)
  return { overdueCents, overdueCount: overdue.length, tenants: new Set(overdue.map((i) => i.tenantId)).size, dueCents, rate: dueCents ? Math.min(1, overdueCents / dueCents) : 0 }
}

/** Divergências de conciliação (simuladas). */
export function reconciliationIssue(i: SaasInvoice, today: CivilDate): string | null {
  if (i.status === 'paga' && !i.reconciled) return 'Paga sem conciliação'
  if (i.reconciled && i.status !== 'paga' && i.status !== 'estornada') return 'Conciliada sem pagamento'
  if (i.status === 'paga' && !i.providerRef) return 'Pagamento sem referência do provedor'
  if (isOverdue(i, today)) return 'Vencida'
  return null
}

export function nextInvoiceNumber(invoices: SaasInvoice[]): string {
  const max = invoices.reduce((a, i) => Math.max(a, Number(i.number.replace(/\D/g, '')) || 0), 1000)
  return `QL-${max + 1}`
}

// ---------- Uso, limites, custos ----------
export function latestUsage(usage: UsageRecord[], tenantId: string): UsageRecord | undefined {
  return usage.filter((u) => u.tenantId === tenantId).sort((a, b) => b.month.localeCompare(a.month))[0]
}
export type UsageKey = 'storageGb' | 'messages' | 'aiCredits'
export const USAGE_LIMIT: Record<UsageKey, keyof PlanLimits> = { storageGb: 'storageGb', messages: 'messagesMonth', aiCredits: 'aiCreditsMonth' }
export function usageRatios(u: UsageRecord | undefined, plan: Plan | undefined): Record<UsageKey, number> {
  const r = (k: UsageKey) => (u && plan && plan.limits[USAGE_LIMIT[k]] > 0 ? u[k] / plan.limits[USAGE_LIMIT[k]] : 0)
  return { storageGb: r('storageGb'), messages: r('messages'), aiCredits: r('aiCredits') }
}
export type LimitLevel = 'ok' | 'atencao' | 'excedido'
export const limitLevel = (ratio: number): LimitLevel => (ratio >= 1 ? 'excedido' : ratio >= 0.8 ? 'atencao' : 'ok')

export interface CostAssumptions { storageGbCents: number; messageCents: number; aiCreditCents: number; fixedCents: number }
/** Padrão reproduz a estimativa do seed (usage.estCostCents). */
export const DEFAULT_COSTS: CostAssumptions = { storageGbCents: 25, messageCents: 4, aiCreditCents: 3, fixedCents: 1500 }
export function estimatedCost(u: UsageRecord | undefined, c: CostAssumptions): Cents {
  if (!u) return c.fixedCents
  return Math.round(u.storageGb * c.storageGbCents + u.messages * c.messageCents + u.aiCredits * c.aiCreditCents + c.fixedCents)
}
/** Margem SaaS = (receita mensal − custo estimado) ÷ receita. Sem receita → null (não é 0%). */
export function margin(revenue: Cents, cost: Cents) {
  return { cents: revenue - cost, pct: revenue > 0 ? (revenue - cost) / revenue : null }
}

// ---------- Mudança de plano ----------
export interface PlanChangeImpact {
  direction: 'upgrade' | 'downgrade' | 'lateral'
  rule: string
  lostModules: ModuleKey[]
  newlyAvailable: ModuleKey[]
  nextModules: ModuleKey[]
  limits: { key: keyof PlanLimits; from: number; to: number; current: number | null; over: boolean }[]
}
export function planChangeImpact(currentModules: ModuleKey[], from: Plan | undefined, to: Plan, current: Partial<Record<keyof PlanLimits, number>>): PlanChangeImpact {
  const fromM = from ? from.prices.mensal : 0
  const direction = to.prices.mensal > fromM ? 'upgrade' : to.prices.mensal < fromM ? 'downgrade' : 'lateral'
  const rule = direction === 'upgrade' ? to.upgradeRule : direction === 'downgrade' ? to.downgradeRule : 'imediato'
  const keys = Object.keys(to.limits) as (keyof PlanLimits)[]
  return {
    direction, rule,
    lostModules: currentModules.filter((m) => !to.modules.includes(m)),
    newlyAvailable: to.modules.filter((m) => !currentModules.includes(m) && !(from?.modules ?? []).includes(m)),
    nextModules: currentModules.filter((m) => to.modules.includes(m)),
    limits: keys.map((k) => ({ key: k, from: from?.limits[k] ?? 0, to: to.limits[k], current: current[k] ?? null, over: (current[k] ?? 0) > to.limits[k] })),
  }
}

// ---------- Operação ----------
export type ComponentState = 'operacional' | 'degradado' | 'parcial' | 'indisponivel'
const SEV_STATE: Record<Incident['severity'], ComponentState> = { menor: 'degradado', maior: 'parcial', critico: 'indisponivel' }
const STATE_RANK: Record<ComponentState, number> = { operacional: 0, degradado: 1, parcial: 2, indisponivel: 3 }
export function componentStatus(incidents: Incident[], components: string[]): Record<string, ComponentState> {
  const out = Object.fromEntries(components.map((c) => [c, 'operacional'])) as Record<string, ComponentState>
  for (const inc of incidents) {
    if (inc.status === 'resolvido') continue
    for (const c of inc.components) {
      const s = SEV_STATE[inc.severity]
      if (!(c in out) || STATE_RANK[s] > STATE_RANK[out[c]]) out[c] = s
    }
  }
  return out
}

export function integrationFailures(list: IntegrationHealth[]) {
  const bad = list.filter((i) => i.status === 'erro' || i.status === 'degradada' || i.status === 'expirada')
  return { unhealthy: bad.length, failedQueue: list.reduce((a, i) => a + i.queue.failed, 0), retrying: list.reduce((a, i) => a + i.queue.retrying, 0) }
}

/** Remove PII de mensagens de erro antes de exibir (e-mail, CPF/CNPJ, telefone, tokens). */
export function sanitize(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-mail]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[documento]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento]')
    .replace(/\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '[telefone]')
    .replace(/\b(Bearer\s+)?(sk|pk|tok|key|aact)_[\w-]{6,}/gi, '[credencial]')
}

export function slaState(t: SupportTicket, nowMs: number) {
  const deadline = new Date(t.createdAt).getTime() + t.slaHours * 3600000
  const closed = t.status === 'resolvido' || t.status === 'fechado'
  const remainingMs = deadline - nowMs
  return { deadline, remainingMs, closed, breached: !closed && remainingMs < 0 }
}

export const DR_NEXT: Record<DataRequest['status'], DataRequest['status'][]> = {
  recebida: ['em_analise', 'recusada'], em_analise: ['aprovada', 'recusada'], aprovada: ['concluida'], concluida: [], recusada: [],
}
export function canTransitionRequest(from: DataRequest['status'], to: DataRequest['status']) {
  return DR_NEXT[from].includes(to)
}
