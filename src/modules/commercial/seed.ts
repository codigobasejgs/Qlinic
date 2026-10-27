// Seeds determinísticos do módulo comercial, relativos a demoBaseDate(). Só tenants demo recebem (política global).
import type { Lead, LeadStage, Lot, Product, StockMovement, CashSession } from '@/domain/modules'
import type { Segment } from '@/domain/types'
import { registerSeed } from '@/data/store'
import { getOrganization } from '@/data/platformSeed'
import { addDaysCivil, demoBaseDate, zonedParts, zonedToInstant } from '@/lib/dates'
import { hashString, rng } from '@/lib/util'
import type { CommissionRule, CostCenter, Equipment, FinanceCategory, Payable, PricingScenario, PurchaseOrder, RelationshipMessage, ServiceKit, Supplier } from './types'
import { DEFAULT_PRICING } from './pricing'
import './types'

const seg = (t: string): Segment => getOrganization(t)?.segment ?? 'medicina'
const tz = (t: string) => getOrganization(t)?.timezone ?? 'America/Sao_Paulo'
const today = (t: string) => zonedParts(demoBaseDate(), tz(t)).date
const at = (t: string, dayOffset: number, minutes = 9 * 60) => zonedToInstant(addDaysCivil(today(t), dayOffset), minutes, tz(t))
const created = (t: string) => at(t, -120)

type P = { key: string; name: string; category: string; baseUnit: string; conversions: { unit: string; factor: number }[]; minQty: number; decimals: number; costCents: number; supplier: number }
const COMMON: P[] = [
  { key: 'luva', name: 'Luva de procedimento (M)', category: 'Descartáveis', baseUnit: 'un', conversions: [{ unit: 'caixa', factor: 100 }], minQty: 200, decimals: 0, costCents: 45, supplier: 1 },
  { key: 'mascara', name: 'Máscara descartável', category: 'Descartáveis', baseUnit: 'un', conversions: [{ unit: 'caixa', factor: 50 }], minQty: 100, decimals: 0, costCents: 30, supplier: 1 },
  { key: 'gaze', name: 'Gaze estéril', category: 'Descartáveis', baseUnit: 'un', conversions: [{ unit: 'pacote', factor: 10 }], minQty: 50, decimals: 0, costCents: 25, supplier: 1 },
  { key: 'alcool', name: 'Álcool 70%', category: 'Antissepsia', baseUnit: 'ml', conversions: [{ unit: 'frasco', factor: 1000 }], minQty: 2000, decimals: 0, costCents: 2, supplier: 2 },
]
const BY_SEG: Partial<Record<Segment, P[]>> = {
  odontologia: [
    { key: 'anest', name: 'Anestésico local (tubete)', category: 'Anestésicos', baseUnit: 'tubete', conversions: [{ unit: 'caixa', factor: 50 }], minQty: 60, decimals: 0, costCents: 280, supplier: 0 },
    { key: 'resina', name: 'Resina composta A2', category: 'Restauradores', baseUnit: 'g', conversions: [{ unit: 'seringa', factor: 4 }], minQty: 20, decimals: 1, costCents: 2100, supplier: 0 },
    { key: 'pasta', name: 'Pasta profilática', category: 'Prevenção', baseUnit: 'g', conversions: [{ unit: 'pote', factor: 90 }], minQty: 100, decimals: 1, costCents: 30, supplier: 0 },
    { key: 'clareador', name: 'Gel clareador 35%', category: 'Estética dental', baseUnit: 'ml', conversions: [{ unit: 'kit', factor: 12 }], minQty: 24, decimals: 1, costCents: 950, supplier: 0 },
  ],
  veterinaria: [
    { key: 'vacina', name: 'Vacina polivalente (dose)', category: 'Imunobiológicos', baseUnit: 'dose', conversions: [{ unit: 'caixa', factor: 10 }], minQty: 20, decimals: 0, costCents: 3800, supplier: 0 },
    { key: 'seringa', name: 'Seringa 3 mL', category: 'Descartáveis', baseUnit: 'un', conversions: [{ unit: 'caixa', factor: 100 }], minQty: 100, decimals: 0, costCents: 35, supplier: 1 },
    { key: 'shampoo', name: 'Shampoo neutro pet', category: 'Estética animal', baseUnit: 'ml', conversions: [{ unit: 'galão', factor: 5000 }], minQty: 3000, decimals: 0, costCents: 1, supplier: 2 },
    { key: 'fio', name: 'Fio de sutura 3-0', category: 'Cirúrgicos', baseUnit: 'un', conversions: [{ unit: 'caixa', factor: 24 }], minQty: 24, decimals: 0, costCents: 1150, supplier: 0 },
  ],
  estetica: [
    { key: 'toxina', name: 'Toxina botulínica (unidades)', category: 'Injetáveis', baseUnit: 'U', conversions: [{ unit: 'frasco', factor: 100 }], minQty: 200, decimals: 0, costCents: 900, supplier: 0 },
    { key: 'acido', name: 'Ácido hialurônico', category: 'Injetáveis', baseUnit: 'ml', conversions: [{ unit: 'seringa', factor: 1 }], minQty: 4, decimals: 1, costCents: 52000, supplier: 0 },
    { key: 'seringa', name: 'Seringa de insulina', category: 'Descartáveis', baseUnit: 'un', conversions: [{ unit: 'caixa', factor: 100 }], minQty: 100, decimals: 0, costCents: 40, supplier: 1 },
    { key: 'gelrf', name: 'Gel condutor', category: 'Corporal', baseUnit: 'ml', conversions: [{ unit: 'frasco', factor: 1000 }], minQty: 1500, decimals: 0, costCents: 3, supplier: 2 },
  ],
}
const productsFor = (t: string) => [...(BY_SEG[seg(t)] ?? []), ...COMMON]
const pid = (t: string, key: string) => `${t}_prd_${key}`

