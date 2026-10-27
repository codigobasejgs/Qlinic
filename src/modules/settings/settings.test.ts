// Regras do módulo de configurações: herança rede → unidade, importador e derivação de marca.
import { describe, it, expect } from 'vitest'
import { db } from '@/data/store'
import { getPolicies, overriddenPaths, DEFAULT_POLICIES } from '@/domain/settings'
import { contrast, deriveBrandTokens } from '@/lib/color'
import { fakeCPF, toCSV } from '@/lib/util'
import { policySource, restorePolicy, savePolicies } from './lib'
import { brandReport } from './lib'
import { autoMap, commitImport, readTable, summarize, undoImport, validateRows, errorReport, parseCivilDate } from './importer'

const actor = { id: 'u_test', name: 'Teste' }

describe('herança de políticas', () => {
  const T = 't_pol'
  it('rede sobrescreve padrão; unidade sobrescreve só as chaves gravadas', () => {
    savePolicies(T, null, { 'booking.cancelWindowHours': 48, 'privacy.callPanelMode': 'senha' })
    savePolicies(T, 'u2', { 'booking.cancelWindowHours': 12 })
    expect(getPolicies(T, null).booking.cancelWindowHours).toBe(48)
    expect(getPolicies(T, 'u2').booking.cancelWindowHours).toBe(12)
    // demais campos herdam
    expect(getPolicies(T, 'u2').booking.minAdvanceHours).toBe(DEFAULT_POLICIES.booking.minAdvanceHours)
    expect(overriddenPaths(T, 'u2')).toEqual(['booking.cancelWindowHours'])
    expect(policySource(T, 'u2', 'booking.cancelWindowHours')).toBe('unidade')
    expect(policySource(T, 'u2', 'privacy.callPanelMode')).toBe('rede')
    expect(policySource(T, 'u2', 'booking.slotStepMin')).toBe('padrao')
  })
  it('restaurar padrão remove o override e volta a herdar da rede', () => {
    savePolicies(T, 'u2', { 'privacy.callPanelMode': 'nome_abreviado' })
    expect(overriddenPaths(T, 'u2').sort()).toEqual(['booking.cancelWindowHours', 'privacy.callPanelMode'])
    restorePolicy(T, 'u2', 'booking.cancelWindowHours')
    expect(getPolicies(T, 'u2').booking.cancelWindowHours).toBe(48)
    expect(overriddenPaths(T, 'u2')).toEqual(['privacy.callPanelMode'])
    // objeto vazio é podado: nada de "booking: {}"
    const doc = db.list(T, 'settings').find((s) => s.unitId === 'u2')!
    expect(doc.policies.booking).toBeUndefined()
  })
  it('arrays são substituídos, não mesclados', () => {
    savePolicies(T, 'u3', { 'payments.allowedMethods': ['pix'] })
    expect(getPolicies(T, 'u3').payments.allowedMethods).toEqual(['pix'])
  })
  it('rejeita campo desconhecido, negativo e alerta clínico para recepção', () => {
    expect(() => savePolicies(T, null, { 'booking.inexistente': 1 })).toThrow(/desconhecido/)
    expect(() => savePolicies(T, null, { 'booking.minAdvanceHours': -1 })).toThrow()
    expect(() => savePolicies(T, null, { 'privacy.showClinicalAlertsToReception': true })).toThrow(/recepção/)
  })
})

