// Testes de regras do módulo comercial (vitest, ambiente node; store em memória com seeds demo).
import { describe, it, expect, beforeAll } from 'vitest'
import '@/modules/register'
import { db } from '@/data/store'
import { billingRepo, chargeBalance } from '@/data/repositories'
import { acceptProposal } from '@/domain/proposals'
import { allocate, splitInstallments } from '@/lib/money'
import { changeAppointmentStatus } from '@/domain/appointments'
import type { Charge, Service, Proposal } from '@/domain/types'
import type { Lot, Product } from '@/domain/modules'
import { toBase, planFefo, issueStock, receiveStock, consumeForAppointment, countLot, transferStock } from './inventory'
import { computeClosing, pickRule, DEFAULT_FEES, newRuleVersion } from './commissions'
import { simulatePrice, DEFAULT_PRICING } from './pricing'
import { computeLateCharges, createAgreement, cashFlow } from './finance'
import { canSendRelationship, validateInterest, moveLead } from './crm'
import { chargeForAppointment } from './effects'
import type { CommissionRule, CommissionClosing } from './types'

const T = 'org_sorriso'
const today = new Date().toISOString().slice(0, 10)

beforeAll(() => { db.list(T, 'charges'); db.list(T, 'lots') })

describe('parcelamento e rateio', () => {
  it('splitInstallments soma o total e joga a sobra na 1ª parcela', () => {
    const p = splitInstallments(100001, 3)
    expect(p.reduce((a, b) => a + b, 0)).toBe(100001)
    expect(p).toEqual([33335, 33333, 33333])
  })
  it('allocate (largest remainder) mantém a soma', () => {
    const a = allocate(1000, [1, 1, 1])
    expect(a.reduce((x, y) => x + y, 0)).toBe(1000)
    expect(Math.max(...a) - Math.min(...a)).toBeLessThanOrEqual(1)
  })
})

describe('aceite parcial sem duplicidade', () => {
  it('acceptProposal 2x com a mesma seleção não duplica cobranças; novo item gera só a diferença', () => {
    const p = db.get(T, 'proposals', `${T}_prop1`)!
    const mandatory = p.items.filter((i) => !i.optional && !i.optionGroup).map((i) => i.id)
    const first = acceptProposal(T, p.id, [mandatory[0]], 2, 'teste')
    expect(first.charges.length).toBe(2)
    expect(first.proposal.status).toBe('aceita_parcial')
    const again = acceptProposal(T, p.id, [mandatory[0]], 2, 'teste')
    expect(again.charges.length).toBe(0)
    const plus = acceptProposal(T, p.id, [mandatory[0], mandatory[1]], 1, 'teste')
    expect(plus.charges.length).toBe(1)
    const all = db.list(T, 'charges').filter((c) => c.origin.refId === p.id)
    expect(all.length).toBe(3)
    const item0 = p.items.find((i) => i.id === mandatory[0])!
    const item1 = p.items.find((i) => i.id === mandatory[1])!
    expect(all.reduce((a, c) => a + c.amountCents, 0)).toBe(item0.qty * item0.unitCents - item0.discountCents + item1.qty * item1.unitCents - item1.discountCents)
  })
})

function mkCharge(id: string, amount: number, extra: Partial<Charge> = {}): Charge {
  const c: Charge = { id, tenantId: T, createdAt: new Date().toISOString(), unitId: `${T}_u1`, patientId: `${T}_pat2`, origin: { kind: 'manual' }, description: 'Teste', competenceDate: today, dueDate: today, amountCents: amount, adjustmentsCents: 0, installment: { n: 1, of: 1, groupId: id }, status: 'aberta', payments: [], refunds: [], category: 'Atendimentos', ...extra }
  db.insert(T, 'charges', c)
  return c
}

