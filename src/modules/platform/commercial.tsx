// Testes, assinaturas e cobrança SaaS (Contexto A — gateways da própria Qlinic, simulados).
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { usePlatformCollection } from '@/data/store'
import type { BillingCycle, SaasInvoice, Subscription } from '@/domain/platform'
import { PROVIDERS, CAP_LABEL } from '@/domain/payments'
import { Alert, Badge, Button, EmptyState, Field, Input, PageHeader, Section, Select, SimBadge, Tabs, TabPanel, Timeline, Kpi } from '@/ui/core'
import { Dialog, useAction, useConfirm } from '@/ui/overlay'
import { DataTable, type Column } from '@/ui/table'
import { formatBRL } from '@/lib/money'
import { formatCivil, formatDateTime, todayCivil } from '@/lib/dates'
import { addDays, isOverdue, monthlyCents, reconciliationIssue, trialDaysLeft } from './metrics'
import { applyCoupon, cancelSubscription, changeCycle, convertTrial, createCoupon, expireTrial, extendTrial, issueInvoice, pauseSubscription, payInvoice, reactivateSubscription, refundInvoice, removeCoupon, setDiscount, setReconciled, toggleCoupon } from './actions'
import { CYCLE_LABEL, Guard, INT_STATUS, INVOICE_STATUS, SUB_STATUS, usePlatformMe } from './lib'

function useOrgName() {
  const orgs = usePlatformCollection('organizations')
  return (id: string) => orgs.find((o) => o.id === id)?.name ?? id
}

