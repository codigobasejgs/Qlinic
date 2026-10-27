// Operação (flags, incidentes, avisos, changelog, status), Governança e Custos.
import { useMemo, useState } from 'react'
import { Download, Plus } from 'lucide-react'
import { usePlatformCollection } from '@/data/store'
import { PLATFORM_MATRIX, PLATFORM_ROLE_LABEL } from '@/domain/permissions'
import type { PlatformRole } from '@/domain/types'
import type { DataRequest, FeatureFlag, Incident } from '@/domain/platform'
import { Alert, Badge, Button, Checkbox, EmptyState, Field, Input, Kpi, PageHeader, Section, Select, SimBadge, Tabs, TabPanel, Textarea, Timeline } from '@/ui/core'
import { Dialog, useAction } from '@/ui/overlay'
import { DataTable, type Column } from '@/ui/table'
import { formatBRL } from '@/lib/money'
import { formatCivil, formatDateTime, todayCivil } from '@/lib/dates'
import { downloadText, normalize, toCSV } from '@/lib/util'
import { componentStatus, DEFAULT_COSTS, DR_NEXT, estimatedCost, isPayingOn, latestUsage, limitLevel, margin, monthlyCents, usageRatios, type ComponentState, type CostAssumptions } from './metrics'
import { addChangelog, createAnnouncement, createDataRequest, createFlag, createIncident, createPlatformUser, toggleAnnouncement, transitionDataRequest, updateFlag, updateIncident, updatePlatformUser } from './actions'
import { AREA_LABEL, DR_KIND, DR_STATUS, Guard, INC_SEV, INC_STATUS, pct, usePlatformMe, type Area } from './lib'

export const COMPONENTS = ['Aplicativo web', 'Agenda', 'Portal do paciente', 'Comunicação', 'Cobrança SaaS', 'Pagamentos das clínicas', 'API']
const COMP_STATE: Record<ComponentState, [string, 'success' | 'warning' | 'danger' | 'info']> = { operacional: ['Operacional', 'success'], degradado: ['Desempenho degradado', 'info'], parcial: ['Indisponibilidade parcial', 'warning'], indisponivel: ['Indisponível', 'danger'] }

// ======================= Operação =======================
export function OperationsPage() {
  return <Guard area="operacao" title="Operação"><Operations /></Guard>
}
function Operations() {
  const incidents = usePlatformCollection('incidents')
  const [tab, setTab] = useState('status')
  const open = incidents.filter((i) => i.status !== 'resolvido').length
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Operação" subtitle="Status do serviço, incidentes, feature flags, avisos e changelog." />
      <Tabs label="Seções de operação" value={tab} onChange={setTab} tabs={[{ id: 'status', label: 'Status' }, { id: 'incidentes', label: 'Incidentes', badge: open || undefined }, { id: 'flags', label: 'Feature flags' }, { id: 'avisos', label: 'Avisos' }, { id: 'changelog', label: 'Changelog' }]} />
      <TabPanel>
        {tab === 'status' && <ServiceStatus />}
        {tab === 'incidentes' && <Incidents />}
        {tab === 'flags' && <Flags />}
        {tab === 'avisos' && <Announcements />}
        {tab === 'changelog' && <Changelog />}
      </TabPanel>
    </div>
  )
}

function ServiceStatus() {
  const incidents = usePlatformCollection('incidents')
  const st = componentStatus(incidents, COMPONENTS)
  const worst = Object.values(st).some((s) => s !== 'operacional')
  return (
    <div className="stack">
      <Alert tone={worst ? 'warning' : 'success'} title={worst ? 'Há componentes afetados' : 'Todos os sistemas operacionais'}>Derivado dos incidentes abertos (severidade menor = degradado, maior = parcial, crítico = indisponível). Simulado.</Alert>
      <ul className="stack" style={{ '--gap': '8px', margin: 0, padding: 0, listStyle: 'none' } as React.CSSProperties}>
        {COMPONENTS.map((c) => <li key={c} className="list-card"><div className="row between"><span className="strong">{c}</span><Badge tone={COMP_STATE[st[c]][1]}>{COMP_STATE[st[c]][0]}</Badge></div></li>)}
      </ul>
    </div>
  )
}

