// Efeitos (eager): eventos de domínio → automações ATIVAS do tenant + alertas internos.
// Respeitam limites, janela da automação e horário silencioso (status 'aguardando_janela' na fila).
import { on } from '@/data/events'
import { db } from '@/data/store'
import { formatBRL } from '@/lib/money'
import { alertStaff, cancelCtx, gateMessage, onTrigger, recordCtx } from './engine'
import type { TriggerCtx } from './types'
import { setNotificationGate } from '@/data/repositories'

// Todo envio (inclusive notifyPatient/offerSlot da fundação) respeita suppression list, opt-in e horário silencioso.
setNotificationGate((t, m) => gateMessage(t, m))

function patientCtx(tenantId: string, patientId: string, key: string, subject: string, fields: TriggerCtx['fields'], refId?: string): TriggerCtx {
  const p = db.get(tenantId, 'patients', patientId)
  const personRef = p?.personId ?? db.list(tenantId, 'links').find((l) => l.patientId === patientId && l.canSeeFinancial)?.personId
  return { key, subject, personRef, personName: p?.name, patientId, refId, fields }
}

on('appointment.cancelled', ({ tenantId, appointment }) => {
  onTrigger(tenantId, 'appointment.cancelled', cancelCtx(tenantId, appointment.id))
})

on('stock.low', ({ tenantId, productId, name }) => {
  alertStaff(tenantId, 'estoque_baixo', 'estoque_baixo', `Estoque baixo — ${name}`, `O item ${name} atingiu o estoque mínimo. Verifique compras.`, `stock:${productId}`)
})

on('record.finalized', ({ tenantId, recordId }) => {
  onTrigger(tenantId, 'record.finalized', recordCtx(tenantId, recordId))
})

on('payment.confirmed', ({ tenantId, charge, amountCents }) => {
  alertStaff(tenantId, 'pagamento_confirmado', 'pagamento_confirmado', 'Pagamento confirmado', `${charge.description}: ${formatBRL(amountCents)} (simulado).`, `pay:${charge.id}:${charge.payments.length}`)
  onTrigger(tenantId, 'payment.confirmed', patientCtx(tenantId, charge.patientId, `payment:${charge.id}:${charge.payments.length}`, `Pagamento de ${formatBRL(amountCents)}`, { valor_reais: Math.round(amountCents / 100) }, charge.id))
})

on('proposal.accepted', ({ tenantId, proposal }) => {
  const total = proposal.items.filter((i) => proposal.acceptedItemIds.includes(i.id)).reduce((s, i) => s + i.qty * i.unitCents - i.discountCents, 0)
  alertStaff(tenantId, 'proposta_aceita', 'aceite', `Proposta ${proposal.number} aceita`, `Aceite registrado (${formatBRL(total)}).`, `prop:${proposal.id}:v${proposal.version}`)
  onTrigger(tenantId, 'proposal.accepted', patientCtx(tenantId, proposal.patientId, `accepted:${proposal.id}:v${proposal.version}`, `Proposta ${proposal.number} aceita`, { valor_reais: Math.round(total / 100) }, proposal.id))
})
