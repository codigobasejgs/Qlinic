// Plano de cuidado multidisciplinar: participantes do MESMO tenant, acesso por seção, liberação ao paciente, encaminhamentos internos e tarefas.
import { useState } from 'react'
import { Lock, Network, Plus, Send } from 'lucide-react'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit } from '@/data/repositories'
import type { ID, Patient } from '@/domain/types'
import { Alert, Badge, Button, Checkbox, EmptyState, Field, Input, Section, Select, Tabs, TabPanel, Textarea, useAction, useLookup } from '@/ui'
import { formatCivil, formatDateTime, nowISO, todayCivil, addDaysCivil } from '@/lib/dates'
import { uid } from '@/lib/util'
import type { CarePlan, ReferralStatus } from './types'
import { NoAccess, ReadOnly, SpecShell, proNameOf } from './common'

const REF_LABEL: Record<ReferralStatus, string> = { enviado: 'Enviado', aceito: 'Aceito', recusado: 'Recusado', concluido: 'Concluído' }
const REF_TONE = { enviado: 'info', aceito: 'brand', recusado: 'danger', concluido: 'success' } as const

export function CarePlanPage() {
  const t = useTenant()
  const [tab, setTab] = useState('secoes')
  return (
    <SpecShell title="Plano de cuidado multidisciplinar" module="multidisciplinar" filter={(p) => p.kind === 'human'} subtitle="Plano compartilhado entre profissionais desta organização, com acesso por seção.">
      {(patient) => (
        <>
          <Alert tone="info" title="Escopo da organização">Participantes são apenas profissionais de {t.org.name}. O plano não une prontuários entre organizações diferentes.</Alert>
          {t.scope('clinical') === false ? <NoAccess /> : !patient ? <EmptyState title="Selecione um paciente" icon={<Network aria-hidden="true" />} /> : (
            <>
              <Tabs value={tab} onChange={setTab} label="Seções do plano" tabs={[{ id: 'secoes', label: 'Seções e acesso' }, { id: 'participantes', label: 'Participantes' }, { id: 'encaminhamentos', label: 'Encaminhamentos' }, { id: 'tarefas', label: 'Tarefas' }]} />
              <TabPanel><PlanBody patient={patient} tab={tab} /></TabPanel>
            </>
          )}
        </>
      )}
    </SpecShell>
  )
}

