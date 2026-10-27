// Configurações da clínica: regra da REDE (unitId = null) com overrides permitidos por UNIDADE.
// Leitura por qualquer módulo via getSettings (defaults garantidos). Edição: módulo settings.
import type { Entity, ID, PaymentMethod } from './types'
import { db } from '@/data/store'

export interface ClinicPolicies {
  booking: {
    minAdvanceHours: number
    maxAdvanceDays: number
    cancelWindowHours: number
    rescheduleWindowHours: number
    requireConfirmation: boolean
    confirmationLeadHours: number
    depositRequiredAbove?: number // centavos
    depositPercent: number
    slotStepMin: number
    publicBookingEnabled: boolean
  }
  communication: {
    senderName: string
    replyTo: string
    quietHours: { start: number; end: number }
    reminderHoursBefore: number[]
    whatsappEnabled: boolean
    emailEnabled: boolean
    pushEnabled: boolean
    fallbackToEmail: boolean
  }
  payments: {
    allowedMethods: PaymentMethod[]
    receivingAccountLabel: string // dado bancário DEMONSTRATIVO
    lateFeePercent: number
    monthlyInterestPercent: number
    earlyDiscountPercent: number
    maxInstallments: number
    allowNegativeStock: boolean
  }
  privacy: {
    callPanelMode: 'senha' | 'nome_abreviado'
    showClinicalAlertsToReception: false
  }
}

export interface ClinicSettings extends Entity {
  /** null = regra da rede; preenchido = override daquela unidade (apenas chaves sobrescritas). */
  unitId: ID | null
  policies: DeepPartial<ClinicPolicies>
}
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] }

export const DEFAULT_POLICIES: ClinicPolicies = {
  booking: { minAdvanceHours: 2, maxAdvanceDays: 60, cancelWindowHours: 24, rescheduleWindowHours: 12, requireConfirmation: true, confirmationLeadHours: 24, depositPercent: 0, slotStepMin: 15, publicBookingEnabled: true },
  communication: { senderName: '', replyTo: '', quietHours: { start: 21 * 60, end: 8 * 60 }, reminderHoursBefore: [24, 2], whatsappEnabled: true, emailEnabled: true, pushEnabled: false, fallbackToEmail: true },
  payments: { allowedMethods: ['pix', 'cartao_credito', 'cartao_debito', 'dinheiro', 'pix_manual', 'link_pagamento'], receivingAccountLabel: 'Conta demonstrativa — Banco 000 Ag. 0000 CC 00000-0', lateFeePercent: 2, monthlyInterestPercent: 1, earlyDiscountPercent: 0, maxInstallments: 6, allowNegativeStock: false },
  privacy: { callPanelMode: 'senha', showClinicalAlertsToReception: false },
}

function merge<T>(base: T, over: DeepPartial<T> | undefined): T {
  if (!over) return base
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue
    const b = (base as Record<string, unknown>)[k]
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' ? merge(b, v as DeepPartial<typeof b>) : v
  }
  return out as T
}

declare module '@/data/store' {
  interface TenantCollections { settings: ClinicSettings[] }
}

/** Política efetiva: default ← rede ← unidade. */
export function getPolicies(tenantId: ID, unitId?: ID | null): ClinicPolicies {
  const all = db.list(tenantId, 'settings')
  const net = all.find((s) => s.unitId === null)
  const unit = unitId ? all.find((s) => s.unitId === unitId) : undefined
  return merge(merge(DEFAULT_POLICIES, net?.policies), unit?.policies)
}

/** Lista caminhos sobrescritos pela unidade (para mostrar herança e "restaurar padrão"). */
export function overriddenPaths(tenantId: ID, unitId: ID): string[] {
  const unit = db.list(tenantId, 'settings').find((s) => s.unitId === unitId)
  const paths: string[] = []
  const walk = (o: unknown, p: string) => {
    if (o && typeof o === 'object' && !Array.isArray(o)) Object.entries(o).forEach(([k, v]) => walk(v, p ? `${p}.${k}` : k))
    else if (o !== undefined) paths.push(p)
  }
  walk(unit?.policies, '')
  return paths
}
