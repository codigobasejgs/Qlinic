import { describe, it, expect } from 'vitest'
import type { ClinicDocument, ClinicalRecord, Proposal } from '@/domain/types'
import type { FormField } from '@/domain/modules'
import { validateSelection, proposalTotals } from '@/domain/proposals'
import { appointmentActions, chooseAlternative, cleanAnswers, defaultSelection, portalDocuments, portalGuidance, toggleItem, validateForm } from './lib'

const H = 3_600_000
const NOW = Date.parse('2026-10-27T12:00:00Z')
const at = (h: number) => new Date(NOW + h * H).toISOString()
const W = { cancelWindowHours: 24, rescheduleWindowHours: 12 }

describe('janela de cancelamento/reagendamento', () => {
  it('fora das duas janelas: pode cancelar e reagendar', () => {
    const r = appointmentActions({ start: at(48), status: 'confirmada' }, NOW, W)
    expect(r.canCancel && r.canReschedule).toBe(true)
  })
  it('entre as janelas: reagenda mas não cancela', () => {
    const r = appointmentActions({ start: at(18), status: 'confirmada' }, NOW, W)
    expect(r.canCancel).toBe(false)
    expect(r.cancelBlocked).toMatch(/24 h/)
    expect(r.canReschedule).toBe(true)
  })
  it('dentro das duas janelas: bloqueia ambos com a regra', () => {
    const r = appointmentActions({ start: at(2), status: 'confirmada' }, NOW, W)
    expect(r.canCancel || r.canReschedule).toBe(false)
    expect(r.rescheduleBlocked).toMatch(/12 h/)
  })
  it('limite exato da janela é permitido', () => {
    expect(appointmentActions({ start: at(24), status: 'confirmada' }, NOW, W).canCancel).toBe(true)
  })
  it('passada, concluída ou cancelada nunca altera; vínculo sem canSchedule bloqueia', () => {
    expect(appointmentActions({ start: at(-2), status: 'confirmada' }, NOW, W).canCancel).toBe(false)
    expect(appointmentActions({ start: at(72), status: 'cancelada' }, NOW, W).canReschedule).toBe(false)
    expect(appointmentActions({ start: at(72), status: 'chegou' }, NOW, W).canCancel).toBe(false)
    const r = appointmentActions({ start: at(72), status: 'aguardando_confirmacao' }, NOW, W, false)
    expect(r.canCancel || r.canReschedule || r.canConfirm).toBe(false)
  })
  it('confirmar só quando aguardando confirmação', () => {
    expect(appointmentActions({ start: at(5), status: 'aguardando_confirmacao' }, NOW, W).canConfirm).toBe(true)
    expect(appointmentActions({ start: at(5), status: 'confirmada' }, NOW, W).canConfirm).toBe(false)
  })
})

const sig = { status: 'nao_requerida' as const, provider: 'demonstracao' as const, signers: [], trail: [] }
const doc = (id: string, patch: Partial<ClinicDocument>): ClinicDocument => ({ id, tenantId: 't', createdAt: at(-1), patientId: 'p1', kind: 'orientacao', title: id, body: 'b', status: 'emitido', releasedToPortal: true, confidentiality: 'padrao', signature: sig, createdBy: 'pro', demoWatermark: true, ...patch })
const rec = (id: string, patch: Partial<ClinicalRecord>): ClinicalRecord => ({ id, tenantId: 't', createdAt: at(-5), patientId: 'p1', professionalId: 'pro', specialty: 'medicina', templateId: 'x', templateVersion: 1, title: 'T', content: { s: 'NOTA INTERNA' }, status: 'finalizado', addenda: [], confidentiality: 'padrao', releasedToPortal: true, portalGuidance: 'Beber água.', history: [], ...patch })
const ALL = { canSeeClinical: true, canSeeFinancial: true, canSchedule: true }