function PlanBody({ patient, tab }: { patient: Patient; tab: string }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const { pros } = useLookup()
  const plans = useCollection(t.tenantId, 'carePlans').filter((p) => p.patientId === patient.id)
  const plan = plans.find((p) => p.status === 'ativo') ?? plans[0]
  const me = t.access.professionalId
  const isOwnerScope = t.scope('clinical') === 'all'
  const isParticipant = !!plan && !!me && plan.participants.some((p) => p.professionalId === me)
  const canEdit = isParticipant && t.can('clinical', 'create')
  const upd = (fn: (p: CarePlan) => CarePlan, msg: string, action = 'plano_cuidado.atualizado') => plan && act(() => { db.update(t.tenantId, 'carePlans', plan.id, fn); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action, resource: 'carePlans', resourceId: plan.id, detail: msg }) }, msg)
  if (!plan) {
    const can = !!me && t.can('clinical', 'create')
    return <EmptyState title="Sem plano de cuidado" action={can ? <Button variant="primary" icon={<Plus />} data-tour="primary-action" onClick={() => act(() => db.insert(t.tenantId, 'carePlans', { id: uid('cp_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, title: 'Plano de cuidado', status: 'ativo', createdBy: actor.name, participants: [{ professionalId: me!, role: 'Coordenação do plano', addedAt: nowISO(), addedBy: actor.name }], sections: [], referrals: [], tasks: [] }), 'Plano criado')}>Criar plano</Button> : undefined}>{can ? 'Crie o plano e adicione participantes.' : 'Somente profissionais criam planos.'}</EmptyState>
  }
  if (!isParticipant && !isOwnerScope) return <NoAccess>Você não participa deste plano. Peça a um participante para incluí-lo.</NoAccess>
  if (tab === 'participantes') return <Participants plan={plan} canEdit={canEdit} upd={upd} pros={pros} />
  if (tab === 'encaminhamentos') return <Referrals plan={plan} canEdit={canEdit} upd={upd} pros={pros} me={me} actorName={actor.name} />
  if (tab === 'tarefas') return <Tasks plan={plan} canEdit={canEdit} upd={upd} pros={pros} actorName={actor.name} />
  return <Sections plan={plan} canEdit={canEdit} upd={upd} pros={pros} me={me} isOwnerScope={isOwnerScope} actorName={actor.name} />
}

type Upd = (fn: (p: CarePlan) => CarePlan, msg: string, action?: string) => boolean | undefined
type Pros = { id: ID; name: string; specialty: string; active: boolean }[]

function Sections({ plan, canEdit, upd, pros, me, actorName }: { plan: CarePlan; canEdit: boolean; upd: Upd; pros: Pros; me?: ID; isOwnerScope: boolean; actorName: string }) {
  const [f, setF] = useState({ title: '', content: '' })
  const [edit, setEdit] = useState<{ id: ID; content: string } | null>(null)
  const pIds = plan.participants.map((p) => p.professionalId)
  return (
    <div className="stack">
      {!canEdit && <ReadOnly>Visualização da gestão: somente participantes editam. Seções sem acesso aparecem bloqueadas.</ReadOnly>}
      {plan.sections.map((s) => {
        const visible = !!me && s.visibleTo.includes(me)
        const isAuthor = s.authorProId === me
        return (
          <Section key={s.id} title={<span className="row">{s.title} {s.releasedToPatient ? <Badge tone="success">Liberada ao paciente</Badge> : <Badge>Interna</Badge>}</span>}>
            {!visible ? <p className="small muted"><Lock size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} /> Seção restrita a: {s.visibleTo.map((id) => proNameOf(pros, id)).join(', ')}.</p> : (
              <div className="stack">
                {edit?.id === s.id ? (
                  <><Field label="Conteúdo"><Textarea value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} rows={4} /></Field>
                    <div className="row"><Button onClick={() => setEdit(null)}>Cancelar</Button><Button variant="primary" onClick={() => { if (upd((p) => ({ ...p, sections: p.sections.map((x) => x.id === s.id ? { ...x, content: edit.content, updatedAt: nowISO(), updatedBy: actorName } : x) }), 'Seção atualizada')) setEdit(null) }}>Salvar</Button></div></>
                ) : <p>{s.content}</p>}
                <span className="small muted">Autor: {proNameOf(pros, s.authorProId)} · atualizado por {s.updatedBy} em {formatDateTime(s.updatedAt)}</span>
                {canEdit && isAuthor && (
                  <fieldset><legend>Acesso e liberação</legend>
                    <div className="row">{plan.participants.map((p) => <Checkbox key={p.professionalId} label={proNameOf(pros, p.professionalId)} checked={s.visibleTo.includes(p.professionalId)} disabled={p.professionalId === s.authorProId}
                      onChange={(e) => upd((pl) => ({ ...pl, sections: pl.sections.map((x) => x.id === s.id ? { ...x, visibleTo: e.target.checked ? [...x.visibleTo, p.professionalId] : x.visibleTo.filter((v) => v !== p.professionalId) } : x) }), 'Acesso à seção alterado')} />)}</div>
                    <Checkbox label="Liberar esta seção ao paciente (portal)" checked={s.releasedToPatient} onChange={(e) => upd((pl) => ({ ...pl, sections: pl.sections.map((x) => x.id === s.id ? { ...x, releasedToPatient: e.target.checked } : x) }), e.target.checked ? 'Seção liberada ao paciente' : 'Seção recolhida do paciente')} />
                    {edit?.id !== s.id && <div><Button size="sm" onClick={() => setEdit({ id: s.id, content: s.content })}>Editar conteúdo</Button></div>}
                  </fieldset>
                )}
              </div>
            )}
          </Section>
        )
      })}
      {canEdit && (
        <Section title="Nova seção">
          <div className="stack">
            <Field label="Título"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Conteúdo"><Textarea value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} rows={3} /></Field>
            <p className="small muted">Por padrão visível só para você; ajuste o acesso depois de criar.</p>
            <div className="form-actions"><Button variant="primary" data-tour="primary-action" disabled={!f.title.trim() || !f.content.trim()} onClick={() => { if (upd((p) => ({ ...p, sections: [...p.sections, { id: uid('s_'), title: f.title.trim(), content: f.content.trim(), authorProId: me!, visibleTo: [me!], releasedToPatient: false, updatedAt: nowISO(), updatedBy: actorName }] }), 'Seção criada')) setF({ title: '', content: '' }) }}>Adicionar seção</Button></div>
          </div>
        </Section>
      )}
      <p className="small muted">Participantes do plano: {pIds.map((id) => proNameOf(pros, id)).join(', ')}.</p>
    </div>
  )
}

function Participants({ plan, canEdit, upd, pros }: { plan: CarePlan; canEdit: boolean; upd: Upd; pros: Pros }) {
  const actor = useActor()
  const [pid, setPid] = useState('')
  const [role, setRole] = useState('')
  const available = pros.filter((p) => p.active && !plan.participants.some((x) => x.professionalId === p.id))
  return (
    <Section title="Participantes (somente desta organização)">
      <div className="stack">
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, '--gap': '8px' } as React.CSSProperties}>
          {plan.participants.map((p) => {
            const pro = pros.find((x) => x.id === p.professionalId)
            return <li key={p.professionalId} className="list-card"><div className="row between"><strong>{pro?.name}</strong><Badge>{p.role}</Badge></div><span className="small muted">{pro?.specialty} · incluído por {p.addedBy} em {formatDateTime(p.addedAt)}</span>
              {canEdit && plan.participants.length > 1 && <div><Button size="sm" variant="ghost" onClick={() => upd((pl) => ({ ...pl, participants: pl.participants.filter((x) => x.professionalId !== p.professionalId), sections: pl.sections.map((s) => ({ ...s, visibleTo: s.visibleTo.filter((v) => v !== p.professionalId || s.authorProId === v) })) }), 'Participante removido')}>Remover</Button></div>}</li>
          })}
        </ul>
        {canEdit ? (
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <Field label="Profissional"><Select value={pid} onChange={(e) => setPid(e.target.value)}><option value="">Selecione</option>{available.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.specialty}</option>)}</Select></Field>
            <Field label="Papel no plano"><Input value={role} onChange={(e) => setRole(e.target.value)} /></Field>
            <Button variant="primary" data-tour="primary-action" disabled={!pid} onClick={() => { if (upd((pl) => ({ ...pl, participants: [...pl.participants, { professionalId: pid, role: role.trim() || 'Participante', addedAt: nowISO(), addedBy: actor.name }] }), 'Participante incluído')) { setPid(''); setRole('') } }}>Incluir</Button>
          </div>
        ) : <ReadOnly>Somente participantes incluem outros profissionais.</ReadOnly>}
      </div>
    </Section>
  )
}

