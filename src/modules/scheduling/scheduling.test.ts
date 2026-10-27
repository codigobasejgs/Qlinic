// Regras de agenda (src/domain/scheduling.ts) com dados construídos no teste.
import { describe, it, expect } from 'vitest'
import { TRANSITIONS, canTransition, findConflicts, availableSlots, weeklyRecurrence, type SlotCandidate } from '@/domain/scheduling'
import type { Appointment, AppointmentStatus, Professional, Resource, Service, Unit } from '@/domain/types'
import { civilWeekday, zonedToInstant } from '@/lib/dates'

const TZ = 'America/Sao_Paulo'
const MON = '2030-01-07'
const at = (date: string, hh: number, mm = 0) => zonedToInstant(date, hh * 60 + mm, TZ)
const base = { tenantId: 't', createdAt: '2029-12-01T00:00:00.000Z' }

const unit: Unit = {
  ...base, id: 'u1', name: 'Unidade teste', timezone: TZ, address: '', phone: '',
  hours: { 0: [], 1: [{ start: 480, end: 1080 }], 2: [{ start: 480, end: 1080 }], 3: [{ start: 480, end: 1080 }], 4: [{ start: 480, end: 1080 }], 5: [{ start: 480, end: 1080 }], 6: [] },
  holidays: [{ date: '2030-01-08', name: 'Feriado fictício' }],
  specialHours: [{ date: '2030-01-09', intervals: [{ start: 480, end: 720 }], reason: 'Expediente reduzido' }],
}
const lateUnit: Unit = { ...unit, id: 'u2', hours: { ...unit.hours, 1: [{ start: 480, end: 1440 }] } }
const pro: Professional = {
  ...base, id: 'p1', name: 'Dra. Teste', council: '', specialty: '', unitIds: ['u1', 'u2'], color: '#000', active: true,
  schedule: [1, 2, 3, 4, 5].flatMap((wd) => [{ unitId: 'u1', weekday: wd, start: 480, end: 1080 }, { unitId: 'u2', weekday: wd, start: 480, end: 1440 }]),
  absences: [{ start: at('2030-01-10', 0), end: at('2030-01-11', 0), reason: 'Congresso' }],
}
const pro2: Professional = { ...pro, id: 'p2', absences: [] }
const svc: Service = { ...base, id: 's1', name: 'Consulta', category: '', durationMin: 30, bufferMin: 10, priceCents: 10000, resourceKinds: ['cadeira'], publicBookable: true, active: true }
const chair: Resource = { ...base, id: 'r1', unitId: 'u1', kind: 'cadeira', name: 'Cadeira 1', active: true, blocks: [{ start: at(MON, 14), end: at(MON, 16), reason: 'Manutenção' }] }
const chair2: Resource = { ...chair, id: 'r2', name: 'Cadeira 2', blocks: [] }
const resources = [chair, chair2]

const appt = (o: Partial<Appointment>): Appointment => ({
  ...base, id: 'a1', unitId: 'u1', patientId: 'pat1', professionalId: 'p1', serviceId: 's1', resourceIds: ['r1'], start: at(MON, 9), end: at(MON, 9, 30),
  status: 'confirmada', history: [], source: 'recepcao', financialStatus: 'nao_cobrado', ...o,
})
const cand = (o: Partial<SlotCandidate> = {}): SlotCandidate => ({ unit, professional: pro, service: svc, resourceIds: ['r2'], patientId: 'pat9', start: at(MON, 10), end: at(MON, 10, 30), ...o })
const kinds = (c: SlotCandidate, list: Appointment[] = []) => findConflicts(c, list, resources).map((x) => x.kind)

describe('transições de status', () => {
  it('permite o fluxo feliz e bloqueia saltos', () => {
    const path: AppointmentStatus[] = ['solicitada', 'confirmada', 'chegou', 'em_atendimento', 'concluida']
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true)
    expect(canTransition('solicitada', 'em_atendimento')).toBe(false)
    expect(canTransition('confirmada', 'concluida')).toBe(false)
    expect(canTransition('em_atendimento', 'cancelada')).toBe(false)
  })
  it('estados finais não têm saída', () => {
    for (const s of ['concluida', 'faltou', 'cancelada'] as const) expect(TRANSITIONS[s]).toEqual([])
  })
})

