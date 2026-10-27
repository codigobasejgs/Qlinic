// Caixa por unidade/operador (Contexto B). Recebimento em dinheiro/cartão presencial passa pelo caixa aberto.
import type { CashSession } from './modules'
import type { ID, PaymentMethod } from './types'
import { db } from '@/data/store'
import { billingRepo, audit } from '@/data/repositories'
import { emit } from '@/data/events'
import { nowISO } from '@/lib/dates'
import { uid } from '@/lib/util'
import type { Cents } from '@/lib/money'
import './modules'

export function openSessionFor(tenantId: ID, unitId: ID, operatorId: ID): CashSession | undefined {
  return db.list(tenantId, 'cashSessions').find((s) => s.status === 'aberto' && s.unitId === unitId && s.operatorId === operatorId)
}

export function openCash(tenantId: ID, unitId: ID, operator: { id: ID; name: string }, openingCents: Cents): CashSession {
  if (openSessionFor(tenantId, unitId, operator.id)) throw new Error('Já existe um caixa aberto para este operador nesta unidade.')
  if (openingCents < 0) throw new Error('Fundo de troco inválido.')
  const s: CashSession = { id: uid('cx_'), tenantId, createdAt: nowISO(), unitId, operatorId: operator.id, operatorName: operator.name, openedAt: nowISO(), openingCents, movements: [], status: 'aberto' }
  db.insert(tenantId, 'cashSessions', s)
  audit(tenantId, { actorId: operator.id, actorName: operator.name, action: 'caixa.aberto', resource: 'cashSessions', resourceId: s.id, unitId })
  return s
}

export function cashMovement(tenantId: ID, sessionId: ID, kind: 'sangria' | 'suprimento', amountCents: Cents, note: string): CashSession {
  if (amountCents <= 0) throw new Error('Valor deve ser maior que zero.')
  if (!note.trim()) throw new Error('Informe a justificativa.')
  return db.update(tenantId, 'cashSessions', sessionId, (s) => {
    if (s.status !== 'aberto') throw new Error('Caixa fechado.')
    if (kind === 'sangria' && amountCents > expectedCash(s)) throw new Error('Sangria maior que o saldo em dinheiro do caixa.')
    return { ...s, movements: [...s.movements, { id: uid('mv_'), at: nowISO(), kind, amountCents, note }] }
  }) as CashSession
}

/** Saldo esperado em DINHEIRO na gaveta. */
export function expectedCash(s: CashSession): Cents {
  return s.movements.reduce((acc, m) => {
    if (m.kind === 'suprimento') return acc + m.amountCents
    if (m.kind === 'sangria') return acc - m.amountCents
    if (m.method !== 'dinheiro') return acc
    return m.kind === 'recebimento' ? acc + m.amountCents : acc - m.amountCents
  }, s.openingCents)
}

export function closeCash(tenantId: ID, sessionId: ID, countedCents: Cents, by: { id: ID; name: string }): CashSession {
  const s = db.update(tenantId, 'cashSessions', sessionId, (prev) => {
    if (prev.status !== 'aberto') throw new Error('Caixa já fechado.')
    return { ...prev, status: 'fechado', closedAt: nowISO(), countedCents }
  }) as CashSession
  audit(tenantId, { actorId: by.id, actorName: by.name, action: 'caixa.fechado', resource: 'cashSessions', resourceId: s.id, unitId: s.unitId, detail: `Diferença: ${(countedCents - expectedCash(s)) / 100}` })
  return s
}

/** Recebimento presencial: exige caixa aberto; registra pagamento na cobrança e movimento no caixa. */
export function receiveAtDesk(tenantId: ID, args: { chargeId: ID; amountCents: Cents; method: PaymentMethod; operator: { id: ID; name: string }; unitId: ID }) {
  const s = openSessionFor(tenantId, args.unitId, args.operator.id)
  if (!s) throw new Error('Abra o caixa antes de registrar recebimentos presenciais.')
  const charge = billingRepo.registerPayment(tenantId, args.chargeId, { amountCents: args.amountCents, method: args.method, provider: 'manual', receivedBy: args.operator.id, cashSessionId: s.id })
  db.update(tenantId, 'cashSessions', s.id, (prev) => ({ ...prev, movements: [...prev.movements, { id: uid('mv_'), at: nowISO(), kind: 'recebimento', amountCents: args.amountCents, method: args.method, chargeId: args.chargeId }] }))
  audit(tenantId, { actorId: args.operator.id, actorName: args.operator.name, action: 'recebimento', resource: 'charges', resourceId: args.chargeId, unitId: args.unitId, detail: `${args.amountCents / 100} via ${args.method}` })
  emit('payment.confirmed', { tenantId, charge, amountCents: args.amountCents })
  return charge
}