function Referrals({ plan, canEdit, upd, pros, me, actorName }: { plan: CarePlan; canEdit: boolean; upd: Upd; pros: Pros; me?: ID; actorName: string }) {
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const move = (id: ID, status: ReferralStatus) => upd((p) => ({ ...p, referrals: p.referrals.map((r) => r.id === id ? { ...r, status, history: [...r.history, { at: nowISO(), by: actorName, to: status }] } : r) }), `Encaminhamento: ${REF_LABEL[status]}`)
  const next: Record<ReferralStatus, ReferralStatus[]> = { enviado: ['aceito', 'recusado'], aceito: ['concluido'], recusado: [], concluido: [] }
  return (
    <Section title="Encaminhamentos internos">
      <div className="stack">
        {plan.referrals.length === 0 && <p className="muted small">Nenhum encaminhamento.</p>}
        {plan.referrals.map((r) => (
          <div key={r.id} className="list-card">
            <div className="row between"><strong>{proNameOf(pros, r.fromProId)} → {proNameOf(pros, r.toProId)}</strong><Badge tone={REF_TONE[r.status]}>{REF_LABEL[r.status]}</Badge></div>
            <span className="small">{r.reason}</span>
            <span className="tiny muted">{r.history.map((h) => `${REF_LABEL[h.to]} por ${h.by} (${formatDateTime(h.at)})`).join(' · ')}</span>
            {canEdit && r.toProId === me && next[r.status].length > 0 && <div className="row">{next[r.status].map((s) => <Button key={s} size="sm" variant={s === 'recusado' ? 'ghost' : 'secondary'} onClick={() => move(r.id, s)}>{s === 'aceito' ? 'Aceitar' : s === 'recusado' ? 'Recusar' : 'Concluir'}</Button>)}</div>}
          </div>
        ))}
        {canEdit && (
          <fieldset><legend>Novo encaminhamento</legend>
            <div className="form-grid">
              <Field label="Para"><Select value={to} onChange={(e) => setTo(e.target.value)}><option value="">Selecione</option>{plan.participants.filter((p) => p.professionalId !== me).map((p) => <option key={p.professionalId} value={p.professionalId}>{proNameOf(pros, p.professionalId)}</option>)}</Select></Field>
            </div>
            <Field label="Motivo"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
            <div className="form-actions"><Button variant="primary" icon={<Send />} data-tour="primary-action" disabled={!to || !reason.trim()} onClick={() => { if (upd((p) => ({ ...p, referrals: [...p.referrals, { id: uid('r_'), fromProId: me!, toProId: to, reason: reason.trim(), status: 'enviado', at: nowISO(), history: [{ at: nowISO(), by: actorName, to: 'enviado' }] }] }), 'Encaminhamento enviado')) { setTo(''); setReason('') } }}>Encaminhar</Button></div>
          </fieldset>
        )}
      </div>
    </Section>
  )
}

