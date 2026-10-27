import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { usePlatformCollection } from '@/data/store'
import { PageHeader, Segmented, Alert, Section, Progress, Badge } from '@/ui/core'
import { formatBRL } from '@/lib/money'
import { formatCivil, todayCivil } from '@/lib/dates'
import { arr, addDays, churn, delinquency, integrationFailures, latestUsage, limitLevel, mrr, mrrSeries, trialConversion, usageRatios, isPayingOn, type UsageKey } from './metrics'
import { Guard, MetricCard, pct } from './lib'

const PERIODS = [{ value: '30', label: '30 dias' }, { value: '90', label: '90 dias' }, { value: '365', label: '12 meses' }]
const USAGE_LABEL: Record<UsageKey, string> = { storageGb: 'Armazenamento', messages: 'Mensagens', aiCredits: 'Créditos de IA' }

export function MasterDashboard() {
  return <Guard area="dashboard" title="Dashboard da plataforma"><Dashboard /></Guard>
}

function Dashboard() {
  const subs = usePlatformCollection('subscriptions')
  const plans = usePlatformCollection('plans')
  const invoices = usePlatformCollection('saasInvoices')
  const usage = usePlatformCollection('usage')
  const integrations = usePlatformCollection('integrations')
  const orgs = usePlatformCollection('organizations')
  const [period, setPeriod] = useState('30')
  const today = todayCivil()
  const start = addDays(today, -Number(period))
  const periodText = `${formatCivil(start)} a ${formatCivil(today)} (${PERIODS.find((p) => p.value === period)?.label})`

  const m = useMemo(() => {
    const cur = mrr(subs, plans, today)
    const prev = mrr(subs, plans, start)
    const paying = subs.filter((s) => isPayingOn(s, today))
    const trials = subs.filter((s) => s.status === 'trial')
    const usageRows = orgs.filter((o) => o.status !== 'cancelled').map((o) => ({ o, u: latestUsage(usage, o.id), plan: plans.find((p) => p.id === o.planId) }))
    const usageAgg = (['storageGb', 'messages', 'aiCredits'] as UsageKey[]).map((k) => {
      const used = usageRows.reduce((a, r) => a + (r.u?.[k] ?? 0), 0)
      const limitKey = k === 'storageGb' ? 'storageGb' : k === 'messages' ? 'messagesMonth' : 'aiCreditsMonth'
      const cap = usageRows.reduce((a, r) => a + (r.plan?.limits[limitKey] ?? 0), 0)
      const levels = usageRows.map((r) => limitLevel(usageRatios(r.u, r.plan)[k]))
      return { k, used, cap, atencao: levels.filter((l) => l === 'atencao').length, excedido: levels.filter((l) => l === 'excedido').length }
    })
    return {
      cur, prev, paying: paying.length, trials: trials.length, churn: churn(subs, start, today), conv: trialConversion(subs, start, today),
      del: delinquency(invoices, start, today), usageAgg, usageMonth: usage.map((u) => u.month).sort().at(-1), integ: integrationFailures(integrations),
      series: mrrSeries(subs, plans, today, 6),
    }
  }, [subs, plans, invoices, usage, integrations, orgs, today, start])

  const delta = m.prev ? (m.cur - m.prev) / m.prev : null
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Dashboard da plataforma" subtitle="Receita recorrente da Qlinic (Contexto A). Receita de pacientes das clínicas não entra nestas métricas."
        actions={<div data-tour="primary-action"><Segmented label="Período" value={period} onChange={setPeriod} options={PERIODS} /></div>} />
      <div className="grid grid-4">
        <MetricCard label="MRR" value={formatBRL(m.cur)} foot={delta == null ? 'sem base anterior' : `${delta >= 0 ? '+' : ''}${pct(delta)} vs. início do período`}
          definition="Soma das assinaturas ativas (inadimplentes excluídas) com preço do ciclo normalizado para mês (trimestral ÷ 3, anual ÷ 12), aplicando cupons e descontos válidos. Exclui testes, pausadas, canceladas e qualquer valor transacionado pelas clínicas com pacientes."
          period={`Fotografia em ${formatCivil(today)}; comparação com ${formatCivil(start)}.`} />
        <MetricCard label="ARR" value={formatBRL(arr(m.cur))} foot="MRR × 12"
          definition="MRR atual × 12. Nunca calculado a partir de volume financeiro transacionado pelas clínicas." period={`Fotografia em ${formatCivil(today)}.`} />
        <MetricCard label="Clientes pagantes" value={m.paying} foot={`${m.trials} em teste`}
          definition="Assinaturas ativas na data (exclui inadimplentes, pausadas, canceladas e testes)." period={`Em ${formatCivil(today)}.`} />
        <MetricCard label="Conversão de teste" value={pct(m.conv.rate)} foot={`${m.conv.converted} de ${m.conv.ended} testes encerrados`}
          definition="Testes convertidos ÷ testes encerrados (convertidos + expirados/cancelados) cujo encerramento ocorreu no período. Testes em andamento não entram." period={periodText} />
        <MetricCard label="Churn" value={pct(m.churn.rate)} foot={`${m.churn.churned} cancelada(s) / ${m.churn.base} no início`}
          definition="Assinaturas canceladas no período ÷ assinaturas pagantes no início do período (churn de logos, não de receita)." period={periodText} />
        <MetricCard label="Inadimplência SaaS" value={formatBRL(m.del.overdueCents)} foot={`${m.del.overdueCount} fatura(s) · ${m.del.tenants} cliente(s) · ${pct(m.del.rate)} do devido`}
          definition="Faturas SaaS vencidas e não pagas (status vencida, ou aberta com vencimento passado). Percentual = vencido ÷ total com vencimento no período, excluindo canceladas e estornadas." period={`Vencido até ${formatCivil(today)}; base de vencimentos: ${periodText}.`} />
        <MetricCard label="Integrações com falha" value={m.integ.unhealthy} foot={`${m.integ.failedQueue} itens na fila de falhas · ${m.integ.retrying} em retentativa`}
          definition="Integrações (plataforma e clínicas) com status erro, degradada ou expirada; soma das filas simuladas de falha e retentativa." period="Estado atual (simulado)." />
        <MetricCard label="Novos testes no período" value={subs.filter((s) => s.trial && s.trial.start > start).length} foot="iniciados no período"
          definition="Assinaturas cujo teste começou dentro do período." period={periodText} />
      </div>

      <Section title="MRR por mês" id="mrr-chart">
        <MrrChart series={m.series} />
        <p className="small muted">Valor no último dia de cada mês (mês corrente: até hoje), com plano e ciclo atuais de cada assinatura — o protótipo não guarda histórico de troca de plano.</p>
      </Section>

      <Section title={`Uso vs. limites dos planos (${m.usageMonth ?? '—'})`} id="usage">
        <div className="pl-usage">
          {m.usageAgg.map((u) => {
            const r = u.cap ? u.used / u.cap : 0
            return [
              <span key={`${u.k}l`} className="strong">{USAGE_LABEL[u.k]}</span>,
              <Progress key={`${u.k}p`} value={u.used} max={u.cap || 1} label={`${USAGE_LABEL[u.k]}: ${pct(r)} da franquia somada`} tone={limitLevel(r) === 'excedido' ? 'danger' : limitLevel(r) === 'atencao' ? 'warn' : undefined} />,
              <span key={`${u.k}v`} className="small num">{u.used.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} / {u.cap.toLocaleString('pt-BR')} · {u.atencao > 0 && <Badge tone="warning">{u.atencao} ≥ 80%</Badge>} {u.excedido > 0 && <Badge tone="danger">{u.excedido} ≥ 100%</Badge>}</span>,
            ]
          })}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>Definição: consumo do mês mais recente somado entre contratantes não cancelados ÷ soma das franquias dos respectivos planos. Contagens indicam contratantes com uso ≥ 80% ou ≥ 100% do próprio limite. Detalhe em <Link to="/master/custos">Custos e margem</Link>.</p>
      </Section>
      <Alert tone="neutral" title="Separação de contextos">Valores pagos por pacientes às clínicas (Contexto B) nunca compõem MRR, ARR ou inadimplência da plataforma.</Alert>
    </div>
  )
}