/** Fichas técnicas por serviço (serviços do catálogo por índice). */
const KITS: Partial<Record<Segment, Record<number, [string, number][]>>> = {
  odontologia: { 1: [['luva', 2], ['mascara', 1], ['pasta', 5]], 2: [['luva', 2], ['mascara', 1], ['anest', 1], ['resina', 0.8], ['gaze', 2]], 3: [['luva', 4], ['anest', 2], ['gaze', 4]], 4: [['luva', 2], ['anest', 2], ['gaze', 6]], 8: [['luva', 2], ['clareador', 3]] },
  veterinaria: { 0: [['luva', 2]], 1: [['luva', 2], ['vacina', 1], ['seringa', 1], ['alcool', 5]], 2: [['luva', 6], ['fio', 2], ['gaze', 10], ['seringa', 3]], 4: [['shampoo', 60]], 5: [['shampoo', 80]] },
  estetica: { 1: [['luva', 2], ['toxina', 20], ['seringa', 2], ['alcool', 10]], 2: [['luva', 2], ['acido', 1], ['seringa', 1]], 3: [['luva', 2], ['gaze', 6]], 5: [['gelrf', 50]] },
}

const SUPPLIERS = ['Dental Exemplo Distribuidora', 'Descartáveis Fictícios Ltda.', 'Química Demo Insumos', 'Locadora de Equipamentos Demo']

registerSeed('suppliers', (c) => SUPPLIERS.map((name, i): Supplier => ({
  id: `${c.tenantId}_sup${i + 1}`, tenantId: c.tenantId, createdAt: created(c.tenantId), name: i === 0 && seg(c.tenantId) === 'veterinaria' ? 'VetSupri Exemplo' : name,
  document: `00.000.00${i}/0001-0${i}`, email: `contato${i + 1}@fornecedor.exemplo.test`, phone: `(00) 3200-000${i}`, category: i === 3 ? 'Serviços' : 'Insumos', active: true,
})))

registerSeed('financeCategories', (c) => ([['Atendimentos', 'receita'], ['Tratamentos', 'receita'], ['Insumos', 'despesa'], ['Aluguel', 'despesa'], ['Energia e água', 'despesa'], ['Laboratório', 'despesa'], ['Manutenção', 'despesa'], ['Marketing institucional', 'despesa']] as const)
  .map(([name, kind], i): FinanceCategory => ({ id: `${c.tenantId}_cat${i + 1}`, tenantId: c.tenantId, createdAt: created(c.tenantId), name, kind, active: true })))

