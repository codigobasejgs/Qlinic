import { describe, it, expect } from 'vitest'
import { allocate, formatBRL, marginPercent, markupPercent, parseBRL, percentOf, priceFromMarkup, splitInstallments } from './money'
import { addDaysCivil, zonedParts, zonedToInstant, ageFromBirth } from './dates'
import { brandCssVars, contrast, deriveBrandTokens } from './color'
import { fakeCPF, isValidCPF, toCSV, parseCSV, abbreviateName } from './util'
import { can, scopeOf, allowedUnitIds } from '@/domain/permissions'

describe('dinheiro (centavos)', () => {
  it('parcelamento soma exatamente o total e joga resto na 1ª parcela', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333])
    for (const [t, n] of [[1, 3], [99999, 7], [380000, 12], [0, 2]]) expect(splitInstallments(t, n).reduce((a, b) => a + b, 0)).toBe(t)
    expect(() => splitInstallments(100, 0)).toThrow()
    expect(() => splitInstallments(100.5, 2)).toThrow()
  })
  it('rateio proporcional preserva total', () => {
    const r = allocate(1000, [1, 1, 1])
    expect(r.reduce((a, b) => a + b, 0)).toBe(1000)
    expect(allocate(1001, [50, 30, 20]).reduce((a, b) => a + b, 0)).toBe(1001)
  })
  it('parse/format BRL', () => {
    expect(parseBRL('1.234,56')).toBe(123456)
    expect(parseBRL('R$ 10')).toBe(1000)
    expect(parseBRL('10.5')).toBe(1050)
    expect(parseBRL('abc')).toBeNull()
    expect(formatBRL(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56')
  })
  it('percentual half-up, markup ≠ margem', () => {
    expect(percentOf(999, 10)).toBe(100)
    expect(priceFromMarkup(10000, 50)).toBe(15000)
    expect(markupPercent(15000, 10000)).toBeCloseTo(50)
    expect(marginPercent(15000, 10000)).toBeCloseTo(33.333, 2)
  })
})

describe('datas e fusos', () => {
  it('converte civil+minutos no fuso para UTC e volta', () => {
    const iso = zonedToInstant('2026-10-27', 9 * 60, 'America/Sao_Paulo')
    expect(iso).toBe('2026-10-27T12:00:00.000Z')
    const p = zonedParts(iso, 'America/Sao_Paulo')
    expect(p.date).toBe('2026-10-27')
    expect(p.minutesOfDay).toBe(540)
  })
  it('fusos diferentes da unidade', () => {
    expect(zonedToInstant('2026-10-27', 9 * 60, 'America/Manaus')).toBe('2026-10-27T13:00:00.000Z')
  })
  it('data civil sem fuso', () => {
    expect(addDaysCivil('2026-12-31', 1)).toBe('2027-01-01')
    expect(ageFromBirth('2010-10-28', '2026-10-27')).toBe(15)
    expect(ageFromBirth('2010-10-27', '2026-10-27')).toBe(16)
  })
})

describe('cores acessíveis da marca do cliente', () => {
  it('cor clara nunca recebe texto branco', () => {
    for (const c of ['#FDE047', '#A7F3D0', '#FFFFFF', '#5EEAD4']) {
      const t = deriveBrandTokens(c, 'light')
      expect(contrast(t.primary, t.onPrimary)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('dark mantém contraste do botão', () => {
    for (const c of ['#102A43', '#0D9488', '#7C3AED', '#000000']) {
      const t = deriveBrandTokens(c, 'dark')
      expect(contrast(t.primary, t.onPrimary)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.primaryText, '#102632')).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('texto de marca sobre fundo suave atinge 4,5:1 em qualquer cor do cliente', () => {
    for (const c of ['#0D9488', '#2563EB', '#EA580C', '#FDE047', '#BE185D', '#4D7C0F'])
      for (const m of ['light', 'dark'] as const) {
        const v = brandCssVars(c, m)
        expect(contrast(v['--q-on-soft'], v['--q-primary-soft'])).toBeGreaterThanOrEqual(4.5)
      }
    expect(contrast('#06675F', '#E6F4F2')).toBeGreaterThanOrEqual(4.5) // token Qlinic light
  })
  it('tokens Qlinic registrados em docs/contraste.json conferem', () => {
    expect(contrast('#FFFFFF', '#087F75')).toBeCloseTo(4.88, 1)
    expect(contrast('#102A43', '#5EEAD4')).toBeCloseTo(9.9, 1)
  })
})

describe('util', () => {
  it('CPF fictício é válido no dígito verificador', () => {
    for (let i = 0; i < 50; i++) expect(isValidCPF(fakeCPF(i * 37))).toBe(true)
    expect(isValidCPF('111.111.111-11')).toBe(false)
  })
  it('CSV neutraliza formula injection e faz round-trip', () => {
    const csv = toCSV([{ nome: '=HYPERLINK("x")', v: '+1', ok: 'Ana; Maria' }])
    expect(csv).toContain(`'=HYPERLINK`)
    expect(csv).toContain(`'+1`)
    const rows = parseCSV(csv)
    expect(rows[1][2]).toBe('Ana; Maria')
  })
  it('nome abreviado para painel', () => {
    expect(abbreviateName('Maria Souza Lima')).toBe('Maria L.')
  })
})

describe('permissões demonstrativas', () => {
  const reception = { memberships: [{ role: 'reception' as const, unitIds: ['u1'] }] }
  const pro = { memberships: [{ role: 'professional' as const, unitIds: ['u1', 'u2'] }], professionalId: 'p1' }
  const owner = { memberships: [{ role: 'clinic_owner' as const, unitIds: 'all' as const }] }
  it('recepção não lê clínico nem restrito', () => {
    expect(can(reception, { resource: 'clinical', action: 'read', unitId: 'u1' })).toBe(false)
    expect(can(reception, { resource: 'clinical_restricted', action: 'read' })).toBe(false)
    expect(can(reception, { resource: 'agenda', action: 'create', unitId: 'u1' })).toBe(true)
    expect(can(reception, { resource: 'agenda', action: 'approve', unitId: 'u1' })).toBe(false) // encaixe com conflito: só gestão
  })
  it('unidade fora do vínculo é negada', () => {
    expect(can(reception, { resource: 'agenda', action: 'read', unitId: 'u2' })).toBe(false)
    expect(allowedUnitIds(reception, ['u1', 'u2'])).toEqual(['u1'])
    expect(allowedUnitIds(owner, ['u1', 'u2'])).toEqual(['u1', 'u2'])
  })
  it('profissional: escopo próprio', () => {
    expect(scopeOf(pro, 'clinical')).toBe('own')
    expect(can(pro, { resource: 'clinical', action: 'update', ownerProfessionalId: 'p1' })).toBe(true)
    expect(can(pro, { resource: 'clinical', action: 'update', ownerProfessionalId: 'p2' })).toBe(false)
  })
  it('proprietário não tem leitura de restrito (psicologia) por padrão', () => {
    expect(can(owner, { resource: 'clinical_restricted', action: 'read' })).toBe(false)
  })
})
