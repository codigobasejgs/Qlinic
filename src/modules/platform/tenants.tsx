// Contratantes: lista com filtros, cadastro (trial) e detalhe comercial. Sem acesso a pacientes/prontuário.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Plus } from 'lucide-react'
import { db, usePlatformCollection, useStoreVersion } from '@/data/store'
import { SEGMENT_LABEL, MODULE_LABEL, type Organization, type Segment, type TenantStatus } from '@/domain/types'
import { slugify, validateSlug } from '@/domain/tenancy'
import { Alert, Badge, Button, ButtonLink, DescList, EmptyState, Field, Input, PageHeader, Progress, Section, Select, SimBadge, Tabs, TabPanel, Timeline } from '@/ui/core'
import { Dialog, useAction, useConfirm } from '@/ui/overlay'
import { DataTable, type Column } from '@/ui/table'
import { formatBRL } from '@/lib/money'
import { formatCivil, formatDateTime, todayCivil } from '@/lib/dates'
import { normalize } from '@/lib/util'
import { createTenant, reactivateTenant, suspendTenant } from './actions'
import { CYCLE_LABEL, DOMAIN_STATUS, Guard, INT_STATUS, INVOICE_STATUS, NoPermNote, ORG_STATUS, PROVIDER_LABEL, SUB_STATUS, TICKET_STATUS, pct, usePlatformMe } from './lib'
import { isOverdue, latestUsage, limitLevel, monthlyCents, usageRatios, isPayingOn } from './metrics'
import { PlanChangeDialog, currentUsageFor, LIMIT_LABEL } from './planChange'

export const SUSPENSION_POLICY = 'Política proposta (para validação posterior): suspensão comercial bloqueia novas operações pagas, mas NÃO apaga dados, NÃO bloqueia exportação nem consulta para continuidade do cuidado, e mantém o acesso do proprietário à solicitação de exportação.'

export function TenantsPage() {
  return <Guard area="contratantes" title="Contratantes"><TenantsList /></Guard>
}

function TenantsList() {
  const orgs = usePlatformCollection('organizations')
  const plans = usePlatformCollection('plans')
  const subs = usePlatformCollection('subscriptions')
  useStoreVersion()
  const me = usePlatformMe()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<TenantStatus | ''>('')
  const [segment, setSegment] = useState<Segment | ''>('')
  const [planId, setPlanId] = useState('')
  const [creating, setCreating] = useState(false)
  const rows = useMemo(() => orgs.filter((o) => (!q || normalize(`${o.name} ${o.slug} ${o.city}`).includes(normalize(q))) && (!status || o.status === status) && (!segment || o.segment === segment) && (!planId || o.planId === planId)), [orgs, q, status, segment, planId])
  const today = todayCivil()
  const cols: Column<Organization>[] = [
    { id: 'name', header: 'Contratante', cell: (o) => <span className="stack" style={{ '--gap': '0' } as React.CSSProperties}><span className="strong">{o.name}</span><span className="tiny muted">{o.slug}{o.demo ? ' · demo' : ''}{o.sandbox ? ' · criada na demo' : ''}</span></span>, value: (o) => o.name },
    { id: 'segment', header: 'Segmento', cell: (o) => SEGMENT_LABEL[o.segment], value: (o) => SEGMENT_LABEL[o.segment] },
    { id: 'status', header: 'Status', cell: (o) => <Badge tone={ORG_STATUS[o.status][1]}>{ORG_STATUS[o.status][0]}</Badge>, value: (o) => o.status },
    { id: 'plan', header: 'Plano', cell: (o) => plans.find((p) => p.id === o.planId)?.name ?? o.planId, value: (o) => o.planId },
    { id: 'units', header: 'Unidades', num: true, cell: (o) => db.list(o.id, 'units').length, value: (o) => db.list(o.id, 'units').length },
    { id: 'mrr', header: 'MRR', num: true, cell: (o) => { const s = subs.find((x) => x.tenantId === o.id); return s && isPayingOn(s, today) ? formatBRL(monthlyCents(s, plans.find((p) => p.id === s.planId), today)) : '—' }, value: (o) => { const s = subs.find((x) => x.tenantId === o.id); return s && isPayingOn(s, today) ? monthlyCents(s, plans.find((p) => p.id === s.planId), today) : 0 } },
    { id: 'city', header: 'Cidade', cell: (o) => o.city || '—', value: (o) => o.city, hidden: true },
    { id: 'created', header: 'Desde', cell: (o) => formatCivil(o.createdAt.slice(0, 10)), value: (o) => o.createdAt, hidden: true },
  ]
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Contratantes" subtitle="Clínicas e redes que assinam a Qlinic. Somente dados comerciais e contagens agregadas — sem pacientes ou prontuários."
        actions={<Button variant="primary" icon={<Plus />} data-tour="primary-action" onClick={() => setCreating(true)}>Novo contratante</Button>} />
      <div className="form-grid" role="search" aria-label="Filtros de contratantes">
        <Field label="Buscar"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, endereço ou cidade" /></Field>
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value as TenantStatus | '')}><option value="">Todos</option>{Object.entries(ORG_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Segmento"><Select value={segment} onChange={(e) => setSegment(e.target.value as Segment | '')}><option value="">Todos</option>{Object.entries(SEGMENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Plano"><Select value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">Todos</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      </div>
      <DataTable caption="Contratantes da plataforma" rows={rows} columns={cols} rowKey={(o) => o.id} onRowClick={(o) => nav(`/master/contratantes/${o.id}`)} exportName="contratantes"
        empty={<EmptyState title="Nenhum contratante com esses filtros" />} />
      {creating && <CreateTenantDialog onClose={() => setCreating(false)} onCreated={(id) => nav(`/master/contratantes/${id}`)} actor={me.actor} />}
    </div>
  )
}