// ======================= Testes =======================
export function TrialsPage() {
  return <Guard area="testes" title="Testes (trial)"><Trials /></Guard>
}
function Trials() {
  const subs = usePlatformCollection('subscriptions')
  const plans = usePlatformCollection('plans')
  const name = useOrgName()
  const me = usePlatformMe()
  const run = useAction()
  const confirm = useConfirm()
  const today = todayCivil()
  const [show, setShow] = useState<'ativos' | 'todos'>('ativos')
  const [ext, setExt] = useState<Subscription | null>(null)
  const [conv, setConv] = useState<Subscription | null>(null)
  const rows = subs.filter((s) => s.trial && (show === 'todos' || s.status === 'trial' || s.status === 'expirada'))
  const cols: Column<Subscription>[] = [
    { id: 't', header: 'Contratante', cell: (s) => <Link to={`/master/contratantes/${s.tenantId}`}>{name(s.tenantId)}</Link>, value: (s) => name(s.tenantId) },
    { id: 'st', header: 'Status', cell: (s) => <Badge tone={SUB_STATUS[s.status][1]}>{SUB_STATUS[s.status][0]}</Badge>, value: (s) => s.status },
    { id: 'p', header: 'Plano', cell: (s) => plans.find((p) => p.id === s.planId)?.name ?? s.planId, value: (s) => s.planId },
    { id: 'i', header: 'Início', cell: (s) => formatCivil(s.trial!.start), value: (s) => s.trial!.start },
    { id: 'f', header: 'Fim', cell: (s) => formatCivil(s.trial!.end), value: (s) => s.trial!.end },
    { id: 'd', header: 'Dias restantes', num: true, cell: (s) => { if (s.trial!.convertedAt) return 'convertido'; const d = trialDaysLeft(s, today)!; return d < 0 ? <Badge tone="danger">vencido há {-d}d</Badge> : d <= 3 ? <Badge tone="warning">{d}</Badge> : d }, value: (s) => trialDaysLeft(s, today) },
    { id: 'e', header: 'Extensões', num: true, cell: (s) => s.trial!.extensions.length, value: (s) => s.trial!.extensions.length },
  ]
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Testes (trial)" subtitle="Duração configurável na criação do contratante; extensão com motivo, expiração e conversão em assinatura paga." />
      <div className="row between">
        <Tabs label="Filtro de testes" value={show} onChange={(v) => setShow(v as 'ativos' | 'todos')} tabs={[{ id: 'ativos', label: 'Em andamento e expirados' }, { id: 'todos', label: 'Todos (inclui convertidos)' }]} />
        <SimBadge />
      </div>
      <DataTable caption="Testes" rows={rows} columns={cols} rowKey={(s) => s.id} empty={<EmptyState title="Nenhum teste nesta visão" />}
        rowActions={(s) => s.status === 'trial' || s.status === 'expirada' ? <>
          <Button size="sm" variant="primary" data-tour="primary-action" onClick={() => setConv(s)}>Converter</Button>
          <Button size="sm" onClick={() => setExt(s)}>Estender</Button>
          {s.status === 'trial' && <Button size="sm" variant="ghost" onClick={async () => { const r = await confirm({ title: `Expirar teste de ${name(s.tenantId)}?`, body: 'O teste termina hoje. Dados da clínica são preservados; o contratante pode converter depois.', confirmLabel: 'Expirar', danger: true }); if (r.ok) run(() => expireTrial(s.id, me.actor), 'Teste expirado. Dados preservados.') }}>Expirar</Button>}
        </> : null} />
      {ext && <ExtendDialog sub={ext} onClose={() => setExt(null)} />}
      {conv && (
        <ConvertDialog sub={conv} onClose={() => setConv(null)} />
      )}
    </div>
  )
}
function ExtendDialog({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  const me = usePlatformMe()
  const run = useAction()
  const [days, setDays] = useState('7')
  const [reason, setReason] = useState('')
  const base = sub.trial!.end < todayCivil() ? todayCivil() : sub.trial!.end
  return (
    <Dialog open onClose={onClose} title="Estender teste" description={`Fim atual: ${formatCivil(sub.trial!.end)}. Novo fim: ${Number(days) > 0 ? formatCivil(addDays(base, Number(days))) : '—'}`}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={reason.trim().length < 5} onClick={() => { if (run(() => extendTrial(sub.id, Number(days), reason, me.actor), 'Teste estendido e registrado.')) onClose() }}>Estender</Button></>}>
      <div className="stack">
        <Field label="Dias adicionais" hint="1 a 60."><Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <Field label="Motivo" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: migração de dados em andamento" /></Field>
        {sub.trial!.extensions.length > 0 && <Timeline items={sub.trial!.extensions.map((x) => ({ time: formatDateTime(x.at), title: `+${x.days} dias`, body: `${x.reason} — ${x.by}` }))} />}
      </div>
    </Dialog>
  )
}
function ConvertDialog({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  const me = usePlatformMe()
  const plans = usePlatformCollection('plans')
  const run = useAction()
  const [cycle, setCycle] = useState<BillingCycle>(sub.cycle)
  const plan = plans.find((p) => p.id === sub.planId)
  return (
    <Dialog open onClose={onClose} title="Converter teste em assinatura"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => { if (run(() => convertTrial(sub.id, cycle, me.actor), 'Assinatura ativada e fatura emitida (simulada).')) onClose() }}>Converter e emitir fatura</Button></>}>
      <div className="stack">
        <Field label="Ciclo"><Select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}>{(['mensal', 'trimestral', 'anual'] as BillingCycle[]).map((c) => <option key={c} value={c}>{CYCLE_LABEL[c]} — {plan ? formatBRL(plan.prices[c]) : '—'}</option>)}</Select></Field>
        <p className="small">Plano {plan?.name}. Status passa a “Ativa” e uma fatura SaaS aberta é gerada com vencimento em 5 dias.</p>
        <SimBadge />
      </div>
    </Dialog>
  )
}