function Tasks({ plan, canEdit, upd, pros, actorName }: { plan: CarePlan; canEdit: boolean; upd: Upd; pros: Pros; actorName: string }) {
  const [f, setF] = useState({ title: '', assigneeProId: '', dueOn: addDaysCivil(todayCivil(), 7) })
  const today = todayCivil()
  const sorted = [...plan.tasks].sort((a, b) => Number(a.done) - Number(b.done) || a.dueOn.localeCompare(b.dueOn))
  return (
    <Section title="Tarefas">
      <div className="stack">
        {sorted.length === 0 && <p className="muted small">Nenhuma tarefa.</p>}
        {sorted.map((k) => (
          <div key={k.id} className="list-card">
            <div className="row between">
              {canEdit ? <Checkbox label={<span style={k.done ? { textDecoration: 'line-through' } : undefined}>{k.title}</span>} checked={k.done} onChange={(e) => upd((p) => ({ ...p, tasks: p.tasks.map((x) => x.id === k.id ? { ...x, done: e.target.checked, doneAt: e.target.checked ? nowISO() : undefined, doneBy: e.target.checked ? actorName : undefined } : x) }), e.target.checked ? 'Tarefa concluída' : 'Tarefa reaberta')} /> : <strong>{k.title}</strong>}
              {k.done ? <Badge tone="success">Concluída</Badge> : k.dueOn < today ? <Badge tone="danger">Atrasada</Badge> : <Badge tone="info">Pendente</Badge>}
            </div>
            <span className="small muted">Responsável: {proNameOf(pros, k.assigneeProId)} · prazo {formatCivil(k.dueOn)}{k.doneAt ? ` · concluída por ${k.doneBy} em ${formatDateTime(k.doneAt)}` : ''}</span>
          </div>
        ))}
        {canEdit && (
          <fieldset><legend>Nova tarefa</legend>
            <div className="form-grid" style={{ alignItems: 'end' }}>
              <Field label="Tarefa"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
              <Field label="Responsável"><Select value={f.assigneeProId} onChange={(e) => setF({ ...f, assigneeProId: e.target.value })}><option value="">Selecione</option>{plan.participants.map((p) => <option key={p.professionalId} value={p.professionalId}>{proNameOf(pros, p.professionalId)}</option>)}</Select></Field>
              <Field label="Prazo"><Input type="date" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} /></Field>
              <Button variant="primary" icon={<Plus />} data-tour="primary-action" disabled={!f.title.trim() || !f.assigneeProId || !f.dueOn} onClick={() => { if (upd((p) => ({ ...p, tasks: [...p.tasks, { id: uid('k_'), title: f.title.trim(), assigneeProId: f.assigneeProId, dueOn: f.dueOn, done: false }] }), 'Tarefa criada')) setF({ ...f, title: '' }) }}>Adicionar</Button>
            </div>
          </fieldset>
        )}
      </div>
    </Section>
  )
}