function CreateTenantDialog({ onClose, onCreated, actor }: { onClose: () => void; onCreated: (id: string) => void; actor: { id: string; name: string } }) {
  const run = useAction()
  const [f, setF] = useState({ name: '', segment: 'odontologia' as Segment, slug: '', ownerName: '', city: '', contactEmail: '', trialDays: '14' })
  const slug = f.slug || slugify(f.name)
  const slugErr = slug.length >= 3 ? validateSlug(slug) : null
  const submit = () => {
    let id = ''
    const ok = run(() => { id = createTenant({ ...f, slug, trialDays: Number(f.trialDays) }, actor).id }, 'Contratante criado em teste. Unidade principal e proprietário fictícios gerados.')
    if (ok) { onClose(); onCreated(id) }
  }
  return (
    <Dialog open onClose={onClose} size="lg" title="Novo contratante (teste)" description="Cria organização, unidade principal, usuário proprietário fictício e assinatura em teste."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit} disabled={f.name.trim().length < 3 || !!slugErr}>Criar contratante</Button></>}>
      <div className="form-grid">
        <Field label="Nome da clínica" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="off" /></Field>
        <Field label="Segmento" required><Select value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value as Segment })}>{Object.entries(SEGMENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Endereço (slug)" hint={`Prévia: /app/${slug || '…'}`} error={slugErr}><Input value={f.slug} placeholder={slugify(f.name) || 'gerado do nome'} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} /></Field>
        <Field label="Responsável (proprietário)"><Input value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} placeholder="Nome fictício" /></Field>
        <Field label="Cidade"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="Cidade/UF" /></Field>
        <Field label="E-mail de contato" hint="Somente domínios fictícios (.exemplo / .test)."><Input type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} placeholder={`contato@${slug || 'clinica'}.exemplo.test`} /></Field>
        <Field label="Duração do teste (dias)" required hint="1 a 90 dias."><Input type="number" min={1} max={90} value={f.trialDays} onChange={(e) => setF({ ...f, trialDays: e.target.value })} /></Field>
      </div>
    </Dialog>
  )
}

export function TenantDetailPage() {
  return <Guard area="contratantes" title="Contratante"><TenantDetail /></Guard>
}

function TenantDetail() {
  const { tenantId } = useParams()
  const orgs = usePlatformCollection('organizations')
  const o = orgs.find((x) => x.id === tenantId)
  if (!o) {
    return (
      <>
        <PageHeader title="Contratante não encontrado" breadcrumbs={[{ label: 'Contratantes', to: '/master/contratantes' }, { label: 'Não encontrado' }]} />
        <EmptyState title="Identificador desconhecido" action={<ButtonLink to="/master/contratantes">Voltar à lista</ButtonLink>}>Nenhum contratante corresponde a este endereço. Nenhum dado de outra clínica é exibido.</EmptyState>
      </>
    )
  }
  return <TenantDetailBody key={o.id} org={o} />
}

