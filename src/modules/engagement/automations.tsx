// AutomationsPage: construtor de automações, simulação, ativar/desativar, histórico.
import { useState } from 'react'
import { PlusCircle, Play, ToggleLeft, ToggleRight, Trash2, RefreshCw } from 'lucide-react'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { Alert, Badge, Button, Checkbox, DataTable, Dialog, Field, Input, PageHeader, Section, Select, SimBadge, useAction, useConfirm, type Column } from '@/ui'
import { formatDateTime, nowISO } from '@/lib/dates'
import { uid } from '@/lib/util'
import { ACTIONS_BY_TRIGGER, ACTION_LABEL, CONTACTS_PERSON, FIELDS_BY_TRIGGER, TRIGGER_LABEL, OP_LABEL } from './catalog'
import { describeAutomation, execute, simulate, sweep } from './engine'
import type { Automation, AutomationCondition, AutomationRun, RunStatus } from './types'

const RUN_TONE: Record<RunStatus, 'success' | 'danger' | 'warning' | 'neutral' | 'info'> = { executada: 'success', ignorada: 'neutral', limitada: 'warning', adiada: 'info', falhou: 'danger', simulada: 'neutral' }

const blank = (t: string): Omit<Automation, 'id' | 'createdAt' | 'version'> => ({ tenantId: t, name: 'Oferta de vaga (cancelamento)', trigger: 'appointment.cancelled', conditions: [], action: 'offer_waitlist', params: {}, waitMinutes: 0, limits: { maxPerPersonPerDay: 2, windowStart: 8 * 60, windowEnd: 20 * 60 }, active: false })

export function AutomationsPage() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const automations = useCollection(t.tenantId, 'automations')
  const allRuns = useCollection(t.tenantId, 'automationRuns')
  const [edit, setEdit] = useState<Automation | null>(null)
  const [simA, setSimA] = useState<string | null>(null)
  const [sweepResult, setSweepResult] = useState<{ executed: number; deferred: number } | null>(null)
  const canEdit = t.can('automacoes', 'update')
  const canRead = t.can('automacoes')
  if (!t.moduleOn('automacoes') || !canRead) return <><PageHeader title="Automações" /><Alert>Automações indisponíveis neste plano ou perfil.</Alert></>
  const del = async (a: Automation) => {
    if (!(await confirm({ title: `Excluir "${a.name}"?`, danger: true, confirmLabel: 'Excluir' })).ok) return
    run(() => { if (a.active) throw new Error('Desative antes de excluir.'); db.remove(t.tenantId, 'automations', a.id) }, 'Automação excluída.')
  }
  const toggle = (a: Automation) => run(() => db.update(t.tenantId, 'automations', a.id, { active: !a.active, updatedBy: actor.name }), a.active ? 'Automação desativada.' : 'Automação ativada.')
  const runSweep = () => run(() => { const r = sweep(t.tenantId, new Date()); setSweepResult(r) }, 'Varredura concluída.')
  const cols: Column<Automation>[] = [
    { id: 'n', header: 'Nome', cell: (a) => <span className="stack" style={{ '--gap': '0' } as React.CSSProperties}><span className="strong">{a.name}</span><span className="small muted">{describeAutomation(a)}</span></span>, value: (a) => a.name },
    { id: 'st', header: 'Status', cell: (a) => <Badge tone={a.active ? 'success' : 'neutral'}>{a.active ? 'Ativa' : 'Inativa'}</Badge>, value: (a) => a.active ? 'ativa' : 'inativa' },
    { id: 'runs', header: 'Execuções', cell: (a) => allRuns.filter((r) => r.automationId === a.id).length, value: (a) => allRuns.filter((r) => r.automationId === a.id).length, num: true },
  ]
  return <div className="engagement" data-tour="page-content">
    <PageHeader title="Automações" subtitle="Gatilho → condições → ação → limites. Simulação sem efeitos reais." />
    <div className="stack">
      <SimBadge />
      <div className="row between">
        <div className="row"><Button icon={<RefreshCw />} disabled={!canEdit} onClick={runSweep}>Varredura manual</Button>{sweepResult && <span className="small muted">{sweepResult.executed} executada(s), {sweepResult.deferred} adiada(s)</span>}</div>
        <Button variant="primary" icon={<PlusCircle />} data-tour="primary-action" disabled={!canEdit} onClick={() => setEdit({ ...blank(t.tenantId), id: '', createdAt: nowISO(), version: 1 })}>Nova automação</Button>
      </div>
      {!canEdit && <Alert tone="neutral">Consulta permitida. Criar, editar e ativar exigem permissão de atualização.</Alert>}
      <DataTable caption="Automações" rows={automations} columns={cols} rowKey={(a) => a.id} rowActions={(a) => <div className="row"><Button size="sm" icon={<Play />} title="Simular" onClick={() => setSimA(a.id)}>Simular</Button><Button size="sm" icon={a.active ? <ToggleRight /> : <ToggleLeft />} disabled={!canEdit} onClick={() => toggle(a)}>{a.active ? 'Desativar' : 'Ativar'}</Button><Button size="sm" onClick={() => setEdit(a)} disabled={!canEdit}>Editar</Button><Button size="sm" icon={<Trash2 />} disabled={!canEdit} onClick={() => del(a)}>Excluir</Button></div>} />
      <Section title="Histórico de execuções"><RunTable runs={allRuns} automations={automations} /></Section>
    </div>
    {edit && <AutomationEditor a={edit} isNew={!edit.id} onClose={() => setEdit(null)} />}
    {simA && <SimDialog automationId={simA} onClose={() => setSimA(null)} />}
  </div>
}

