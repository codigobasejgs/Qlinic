// Tipos de módulos LIDOS POR MAIS DE UM MÓDULO (contrato estável). Tipos privados de cada módulo ficam no próprio módulo
// e aumentam TenantCollections por declaration merging.
import type { Cents } from '@/lib/money'
import type { CivilDate, ISOInstant } from '@/lib/dates'
import type { Entity, ID } from './types'

// ---------- Veterinária (lido pelo portal) ----------
export interface VaccineRecord extends Entity {
  patientId: ID // animal
  kind: 'vacina' | 'vermifugo' | 'antiparasitario'
  product: string
  manufacturer?: string
  lot: string
  appliedOn: CivilDate
  professionalId: ID
  /** Definida pelo veterinário caso a caso — nunca calculada por regra universal. */
  nextDueOn?: CivilDate
  notes?: string
  status: 'aplicada' | 'agendada' | 'cancelada'
}

// ---------- Fisioterapia (lido pelo portal) ----------
export interface ExercisePlan extends Entity {
  patientId: ID
  professionalId: ID
  title: string
  exercises: { id: ID; name: string; sets?: number; reps?: number; holdSec?: number; frequency: string; instructions: string; mediaLabel?: string }[]
  releasedToPortal: boolean
  /** Adesão DECLARADA pelo paciente no portal. */
  adherence: { date: CivilDate; exerciseId?: ID; done: boolean; note?: string; at: ISOInstant }[]
  status: 'ativo' | 'encerrado'
}

// ---------- Nutrição (lido pelo portal) ----------
export interface NutritionPlan extends Entity {
  patientId: ID
  professionalId: ID
  version: number
  title: string
  meals: { id: ID; name: string; time: string; items: string[]; notes?: string }[]
  guidance: string
  /** Plano editado e revisado pelo profissional antes de liberar. Nada gerado automaticamente. */
  reviewedAt?: ISOInstant
  releasedToPortal: boolean
  status: 'rascunho' | 'liberado' | 'substituido'
}

// ---------- Estética (lido pelo portal) ----------
export interface AestheticPackage extends Entity {
  patientId: ID
  serviceId: ID
  name: string
  sessionsTotal: number
  sessions: { date: CivilDate; appointmentId?: ID; professionalId?: ID; note?: string }[]
  validUntil: CivilDate
  priceCents: Cents
  status: 'ativo' | 'concluido' | 'expirado' | 'cancelado'
}

// ---------- Formulários (construtor: clínico; preenchimento: portal) ----------
export type FormFieldType = 'text' | 'textarea' | 'number' | 'date' | 'single' | 'multi' | 'section' | 'boolean'
export interface FormField {
  id: ID
  type: FormFieldType
  label: string
  required?: boolean
  options?: string[]
  min?: number
  max?: number
  help?: string
  /** Condição simples: exibe se campo X == valor. */
  showIf?: { fieldId: ID; equals: string }
}
export interface FormTemplate extends Entity {
  name: string
  specialty: string
  audience: 'paciente' | 'profissional'
  /** Versões imutáveis; a resposta guarda a versão respondida. */
  versions: { version: number; publishedAt?: ISOInstant; fields: FormField[] }[]
  currentVersion: number
  active: boolean
}
export interface FormResponse extends Entity {
  templateId: ID
  templateVersion: number
  patientId: ID
  appointmentId?: ID
  answers: Record<ID, unknown>
  submittedAt?: ISOInstant
  submittedBy: 'paciente' | 'profissional' | 'responsavel'
  status: 'pendente' | 'enviado'
}

// ---------- Estoque (agenda conclui → estoque consome ficha técnica uma única vez) ----------
export interface Product extends Entity {
  name: string
  sku: string
  category: string
  /** Unidade base de controle (ex.: 'ml', 'un', 'g'). Conversões explícitas. */
  baseUnit: string
  conversions: { unit: string; factor: number }[] // 1 unit = factor * baseUnit
  minQty: number
  /** Precisão decimal permitida (fracionados). */
  decimals: number
  supplierId?: ID
  allowNegative: boolean
  costCents: Cents // custo por unidade base
  active: boolean
}
export interface Lot extends Entity {
  productId: ID
  unitId: ID
  code: string
  expiresOn?: CivilDate
  qty: number // em unidade base
  reserved: number
}
export type StockMovementKind = 'entrada' | 'saida' | 'consumo_procedimento' | 'perda' | 'ajuste' | 'inventario' | 'transferencia_saida' | 'transferencia_entrada' | 'reserva' | 'liberacao_reserva'
export interface StockMovement extends Entity {
  productId: ID
  lotId?: ID
  unitId: ID
  kind: StockMovementKind
  qty: number // positivo entra, negativo sai (unidade base)
  reason?: string
  appointmentId?: ID
  by: string
  refId?: ID
}

// ---------- Caixa (recepção registra recebimentos; financeiro abre/fecha) ----------
export interface CashSession extends Entity {
  unitId: ID
  operatorId: ID
  operatorName: string
  openedAt: ISOInstant
  openingCents: Cents
  closedAt?: ISOInstant
  countedCents?: Cents
  movements: { id: ID; at: ISOInstant; kind: 'sangria' | 'suprimento' | 'recebimento' | 'estorno'; amountCents: Cents; method?: string; note?: string; chargeId?: ID }[]
  status: 'aberto' | 'fechado'
}

// ---------- CRM ----------
export type LeadStage = 'novo' | 'qualificacao' | 'agendamento' | 'avaliacao' | 'proposta' | 'negociacao' | 'convertido' | 'perdido'
export interface Lead extends Entity {
  name: string
  phone?: string
  email?: string
  source: 'site' | 'indicacao' | 'instagram' | 'whatsapp' | 'google' | 'evento' | 'outro'
  stage: LeadStage
  ownerId?: ID
  /** Interesse comercial — NUNCA diagnóstico. */
  interest: string
  patientId?: ID
  proposalId?: ID
  lostReason?: string
  tasks: { id: ID; title: string; dueOn: CivilDate; done: boolean; assigneeId?: ID }[]
  history: { at: ISOInstant; by: string; text: string }[]
  referredByPatientId?: ID
  optOut: boolean
}

// ---------- Portal ----------
export interface PortalRequest extends Entity {
  personId: ID
  patientId?: ID
  kind: 'atendimento' | 'exportacao' | 'reagendamento' | 'documento' | 'outro'
  message: string
  status: 'aberta' | 'em_andamento' | 'concluida'
  handledBy?: string
}

declare module '@/data/store' {
  interface TenantCollections {
    vaccines: VaccineRecord[]
    exercisePlans: ExercisePlan[]
    nutritionPlans: NutritionPlan[]
    aestheticPackages: AestheticPackage[]
    formTemplates: FormTemplate[]
    formResponses: FormResponse[]
    products: Product[]
    lots: Lot[]
    stockMovements: StockMovement[]
    cashSessions: CashSession[]
    leads: Lead[]
    portalRequests: PortalRequest[]
  }
}