function TenantDetailBody({ org: o }: { org: Organization }) {
  const plans = usePlatformCollection('plans')
  const subs = usePlatformCollection('subscriptions')
  const invoices = usePlatformCollection('saasInvoices')
  const usage = usePlatformCollection('usage')
  const integrations = usePlatformCollection('integrations')
  const domains = usePlatformCollection('domains')
  const tickets = usePlatformCollection('tickets')
  const audit = usePlatformCollection('platformAudit')
  useStoreVersion()
  const me = usePlatformMe()
  const run = useAction()
  const confirm = useConfirm()
  const [tab, setTab] = useState('resumo')
  const [planOpen, setPlanOpen] = useState(false)
  const today = todayCivil()
  const plan = plans.find((p) => p.id === o.planId)
  const sub = subs.find((s) => s.tenantId === o.id)
  const invs = invoices.filter((i) => i.tenantId === o.id).sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  const u = latestUsage(usage, o.id)
  const ratios = usageRatios(u, plan)
  const cur = currentUsageFor(o, usage)
  const canFin = me.can('assinaturas')
  const staffCount = cur.users ?? 0
  // Contagem agregada (sem abrir registros): só para clínicas com seed; exibida como número.
  const patientCount = db.list(o.id, 'patients').length
  const units = db.list(o.id, 'units')

  const suspend = async () => {
    const r = await confirm({ title: `Suspender ${o.name}?`, body: <div className="stack"><p>{SUSPENSION_POLICY}</p><p className="small muted">A ação fica registrada na auditoria da plataforma.</p></div>, requireReason: true, reasonLabel: 'Motivo da suspensão', confirmLabel: 'Suspender', danger: true })
    if (r.ok) run(() => suspendTenant(o.id, r.reason ?? '', me.actor), 'Contratante suspenso. Dados preservados e exportação mantida.')
  }
  const reactivate = async () => {
    const r = await confirm({ title: `Reativar ${o.name}?`, requireReason: true, reasonLabel: 'Motivo da reativação', confirmLabel: 'Reativar' })
    if (r.ok) run(() => reactivateTenant(o.id, r.reason ?? '', me.actor), 'Contratante reativado.')
  }
  const history = [
    ...(sub?.history ?? []).map((h) => ({ at: h.at, title: h.event, body: h.by })),
    ...audit.filter((a) => a.target === o.id).map((a) => ({ at: a.at, title: a.action, body: `${a.actor}${a.detail ? ` — ${a.detail}` : ''}` })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title={o.name} subtitle={`${SEGMENT_LABEL[o.segment]} · ${o.city || 'cidade não informada'} · /${o.slug}`} breadcrumbs={[{ label: 'Contratantes', to: '/master/contratantes' }, { label: o.name }]}
        actions={<>
          {canFin && <Button variant="primary" data-tour="primary-action" onClick={() => setPlanOpen(true)}>Mudar plano</Button>}
          {canFin && sub?.status === 'trial' && <ButtonLink to="/master/testes">Estender teste</ButtonLink>}
          {canFin && (o.status === 'suspended' || o.status === 'past_due') && <Button onClick={reactivate}>Reativar</Button>}
          {canFin && o.status !== 'suspended' && o.status !== 'cancelled' && <Button variant="danger" onClick={suspend}>Suspender</Button>}
        </>} />
      {!canFin && <NoPermNote area="assinaturas" />}
      {o.status === 'suspended' && <Alert tone="warning" title="Contratante suspenso">{SUSPENSION_POLICY}</Alert>}
      <Tabs label="Seções do contratante" value={tab} onChange={setTab} tabs={[
        { id: 'resumo', label: 'Resumo' }, { id: 'cobranca', label: 'Assinatura e faturas', badge: invs.length }, { id: 'uso', label: 'Uso' },
        { id: 'tecnico', label: 'Integrações e domínio' }, { id: 'suporte', label: 'Suporte', badge: tickets.filter((t) => t.tenantId === o.id).length }, { id: 'historico', label: 'Histórico' },
      ]} />
      <TabPanel>
        {tab === 'resumo' && (
          <div className="stack">
            <DescList items={[
              ['Status', <Badge tone={ORG_STATUS[o.status][1]}>{ORG_STATUS[o.status][0]}</Badge>], ['Plano', `${plan?.name ?? o.planId} (v${plan?.version ?? '—'})`], ['Razão social', o.legalName],
              ['CNPJ (fictício)', o.document || '—'], ['Contato', o.contactEmail], ['Telefone', o.contactPhone || '—'],
              ['Unidades', units.length], ['Usuários ativos', staffCount], ['Pacientes cadastrados (contagem)', patientCount],
              ['Fuso', o.timezone], ['Cliente desde', formatCivil(o.createdAt.slice(0, 10))], ['Tipo', o.demo ? 'Clínica de demonstração' : o.sandbox ? 'Criada na demonstração' : 'Somente métricas'],
            ]} />
            <Section title="Unidades (dados não clínicos)">
              {units.length ? <ul className="stack" style={{ '--gap': '6px', margin: 0, paddingLeft: 18 } as React.CSSProperties}>{units.map((un) => <li key={un.id}>{un.name} <span className="small muted">· {un.timezone}</span></li>)}</ul> : <p className="small muted">Sem unidades carregadas para este contratante na demonstração.</p>}
            </Section>
            <Section title="Responsáveis">
              <ul className="stack" style={{ '--gap': '6px', margin: 0, paddingLeft: 18 } as React.CSSProperties}>
                {db.list(o.id, 'staff').filter((s) => s.memberships.some((m) => m.role === 'clinic_owner' || m.role === 'network_manager')).map((s) => <li key={s.id}>{s.name} <span className="small muted">· {s.email}</span></li>)}
                {!db.list(o.id, 'staff').length && <li className="muted small">Contato comercial: {o.contactEmail}</li>}
              </ul>
            </Section>
            <Section title="Módulos habilitados">
              <div className="pl-chips">{o.modules.map((m) => <Badge key={m} tone={plan?.modules.includes(m) ? 'brand' : 'warning'} title={plan?.modules.includes(m) ? undefined : 'Fora do plano atual'}>{MODULE_LABEL[m]}</Badge>)}</div>
            </Section>
            <Alert tone="neutral" title="Privacidade">O Super Admin vê apenas contagens agregadas. Pacientes, prontuários, documentos e mensagens das clínicas não são exibidos aqui. Acesso assistido exige chamado, autorização da clínica e prazo (ver Suporte).</Alert>
          </div>
        )}
        {tab === 'cobranca' && (
          <div className="stack">
            {sub ? <DescList items={[
              ['Status', <Badge tone={SUB_STATUS[sub.status][1]}>{SUB_STATUS[sub.status][0]}</Badge>], ['Ciclo', CYCLE_LABEL[sub.cycle]], ['Valor mensal normalizado', formatBRL(monthlyCents(sub, plan, today))],
              ['Vencimento do período', formatCivil(sub.currentPeriodEnd)], ['Cupom', sub.coupon ? `${sub.coupon.code} (${sub.coupon.percent}% até ${formatCivil(sub.coupon.validUntil)})` : '—'],
              ['Desconto', sub.discount ? `${sub.discount.percent}% até ${formatCivil(sub.discount.validUntil)}` : '—'],
              ['Teste', sub.trial ? `${formatCivil(sub.trial.start)} a ${formatCivil(sub.trial.end)}${sub.trial.convertedAt ? ' (convertido)' : ''}` : '—'], ['Cancelamento', sub.cancelAt ? `${formatCivil(sub.cancelAt)} — ${sub.cancelReason}` : '—'],
            ]} /> : <Alert tone="warning">Sem assinatura registrada.</Alert>}
            <div className="row"><SimBadge /> {canFin && <ButtonLink to="/master/assinaturas" size="sm">Gerenciar assinatura</ButtonLink>} {me.can('cobranca') && <ButtonLink to="/master/cobranca" size="sm">Ir para cobrança</ButtonLink>}</div>
            <DataTable caption="Faturas SaaS do contratante" rows={invs} rowKey={(i) => i.id} columns={[
              { id: 'n', header: 'Fatura', cell: (i) => i.number, value: (i) => i.number },
              { id: 'c', header: 'Competência', cell: (i) => i.competence, value: (i) => i.competence },
              { id: 'd', header: 'Vencimento', cell: (i) => formatCivil(i.dueDate), value: (i) => i.dueDate },
              { id: 'v', header: 'Valor', num: true, cell: (i) => formatBRL(i.amountCents), value: (i) => i.amountCents },
              { id: 's', header: 'Status', cell: (i) => <Badge tone={isOverdue(i, today) ? 'danger' : INVOICE_STATUS[i.status][1]}>{isOverdue(i, today) ? 'Vencida' : INVOICE_STATUS[i.status][0]}</Badge>, value: (i) => i.status },
            ]} empty={<EmptyState title="Sem faturas" >Contratantes em teste não geram faturas.</EmptyState>} />
          </div>
        )}
        {tab === 'uso' && (
          <div className="stack">
            <p className="small muted">Mês de referência: {u?.month ?? '—'}. Limites do plano {plan?.name}.</p>
            <div className="pl-usage">
              {([['storageGb', 'Armazenamento (GB)', u?.storageGb, plan?.limits.storageGb], ['messages', 'Mensagens', u?.messages, plan?.limits.messagesMonth], ['aiCredits', 'Créditos de IA', u?.aiCredits, plan?.limits.aiCreditsMonth]] as const).map(([k, l, v, cap]) => {
                const lv = limitLevel(ratios[k])
                return [<span key={`${k}a`} className="strong">{l}</span>, <Progress key={`${k}b`} value={v ?? 0} max={cap || 1} label={`${l}: ${pct(ratios[k])}`} tone={lv === 'excedido' ? 'danger' : lv === 'atencao' ? 'warn' : undefined} />, <span key={`${k}c`} className="small num">{(v ?? 0).toLocaleString('pt-BR')} / {(cap ?? 0).toLocaleString('pt-BR')} {lv !== 'ok' && <Badge tone={lv === 'excedido' ? 'danger' : 'warning'}>{lv === 'excedido' ? '≥ 100%' : '≥ 80%'}</Badge>}</span>]
              })}
            </div>
            <table className="table">
              <caption className="sr-only">Limites estruturais</caption>
              <thead><tr><th scope="col">Limite</th><th scope="col" className="num">Uso</th><th scope="col" className="num">Plano</th></tr></thead>
              <tbody>{(['users', 'professionals', 'units'] as const).map((k) => <tr key={k}><td>{LIMIT_LABEL[k]}</td><td className="num">{cur[k] ?? '—'}</td><td className="num">{plan?.limits[k] ?? '—'}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {tab === 'tecnico' && (
          <div className="stack">
            <Section title="Integrações da clínica (Contexto B)">
              {integrations.filter((i) => i.tenantId === o.id).length ? (
                <ul className="stack" style={{ '--gap': '8px', margin: 0, padding: 0, listStyle: 'none' } as React.CSSProperties}>
                  {integrations.filter((i) => i.tenantId === o.id).map((i) => <li key={i.id} className="row between"><span>{PROVIDER_LABEL[i.provider]}</span><span className="row"><Badge tone={INT_STATUS[i.status][1]}>{INT_STATUS[i.status][0]}</Badge><span className="small muted">erro {pct(i.errorRate)}</span></span></li>)}
                </ul>
              ) : <p className="small muted">Nenhuma integração configurada.</p>}
              {me.can('integracoes') && <Link to="/master/integracoes" className="small">Ver saúde das integrações</Link>}
            </Section>
            <Section title="Domínio">
              {(() => { const d = domains.find((x) => x.tenantId === o.id); return d ? <div className="row"><span className="mono">{d.hostname}</span><Badge tone={DOMAIN_STATUS[d.status][1]}>{DOMAIN_STATUS[d.status][0]}</Badge>{me.can('dominios') && <Link to="/master/dominios" className="small">Detalhes</Link>}</div> : <p className="small muted">Endereço por caminho: /app/{o.slug} (domínio não configurado). Nome de exemplo: {o.domain?.hostname ?? '—'}</p> })()}
            </Section>
          </div>
        )}
        {tab === 'suporte' && (
          <DataTable caption="Chamados do contratante" rows={tickets.filter((t) => t.tenantId === o.id)} rowKey={(t) => t.id} columns={[
            { id: 'n', header: 'Chamado', cell: (t) => `${t.number} — ${t.subject}`, value: (t) => t.number },
            { id: 's', header: 'Status', cell: (t) => <Badge tone={TICKET_STATUS[t.status][1]}>{TICKET_STATUS[t.status][0]}</Badge>, value: (t) => t.status },
            { id: 'c', header: 'Aberto em', cell: (t) => formatDateTime(t.createdAt), value: (t) => t.createdAt },
          ]} empty={<EmptyState title="Sem chamados" />} actions={me.can('suporte') ? <ButtonLink to="/master/suporte" size="sm">Abrir suporte</ButtonLink> : undefined} />
        )}
        {tab === 'historico' && <Timeline items={history.map((h) => ({ time: formatDateTime(h.at), title: h.title, body: h.body }))} />}
      </TabPanel>
      {planOpen && <PlanChangeDialog org={o} open onClose={() => setPlanOpen(false)} />}
    </div>
  )
}
