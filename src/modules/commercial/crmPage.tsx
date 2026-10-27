import { useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { Plus, Settings2, UserPlus, MessageSquareHeart, Headset } from 'lucide-react'
import type { Lead, LeadStage } from '@/domain/modules'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { notificationProvider } from '@/data/repositories'
import { Alert, Badge, Button, Checkbox, Dialog, Field, Input, Kpi, PageHeader, PatientPicker, Select, SimBadge, Tabs, TabPanel, Textarea, Timeline, useAction, useConfirm, DataTable, type Column } from '@/ui'
import { addDaysCivil, formatCivil, formatDateTime, nowISO, todayCivil } from '@/lib/dates'
import { maskPhone, normalize, uid } from '@/lib/util'
import { canSendRelationship, convertLead, moveLead, newLeadDraft, npsScore, SOURCE_LABEL, stageConfig, STAGES, validateInterest } from './crm'
import { ModuleOff, NoAccess, Toolbar } from './ui'
import type { RelationshipMessage } from './types'

const OPT_OUT_TAG = 'Não contatar (relacionamento)'

export function CrmPage() {
  const t = useTenant()
  const [tab, setTab] = useState('funil')
  if (!t.moduleOn('crm')) return <ModuleOff name="CRM" />
  if (!t.can('crm')) return <NoAccess what="o CRM" />
  return (
    <div data-tour="page-content" className="com-page">
      <PageHeader title="CRM" subtitle="Funil comercial, tarefas, indicações e satisfação. Cartões mostram apenas interesse comercial — nunca diagnóstico." />
      <Tabs label="Seções do CRM" value={tab} onChange={setTab} tabs={[{ id: 'funil', label: 'Funil' }, { id: 'rel', label: 'Relacionamento e indicações' }]} />
      <TabPanel>{tab === 'funil' ? <Funnel /> : <Relationship />}</TabPanel>
    </div>
  )
}

function Funnel() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const leads = useCollection(t.tenantId, 'leads')
  const cfg = stageConfig(useCollection(t.tenantId, 'crmStages'))
  const staff = useCollection(t.tenantId, 'staff')
  const [q, setQ] = useState('')
  const [src, setSrc] = useState('')
  const [owner, setOwner] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState<Lead | null>(null)
  const [cfgOpen, setCfgOpen] = useState(false)
  const [dropOn, setDropOn] = useState<LeadStage | null>(null)
  const [live, setLive] = useState('')
  const canEdit = t.can('crm', 'update')
  const label = (s: LeadStage) => cfg.find((c) => c.stage === s)?.label ?? s
  const visible = cfg.filter((c) => !c.hidden)
  const filtered = leads.filter((l) => (!q || normalize(`${l.name} ${l.interest}`).includes(normalize(q))) && (!src || l.source === src) && (!owner || l.ownerId === owner))
  const owners = staff.filter((u) => u.active && u.memberships.some((m) => ['clinic_owner', 'reception', 'network_manager', 'unit_manager'].includes(m.role)))

  const move = async (id: string, to: LeadStage) => {
    const l = leads.find((x) => x.id === id)
    if (!l || l.stage === to) return
    let reason: string | undefined
    if (to === 'perdido') {
      const r = await confirm({ title: `Mover "${l.name}" para ${label('perdido')}`, body: 'O motivo de perda é obrigatório e fica no histórico.', requireReason: true, reasonLabel: 'Motivo da perda', confirmLabel: 'Mover', danger: true })
      if (!r.ok) return
      reason = r.reason
    }
    if (run(() => moveLead(t.tenantId, id, to, actor.name, reason, label), `${l.name} movido para ${label(to)}.`)) setLive(`${l.name} movido para ${label(to)}.`)
  }
  const onDrop = (e: DragEvent, s: LeadStage) => { e.preventDefault(); setDropOn(null); const id = e.dataTransfer.getData('text/plain'); if (id) void move(id, s) }

  const pendingTasks = leads.flatMap((l) => l.tasks.filter((k) => !k.done).map((k) => ({ ...k, lead: l })))
  const overdue = pendingTasks.filter((k) => k.dueOn < todayCivil()).length
  const conv = leads.filter((l) => l.stage === 'convertido').length
  const lost = leads.filter((l) => l.stage === 'perdido').length

  return (
    <div className="stack">
      <div className="grid grid-4">
        <Kpi label="Leads ativos" value={leads.filter((l) => !['convertido', 'perdido'].includes(l.stage)).length} />
        <Kpi label="Convertidos" value={conv} foot={leads.length ? `${Math.round((conv / leads.length) * 100)}% do total` : undefined} />
        <Kpi label="Perdidos" value={lost} />
        <Kpi label="Tarefas pendentes" value={pendingTasks.length} foot={overdue ? `${overdue} em atraso` : 'Nenhuma em atraso'} />
      </div>
      <Toolbar>
        <Field label="Buscar"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou interesse" /></Field>
        <Field label="Origem"><Select value={src} onChange={(e) => setSrc(e.target.value)}><option value="">Todas</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Responsável"><Select value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Todos</option>{owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <div className="row end">
          {canEdit && <Button icon={<Settings2 />} onClick={() => setCfgOpen(true)}>Etapas</Button>}
          {t.can('crm', 'create') && <Button variant="primary" icon={<Plus />} data-tour="primary-action" onClick={() => setCreating(newLeadDraft(t.tenantId))}>Novo lead</Button>}
        </div>
      </Toolbar>
      <p className="small muted">Arraste os cartões entre etapas ou use "Mover para" em cada cartão (teclado e leitor de tela).</p>
      <div className="sr-only" aria-live="polite">{live}</div>
      <div className="kanban com-kanban" role="list" aria-label="Funil comercial">
        {visible.map((c) => {
          const items = filtered.filter((l) => l.stage === c.stage)
          return (
            <section key={c.stage} role="listitem" aria-label={`${c.label}: ${items.length} lead(s)`} className={`kanban-col${dropOn === c.stage ? ' drop' : ''}`}
              onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDropOn(c.stage) } }} onDragLeave={() => setDropOn(null)} onDrop={(e) => onDrop(e, c.stage)}>
              <h2>{c.label}<Badge plain>{items.length}</Badge></h2>
              {items.map((l) => {
                const open = l.tasks.filter((k) => !k.done)
                return (
                  <article key={l.id} className="kanban-card" draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData('text/plain', l.id)} aria-label={l.name}>
                    <button className="card-title" onClick={() => setOpenId(l.id)}>{l.name}</button>
                    <span className="small">{l.interest}</span>
                    <div className="row" style={{ '--gap': '4px' } as React.CSSProperties}>
                      <Badge tone="brand" plain>{SOURCE_LABEL[l.source]}</Badge>
                      {l.referredByPatientId && l.source !== 'indicacao' && <Badge tone="info" plain>Indicação</Badge>}
                      {open.length > 0 && <Badge tone={open.some((k) => k.dueOn < todayCivil()) ? 'danger' : 'neutral'} plain>{open.length} tarefa(s)</Badge>}
                      {l.patientId && <Badge tone="success" plain>Paciente</Badge>}
                    </div>
                    <span className="tiny muted">{staff.find((u) => u.id === l.ownerId)?.name ?? 'Sem responsável'}</span>
                    {canEdit && (
                      <Field label={<span className="tiny">Mover para</span>}>
                        <Select value={l.stage} onChange={(e) => void move(l.id, e.target.value as LeadStage)}>
                          {cfg.map((s) => <option key={s.stage} value={s.stage}>{s.label}{s.hidden ? ' (oculta)' : ''}</option>)}
                        </Select>
                      </Field>
                    )}
                  </article>
                )
              })}
              {!items.length && <p className="small muted">Sem leads.</p>}
            </section>
          )
        })}
      </div>
      {cfg.some((c) => c.hidden) && <p className="small muted">Etapas ocultas: {cfg.filter((c) => c.hidden).map((c) => `${c.label} (${leads.filter((l) => l.stage === c.stage).length})`).join(', ')}.</p>}
      {openId && <LeadDrawer id={openId} onClose={() => setOpenId(null)} label={label} />}
      {creating && <LeadForm draft={creating} onClose={() => setCreating(null)} />}
      {cfgOpen && <StageConfigDialog onClose={() => setCfgOpen(false)} />}
    </div>
  )
}

