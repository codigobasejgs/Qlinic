import { describe, it, expect } from 'vitest'
import type { Plan, SaasInvoice, Subscription } from '@/domain/platform'
import { arr, canTransitionRequest, churn, componentStatus, delinquency, estimatedCost, DEFAULT_COSTS, isPayingOn, margin, monthlyCents, mrr, planChangeImpact, sanitize, trialConversion, limitLevel } from './metrics'

const plan = (id: string, mensal: number, trimestral: number, anual: number, modules: Plan['modules'] = ['agenda']): Plan => ({
  id, name: id, description: '', prices: { mensal, trimestral, anual }, modules,
  limits: { users: 5, professionals: 3, units: 1, storageGb: 20, messagesMonth: 1000, aiCreditsMonth: 200 },
  overage: { messageCents: 1, storageGbCents: 1, aiCreditCents: 1, extraProfessionalCents: 1 }, upgradeRule: 'imediato_pro_rata', downgradeRule: 'proximo_ciclo', active: true, version: 1,
})
const P = [plan('a', 10000, 27000, 96000), plan('b', 50000, 140000, 480000, ['agenda', 'crm', 'ia'])]
const sub = (o: Partial<Subscription>): Subscription => ({ id: Math.random().toString(36), tenantId: 't', planId: 'a', cycle: 'mensal', status: 'ativa', startedAt: '2026-01-01', currentPeriodEnd: '2026-12-01', history: [], ...o })
const T = '2026-10-27'

describe('MRR/ARR', () => {
  it('normaliza ciclos mistos para mensal e aplica cupom válido', () => {
    const subs = [
      sub({ cycle: 'mensal' }), // 10000
      sub({ cycle: 'trimestral' }), // 27000/3 = 9000
      sub({ cycle: 'anual', planId: 'b' }), // 480000/12 = 40000
      sub({ cycle: 'mensal', coupon: { code: 'X', percent: 20, validUntil: '2026-12-31' } }), // 8000
      sub({ cycle: 'mensal', coupon: { code: 'Y', percent: 50, validUntil: '2026-01-31' } }), // cupom vencido: 10000
    ]
    expect(mrr(subs, P, T)).toBe(10000 + 9000 + 40000 + 8000 + 10000)
    expect(arr(mrr(subs, P, T))).toBe(77000 * 12)
  })
  it('exclui trial, pausada, cancelada, expirada e inadimplente', () => {
    const subs = [
      sub({ status: 'trial', trial: { start: '2026-10-20', end: '2026-11-03', extensions: [] } }),
      sub({ status: 'pausada', pausedAt: '2026-10-01' }),
      sub({ status: 'cancelada', cancelAt: '2026-10-10' }),
      sub({ status: 'expirada' }),
      sub({ status: 'inadimplente' }),
    ]
    expect(mrr(subs, P, T)).toBe(0)
  })
  it('desconto e cupom são multiplicativos e arredondados em centavos', () => {
    const s = sub({ cycle: 'trimestral', coupon: { code: 'X', percent: 10, validUntil: T }, discount: { percent: 5, validUntil: T, reason: 'r' } })
    expect(monthlyCents(s, P[0], T)).toBe(Math.round(9000 * 0.9 * 0.95))
    expect(Number.isInteger(monthlyCents(s, P[0], T))).toBe(true)
  })
  it('respeita data de início pago (conversão do teste)', () => {
    const s = sub({ trial: { start: '2026-10-01', end: '2026-10-15', extensions: [], convertedAt: '2026-10-15' } })
    expect(isPayingOn(s, '2026-10-10')).toBe(false)
    expect(isPayingOn(s, '2026-10-20')).toBe(true)
  })
})

