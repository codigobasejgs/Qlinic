import { describe, it, expect } from 'vitest'
import {
  DECIDUOUS_LOWER, DECIDUOUS_UPPER, PERMANENT_LOWER, PERMANENT_UPPER, attachmentLevel, dentitionRows, faceAt, faceCode, faceLabel, isLabLate, isValidTooth,
  moveInRows, perioSummary, quadrantOf, emptyPerioTooth, transitionLab, validateEntry, validatePerioTooth, releaseBlockers, LAB_TRANSITIONS,
} from './odonto'
import { bmi, bmiBand, validateVitals, simulateEligibility, makeCardNumber, cardChecksumOk, addGlosa, appealGlosa, resolveAppeal, reconcile, registerGuidePayment, buildTissArtifact, transitionBatch, type Guide } from './medicine'
import type { LabOrder } from './types'

describe('FDI', () => {
  it('ordem visual: 18→11 | 21→28 em cima, 48→41 | 31→38 embaixo', () => {
    expect(PERMANENT_UPPER).toEqual([18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28])
    expect(PERMANENT_LOWER).toEqual([48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38])
    expect(DECIDUOUS_UPPER).toEqual([55, 54, 53, 52, 51, 61, 62, 63, 64, 65])
    expect(DECIDUOUS_LOWER).toEqual([85, 84, 83, 82, 81, 71, 72, 73, 74, 75])
  })
  it('32 permanentes + 20 decíduos únicos e válidos; inválidos rejeitados', () => {
    const all = [...PERMANENT_UPPER, ...PERMANENT_LOWER, ...DECIDUOUS_UPPER, ...DECIDUOUS_LOWER]
    expect(new Set(all).size).toBe(52)
    expect(all.every(isValidTooth)).toBe(true)
    for (const bad of [10, 19, 29, 56, 66, 76, 86, 90, 0, 9, 16.5]) expect(isValidTooth(bad)).toBe(false)
  })
  it('quadrantes', () => {
    expect([18, 21, 38, 41, 55, 61, 75, 81].map(quadrantOf)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
  it('mista: 4 linhas, decíduos entre permanentes', () => {
    expect(dentitionRows('mista').map((r) => r[0])).toEqual([18, 55, 85, 48])
  })
  it('faces: mesial voltada à linha média; palatina/lingual e oclusal/incisal', () => {
    expect(faceAt(16, 'right')).toBe('M') // lado direito do paciente → mesial à direita da tela
    expect(faceAt(26, 'left')).toBe('M')
    expect(faceAt(16, 'top')).toBe('V')
    expect(faceAt(36, 'top')).toBe('L')
    expect(faceLabel(16, 'L')).toBe('palatina')
    expect(faceLabel(36, 'L')).toBe('lingual')
    expect(faceLabel(16, 'O')).toBe('oclusal')
    expect(faceLabel(11, 'O')).toBe('incisal')
    expect(faceCode(21, 'O')).toBe('I')
    expect(faceCode(26, 'L')).toBe('P')
  })
  it('teclado: setas respeitam linha e linha média', () => {
    const rows = dentitionRows('permanente')
    expect(moveInRows(rows, 11, 'ArrowRight')).toBe(21)
    expect(moveInRows(rows, 18, 'ArrowLeft')).toBe(18)
    expect(moveInRows(rows, 16, 'ArrowDown')).toBe(46)
    expect(moveInRows(rows, 21, 'ArrowDown')).toBe(31)
    const mixed = dentitionRows('mista')
    expect(moveInRows(mixed, 11, 'ArrowDown')).toBe(51)
    expect(moveInRows(mixed, 18, 'ArrowDown')).toBe(55)
    expect(moveInRows(mixed, 28, 'ArrowDown')).toBe(65)
  })
  it('validação de marcação', () => {
    expect(validateEntry({ tooth: 16, faces: [], condition: 'carie', state: 'existente' })).toHaveLength(1)
    expect(validateEntry({ tooth: 16, faces: ['O'], condition: 'carie', state: 'existente' })).toEqual([])
    expect(validateEntry({ tooth: 16, faces: [], condition: 'carie', state: 'planejado', serviceId: 's' }).join()).toMatch(/não pode/)
    expect(validateEntry({ tooth: 36, faces: [], condition: 'coroa', state: 'planejado' }).join()).toMatch(/procedimento/)
    expect(validateEntry({ tooth: 19, faces: [], condition: 'ausente', state: 'existente' }).join()).toMatch(/FDI/)
  })
})

describe('Periodontograma', () => {
  it('nível de inserção = PS + recessão', () => {
    expect(attachmentLevel(4, 2)).toBe(6)
    expect(attachmentLevel(3, -1)).toBe(2)
    expect(attachmentLevel(null, 2)).toBeNull()
  })
  it('validações estruturais', () => {
    const d = emptyPerioTooth()
    d.sites[0] = { pd: 16, rec: -6, bleeding: false, suppuration: false }
    d.sites[1] = { pd: null, rec: null, bleeding: true, suppuration: false }
    d.mobility = 4
    const e = validatePerioTooth(11, { ...d, furcation: 1 })
    expect(e.some((x) => /0 a 15/.test(x))).toBe(true)
    expect(e.some((x) => /−5 a 15/.test(x))).toBe(true)
    expect(e.some((x) => /antes de sangramento/.test(x))).toBe(true)
    expect(e.some((x) => /mobilidade/i.test(x))).toBe(true)
    expect(e.some((x) => /unirradicular/.test(x))).toBe(true)
    expect(validatePerioTooth(16, { ...emptyPerioTooth(), furcation: 2 })).toEqual([])
    expect(validatePerioTooth(55, emptyPerioTooth()).length).toBe(1)
    expect(validatePerioTooth(16, { ...emptyPerioTooth(), missing: true, mobility: 1 }).join()).toMatch(/ausente/)
  })
  it('resumo: % sangramento e sítios ≥ 4 mm', () => {
    const a = emptyPerioTooth(), b = emptyPerioTooth()
    a.sites = a.sites.map((_, i) => ({ pd: i < 2 ? 5 : 2, rec: 1, bleeding: i < 3, suppuration: false }))
    const s = perioSummary({ teeth: { 16: a, 18: { ...b, missing: true } } })
    expect(s.sites).toBe(6)
    expect(s.bleedingPct).toBe(50)
    expect(s.deep4).toBe(2)
    expect(s.missing).toBe(1)
    expect(s.meanCal).toBe(4) // (5+1)*2 + (2+1)*4 = 24/6
  })
})

describe('Laboratório', () => {
  const base: LabOrder = { id: 'l', tenantId: 't', createdAt: '', patientId: 'p', lab: 'x', work: 'y', costCents: 100, requestedOn: '2026-01-01', dueOn: '2026-01-10', status: 'solicitado', history: [] }
  it('fluxo válido solicitado → enviado → recebido → ajuste → enviado → recebido → entregue', () => {
    let o = transitionLab(base, 'enviado', 'u')
    o = transitionLab(o, 'recebido', 'u')
    o = transitionLab(o, 'ajuste', 'u', 'Ajustar oclusão')
    o = transitionLab(o, 'enviado', 'u')
    o = transitionLab(o, 'recebido', 'u')
    o = transitionLab(o, 'entregue', 'u')
    expect(o.status).toBe('entregue')
    expect(o.history.map((h) => h.to)).toEqual(['enviado', 'recebido', 'ajuste', 'enviado', 'recebido', 'entregue'])
    expect(LAB_TRANSITIONS.entregue).toEqual([])
  })
  it('transições inválidas e motivo obrigatório', () => {
    expect(() => transitionLab(base, 'entregue', 'u')).toThrow(/inválida/)
    expect(() => transitionLab(base, 'cancelado', 'u')).toThrow(/motivo/)
    const r = transitionLab(transitionLab(base, 'enviado', 'u'), 'recebido', 'u')
    expect(() => transitionLab(r, 'ajuste', 'u', ' ')).toThrow(/ajuste/)
  })
  it('atraso', () => {
    expect(isLabLate(base, '2026-01-11')).toBe(true)
    expect(isLabLate(base, '2026-01-10')).toBe(false)
    expect(isLabLate({ ...base, status: 'recebido' }, '2026-02-01')).toBe(false)
  })
})

describe('Esterilização', () => {
  it('liberação exige indicadores informados e aprovados', () => {
    expect(releaseBlockers({ indicators: [{ kind: 'quimico', result: 'pendente' }], packages: [{ id: '1', kit: 'k', expiresOn: '2026-12-01' }] }).join()).toMatch(/pendente/)
    expect(releaseBlockers({ indicators: [{ kind: 'biologico', result: 'reprovado' }], packages: [] }).length).toBe(2)
    expect(releaseBlockers({ indicators: [{ kind: 'quimico', result: 'aprovado' }], packages: [{ id: '1', kit: 'k', expiresOn: '2026-12-01' }] })).toEqual([])
  })
})

describe('Medicina', () => {
  it('IMC', () => {
    expect(bmi(70, 175)).toBe(22.9)
    expect(bmi(72.4, 168)).toBe(25.7)
    expect(bmi(undefined, 170)).toBeNull()
    expect(bmi(70, 0)).toBeNull()
    expect(bmiBand(22.9)).toBe('18,5 a 24,9')
    expect(bmiBand(18.49)).toBe('abaixo de 18,5')
    expect(bmiBand(40)).toBe('40 ou mais')
  })
  it('sinais vitais: faixas plausíveis', () => {
    expect(validateVitals({ sys: 120, dia: 80, hr: 70 })).toEqual({})
    expect(validateVitals({ sys: 80, dia: 120 }).dia).toMatch(/menor/)
    expect(validateVitals({ sys: 120 }).form).toMatch(/juntas/)
    expect(validateVitals({ spo2: 101 }).spo2).toMatch(/faixa/)
    expect(validateVitals({}).form).toBeTruthy()
  })
})

describe('Convênios', () => {
  it('elegibilidade simulada determinística', () => {
    const ok = makeCardNumber('000012340000001')
    expect(cardChecksumOk(ok)).toBe(true)
    const payer = { carenciaDays: 30, active: true }
    expect(simulateEligibility({ cardNumber: ok, startDate: '2025-01-01', validUntil: '2027-01-01' }, payer, '2026-06-01').result).toBe('elegivel')
    expect(simulateEligibility({ cardNumber: ok, startDate: '2026-05-20', validUntil: '2027-01-01' }, payer, '2026-06-01').result).toBe('carencia')
    expect(simulateEligibility({ cardNumber: '0000 1234 0000 0049', startDate: '2025-01-01', validUntil: '2027-01-01' }, payer, '2026-06-01').result).toBe('carteira_invalida')
    expect(simulateEligibility({ cardNumber: ok, startDate: '2025-01-01', validUntil: '2026-01-01' }, payer, '2026-06-01').result).toBe('vencida')
  })
  it('glosa, recurso e conciliação', () => {
    let g: Guide = { id: 'g', tenantId: 't', createdAt: '', kind: 'consulta', number: 'G1', appointmentId: 'a', patientId: 'p', payerId: 'o', cardId: 'c', items: [{ serviceId: 's', code: 'X', description: 'Consulta', qty: 1, unitCents: 30000 }], status: 'enviada', paidCents: 0, glosas: [] }
    expect(() => addGlosa(g, 'x', 40000, 'gl')).toThrow(/exceder/)
    g = addGlosa(g, 'Código divergente', 9000, 'gl')
    expect(() => registerGuidePayment(g, 25000)).toThrow()
    g = registerGuidePayment(g, 21000)
    g = appealGlosa(g, 'gl', 'Código correto conforme tabela')
    expect(() => appealGlosa(g, 'gl', 'de novo')).toThrow()
    g = resolveAppeal(g, 'gl', true, 9000)
    expect(reconcile([g])).toEqual({ billed: 30000, paid: 21000, glosado: 0, pending: 9000 })
  })
  it('lote: transições e artefato marcado', () => {
    const b = { id: 'b', tenantId: 't', createdAt: '', payerId: 'o', number: 'LOTE-1', status: 'aberto' as const, guideIds: [], history: [] }
    expect(() => transitionBatch(b, 'fechado', 'u')).toThrow(/vazio/)
    expect(() => transitionBatch({ ...b, guideIds: ['g'] }, 'enviado', 'u')).toThrow()
    const a = buildTissArtifact({ ...b, guideIds: [] }, [], { id: 'o', tenantId: 't', createdAt: '', name: 'Op <&>', code: 'D', carenciaDays: 0, active: true, contact: '' }, 'Clínica', 'xml')
    expect(a.filename).toMatch(/DEMONSTRATIVO-NAO-HOMOLOGADO/)
    expect(a.content).toContain('DEMONSTRATIVO — NÃO HOMOLOGADO')
    expect(a.content).toContain('Op &lt;&amp;&gt;')
  })
})
