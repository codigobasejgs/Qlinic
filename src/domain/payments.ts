// Provedores de pagamento (Contexto B: paciente → clínica). Tudo SIMULADO no frontend.
// Capacidades não verificadas = 'homologacao' (nunca habilitadas por suposição).
// Futuro: chamadas via backend; webhooks verificados por assinatura, deduplicados por eventId, idempotência na criação.
import type { Cap, PaymentCapabilities, PaymentProvider } from '@/data/repositories'
import type { Charge, ID, PaymentMethod, ProviderKey } from './types'
import { billingRepo, audit, chargeBalance } from '@/data/repositories'
import { db } from '@/data/store'
import { emit } from '@/data/events'
import { uid } from '@/lib/util'
import type { Cents } from '@/lib/money'

const caps = (c: Partial<Record<keyof PaymentCapabilities, Cap>>): PaymentCapabilities => ({ checkout: 'homologacao', pix: 'homologacao', boleto: 'homologacao', cartao: 'homologacao', recorrencia: 'homologacao', parcelamento: 'homologacao', estorno: 'homologacao', split: 'homologacao', ...c })

export type SimScenario = 'sucesso' | 'falha' | 'timeout' | 'webhook_duplicado' | 'fora_de_ordem'

function simulated(key: ProviderKey, name: string, capabilities: PaymentCapabilities): PaymentProvider {
  return {
    key, name, capabilities,
    async createCharge({ idempotencyKey }) {
      await new Promise((r) => setTimeout(r, 500))
      const scenario = (sessionStorage.getItem('qlinic.sim.payment') as SimScenario | null) ?? 'sucesso'
      if (scenario === 'falha') return { status: 'erro', error: 'Pagamento recusado pelo provedor (simulado).' }
      if (scenario === 'timeout') return { status: 'timeout', error: 'Tempo esgotado ao consultar o provedor (simulado). Status desconhecido — não reenviar automaticamente.' }
      return { status: 'pendente', providerPaymentId: `sim_${key}_${idempotencyKey}`, checkoutUrl: '#checkout-simulado' }
    },
  }
}

