// Componentes pequenos do módulo (rótulos/badges). Sem lógica de negócio.
import type { OutboxMessage } from '@/domain/types'
import type { IntegrationProviderKey, IntegrationStatus } from '@/domain/platform'
import { Badge, type Tone } from '@/ui'
import { OUTBOX_STATUS } from './catalog'

export function OutboxBadge({ status }: { status: OutboxMessage['status'] }) {
  const s = OUTBOX_STATUS[status]
  return <Badge tone={s.tone} title={s.help}>{s.label}</Badge>
}

export const INTEGRATION_STATUS: Record<IntegrationStatus, { label: string; tone: Tone; help: string }> = {
  desconectada: { label: 'Desconectada', tone: 'neutral', help: 'Nenhuma conta vinculada.' },
  configurando: { label: 'Configurando', tone: 'info', help: 'Vinculação iniciada; aguardando teste.' },
  conectada: { label: 'Conectada', tone: 'success', help: 'Conta vinculada e respondendo.' },
  degradada: { label: 'Degradada', tone: 'warning', help: 'Funciona com falhas/latência; retentativas controladas.' },
  expirada: { label: 'Expirada', tone: 'warning', help: 'Autorização expirou; reconecte.' },
  erro: { label: 'Erro', tone: 'danger', help: 'Falha que impede o uso; verifique os logs.' },
  simulada: { label: 'Simulada', tone: 'sim', help: 'Demonstração sem provedor real.' },
}
export function IntegrationBadge({ status }: { status: IntegrationStatus }) {
  const s = INTEGRATION_STATUS[status]
  return <Badge tone={s.tone} title={s.help}>{s.label}</Badge>
}

export const PROVIDER_LABEL: Record<IntegrationProviderKey, string> = {
  infinitepay: 'InfinitePay', asaas: 'Asaas', mercadopago: 'Mercado Pago', pix_manual: 'Pix manual', resend: 'Resend (e-mail)', evolution: 'Evolution API (WhatsApp)',
  assinatura: 'Assinatura eletrônica', ia: 'Provedor de IA', teleatendimento: 'Teleatendimento', prescricao: 'Prescrição eletrônica', nfse: 'Emissão fiscal (NFS-e)',
}

export const cssVars = (v: Record<string, string>) => v as React.CSSProperties