describe('conflitos de agenda', () => {
  it('slot livre e válido não tem conflito', () => {
    expect(civilWeekday(MON)).toBe(1)
    expect(kinds(cand())).toEqual([])
  })
  it('sobreposição de profissional', () => {
    expect(kinds(cand({ start: at(MON, 9, 15), end: at(MON, 9, 45) }), [appt({ resourceIds: [] })])).toContain('profissional')
  })
  it('buffer do serviço: encostar logo após o término conflita; depois do buffer não', () => {
    const list = [appt({ resourceIds: [] })]
    expect(kinds(cand({ start: at(MON, 9, 30), end: at(MON, 10) }), list)).toContain('profissional')
    expect(kinds(cand({ start: at(MON, 9, 40), end: at(MON, 10, 10) }), list)).not.toContain('profissional')
  })
  it('sobreposição de recurso com outro profissional', () => {
    const list = [appt({ professionalId: 'p2', resourceIds: ['r2'] })]
    expect(kinds(cand({ start: at(MON, 9), end: at(MON, 9, 30) }), list)).toEqual(['recurso'])
  })
  it('cancelado não bloqueia', () => {
    expect(kinds(cand({ start: at(MON, 9), end: at(MON, 9, 30) }), [appt({ status: 'cancelada' })])).not.toContain('profissional')
  })
  it('ignoreId (edição) e ignoreSeriesId', () => {
    const list = [appt({ id: 'x', seriesId: 'S', resourceIds: [] })]
    const c = cand({ start: at(MON, 9), end: at(MON, 9, 30) })
    expect(kinds({ ...c, ignoreId: 'x' }, list)).toEqual([])
    expect(kinds({ ...c, ignoreSeriesId: 'S' }, list)).toEqual([])
  })
  it('paciente em dois lugares ao mesmo tempo', () => {
    expect(kinds(cand({ professional: pro2, start: at(MON, 9), end: at(MON, 9, 30), patientId: 'pat1' }), [appt({ resourceIds: [] })])).toContain('paciente')
  })
  it('feriado fecha a unidade', () => {
    expect(kinds(cand({ start: at('2030-01-08', 10), end: at('2030-01-08', 10, 30) }))).toContain('feriado')
  })
  it('fora do horário da unidade e horário especial', () => {
    expect(kinds(cand({ start: at(MON, 7, 30), end: at(MON, 8) }))).toContain('fora_horario')
    expect(kinds(cand({ start: at(MON, 17, 45), end: at(MON, 18, 15) }))).toContain('fora_horario')
    const sp = findConflicts(cand({ start: at('2030-01-09', 13), end: at('2030-01-09', 13, 30) }), [], resources)
    expect(sp.some((c) => c.kind === 'fora_horario' && c.message.includes('Expediente reduzido'))).toBe(true)
  })
  it('virada de dia no fuso da unidade', () => {
    const c = cand({ unit: lateUnit, resourceIds: [], service: { ...svc, resourceKinds: [] }, start: at(MON, 23, 45), end: at('2030-01-08', 0, 15) })
    expect(findConflicts(c, [], []).some((x) => x.message.includes('virada do dia'))).toBe(true)
    // terminar exatamente à meia-noite não é virada
    const ok = cand({ unit: lateUnit, resourceIds: [], service: { ...svc, resourceKinds: [] }, start: at(MON, 23, 30), end: at('2030-01-08', 0) })
    expect(findConflicts(ok, [], []).map((x) => x.kind)).toEqual([])
  })
  it('ausência do profissional', () => {
    expect(kinds(cand({ start: at('2030-01-10', 10), end: at('2030-01-10', 10, 30) }))).toContain('ausencia')
  })
  it('recurso bloqueado e recurso exigido ausente', () => {
    expect(kinds(cand({ resourceIds: ['r1'], start: at(MON, 14, 30), end: at(MON, 15) }))).toContain('recurso_bloqueado')
    expect(kinds(cand({ resourceIds: [] }))).toContain('recurso')
  })
  it('duração menor que a do serviço', () => {
    expect(kinds(cand({ end: at(MON, 10, 15) }))).toContain('duracao')
  })
  it('lista TODOS os conflitos simultâneos', () => {
    const k = kinds(cand({ resourceIds: ['r1'], start: at(MON, 9), end: at(MON, 9, 30) }), [appt({})])
    expect(k).toEqual(expect.arrayContaining(['profissional', 'recurso']))
  })
})

describe('disponibilidade e recorrência', () => {
  it('availableSlots respeita ocupação, buffer e bloqueio', () => {
    const slots = availableSlots({ date: MON, unit, service: svc, professionals: [pro], resources, appointments: [appt({ resourceIds: ['r1'] })], stepMin: 30 })
    const times = slots.map((s) => s.start)
    expect(times).not.toContain(at(MON, 9))
    expect(times).toContain(at(MON, 8))
    expect(times).toContain(at(MON, 10)) // 9:30 + buffer 10 → 10:00 livre
    const s14 = slots.find((s) => s.start === at(MON, 14))
    expect(s14?.resourceIds).toEqual(['r2']) // r1 bloqueado → usa r2
  })
  it('feriado não tem vagas', () => {
    expect(availableSlots({ date: '2030-01-08', unit, service: svc, professionals: [pro], resources, appointments: [] })).toEqual([])
  })
  it('weeklyRecurrence n ocorrências a cada k semanas', () => {
    expect(weeklyRecurrence(MON, 3, 2)).toEqual(['2030-01-07', '2030-01-21', '2030-02-04'])
  })
})
