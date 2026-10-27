// Efeitos do módulo comercial (importado eagerly por src/modules/register.ts).
// appointment.completed → (a) consome ficha técnica UMA vez (trava Appointment.stockConsumedAt);
//                         (b) cria cobrança da consulta se serviço tem preço, não há charge com origin.refId = appointment.id
//                             e o procedimento não está coberto por proposta já cobrada.
// appointment.cancelled → NÃO devolve material já consumido. Material usado não volta ao estoque automaticamente
//                         (seção 13); devolução real exige ajuste/entrada manual com motivo, rastreável.
import type { Appointment, Charge, ID } from '@/domain/types'
import { on } from '@/data/events'
import { db } from '@/data/store'
import { audit, notificationProvider } from '@/data/repositories'
import { nowISO } from '@/lib/dates'
import { consumeForAppointment } from './inventory'
import './types'

/** Procedimento coberto por proposta aceita e já cobrada (mesmo paciente + serviço aceito). */
export function coveredByProposal(tenantId: ID, a: Appointment): boolean {
  return db.list(tenantId, 'proposals').some((p) => p.patientId === a.patientId && p.chargeIds.length > 0
    && (p.status === 'aceita' || p.status === 'aceita_parcial')
    && p.items.some((i) => i.serviceId === a.serviceId && p.acceptedItemIds.includes(i.id)))
}

export function chargeForAppointment(tenantId: ID, appointmentId: ID, by: string): Charge | null {
  const a = db.get(tenantId, 'appointments', appointmentId)
  if (!a || a.status !== 'concluida') return null
  const svc = db.get(tenantId, 'services', a.serviceId)
  if (!svc || svc.priceCents <= 0) return null
  if (db.list(tenantId, 'charges').some((c) => c.origin.refId === a.id)) return null
  if (coveredByProposal(tenantId, a)) return null
  const day = a.start.slice(0, 10)
  const ch: Charge = {
    id: `ch_${a.id}`, tenantId, createdAt: nowISO(), unitId: a.unitId, patientId: a.patientId,
    payerPersonId: db.get(tenantId, 'patients', a.patientId)?.personId ?? db.list(tenantId, 'links').find((l) => l.patientId === a.patientId && l.canSeeFinancial)?.personId,
    origin: { kind: 'consulta', refId: a.id }, description: svc.name, competenceDate: day, dueDate: day, amountCents: svc.priceCents, adjustmentsCents: 0,
    installment: { n: 1, of: 1, groupId: `ch_${a.id}` }, status: 'aberta', payments: [], refunds: [], professionalId: a.professionalId, serviceId: svc.id,
    category: 'Atendimentos', costCenter: db.get(tenantId, 'units', a.unitId)?.name,
  }
  db.insert(tenantId, 'charges', ch)
  if (a.financialStatus === 'nao_cobrado') db.update(tenantId, 'appointments', a.id, { financialStatus: 'cobrado' })
  audit(tenantId, { actorId: by, actorName: by, action: 'cobranca.criada', resource: 'charges', resourceId: ch.id, unitId: a.unitId, detail: `Consulta concluída (${a.id})` })
  return ch
}

on('appointment.completed', ({ tenantId, appointment, by }) => {
  consumeForAppointment(tenantId, appointment.id, by)
  chargeForAppointment(tenantId, appointment.id, by)
})

on('appointment.cancelled', ({ tenantId, appointment, by }) => {
  // Intencional: nenhum estorno de estoque. Só registra na trilha quando já havia consumo.
  if (appointment.stockConsumedAt) audit(tenantId, { actorId: by, actorName: by, action: 'estoque.cancelamento_sem_devolucao', resource: 'appointments', resourceId: appointment.id, detail: 'Material já consumido não foi devolvido automaticamente.' })
})

on('stock.low', ({ tenantId, productId, name }) => {
  const owner = db.list(tenantId, 'staff').find((u) => u.memberships.some((m) => m.role === 'inventory')) ?? db.list(tenantId, 'staff').find((u) => u.memberships.some((m) => m.role === 'clinic_owner'))
  if (!owner) return
  const day = nowISO().slice(0, 10)
  if (db.list(tenantId, 'outbox').some((m) => m.dedupeKey === `estoque_baixo:${productId}:${day}`)) return // 1 alerta/produto/dia
  notificationProvider.enqueue(tenantId, { event: 'estoque_baixo', channel: 'email', recipientName: owner.name, recipientRef: owner.id, subject: `Estoque abaixo do mínimo: ${name}`, preview: 'Verifique a reposição no módulo de estoque.', dedupeKey: `estoque_baixo:${productId}:${day}` })
})
