// Tipos PRIVADOS do módulo comercial (CRM, orçamentos, financeiro, comissões, precificação, estoque, compras).
// Coleções novas por declaration merging. Dinheiro em centavos; instantes ISO; datas civis YYYY-MM-DD.
import type { Cents } from '@/lib/money'
import type { CivilDate, ISOInstant } from '@/lib/dates'
import type { Entity, ID, PaymentMethod, StatusChange } from '@/domain/types'
import type { LeadStage } from '@/domain/modules'
import '@/domain/modules'

// ---------- CRM ----------
export interface CrmStageConfig extends Entity { stage: LeadStage; label: string; hidden: boolean; order: number }
/** Mensagens de relacionamento (NPS / indicação). Respeitam opt-out e limite de frequência. Nunca citam condição de saúde. */
export interface RelationshipMessage extends Entity {
  kind: 'nps' | 'indicacao'
  patientId: ID
  personId?: ID
  leadId?: ID
  sentAt: ISOInstant
  score?: number
  comment?: string
  respondedAt?: ISOInstant
  /** Virou atendimento humano (PortalRequest criado). */
  humanRequestId?: ID
  by: string
}

// ---------- Financeiro ----------
export interface Supplier extends Entity { name: string; document?: string; email?: string; phone?: string; category: string; active: boolean }
export interface FinanceCategory extends Entity { name: string; kind: 'receita' | 'despesa'; active: boolean }
export interface CostCenter extends Entity { name: string; unitId?: ID; active: boolean }
export interface PayablePayment { id: ID; at: ISOInstant; amountCents: Cents; method: PaymentMethod; by: string; /** Estorno vinculado (valor negativo). */ reversalOf?: ID; reason?: string }
export interface Payable extends Entity {
  unitId: ID
  supplierId?: ID
  description: string
  category: string
  costCenter?: string
  competenceDate: CivilDate
  dueDate: CivilDate
  amountCents: Cents
  installment: { n: number; of: number; groupId: ID }
  status: 'aberta' | 'paga' | 'cancelada'
  payments: PayablePayment[]
  origin: { kind: 'manual' | 'compra'; refId?: ID }
}
/** Memória de cálculo de encargos aplicados (juros/multa/desconto). */
export interface ChargeAdjustment extends Entity {
  chargeId: ID
  by: string
  lines: { label: string; cents: Cents }[]
  totalCents: Cents
  /** Dias de juros já cobrados até esta aplicação (evita cobrar o mesmo dia duas vezes). */
  interestDaysCharged: number
  feeApplied: boolean
}
/** Acordo/renegociação: saldo antigo cancelado com vínculo; novas parcelas origin 'acordo'. */
export interface Agreement extends Entity { patientId: ID; originalChargeIds: ID[]; newChargeIds: ID[]; totalCents: Cents; installments: number; reason: string; by: string }
export interface PixReview extends Entity { chargeId: ID; paymentId: ID; amountCents: Cents; decision: 'aprovado' | 'recusado'; by: string; note?: string }

// ---------- Comissões ----------
export interface CommissionRule extends Entity {
  /** Identidade estável entre versões. */
  ruleKey: ID
  version: number
  name: string
  professionalId?: ID
  serviceId?: ID
  /** Faixa por produção bruta do profissional no período (centavos). */
  tierMinCents?: Cents
  tierMaxCents?: Cents
  validFrom: CivilDate
  validTo?: CivilDate
  percent: number
  base: 'bruta' | 'liquida'
  /** Parâmetros de base líquida. */
  deductFees: boolean
  labPercent: number
  deductSupplies: boolean
  deductDiscounts: boolean
  /** Versão que encerra a regra. */
  archived?: boolean
  createdBy: string
  note?: string
}
export interface CommissionItem {
  id: ID
  kind: 'normal' | 'estorno'
  paymentId: ID
  refundId?: ID
  chargeId: ID
  professionalId: ID
  serviceId?: ID
  date: CivilDate
  method: PaymentMethod
  receivedCents: Cents
  discountCents: Cents
  grossCents: Cents
  feeCents: Cents
  labCents: Cents
  suppliesCents: Cents
  baseCents: Cents
  percent: number
  ruleId: ID
  ruleKey: ID
  ruleVersion: number
  commissionCents: Cents
  memo: string
}
export interface CommissionParams { feeByMethod: Record<PaymentMethod, number> }
export interface CommissionClosing extends Entity {
  number: string
  periodStart: CivilDate
  periodEnd: CivilDate
  executedBy: string
  params: CommissionParams
  /** Snapshot imutável. */
  items: CommissionItem[]
  skipped: { paymentId: ID; reason: string }[]
  adjustments: { id: ID; at: ISOInstant; professionalId: ID; amountCents: Cents; reason: string; approvedBy: string }[]
}

// ---------- Precificação ----------
export interface PricingInputs {
  fixedMonthlyCents: Cents
  rooms: number
  hoursPerDay: number
  daysPerMonth: number
  occupancyPercent: number
  durationMin: number
  suppliesCents: Cents
  taxPercent: number
  paymentFeePercent: number
  commissionPercent: number
  markupPercent: number
  targetMarginPercent: number
}
export interface PricingScenario extends Entity { name: string; inputs: PricingInputs; createdBy: string }

// ---------- Estoque / compras ----------
export interface ServiceKit extends Entity { serviceId: ID; items: { productId: ID; qty: number }[]; updatedBy: string }
export interface PurchaseLine { id: ID; productId: ID; qty: number; unit: string; unitCostCents: Cents; receivedQty: number }
export type PurchaseStatus = 'solicitada' | 'aprovada' | 'recusada' | 'pedido' | 'parcial' | 'recebida' | 'cancelada'
export interface PurchaseOrder extends Entity {
  number: string
  unitId: ID
  supplierId?: ID
  requestedBy: string
  reason: string
  items: PurchaseLine[]
  status: PurchaseStatus
  history: StatusChange<PurchaseStatus>[]
  payableIds: ID[]
}
export interface Maintenance { id: ID; kind: 'preventiva' | 'corretiva'; start: ISOInstant; end: ISOInstant; reason: string; status: 'agendada' | 'concluida'; by: string; costCents?: Cents }
export interface Equipment extends Entity { unitId: ID; name: string; resourceId?: ID; serial?: string; supplierId?: ID; acquiredOn?: CivilDate; maintenances: Maintenance[]; active: boolean }

declare module '@/data/store' {
  interface TenantCollections {
    crmStages: CrmStageConfig[]
    relationshipMessages: RelationshipMessage[]
    suppliers: Supplier[]
    financeCategories: FinanceCategory[]
    costCenters: CostCenter[]
    payables: Payable[]
    chargeAdjustments: ChargeAdjustment[]
    agreements: Agreement[]
    pixReviews: PixReview[]
    commissionRules: CommissionRule[]
    commissionClosings: CommissionClosing[]
    commissionParams: (CommissionParams & Entity)[]
    pricingScenarios: PricingScenario[]
    serviceKits: ServiceKit[]
    purchaseOrders: PurchaseOrder[]
    equipment: Equipment[]
  }
}
