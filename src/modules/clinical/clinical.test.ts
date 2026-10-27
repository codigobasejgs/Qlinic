// Regras do módulo clínico: finalização/adendo, visibilidade restrita, formulários (showIf/validação/versão).
import { describe, it, expect } from 'vitest'
import { db } from '@/data/store'
import { clinicalRepo } from '@/data/repositories'
import { canSeeRecord, visibleClinicalAlerts } from '@/domain/access'
import { can, scopeOf, type AccessContext } from '@/domain/permissions'
import type { ClinicalRecord, Patient } from '@/domain/types'
import type { FormField, FormTemplate } from '@/domain/modules'
import type { useTenant } from '@/app/session'
import { visibleFields, validateAnswers, pruneHidden, publishVersion, validateSchema } from './forms'
import { appendToField, finalizeRecord, newRecord, saveRecord, signerAct, requestSignatures, newSignatureFlow, validatePatient } from './lib'
import { currentTemplate, validateRecordContent } from './templates'

const T = 'test_clin'
const actor = { id: 'u1', name: 'Dra. Teste' }

function fakeTenant(access: AccessContext): ReturnType<typeof useTenant> {
  return { access, can: (r, a = 'read', o) => can(access, { resource: r, action: a, ownerProfessionalId: o?.ownerProfessionalId }), scope: (r, a = 'read') => scopeOf(access, r, a) } as ReturnType<typeof useTenant>
}
const rec = (over: Partial<ClinicalRecord> = {}): ClinicalRecord => ({ id: 'r', tenantId: T, createdAt: '2026-01-01T00:00:00Z', patientId: 'p', professionalId: 'pro1', specialty: 'psicologia', templateId: 'psico_sessao', templateVersion: 1, title: 'x', content: {}, status: 'finalizado', addenda: [], confidentiality: 'restrito', releasedToPortal: false, history: [], ...over })

describe('registro clínico: finalização e adendo', () => {
  const tpl = currentTemplate('medicina')
  const full = { s: 'relato', o: 'exame', a: 'avaliação', p: 'plano' }
  it('rascunho → revisado exige campos obrigatórios; finalizado bloqueia save; adendo exige motivo', () => {
    const r = newRecord(T, { patientId: 'p1', professionalId: 'pro1', segment: 'medicina', template: tpl, content: { s: 'só S' }, releasedToPortal: false }, actor)
    expect(r.status).toBe('rascunho')
    expect(() => saveRecord(T, r, { content: { s: 'só S' }, releasedToPortal: false }, actor, 'revisado', tpl)).toThrow(/obrigatórios/)
    const rev = saveRecord(T, r, { content: full, releasedToPortal: false }, actor, 'revisado', tpl)
    expect(rev.status).toBe('revisado')
    expect(() => finalizeRecord(T, rev, { content: { s: '' }, releasedToPortal: false }, tpl, actor)).toThrow()
    const fin = finalizeRecord(T, rev, { content: full, releasedToPortal: true, portalGuidance: 'beber água' }, tpl, actor)
    expect(fin.status).toBe('finalizado')
    expect(fin.finalizedAt).toBeTruthy()
    expect(fin.releasedToPortal).toBe(true)
    expect(() => clinicalRepo.save(T, { ...fin, content: { s: 'alterado' } })).toThrow(/finalizado/)
    expect(db.get(T, 'records', r.id)!.content).toEqual(full)
    expect(() => clinicalRepo.addAddendum(T, r.id, { authorId: 'u1', authorName: 'x', reason: '', text: 'a' })).toThrow(/obrigatórios/)
    const add = clinicalRepo.addAddendum(T, r.id, { authorId: 'u1', authorName: 'Dra. Teste', reason: 'Correção de PA', text: 'PA correta 13x8' })
    expect(add.addenda).toHaveLength(1)
    expect(add.addenda[0]).toMatchObject({ authorName: 'Dra. Teste', reason: 'Correção de PA' })
    expect(add.content).toEqual(full)
  })
  it('adendo não se aplica a rascunho', () => {
    const r = newRecord(T, { patientId: 'p1', professionalId: 'pro1', segment: 'medicina', template: tpl, content: {}, releasedToPortal: false }, actor)
    expect(() => clinicalRepo.addAddendum(T, r.id, { authorId: 'u', authorName: 'u', reason: 'r', text: 't' })).toThrow(/finalizado/)
  })
  it('valida número com min/max no template', () => {
    expect(validateRecordContent(tpl, { ...full, fc: 999 }).fc).toMatch(/máximo/)
    expect(validateRecordContent(tpl, { ...full, fc: 'abc' }).fc).toMatch(/número/)
  })
  it('trecho de transcrição aceito é acrescentado, não substitui', () => {
    expect(appendToField({ s: 'meu texto' }, 's', 'sugestão')).toEqual({ s: 'meu texto\nsugestão' })
  })
})

