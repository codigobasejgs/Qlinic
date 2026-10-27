// Psicologia: séries recorrentes, plano de acompanhamento, registros RESTRITOS, documentos liberados ao portal e controles do responsável legal.
import { useState } from 'react'
import { Brain, Lock, Plus, Repeat } from 'lucide-react'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit, clinicalRepo, documentRepo } from '@/data/repositories'
import { changeAppointmentStatus, createAppointment, validateAppointment } from '@/domain/appointments'
import { weeklyRecurrence } from '@/domain/scheduling'
import { canSeeRecord } from '@/domain/access'
import type { ClinicalRecord, ID, Patient, PatientLink } from '@/domain/types'
import { APPOINTMENT_STATUS_LABEL } from '@/domain/types'
import { Alert, Badge, Button, Checkbox, Dialog, EmptyState, Field, Input, Section, Select, Tabs, TabPanel, Textarea, useAction, useConfirm, useLookup } from '@/ui'
import { addDaysCivil, formatCivil, formatDateTime, hhmmToMinutes, nowISO, todayCivil, zonedParts, zonedToInstant, ageFromBirth } from '@/lib/dates'
import { groupBy, uid } from '@/lib/util'
import type { GuardianField, PsychPlan } from './types'
import { NoAccess, ReadOnly, SpecShell, proNameOf, useTz, useWriteUnit } from './common'

const FIELD_LABEL: Record<GuardianField, string> = { canSchedule: 'Agenda (ver e marcar sessões)', canSeeFinancial: 'Financeiro (cobranças e recibos)', canSeeClinical: 'Conteúdo de sessão e documentos clínicos' }

function useRestrictedWriter() {
  const t = useTenant()
  return { canWrite: t.can('clinical_restricted', 'create') && !!t.access.professionalId, proId: t.access.professionalId, canRead: t.scope('clinical_restricted') !== false }
}

export function PsychologyPage() {
  const t = useTenant()
  useCollection(t.tenantId, 'psychPlans') // dispara seed (inclui séries demo) mesmo abrindo direto na agenda
  const [tab, setTab] = useState('agenda')
  return (
    <SpecShell title="Psicologia" module="psicologia" filter={(p) => p.kind === 'human'}
      subtitle="Sessões recorrentes, plano de acompanhamento e registros com acesso especialmente restrito.">
      {(patient) => (
        <>
          <Alert tone="info" title="Sigilo">Registros de sessão são visíveis apenas ao profissional autor. Recepção e gestão veem somente que existe conteúdo restrito. O portal mostra apenas documentos explicitamente liberados.</Alert>
          <Tabs value={tab} onChange={setTab} label="Seções da psicologia" tabs={[{ id: 'agenda', label: 'Agenda recorrente' }, { id: 'plano', label: 'Plano de acompanhamento' }, { id: 'registros', label: 'Registros de sessão' }, { id: 'docs', label: 'Documentos e portal' }, { id: 'resp', label: 'Responsável legal' }]} />
          <TabPanel>
            {!patient ? <EmptyState title="Selecione um paciente" icon={<Brain aria-hidden="true" />} />
              : tab === 'agenda' ? <SeriesTab patient={patient} />
              : tab === 'plano' ? <PlanTab patient={patient} />
              : tab === 'registros' ? <RecordsTab patient={patient} />
              : tab === 'docs' ? <DocsTab patient={patient} />
              : <GuardianTab patient={patient} />}
          </TabPanel>
        </>
      )}
    </SpecShell>
  )
}

