// Seeds do módulo de configurações. Regra da REDE + override da unidade Cambuí (Sorriso Pleno).
import { registerSeed } from '@/data/store'
import { demoBaseDate } from '@/lib/dates'
import type { ClinicSettings } from '@/domain/settings'
import './types'

registerSeed('settings', (c): ClinicSettings[] => {
  const createdAt = demoBaseDate().toISOString()
  const rede: ClinicSettings = {
    id: `${c.tenantId}_set_rede`, tenantId: c.tenantId, createdAt, unitId: null,
    policies: { booking: { cancelWindowHours: 24, minAdvanceHours: 2 }, privacy: { callPanelMode: 'senha', showClinicalAlertsToReception: false } },
  }
  if (c.tenantId !== 'org_sorriso') return [rede]
  return [rede, {
    id: `${c.tenantId}_set_org_sorriso_u2`, tenantId: c.tenantId, createdAt, unitId: 'org_sorriso_u2',
    policies: { booking: { cancelWindowHours: 12 }, privacy: { callPanelMode: 'nome_abreviado' } },
  }]
})
registerSeed('importBatches', () => [])
registerSeed('clinicProfile', () => [])