describe('visibilidade de registro restrito', () => {
  const reception = fakeTenant({ memberships: [{ role: 'reception', unitIds: 'all' }] })
  const pro1 = fakeTenant({ memberships: [{ role: 'professional', unitIds: 'all' }], professionalId: 'pro1' })
  const pro2 = fakeTenant({ memberships: [{ role: 'professional', unitIds: 'all' }], professionalId: 'pro2' })
  const owner = fakeTenant({ memberships: [{ role: 'clinic_owner', unitIds: 'all' }] })
  it('recepção nunca vê registro restrito nem padrão; autor vê; outro profissional não', () => {
    expect(canSeeRecord(reception, rec())).toBe(false)
    expect(canSeeRecord(reception, rec({ confidentiality: 'padrao' }))).toBe(false)
    expect(canSeeRecord(pro1, rec())).toBe(true)
    expect(canSeeRecord(pro2, rec())).toBe(false)
    expect(canSeeRecord(owner, rec())).toBe(false)
    expect(canSeeRecord(owner, rec({ confidentiality: 'padrao' }))).toBe(true)
  })
  it('alertas clínicos ocultos para recepção', () => {
    const p = { allergies: ['Penicilina'], clinicalAlerts: ['HAS'] } as Patient
    expect(visibleClinicalAlerts(reception, p)).toEqual([])
    expect(visibleClinicalAlerts(pro1, p)).toEqual(['Penicilina', 'HAS'])
  })
})

describe('formulários', () => {
  const fields: FormField[] = [
    { id: 'a', type: 'boolean', label: 'Alergia?', required: true },
    { id: 'b', type: 'text', label: 'Quais?', required: true, showIf: { fieldId: 'a', equals: 'sim' } },
    { id: 'c', type: 'number', label: 'Idade', min: 0, max: 120 },
    { id: 'd', type: 'single', label: 'Fuma', options: ['Sim', 'Não'] },
    { id: 'e', type: 'text', label: 'Quantos', showIf: { fieldId: 'b', equals: 'x' } },
  ]
  it('showIf exibe/oculta e encadeia', () => {
    expect(visibleFields(fields, {}).map((f) => f.id)).toEqual(['a', 'c', 'd'])
    expect(visibleFields(fields, { a: true }).map((f) => f.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(visibleFields(fields, { a: true, b: 'x' }).map((f) => f.id)).toContain('e')
    expect(visibleFields(fields, { a: false, b: 'x' }).map((f) => f.id)).not.toContain('e')
  })
  it('validação: obrigatório só se visível; min/max; opção', () => {
    expect(validateAnswers(fields, {})).toEqual({ a: 'Selecione sim ou não.' })
    expect(validateAnswers(fields, { a: false })).toEqual({})
    expect(validateAnswers(fields, { a: true }).b).toBe('Campo obrigatório.')
    expect(validateAnswers(fields, { a: false, c: 200 }).c).toMatch(/máximo/)
    expect(validateAnswers(fields, { a: false, d: 'Talvez' }).d).toMatch(/inválida/)
    expect(pruneHidden(fields, { a: false, b: 'resto' })).toEqual({ a: false })
  })
  it('publicar cria versão nova imutável e preserva anteriores', () => {
    const tpl: FormTemplate = { id: 't', tenantId: T, createdAt: '', name: 'X', specialty: 'geral', audience: 'paciente', active: true, currentVersion: 1, versions: [{ version: 1, publishedAt: 'x', fields: fields.slice(0, 1) }] }
    const draft = fields.slice(0, 2)
    const v2 = publishVersion(tpl, draft, '2026-01-01T00:00:00Z')
    expect(v2.currentVersion).toBe(2)
    expect(v2.versions).toHaveLength(2)
    expect(v2.versions[0].fields).toHaveLength(1)
    draft[0].label = 'mutado'
    expect(v2.versions[1].fields[0].label).toBe('Alergia?')
    expect(() => publishVersion(tpl, [{ id: 'z', type: 'single', label: 'Q', options: ['só uma'] }], 'x')).toThrow(/2 opções/)
    expect(validateSchema([{ id: 'x', type: 'text', label: 'X', showIf: { fieldId: 'y', equals: '1' } }, { id: 'y', type: 'text', label: 'Y' }])[0]).toMatch(/ANTERIOR/)
  })
})

describe('cadastro e assinatura', () => {
  it('CPF opcional, mas validado quando informado', () => {
    const base = { kind: 'human' as const, name: 'Ana Teste', tags: [], unitId: 'u', status: 'ativo' as const, sharing: { portal: true, multidisciplinar: false } }
    expect(validatePatient(base, '2026-10-27')).toEqual({})
    expect(validatePatient({ ...base, cpf: '111.111.111-11' }, '2026-10-27').cpf).toBeTruthy()
    expect(validatePatient({ ...base, birthDate: '2030-01-01' }, '2026-10-27').birthDate).toMatch(/futuro/)
  })
  it('assinatura respeita ordem e recusa exige motivo', () => {
    const doc = { id: 'd', tenantId: T, createdAt: '', patientId: 'p', kind: 'termo' as const, title: 't', body: 'b', status: 'emitido' as const, releasedToPortal: false, confidentiality: 'padrao' as const, signature: newSignatureFlow(), createdBy: 'x', demoWatermark: true as const }
    const flow = requestSignatures(doc, [{ name: 'A', role: 'Paciente' }, { name: 'B', role: 'Profissional' }], undefined)
    expect(() => signerAct(flow, 2, 'assinar', { method: 'aceite_demo' })).toThrow(/vez/)
    const s1 = signerAct(flow, 1, 'assinar', { method: 'aceite_demo' })
    expect(s1.signature.status).toBe('parcial')
    expect(() => signerAct(s1, 2, 'recusar', {})).toThrow(/motivo/)
    expect(signerAct(s1, 2, 'assinar', { method: 'rubrica_demo' }).signature.status).toBe('assinado')
  })
})
