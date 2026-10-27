// Regras de domínio da fundação contra o store em memória (tenant demo real do seed).
import { describe, it, expect, beforeAll } from 'vitest'
import '@/data/platformSeed'
import '@/domain/modules'
import { db } from '@/data/store'
import { acceptProposal, proposalTotals, validateSelection } from './proposals'
import { billingRepo, chargeBalance, clinicalRepo, notificationProvider } from '@/data/repositories'
import { createAppointment, changeAppointmentStatus, issueCheckInToken, checkInWithToken } from './appointments'
import { canTransition } from './scheduling'
import { addDaysCivil, todayCivil, zonedToInstant } from '@/lib/dates'

const T = 'org_sorriso'

beforeAll(() => {
  // força seed
  db.list(T, 'appointments')
  db.list(T, 'proposals')
})

describe('isolamento por tenant', () => {
  it('coleções são separadas por tenant', () => {
    const a = db.list('org_sorriso', 'patients').map((p) => p.tenantId)
    const b = db.list('org_vet', 'patients').map((p) => p.tenantId)
    expect(new Set(a)).toEqual(new Set(['org_sorriso']))
    expect(new Set(b)).toEqual(new Set(['org_vet']))
  })
  it('tenant não-demo não recebe seed', () => {
    expect(db.list('org_odontomais', 'patients')).toHaveLength(0)
  })
  it('tutor com dois animais na veterinária', () => {
    const links = db.list('org_vet', 'links').filter((l) => l.personId === 'org_vet_per1' && l.relation === 'tutor')
    expect(links.map((l) => l.patientId).sort()).toEqual(['org_vet_pat1', 'org_vet_pat2'])
  })
})

describe('proposta: aceite parcial sem duplicar cobrança', () => {
  it('valida alternativas exclusivas', () => {
    const p = db.get(T, 'proposals', `${T}_prop1`)!
    const group = p.items.filter((i) => i.optionGroup)
    expect(validateSelection(p, group.map((i) => i.id)).length).toBeGreaterThan(0)
  })
  it('aceite parcial gera cobrança só uma vez', () => {
    const p = db.get(T, 'proposals', `${T}_prop1`)!
    const first = p.items[0].id
    const before = db.list(T, 'charges').length
    const r1 = acceptProposal(T, p.id, [first], 2, 'teste')
    expect(r1.proposal.status).toBe('aceita_parcial')
    expect(r1.charges).toHaveLength(2)
    expect(r1.charges.reduce((a, c) => a + c.amountCents, 0)).toBe(proposalTotals(p, [first]).net)
    const r2 = acceptProposal(T, p.id, [first], 2, 'teste')
    expect(r2.charges).toHaveLength(0)
    expect(db.list(T, 'charges').length).toBe(before + 2)
    const ti = db.get(T, 'treatmentItems', p.items[0].treatmentItemId!)!
    expect(ti.status).toBe('aprovado')
  })
})

describe('financeiro: parcial, quitação, estorno', () => {
  it('fluxo completo sem apagar movimento liquidado', () => {
    const c = db.list(T, 'charges').find((x) => x.status === 'aberta' && x.payments.length === 0)!
    const half = Math.floor(c.amountCents / 2)
    let ch = billingRepo.registerPayment(T, c.id, { amountCents: half, method: 'pix', provider: 'manual', receivedBy: 'x' })
    expect(ch.status).toBe('parcial')
    expect(() => billingRepo.registerPayment(T, c.id, { amountCents: c.amountCents, method: 'pix', provider: 'manual', receivedBy: 'x' })).toThrow()
    ch = billingRepo.registerPayment(T, c.id, { amountCents: chargeBalance(ch), method: 'dinheiro', provider: 'manual', receivedBy: 'x' })
    expect(ch.status).toBe('paga')
    ch = billingRepo.refund(T, c.id, ch.payments[1].id, ch.payments[1].amountCents, 'teste', 'estorno')
    expect(ch.status).toBe('parcial')
    expect(ch.payments).toHaveLength(2) // nada apagado
    expect(() => billingRepo.refund(T, c.id, ch.payments[0].id, ch.payments[0].amountCents + 1, 'x', 'estorno')).toThrow()
  })
  it('idempotência por providerPaymentId', () => {
    const c = db.list(T, 'charges').find((x) => x.status === 'aberta' && x.payments.length === 0)!
    billingRepo.registerPayment(T, c.id, { amountCents: 100, method: 'pix', provider: 'asaas', receivedBy: 'w', providerPaymentId: 'evt1' })
    const again = billingRepo.registerPayment(T, c.id, { amountCents: 100, method: 'pix', provider: 'asaas', receivedBy: 'w', providerPaymentId: 'evt1' })
    expect(again.payments.filter((p) => p.providerPaymentId === 'evt1')).toHaveLength(1)
  })
})