describe('estorno parcial/total e status', () => {
  it('parcial mantém "parcial"; total vira "estornada"; nada é apagado', () => {
    mkCharge('t_est', 10000)
    let c = billingRepo.registerPayment(T, 't_est', { amountCents: 10000, method: 'pix', provider: 'manual', receivedBy: 'x' })
    expect(c.status).toBe('paga')
    const pay = c.payments[0]
    c = billingRepo.refund(T, 't_est', pay.id, 3000, 'Desistência parcial', 'reembolso')
    expect(c.status).toBe('parcial')
    expect(chargeBalance(c)).toBe(3000)
    c = billingRepo.refund(T, 't_est', pay.id, 7000, 'Cancelamento', 'estorno')
    expect(c.status).toBe('estornada')
    expect(c.payments.length).toBe(1)
    expect(c.refunds.length).toBe(2)
    expect(() => billingRepo.refund(T, 't_est', pay.id, 1, 'x', 'estorno')).toThrow()
  })
  it('acordo cancela saldo antigo com vínculo e cria parcelas origin acordo', () => {
    mkCharge('t_ac', 30000, { dueDate: '2020-01-01', status: 'vencida' })
    billingRepo.registerPayment(T, 't_ac', { amountCents: 10000, method: 'dinheiro', provider: 'manual', receivedBy: 'x' })
    const ag = createAgreement(T, { chargeIds: ['t_ac'], installments: 3, firstDue: today, reason: 'Renegociação', by: 'teste' })
    expect(ag.totalCents).toBe(20000)
    expect(db.get(T, 'charges', 't_ac')!.status).toBe('cancelada')
    expect(db.get(T, 'charges', 't_ac')!.payments.length).toBe(1)
    const news = ag.newChargeIds.map((id) => db.get(T, 'charges', id)!)
    expect(news.every((c) => c.origin.kind === 'acordo' && c.origin.refId === ag.id)).toBe(true)
    expect(news.reduce((a, c) => a + c.amountCents, 0)).toBe(20000)
  })
  it('juros/multa: multa uma vez, juros só pelos dias novos', () => {
    const pol = { allowedMethods: [], receivingAccountLabel: '', lateFeePercent: 2, monthlyInterestPercent: 1, earlyDiscountPercent: 0, maxInstallments: 6, allowNegativeStock: false }
    const c = { amountCents: 30000, adjustmentsCents: 0, dueDate: '2026-01-01', payments: [], refunds: [], status: 'vencida' as const }
    const r1 = computeLateCharges(c, pol, '2026-01-31', [])
    expect(r1.lines.length).toBe(2)
    expect(r1.totalCents).toBe(600 + 300) // 2% + 1% a.m. × 30 dias
    const r2 = computeLateCharges(c, pol, '2026-01-31', [{ interestDaysCharged: r1.interestDaysCharged, feeApplied: r1.feeApplied }])
    expect(r2.totalCents).toBe(0)
  })
  it('fluxo: recebido no mês do pagamento, disponibilidade no availableOn', () => {
    const c = { competenceDate: '2026-01-10', amountCents: 1000, status: 'paga', payments: [{ at: '2026-01-20T12:00:00Z', amountCents: 1000, status: 'confirmado', availableOn: '2026-02-19' }], refunds: [] } as unknown as Charge
    const f = cashFlow([c], ['2026-01', '2026-02'])
    expect(f[0]).toMatchObject({ competence: 1000, received: 1000, available: 0 })
    expect(f[1]).toMatchObject({ available: 1000 })
  })
})