registerSeed('costCenters', (c) => [...c.get('units').map((u, i): CostCenter => ({ id: `${c.tenantId}_cc${i + 1}`, tenantId: c.tenantId, createdAt: created(c.tenantId), name: u.name, unitId: u.id, active: true })),
  { id: `${c.tenantId}_cc_adm`, tenantId: c.tenantId, createdAt: created(c.tenantId), name: 'Administrativo', active: true }])

registerSeed('products', (c) => productsFor(c.tenantId).map((p): Product => ({
  id: pid(c.tenantId, p.key), tenantId: c.tenantId, createdAt: created(c.tenantId), name: p.name, sku: `SKU-${p.key.toUpperCase()}`, category: p.category, baseUnit: p.baseUnit,
  conversions: p.conversions, minQty: p.minQty, decimals: p.decimals, supplierId: `${c.tenantId}_sup${p.supplier + 1}`, allowNegative: false, costCents: p.costCents, active: true,
})))

registerSeed('lots', (c) => {
  const t = c.tenantId
  const r = rng(hashString(t + 'lots'))
  const lots: Lot[] = []
  const ps = productsFor(t)
  c.get('units').forEach((u, ui) => ps.forEach((p, pi) => {
    // Produto 0 (específico do segmento) fica ABAIXO do mínimo na unidade 1.
    const low = pi === 0 && ui === 0
    const base = low ? Math.round(p.minQty * 0.4) : p.minQty * (2 + r.int(0, 3))
    const n = ui === 0 && pi < 2 ? 2 : 1
    for (let k = 0; k < n; k++) {
      const exp = ui === 0 && pi === 1 && k === 0 ? addDaysCivil(today(t), 10) : addDaysCivil(today(t), 90 + r.int(0, 300) + k * 60)
      lots.push({ id: `${u.id}_${p.key}_l${k + 1}`, tenantId: t, createdAt: at(t, -60 + k * 10), productId: pid(t, p.key), unitId: u.id, code: `L${(hashString(u.id + p.key + k) % 90000) + 10000}`, expiresOn: exp, qty: k === 0 && n === 2 ? Math.round(base / 3) : base, reserved: 0 })
    }
  }))
  // Lote VENCIDO (não usado em baixa; deve ser descartado como perda).
  const p2 = ps[2]
  lots.push({ id: `${t}_u1_${p2.key}_venc`, tenantId: t, createdAt: at(t, -200), productId: pid(t, p2.key), unitId: `${t}_u1`, code: 'L-VENCIDO', expiresOn: addDaysCivil(today(t), -5), qty: Math.max(1, Math.round(p2.minQty / 4)), reserved: 0 })
  return lots
})

registerSeed('stockMovements', (c) => c.get('lots').map((l): StockMovement => ({
  id: `${l.id}_mv0`, tenantId: c.tenantId, createdAt: l.createdAt, productId: l.productId, lotId: l.id, unitId: l.unitId, kind: 'entrada', qty: l.qty, reason: 'Saldo inicial (implantação)', by: 'Estoque — Denise (demo)',
})))

registerSeed('serviceKits', (c) => {
  const kits = KITS[seg(c.tenantId)] ?? {}
  return Object.entries(kits).filter(([i]) => c.get('services')[Number(i)]).map(([i, items]): ServiceKit => ({
    id: `${c.tenantId}_kit${i}`, tenantId: c.tenantId, createdAt: created(c.tenantId), serviceId: `${c.tenantId}_svc${Number(i) + 1}`, items: items.map(([k, qty]) => ({ productId: pid(c.tenantId, k), qty })), updatedBy: 'Proprietária (demo)',
  }))
})

