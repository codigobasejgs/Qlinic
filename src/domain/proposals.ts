// Regras de orçamento/proposta (puras + aplicação no store). Usadas pelo CRM (equipe) e pelo link público/portal.
// Aceite parcial atualiza o plano de tratamento SEM duplicar cobranças (chargeIds controlam idempotência).
import type { Charge, ID, Proposal, ProposalItem } from './types'
import { db } from '@/data/store'
import { splitInstallments, type Cents } from '@/lib/money'
import { addDaysCivil, nowISO, todayCivil } from '@/lib/dates'
import { uid } from '@/lib/util'
import { notificationProvider, audit } from '@/data/repositories'

export function itemTotal(i: ProposalItem): Cents {
  return Math.max(0, i.qty * i.unitCents - i.discountCents)
}
export function proposalTotals(p: Proposal, selected?: ID[]) {
  const ids = selected ?? p.items.filter((i) => !i.optional && !i.optionGroup).map((i) => i.id)
  const chosen = p.items.filter((i) => ids.includes(i.id))
  const gross = chosen.reduce((a, i) => a + i.qty * i.unitCents, 0)
  const discount = chosen.reduce((a, i) => a + i.discountCents, 0)
  return { gross, discount, net: gross - discount, count: chosen.length }
}

export interface SelectionError { message: string }
/** Valida seleção: no máximo uma alternativa por optionGroup; desconto dentro do limite; itens existentes. */
export function validateSelection(p: Proposal, selected: ID[]): SelectionError[] {
  const errs: SelectionError[] = []
  const groups = new Map<string, number>()
  for (const id of selected) {
    const it = p.items.find((i) => i.id === id)
    if (!it) { errs.push({ message: 'Item inexistente na proposta.' }); continue }
    if (it.optionGroup) groups.set(it.optionGroup, (groups.get(it.optionGroup) ?? 0) + 1)
  }
  for (const [g, n] of groups) if (n > 1) errs.push({ message: `Escolha apenas uma alternativa no grupo "${g}".` })
  if (selected.length === 0) errs.push({ message: 'Selecione ao menos um item.' })
  return errs
}
export function validateDiscounts(p: Proposal): SelectionError[] {
  const errs: SelectionError[] = []
  for (const i of p.items) {
    const gross = i.qty * i.unitCents
    if (i.discountCents < 0) errs.push({ message: `Desconto negativo em "${i.description}".` })
    if (gross > 0 && (i.discountCents / gross) * 100 > p.maxDiscountPercent + 1e-9) errs.push({ message: `Desconto acima do permitido (${p.maxDiscountPercent}%) em "${i.description}".` })
  }
  return errs
}

export function isExpired(p: Proposal, today = todayCivil()) {
  return p.validUntil < today
}

/**
 * Aceita (total ou parcial) uma proposta.
 * - Itens aceitos → TreatmentItem 'aprovado'; não aceitos → 'recusado'.
 * - Gera cobranças apenas para itens ainda SEM cobrança (idempotente: repetir não duplica).
 */