describe('comissões', () => {
  const rule = (o: Partial<CommissionRule>): CommissionRule => ({ id: 'r', tenantId: T, createdAt: '', ruleKey: 'k', version: 1, name: 'R', validFrom: '2026-01-01', percent: 10, base: 'bruta', deductFees: false, labPercent: 0, deductSupplies: false, deductDiscounts: false, createdBy: 'x', ...o })
  const ch = (o: Partial<Charge>): Charge => ({ id: 'c1', tenantId: T, createdAt: '', unitId: 'u', patientId: 'p', origin: { kind: 'manual' }, description: '', competenceDate: '2026-02-01', dueDate: '2026-02-01', amountCents: 10000, adjustmentsCents: 0, installment: { n: 1, of: 1, groupId: 'g' }, status: 'paga', payments: [{ id: 'pay1', at: '2026-02-05T12:00:00Z', amountCents: 10000, method: 'cartao_credito', provider: 'manual', status: 'confirmado', simulated: true, receivedBy: 'x' }], refunds: [], professionalId: 'pro', serviceId: 'svc', category: '', ...o })
  const svc = { id: 'svc', priceCents: 12000, kit: [{ productId: 'prd', qty: 2 }] } as unknown as Service
  const prd = { id: 'prd', costCents: 500 } as unknown as Product
  const base = { periodStart: '2026-02-01', periodEnd: '2026-02-28', previous: [] as CommissionClosing[], services: [svc], proposals: [] as Proposal[], kits: [], products: [prd], params: DEFAULT_FEES }

  it('base líquida desconta desconto, taxa, laboratório e insumos', () => {
    const r = rule({ base: 'liquida', deductFees: true, deductDiscounts: true, deductSupplies: true, labPercent: 10, percent: 50 })
    const { items } = computeClosing({ ...base, charges: [ch({})], rules: [r] })
    const it0 = items[0]
    expect(it0.grossCents).toBe(12000) // recebido 10000 + desconto 2000
    expect(it0.feeCents).toBe(349) // 3,49% de 10000
    expect(it0.labCents).toBe(1200)
    expect(it0.suppliesCents).toBe(1000)
    expect(it0.baseCents).toBe(12000 - 2000 - 349 - 1200 - 1000)
    expect(it0.commissionCents).toBe(Math.round((7451 * 50) / 100))
  })
  it('usa a versão vigente na data do pagamento', () => {
    const v1 = rule({ id: 'v1', percent: 10 })
    const v2 = rule({ id: 'v2', version: 2, percent: 20, validFrom: '2026-02-10' })
    expect(pickRule([v1, v2], 'pro', 'svc', '2026-02-05', 0)!.id).toBe('v1')
    expect(pickRule([v1, v2], 'pro', 'svc', '2026-02-15', 0)!.id).toBe('v2')
    expect(() => newRuleVersion([v1], 'k', { validFrom: '2025-12-01' }, 'x', T)).toThrow()
  })
  it('sem dupla contagem; estorno posterior vira ajuste negativo no próximo fechamento', () => {
    const r = rule({ percent: 10 })
    const c = ch({})
    const first = computeClosing({ ...base, charges: [c], rules: [r] })
    expect(first.items.length).toBe(1)
    const closed = { items: first.items, adjustments: [] } as unknown as CommissionClosing
    const refunded = ch({ refunds: [{ id: 'rf1', at: '2026-03-03T12:00:00Z', amountCents: 4000, reason: 'x', paymentId: 'pay1', kind: 'estorno' }] })
    const second = computeClosing({ ...base, periodStart: '2026-03-01', periodEnd: '2026-03-31', previous: [closed], charges: [refunded], rules: [r] })
    expect(second.items.length).toBe(1)
    expect(second.items[0].kind).toBe('estorno')
    expect(second.items[0].commissionCents).toBe(-Math.round((4000 + Math.round(2000 * 0.4)) * 0.1))
    // Reexecutar o mesmo período (com o pagamento já fechado) não reconta
    const again = computeClosing({ ...base, previous: [closed], charges: [c], rules: [r] })
    expect(again.items.length).toBe(0)
    expect(again.skipped[0].reason).toMatch(/anterior/)
  })
})