function LeadForm({ draft, onClose }: { draft: Lead; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const staff = useCollection(t.tenantId, 'staff')
  const [l, setL] = useState(draft)
  const [err, setErr] = useState<string | null>(null)
  const save = () => {
    const e = !l.name.trim() ? 'Informe o nome.' : validateInterest(l.interest)
    setErr(e)
    if (e) return
    if (run(() => db.insert(t.tenantId, 'leads', { ...l, ownerId: l.ownerId || actor.id, history: [{ at: nowISO(), by: actor.name, text: `Lead criado (origem: ${SOURCE_LABEL[l.source]})` }] }), 'Lead criado.')) onClose()
  }
  return (
    <Dialog open onClose={onClose} title="Novo lead" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar lead</Button></>}>
      <div className="form-grid">
        <Field label="Nome" required><Input value={l.name} onChange={(e) => setL({ ...l, name: e.target.value })} /></Field>
        <Field label="Telefone"><Input mask={maskPhone} value={l.phone ?? ''} onChange={(e) => setL({ ...l, phone: e.target.value })} placeholder="(00) 00000-0000" /></Field>
        <Field label="E-mail"><Input type="email" value={l.email ?? ''} onChange={(e) => setL({ ...l, email: e.target.value })} placeholder="nome@exemplo.test" /></Field>
        <Field label="Origem"><Select value={l.source} onChange={(e) => setL({ ...l, source: e.target.value as Lead['source'] })}>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Responsável"><Select value={l.ownerId ?? ''} onChange={(e) => setL({ ...l, ownerId: e.target.value || undefined })}><option value="">Eu ({actor.name})</option>{staff.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
      </div>
      <Field label="Interesse comercial" required error={err} hint="Serviço desejado. Não registre condição de saúde ou diagnóstico."><Input value={l.interest} onChange={(e) => setL({ ...l, interest: e.target.value })} /></Field>
      {l.source === 'indicacao' && <PatientPicker label="Indicado por (paciente)" value={l.referredByPatientId ?? null} onChange={(id) => setL({ ...l, referredByPatientId: id ?? undefined })} />}
    </Dialog>
  )
}

