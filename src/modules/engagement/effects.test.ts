import { describe, it, expect } from 'vitest'
import '@/data/platformSeed'
import '@/domain/modules'
import './seed'
import './effects'
import { db } from '@/data/store'
import { emit } from '@/data/events'
import { addDaysCivil, civilWeekday, todayCivil, zonedToInstant } from '@/lib/dates'
import type { Appointment } from '@/domain/types'
import { simulate } from './engine'

const T = 'org_vitta'

describe('effects: automações ativas reagem a eventos de domínio', () => {
  it('consulta cancelada → oferta à lista de espera (registra execução)', () => {
    const w = db.list(T, 'waitlist').find((x) => x.status === 'aguardando')!
    const av = w.availability[0]
    let date = addDaysCivil(todayCivil(), 2)
    while (civilWeekday(date) !== av.weekday) date = addDaysCivil(date, 1)
    const start = zonedToInstant(date, av.start, 'America/Sao_Paulo')
    const end = zonedToInstant(date, av.start + w.durationMin, 'America/Sao_Paulo')
    const ap = { id: 'ap_test', tenantId: T, createdAt: start, unitId: w.unitId, patientId: 'x', professionalId: w.professionalId ?? `${T}_pro1`, serviceId: w.serviceId, resourceIds: [], start, end, status: 'cancelada', history: [], source: 'recepcao', financialStatus: 'nao_cobrado' } as Appointment
    db.insert(T, 'appointments', ap)
    emit('appointment.cancelled', { tenantId: T, appointment: ap, by: 'teste' })
    const run = db.list(T, 'automationRuns').find((r) => r.ctxKey.startsWith('cancel:ap_test'))
    expect(run).toBeTruthy()
    // dentro da janela 8–20h executa; fora dela fica adiada (nunca envia fora do horário permitido)
    expect(['executada', 'adiada']).toContain(run!.status)
    if (run!.status === 'executada') expect(db.get(T, 'waitlist', w.id)?.status).toBe('ofertado')
    // reemissão do mesmo evento não duplica efeito
    emit('appointment.cancelled', { tenantId: T, appointment: ap, by: 'teste' })
    if (run!.status === 'executada') expect(db.list(T, 'automationRuns').filter((r) => r.ctxKey === run!.ctxKey && r.status === 'executada').length).toBe(1)
  })
  it('stock.low → alerta interno para perfil estoque', () => {
    emit('stock.low', { tenantId: T, productId: 'p1', name: 'Luva (fictício)' })
    const alerts = db.list(T, 'outbox').filter((m) => m.event === 'estoque_baixo')
    expect(alerts.some((m) => m.recipientRef === `${T}_usr_estoque`)).toBe(true)
  })
  it('simulação não tem efeitos', () => {
    const a = db.list(T, 'automations').find((x) => x.trigger === 'proposal.pending')!
    const before = JSON.stringify([db.list(T, 'leads'), db.list(T, 'outbox'), db.list(T, 'automationRuns')])
    simulate(T, a)
    expect(JSON.stringify([db.list(T, 'leads'), db.list(T, 'outbox'), db.list(T, 'automationRuns')])).toBe(before)
  })
})