function Incidents() {
  const incidents = usePlatformCollection('incidents')
  const me = usePlatformMe()
  const run = useAction()
  const [f, setF] = useState({ title: '', severity: 'menor' as Incident['severity'], components: [] as string[], text: '' })
  const [upd, setUpd] = useState<Record<string, { status: Incident['status']; text: string }>>({})
  const sorted = [...incidents].sort((a, b) => Number(a.status === 'resolvido') - Number(b.status === 'resolvido') || b.startedAt.localeCompare(a.startedAt))
  return (
    <div className="stack">
      <fieldset><legend>Abrir incidente</legend>
        <div className="form-grid">
          <Field label="Título" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Severidade"><Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as Incident['severity'] })}>{Object.entries(INC_SEV).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        </div>
        <div className="pl-mods" role="group" aria-label="Componentes afetados">{COMPONENTS.map((c) => <Checkbox key={c} label={c} checked={f.components.includes(c)} onChange={() => setF({ ...f, components: f.components.includes(c) ? f.components.filter((x) => x !== c) : [...f.components, c] })} />)}</div>
        <Field label="Primeira atualização"><Input value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Investigando…" /></Field>
        <div className="form-actions"><Button variant="primary" data-tour="primary-action" icon={<Plus />} onClick={() => run(() => { createIncident(f, me.actor); setF({ title: '', severity: 'menor', components: [], text: '' }) }, 'Incidente aberto; status do serviço atualizado.')}>Abrir incidente</Button></div>
      </fieldset>
      {sorted.map((i) => {
        const u = upd[i.id] ?? { status: i.status === 'investigando' ? 'identificado' : i.status === 'identificado' ? 'monitorando' : 'resolvido', text: '' }
        return (
          <Section key={i.id} title={<span className="row"><span>{i.title}</span><Badge tone={INC_SEV[i.severity][1]}>{INC_SEV[i.severity][0]}</Badge><Badge tone={i.status === 'resolvido' ? 'success' : 'warning'}>{INC_STATUS[i.status]}</Badge></span>}>
            <p className="small muted">Componentes: {i.components.join(', ')} · início {formatDateTime(i.startedAt)}{i.resolvedAt ? ` · resolvido ${formatDateTime(i.resolvedAt)}` : ''}</p>
            <Timeline items={[...i.updates].reverse().map((x) => ({ time: formatDateTime(x.at), title: x.text }))} />
            {i.status !== 'resolvido' && (
              <div className="form-grid">
                <Field label="Novo status"><Select value={u.status} onChange={(e) => setUpd({ ...upd, [i.id]: { ...u, status: e.target.value as Incident['status'] } })}>{Object.entries(INC_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                <Field label="Atualização" required><Input value={u.text} onChange={(e) => setUpd({ ...upd, [i.id]: { ...u, text: e.target.value } })} /></Field>
                <div className="row" style={{ alignItems: 'flex-end' }}><Button onClick={() => run(() => { updateIncident(i.id, u.status, u.text, me.actor); setUpd({ ...upd, [i.id]: { ...u, text: '' } }) }, 'Incidente atualizado.')}>Publicar atualização</Button></div>
              </div>
            )}
          </Section>
        )
      })}
    </div>
  )
}

function Flags() {
  const flags = usePlatformCollection('flags')
  const orgs = usePlatformCollection('organizations')
  const me = usePlatformMe()
  const run = useAction()
  const [nf, setNf] = useState({ key: '', description: '' })
  const [ov, setOv] = useState<Record<string, string>>({})
  const name = (id: string) => orgs.find((o) => o.id === id)?.name ?? id
  return (
    <div className="stack">
      <Alert tone="info">Flag liga/desliga funcionalidade por rollout ou contratante. Não substitui o plano (limites/módulos) nem as permissões dos usuários.</Alert>
      <fieldset><legend>Nova flag</legend>
        <div className="form-grid">
          <Field label="Chave" hint="Formato area.recurso"><Input value={nf.key} onChange={(e) => setNf({ ...nf, key: e.target.value.toLowerCase() })} placeholder="agenda.nova_visao" /></Field>
          <Field label="Descrição"><Input value={nf.description} onChange={(e) => setNf({ ...nf, description: e.target.value })} /></Field>
          <div className="row" style={{ alignItems: 'flex-end' }}><Button icon={<Plus />} onClick={() => run(() => { createFlag(nf.key, nf.description, me.actor); setNf({ key: '', description: '' }) }, 'Flag criada (desligada, rollout 0%).')}>Criar flag</Button></div>
        </div>
      </fieldset>
      {flags.map((f: FeatureFlag) => (
        <Section key={f.id} title={<span className="row"><span className="mono">{f.key}</span><Badge tone={f.enabledGlobally ? 'success' : 'neutral'}>{f.enabledGlobally ? `Global · ${f.rollout}%` : 'Desligada globalmente'}</Badge></span>}>
          <div className="stack" style={{ '--gap': '10px' } as React.CSSProperties}>
            <p className="small muted">{f.description}</p>
            <div className="row">
              <Checkbox label="Ligada globalmente" checked={f.enabledGlobally} onChange={(e) => run(() => updateFlag(f.id, { enabledGlobally: e.target.checked }, me.actor, e.target.checked ? 'ligada globalmente' : 'desligada globalmente'), 'Flag atualizada.')} />
            </div>
            <Field label={`Rollout (${f.rollout}% dos contratantes)`} hint="Aplicado de forma determinística por contratante quando ligada globalmente (simulado).">
              <input type="range" min={0} max={100} step={5} value={f.rollout} onChange={(e) => run(() => updateFlag(f.id, { rollout: Number(e.target.value) }, me.actor, `rollout ${e.target.value}%`))} />
            </Field>
            <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}>
              <strong className="small">Overrides por contratante</strong>
              {Object.keys(f.tenantOverrides).length === 0 && <span className="small muted">Nenhum.</span>}
              <div className="pl-chips">{Object.entries(f.tenantOverrides).map(([t, v]) => <span key={t} className="chip">{name(t)}: {v ? 'ligada' : 'desligada'}<Button size="sm" variant="ghost" onClick={() => { const next = { ...f.tenantOverrides }; delete next[t]; run(() => updateFlag(f.id, { tenantOverrides: next }, me.actor, `override removido: ${t}`), 'Override removido.') }}>Remover</Button></span>)}</div>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <Field label="Contratante" className="grow"><Select value={ov[f.id] ?? ''} onChange={(e) => setOv({ ...ov, [f.id]: e.target.value })}><option value="">Selecione</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
                <Button size="sm" disabled={!ov[f.id]} onClick={() => run(() => updateFlag(f.id, { tenantOverrides: { ...f.tenantOverrides, [ov[f.id]]: true } }, me.actor, `override ligado: ${ov[f.id]}`), 'Override aplicado.')}>Forçar ligada</Button>
                <Button size="sm" disabled={!ov[f.id]} onClick={() => run(() => updateFlag(f.id, { tenantOverrides: { ...f.tenantOverrides, [ov[f.id]]: false } }, me.actor, `override desligado: ${ov[f.id]}`), 'Override aplicado.')}>Forçar desligada</Button>
              </div>
            </div>
          </div>
        </Section>
      ))}
    </div>
  )
}

function Announcements() {
  const list = usePlatformCollection('announcements')
  const me = usePlatformMe()
  const run = useAction()
  const [f, setF] = useState({ title: '', body: '', audience: 'todos' as 'todos' | 'owners' | 'plano', publish: true })
  return (
    <div className="stack">
      <fieldset><legend>Novo aviso</legend>
        <div className="form-grid">
          <Field label="Título" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Público"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as typeof f.audience })}><option value="todos">Todos os usuários</option><option value="owners">Proprietários</option><option value="plano">Por plano</option></Select></Field>
        </div>
        <Field label="Mensagem"><Textarea rows={2} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <Checkbox label="Publicar agora" checked={f.publish} onChange={(e) => setF({ ...f, publish: e.target.checked })} />
        <div className="form-actions"><Button variant="primary" onClick={() => run(() => { createAnnouncement(f, me.actor); setF({ ...f, title: '', body: '' }) }, 'Aviso salvo.')}>Salvar aviso</Button></div>
      </fieldset>
      <DataTable caption="Avisos" rows={list} rowKey={(a) => a.id} columns={[
        { id: 't', header: 'Título', cell: (a) => a.title, value: (a) => a.title },
        { id: 'b', header: 'Mensagem', cell: (a) => <span className="small">{a.body}</span> },
        { id: 'au', header: 'Público', cell: (a) => ({ todos: 'Todos', owners: 'Proprietários', plano: 'Por plano' })[a.audience] },
        { id: 's', header: 'Status', cell: (a) => <Badge tone={a.active ? 'success' : 'neutral'}>{a.active ? 'Publicado' : 'Inativo'}</Badge> },
      ]} rowActions={(a) => <Button size="sm" variant="ghost" onClick={() => run(() => toggleAnnouncement(a.id, me.actor), a.active ? 'Aviso despublicado.' : 'Aviso publicado.')}>{a.active ? 'Despublicar' : 'Publicar'}</Button>} />
    </div>
  )
}

function Changelog() {
  const list = usePlatformCollection('changelog')
  const me = usePlatformMe()
  const run = useAction()
  const [f, setF] = useState({ version: '', items: '' })
  return (
    <div className="stack">
      <fieldset><legend>Publicar versão</legend>
        <div className="form-grid"><Field label="Versão" hint="0.0.0"><Input value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="0.2.0" /></Field></div>
        <Field label="Itens (um por linha)"><Textarea rows={3} value={f.items} onChange={(e) => setF({ ...f, items: e.target.value })} /></Field>
        <div className="form-actions"><Button variant="primary" onClick={() => run(() => { addChangelog(f.version, f.items.split('\n'), me.actor); setF({ version: '', items: '' }) }, 'Changelog publicado.')}>Publicar</Button></div>
      </fieldset>
      {[...list].sort((a, b) => b.date.localeCompare(a.date) || b.version.localeCompare(a.version)).map((c) => <Section key={c.id} title={`v${c.version} · ${formatCivil(c.date)}`}><ul style={{ margin: 0, paddingLeft: 18 }}>{c.items.map((x, i) => <li key={i}>{x}</li>)}</ul></Section>)}
    </div>
  )
}

// ======================= Governança =======================
export function GovernancePage() {
  return <Guard area="governanca" title="Governança"><Governance /></Guard>
}
function Governance() {
  const [tab, setTab] = useState('usuarios')
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Governança" subtitle="Usuários internos, matriz de permissões da plataforma, auditoria e solicitações de exportação/encerramento." />
      <Tabs label="Seções de governança" value={tab} onChange={setTab} tabs={[{ id: 'usuarios', label: 'Usuários internos' }, { id: 'matriz', label: 'Permissões' }, { id: 'auditoria', label: 'Auditoria' }, { id: 'solicitacoes', label: 'Exportação/encerramento' }]} />
      <TabPanel>
        {tab === 'usuarios' && <PlatformUsers />}
        {tab === 'matriz' && <Matrix />}
        {tab === 'auditoria' && <AuditLog />}
        {tab === 'solicitacoes' && <DataRequests />}
      </TabPanel>
    </div>
  )
}