describe('agenda', () => {
  it('impede conflito de profissional e aceita com reconhecimento', () => {
    const date = addDaysCivil(todayCivil(), 30)
    const unit = db.get(T, 'units', `${T}_u1`)!
    // encontra dia útil com jornada do pro1 na u1
    let d = date
    const pro = db.get(T, 'professionals', `${T}_pro1`)!
    for (let i = 0; i < 7; i++) { const wd = new Date(d + 'T12:00:00Z').getUTCDay(); if (pro.schedule.some((s) => s.unitId === unit.id && s.weekday === wd)) break; d = addDaysCivil(d, 1) }
    const svc = db.get(T, 'services', `${T}_svc1`)!
    const chair = db.list(T, 'resources').find((r) => r.unitId === unit.id && r.kind === 'cadeira')!
    const start = zonedToInstant(d, 10 * 60, unit.timezone)
    const end = zonedToInstant(d, 10 * 60 + svc.durationMin, unit.timezone)
    const base = { unitId: unit.id, patientId: `${T}_pat2`, professionalId: pro.id, serviceId: svc.id, resourceIds: [chair.id], start, end, source: 'recepcao' as const }
    // limpa o horário
    db.set(T, 'appointments', db.list(T, 'appointments').filter((a) => !(a.professionalId === pro.id && a.start.slice(0, 10) === start.slice(0, 10))))
    const a = createAppointment(T, base, 'teste')
    expect(() => createAppointment(T, { ...base, patientId: `${T}_pat3` }, 'teste')).toThrow(/Profissional já ocupado/)
    const enc = createAppointment(T, { ...base, patientId: `${T}_pat3`, resourceIds: [], acknowledgeConflicts: true }, 'gestor')
    expect(enc.conflictAcknowledged).toBe(true)
    expect(canTransition('concluida', 'cancelada')).toBe(false)
    expect(() => changeAppointmentStatus(T, a.id, 'concluida', 'x')).toThrow(/Transição inválida/)
    expect(() => changeAppointmentStatus(T, a.id, 'cancelada', 'x')).toThrow(/motivo/)
  })
  it('check-in por token: uso único', () => {
    const a = db.list(T, 'appointments').find((x) => x.status === 'confirmada')!
    const withTok = issueCheckInToken(T, a.id)
    const r = checkInWithToken(T, withTok.checkIn!.token)
    expect(r.ticket).toMatch(/^A\d{3}$/)
    expect(r.appointment.status).toBe('chegou')
    expect(() => checkInWithToken(T, withTok.checkIn!.token)).toThrow(/utilizado/)
  })
})

describe('prontuário', () => {
  it('finalizado não é sobrescrito; correção por adendo', () => {
    const r = db.list(T, 'records').find((x) => x.status === 'finalizado')!
    expect(() => clinicalRepo.save(T, { ...r, content: { x: 1 } })).toThrow(/adendo/)
    const up = clinicalRepo.addAddendum(T, r.id, { authorId: 'p', authorName: 'P', reason: 'Correção', text: 'Texto' })
    expect(up.addenda).toHaveLength(1)
    expect(() => clinicalRepo.addAddendum(T, r.id, { authorId: 'p', authorName: 'P', reason: '', text: 'x' })).toThrow()
  })
})

describe('comunicação', () => {
  it('deduplica por chave e respeita opt-out', () => {
    const m1 = notificationProvider.enqueue(T, { event: 'lembrete', channel: 'email', recipientName: 'X', recipientRef: `${T}_per2`, subject: 's', preview: 'p', dedupeKey: 'k1' })
    const m2 = notificationProvider.enqueue(T, { event: 'lembrete', channel: 'email', recipientName: 'X', recipientRef: `${T}_per2`, subject: 's', preview: 'p', dedupeKey: 'k1' })
    expect(m1.status).toBe('pendente')
    expect(m2.status).toBe('duplicado')
    const m3 = notificationProvider.enqueue(T, { event: 'lembrete', channel: 'push', recipientName: 'X', recipientRef: `${T}_per2`, subject: 's', preview: 'p', dedupeKey: 'k2' })
    expect(m3.status).toBe('suprimido')
  })
})