function AutomationEditor({ a: init, isNew, onClose }: { a: Automation; isNew: boolean; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const [a, setA] = useState<Automation>({ ...init, id: init.id || uid('auto_') })
  const [cond, setCond] = useState<AutomationCondition>({ field: FIELDS_BY_TRIGGER[a.trigger][0]?.id ?? '', op: 'eq', value: '' })
  const save = () => run(() => {
    if (!a.name.trim()) throw new Error('Nome obrigatório.')
    if (!ACTIONS_BY_TRIGGER[a.trigger].includes(a.action)) throw new Error('Ação incompatível com o gatilho.')
    const next = { ...a, version: (init.version ?? 0) + 1, updatedBy: actor.name }
    if (isNew) db.insert(t.tenantId, 'automations', next)
    else db.update(t.tenantId, 'automations', a.id, next)
    onClose()
  }, isNew ? 'Automação criada.' : 'Automação salva.')
  const fields = FIELDS_BY_TRIGGER[a.trigger]
  const actions = ACTIONS_BY_TRIGGER[a.trigger]
  return <Dialog open size="lg" onClose={onClose} title={isNew ? 'Nova automação' : `Editar "${a.name}"`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>{isNew ? 'Criar' : 'Salvar'}</Button></>}>
    <div className="stack">
      <Field label="Nome" required><Input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} /></Field>
      <div className="form-grid">
        <Field label="Gatilho"><Select value={a.trigger} onChange={(e) => { const tr = e.target.value as Automation['trigger']; const ac = ACTIONS_BY_TRIGGER[tr][0]; setA({ ...a, trigger: tr, action: ac, conditions: [] }) }}>{Object.entries(TRIGGER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Ação"><Select value={a.action} onChange={(e) => setA({ ...a, action: e.target.value as Automation['action'] })}>{actions.map((k) => <option key={k} value={k}>{ACTION_LABEL[k]}</option>)}</Select></Field>
      </div>
      <fieldset><legend>Condições</legend>
        <div className="stack">{a.conditions.map((c, i) => <div key={i} className="row"><span className="small">{c.field} {OP_LABEL[c.op]} {c.value}</span><Button size="sm" onClick={() => setA({ ...a, conditions: a.conditions.filter((_, j) => j !== i) })}>✕</Button></div>)}
          <div className="row"><Field label="Campo"><Select value={cond.field} onChange={(e) => setCond({ ...cond, field: e.target.value })}><option value="">…</option>{fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select></Field><Field label="Op"><Select value={cond.op} onChange={(e) => setCond({ ...cond, op: e.target.value as AutomationCondition['op'] })}>{Object.entries(OP_LABEL as Record<string, string>).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field><Field label="Valor"><Input value={cond.value} onChange={(e) => setCond({ ...cond, value: e.target.value })} /></Field><Button disabled={!cond.field || !cond.value} onClick={() => { setA({ ...a, conditions: [...a.conditions, cond] }); setCond({ field: '', op: 'eq', value: '' }) }}>+ Adicionar</Button></div>
        </div>
      </fieldset>
      <div className="form-grid">
        {a.trigger === 'appointment.cancelled' && <Field label="Máx. ofertas simultâneas"><Input type="number" min={1} max={10} value={a.params.maxOffers ?? 1} onChange={(e) => setA({ ...a, params: { ...a.params, maxOffers: Number(e.target.value) } })} /></Field>}
        {(a.trigger === 'proposal.pending' || a.trigger === 'lot.expiring' || a.trigger === 'vaccine.due' || a.trigger === 'record.finalized') && <Field label={a.trigger === 'record.finalized' ? 'Enviar N dias antes do retorno' : 'Limiar em dias (definido por você)'}><Input type="number" min={0} value={a.params.days ?? 0} onChange={(e) => setA({ ...a, params: { ...a.params, days: Number(e.target.value) } })} /></Field>}
        <Field label="Espera antes da ação (min)"><Input type="number" min={0} max={10080} value={a.waitMinutes} onChange={(e) => setA({ ...a, waitMinutes: Number(e.target.value) })} /></Field>
      </div>
      <fieldset><legend>Limites {CONTACTS_PERSON[a.action] && '(esta ação contata pessoas)'}</legend>
        <div className="form-grid"><Field label="Máx. por pessoa/dia (0=sem limite)"><Input type="number" min={0} max={20} value={a.limits.maxPerPersonPerDay} onChange={(e) => setA({ ...a, limits: { ...a.limits, maxPerPersonPerDay: Number(e.target.value) } })} /></Field><Field label="Janela início (HH:MM)"><Input type="time" value={`${String(Math.floor(a.limits.windowStart / 60)).padStart(2, '0')}:${String(a.limits.windowStart % 60).padStart(2, '0')}`} disabled={!CONTACTS_PERSON[a.action]} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); setA({ ...a, limits: { ...a.limits, windowStart: h * 60 + m } }) }} /></Field><Field label="Janela fim"><Input type="time" value={`${String(Math.floor(a.limits.windowEnd / 60)).padStart(2, '0')}:${String(a.limits.windowEnd % 60).padStart(2, '0')}`} disabled={!CONTACTS_PERSON[a.action]} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); setA({ ...a, limits: { ...a.limits, windowEnd: h * 60 + m } }) }} /></Field></div>
        {!CONTACTS_PERSON[a.action] && <p className="small muted">Esta ação é interna (sem contato externo); janela não se aplica.</p>}
      </fieldset>
      <Checkbox label="Automação ativa" checked={a.active} onChange={(e) => setA({ ...a, active: e.target.checked })} />
    </div>
  </Dialog>
}