// ---------------- Séries recorrentes ----------------
function SeriesTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const tz = useTz()
  const act = useAction()
  const actor = useActor()
  const confirm = useConfirm()
  const unitId = useWriteUnit()
  const { pros, services, resources, service } = useLookup()
  const appts = useCollection(t.tenantId, 'appointments').filter((a) => a.patientId === patient.id && a.seriesId)
  const series = groupBy([...appts].sort((a, b) => a.start.localeCompare(b.start)), (a) => a.seriesId!)
  const canCreate = t.can('agenda', 'create')
  const [open, setOpen] = useState(false)
  const own = t.access.professionalId
  const [f, setF] = useState({ professionalId: own ?? pros[0]?.id ?? '', serviceId: services.find((s) => s.name.includes('individual'))?.id ?? services[0]?.id ?? '', start: addDaysCivil(todayCivil(tz), 1), time: '17:00', count: '8', every: '1' })
  const [result, setResult] = useState<string | null>(null)
  const create = () => {
    const svc = services.find((s) => s.id === f.serviceId)
    const count = Number(f.count), every = Number(f.every)
    if (!svc || !f.professionalId) return setResult('Selecione profissional e serviço.')
    if (!Number.isInteger(count) || count < 1 || count > 52) return setResult('Quantidade de sessões entre 1 e 52.')
    if (!Number.isInteger(every) || every < 1 || every > 4) return setResult('Intervalo entre 1 e 4 semanas.')
    const seriesId = uid('ser_')
    const created: string[] = [], skipped: string[] = []
    act(() => {
      for (const date of weeklyRecurrence(f.start, count, every)) {
        const startMin = hhmmToMinutes(f.time)
        const start = zonedToInstant(date, startMin, tz), end = zonedToInstant(date, startMin + svc.durationMin, tz)
        const cands = svc.resourceKinds.length ? resources.filter((r) => r.unitId === unitId && svc.resourceKinds.includes(r.kind) && r.active) : []
        const base = { unitId, patientId: patient.id, professionalId: f.professionalId, serviceId: svc.id, start, end, source: 'recepcao' as const, seriesId, status: 'confirmada' as const }
        const pick = svc.resourceKinds.length ? cands.find((r) => validateAppointment(t.tenantId, { ...base, resourceIds: [r.id] }).length === 0) : undefined
        const input = { ...base, resourceIds: pick ? [pick.id] : cands[0] ? [cands[0].id] : [] }
        const conflicts = validateAppointment(t.tenantId, input)
        if (conflicts.length) { skipped.push(`${formatCivil(date)}: ${conflicts[0].message}`); continue }
        createAppointment(t.tenantId, input, actor.name)
        created.push(date)
      }
      if (!created.length) throw new Error(`Nenhuma sessão criada. ${skipped.slice(0, 2).join(' ')}`)
    }, `Série criada: ${created.length} sessão(ões)`)
    setResult(created.length ? `${created.length} criada(s).${skipped.length ? ` ${skipped.length} não criada(s) por conflito: ${skipped.join(' · ')}` : ''}` : null)
    if (created.length && !skipped.length) setOpen(false)
  }
  const cancelFuture = async (sid: string) => {
    const r = await confirm({ title: 'Cancelar sessões futuras da série?', body: 'Sessões passadas permanecem no histórico.', requireReason: true, danger: true, confirmLabel: 'Cancelar futuras' })
    if (!r.ok || !r.reason) return
    act(() => {
      const nowMs = Date.now()
      for (const a of series[sid].filter((x) => new Date(x.start).getTime() > nowMs && ['solicitada', 'aguardando_confirmacao', 'confirmada'].includes(x.status))) {
        changeAppointmentStatus(t.tenantId, a.id, 'cancelada', actor.name, `Série: ${r.reason}`)
      }
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'serie.cancelada', resource: 'appointments', resourceId: sid, detail: r.reason })
    }, 'Sessões futuras canceladas')
  }
  return (
    <Section title="Séries de sessões" actions={canCreate ? <Button variant="primary" icon={<Repeat />} onClick={() => { setResult(null); setOpen(true) }} data-tour="primary-action">Nova série semanal</Button> : undefined}>
      <div className="stack">
        {!canCreate && <ReadOnly>Seu perfil não cria agendamentos.</ReadOnly>}
        {Object.keys(series).length === 0 ? <EmptyState title="Nenhuma série recorrente">Crie uma série semanal; cada sessão é validada contra conflitos de agenda.</EmptyState> : Object.entries(series).map(([sid, list]) => {
          const next = list.find((a) => new Date(a.start).getTime() > Date.now() && a.status !== 'cancelada')
          const p = zonedParts(list[0].start, tz)
          return (
            <div key={sid} className="list-card">
              <div className="row between"><strong>{service(list[0].serviceId)?.name} · {proNameOf(pros, list[0].professionalId)}</strong><Badge tone="brand">{list.length} sessões</Badge></div>
              <span className="small">Semanal · {['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][p.weekday]} às {String(p.hour).padStart(2, '0')}:{String(p.minute).padStart(2, '0')} · próxima: {next ? formatDateTime(next.start, tz) : '—'}</span>
              <details><summary>Ocorrências</summary>
                <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>{list.map((a) => <li key={a.id}>{formatDateTime(a.start, tz)} — {APPOINTMENT_STATUS_LABEL[a.status]}</li>)}</ul>
              </details>
              {canCreate && next && <div><Button size="sm" variant="ghost" onClick={() => cancelFuture(sid)}>Cancelar futuras</Button></div>}
            </div>
          )
        })}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Nova série semanal" footer={<><Button onClick={() => setOpen(false)}>Fechar</Button><Button variant="primary" onClick={create}>Criar série</Button></>}>
        <div className="stack">
          {result && <Alert tone={result.includes('não criada') || result.startsWith('Selecione') || result.includes('entre') ? 'warning' : 'success'}>{result}</Alert>}
          <div className="form-grid">
            <Field label="Profissional" required><Select value={f.professionalId} onChange={(e) => setF({ ...f, professionalId: e.target.value })}>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Serviço" required><Select value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Primeira sessão" required><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
            <Field label="Horário" required><Input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
            <Field label="Quantidade de sessões" required><Input inputMode="numeric" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></Field>
            <Field label="A cada (semanas)" required><Input inputMode="numeric" value={f.every} onChange={(e) => setF({ ...f, every: e.target.value })} /></Field>
          </div>
        </div>
      </Dialog>
    </Section>
  )
}

// ---------------- Plano de acompanhamento ----------------
function PlanTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const { pros } = useLookup()
  const { canWrite, canRead, proId } = useRestrictedWriter()
  const plans = useCollection(t.tenantId, 'psychPlans').filter((p) => p.patientId === patient.id)
  const visible = plans.filter((p) => canRead && (t.scope('clinical_restricted') === 'all' || p.professionalId === proId))
  const plan = visible[0]
  const [obj, setObj] = useState('')
  const [edit, setEdit] = useState<{ frequency: string; reviewOn: string; notes: string } | null>(null)
  if (!canRead) return <NoAccess>O plano de acompanhamento é restrito ao profissional responsável.</NoAccess>
  if (plans.length && !plan) return <Alert tone="neutral" title="Conteúdo restrito"><Lock size={14} aria-hidden="true" style={{ display: 'inline' }} /> Existe plano sob responsabilidade de {proNameOf(pros, plans[0].professionalId)}. Apenas o autor acessa.</Alert>
  const upd = (fn: (p: PsychPlan) => PsychPlan, msg: string) => plan && act(() => { db.update(t.tenantId, 'psychPlans', plan.id, (p) => fn({ ...p, history: [...p.history, { at: nowISO(), by: actor.name, text: msg }] })); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'psicologia.plano', resource: 'psychPlans', resourceId: plan.id }) }, msg)
  if (!plan) return <EmptyState title="Sem plano de acompanhamento" action={canWrite ? <Button variant="primary" icon={<Plus />} data-tour="primary-action" onClick={() => act(() => db.insert(t.tenantId, 'psychPlans', { id: uid('pp_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, professionalId: proId!, objectives: [], frequency: 'Semanal, 50 min', reviewOn: addDaysCivil(todayCivil(), 60), notes: '', history: [{ at: nowISO(), by: actor.name, text: 'Plano criado' }] }), 'Plano criado')}>Criar plano</Button> : undefined} />
  const today = todayCivil()
  return (
    <div className="grid grid-2">
      <Section title="Objetivos">
        <div className="stack">
          {plan.objectives.length === 0 && <p className="muted small">Nenhum objetivo registrado.</p>}
          {plan.objectives.map((o) => (
            <div key={o.id} className="row between list-card">
              <span className="grow">{o.text}</span>
              {canWrite ? <Select aria-label={`Status de ${o.text}`} value={o.status} style={{ width: 'auto' }} onChange={(e) => upd((p) => ({ ...p, objectives: p.objectives.map((x) => x.id === o.id ? { ...x, status: e.target.value as typeof o.status } : x) }), `Objetivo atualizado: ${e.target.value}`)}><option value="em_andamento">Em andamento</option><option value="atingido">Atingido</option><option value="revisto">Revisto</option></Select>
                : <Badge>{o.status}</Badge>}
            </div>
          ))}
          {canWrite && <div className="row" style={{ alignItems: 'flex-end' }}><Field label="Novo objetivo" className="grow"><Input value={obj} onChange={(e) => setObj(e.target.value)} /></Field><Button disabled={!obj.trim()} onClick={() => { if (upd((p) => ({ ...p, objectives: [...p.objectives, { id: uid('o_'), text: obj.trim(), status: 'em_andamento' }] }), 'Objetivo adicionado')) setObj('') }}>Adicionar</Button></div>}
        </div>
      </Section>
      <Section title="Frequência e revisão" actions={canWrite && !edit ? <Button size="sm" onClick={() => setEdit({ frequency: plan.frequency, reviewOn: plan.reviewOn, notes: plan.notes })}>Editar</Button> : undefined}>
        {edit ? (
          <div className="stack">
            <Field label="Frequência"><Input value={edit.frequency} onChange={(e) => setEdit({ ...edit, frequency: e.target.value })} /></Field>
            <Field label="Próxima revisão do plano"><Input type="date" value={edit.reviewOn} onChange={(e) => setEdit({ ...edit, reviewOn: e.target.value })} /></Field>
            <Field label="Observações"><Textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} rows={3} /></Field>
            <div className="row"><Button onClick={() => setEdit(null)}>Cancelar</Button><Button variant="primary" onClick={() => { if (upd((p) => ({ ...p, ...edit }), 'Frequência/revisão atualizadas')) setEdit(null) }}>Salvar</Button></div>
          </div>
        ) : (
          <div className="stack">
            <p><strong>Frequência:</strong> {plan.frequency}</p>
            <p><strong>Revisão:</strong> {formatCivil(plan.reviewOn)} {plan.reviewOn < today ? <Badge tone="warning">Revisão vencida</Badge> : null}</p>
            {plan.notes && <p className="small">{plan.notes}</p>}
            <details><summary>Histórico do plano</summary><ul className="small" style={{ margin: 0, paddingLeft: 20 }}>{[...plan.history].reverse().map((h, i) => <li key={i}>{formatDateTime(h.at)} — {h.by}: {h.text}</li>)}</ul></details>
          </div>
        )}
      </Section>
    </div>
  )
}

// ---------------- Registros restritos ----------------
function RecordsTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const { pros } = useLookup()
  const { canWrite, proId } = useRestrictedWriter()
  const records = useCollection(t.tenantId, 'records').filter((r) => r.patientId === patient.id && r.specialty === 'psicologia').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const [draft, setDraft] = useState<{ id?: ID; tema: string; evolucao: string } | null>(null)
  const [add, setAdd] = useState<{ id: ID; reason: string; text: string } | null>(null)
  const save = (finalize: boolean) => draft && act(() => {
    if (!draft.tema.trim() && !draft.evolucao.trim()) throw new Error('Registro vazio.')
    const id = draft.id ?? uid('rec_')
    const prev = records.find((r) => r.id === id)
    const rec: ClinicalRecord = prev ? { ...prev, content: { tema: draft.tema, evolucao: draft.evolucao } } : {
      id, tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, professionalId: proId!, specialty: 'psicologia', templateId: 'psico_sessao', templateVersion: 1, title: 'Registro de sessão',
      content: { tema: draft.tema, evolucao: draft.evolucao }, status: 'rascunho', addenda: [], confidentiality: 'restrito', releasedToPortal: false, history: [{ at: nowISO(), from: null, to: 'rascunho', by: actor.name }],
    }
    clinicalRepo.save(t.tenantId, rec)
    if (finalize) clinicalRepo.finalize(t.tenantId, id, actor.name)
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: finalize ? 'registro.finalizado' : 'registro.salvo', resource: 'records', resourceId: id, detail: 'Conteúdo restrito (não registrado na auditoria)' })
    setDraft(null)
  }, finalize ? 'Registro finalizado' : 'Rascunho salvo')
  return (
    <Section title="Registros de sessão (restritos)" actions={canWrite && !draft ? <Button variant="primary" icon={<Plus />} onClick={() => setDraft({ tema: '', evolucao: '' })} data-tour="primary-action">Novo registro</Button> : undefined}>
      <div className="stack">
        {!canWrite && <ReadOnly>Apenas o profissional autor registra e lê o conteúdo das sessões.</ReadOnly>}
        {draft && (
          <div className="card tight stack">
            <Badge tone="warning"><Lock size={12} aria-hidden="true" /> Confidencialidade: restrito ao autor</Badge>
            <Field label="Tema da sessão"><Textarea value={draft.tema} onChange={(e) => setDraft({ ...draft, tema: e.target.value })} rows={2} /></Field>
            <Field label="Evolução"><Textarea value={draft.evolucao} onChange={(e) => setDraft({ ...draft, evolucao: e.target.value })} rows={4} /></Field>
            <div className="row end"><Button onClick={() => setDraft(null)}>Descartar</Button><Button onClick={() => save(false)}>Salvar rascunho</Button><Button variant="primary" onClick={() => save(true)}>Finalizar</Button></div>
          </div>
        )}
        {records.length === 0 ? <p className="muted small">Nenhum registro.</p> : records.map((r) => {
          const can = canSeeRecord(t, r)
          return (
            <div key={r.id} className="list-card">
              <div className="row between"><strong>{r.title} — {formatDateTime(r.createdAt)}</strong><div className="row"><Badge tone={r.status === 'finalizado' ? 'success' : 'warning'}>{r.status === 'finalizado' ? 'Finalizado' : 'Rascunho'}</Badge><Badge tone="danger" plain><Lock size={12} aria-hidden="true" /> Restrito</Badge></div></div>
              <span className="small muted">Autor: {proNameOf(pros, r.professionalId)}</span>
              {can ? (
                <>
                  <p className="small"><strong>Tema:</strong> {String(r.content.tema ?? '')}</p>
                  <p className="small"><strong>Evolução:</strong> {String(r.content.evolucao ?? '')}</p>
                  {r.addenda.map((a) => <p key={a.id} className="small muted">Adendo {formatDateTime(a.at)} ({a.authorName}) — motivo: {a.reason}. {a.text}</p>)}
                  {canWrite && r.professionalId === proId && (r.status !== 'finalizado'
                    ? <div><Button size="sm" onClick={() => setDraft({ id: r.id, tema: String(r.content.tema ?? ''), evolucao: String(r.content.evolucao ?? '') })}>Editar rascunho</Button></div>
                    : <div><Button size="sm" variant="ghost" onClick={() => setAdd({ id: r.id, reason: '', text: '' })}>Adicionar adendo</Button></div>)}
                </>
              ) : <p className="small muted"><Lock size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} /> Conteúdo restrito ao profissional autor.</p>}
            </div>
          )
        })}
      </div>
      <Dialog open={!!add} onClose={() => setAdd(null)} title="Adendo ao registro finalizado" footer={<><Button onClick={() => setAdd(null)}>Cancelar</Button><Button variant="primary" onClick={() => add && act(() => { clinicalRepo.addAddendum(t.tenantId, add.id, { authorId: actor.id, authorName: actor.name, reason: add.reason, text: add.text }); setAdd(null) }, 'Adendo registrado')}>Salvar adendo</Button></>}>
        {add && <div className="stack"><Field label="Motivo" required><Input value={add.reason} onChange={(e) => setAdd({ ...add, reason: e.target.value })} /></Field><Field label="Texto" required><Textarea value={add.text} onChange={(e) => setAdd({ ...add, text: e.target.value })} rows={4} /></Field></div>}
      </Dialog>
    </Section>
  )
}

