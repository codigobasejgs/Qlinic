// Diálogo de mudança de plano com explicação do impacto. Plano/flag ≠ permissão do usuário.
import { useState } from 'react'
import { db, usePlatformCollection } from '@/data/store'
import type { Organization } from '@/domain/types'
import { MODULE_LABEL } from '@/domain/types'
import type { PlanLimits, UsageRecord } from '@/domain/platform'
import { Alert, Badge, Button, Field, Select } from '@/ui/core'
import { Dialog, useAction } from '@/ui/overlay'
import { formatBRL } from '@/lib/money'
import { latestUsage, planChangeImpact } from './metrics'
import { changePlan } from './actions'
import { usePlatformMe } from './lib'

export const LIMIT_LABEL: Record<keyof PlanLimits, string> = { users: 'Usuários', professionals: 'Profissionais', units: 'Unidades', storageGb: 'Armazenamento (GB)', messagesMonth: 'Mensagens/mês', aiCreditsMonth: 'Créditos de IA/mês' }
const RULE: Record<string, string> = { imediato_pro_rata: 'Imediato, com cobrança proporcional (pro rata) no próximo ciclo', proximo_ciclo: 'Vale a partir do próximo ciclo', imediato_sem_reembolso: 'Imediato, sem reembolso do ciclo atual', imediato: 'Imediato (mesmo valor)' }

/** Uso atual do tenant comparável aos limites (apenas contagens não clínicas). */
export function currentUsageFor(o: Organization, usage: UsageRecord[]) {
  const u = latestUsage(usage, o.id)
  return {
    users: db.list(o.id, 'staff').filter((s) => s.active).length,
    professionals: db.list(o.id, 'professionals').filter((p) => p.active).length,
    units: db.list(o.id, 'units').length,
    storageGb: u?.storageGb, messagesMonth: u?.messages, aiCreditsMonth: u?.aiCredits,
  } as Partial<Record<keyof PlanLimits, number>>
}

export function PlanChangeDialog({ org, open, onClose }: { org: Organization; open: boolean; onClose: () => void }) {
  const plans = usePlatformCollection('plans')
  const usage = usePlatformCollection('usage')
  const me = usePlatformMe()
  const run = useAction()
  const options = plans.filter((p) => p.active && p.id !== org.planId)
  const [planId, setPlanId] = useState(options[0]?.id ?? '')
  const from = plans.find((p) => p.id === org.planId)
  const to = plans.find((p) => p.id === planId)
  const imp = to ? planChangeImpact(org.modules, from, to, currentUsageFor(org, usage)) : null
  const over = imp?.limits.filter((l) => l.over) ?? []
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={`Mudar plano — ${org.name}`} description={`Plano atual: ${from?.name ?? org.planId}`}
      footer={<><Button onClick={onClose}>Voltar</Button><Button variant="primary" disabled={!to} onClick={() => { if (run(() => changePlan(org.id, planId, me.actor), `Plano alterado para ${to?.name}. Auditoria registrada.`)) onClose() }}>Confirmar mudança</Button></>}>
      <div className="stack">
        {options.length === 0 ? <Alert tone="warning">Não há outro plano ativo disponível.</Alert> : (
          <Field label="Novo plano"><Select value={planId} onChange={(e) => setPlanId(e.target.value)}>{options.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatBRL(p.prices.mensal)}/mês (v{p.version})</option>)}</Select></Field>
        )}
        {imp && to && (
          <>
            <div className="row"><Badge tone={imp.direction === 'upgrade' ? 'success' : imp.direction === 'downgrade' ? 'warning' : 'neutral'}>{imp.direction === 'upgrade' ? 'Upgrade' : imp.direction === 'downgrade' ? 'Downgrade' : 'Lateral'}</Badge><span className="small">{RULE[imp.rule]}</span></div>
            <div className="grid grid-2">
              <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}>
                <strong>Módulos que deixam de estar disponíveis ({imp.lostModules.length})</strong>
                {imp.lostModules.length ? <div className="pl-chips">{imp.lostModules.map((m) => <Badge key={m} tone="danger">{MODULE_LABEL[m]}</Badge>)}</div> : <span className="small muted">Nenhum.</span>}
                <strong>Módulos que passam a poder ser habilitados ({imp.newlyAvailable.length})</strong>
                {imp.newlyAvailable.length ? <div className="pl-chips">{imp.newlyAvailable.map((m) => <Badge key={m} tone="success">{MODULE_LABEL[m]}</Badge>)}</div> : <span className="small muted">Nenhum.</span>}
                <span className="small muted">Módulos do contratante após a mudança = interseção dos atuais com o novo plano ({imp.nextModules.length}). Novos módulos não são ligados automaticamente — a clínica habilita nas configurações.</span>
              </div>
              <table className="table">
                <caption className="sr-only">Comparação de limites</caption>
                <thead><tr><th scope="col">Limite</th><th scope="col" className="num">Atual</th><th scope="col" className="num">Novo</th><th scope="col" className="num">Uso</th></tr></thead>
                <tbody>{imp.limits.map((l) => <tr key={l.key}><td>{LIMIT_LABEL[l.key]}</td><td className="num">{l.from.toLocaleString('pt-BR')}</td><td className="num">{l.to.toLocaleString('pt-BR')}</td><td className="num">{l.current == null ? '—' : l.current.toLocaleString('pt-BR')}{l.over && <> <Badge tone="danger">acima</Badge></>}</td></tr>)}</tbody>
              </table>
            </div>
            {over.length > 0 && <Alert tone="warning" title="Uso atual acima do novo limite">{over.map((l) => LIMIT_LABEL[l.key]).join(', ')}. Nada é apagado: a clínica fica sem novas inclusões nesses itens até ajustar o uso ou contratar excedente/upgrade (regra comercial a validar).</Alert>}
            <Alert tone="info" title="Plano ≠ permissão">O plano define quais módulos e limites o contratante pode usar (feature flags). Ele não concede nem remove permissões dos usuários da clínica: cada pessoa continua precisando do papel adequado (ex.: recepção não passa a ver financeiro porque o módulo foi incluído).</Alert>
          </>
        )}
      </div>
    </Dialog>
  )
}