registerSeed('cashSessions', (c) => {
  const t = c.tenantId
  const op = c.get('staff').find((u) => u.id === `${t}_usr_recepcao`)
  if (!op) return []
  const s: CashSession[] = [{ id: `${t}_cx_hoje`, tenantId: t, createdAt: at(t, 0, 7 * 60 + 50), unitId: `${t}_u1`, operatorId: op.id, operatorName: op.name, openedAt: at(t, 0, 7 * 60 + 50), openingCents: 20000, status: 'aberto',
    movements: [{ id: `${t}_cx_hoje_m1`, at: at(t, 0, 8 * 60 + 30), kind: 'suprimento', amountCents: 5000, note: 'Troco adicional (moedas)' }] }]
  s.push({ id: `${t}_cx_ontem`, tenantId: t, createdAt: at(t, -1, 7 * 60 + 50), unitId: `${t}_u1`, operatorId: op.id, operatorName: op.name, openedAt: at(t, -1, 7 * 60 + 50), openingCents: 20000, status: 'fechado', closedAt: at(t, -1, 19 * 60), countedCents: 31500,
    movements: [{ id: `${t}_cx_ontem_m1`, at: at(t, -1, 11 * 60), kind: 'recebimento', amountCents: 15000, method: 'dinheiro', note: 'Recebimento balcão' }, { id: `${t}_cx_ontem_m2`, at: at(t, -1, 17 * 60), kind: 'sangria', amountCents: 3000, note: 'Depósito no cofre' }] })
  return s
})

const LEAD_NAMES = ['Aline Ferraz', 'Bruno Teixeira', 'Clara Monteiro', 'Diego Arantes', 'Elisa Rocha', 'Fábio Nogueira', 'Gabriela Pires', 'Heitor Campos', 'Isadora Lins', 'João Vitor Prado', 'Karina Duarte']
const INTEREST: Record<Segment, string[]> = {
  odontologia: ['Clareamento', 'Avaliação para implante', 'Aparelho ortodôntico', 'Limpeza semestral', 'Lentes de contato dental'],
  medicina: ['Check-up anual', 'Consulta clínica', 'Consulta de rotina pediátrica', 'Exames de rotina'],
  veterinaria: ['Plano de vacinação', 'Castração', 'Banho e tosa mensal', 'Consulta de rotina'],
  estetica: ['Limpeza de pele', 'Pacote de drenagem', 'Harmonização (avaliação)', 'Peeling'],
  psicologia: ['Primeira sessão', 'Horário noturno', 'Atendimento on-line'],
  fisioterapia: ['Pilates', 'Avaliação postural', 'Pacote de sessões'],
  nutricao: ['Primeira consulta', 'Acompanhamento mensal', 'Plano esportivo'],
}
const STAGE_SEQ: LeadStage[] = ['novo', 'novo', 'qualificacao', 'agendamento', 'avaliacao', 'proposta', 'negociacao', 'convertido', 'perdido', 'qualificacao', 'novo']

registerSeed('leads', (c) => {
  const t = c.tenantId
  const r = rng(hashString(t + 'leads'))
  const s = seg(t)
  const n = 8 + (hashString(t) % 4)
  const owners = c.get('staff').filter((u) => u.memberships.some((m) => ['reception', 'clinic_owner'].includes(m.role)))
  const pats = c.get('patients').filter((p) => !p.duplicateOf)
  return LEAD_NAMES.slice(0, n).map((name, i): Lead => {
    const stage = STAGE_SEQ[i]
    const source = r.pick(['site', 'indicacao', 'instagram', 'whatsapp', 'google', 'evento'] as const)
    const conv = stage === 'convertido'
    return {
      id: `${t}_lead${i + 1}`, tenantId: t, createdAt: at(t, -20 + i), name, phone: `(00) 98000-${String(3000 + i)}`, email: `lead${i + 1}@exemplo.test`, source, stage, ownerId: owners[i % Math.max(1, owners.length)]?.id,
      interest: r.pick(INTEREST[s]), patientId: conv ? pats[3]?.id : undefined, proposalId: stage === 'proposta' ? `${t}_prop1` : undefined,
      lostReason: stage === 'perdido' ? 'Optou por outra clínica (preço)' : undefined,
      tasks: stage === 'perdido' || conv ? [] : [{ id: `${t}_lead${i + 1}_t1`, title: i % 2 ? 'Retornar ligação' : 'Enviar horários disponíveis', dueOn: addDaysCivil(today(t), (i % 4) - 1), done: false, assigneeId: owners[0]?.id }],
      history: [{ at: at(t, -20 + i), by: 'Recepção (demo)', text: `Lead criado (origem: ${source})` }],
      referredByPatientId: source === 'indicacao' ? pats[i % pats.length]?.id : undefined, optOut: i === 4,
    }
  })
})

