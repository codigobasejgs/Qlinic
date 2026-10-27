// Simulador de precificação (puro). Margem é ESTIMATIVA gerencial, não lucro contábil.
import { marginPercent, percentOf, priceFromMarkup, type Cents } from '@/lib/money'
import type { PricingInputs } from './types'

export const DEFAULT_PRICING: PricingInputs = {
  fixedMonthlyCents: 4500000, rooms: 3, hoursPerDay: 9, daysPerMonth: 22, occupancyPercent: 70, durationMin: 60,
  suppliesCents: 4500, taxPercent: 11.33, paymentFeePercent: 3.5, commissionPercent: 30, markupPercent: 120, targetMarginPercent: 20,
}

export function simulatePrice(i: PricingInputs) {
  const errors: string[] = []
  const capacityHours = i.rooms * i.hoursPerDay * i.daysPerMonth * (i.occupancyPercent / 100)
  if (capacityHours <= 0) errors.push('Capacidade efetiva deve ser maior que zero (salas, horas, dias e ocupação).')
  if (i.durationMin <= 0) errors.push('Duração deve ser maior que zero.')
  const costPerHour: Cents = capacityHours > 0 ? Math.round(i.fixedMonthlyCents / capacityHours) : 0
  const fixedShare: Cents = Math.round((costPerHour * i.durationMin) / 60)
  const directCost: Cents = fixedShare + i.suppliesCents
  const variablePercent = i.taxPercent + i.paymentFeePercent + i.commissionPercent
  // Markup: aplicado sobre o CUSTO direto. Variáveis (impostos, taxa, repasse) incidem depois sobre o preço.
  const markupPrice = priceFromMarkup(directCost, i.markupPercent)
  // Margem desejada: sobre o PREÇO, já descontando os percentuais variáveis.
  const denom = 1 - (variablePercent + i.targetMarginPercent) / 100
  if (denom <= 0) errors.push('Impostos + taxa + repasse + margem desejada somam 100% ou mais: não há preço viável.')
  const marginPrice: Cents = denom > 0 ? Math.round(directCost / denom) : 0
  const result = (price: Cents) => {
    const variable = percentOf(price, variablePercent)
    const profit = price - directCost - variable
    return { price, variable, profit, marginPercent: price > 0 ? (profit / price) * 100 : 0, grossMarginPercent: marginPercent(price, directCost) }
  }
  return { capacityHours, costPerHour, fixedShare, directCost, variablePercent, markup: result(markupPrice), margin: result(marginPrice), errors }
}
