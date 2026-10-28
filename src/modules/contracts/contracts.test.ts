// QA da contratação SaaS: contratada fixa, partes, quadro dinâmico, placeholders, idempotência e ativação.
import { describe, it, expect, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { platformDb } from '@/data/store'
import { applyEnvelopeEvent, applyPaymentEvent, emptyContractor, emptySignatory, findPlaceholders, maskSectionsCpf, validateParties, type ContractorParty } from '@/domain/contracts'
import { sha256Hex } from '@/lib/sha256'
import { formatBRL } from '@/lib/money'
import { fakeCNPJ, fakeCPF, isValidCNPJ } from '@/lib/util'
import { acceptAndSign, freezeForReview, getContract, legalProfile, publishTemplate, reviseAfterSending, saveDraft, simulateEnvelope, startPayment, paymentEvent, reconcilePayment, currentTemplate } from './actions'

const store: Record<string, string> = {}
globalThis.sessionStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v }, removeItem: (k: string) => { delete store[k] } } as Storage

const actor = { id: 'pu_owner', name: 'Proprietário' }
const pj = (): ContractorParty => ({ ...emptyContractor(), kind: 'pj', legalName: 'Clínica Teste Ltda. (fictícia) com nome bem longo para quebrar linha no documento final', tradeName: 'Clínica Teste', document: fakeCNPJ(42).replace(/\D/g, ''), segment: 'odontologia', units: 1, address: { cep: '00000-000', street: 'Rua Fictícia', number: '10', complement: '', district: 'Centro', city: 'Cidade', uf: 'SP' }, email: 'contato@teste.exemplo.test', phone: '(00) 90000-0000' })
const sig = () => ({ name: 'Ana Exemplo Teste', document: fakeCPF(77).replace(/\D/g, ''), role: 'sócia-administradora', email: 'ana@teste.exemplo.test' })
const draft = (k = 'k1', trial = false) => saveDraft(k, { planId: 'plan_pro', cycle: 'anual', trial, contractor: pj(), signatory: sig() })
const ACC = { terms: true, powers: true, privacyNotice: true, marketing: false }

beforeEach(() => { store['qlinic.sim.payment'] = 'sucesso' })

describe('utilitários', () => {
  it('sha256 confere com node:crypto', () => {
    for (const s of ['', 'abc', 'contrato Qlinic — ção', 'x'.repeat(200)]) expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'))
  })
  it('CNPJ da contratada e CNPJ fictício são válidos', () => {
    expect(isValidCNPJ('59.760.458/0001-91')).toBe(true)
    expect(isValidCNPJ(fakeCNPJ(1))).toBe(true)
    expect(isValidCNPJ('59.760.458/0001-92')).toBe(false)
  })
})

describe('contratada', () => {
  it('pré-preenchida exatamente como o cadastro e sem nome fantasia/signatário presumido', () => {
    const p = legalProfile()
    expect(p.legalName).toBe('59.760.458 MARCO ANTONIO BOGGIAN')
    expect(p.taxId).toBe('59760458000191')
    expect(p.tradeNameRegistered).toBeNull()
    expect(p.authorizedSignatory).toBeNull()
    expect(p.tasks.some((t) => t.id === 'task_cnae' && t.status === 'aberta')).toBe(true)
  })
})

describe('partes', () => {
  it('PJ exige representante; PF não precisa de empresa nem representante', () => {
    expect(validateParties(pj(), sig(), 2)).toEqual({})
    expect(Object.keys(validateParties(pj(), emptySignatory(), 2))).toEqual(expect.arrayContaining(['sigName', 'sigDocument', 'sigRole', 'sigEmail']))
    const pf: ContractorParty = { ...pj(), kind: 'pf', legalName: 'Bruno Exemplo', tradeName: '', document: fakeCPF(9).replace(/\D/g, '') }
    expect(validateParties(pf, emptySignatory(), 2)).toEqual({})
  })
  it('rejeita documento real/inválido, e-mail acionável e unidades acima do plano', () => {
    const e = validateParties({ ...pj(), document: '59760458000191', email: 'a@gmail.com', units: 9 }, sig(), 2)
    expect(e.document).toMatch(/fictício/)
    expect(e.email).toBeTruthy()
    expect(e.units).toMatch(/até 2/)
  })
})