function SimDialog({ automationId, onClose }: { automationId: string; onClose: () => void }) {
  const t = useTenant()
  const run = useAction()
  const automations = useCollection(t.tenantId, 'automations')
  const a = automations.find((x) => x.id === automationId)
  const [results, setResults] = useState<ReturnType<typeof simulate> | null>(null)
  if (!a) return null
  const runSim = () => run(() => setResults(simulate(t.tenantId, a)), 'Simulação concluída (sem efeitos reais).')
  const doExec = (i: number) => run(() => {
    const r = results?.[i]
    if (!r) return
    if (!a.active) throw new Error('Ative a automação antes de executar.')
    const res = execute(t.tenantId, a, r.ctx, 'evento')
    setResults(simulate(t.tenantId, a))
    if (res.status !== 'executada') throw new Error(`Execução ${res.status}: ${res.detail}`)
  }, 'Executada e registrada no histórico.')
  return <Dialog open size="xl" onClose={onClose} title={`Simular: ${a.name}`} footer={<Button onClick={onClose}>Fechar</Button>}>
    <div className="stack"><Alert>Simulação sem efeitos. "Executar" abaixo aplica a ação real após revisão dos resultados.</Alert>
      <Button icon={<Play />} onClick={runSim}>Simular sobre dados atuais</Button>
      <div aria-live="polite" className="stack">
      {results?.length === 0 && <p className="muted">Nenhum fato atual corresponde a este gatilho.</p>}
      {results?.map((r, i) => <div key={i} className="card tight stack">
        <div className="row between"><span className="strong">{r.ctx.subject}</span><Badge tone={RUN_TONE[r.status]}>{r.status}</Badge></div>
        <p className="small">{r.detail}</p>
        <ul className="small">{r.actions.map((x) => <li key={x}>{x}</li>)}</ul>
        <Button size="sm" disabled={!a.active || r.status === 'ignorada' || r.status === 'limitada'} onClick={() => doExec(i)}>Executar agora (efeito na demonstração)</Button>
      </div>)}
      </div>
    </div>
  </Dialog>
}

function RunTable({ runs, automations }: { runs: AutomationRun[]; automations: Automation[] }) {
  const t = useTenant()
  const sorted = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50)
  const cols: Column<AutomationRun>[] = [
    { id: 'n', header: 'Automação', cell: (r) => automations.find((a) => a.id === r.automationId)?.name ?? r.automationName, value: (r) => r.automationName },
    { id: 'trig', header: 'Gatilho', cell: (r) => r.trigger, value: (r) => r.trigger },
    { id: 'sub', header: 'Contexto', cell: (r) => r.subject, value: (r) => r.subject },
    { id: 'st', header: 'Status', cell: (r) => <Badge tone={RUN_TONE[r.status]}>{r.status}</Badge>, value: (r) => r.status },
    { id: 'dtl', header: 'Detalhe', cell: (r) => <span className="small">{r.detail.slice(0, 80)}</span>, value: (r) => r.detail },
    { id: 'src', header: 'Origem', cell: (r) => r.source },
    { id: 'at', header: 'Quando', cell: (r) => formatDateTime(r.createdAt, t.org.timezone), value: (r) => r.createdAt },
  ]
  return <DataTable caption="Histórico de execuções" rows={sorted} columns={cols} rowKey={(r) => r.id} pageSize={15} exportName="automacoes-historico" />
}