describe('visibilidade do portal', () => {
  const docs = [
    doc('ok', {}), doc('nao_liberado', { releasedToPortal: false }), doc('rascunho', { status: 'rascunho' }), doc('outro_paciente', { patientId: 'p2' }),
    doc('restrito_nao_liberado', { confidentiality: 'restrito', releasedToPortal: false }), doc('recibo', { kind: 'recibo' }),
  ]
  it('documentos não liberados, rascunhos e de outro paciente nunca aparecem', () => {
    expect(portalDocuments(docs, 'p1', ALL).map((d) => d.id).sort()).toEqual(['ok', 'recibo'])
  })
  it('clínico e financeiro separados pelo vínculo', () => {
    expect(portalDocuments(docs, 'p1', { ...ALL, canSeeClinical: false }).map((d) => d.id)).toEqual(['recibo'])
    expect(portalDocuments(docs, 'p1', { ...ALL, canSeeFinancial: false }).map((d) => d.id)).toEqual(['ok'])
  })
  it('registros: só portalGuidance de liberados/finalizados/não restritos — nunca o conteúdo', () => {
    const recs = [rec('a', {}), rec('b', { releasedToPortal: false }), rec('c', { confidentiality: 'restrito' }), rec('d', { status: 'rascunho' }), rec('e', { portalGuidance: '  ' }), rec('f', { patientId: 'p2' })]
    const g = portalGuidance(recs, 'p1', ALL)
    expect(g.map((x) => x.id)).toEqual(['a'])
    expect(JSON.stringify(g)).not.toContain('NOTA INTERNA')
    expect(portalGuidance(recs, 'p1', { ...ALL, canSeeClinical: false })).toEqual([])
  })
})

const prop: Proposal = {
  id: 'pr', tenantId: 't', createdAt: at(0), unitId: 'u', patientId: 'p1', number: 'ORC-1', version: 1, token: 'demo-xxxxxxxx', validUntil: '2099-01-01', maxInstallments: 6, conditions: '', maxDiscountPercent: 10,
  status: 'enviada', acceptedItemIds: [], questions: [], history: [], chargeIds: [],
  items: [
    { id: 'm1', serviceId: 's', description: 'Obrigatório', qty: 1, unitCents: 10000, discountCents: 1000 },
    { id: 'a1', serviceId: 's', description: 'Coroa', qty: 1, unitCents: 200000, discountCents: 0, optionGroup: 'g' },
    { id: 'a2', serviceId: 's', description: 'Implante', qty: 1, unitCents: 380000, discountCents: 0, optionGroup: 'g' },
    { id: 'o1', serviceId: 's', description: 'Clareamento', qty: 1, unitCents: 95000, discountCents: 0, optional: true },
  ],
}

describe('seleção de alternativas da proposta', () => {
  it('padrão: só obrigatórios', () => { expect(defaultSelection(prop)).toEqual(['m1']) })
  it('rádio por grupo troca a alternativa sem acumular', () => {
    let s = chooseAlternative(prop, ['m1'], 'g', 'a1')
    s = chooseAlternative(prop, s, 'g', 'a2')
    expect(s.sort()).toEqual(['a2', 'm1'])
    expect(validateSelection(prop, s)).toEqual([])
    expect(chooseAlternative(prop, s, 'g', null)).toEqual(['m1'])
  })
  it('duas alternativas do mesmo grupo são inválidas (regra de domínio)', () => {
    expect(validateSelection(prop, ['m1', 'a1', 'a2']).length).toBeGreaterThan(0)
  })
  it('toggle não mexe em alternativas e totais refletem a escolha', () => {
    expect(toggleItem(prop, ['m1'], 'a1', true)).toEqual(['m1'])
    const s = toggleItem(prop, chooseAlternative(prop, ['m1'], 'g', 'a1'), 'o1', true)
    expect(proposalTotals(prop, s)).toEqual({ gross: 305000, discount: 1000, net: 304000, count: 3 })
  })
  it('item já aceito não pode ser desmarcado', () => {
    const p = { ...prop, acceptedItemIds: ['m1'] }
    expect(toggleItem(p, ['m1'], 'm1', false)).toEqual(['m1'])
  })
})

describe('formulário', () => {
  const fields: FormField[] = [
    { id: 'fuma', type: 'boolean', label: 'Fuma?', required: true },
    { id: 'quanto', type: 'number', label: 'Cigarros/dia', required: true, min: 1, max: 60, showIf: { fieldId: 'fuma', equals: 'sim' } },
    { id: 'obs', type: 'textarea', label: 'Obs' },
  ]
  it('obrigatório + showIf + faixa numérica', () => {
    expect(Object.keys(validateForm(fields, {}))).toEqual(['fuma'])
    expect(validateForm(fields, { fuma: false })).toEqual({})
    expect(Object.keys(validateForm(fields, { fuma: true }))).toEqual(['quanto'])
    expect(validateForm(fields, { fuma: true, quanto: '99' }).quanto).toMatch(/máximo/)
  })
  it('respostas de campos ocultos não são enviadas', () => {
    expect(cleanAnswers(fields, { fuma: false, quanto: '10' })).toEqual({ fuma: false })
  })
})