function PlatformUsers() {
  const users = usePlatformCollection('platformUsers')
  const me = usePlatformMe()
  const run = useAction()
  const [f, setF] = useState({ name: '', email: '', role: 'platform_support' as PlatformRole })
  return (
    <div className="stack">
      <fieldset><legend>Novo usuário interno</legend>
        <div className="form-grid">
          <Field label="Nome" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="E-mail" required hint="Fictício (.exemplo / .test). Convite real é futuro."><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="nome@qlinic.exemplo.test" /></Field>
          <Field label="Papel"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as PlatformRole })}>{Object.entries(PLATFORM_ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        </div>
        <div className="form-actions"><Button variant="primary" data-tour="primary-action" icon={<Plus />} onClick={() => run(() => { createPlatformUser(f, me.actor); setF({ name: '', email: '', role: 'platform_support' }) }, 'Usuário interno criado.')}>Criar usuário</Button></div>
      </fieldset>
      <DataTable caption="Usuários internos da plataforma" rows={users} rowKey={(u) => u.id} columns={[
        { id: 'n', header: 'Nome', cell: (u) => <>{u.name}{u.id === me.userId && <span className="small muted"> (você)</span>}</>, value: (u) => u.name },
        { id: 'e', header: 'E-mail', cell: (u) => u.email, value: (u) => u.email },
        { id: 'r', header: 'Papel', cell: (u) => <Select aria-label={`Papel de ${u.name}`} value={u.role} disabled={u.id === me.userId} onChange={(e) => run(() => updatePlatformUser(u.id, { role: e.target.value as PlatformRole }, me.actor), 'Papel alterado.')}>{Object.entries(PLATFORM_ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>, value: (u) => u.role },
        { id: 's', header: 'Status', cell: (u) => <Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Ativo' : 'Desativado'}</Badge>, value: (u) => String(u.active) },
      ]} rowActions={(u) => u.id === me.userId ? null : <Button size="sm" variant={u.active ? 'ghost' : 'secondary'} onClick={() => run(() => updatePlatformUser(u.id, { active: !u.active }, me.actor), u.active ? 'Usuário desativado.' : 'Usuário reativado.')}>{u.active ? 'Desativar' : 'Reativar'}</Button>} />
    </div>
  )
}

function Matrix() {
  const roles = Object.keys(PLATFORM_MATRIX) as PlatformRole[]
  const areas = Object.keys(AREA_LABEL) as Area[]
  return (
    <div className="stack">
      <div className="scroll-x">
        <table className="table pl-matrix">
          <caption className="sr-only">Matriz de permissões da plataforma por papel</caption>
          <thead><tr><th scope="col">Área</th>{roles.map((r) => <th key={r} scope="col">{PLATFORM_ROLE_LABEL[r]}</th>)}</tr></thead>
          <tbody>{areas.map((a) => <tr key={a}><th scope="row">{AREA_LABEL[a]}</th>{roles.map((r) => <td key={r}>{PLATFORM_MATRIX[r].includes(a) ? <Badge tone="success">Acessa</Badge> : <Badge plain>—</Badge>}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <Alert tone="info" title="Regras fixas">Nenhum papel da plataforma lê prontuários, documentos clínicos ou dados de pacientes. Suporte só atua em configurações/agenda/financeiro da clínica via acesso assistido autorizado, com prazo e registro. Matriz demonstrativa: autorização real será aplicada no servidor (RLS).</Alert>
    </div>
  )
}

function AuditLog() {
  const audit = usePlatformCollection('platformAudit')
  const [f, setF] = useState({ q: '', action: '', from: '', to: '' })
  const prefixes = useMemo(() => [...new Set(audit.map((a) => a.action.split('.')[0]))].sort(), [audit])
  const rows = audit.filter((a) => (!f.q || normalize(`${a.actor} ${a.target} ${a.detail ?? ''}`).includes(normalize(f.q))) && (!f.action || a.action.startsWith(`${f.action}.`)) && (!f.from || a.at.slice(0, 10) >= f.from) && (!f.to || a.at.slice(0, 10) <= f.to)).sort((a, b) => b.at.localeCompare(a.at))
  const exportCsv = () => downloadText(`auditoria-plataforma-${todayCivil()}.csv`, toCSV(rows.map((a) => ({ data: a.at, ator: a.actor, acao: a.action, alvo: a.target, detalhe: a.detail ?? '' }))), 'text/csv;charset=utf-8')
  return (
    <div className="stack">
      <div className="form-grid" role="search" aria-label="Filtros de auditoria">
        <Field label="Buscar"><Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Ator, alvo ou detalhe" /></Field>
        <Field label="Tipo de ação"><Select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}><option value="">Todas</option>{prefixes.map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
        <Field label="De"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Até"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
      </div>
      <DataTable caption="Auditoria da plataforma" rows={rows} rowKey={(a) => a.id} pageSize={30} actions={<Button size="sm" icon={<Download />} onClick={exportCsv} disabled={!rows.length}>Exportar CSV seguro</Button>} columns={[
        { id: 'at', header: 'Quando', cell: (a) => formatDateTime(a.at), value: (a) => a.at },
        { id: 'ac', header: 'Ação', cell: (a) => <span className="mono">{a.action}</span>, value: (a) => a.action },
        { id: 'ator', header: 'Ator', cell: (a) => a.actor, value: (a) => a.actor },
        { id: 't', header: 'Alvo', cell: (a) => <span className="mono small">{a.target}</span>, value: (a) => a.target },
        { id: 'd', header: 'Detalhe', cell: (a) => <span className="small">{a.detail ?? '—'}</span> },
      ]} empty={<EmptyState title="Nenhum evento com esses filtros" />} />
      <p className="small muted">Exportação protegida contra fórmula em planilha (células iniciadas por =, +, −, @ são prefixadas). Trilha local de demonstração — trilha imutável real é responsabilidade do servidor.</p>
    </div>
  )
}

function DataRequests() {
  const list = usePlatformCollection('dataRequests')
  const orgs = usePlatformCollection('organizations')
  const me = usePlatformMe()
  const run = useAction()
  const [f, setF] = useState({ tenantId: orgs[0]?.id ?? '', kind: 'exportacao' as DataRequest['kind'], notes: '' })
  const [tr, setTr] = useState<{ r: DataRequest; to: DataRequest['status'] } | null>(null)
  const [note, setNote] = useState('')
  const name = (id: string) => orgs.find((o) => o.id === id)?.name ?? id
  return (
    <div className="stack">
      <Alert tone="warning" title="Encerramento não apaga registros clínicos automaticamente">Prontuários e documentos têm obrigações de retenção por categoria (a avaliar com jurídico/regulatório). Encerrar conta interrompe a assinatura e preserva os dados até decisão documentada; exportação continua disponível.</Alert>
      <fieldset><legend>Registrar solicitação</legend>
        <div className="form-grid">
          <Field label="Contratante"><Select value={f.tenantId} onChange={(e) => setF({ ...f, tenantId: e.target.value })}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
          <Field label="Tipo"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as DataRequest['kind'] })}>{Object.entries(DR_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        </div>
        <Field label="Observações"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <div className="form-actions"><Button variant="primary" onClick={() => run(() => { createDataRequest(f, me.actor); setF({ ...f, notes: '' }) }, 'Solicitação registrada como recebida.')}>Registrar</Button></div>
      </fieldset>
      <DataTable caption="Solicitações de exportação e encerramento" rows={[...list].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))} rowKey={(r) => r.id} columns={[
        { id: 't', header: 'Contratante', cell: (r) => name(r.tenantId), value: (r) => name(r.tenantId) },
        { id: 'k', header: 'Tipo', cell: (r) => DR_KIND[r.kind], value: (r) => r.kind },
        { id: 's', header: 'Status', cell: (r) => <Badge tone={DR_STATUS[r.status][1]}>{DR_STATUS[r.status][0]}</Badge>, value: (r) => r.status },
        { id: 'a', header: 'Recebida em', cell: (r) => formatDateTime(r.requestedAt), value: (r) => r.requestedAt },
        { id: 'n', header: 'Notas', cell: (r) => <span className="small pl-pre">{r.notes || '—'}</span> },
      ]} rowActions={(r) => <>{DR_NEXT[r.status].map((to) => <Button key={to} size="sm" variant={to === 'recusada' ? 'ghost' : 'secondary'} onClick={() => { setNote(''); setTr({ r, to }) }}>{({ em_analise: 'Analisar', aprovada: 'Aprovar', concluida: 'Concluir', recusada: 'Recusar', recebida: '' } as const)[to]}</Button>)}</>} />
      {tr && (
        <Dialog open onClose={() => setTr(null)} title={`${DR_KIND[tr.r.kind]} — ${DR_STATUS[tr.to][0]}`} description={name(tr.r.tenantId)}
          footer={<><Button onClick={() => setTr(null)}>Voltar</Button><Button variant="primary" onClick={() => { if (run(() => transitionDataRequest(tr.r.id, tr.to, note, me.actor), 'Solicitação atualizada.')) setTr(null) }}>Confirmar</Button></>}>
          <div className="stack">
            {tr.to === 'concluida' && tr.r.kind === 'encerramento' && <Alert tone="warning">Concluir o encerramento NÃO remove prontuários: registros clínicos ficam retidos conforme política a validar.</Alert>}
            {tr.to === 'concluida' && tr.r.kind === 'exportacao' && <SimBadge>Pacote de exportação simulado — nenhum arquivo real gerado</SimBadge>}
            <Field label="Observação" required={tr.to === 'recusada' || tr.to === 'concluida'}><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
        </Dialog>
      )}
    </div>
  )
}

// ======================= Custos =======================
export function CostsPage() {
  return <Guard area="custos" title="Custos e margem"><Costs /></Guard>
}
interface CostRow { id: string; name: string; plan: string; revenue: number; cost: number; marginCents: number; marginPct: number | null; maxRatio: number; level: ReturnType<typeof limitLevel>; ratios: ReturnType<typeof usageRatios> }
function Costs() {
  const orgs = usePlatformCollection('organizations')
  const plans = usePlatformCollection('plans')
  const subs = usePlatformCollection('subscriptions')
  const usage = usePlatformCollection('usage')
  const [c, setC] = useState<CostAssumptions>(DEFAULT_COSTS)
  const [sort, setSort] = useState<'margem' | 'custo' | 'uso'>('margem')
  const today = todayCivil()
  const rows: CostRow[] = useMemo(() => orgs.filter((o) => o.status !== 'cancelled').map((o) => {
    const s = subs.find((x) => x.tenantId === o.id)
    const plan = plans.find((p) => p.id === o.planId)
    const u = latestUsage(usage, o.id)
    const revenue = s && isPayingOn(s, today) ? monthlyCents(s, plan, today) : 0
    const cost = estimatedCost(u, c)
    const m = margin(revenue, cost)
    const ratios = usageRatios(u, plan)
    const maxRatio = Math.max(ratios.storageGb, ratios.messages, ratios.aiCredits)
    return { id: o.id, name: o.name, plan: plan?.name ?? o.planId, revenue, cost, marginCents: m.cents, marginPct: m.pct, maxRatio, level: limitLevel(maxRatio), ratios }
  }), [orgs, subs, plans, usage, c, today])
  const sorted = [...rows].sort((a, b) => sort === 'margem' ? a.marginCents - b.marginCents : sort === 'custo' ? b.cost - a.cost : b.maxRatio - a.maxRatio)
  const tot = rows.reduce((a, r) => ({ rev: a.rev + r.revenue, cost: a.cost + r.cost }), { rev: 0, cost: 0 })
  const tm = margin(tot.rev, tot.cost)
  const alerts = rows.filter((r) => r.level !== 'ok')
  const num = (k: keyof CostAssumptions, v: string) => { const n = Number(v.replace(',', '.')); if (Number.isFinite(n) && n >= 0) setC({ ...c, [k]: Math.round(n * 100) }) }
  const cols: Column<CostRow>[] = [
    { id: 'n', header: 'Contratante', cell: (r) => <span className="stack" style={{ '--gap': '0' } as React.CSSProperties}><span className="strong">{r.name}</span><span className="tiny muted">{r.plan}</span></span>, value: (r) => r.name },
    { id: 'r', header: 'Receita SaaS/mês', num: true, cell: (r) => formatBRL(r.revenue), value: (r) => r.revenue },
    { id: 'c', header: 'Custo estimado', num: true, cell: (r) => formatBRL(r.cost), value: (r) => r.cost },
    { id: 'm', header: 'Margem', num: true, cell: (r) => <span className={r.marginCents < 0 ? 'strong' : undefined} style={r.marginCents < 0 ? { color: 'var(--q-danger)' } : undefined}>{formatBRL(r.marginCents)} ({r.marginPct == null ? 'sem receita' : pct(r.marginPct)})</span>, value: (r) => r.marginCents },
    { id: 'u', header: 'Maior uso do limite', num: true, cell: (r) => <Badge tone={r.level === 'excedido' ? 'danger' : r.level === 'atencao' ? 'warning' : 'neutral'}>{pct(r.maxRatio, 0)}</Badge>, value: (r) => r.maxRatio },
  ]
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Custos e margem" subtitle="Custo estimado de infraestrutura/provedores por contratante × receita SaaS (mês mais recente). Estimativas demonstrativas." />
      <div className="grid grid-4">
        <Kpi label="Receita SaaS mensal" value={formatBRL(tot.rev)} foot="= MRR (assinaturas pagantes)" />
        <Kpi label="Custo estimado" value={formatBRL(tot.cost)} foot="premissas abaixo" />
        <Kpi label="Margem SaaS" value={tm.pct == null ? '—' : pct(tm.pct)} foot={formatBRL(tm.cents)} />
        <Kpi label="Alertas de limite" value={alerts.length} foot={`${alerts.filter((a) => a.level === 'excedido').length} ≥ 100% · ${alerts.filter((a) => a.level === 'atencao').length} ≥ 80%`} />
      </div>
      <Section title="Premissas de custo unitário (editáveis)">
        <div className="form-grid">
          <Field label="GB armazenado (R$)"><Input inputMode="decimal" defaultValue={(c.storageGbCents / 100).toFixed(2).replace('.', ',')} onBlur={(e) => num('storageGbCents', e.target.value)} /></Field>
          <Field label="Mensagem enviada (R$)"><Input inputMode="decimal" defaultValue={(c.messageCents / 100).toFixed(2).replace('.', ',')} onBlur={(e) => num('messageCents', e.target.value)} /></Field>
          <Field label="Crédito de IA (R$)"><Input inputMode="decimal" defaultValue={(c.aiCreditCents / 100).toFixed(2).replace('.', ',')} onBlur={(e) => num('aiCreditCents', e.target.value)} /></Field>
          <Field label="Custo fixo por contratante (R$)"><Input inputMode="decimal" defaultValue={(c.fixedCents / 100).toFixed(2).replace('.', ',')} onBlur={(e) => num('fixedCents', e.target.value)} /></Field>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Fórmula: GB × custo/GB + mensagens × custo/mensagem + créditos IA × custo/crédito + fixo. Valores aplicados ao sair do campo; não são persistidos (simulação).</p>
      </Section>
      {alerts.length > 0 && <Alert tone="warning" title="Contratantes perto ou acima do limite do plano">{alerts.map((a) => `${a.name} (${pct(a.maxRatio, 0)})`).join(' · ')}</Alert>}
      <div className="row"><span className="small strong">Ranking por:</span>{(['margem', 'custo', 'uso'] as const).map((s) => <Button key={s} size="sm" variant={sort === s ? 'primary' : 'secondary'} aria-pressed={sort === s} onClick={() => setSort(s)}>{s === 'margem' ? 'Menor margem' : s === 'custo' ? 'Maior custo' : 'Maior uso'}</Button>)}</div>
      <DataTable caption="Custo e margem por contratante" rows={sorted} columns={cols} rowKey={(r) => r.id} exportName="custos-margem" />
      <p className="small muted">Margem sem receita (testes, pausados) é exibida como “sem receita”, não como 0%. Receita de pacientes das clínicas não entra.</p>
    </div>
  )
}