describe('importador CSV', () => {
  const T = 't_imp'
  const cpf1 = fakeCPF(1111)
  const csv = [
    'Nome;CPF;Data de nascimento;Celular;E-mail',
    `Ana Exemplo;${cpf1};10/02/1990;(00) 90000-1111;ana@exemplo.test`,
    'Bruno Teste;111.111.111-11;31/02/1990;123;nao-email', // CPF, data, telefone e e-mail inválidos
    `Carla Repetida;${cpf1};01/01/1980;;`, // duplicado no arquivo (mesmo CPF)
    '=HYPERLINK("http://x");;;;', // formula injection no nome
    ';;;;', // ignorada pelo parser (vazia)
    'Davi Sem Dados;;;;',
  ].join('\n')

  it('mapeia colunas automaticamente por apelidos', () => {
    const { headers } = readTable(csv)
    const m = autoMap('pacientes', headers)
    expect(m.nome).toBe(0); expect(m.cpf).toBe(1); expect(m.nascimento).toBe(2); expect(m.telefone).toBe(3); expect(m.email).toBe(4)
    expect(m.sexo).toBe(-1)
  })
  it('valida por linha, detecta duplicado e neutraliza fórmula', () => {
    const { headers, rows } = readTable(csv)
    const res = validateRows(T, 'pacientes', rows, autoMap('pacientes', headers))
    expect(res).toHaveLength(5)
    expect(res[0].errors).toEqual([])
    expect(res[1].errors.length).toBe(4)
    expect(res[1].line).toBe(3)
    expect(res[2].duplicate?.where).toBe('arquivo')
    expect(String(res[3].values.nome).startsWith(`'=HYPERLINK(`)).toBe(true)
    expect(res[3].warnings.length).toBe(1)
    const s = summarize(res)
    expect(s).toMatchObject({ rows: 5, invalid: 1, duplicates: 1, importable: 3 })
    // relatório exportado também é seguro
    const out = toCSV(errorReport(res))
    expect(out).not.toMatch(/;=/)
  })
  it('duplicado no arquivo por nome + nascimento mesmo sem CPF', () => {
    const t = `nome;cpf;nascimento\nZoe Exemplo;${fakeCPF(77)};01/01/1990\nZoe Exemplo;;01/01/1990`
    const { headers, rows } = readTable(t)
    const res = validateRows('t_dup2', 'pacientes', rows, autoMap('pacientes', headers))
    expect(res[1].duplicate).toEqual({ where: 'arquivo', detail: 'repete a linha 2' })
  })
  it('exige mapeamento de obrigatórios', () => {
    const { rows } = readTable(csv)
    expect(() => validateRows(T, 'pacientes', rows, { nome: -1 })).toThrow(/obrigatórias/)
  })
  it('rejeita data impossível e aceita ISO', () => {
    expect(parseCivilDate('31/02/2020')).toBeNull()
    expect(parseCivilDate('2020-02-29')).toBe('2020-02-29')
  })
  it('grava em lote, detecta duplicado contra a base e desfaz só o lote', () => {
    db.set(T, 'patients', [])
    const { headers, rows } = readTable(csv)
    const map = autoMap('pacientes', headers)
    const batch = commitImport(T, 'pacientes', validateRows(T, 'pacientes', rows, map), { unitId: 'u1', fileName: 'a.csv', actor })
    expect(batch.recordIds).toHaveLength(3)
    expect(db.list(T, 'patients')).toHaveLength(3)
    // reimportar: agora tudo é duplicado contra a base
    const again = validateRows(T, 'pacientes', rows, map)
    expect(again.filter((r) => r.duplicate?.where === 'base').length).toBe(3)
    expect(() => commitImport(T, 'pacientes', again, { unitId: 'u1', fileName: 'a.csv', actor })).toThrow(/Nenhuma linha válida/)
    // paciente pré-existente não é afetado pelo desfazer
    db.insert(T, 'patients', { ...db.list(T, 'patients')[0], id: 'pre_existente', name: 'Pré-existente' })
    const r = undoImport(T, batch.id, actor)
    expect(r.removed).toBe(3)
    expect(db.list(T, 'patients').map((p) => p.id)).toEqual(['pre_existente'])
    expect(() => undoImport(T, batch.id, actor)).toThrow(/já foi desfeito/)
  })
  it('valida números e dinheiro em serviços', () => {
    const t = 'nome;duracao;preco\nLimpeza;40;180,50\nRuim;-5;abc'
    const { headers, rows } = readTable(t)
    const res = validateRows('t_svc', 'servicos', rows, autoMap('servicos', headers))
    expect(res[0].values).toMatchObject({ duracao: 40, preco: 18050 })
    expect(res[1].errors.length).toBe(2)
  })
})

describe('derivação de marca e contraste', () => {
  it('cor clara (#FDE047) nunca recebe texto branco: navy ou primária escurecida ≥ 4.5:1', () => {
    const L = deriveBrandTokens('#FDE047', 'light')
    expect(L.onPrimary).not.toBe('#FFFFFF')
    expect(contrast(L.onPrimary, L.primary)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(L.primaryText, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    const rep = brandReport('#FDE047')
    expect(rep.navyText || rep.lightAdjusted).toBe(true)
    rep.rows.forEach((r) => expect(r.ratio).toBeGreaterThanOrEqual(r.min))
  })
  it('cores diversas mantêm todos os pares AA em claro e escuro', () => {
    for (const c of ['#0D9488', '#2563EB', '#FFFFFF', '#000000', '#7FFF00', '#BE185D', '#94A3B8']) {
      brandReport(c).rows.forEach((r) => expect(r.ratio, `${c} ${r.mode} ${r.pair}`).toBeGreaterThanOrEqual(r.min))
    }
  })
  it('cor escura usa texto branco sem ajuste', () => {
    const rep = brandReport('#102A43')
    expect(rep.light.onPrimary).toBe('#FFFFFF')
    expect(rep.lightAdjusted).toBe(false)
  })
})