registerSeed('relationshipMessages', (c) => {
  const t = c.tenantId
  const pats = c.get('patients').filter((p) => !p.duplicateOf && p.status === 'ativo').slice(2, 9)
  return pats.map((p, i): RelationshipMessage => ({
    id: `${t}_rel${i + 1}`, tenantId: t, createdAt: at(t, -30 + i * 2), kind: 'nps', patientId: p.id, personId: p.personId, sentAt: at(t, -30 + i * 2),
    score: i === 6 ? undefined : [10, 9, 8, 10, 6, 9][i], comment: i === 4 ? 'Esperei além do horário marcado.' : undefined, respondedAt: i === 6 ? undefined : at(t, -29 + i * 2), by: 'Recepção (demo)',
  }))
})

registerSeed('payables', (c) => {
  const t = c.tenantId
  const u1 = `${t}_u1`
  const mk = (i: number, desc: string, cat: string, dueOff: number, cents: number, supplier: number | undefined, paid: boolean, n = 1, of = 1, group?: string): Payable => ({
    id: `${t}_pg${i}`, tenantId: t, createdAt: at(t, -40), unitId: u1, supplierId: supplier != null ? `${t}_sup${supplier}` : undefined, description: desc, category: cat, costCenter: cat === 'Aluguel' ? 'Administrativo' : c.get('units')[0]?.name,
    competenceDate: addDaysCivil(today(t), Math.min(dueOff, 0) - 5), dueDate: addDaysCivil(today(t), dueOff), amountCents: cents, installment: { n, of, groupId: group ?? `${t}_pg${i}` },
    status: paid ? 'paga' : 'aberta', payments: paid ? [{ id: `${t}_pg${i}_p`, at: at(t, dueOff), amountCents: cents, method: 'pix', by: 'Financeiro — Márcio (demo)' }] : [], origin: { kind: 'manual' },
  })
  return [
    mk(1, 'Aluguel do imóvel', 'Aluguel', -25, 850000, undefined, true), mk(2, 'Aluguel do imóvel', 'Aluguel', 5, 850000, undefined, false),
    mk(3, 'Energia elétrica', 'Energia e água', -3, 124590, undefined, false), mk(4, 'Insumos descartáveis — 1/2', 'Insumos', -10, 98000, 2, true, 1, 2, `${t}_pgg`),
    mk(5, 'Insumos descartáveis — 2/2', 'Insumos', 20, 98000, 2, false, 2, 2, `${t}_pgg`), mk(6, 'Manutenção preventiva de equipamento', 'Manutenção', 12, 45000, 4, false),
  ]
})

registerSeed('commissionRules', (c) => {
  const t = c.tenantId
  const pros = c.get('professionals')
  const from = addDaysCivil(today(t), -180)
  const base = { tenantId: t, createdAt: at(t, -180), labPercent: 0, deductFees: false, deductSupplies: false, deductDiscounts: false, createdBy: 'Proprietária (demo)' }
  const rules: CommissionRule[] = [{ ...base, id: `${t}_cr_geral_v1`, ruleKey: `${t}_cr_geral`, version: 1, name: 'Padrão da clínica', validFrom: from, percent: 30, base: 'bruta' }]
  if (pros[0]) rules.push({ ...base, id: `${t}_cr_p1_v1`, ruleKey: `${t}_cr_p1`, version: 1, name: `Repasse ${pros[0].name.split(' ').slice(0, 2).join(' ')}`, professionalId: pros[0].id, validFrom: from, percent: 40, base: 'liquida', deductFees: true, deductSupplies: true, deductDiscounts: true })
  if (pros[1]) {
    rules.push({ ...base, id: `${t}_cr_p2_v1`, ruleKey: `${t}_cr_p2`, version: 1, name: `Repasse ${pros[1].name.split(' ').slice(0, 2).join(' ')}`, professionalId: pros[1].id, validFrom: from, percent: 35, base: 'bruta' })
    rules.push({ ...base, id: `${t}_cr_p2_v2`, ruleKey: `${t}_cr_p2`, version: 2, createdAt: at(t, -20), name: `Repasse ${pros[1].name.split(' ').slice(0, 2).join(' ')}`, professionalId: pros[1].id, validFrom: addDaysCivil(today(t), -20), percent: 38, base: 'bruta', note: 'Reajuste negociado (v2)' })
  }
  if (seg(t) === 'odontologia') rules.push({ ...base, id: `${t}_cr_impl_v1`, ruleKey: `${t}_cr_impl`, version: 1, name: 'Implantes (base líquida + laboratório)', serviceId: `${t}_svc7`, validFrom: from, percent: 35, base: 'liquida', labPercent: 15, deductFees: true, deductDiscounts: true })
  rules.push({ ...base, id: `${t}_cr_faixa_v1`, ruleKey: `${t}_cr_faixa`, version: 1, name: 'Faixa alta produção (acima de R$ 20 mil)', tierMinCents: 2000000, validFrom: from, percent: 33, base: 'bruta' })
  return rules
})