// ======================= Assinaturas =======================
export function SubscriptionsPage() {
  return <Guard area="assinaturas" title="Assinaturas"><Subscriptions /></Guard>
}
function Subscriptions() {
  const subs = usePlatformCollection('subscriptions')
  const plans = usePlatformCollection('plans')
  const name = useOrgName()
  const [tab, setTab] = useState('assinaturas')
  const [status, setStatus] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const today = todayCivil()
  const rows = subs.filter((s) => !status || s.status === status)
  const cols: Column<Subscription>[] = [
    { id: 't', header: 'Contratante', cell: (s) => name(s.tenantId), value: (s) => name(s.tenantId) },
    { id: 's', header: 'Status', cell: (s) => <Badge tone={SUB_STATUS[s.status][1]}>{SUB_STATUS[s.status][0]}</Badge>, value: (s) => s.status },
    { id: 'p', header: 'Plano', cell: (s) => plans.find((p) => p.id === s.planId)?.name ?? s.planId, value: (s) => s.planId },
    { id: 'c', header: 'Ciclo', cell: (s) => CYCLE_LABEL[s.cycle], value: (s) => s.cycle },
    { id: 'v', header: 'Vencimento', cell: (s) => formatCivil(s.currentPeriodEnd), value: (s) => s.currentPeriodEnd },
    { id: 'm', header: 'Valor/mês', num: true, cell: (s) => formatBRL(monthlyCents(s, plans.find((p) => p.id === s.planId), today)), value: (s) => monthlyCents(s, plans.find((p) => p.id === s.planId), today) },
    { id: 'cp', header: 'Cupom/desconto', cell: (s) => [s.coupon && `${s.coupon.code} ${s.coupon.percent}%`, s.discount && `−${s.discount.percent}%`].filter(Boolean).join(' · ') || '—' },
  ]
  const current = subs.find((s) => s.id === sel)
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Assinaturas" subtitle="Ciclo, vencimento, cupons, descontos com validade, pausa, cancelamento e reativação. Cancelar não apaga dados." />
      <Tabs label="Seções" value={tab} onChange={setTab} tabs={[{ id: 'assinaturas', label: 'Assinaturas', badge: subs.length }, { id: 'cupons', label: 'Cupons' }]} />
      <TabPanel>
        {tab === 'assinaturas' ? (
          <div className="stack">
            <div className="form-grid"><Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos</option>{Object.entries(SUB_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field></div>
            <DataTable caption="Assinaturas" rows={rows} columns={cols} rowKey={(s) => s.id} onRowClick={(s) => setSel(s.id)} exportName="assinaturas" />
          </div>
        ) : <Coupons />}
      </TabPanel>
      {current && <SubscriptionDrawer sub={current} onClose={() => setSel(null)} />}
    </div>
  )
}

function SubscriptionDrawer({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  const plans = usePlatformCollection('plans')
  const coupons = usePlatformCollection('coupons')
  const name = useOrgName()
  const me = usePlatformMe()
  const run = useAction()
  const confirm = useConfirm()
  const today = todayCivil()
  const [code, setCode] = useState('')
  const [disc, setDisc] = useState({ percent: '10', validUntil: addDays(today, 90), reason: '' })
  const [cancel, setCancel] = useState({ date: sub.currentPeriodEnd, reason: '' })
  const plan = plans.find((p) => p.id === sub.planId)
  const active = sub.status === 'ativa' || sub.status === 'inadimplente'
  return (
    <Dialog open onClose={onClose} drawer size="lg" title={`Assinatura — ${name(sub.tenantId)}`} description={`${plan?.name} · ${CYCLE_LABEL[sub.cycle]} · ${SUB_STATUS[sub.status][0]}`}>
      <div className="stack">
        <div className="grid grid-2">
          <Kpi label="Valor mensal normalizado" value={formatBRL(monthlyCents(sub, plan, today))} foot={`Ciclo ${CYCLE_LABEL[sub.cycle].toLowerCase()}: ${plan ? formatBRL(plan.prices[sub.cycle]) : '—'} (sem descontos)`} />
          <Kpi label="Vencimento do período" value={formatCivil(sub.currentPeriodEnd)} foot={sub.cancelAt ? `Cancelamento: ${formatCivil(sub.cancelAt)}` : undefined} />
        </div>
        <Section title="Ciclo">
          <div className="row">{(['mensal', 'trimestral', 'anual'] as BillingCycle[]).map((c) => <Button key={c} size="sm" variant={sub.cycle === c ? 'primary' : 'secondary'} aria-pressed={sub.cycle === c} onClick={() => run(() => changeCycle(sub.id, c, me.actor), `Ciclo alterado para ${CYCLE_LABEL[c]} (vale no próximo vencimento).`)}>{CYCLE_LABEL[c]}</Button>)}</div>
        </Section>
        <Section title="Cupom">
          {sub.coupon ? <div className="row"><Badge tone="brand">{sub.coupon.code} · {sub.coupon.percent}% até {formatCivil(sub.coupon.validUntil)}</Badge>{sub.coupon.validUntil < today && <Badge tone="warning">vencido</Badge>}<Button size="sm" variant="ghost" onClick={() => run(() => removeCoupon(sub.id, me.actor), 'Cupom removido.')}>Remover</Button></div> : (
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <Field label="Código do cupom" className="grow"><Input list="pl-coupons" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field>
              <datalist id="pl-coupons">{coupons.filter((c) => c.active).map((c) => <option key={c.id} value={c.code} />)}</datalist>
              <Button onClick={() => run(() => { applyCoupon(sub.id, code, me.actor); setCode('') }, 'Cupom aplicado.')}>Aplicar</Button>
            </div>
          )}
        </Section>
        <Section title="Desconto manual">
          {sub.discount && <p className="small">Atual: {sub.discount.percent}% até {formatCivil(sub.discount.validUntil)} — {sub.discount.reason}</p>}
          <div className="form-grid">
            <Field label="Percentual"><Input type="number" min={1} max={100} value={disc.percent} onChange={(e) => setDisc({ ...disc, percent: e.target.value })} /></Field>
            <Field label="Válido até"><Input type="date" value={disc.validUntil} onChange={(e) => setDisc({ ...disc, validUntil: e.target.value })} /></Field>
            <Field label="Motivo" required><Input value={disc.reason} onChange={(e) => setDisc({ ...disc, reason: e.target.value })} /></Field>
          </div>
          <div className="form-actions"><Button onClick={() => run(() => setDiscount(sub.id, Number(disc.percent), disc.validUntil, disc.reason, me.actor), 'Desconto registrado.')}>Aplicar desconto</Button></div>
        </Section>
        <Section title="Pausa, cancelamento e reativação">
          <div className="stack">
            <div className="row">
              {active && <Button onClick={async () => { const r = await confirm({ title: 'Pausar assinatura?', body: 'A cobrança fica suspensa; dados e exportação continuam disponíveis.', requireReason: true, confirmLabel: 'Pausar' }); if (r.ok) run(() => pauseSubscription(sub.id, r.reason ?? '', me.actor), 'Assinatura pausada.') }}>Pausar</Button>}
              {(sub.status === 'pausada' || sub.status === 'cancelada' || sub.status === 'expirada') && <Button variant="primary" onClick={() => run(() => reactivateSubscription(sub.id, me.actor), 'Assinatura reativada.')}>Reativar</Button>}
              {plan && sub.status !== 'trial' && <Button variant="ghost" onClick={() => run(() => issueInvoice(sub.id, me.actor), 'Fatura avulsa emitida (simulada).')}>Emitir fatura avulsa</Button>}
            </div>
            {sub.status !== 'cancelada' && (
              <fieldset><legend>Cancelar</legend>
                <div className="form-grid">
                  <Field label="Data efetiva" hint="Hoje ou passado = imediato; futura = agendado."><Input type="date" value={cancel.date} onChange={(e) => setCancel({ ...cancel, date: e.target.value })} /></Field>
                  <Field label="Motivo" required><Input value={cancel.reason} onChange={(e) => setCancel({ ...cancel, reason: e.target.value })} /></Field>
                </div>
                <div className="form-actions"><Button variant="danger" onClick={async () => { const r = await confirm({ title: 'Confirmar cancelamento?', body: 'Os dados da clínica NÃO são apagados. Exportação e continuidade ficam disponíveis (política a validar).', danger: true, confirmLabel: 'Cancelar assinatura' }); if (r.ok) run(() => cancelSubscription(sub.id, cancel.date, cancel.reason, me.actor), 'Cancelamento registrado.') }}>Cancelar assinatura</Button></div>
              </fieldset>
            )}
          </div>
        </Section>
        <Section title="Histórico"><Timeline items={[...sub.history].reverse().map((h) => ({ time: formatDateTime(h.at), title: h.event, body: h.by }))} /></Section>
      </div>
    </Dialog>
  )
}

function Coupons() {
  const coupons = usePlatformCollection('coupons')
  const me = usePlatformMe()
  const run = useAction()
  const today = todayCivil()
  const [f, setF] = useState({ code: '', percent: '15', validUntil: addDays(today, 30), maxUses: '20' })
  return (
    <div className="stack">
      <fieldset><legend>Criar cupom</legend>
        <div className="form-grid">
          <Field label="Código" required><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="EX: BEMVINDO15" /></Field>
          <Field label="Desconto (%)"><Input type="number" min={1} max={100} value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} /></Field>
          <Field label="Válido até"><Input type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
          <Field label="Usos máximos"><Input type="number" min={1} value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} /></Field>
        </div>
        <div className="form-actions"><Button variant="primary" icon={<Plus />} onClick={() => run(() => { createCoupon({ code: f.code, percent: Number(f.percent), validUntil: f.validUntil, maxUses: Number(f.maxUses) }, me.actor); setF({ ...f, code: '' }) }, 'Cupom criado.')}>Criar cupom</Button></div>
      </fieldset>
      <DataTable caption="Cupons" rows={coupons} rowKey={(c) => c.id} columns={[
        { id: 'c', header: 'Código', cell: (c) => <span className="mono">{c.code}</span>, value: (c) => c.code },
        { id: 'p', header: 'Desconto', num: true, cell: (c) => `${c.percent}%`, value: (c) => c.percent },
        { id: 'v', header: 'Validade', cell: (c) => <>{formatCivil(c.validUntil)} {c.validUntil < today && <Badge tone="warning">vencido</Badge>}</>, value: (c) => c.validUntil },
        { id: 'u', header: 'Usos', num: true, cell: (c) => `${c.uses}/${c.maxUses}`, value: (c) => c.uses },
        { id: 's', header: 'Status', cell: (c) => <Badge tone={c.active ? 'success' : 'neutral'}>{c.active ? 'Ativo' : 'Inativo'}</Badge>, value: (c) => String(c.active) },
      ]} rowActions={(c) => <Button size="sm" variant="ghost" onClick={() => run(() => toggleCoupon(c.id, me.actor), c.active ? 'Cupom desativado.' : 'Cupom ativado.')}>{c.active ? 'Desativar' : 'Ativar'}</Button>} />
    </div>
  )
}