/** Barras simples (série única, sem legenda): hover/foco mostra valor; tabela alternativa. */
function MrrChart({ series }: { series: { month: string; cents: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 640, H = 220, pad = { l: 56, r: 8, t: 24, b: 28 }
  const max = Math.max(1, ...series.map((s) => s.cents))
  const bw = (W - pad.l - pad.r) / series.length
  const y = (c: number) => pad.t + (H - pad.t - pad.b) * (1 - c / max)
  const label = (ym: string) => new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${ym}-15T12:00:00Z`))
  return (
    <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
      <div className="pl-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`MRR dos últimos ${series.length} meses; máximo ${formatBRL(max)}. Tabela com os valores abaixo.`}>
          {[0, 0.5, 1].map((f) => <g key={f}><line className="grid-line" x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} /><text className="axis-text" x={pad.l - 6} y={y(max * f) + 4} textAnchor="end">{f === 0 ? 'R$ 0' : `R$ ${Math.round((max * f) / 100).toLocaleString('pt-BR')}`}</text></g>)}
          {series.map((s, i) => {
            const x = pad.l + i * bw + bw * 0.2, w = bw * 0.6, top = y(s.cents), h = Math.max(0, y(0) - top)
            const r = Math.min(4, h / 2, w / 2)
            const last = i === series.length - 1
            return (
              <g key={s.month}>
                <path className={`bar${hover != null && hover !== i ? ' dim' : ''}`} d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${y(0)} Z`} />
                {(last || hover === i) && <text className="val-text" x={x + w / 2} y={top - 6} textAnchor="middle">{formatBRL(s.cents).replace(/,\d\d$/, '')}</text>}
                <text className="axis-text" x={x + w / 2} y={H - 8} textAnchor="middle">{label(s.month)}</text>
                <rect className="bar-hit" x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} tabIndex={0} aria-label={`${label(s.month)}: ${formatBRL(s.cents)}`}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
              </g>
            )
          })}
        </svg>
      </div>
      <details>
        <summary>Ver tabela de valores</summary>
        <table className="table">
          <caption className="sr-only">MRR por mês</caption>
          <thead><tr><th scope="col">Mês</th><th scope="col" className="num">MRR</th></tr></thead>
          <tbody>{series.map((s) => <tr key={s.month}><td>{label(s.month)}</td><td className="num">{formatBRL(s.cents)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  )
}