function LeadDrawer({ id, onClose, label }: { id: string; onClose: () => void; label: (s: LeadStage) => string }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const l = useCollection(t.tenantId, 'leads').find((x) => x.id === id)
  const staff = useCollection(t.tenantId, 'staff')
  const proposals = useCollection(t.tenantId, 'proposals')
  const patients = useCollection(t.tenantId, 'patients')
  const [task, setTask] = useState({ title: '', dueOn: addDaysCivil(todayCivil(), 1) })
  const [interest, setInterest] = useState(l?.interest ?? '')
  const [err, setErr] = useState<string | null>(null)
  const canEdit = t.can('crm', 'update')
  if (!l) return null
  const upd = (patch: Partial<Lead>, text: string) => run(() => db.update(t.tenantId, 'leads', l.id, (p) => ({ ...p, ...patch, history: [...p.history, { at: nowISO(), by: actor.name, text }] })), 'Lead atualizado.')
  const patient = patients.find((p) => p.id === l.patientId)
  const props = proposals.filter((p) => p.patientId === l.patientId && p.status !== 'revogada')
  return (
    <Dialog open drawer onClose={onClose} title={l.name} description={`${label(l.stage)} · origem ${SOURCE_LABEL[l.source]}`}>
      <div className="stack">
        {l.stage === 'perdido' && <Alert tone="neutral" title="Motivo da perda">{l.lostReason}</Alert>}
        <div className="form-grid">
          <Field label="Interesse comercial" error={err} hint="Sem diagnóstico ou condição de saúde.">
            <Input value={interest} disabled={!canEdit} onChange={(e) => setInterest(e.target.value)} onBlur={() => { if (interest === l.interest) return; const e = validateInterest(interest); setErr(e); if (!e) upd({ interest }, `Interesse alterado para "${interest}"`) }} />
          </Field>
          <Field label="Responsável"><Select value={l.ownerId ?? ''} disabled={!canEdit} onChange={(e) => upd({ ownerId: e.target.value || undefined }, `Responsável: ${staff.find((u) => u.id === e.target.value)?.name ?? 'nenhum'}`)}><option value="">Sem responsável</option>{staff.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="Telefone"><Input value={l.phone ?? ''} readOnly /></Field>
        </div>
        <Checkbox label="Não deseja receber mensagens de relacionamento (opt-out)" checked={l.optOut} disabled={!canEdit} onChange={(e) => upd({ optOut: e.target.checked }, e.target.checked ? 'Opt-out registrado' : 'Opt-out removido')} />
        {l.referredByPatientId && <p className="small">Indicado por: <strong>{patients.find((p) => p.id === l.referredByPatientId)?.name ?? '—'}</strong></p>}

        <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties} aria-labelledby="lead-pat">
          <h3 id="lead-pat">Paciente e proposta</h3>
          {patient ? <p className="small">Paciente vinculado: <Link to={`${t.base}/pacientes/${patient.id}`}>{patient.name}</Link></p> : (
            canEdit && t.can('pacientes', 'create') ? <Button icon={<UserPlus />} onClick={() => run(() => { const r = convertLead(t.tenantId, l.id, t.unitId ?? t.allowedUnits[0].id, actor.name); if (r.reused) throw new Error(`Já existe paciente semelhante (${r.patient.name}); lead vinculado a ele para evitar duplicidade.`) }, 'Lead convertido em paciente.')}>Converter em paciente</Button>
              : <p className="small muted">Seu perfil não pode cadastrar pacientes.</p>)}
          {patient && (
            <div className="row">
              <Field label="Proposta vinculada" className="grow">
                <Select value={l.proposalId ?? ''} disabled={!canEdit} onChange={(e) => upd({ proposalId: e.target.value || undefined }, e.target.value ? `Proposta vinculada: ${props.find((p) => p.id === e.target.value)?.number}` : 'Proposta desvinculada')}>
                  <option value="">Nenhuma</option>{props.map((p) => <option key={p.id} value={p.id}>{p.number} v{p.version} ({p.status})</option>)}
                </Select>
              </Field>
              {l.proposalId && <Link className="btn btn-secondary" to={`${t.base}/orcamentos/${l.proposalId}`}>Abrir proposta</Link>}
              {t.can('orcamentos', 'create') && <Link className="btn btn-secondary" to={`${t.base}/orcamentos?novo=${patient.id}`}>Novo orçamento</Link>}
            </div>
          )}
        </section>

        <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties} aria-labelledby="lead-tasks">
          <h3 id="lead-tasks">Tarefas</h3>
          {l.tasks.length === 0 && <p className="small muted">Nenhuma tarefa.</p>}
          {l.tasks.map((k) => (
            <Checkbox key={k.id} checked={k.done} disabled={!canEdit} label={<span>{k.title} <span className={k.dueOn < todayCivil() && !k.done ? 'com-neg small' : 'small muted'}>· prazo {formatCivil(k.dueOn)}</span></span>}
              onChange={(e) => upd({ tasks: l.tasks.map((x) => x.id === k.id ? { ...x, done: e.target.checked } : x) }, `Tarefa "${k.title}" ${e.target.checked ? 'concluída' : 'reaberta'}`)} />
          ))}
          {canEdit && (
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <Field label="Nova tarefa" className="grow"><Input value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} /></Field>
              <Field label="Prazo"><Input type="date" value={task.dueOn} onChange={(e) => setTask({ ...task, dueOn: e.target.value })} /></Field>
              <Button onClick={() => { if (!task.title.trim()) return run(() => { throw new Error('Informe o título da tarefa.') }); if (upd({ tasks: [...l.tasks, { id: uid('tk_'), title: task.title.trim(), dueOn: task.dueOn, done: false, assigneeId: l.ownerId }] }, `Tarefa criada: ${task.title}`)) setTask({ ...task, title: '' }) }}>Adicionar</Button>
            </div>
          )}
        </section>
        <section aria-labelledby="lead-hist" className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <h3 id="lead-hist">Histórico</h3>
          <Timeline items={[...l.history].reverse().map((h) => ({ time: formatDateTime(h.at), title: h.text, body: h.by }))} />
        </section>
      </div>
    </Dialog>
  )
}