// ======================= Cobrança SaaS =======================
export function SaasBillingPage() {
  return <Guard area="cobranca" title="Cobrança SaaS"><Billing /></Guard>
}
function Billing() {
  const invoices = usePlatformCollection('saasInvoices')
  const integrations = usePlatformCollection('integrations')
  const name = useOrgName()
  const me = usePlatformMe()
  const run = useAction()
  const confirm = useConfirm()
  const today = todayCivil()
  const [f, setF] = useState({ status: '', gateway: '', competence: '', recon: '' })
  const competences = useMemo(() => [...new Set(invoices.map((i) => i.competence))].sort().reverse(), [invoices])
  const statusOf = (i: SaasInvoice) => (isOverdue(i, today) ? 'vencida' : i.status)
  const rows = invoices.filter((i) => (!f.status || statusOf(i) === f.status) && (!f.gateway || i.gateway === f.gateway) && (!f.competence || i.competence === f.competence) && (!f.recon || (f.recon === 'div' ? !!reconciliationIssue(i, today) : f.recon === 'sim' ? i.reconciled : !i.reconciled)))
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  const totals = { open: rows.filter((i) => statusOf(i) === 'aberta').reduce((a, i) => a + i.amountCents, 0), overdue: rows.filter((i) => statusOf(i) === 'vencida').reduce((a, i) => a + i.amountCents, 0), paid: rows.filter((i) => i.status === 'paga').reduce((a, i) => a + i.amountCents, 0), div: rows.filter((i) => reconciliationIssue(i, today)).length }
  const [view, setView] = useState<SaasInvoice | null>(null)
  const cols: Column<SaasInvoice>[] = [
    { id: 'n', header: 'Fatura', cell: (i) => <span className="mono">{i.number}</span>, value: (i) => i.number },
    { id: 't', header: 'Contratante', cell: (i) => name(i.tenantId), value: (i) => name(i.tenantId) },
    { id: 'c', header: 'Competência', cell: (i) => i.competence, value: (i) => i.competence },
    { id: 'd', header: 'Vencimento', cell: (i) => formatCivil(i.dueDate), value: (i) => i.dueDate },
    { id: 'v', header: 'Valor', num: true, cell: (i) => formatBRL(i.amountCents), value: (i) => i.amountCents },
    { id: 's', header: 'Status', cell: (i) => <Badge tone={INVOICE_STATUS[statusOf(i)][1]}>{INVOICE_STATUS[statusOf(i)][0]}</Badge>, value: (i) => statusOf(i) },
    { id: 'g', header: 'Gateway', cell: (i) => PROVIDERS[i.gateway].name, value: (i) => i.gateway },
    { id: 'r', header: 'Conciliação', cell: (i) => { const d = reconciliationIssue(i, today); return i.reconciled ? <Badge tone="success">Conciliada</Badge> : d ? <Badge tone="warning">{d}</Badge> : <Badge>Pendente</Badge> }, value: (i) => (i.reconciled ? 1 : 0) },
  ]
  const platformGw = integrations.filter((i) => i.context === 'plataforma' && i.provider !== 'resend')
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Cobrança SaaS" subtitle="Faturas da Qlinic para as clínicas (Contexto A). Contas e gateways da plataforma são separados das contas das clínicas." actions={<SimBadge />} />
      <div className="grid grid-4">
        <Kpi label="Em aberto (filtro)" value={formatBRL(totals.open)} />
        <Kpi label="Vencido (filtro)" value={formatBRL(totals.overdue)} />
        <Kpi label="Pago (filtro)" value={formatBRL(totals.paid)} />
        <Kpi label="Divergências de conciliação" value={totals.div} foot="paga sem conciliação, conciliada sem pagamento, sem referência ou vencida" />
      </div>
      <div className="form-grid" role="search" aria-label="Filtros de faturas">
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Todos</option>{Object.entries(INVOICE_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Gateway"><Select value={f.gateway} onChange={(e) => setF({ ...f, gateway: e.target.value })}><option value="">Todos</option>{Object.values(PROVIDERS).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</Select></Field>
        <Field label="Competência"><Select value={f.competence} onChange={(e) => setF({ ...f, competence: e.target.value })}><option value="">Todas</option>{competences.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
        <Field label="Conciliação"><Select value={f.recon} onChange={(e) => setF({ ...f, recon: e.target.value })}><option value="">Todas</option><option value="sim">Conciliadas</option><option value="nao">Não conciliadas</option><option value="div">Com divergência</option></Select></Field>
      </div>
      <DataTable caption="Faturas SaaS" rows={rows} columns={cols} rowKey={(i) => i.id} exportName="faturas-saas" onRowClick={setView}
        rowActions={(i) => <>
          {(i.status === 'aberta' || i.status === 'vencida') && <Button size="sm" variant="primary" data-tour="primary-action" onClick={() => run(() => payInvoice(i.id, me.actor), `Pagamento simulado registrado em ${i.number}.`)}>Registrar pagamento</Button>}
          {i.status === 'paga' && <Button size="sm" variant="ghost" onClick={async () => { const r = await confirm({ title: `Estornar ${i.number}?`, body: 'Estorno simulado: nenhum valor real é devolvido.', requireReason: true, danger: true, confirmLabel: 'Estornar' }); if (r.ok) run(() => refundInvoice(i.id, r.reason ?? '', me.actor), 'Estorno simulado registrado.') }}>Estornar</Button>}
          {(i.status === 'paga' || i.status === 'estornada') && <Button size="sm" variant="ghost" onClick={() => run(() => setReconciled(i.id, !i.reconciled, me.actor), i.reconciled ? 'Conciliação desfeita.' : 'Fatura conciliada.')}>{i.reconciled ? 'Desconciliar' : 'Conciliar'}</Button>}
        </>} />
      <Section title="Gateways da própria Qlinic (Contexto A)">
        <div className="stack">
          <Alert tone="info">Estas são contas da plataforma para receber assinaturas. As contas de recebimento de cada clínica (pacientes) ficam no ambiente da clínica e nunca recebem valores da Qlinic, nem o contrário.</Alert>
          <div className="grid grid-3">
            {(['asaas', 'mercadopago', 'infinitepay'] as const).map((k) => {
              const h = platformGw.find((g) => g.provider === k)
              const p = PROVIDERS[k]
              return (
                <div key={k} className="card tight stack" style={{ '--gap': '8px' } as React.CSSProperties}>
                  <div className="row between"><strong>{p.name}</strong>{h ? <Badge tone={INT_STATUS[h.status][1]}>{INT_STATUS[h.status][0]}</Badge> : <Badge>Desconectada</Badge>}</div>
                  <SimBadge />
                  <Field label="Chave de API" hint="Configuração futura no servidor — nunca neste formulário."><Input disabled placeholder="configuração futura no servidor" /></Field>
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{(Object.keys(CAP_LABEL) as (keyof typeof CAP_LABEL)[]).map((c) => <li key={c}>{CAP_LABEL[c]}: {p.capabilities[c] === 'sim' ? 'sim' : p.capabilities[c] === 'nao' ? 'não' : 'depende de homologação'}</li>)}</ul>
                </div>
              )
            })}
          </div>
        </div>
      </Section>
      {view && (
        <Dialog open onClose={() => setView(null)} title={`Fatura ${view.number}`} description={name(view.tenantId)}>
          <dl className="stack" style={{ '--gap': '6px', margin: 0 } as React.CSSProperties}>
            {([['Competência', view.competence], ['Vencimento', formatCivil(view.dueDate)], ['Valor', formatBRL(view.amountCents)], ['Status', INVOICE_STATUS[statusOf(view)][0]], ['Gateway', PROVIDERS[view.gateway].name], ['Pago em', view.paidAt ? formatDateTime(view.paidAt) : '—'], ['Referência do provedor (simulada)', view.providerRef ?? '—'], ['Conciliada', view.reconciled ? 'Sim' : 'Não'], ['Divergência', reconciliationIssue(view, today) ?? 'Nenhuma']] as const).map(([k, v]) => <div key={k} className="row between"><dt className="muted small">{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>)}
          </dl>
          <p className="small muted" style={{ marginTop: 12 }}>Redirect de checkout não confirma pagamento; somente evento verificado do provedor (backend futuro).</p>
        </Dialog>
      )}
    </div>
  )
}