describe('estoque', () => {
  const p: Pick<Product, 'baseUnit' | 'conversions' | 'decimals'> = { baseUnit: 'ml', conversions: [{ unit: 'frasco', factor: 10 }, { unit: 'caixa', factor: 50 }], decimals: 1 }
  it('conversão explícita e precisão decimal', () => {
    expect(toBase(p, 2, 'frasco')).toBe(20)
    expect(toBase(p, 0.25, 'ml')).toBe(0.3)
    expect(() => toBase(p, 1, 'galão')).toThrow(/Conversão/)
  })
  it('FEFO ignora vencidos e pega o lote de validade mais próxima', () => {
    const lots = [
      { id: 'a', productId: 'x', unitId: 'u', expiresOn: '2099-12-01', qty: 10, reserved: 0, createdAt: '1' },
      { id: 'b', productId: 'x', unitId: 'u', expiresOn: '2099-01-01', qty: 3, reserved: 1, createdAt: '2' },
      { id: 'c', productId: 'x', unitId: 'u', expiresOn: '2000-01-01', qty: 50, reserved: 0, createdAt: '3' },
    ] as Lot[]
    const plan = planFefo(lots, 'x', 'u', 5, 0, '2026-01-01')
    expect(plan.parts).toEqual([{ lotId: 'b', qty: 2 }, { lotId: 'a', qty: 3 }])
    expect(planFefo(lots, 'x', 'u', 20, 0, '2026-01-01').shortfall).toBe(8)
  })
  it('negativo bloqueado pela política', () => {
    const prod = db.list(T, 'products')[0]
    expect(() => issueStock(T, { productId: prod.id, unitId: `${T}_u1`, qty: 999999, kind: 'saida', by: 'teste' })).toThrow(/negativo bloqueado/)
  })
  it('entrada com conversão de unidade de compra e transferência entre unidades', () => {
    const prod = db.list(T, 'products').find((x) => x.conversions.length)!
    const { lot } = receiveStock(T, { productId: prod.id, unitId: `${T}_u1`, qty: 2, unit: prod.conversions[0].unit, lotCode: 'TESTE-1', expiresOn: '2099-01-01', by: 'teste' })
    expect(lot.qty).toBe(2 * prod.conversions[0].factor)
    transferStock(T, { productId: prod.id, fromUnitId: `${T}_u1`, toUnitId: `${T}_u2`, qty: 1, by: 'teste' })
    expect(db.list(T, 'stockMovements').some((m) => m.kind === 'transferencia_entrada' && m.unitId === `${T}_u2`)).toBe(true)
    const c = countLot(T, { lotId: lot.id, counted: lot.qty + 5, reason: 'Inventário', by: 'teste', kind: 'inventario' })
    expect(c.diff).toBe(5)
  })
  it('consumo da ficha técnica acontece UMA única vez (evento + chamada repetida)', () => {
    const ap = db.list(T, 'appointments').find((a) => a.status === 'em_atendimento' || a.status === 'chegou' || a.status === 'confirmada')!
    const kit = [{ productId: db.list(T, 'products')[3].id, qty: 1 }]
    db.update(T, 'serviceKits', db.list(T, 'serviceKits')[0].id, { serviceId: ap.serviceId, items: kit })
    db.set(T, 'serviceKits', db.list(T, 'serviceKits').filter((k, i) => i === 0 || k.serviceId !== ap.serviceId))
    db.update(T, 'appointments', ap.id, { status: 'em_atendimento', stockConsumedAt: undefined })
    changeAppointmentStatus(T, ap.id, 'concluida', 'teste')
    const count = () => db.list(T, 'stockMovements').filter((m) => m.appointmentId === ap.id && m.qty < 0).length
    const n1 = count()
    expect(n1).toBeGreaterThan(0)
    expect(consumeForAppointment(T, ap.id, 'teste').consumed).toBe(false)
    expect(count()).toBe(n1)
    // cobrança da consulta criada no máximo uma vez
    chargeForAppointment(T, ap.id, 'teste')
    expect(db.list(T, 'charges').filter((c) => c.origin.refId === ap.id).length).toBeLessThanOrEqual(1)
  })
})

describe('simulador de precificação', () => {
  it('markup sobre custo × margem sobre preço', () => {
    const r = simulatePrice({ ...DEFAULT_PRICING, fixedMonthlyCents: 1000000, rooms: 1, hoursPerDay: 10, daysPerMonth: 20, occupancyPercent: 50, durationMin: 60, suppliesCents: 0, taxPercent: 10, paymentFeePercent: 0, commissionPercent: 0, markupPercent: 100, targetMarginPercent: 20 })
    expect(r.capacityHours).toBe(100)
    expect(r.costPerHour).toBe(10000)
    expect(r.directCost).toBe(10000)
    expect(r.markup.price).toBe(20000)
    expect(r.margin.price).toBe(14286) // 10000 / (1 − 0,10 − 0,20)
    expect(Math.round(r.margin.marginPercent)).toBe(20)
  })
  it('percentuais ≥ 100% → erro explicativo', () => {
    expect(simulatePrice({ ...DEFAULT_PRICING, taxPercent: 50, commissionPercent: 40, targetMarginPercent: 20 }).errors.length).toBe(1)
  })
})

describe('CRM', () => {
  it('bloqueia diagnóstico no interesse e exige motivo de perda', () => {
    expect(validateInterest('Tratamento de depressão')).toMatch(/Não registre/)
    expect(validateInterest('Clareamento')).toBeNull()
    const l = db.list(T, 'leads').find((x) => x.stage === 'novo')!
    expect(() => moveLead(T, l.id, 'perdido', 'teste')).toThrow(/obrigatório/)
    expect(moveLead(T, l.id, 'perdido', 'teste', 'Sem retorno').stage).toBe('perdido')
  })
  it('opt-out e limite de frequência', () => {
    expect(canSendRelationship([], 'p', 'nps', true).ok).toBe(false)
    const m = [{ patientId: 'p', kind: 'nps', sentAt: new Date().toISOString() }] as never
    expect(canSendRelationship(m, 'p', 'nps', false).ok).toBe(false)
    expect(canSendRelationship(m, 'p', 'indicacao', false).ok).toBe(true)
  })
})