function StageConfigDialog({ onClose }: { onClose: () => void }) {
  const t = useTenant()
  const run = useAction()
  const cfg = stageConfig(useCollection(t.tenantId, 'crmStages'))
  const [rows, setRows] = useState(cfg)
  const save = () => {
    if (rows.some((r) => !r.label.trim())) return run(() => { throw new Error('Nenhuma etapa pode ficar sem nome.') })
    if (rows.every((r) => r.hidden)) return run(() => { throw new Error('Mantenha ao menos uma etapa visível.') })
    if (run(() => db.set(t.tenantId, 'crmStages', rows.map((r, i) => ({ id: r.id ?? uid('stg_'), tenantId: t.tenantId, createdAt: nowISO(), stage: r.stage, label: r.label.trim(), hidden: r.hidden, order: i }))), 'Etapas salvas para esta clínica.')) onClose()
  }
  return (
    <Dialog open onClose={onClose} title="Etapas do funil" description="Renomeie ou oculte etapas. A regra (ex.: motivo obrigatório em Perdido) continua valendo." footer={<><Button onClick={() => setRows(STAGES.map((s, i) => ({ ...s, hidden: false, order: i, id: cfg[i]?.id })))}>Restaurar padrão</Button><Button variant="primary" onClick={save}>Salvar</Button></>}>
      <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
        {rows.map((r, i) => (
          <div key={r.stage} className="row" style={{ alignItems: 'flex-end' }}>
            <Field label={`Etapa ${i + 1} (${STAGES.find((s) => s.stage === r.stage)?.label})`} className="grow"><Input value={r.label} onChange={(e) => setRows(rows.map((x) => x.stage === r.stage ? { ...x, label: e.target.value } : x))} /></Field>
            <Checkbox label="Ocultar" checked={r.hidden} onChange={(e) => setRows(rows.map((x) => x.stage === r.stage ? { ...x, hidden: e.target.checked } : x))} />
          </div>
        ))}
      </div>
    </Dialog>
  )
}

