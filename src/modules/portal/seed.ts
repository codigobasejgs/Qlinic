// Seed do portal: solicitações (PortalRequest) de exemplo da pessoa 1 de cada tenant demo.
// Consulta futura, cobrança aberta e documento liberado da pessoa 1 já vêm do seed núcleo (src/data/seed/tenant.ts).
import { registerSeed } from '@/data/store'
import type { PortalRequest } from '@/domain/modules'
import { demoBaseDate } from '@/lib/dates'

registerSeed('portalRequests', (ctx): PortalRequest[] => {
  const person = ctx.get('persons')[0]
  if (!person) return []
  const patientId = ctx.get('links').find((l) => l.personId === person.id)?.patientId
  const base = demoBaseDate().getTime()
  const at = (days: number) => new Date(base - days * 86_400_000).toISOString()
  return [
    { id: `${ctx.tenantId}_preq1`, tenantId: ctx.tenantId, createdAt: at(6), updatedAt: at(5), personId: person.id, patientId, kind: 'documento', message: 'Poderiam liberar a segunda via do recibo da última consulta? (exemplo)', status: 'concluida', handledBy: 'Recepção (demo)' },
    { id: `${ctx.tenantId}_preq2`, tenantId: ctx.tenantId, createdAt: at(1), personId: person.id, patientId, kind: 'atendimento', message: 'Gostaria de falar com a recepção sobre horários aos sábados. (exemplo)', status: 'aberta' },
  ]
})
