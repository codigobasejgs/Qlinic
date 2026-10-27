import { expect, it } from 'vitest'
import '@/data/platformSeed'
import { db } from '@/data/store'
import { checkInWithToken } from './appointments'

it('numera senhas pelo dia civil da unidade, incluindo horários em datas UTC diferentes', () => {
  const t = 'org_sorriso'
  const model = db.list(t, 'appointments')[0]
  const expiry = new Date(Date.now() + 600_000).toISOString()
  db.set(t, 'appointments', [
    { ...model, id: 'previous', unitId: `${t}_u1`, start: '2026-10-27T23:00:00Z', status: 'chegou', checkIn: { token: 'OLD', expiresAt: expiry, ticket: 'A001' } },
    { ...model, id: 'incoming', unitId: `${t}_u1`, start: '2026-10-28T01:00:00Z', status: 'confirmada', checkIn: { token: 'NEW', expiresAt: expiry } },
  ])
  expect(checkInWithToken(t, 'NEW').ticket).toBe('A002')
})