/** Mapas de capacidades conforme documentação pública a validar na homologação. Nada habilitado por suposição. */
export const PROVIDERS: Record<Exclude<ProviderKey, 'manual'>, PaymentProvider> = {
  infinitepay: simulated('infinitepay', 'InfinitePay', caps({ checkout: 'homologacao', pix: 'homologacao', cartao: 'homologacao', split: 'nao', recorrencia: 'nao', boleto: 'nao' })),
  asaas: simulated('asaas', 'Asaas', caps({ checkout: 'homologacao', pix: 'homologacao', boleto: 'homologacao', cartao: 'homologacao', recorrencia: 'homologacao', parcelamento: 'homologacao', estorno: 'homologacao', split: 'homologacao' })),
  mercadopago: simulated('mercadopago', 'Mercado Pago', caps({ checkout: 'homologacao', pix: 'homologacao', cartao: 'homologacao', parcelamento: 'homologacao', estorno: 'homologacao', split: 'homologacao' })),
}
export const CAP_LABEL: Record<keyof PaymentCapabilities, string> = { checkout: 'Checkout/link', pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão', recorrencia: 'Recorrência', parcelamento: 'Parcelamento', estorno: 'Estorno', split: 'Split' }

export function setSimScenario(s: SimScenario) { try { sessionStorage.setItem('qlinic.sim.payment', s) } catch { /* */ } }
export function getSimScenario(): SimScenario { try { return (sessionStorage.getItem('qlinic.sim.payment') as SimScenario) || 'sucesso' } catch { return 'sucesso' } }

/** Webhooks processados (dedupe por eventId). Em memória + sessionStorage (demo). */
const seen = new Set<string>(JSON.parse((() => { try { return sessionStorage.getItem('qlinic.sim.webhooks') ?? '[]' } catch { return '[]' } })()))
function markSeen(id: string) { seen.add(id); try { sessionStorage.setItem('qlinic.sim.webhooks', JSON.stringify([...seen])) } catch { /* */ } }

export interface WebhookEvent { eventId: string; providerPaymentId: string; type: 'payment.confirmed' | 'payment.failed' | 'payment.refunded'; amountCents: Cents; occurredAt: string }

/** Processa webhook simulado. Retorna resultado auditável. Redirect de checkout NUNCA confirma pagamento. */
export function processWebhook(tenantId: ID, chargeId: ID, ev: WebhookEvent, method: PaymentMethod, provider: ProviderKey): { result: 'aplicado' | 'duplicado' | 'ignorado'; detail: string; charge?: Charge } {
  if (seen.has(ev.eventId)) return { result: 'duplicado', detail: `Evento ${ev.eventId} já processado — ignorado (idempotência).` }
  markSeen(ev.eventId)
  const ch = db.get(tenantId, 'charges', chargeId)
  if (!ch) return { result: 'ignorado', detail: 'Cobrança não encontrada para a referência.' }
  if (ev.type === 'payment.failed') return { result: 'ignorado', detail: 'Falha registrada; nenhum valor confirmado.' }
  if (ev.type === 'payment.refunded') {
    const pay = ch.payments.find((p) => p.providerPaymentId === ev.providerPaymentId)
    if (!pay) return { result: 'ignorado', detail: 'Estorno recebido antes da confirmação (fora de ordem) — mantido para conciliação manual.' }
    const charge = billingRepo.refund(tenantId, chargeId, pay.id, ev.amountCents, 'Estorno notificado pelo provedor (simulado)', 'estorno')
    return { result: 'aplicado', detail: 'Estorno aplicado.', charge }
  }
  if (ch.payments.some((p) => p.providerPaymentId === ev.providerPaymentId)) return { result: 'duplicado', detail: 'Pagamento já registrado para este providerPaymentId.' }
  const charge = billingRepo.registerPayment(tenantId, chargeId, { amountCents: ev.amountCents, method, provider, receivedBy: 'webhook', providerPaymentId: ev.providerPaymentId })
  audit(tenantId, { actorId: 'webhook', actorName: `Webhook ${provider} (simulado)`, action: 'pagamento.confirmado', resource: 'charges', resourceId: chargeId, detail: ev.eventId })
  emit('payment.confirmed', { tenantId, charge, amountCents: ev.amountCents })
  return { result: 'aplicado', detail: 'Pagamento confirmado via webhook simulado.', charge }
}

/**
 * Fluxo completo de pagamento simulado (portal/link de proposta):
 * 1) createCharge (idempotencyKey = chargeId) → 2) "checkout" → 3) webhook confirma. Cenários: falha, timeout, duplicado.
 */
export async function simulateOnlinePayment(tenantId: ID, chargeId: ID, method: PaymentMethod, providerKey: Exclude<ProviderKey, 'manual'> = 'asaas'): Promise<{ ok: boolean; message: string }> {
  const ch = db.get(tenantId, 'charges', chargeId)
  if (!ch) return { ok: false, message: 'Cobrança não encontrada.' }
  const balance = chargeBalance(ch)
  if (balance <= 0) return { ok: false, message: 'Esta cobrança já está quitada.' }
  const provider = PROVIDERS[providerKey]
  const scenario = getSimScenario()
  const r = await provider.createCharge({ tenantId, amountCents: balance, description: ch.description, idempotencyKey: chargeId, method })
  if (r.status === 'erro') return { ok: false, message: r.error ?? 'Falha no pagamento.' }
  if (r.status === 'timeout') return { ok: false, message: r.error ?? 'Tempo esgotado.' }
  const ev: WebhookEvent = { eventId: uid('evt_'), providerPaymentId: r.providerPaymentId!, type: 'payment.confirmed', amountCents: balance, occurredAt: new Date().toISOString() }
  const first = processWebhook(tenantId, chargeId, ev, method, providerKey)
  if (scenario === 'webhook_duplicado') {
    const dup = processWebhook(tenantId, chargeId, ev, method, providerKey)
    return { ok: first.result === 'aplicado', message: `${first.detail} Segundo envio do mesmo evento: ${dup.detail}` }
  }
  return { ok: first.result === 'aplicado', message: first.detail }
}

/** Pix manual: paciente informa comprovante; fica pendente até aprovação humana (não é confirmação bancária). */
export function submitPixReceipt(tenantId: ID, chargeId: ID, amountCents: Cents, by: ID) {
  return billingRepo.registerPayment(tenantId, chargeId, { amountCents, method: 'pix_manual', provider: 'manual', receivedBy: by, pendingApproval: true })
}
