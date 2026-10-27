// Comissões/repasses GERENCIAIS. NÃO equivale a split bancário executado pelo gateway.
// Regras versionadas (ruleKey + version); fechamento gera snapshot imutável com memória de cálculo por item.
// Sem dupla contagem: pagamento já incluído em fechamento anterior não entra de novo; estorno posterior → item negativo.
import type { Charge, ID, PaymentMethod, Proposal, Service } from '@/domain/types'
import type { Product } from '@/domain/modules'
import { db } from '@/data/store'
import { audit } from '@/data/repositories'
import { percentOf, type Cents } from '@/lib/money'
import { addDaysCivil, nowISO, type CivilDate } from '@/lib/dates'
import { uid } from '@/lib/util'
import type { CommissionClosing, CommissionItem, CommissionParams, CommissionRule, ServiceKit } from './types'

export const DEFAULT_FEES: CommissionParams = {
  feeByMethod: { pix: 0.99, cartao_credito: 3.49, cartao_debito: 1.69, boleto: 1.99, dinheiro: 0, pix_manual: 0, convenio: 0, link_pagamento: 3.99 },
}

/** Versão vigente de cada ruleKey na data; regra mais específica vence (profissional+serviço > profissional > serviço > geral). */
export function pickRule(rules: CommissionRule[], professionalId: ID, serviceId: ID | undefined, date: CivilDate, productionCents: Cents): CommissionRule | undefined {
  const byKey = new Map<ID, CommissionRule>()
  for (const r of rules) {
    if (r.validFrom > date || (r.validTo && r.validTo < date)) continue
    const cur = byKey.get(r.ruleKey)
    if (!cur || r.version > cur.version) byKey.set(r.ruleKey, r)
  }
  const cands = [...byKey.values()].filter((r) => !r.archived
    && (!r.professionalId || r.professionalId === professionalId)
    && (!r.serviceId || r.serviceId === serviceId)
    && (r.tierMinCents == null || productionCents >= r.tierMinCents)
    && (r.tierMaxCents == null || productionCents <= r.tierMaxCents))
  const score = (r: CommissionRule) => (r.professionalId ? 2 : 0) + (r.serviceId ? 1 : 0) + (r.tierMinCents != null ? 0.5 : 0)
  return cands.sort((a, b) => score(b) - score(a) || b.version - a.version)[0]
}

/** Nova versão: não altera a anterior (imutável); a nova vale a partir de validFrom. A anterior passa a ter validTo implícito. */
export function newRuleVersion(rules: CommissionRule[], ruleKey: ID, patch: Partial<CommissionRule>, by: string, tenantId: ID): CommissionRule {
  const versions = rules.filter((r) => r.ruleKey === ruleKey)
  const last = versions.sort((a, b) => b.version - a.version)[0]
  if (!last) throw new Error('Regra não encontrada.')
  const validFrom = patch.validFrom ?? last.validFrom
  if (validFrom <= last.validFrom) throw new Error('Nova versão precisa começar depois da versão vigente (preserva fechamentos anteriores).')
  return { ...last, ...patch, id: uid('cr_'), tenantId, createdAt: nowISO(), version: last.version + 1, validFrom, createdBy: by }
}

/** Desconto concedido associado à cobrança (para base líquida). */
export function chargeDiscount(c: Charge, services: Service[], proposals: Proposal[]): Cents {
  if (c.origin.kind === 'proposta') {
    const p = proposals.find((x) => x.id === c.origin.refId)
    if (!p) return 0
    const acc = p.items.filter((i) => p.acceptedItemIds.includes(i.id))
    const net = acc.reduce((a, i) => a + i.qty * i.unitCents - i.discountCents, 0)
    const disc = acc.reduce((a, i) => a + i.discountCents, 0)
    return net > 0 ? Math.round((disc * c.amountCents) / net) : 0
  }
  const svc = services.find((s) => s.id === c.serviceId)
  return svc && svc.priceCents > c.amountCents ? svc.priceCents - c.amountCents : 0
}

export function suppliesCost(serviceId: ID | undefined, kits: ServiceKit[], services: Service[], products: Product[]): Cents {
  if (!serviceId) return 0
  const items = kits.find((k) => k.serviceId === serviceId)?.items ?? services.find((s) => s.id === serviceId)?.kit ?? []
  return Math.round(items.reduce((a, it) => a + it.qty * (products.find((p) => p.id === it.productId)?.costCents ?? 0), 0))
}