// ---------------- Documentos liberados ----------------
function DocsTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const { canWrite, proId } = useRestrictedWriter()
  const docs = useCollection(t.tenantId, 'documents').filter((d) => d.patientId === patient.id)
  const seeRestricted = (createdBy: ID) => createdBy === proId || t.scope('clinical_restricted') === 'all'
  const toggle = (id: ID, v: boolean) => act(() => {
    const d = docs.find((x) => x.id === id)!
    if (v && d.confidentiality === 'restrito') throw new Error('Documento restrito não pode ser liberado ao portal. Emita um documento administrativo (ex.: declaração de comparecimento).')
    documentRepo.save(t.tenantId, { ...d, releasedToPortal: v })
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: v ? 'documento.liberado' : 'documento.recolhido', resource: 'documents', resourceId: id })
  }, v ? 'Documento liberado ao portal' : 'Documento recolhido do portal')
  const issueDecl = () => act(() => documentRepo.save(t.tenantId, {
    id: uid('doc_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, kind: 'declaracao', title: `Declaração de comparecimento — ${formatCivil(todayCivil())}`,
    body: `Declaro, para os devidos fins, que ${patient.name} compareceu a atendimento nesta data. Documento demonstrativo sem conteúdo clínico.`, status: 'emitido', releasedToPortal: false, confidentiality: 'padrao',
    signature: { status: 'nao_requerida', provider: 'demonstracao', signers: [], trail: [{ at: nowISO(), event: 'Emitido (demonstração)' }] }, createdBy: proId!, demoWatermark: true,
  }), 'Declaração emitida (ainda não liberada)')
  return (
    <Section title="Documentos e liberação ao portal" actions={canWrite ? <Button icon={<Plus />} onClick={issueDecl}>Emitir declaração de comparecimento</Button> : undefined}>
      <div className="stack">
        <p className="small muted">Somente documentos com liberação explícita aparecem no portal. Documentos restritos nunca são liberados.</p>
        {docs.length === 0 ? <p className="muted small">Sem documentos.</p> : docs.map((d) => {
          const hidden = d.confidentiality === 'restrito' && !seeRestricted(d.createdBy)
          return (
            <div key={d.id} className="list-card">
              <div className="row between"><strong>{hidden ? 'Documento restrito' : d.title}</strong><div className="row">{d.confidentiality === 'restrito' && <Badge tone="danger" plain><Lock size={12} aria-hidden="true" /> Restrito</Badge>}{d.releasedToPortal ? <Badge tone="success">Liberado ao portal</Badge> : <Badge>Não liberado</Badge>}</div></div>
              <span className="small muted">{formatDateTime(d.createdAt)}</span>
              {canWrite && d.confidentiality !== 'restrito' && <Checkbox label="Liberar no portal do paciente/responsável" checked={d.releasedToPortal} onChange={(e) => toggle(d.id, e.target.checked)} />}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ---------------- Responsável legal (menores) ----------------
function GuardianTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const confirm = useConfirm()
  const links = useCollection(t.tenantId, 'links').filter((l) => l.patientId === patient.id && l.relation === 'responsavel_legal')
  const persons = useCollection(t.tenantId, 'persons')
  const decisions = useCollection(t.tenantId, 'guardianDecisions').filter((d) => d.patientId === patient.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const { canWrite } = useRestrictedWriter()
  const minor = patient.birthDate ? ageFromBirth(patient.birthDate, todayCivil()) < 18 : false
  const change = async (l: PatientLink, field: GuardianField, to: boolean) => {
    const r = await confirm({ title: `${to ? 'Permitir' : 'Retirar'}: ${FIELD_LABEL[field]}`, body: field === 'canSeeClinical' && to ? 'Compartilhar conteúdo de sessão com o responsável é exceção. Registre a fundamentação (ex.: risco, decisão compartilhada com o adolescente).' : 'A decisão fica registrada com autor, data e motivo.', requireReason: true, reasonLabel: 'Motivo da decisão', danger: field === 'canSeeClinical' && to })
    if (!r.ok || !r.reason) return
    act(() => {
      db.update(t.tenantId, 'links', l.id, { [field]: to } as Partial<PatientLink>)
      db.insert(t.tenantId, 'guardianDecisions', { id: uid('gd_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, linkId: l.id, field, from: l[field], to, reason: r.reason!, by: actor.name })
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'responsavel.permissao', resource: 'links', resourceId: l.id, detail: `${field}: ${l[field]} → ${to}` })
    }, 'Decisão registrada')
  }
  if (!links.length) return <EmptyState title={minor ? 'Menor sem responsável legal vinculado' : 'Sem responsável legal'}>{minor ? 'Vincule um responsável no cadastro do paciente.' : 'Paciente adulto: o próprio paciente controla o acesso ao portal.'}</EmptyState>
  return (
    <div className="grid grid-2">
      <Section title="O que o responsável pode ver no portal">
        <div className="stack">
          <Alert tone="info">Padrão para menores: agenda e financeiro liberados; conteúdo de sessão NÃO compartilhado. Toda alteração exige motivo.</Alert>
          {!canWrite && <ReadOnly>Somente o profissional responsável altera estas permissões.</ReadOnly>}
          {links.map((l) => (
            <fieldset key={l.id}><legend>{persons.find((p) => p.id === l.personId)?.name ?? 'Responsável'} — responsável legal</legend>
              {(['canSchedule', 'canSeeFinancial', 'canSeeClinical'] as const).map((f) => (
                <Checkbox key={f} label={FIELD_LABEL[f]} hint={f === 'canSeeClinical' ? 'Não compartilhado por padrão.' : undefined} checked={l[f]} disabled={!canWrite} onChange={(e) => change(l, f, e.target.checked)} />
              ))}
            </fieldset>
          ))}
        </div>
      </Section>
      <Section title="Registro de decisões">
        {decisions.length === 0 ? <p className="muted small">Nenhuma decisão registrada.</p> : (
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, '--gap': '8px' } as React.CSSProperties}>
            {decisions.map((d) => <li key={d.id} className="list-card"><strong className="small">{FIELD_LABEL[d.field]}: {d.from ? 'sim' : 'não'} → {d.to ? 'sim' : 'não'}</strong><span className="small">{d.reason}</span><span className="tiny muted">{d.by} · {formatDateTime(d.createdAt)}</span></li>)}
          </ul>
        )}
      </Section>
    </div>
  )
}