describe('documento', () => {
  it('sem colchetes/null/undefined/“a definir”, com contratada e valores do plano', () => {
    const c = freezeForReview(draft().id, 'k1')
    expect(findPlaceholders(c.snapshot!.sections)).toEqual([])
    const txt = JSON.stringify(c.snapshot!.sections)
    expect(txt).toContain('59.760.458/0001-91')
    expect(txt).toContain(formatBRL(499000))
    expect(txt).not.toMatch(/Qlinic Ltda|Código Base Ltda/)
    expect(c.snapshot!.sections.some((s) => s.title.startsWith('Anexo B'))).toBe(true)
  })
  it('lista mascara o CPF do representante', () => {
    const c = freezeForReview(draft().id, 'k1')
    const masked = JSON.stringify(maskSectionsCpf(c.snapshot!.sections, [c.signatory.document]))
    expect(masked).not.toContain(c.signatory.document.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'))
    expect(masked).toContain('***.')
  })
  it('mudança de plano após revisão invalida aceites e exige nova revisão', () => {
    const c = freezeForReview(draft().id, 'k1')
    const n = saveDraft('k1', { planId: 'plan_rede', cycle: 'anual', trial: false, contractor: pj(), signatory: sig() }, c.id)
    expect(n.status).toBe('draft')
    expect(n.snapshot).toBeUndefined()
    expect(() => acceptAndSign(n.id, 'k1', ACC)).toThrow(/Revise/)
  })
  it('aceites distintos são obrigatórios', () => {
    const c = freezeForReview(draft().id, 'k1')
    expect(() => acceptAndSign(c.id, 'k1', { ...ACC, powers: false })).toThrow(/poderes/)
    expect(() => acceptAndSign(c.id, 'k1', { ...ACC, terms: false })).toThrow(/concordância/)
  })
  it('outra sessão não acessa o rascunho', () => {
    const c = draft('dono')
    expect(() => freezeForReview(c.id, 'intruso')).toThrow(/outra sessão/)
  })
})

describe('assinatura e pagamento', () => {
  it('assinatura parcial ≠ concluída; pagamento não substitui assinatura; ativação após ambos', async () => {
    let c = freezeForReview(draft().id, 'k1')
    c = acceptAndSign(c.id, 'k1', ACC)
    expect(c.status).toBe('partially_signed')
    const again = acceptAndSign(c.id, 'k1', ACC) // duplo clique
    expect(again.envelopeId).toBe(c.envelopeId)
    expect(platformDb.list('signatureEnvelopes').filter((e) => e.contractId === c.id)).toHaveLength(1)
    c = await startPayment(c.id, 'k1')
    expect(c.payment.status).toBe('confirmed')
    expect(c.saasStatus).toBe('pending_activation')
    expect(c.tenantId).toBeNull()
    const dup = simulateEnvelope(c.id, 'replay', actor)
    expect(dup.result).toMatch(/Duplicado/)
    c = simulateEnvelope(c.id, 'sign_provider', actor).contract
    expect(c.status).toBe('signed')
    expect(c.saasStatus).toBe('active')
    expect(c.tenantId).toBeTruthy()
    const org = platformDb.list('organizations').find((o) => o.id === c.tenantId)!
    expect(org.planId).toBe('plan_pro')
    expect(org.legalName).toContain('Clínica Teste')
  })
  it('pagamento falho não ativa; timeout bloqueia nova cobrança até reconciliar', async () => {
    let c = acceptAndSign(freezeForReview(draft().id, 'k1').id, 'k1', ACC)
    c = simulateEnvelope(c.id, 'sign_provider', actor).contract
    expect(c.status).toBe('signed')
    store['qlinic.sim.payment'] = 'falha'
    c = await startPayment(c.id, 'k1')
    expect(c.payment.status).toBe('failed')
    expect(c.saasStatus).toBe('pending_activation')
    store['qlinic.sim.payment'] = 'timeout'
    c = await startPayment(c.id, 'k1')
    expect(c.payment.uncertain).toBe(true)
    await expect(startPayment(c.id, 'k1')).rejects.toThrow(/não pague de novo/)
    c = reconcilePayment(c.id, actor)
    expect(c.saasStatus).toBe('active')
    const before = c.payment.status
    c = paymentEvent(c.id, 'failed', 'pay_tardio', actor) // fora de ordem
    expect(c.payment.status).toBe(before)
    c = paymentEvent(c.id, 'refunded', 'pay_refund', actor)
    expect(c.payment.status).toBe('refunded')
    expect(getContract(c.id).status).toBe('signed') // estorno não apaga contrato
  })
  it('teste gratuito ativa sem cobrança após assinaturas', () => {
    let c = acceptAndSign(freezeForReview(draft('k1', true).id, 'k1').id, 'k1', ACC)
    expect(c.offer.billing).toBe('sem_cobranca_no_teste')
    c = simulateEnvelope(c.id, 'sign_provider', actor).contract
    expect(c.saasStatus).toBe('trialing')
    expect(c.payment.status).toBe('not_created')
  })
  it('recusa/expiração encerram; envelope cancelado não retoma e revisão gera nova versão', () => {
    const c = acceptAndSign(freezeForReview(draft().id, 'k1').id, 'k1', ACC)
    const d = simulateEnvelope(c.id, 'cancel', actor, 'teste de cancelamento').contract
    expect(d.status).toBe('voided')
    expect(simulateEnvelope(c.id, 'sign_provider', actor).contract.status).toBe('voided')
    const n = reviseAfterSending(c.id, 'k1')
    expect(n.status).toBe('draft')
    expect(getContract(c.id).status).toBe('superseded')
    expect(n.number).not.toBe(c.number)
  })
})

describe('eventos', () => {
  it('fora de ordem não regride; evento de outro contrato é ignorado', () => {
    const env = { id: 'e1', contractId: 'c1', provider: 'mock' as const, status: 'completed' as const, documentHash: 'h', signers: [], createdAt: '', expiresAt: '', processedEvents: [], events: [], simulated: true }
    expect(applyEnvelopeEvent(env, { eventId: 'x', envelopeId: 'e1', contractId: 'c1', type: 'sent', occurredAt: '' }).env.status).toBe('completed')
    expect(applyEnvelopeEvent({ ...env, status: 'sent' }, { eventId: 'y', envelopeId: 'e1', contractId: 'OUTRO', type: 'expired', occurredAt: '' }).result).toBe('ignorado')
    expect(applyPaymentEvent({ status: 'confirmed', provider: 'asaas', amountCents: 1, attempts: 1, processedEvents: [] }, { eventId: 'z', type: 'failed', at: '' }).payment.status).toBe('confirmed')
  })
})

describe('modelo', () => {
  it('publicação exige revisões marcadas; snapshot antigo não muda', () => {
    const c = freezeForReview(draft().id, 'k1')
    const hash = c.snapshot!.hash
    const tpl = currentTemplate()
    expect(() => publishTemplate(tpl.id, { legal: false, commercial: true, reviewer: 'Fulano Revisor' }, actor)).toThrow(/revisão jurídica/)
    publishTemplate(tpl.id, { legal: true, commercial: true, reviewer: 'Fulano Revisor' }, actor)
    expect(getContract(c.id).snapshot!.hash).toBe(hash)
  })
})