export interface ClosingInput {
  periodStart: CivilDate
  periodEnd: CivilDate
  charges: Charge[]
  rules: CommissionRule[]
  previous: CommissionClosing[]
  services: Service[]
  proposals: Proposal[]
  kits: ServiceKit[]
  products: Product[]
  params: CommissionParams
}

function calcItem(base: { kind: CommissionItem['kind']; sign: 1 | -1; amount: Cents; c: Charge; date: CivilDate; method: PaymentMethod; paymentId: ID; refundId?: ID }, rule: CommissionRule, ctx: ClosingInput): CommissionItem {
  const { c, amount, sign } = base
  const frac = c.amountCents > 0 ? amount / c.amountCents : 0
  const discount = Math.round(chargeDiscount(c, ctx.services, ctx.proposals) * frac)
  const gross = amount + discount
  const fee = percentOf(amount, ctx.params.feeByMethod[base.method] ?? 0)
  const lab = percentOf(gross, rule.labPercent)
  const supplies = Math.round(suppliesCost(c.serviceId, ctx.kits, ctx.services, ctx.products) * frac)
  let b = gross
  const memo: string[] = [`Bruto ${(gross / 100).toFixed(2)}`]
  if (rule.base === 'liquida') {
    if (rule.deductDiscounts && discount) { b -= discount; memo.push(`− desconto ${(discount / 100).toFixed(2)}`) }
    if (rule.deductFees && fee) { b -= fee; memo.push(`− taxa ${base.method} ${ctx.params.feeByMethod[base.method]}% ${(fee / 100).toFixed(2)}`) }
    if (lab) { b -= lab; memo.push(`− laboratório ${rule.labPercent}% ${(lab / 100).toFixed(2)}`) }
    if (rule.deductSupplies && supplies) { b -= supplies; memo.push(`− insumos ${(supplies / 100).toFixed(2)}`) }
  }
  b = Math.max(0, b)
  const commission = percentOf(b, rule.percent)
  memo.push(`= base ${(b / 100).toFixed(2)} × ${rule.percent}% = ${(commission / 100).toFixed(2)} (regra "${rule.name}" v${rule.version}, base ${rule.base})`)
  if (sign < 0) memo.unshift('ESTORNO de pagamento já comissionado:')
  return {
    id: uid('ci_'), kind: base.kind, paymentId: base.paymentId, refundId: base.refundId, chargeId: c.id, professionalId: c.professionalId!, serviceId: c.serviceId, date: base.date, method: base.method,
    receivedCents: sign * amount, discountCents: sign * discount, grossCents: sign * gross, feeCents: sign * fee, labCents: sign * lab, suppliesCents: sign * supplies, baseCents: sign * b,
    percent: rule.percent, ruleId: rule.id, ruleKey: rule.ruleKey, ruleVersion: rule.version, commissionCents: sign * commission, memo: memo.join(' '),
  }
}

/** Cálculo puro do fechamento. */
export function computeClosing(ctx: ClosingInput) {
  const doneP = new Set(ctx.previous.flatMap((cl) => cl.items.filter((i) => i.kind === 'normal').map((i) => i.paymentId)))
  const doneR = new Set(ctx.previous.flatMap((cl) => cl.items.filter((i) => i.refundId).map((i) => i.refundId!)))
  const items: CommissionItem[] = []
  const skipped: { paymentId: ID; reason: string }[] = []
  const inP = (d: string) => d >= ctx.periodStart && d <= ctx.periodEnd
  // Produção do período por profissional (para faixas).
  const production = new Map<ID, Cents>()
  for (const c of ctx.charges) for (const p of c.payments) {
    if (p.status === 'pendente_aprovacao' || !c.professionalId || !inP(p.at.slice(0, 10))) continue
    production.set(c.professionalId, (production.get(c.professionalId) ?? 0) + p.amountCents)
  }
  const included = new Map<ID, CommissionRule>()
  for (const c of ctx.charges) {
    for (const p of c.payments) {
      const date = p.at.slice(0, 10)
      if (!inP(date) || p.status === 'pendente_aprovacao') continue
      if (!c.professionalId) { skipped.push({ paymentId: p.id, reason: 'Cobrança sem profissional vinculado' }); continue }
      if (doneP.has(p.id)) { skipped.push({ paymentId: p.id, reason: 'Já incluído em fechamento anterior' }); continue }
      const rule = pickRule(ctx.rules, c.professionalId, c.serviceId, date, production.get(c.professionalId) ?? 0)
      if (!rule) { skipped.push({ paymentId: p.id, reason: 'Nenhuma regra vigente' }); continue }
      included.set(p.id, rule)
      items.push(calcItem({ kind: 'normal', sign: 1, amount: p.amountCents, c, date, method: p.method, paymentId: p.id }, rule, ctx))
    }
  }
  // Estornos: de pagamentos já comissionados (antes ou agora), ainda não lançados, até o fim do período.
  for (const c of ctx.charges) for (const r of c.refunds) {
    if (doneR.has(r.id) || r.at.slice(0, 10) > ctx.periodEnd) continue
    const pay = c.payments.find((p) => p.id === r.paymentId)
    if (!pay || !c.professionalId) continue
    const prevItem = ctx.previous.flatMap((cl) => cl.items).find((i) => i.paymentId === pay.id && i.kind === 'normal')
    const rule = included.get(pay.id) ?? (prevItem ? ctx.rules.find((x) => x.id === prevItem.ruleId) : undefined)
    if (!rule) continue // pagamento nunca comissionado: nada a reverter
    items.push(calcItem({ kind: 'estorno', sign: -1, amount: r.amountCents, c, date: r.at.slice(0, 10), method: pay.method, paymentId: pay.id, refundId: r.id }, rule, ctx))
  }
  return { items, skipped }
}