describe('churn e conversão', () => {
  it('churn = canceladas no período ÷ pagantes no início', () => {
    const subs = [sub({}), sub({}), sub({}), sub({ status: 'cancelada', cancelAt: '2026-10-15' }), sub({ status: 'cancelada', cancelAt: '2026-08-01' })]
    const c = churn(subs, '2026-09-27', T)
    expect(c.base).toBe(4)
    expect(c.churned).toBe(1)
    expect(c.rate).toBeCloseTo(0.25)
  })
  it('conversão = convertidos ÷ encerrados no período', () => {
    const subs = [
      sub({ trial: { start: '2026-10-01', end: '2026-10-15', extensions: [], convertedAt: '2026-10-15' } }),
      sub({ status: 'expirada', trial: { start: '2026-10-01', end: '2026-10-14', extensions: [] } }),
      sub({ status: 'trial', trial: { start: '2026-10-20', end: '2026-11-03', extensions: [] } }), // ainda em teste: fora
      sub({ trial: { start: '2026-01-01', end: '2026-01-15', extensions: [], convertedAt: '2026-01-15' } }), // fora do período
    ]
    expect(trialConversion(subs, '2026-09-27', T)).toEqual({ converted: 1, ended: 2, rate: 0.5 })
  })
})

describe('inadimplência', () => {
  const inv = (o: Partial<SaasInvoice>): SaasInvoice => ({ id: Math.random().toString(36), tenantId: 't', subscriptionId: 's', number: 'QL-1', competence: '2026-10', dueDate: '2026-10-10', amountCents: 10000, status: 'paga', gateway: 'asaas', reconciled: true, simulated: true, ...o })
  it('soma vencidas (incl. abertas com vencimento passado) sobre devido no período', () => {
    const list = [inv({}), inv({ status: 'vencida', tenantId: 'x' }), inv({ status: 'aberta', dueDate: '2026-10-20', tenantId: 'y' }), inv({ status: 'aberta', dueDate: '2026-11-05' }), inv({ status: 'cancelada' })]
    const d = delinquency(list, '2026-09-27', T)
    expect(d.overdueCents).toBe(20000)
    expect(d.tenants).toBe(2)
    expect(d.dueCents).toBe(30000)
    expect(d.rate).toBeCloseTo(2 / 3)
  })
})

describe('custos e margem', () => {
  it('estimativa padrão reproduz a fórmula do seed', () => {
    const u = { id: 'u', tenantId: 't', month: '2026-10', storageGb: 10, messages: 100, aiCredits: 50, estCostCents: 0 }
    expect(estimatedCost(u, DEFAULT_COSTS)).toBe(10 * 25 + 100 * 4 + 50 * 3 + 1500)
  })
  it('margem SaaS; sem receita não vira 0%', () => {
    expect(margin(10000, 2500)).toEqual({ cents: 7500, pct: 0.75 })
    expect(margin(0, 2500).pct).toBeNull()
    expect(limitLevel(0.79)).toBe('ok')
    expect(limitLevel(0.8)).toBe('atencao')
    expect(limitLevel(1)).toBe('excedido')
  })
})

describe('regras auxiliares', () => {
  it('mudança de plano: interseção de módulos e alerta de limite', () => {
    const imp = planChangeImpact(['agenda', 'crm', 'ia'], P[1], P[0], { storageGb: 25 })
    expect(imp.direction).toBe('downgrade')
    expect(imp.lostModules).toEqual(['crm', 'ia'])
    expect(imp.nextModules).toEqual(['agenda'])
    expect(imp.limits.find((l) => l.key === 'storageGb')?.over).toBe(true)
  })
  it('status por componente deriva de incidentes abertos', () => {
    const s = componentStatus([{ id: 'i', title: '', severity: 'maior', status: 'monitorando', startedAt: '', components: ['API'], updates: [] }, { id: 'j', title: '', severity: 'critico', status: 'resolvido', startedAt: '', components: ['Agenda'], updates: [] }], ['API', 'Agenda'])
    expect(s).toEqual({ API: 'parcial', Agenda: 'operacional' })
  })
  it('sanitiza PII e fluxo de solicitações', () => {
    expect(sanitize('falha p/ ana@x.exemplo.test cpf 000.123.456-78 tel (00) 91234-5678 sk_live_abcdef123')).toBe('falha p/ [e-mail] cpf [documento] tel [telefone] [credencial]')
    expect(canTransitionRequest('recebida', 'concluida')).toBe(false)
    expect(canTransitionRequest('aprovada', 'concluida')).toBe(true)
  })
})