function Relationship() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const msgs = useCollection(t.tenantId, 'relationshipMessages')
  const patients = useCollection(t.tenantId, 'patients')
  const leads = useCollection(t.tenantId, 'leads')
  const [pat, setPat] = useState<string | null>(null)
  const [answer, setAnswer] = useState<RelationshipMessage | null>(null)
  const canEdit = t.can('crm', 'update')
  const score = npsScore(msgs)
  const p = patients.find((x) => x.id === pat)
  const optOut = !!p?.tags.includes(OPT_OUT_TAG)
  const send = (kind: RelationshipMessage['kind']) => run(() => {
    if (!p) throw new Error('Selecione o paciente.')
    const chk = canSendRelationship(msgs, p.id, kind, optOut)
    if (!chk.ok) throw new Error(chk.reason)
    const personId = p.personId ?? db.list(t.tenantId, 'links').find((l) => l.patientId === p.id)?.personId
    if (!personId) throw new Error('Paciente sem pessoa de contato vinculada.')
    const m: RelationshipMessage = { id: uid('rel_'), tenantId: t.tenantId, createdAt: nowISO(), kind, patientId: p.id, personId, sentAt: nowISO(), by: actor.name }
    db.insert(t.tenantId, 'relationshipMessages', m)
    // Texto neutro: nunca cita procedimento, condição de saúde ou resultado.
    notificationProvider.enqueue(t.tenantId, { event: 'retorno', channel: 'email', recipientName: p.name, recipientRef: personId, subject: kind === 'nps' ? `Como foi sua experiência na ${t.org.name}?` : `Indique a ${t.org.name}`, preview: kind === 'nps' ? 'Responda de 0 a 10. Você pode deixar de receber estas mensagens a qualquer momento.' : 'Se gostou do atendimento, compartilhe nosso contato. Responda SAIR para não receber mais.', dedupeKey: `rel:${m.id}` })
  }, kind === 'nps' ? 'Pesquisa de satisfação enfileirada (simulado).' : 'Convite de indicação enfileirado (simulado).')
  const human = (m: RelationshipMessage) => run(() => {
    if (!m.personId) throw new Error('Mensagem sem pessoa vinculada.')
    const req = { id: uid('req_'), tenantId: t.tenantId, createdAt: nowISO(), personId: m.personId, patientId: m.patientId, kind: 'atendimento' as const, message: `Retorno de pesquisa de satisfação (nota ${m.score ?? '—'}): ${m.comment ?? 'sem comentário'}. Encaminhado para atendimento humano.`, status: 'aberta' as const, handledBy: actor.name }
    db.insert(t.tenantId, 'portalRequests', req)
    db.update(t.tenantId, 'relationshipMessages', m.id, { humanRequestId: req.id })
  }, 'Encaminhado para atendimento humano (solicitação aberta na recepção).')
  const referrals = useMemo(() => {
    const m = new Map<string, number>()
    leads.forEach((l) => l.referredByPatientId && m.set(l.referredByPatientId, (m.get(l.referredByPatientId) ?? 0) + 1))
    return [...m.entries()].map(([id, n]) => ({ id, n, name: patients.find((x) => x.id === id)?.name ?? '—', converted: leads.filter((l) => l.referredByPatientId === id && l.stage === 'convertido').length }))
  }, [leads, patients])
  const cols: Column<RelationshipMessage>[] = [
    { id: 'pat', header: 'Paciente', cell: (m) => patients.find((x) => x.id === m.patientId)?.name ?? '—', value: (m) => patients.find((x) => x.id === m.patientId)?.name },
    { id: 'kind', header: 'Tipo', cell: (m) => m.kind === 'nps' ? 'Satisfação (NPS)' : 'Indicação' },
    { id: 'sent', header: 'Enviada', cell: (m) => formatDateTime(m.sentAt), value: (m) => m.sentAt },
    { id: 'score', header: 'Nota', num: true, cell: (m) => m.score ?? <span className="muted">Sem resposta</span>, value: (m) => m.score ?? -1 },
    { id: 'comment', header: 'Comentário', cell: (m) => m.comment ?? '—' },
  ]
  return (
    <div className="stack">
      <SimBadge />
      <div className="grid grid-4">
        <Kpi label="NPS (simples)" value={score.nps ?? '—'} foot={`${score.n} resposta(s)`} />
        <Kpi label="Promotores (9–10)" value={score.promoters} />
        <Kpi label="Detratores (0–6)" value={score.detractors} />
        <Kpi label="Leads por indicação" value={leads.filter((l) => l.referredByPatientId).length} />
      </div>
      <Alert tone="info" title="Regras de relacionamento">Respeitam opt-out e limite de frequência (NPS a cada 90 dias; indicação a cada 180). Mensagens nunca citam procedimento, condição de saúde ou resultado garantido. Qualquer resposta pode virar atendimento humano.</Alert>
      {canEdit && (
        <div className="panel"><div className="panel-body stack">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="grow"><PatientPicker value={pat} onChange={setPat} /></div>
            <Button icon={<MessageSquareHeart />} onClick={() => send('nps')} disabled={!p}>Enviar pesquisa de satisfação</Button>
            <Button onClick={() => send('indicacao')} disabled={!p}>Enviar convite de indicação</Button>
          </div>
          {p && <Checkbox label="Paciente não deseja mensagens de relacionamento (opt-out)" checked={optOut} onChange={(e) => run(() => db.update(t.tenantId, 'patients', p.id, { tags: e.target.checked ? [...p.tags, OPT_OUT_TAG] : p.tags.filter((x) => x !== OPT_OUT_TAG) }), 'Preferência registrada.')} />}
        </div></div>
      )}
      <DataTable caption="Mensagens de relacionamento" rows={[...msgs].sort((a, b) => b.sentAt.localeCompare(a.sentAt))} columns={cols} rowKey={(m) => m.id} exportName="relacionamento"
        rowActions={(m) => canEdit ? <>
          {m.score == null && <Button size="sm" onClick={() => setAnswer(m)}>Registrar resposta</Button>}
          {m.humanRequestId ? <Badge tone="info">Atendimento humano aberto</Badge> : <Button size="sm" icon={<Headset />} onClick={() => human(m)}>Atendimento humano</Button>}
        </> : null} />
      <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Indicações por paciente</h2></div><div className="panel-body">
        {referrals.length === 0 ? <p className="muted small">Nenhuma indicação registrada.</p> : (
          <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{referrals.map((r) => <li key={r.id} className="row between" style={{ padding: '8px 0' }}><span>{r.name}</span><span className="small">{r.n} indicação(ões) · {r.converted} convertida(s)</span></li>)}</ul>
        )}
      </div></section>
      {answer && <AnswerDialog m={answer} onClose={() => setAnswer(null)} />}
    </div>
  )
}

function AnswerDialog({ m, onClose }: { m: RelationshipMessage; onClose: () => void }) {
  const t = useTenant()
  const run = useAction()
  const [score, setScore] = useState('10')
  const [comment, setComment] = useState('')
  return (
    <Dialog open onClose={onClose} title="Registrar resposta recebida" description="Use quando o paciente responder por telefone/WhatsApp (simulado)." footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => { if (run(() => db.update(t.tenantId, 'relationshipMessages', m.id, { score: Number(score), comment: comment.trim() || undefined, respondedAt: nowISO() }), 'Resposta registrada.')) onClose() }}>Salvar</Button></>}>
      <Field label="Nota (0 a 10)"><Select value={score} onChange={(e) => setScore(e.target.value)}>{Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}</Select></Field>
      <Field label="Comentário" hint="Não registre informação clínica aqui."><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
    </Dialog>
  )
}