registerSeed('commissionClosings', () => [])
registerSeed('commissionParams', () => [])
registerSeed('chargeAdjustments', () => [])
registerSeed('agreements', () => [])
registerSeed('pixReviews', () => [])
registerSeed('crmStages', () => [])

registerSeed('pricingScenarios', (c) => [
  { id: `${c.tenantId}_ps1`, tenantId: c.tenantId, createdAt: created(c.tenantId), name: 'Cenário base (ocupação 70%)', inputs: DEFAULT_PRICING, createdBy: 'Proprietária (demo)' },
  { id: `${c.tenantId}_ps2`, tenantId: c.tenantId, createdAt: created(c.tenantId), name: 'Ocupação 50% (baixa temporada)', inputs: { ...DEFAULT_PRICING, occupancyPercent: 50 }, createdBy: 'Proprietária (demo)' },
] satisfies PricingScenario[])

registerSeed('purchaseOrders', (c) => {
  const t = c.tenantId
  const ps = productsFor(t)
  const u1 = `${t}_u1`
  const by = 'Estoque — Denise (demo)'
  const line = (i: number, k: number, qty: number, rec = 0) => ({ id: `${t}_po${i}_l${k}`, productId: pid(t, ps[k].key), qty, unit: ps[k].conversions[0].unit, unitCostCents: Math.round(ps[k].costCents * ps[k].conversions[0].factor), receivedQty: rec })
  const h = (steps: PurchaseOrder['status'][]) => steps.map((s, i) => ({ at: at(t, -12 + i * 2), from: i ? steps[i - 1] : null, to: s, by }))
  return [
    { id: `${t}_po1`, tenantId: t, createdAt: at(t, -2), number: 'PC-0001', unitId: u1, supplierId: `${t}_sup1`, requestedBy: by, reason: 'Reposição: produto abaixo do mínimo', items: [line(1, 0, 2)], status: 'solicitada', history: h(['solicitada']), payableIds: [] },
    { id: `${t}_po2`, tenantId: t, createdAt: at(t, -8), number: 'PC-0002', unitId: u1, supplierId: `${t}_sup2`, requestedBy: by, reason: 'Compra mensal de descartáveis', items: [line(2, ps.length - 4, 3), line(2, ps.length - 3, 2)], status: 'pedido', history: h(['solicitada', 'aprovada', 'pedido']), payableIds: [] },
    { id: `${t}_po3`, tenantId: t, createdAt: at(t, -12), number: 'PC-0003', unitId: u1, supplierId: `${t}_sup1`, requestedBy: by, reason: 'Estoque de segurança', items: [line(3, 1, 4, 2)], status: 'parcial', history: h(['solicitada', 'aprovada', 'pedido', 'parcial']), payableIds: [] },
  ] satisfies PurchaseOrder[]
})

registerSeed('equipment', (c) => {
  const t = c.tenantId
  const res = c.get('resources').filter((r) => r.kind === 'equipamento' || r.kind === 'cadeira')
  return res.slice(0, 3).map((r, i): Equipment => ({
    id: `${t}_eq${i + 1}`, tenantId: t, createdAt: created(t), unitId: r.unitId, name: r.name, resourceId: r.id, serial: `SN-${(hashString(r.id) % 900000) + 100000}`, supplierId: `${t}_sup4`, acquiredOn: addDaysCivil(today(t), -400 - i * 90), active: true,
    maintenances: i === 0 ? [{ id: `${t}_eq1_m1`, kind: 'preventiva', start: at(t, -60, 8 * 60), end: at(t, -60, 12 * 60), reason: 'Revisão semestral', status: 'concluida', by: 'Proprietária (demo)', costCents: 45000 }] : [],
  }))
})
