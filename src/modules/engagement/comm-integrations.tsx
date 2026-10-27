import { useState } from 'react'
import { useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { PROVIDERS, CAP_LABEL, getSimScenario, setSimScenario, type SimScenario } from '@/domain/payments'
import { Alert, Badge, Button, Field, Input, Section, Select, SimBadge, Timeline, useAction, useConfirm } from '@/ui'
import { nowISO, formatDateTime } from '@/lib/dates'
import { sanitizeLog } from './rules'
import { IntegrationBadge, PROVIDER_LABEL } from './ui'
import type { ClinicIntegration } from './types'

export function updateIntegration(t: string, integration: ClinicIntegration, status: ClinicIntegration['status'], message: string) {
  const at = nowISO()
  db.update(t, 'clinicIntegrations', integration.id, { status, environment: 'simulado', lastEvent: { at, type: 'connection.test', result: status === 'erro' ? 'erro' : 'ok' }, logs: [...integration.logs, { at, level: status === 'erro' ? 'erro' as const : 'info' as const, message }].slice(-30) })
}
const SCENARIOS: Record<SimScenario, string> = {
  sucesso: 'Confirmação via webhook simulado; redirect não confirma pagamento.', falha: 'Provedor recusa a operação; nenhum valor confirmado.', timeout: 'Status desconhecido. Não trocar de gateway nem criar nova cobrança automaticamente.', webhook_duplicado: 'Mesmo eventId reapresentado: apenas uma liquidação.', fora_de_ordem: 'Estorno recebido antes da confirmação exige conciliação. O adapter atual ainda não reproduz este cenário no checkout.',
}
export function IntegrationsTab() {
  const t = useTenant()
  const items = useCollection(t.tenantId, 'clinicIntegrations')
  const run = useAction()
  const confirm = useConfirm()
  const [scenario, setScenario] = useState(getSimScenario)
  if (!t.can('integracoes')) return <Alert>Seu perfil não pode consultar integrações. Solicite acesso ao proprietário.</Alert>
  const edit = t.can('integracoes', 'update')
  const disconnect = async (i: ClinicIntegration) => {
    if (!(await confirm({ title: `Desconectar ${PROVIDER_LABEL[i.provider]}?`, body: 'Interrompe a conexão demonstrativa desta clínica. Histórico preservado.', danger: true })).ok) return
    run(() => updateIntegration(t.tenantId, i, 'desconectada', 'Desconexão solicitada pela equipe (simulado).'), 'Integração desconectada.')
  }
  return <div className="stack">
    <Alert title="Contexto B — contas da clínica">Pagamentos de pacientes pertencem à clínica. Assinatura Qlinic (Contexto A) mantém conta, ledger e webhooks separados. Nenhuma credencial real é aceita aqui.</Alert>
    <SimBadge />
    <Field label="Cenário do próximo pagamento simulado" hint={SCENARIOS[scenario]}><Select value={scenario} disabled={!edit} onChange={(e) => run(() => { const s = e.target.value as SimScenario; setSimScenario(s); setScenario(s); const i = items.find((x) => x.kind === 'pagamento'); if (i) updateIntegration(t.tenantId, i, i.status, `Cenário de teste: ${s}.` ) }, 'Cenário de pagamento alterado (simulado).')}>{Object.keys(SCENARIOS).map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</Select></Field>
    {!edit && <Alert tone="neutral">Consulta permitida. Configuração, teste e desconexão exigem permissão de atualização de integrações.</Alert>}
    <div className="grid grid-2">{items.map((i) => {
      const payment = i.provider === 'infinitepay' || i.provider === 'asaas' || i.provider === 'mercadopago' ? PROVIDERS[i.provider] : null
      return <Section key={i.id} title={PROVIDER_LABEL[i.provider]} actions={<IntegrationBadge status={i.status} />}><div className="stack">
        <p className="small">Ambiente: <strong>{i.environment === 'simulado' ? 'Simulado' : `${i.environment} (estado demonstrativo)`}</strong><br />Último evento: {i.lastEvent ? `${formatDateTime(i.lastEvent.at, t.org.timezone)} · ${i.lastEvent.type}` : 'Nenhum'}</p>
        {i.status === 'erro' && <Alert tone="danger">Conexão indisponível. Revise o log e reconecte em modo demonstrativo.</Alert>}
        {i.status === 'expirada' && <Alert tone="warning">Autorização expirada; reconexão necessária.</Alert>}
        <div className="stack eng-capabilities"><h3>Capacidades</h3>{payment ? Object.entries(payment.capabilities).map(([key, cap]) => <div key={key} className="row between"><span>{CAP_LABEL[key as keyof typeof CAP_LABEL]}</span><Badge tone={cap === 'homologacao' ? 'warning' : 'neutral'}>{cap === 'homologacao' ? 'depende de homologação' : cap === 'sim' ? 'disponível (simulação)' : 'não disponível'}</Badge></div>) : <p className="small muted">{i.provider === 'pix_manual' ? 'Comprovante e aprovação humana. Não é confirmação bancária.' : i.provider === 'resend' ? 'Templates, aceitação, entrega, bounce e complaint simulados.' : i.provider === 'evolution' ? 'Instância, QR demonstrativo, mensagens e handoff. Evolution ≠ API oficial Meta.' : 'Interface desacoplada preparada. Provedor não conectado; depende de homologação.'}</p>}</div>
        <Field label="Credencial do provedor"><Input disabled placeholder="configuração futura no servidor" /></Field>
        <div className="row"><Button disabled={!edit} onClick={() => run(() => updateIntegration(t.tenantId, i, 'simulada', 'Teste de conexão concluído localmente (simulado); nenhum provedor consultado.'), 'Teste registrado (simulado).')}>Testar conexão (simulado)</Button><Button disabled={!edit || i.status === 'desconectada'} onClick={() => disconnect(i)}>Desconectar</Button></div>
        <details><summary>Logs sanitizados ({i.logs.length})</summary><Timeline items={[...i.logs].reverse().map((l) => ({ time: formatDateTime(l.at, t.org.timezone), title: l.level, body: sanitizeLog(l.message) }))} /></details>
      </div></Section>
    })}</div>
  </div>
}