export function totalsByProfessional(cl: Pick<CommissionClosing, 'items' | 'adjustments'>) {
  const m = new Map<ID, { base: Cents; commission: Cents; adjustments: Cents; count: number }>()
  for (const i of cl.items) {
    const t = m.get(i.professionalId) ?? { base: 0, commission: 0, adjustments: 0, count: 0 }
    t.base += i.baseCents; t.commission += i.commissionCents; t.count++
    m.set(i.professionalId, t)
  }
  for (const a of cl.adjustments) {
    const t = m.get(a.professionalId) ?? { base: 0, commission: 0, adjustments: 0, count: 0 }
    t.adjustments += a.amountCents
    m.set(a.professionalId, t)
  }
  return m
}

export function runClosing(tenantId: ID, periodStart: CivilDate, periodEnd: CivilDate, params: CommissionParams, by: string): CommissionClosing {
  const previous = db.list(tenantId, 'commissionClosings')
  const next = nextPeriodStart(previous)
  if (next && periodStart < next) throw new Error(`Período já fechado até ${addDaysCivil(next, -1).split('-').reverse().join('/')}. Pagamentos fechados não são recontados; inicie em ${next.split('-').reverse().join('/')} ou depois.`)
  if (periodStart > periodEnd) throw new Error('Período inválido: início depois do fim.')
  const r = computeClosing({
    periodStart, periodEnd, charges: db.list(tenantId, 'charges'), rules: db.list(tenantId, 'commissionRules'), previous,
    services: db.list(tenantId, 'services'), proposals: db.list(tenantId, 'proposals'), kits: db.list(tenantId, 'serviceKits'), products: db.list(tenantId, 'products'), params,
  })
  const cl: CommissionClosing = { id: uid('fc_'), tenantId, createdAt: nowISO(), number: `FEC-${String(previous.length + 1).padStart(4, '0')}`, periodStart, periodEnd, executedBy: by, params: structuredClone(params), items: r.items, skipped: r.skipped, adjustments: [] }
  db.insert(tenantId, 'commissionClosings', cl)
  audit(tenantId, { actorId: by, actorName: by, action: 'comissao.fechamento', resource: 'commissionClosings', resourceId: cl.id, detail: `${periodStart}..${periodEnd}: ${r.items.length} item(ns)` })
  return cl
}

/** Ajuste autorizado (único acréscimo permitido ao snapshot; itens calculados não mudam). */
export function addAdjustment(tenantId: ID, closingId: ID, a: { professionalId: ID; amountCents: Cents; reason: string; approvedBy: string }) {
  if (!a.reason.trim()) throw new Error('Informe o motivo do ajuste.')
  if (!Number.isInteger(a.amountCents) || a.amountCents === 0) throw new Error('Valor do ajuste inválido.')
  return db.update(tenantId, 'commissionClosings', closingId, (cl) => ({ ...cl, adjustments: [...cl.adjustments, { id: uid('aj_'), at: nowISO(), ...a }] })) as CommissionClosing
}

export function nextPeriodStart(closings: CommissionClosing[]): CivilDate | null {
  const last = [...closings].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0]
  return last ? addDaysCivil(last.periodEnd, 1) : null
}