export function acceptProposal(tenantId: ID, proposalId: ID, selected: ID[], installments: number, by: string, signature?: Proposal['signature']): { proposal: Proposal; charges: Charge[] } {
  const p = db.get(tenantId, 'proposals', proposalId)
  if (!p) throw new Error('Proposta não encontrada.')
  if (['revogada', 'recusada', 'expirada'].includes(p.status)) throw new Error(`Proposta ${p.status}: não pode ser aceita.`)
  if (isExpired(p)) throw new Error('Proposta expirada. Solicite nova versão à clínica.')
  const errs = validateSelection(p, selected)
  if (errs.length) throw new Error(errs.map((e) => e.message).join(' '))
  if (!Number.isInteger(installments) || installments < 1 || installments > p.maxInstallments) throw new Error(`Parcelamento permitido: 1 a ${p.maxInstallments}x.`)

  const alreadyCharged = new Set(p.acceptedItemIds)
  const newItems = selected.filter((id) => !alreadyCharged.has(id))
  const amount = p.items.filter((i) => newItems.includes(i.id)).reduce((a, i) => a + itemTotal(i), 0)
  const charges: Charge[] = []
  if (amount > 0) {
    const groupId = uid('grp_')
    const today = todayCivil()
    splitInstallments(amount, installments).forEach((amt, k) => charges.push({
      id: uid('ch_'), tenantId, createdAt: nowISO(), unitId: p.unitId, patientId: p.patientId, payerPersonId: p.financialResponsibleId,
      origin: { kind: 'proposta', refId: p.id }, description: `${p.number} v${p.version} — parcela ${k + 1}/${installments}`,
      competenceDate: today, dueDate: addDaysCivil(today, k * 30), amountCents: amt, adjustmentsCents: 0,
      installment: { n: k + 1, of: installments, groupId }, status: 'aberta', payments: [], refunds: [], professionalId: p.professionalId, category: 'Tratamentos',
    }))
    db.set(tenantId, 'charges', [...db.list(tenantId, 'charges'), ...charges])
  }
  const allAccepted = Array.from(new Set([...p.acceptedItemIds, ...selected]))
  const mandatory = p.items.filter((i) => !i.optional && !i.optionGroup).map((i) => i.id)
  const groups = Array.from(new Set(p.items.filter((i) => i.optionGroup).map((i) => i.optionGroup!)))
  const full = mandatory.every((id) => allAccepted.includes(id)) && groups.every((g) => p.items.some((i) => i.optionGroup === g && allAccepted.includes(i.id)))
  const status = full ? 'aceita' : 'aceita_parcial'
  const updated = db.update(tenantId, 'proposals', p.id, {
    status, acceptedItemIds: allAccepted, chosenInstallments: installments, chargeIds: [...p.chargeIds, ...charges.map((c) => c.id)], signature: signature ?? p.signature,
    history: [...p.history, { at: nowISO(), from: p.status, to: status, by, reason: `${selected.length} item(ns) aceito(s)` }],
  }) as Proposal
  // Plano de tratamento
  const tis = db.list(tenantId, 'treatmentItems')
  db.set(tenantId, 'treatmentItems', tis.map((t) => {
    const pi = p.items.find((i) => i.treatmentItemId === t.id)
    if (!pi) return t
    if (allAccepted.includes(pi.id)) return t.status === 'orcado' || t.status === 'planejado' || t.status === 'recusado' ? { ...t, status: 'aprovado' } : t
    return t.status === 'orcado' ? { ...t, status: 'recusado' } : t
  }))
  audit(tenantId, { actorId: by, actorName: by, action: 'proposta.aceite', resource: 'proposals', resourceId: p.id, detail: `${status}; ${charges.length} cobrança(s) gerada(s)` })
  const patient = db.get(tenantId, 'patients', p.patientId)
  if (patient?.personId) notificationProvider.enqueue(tenantId, { event: 'aceite', channel: 'email', recipientName: patient.name, recipientRef: patient.personId, subject: `Aceite registrado — ${p.number}`, preview: 'Recebemos seu aceite. Acompanhe no portal.', dedupeKey: `aceite:${p.id}:${allAccepted.join(',')}` })
  return { proposal: updated, charges }
}

export function rejectProposal(tenantId: ID, proposalId: ID, by: string, reason: string) {
  const p = db.get(tenantId, 'proposals', proposalId)
  if (!p) throw new Error('Proposta não encontrada.')
  if (p.status === 'aceita' || p.status === 'aceita_parcial') throw new Error('Proposta já aceita; para alterar, crie nova versão.')
  return db.update(tenantId, 'proposals', p.id, { status: 'recusada', history: [...p.history, { at: nowISO(), from: p.status, to: 'recusada', by, reason }] }) as Proposal
}

/** Nova versão: copia itens, incrementa versão, revoga a anterior (link antigo deixa de aceitar). */
export function newProposalVersion(tenantId: ID, proposalId: ID, by: string): Proposal {
  const p = db.get(tenantId, 'proposals', proposalId)
  if (!p) throw new Error('Proposta não encontrada.')
  if (p.chargeIds.length) throw new Error('Proposta com cobranças geradas: crie um novo orçamento para itens adicionais.')
  db.update(tenantId, 'proposals', p.id, { status: 'revogada', history: [...p.history, { at: nowISO(), from: p.status, to: 'revogada', by, reason: 'Substituída por nova versão' }] })
  const next: Proposal = { ...p, id: uid('prop_'), version: p.version + 1, token: `demo-${uid()}${uid()}`, status: 'rascunho', acceptedItemIds: [], chargeIds: [], questions: [], createdAt: nowISO(), history: [{ at: nowISO(), from: null, to: 'rascunho', by, reason: `Versão ${p.version + 1} criada a partir da v${p.version}` }] }
  db.insert(tenantId, 'proposals', next)
  return next
}

/** Busca proposta por token opaco em qualquer tenant demo (link público). Produção: validação no servidor. */
export function findProposalByToken(tenantId: ID, token: string): Proposal | undefined {
  return db.list(tenantId, 'proposals').find((p) => p.token === token)
}
