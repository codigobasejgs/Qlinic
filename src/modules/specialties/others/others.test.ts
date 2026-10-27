import { describe, it, expect } from 'vitest'
import type { VaccineRecord, AestheticPackage } from '@/domain/modules'
import { calcVolume, vaccinesFor, validateVaccine, taskState, addPrescription, recordAdministration, suspendPrescription, discharge, scheduleTimes, packageState, addPackageSession, diffAssessments } from './lib'
import type { Hospitalization, Prescription, NutritionAssessment } from './types'

const base = { species: 'Cão', context: 'Prescrição registrada na internação' }

describe('calculadora de conversão (veterinária)', () => {
  it('mg/kg × kg ÷ mg/mL = mL', () => {
    const r = calcVolume({ ...base, dose: 2, doseUnit: 'mg/kg', weightKg: 10, concentration: 10, concUnit: 'mg/mL' })
    expect(r.ok && r.volumeMl).toBe(2)
  })
  it('converte mcg → mg', () => {
    const r = calcVolume({ ...base, dose: 500, doseUnit: 'mcg/kg', weightKg: 4, concentration: 1, concUnit: 'mg/mL' })
    expect(r.ok && r.volumeMl).toBe(2)
  })
  it('dose total (sem /kg) não exige peso', () => {
    const r = calcVolume({ ...base, dose: 50, doseUnit: 'mg', weightKg: null, concentration: 25, concUnit: 'mg/mL' })
    expect(r.ok && r.volumeMl).toBe(2)
  })
  it('UI com mg/mL = unidade incompatível', () => {
    const r = calcVolume({ ...base, dose: 100, doseUnit: 'UI/kg', weightKg: 5, concentration: 10, concUnit: 'mg/mL' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errors.join(' ')).toMatch(/incompatíveis/)
  })
  it('dado ausente (peso e concentração)', () => {
    const r = calcVolume({ ...base, dose: 1, doseUnit: 'mg/kg', weightKg: null, concentration: undefined, concUnit: 'mg/mL' })
    expect(!r.ok && r.errors.filter((e) => e.startsWith('Dado ausente')).length).toBe(2)
  })
  it('valores ≤ 0 recusados', () => {
    const r = calcVolume({ ...base, dose: 0, doseUnit: 'mg/kg', weightKg: -1, concentration: 0, concUnit: 'mg/mL' })
    expect(!r.ok && r.errors.length).toBe(3)
  })
  it('exige espécie e contexto', () => {
    const r = calcVolume({ dose: 1, doseUnit: 'mg/kg', weightKg: 1, concentration: 1, concUnit: 'mg/mL' })
    expect(!r.ok && r.errors.join(' ')).toMatch(/espécie/)
    expect(!r.ok && r.errors.join(' ')).toMatch(/contexto/)
  })
})

describe('isolamento de vacinas por animal', () => {
  const mk = (id: string, patientId: string, appliedOn: string): VaccineRecord => ({ id, tenantId: 't', createdAt: '', patientId, kind: 'vacina', product: 'X', lot: 'L', appliedOn, professionalId: 'p', status: 'aplicada' })
  const list = [mk('a', 'thor', '2026-01-01'), mk('b', 'luna', '2026-02-01'), mk('c', 'thor', '2026-03-01')]
  it('carteira do Thor não contém registro da Luna', () => {
    const thor = vaccinesFor(list, 'thor')
    expect(thor.map((v) => v.id)).toEqual(['c', 'a'])
    expect(thor.some((v) => v.patientId === 'luna')).toBe(false)
  })
  it('animal sem registros → vazio', () => expect(vaccinesFor(list, 'mel')).toEqual([]))
  it('retorno manual deve ser após aplicação', () => {
    expect(validateVaccine({ patientId: 'thor', product: 'X', lot: 'L', professionalId: 'p', appliedOn: '2026-01-10', nextDueOn: '2026-01-05' })).toContain('A data de retorno deve ser posterior à aplicação.')
    expect(validateVaccine({ patientId: 'thor', product: 'X', lot: 'L', professionalId: 'p', appliedOn: '2026-01-10' })).toEqual([])
  })
})

describe('tarefas de internação', () => {
  const now = new Date('2026-10-27T15:00:00Z')
  let n = 0
  const id = () => `t${++n}`
  const h0: Hospitalization = { id: 'h', tenantId: 't', createdAt: '', unitId: 'u', patientId: 'thor', boxId: 'b', reason: 'Obs.', professionalId: 'p', admittedAt: '2026-10-27T06:00:00Z', admittedBy: 'X', status: 'internado', evolutions: [], prescriptions: [], tasks: [] }
  const p: Prescription = { id: 'rx', medication: 'Medicamento digitado', dose: '1 mL', route: 'IV', everyHours: 4, firstAt: '2026-10-27T07:00:00Z', durationHours: 24, professionalId: 'p', prescribedBy: 'Dra.', prescribedAt: '', active: true }
  const h1 = addPrescription(h0, p, id)
  it('gera tarefas por horário a partir da prescrição', () => {
    expect(h1.tasks).toHaveLength(6)
    expect(scheduleTimes(p.firstAt, 8, 24)).toHaveLength(3)
    expect(() => scheduleTimes(p.firstAt, 0, 24)).toThrow()
  })
  it('agendado × atrasado × administrado × não administrado', () => {
    const [t7, t11, t15] = h1.tasks
    expect(taskState(t7, now)).toBe('atrasado')
    expect(taskState(t15, now)).toBe('agendado') // dentro da tolerância
    const h2 = recordAdministration(h1, t7.id, { given: true, by: 'Aux. Tânia', at: now.toISOString() })
    expect(taskState(h2.tasks[0], now)).toBe('administrado')
    expect(() => recordAdministration(h2, t11.id, { given: false, by: 'Aux.', at: now.toISOString(), reason: ' ' })).toThrow(/motivo/)
    const h3 = recordAdministration(h2, t11.id, { given: false, by: 'Aux.', at: now.toISOString(), reason: 'Animal em jejum' })
    expect(taskState(h3.tasks[1], now)).toBe('nao_administrado')
    expect(() => recordAdministration(h3, t7.id, { given: true, by: 'Aux.', at: now.toISOString() })).toThrow(/já registrada/)
  })
  it('suspensão e alta encerram apenas tarefas futuras agendadas', () => {
    const s = suspendPrescription(h1, 'rx', 'Mudança de conduta', now.toISOString())
    expect(s.tasks.filter((t) => t.status === 'suspenso').length).toBe(3) // 19h, 23h, 03h
    const d = discharge(h1, 'Alta com orientações', 'Dra.', now.toISOString())
    expect(d.status).toBe('alta')
    expect(() => discharge(d, 'x', 'y', now.toISOString())).toThrow()
    expect(() => addPrescription(d, { ...p, id: 'rx2' }, id)).toThrow()
  })
})

describe('pacotes estéticos e comparação nutricional', () => {
  const pkg: AestheticPackage = { id: 'p', tenantId: 't', createdAt: '', patientId: 'x', serviceId: 's', name: 'P', sessionsTotal: 2, sessions: [{ date: '2026-10-01' }], validUntil: '2026-11-10', priceCents: 100, status: 'ativo' }
  it('expiração e conclusão', () => {
    expect(packageState(pkg, '2026-10-27').expiringSoon).toBe(true)
    expect(() => addPackageSession(pkg, { date: '2026-11-11' }, '2026-11-11')).toThrow(/vencida/)
    const done = addPackageSession(pkg, { date: '2026-10-27' }, '2026-10-27')
    expect(done.status).toBe('concluido')
    expect(() => addPackageSession(done, { date: '2026-10-28' }, '2026-10-28')).toThrow()
  })
  it('diferença entre avaliações', () => {
    const a = { weightKg: 80, heightCm: 170, waistCm: 90 } as NutritionAssessment
    const b = { weightKg: 77.5, heightCm: 170, waistCm: 86 } as NutritionAssessment
    const d = diffAssessments(a, b)
    expect(d[0].delta).toBe(-2.5)
    expect(d.find((r) => r.label === 'Quadril')?.delta).toBeUndefined()
  })
})
