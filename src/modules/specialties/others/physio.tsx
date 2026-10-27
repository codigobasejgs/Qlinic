// Fisioterapia: avaliação funcional, metas SMART, plano de sessões, evolução, prescrição de exercícios e relatório imprimível.
import { useState } from 'react'
import { Activity, Plus, Printer, Trash2 } from 'lucide-react'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit, clinicalRepo } from '@/data/repositories'
import type { ExercisePlan } from '@/domain/modules'
import type { ClinicalRecord, Patient } from '@/domain/types'
import { Alert, Badge, Button, Checkbox, DemoPaper, Dialog, EmptyState, Field, Input, Progress, Section, Select, Tabs, TabPanel, Textarea, Timeline, useAction, useLookup } from '@/ui'
import { formatCivil, formatDateTime, nowISO, todayCivil } from '@/lib/dates'
import { uid } from '@/lib/util'
import type { PhysioAssessment, PhysioGoal } from './types'
import { NoAccess, ReadOnly, SpecShell, parseNum, proNameOf, useClinicalWriter } from './common'

const GOAL_TONE = { ativa: 'info', atingida: 'success', revisada: 'warning', cancelada: 'neutral' } as const

export function PhysioPage() {
  const t = useTenant()
  const [tab, setTab] = useState('avaliacao')
  return (
    <SpecShell title="Fisioterapia" module="fisioterapia" filter={(p) => p.kind === 'human'} subtitle="Avaliação funcional, metas, plano de sessões, evolução e exercícios prescritos pelo profissional.">
      {(patient) => (
        <>
          <Tabs value={tab} onChange={setTab} label="Seções da fisioterapia" tabs={[{ id: 'avaliacao', label: 'Avaliação' }, { id: 'metas', label: 'Metas' }, { id: 'sessoes', label: 'Sessões e evolução' }, { id: 'exercicios', label: 'Exercícios' }, { id: 'relatorio', label: 'Relatório' }]} />
          <TabPanel>
            {t.scope('clinical') === false ? <NoAccess /> : !patient ? <EmptyState title="Selecione um paciente" icon={<Activity aria-hidden="true" />} />
              : tab === 'avaliacao' ? <AssessTab patient={patient} />
              : tab === 'metas' ? <GoalsTab patient={patient} />
              : tab === 'sessoes' ? <SessionsTab patient={patient} />
              : tab === 'exercicios' ? <ExercisesTab patient={patient} />
              : <ReportTab patient={patient} />}
          </TabPanel>
        </>
      )}
    </SpecShell>
  )
}

function AssessTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const { pros } = useLookup()
  const { canWrite, proId } = useClinicalWriter()
  const list = useCollection(t.tenantId, 'physioAssessments').filter((a) => a.patientId === patient.id).sort((a, b) => b.date.localeCompare(a.date))
  const [open, setOpen] = useState(false)
  const blank = () => ({ date: todayCivil(), pain: 5, rom: [{ joint: '', movement: '', side: 'D' as const, degrees: '' }], strength: [{ muscle: '', side: 'D' as const, grade: 3 }], tests: [{ name: '', result: '' }], notes: '' })
  const [f, setF] = useState(blank)
  const [err, setErr] = useState<string | null>(null)
  const save = () => {
    const rom = f.rom.filter((r) => r.joint.trim())
    for (const r of rom) { const d = parseNum(r.degrees); if (d == null || Number.isNaN(d) || d < -30 || d > 200) return setErr(`ADM inválida em ${r.joint} (graus entre -30 e 200).`) }
    if (act(() => {
      const a: PhysioAssessment = { id: uid('pa_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, professionalId: proId!, date: f.date, pain: f.pain,
        rom: rom.map((r) => ({ ...r, degrees: parseNum(r.degrees) as number })), strength: f.strength.filter((s) => s.muscle.trim()), tests: f.tests.filter((x) => x.name.trim()), notes: f.notes }
      db.insert(t.tenantId, 'physioAssessments', a)
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'fisio.avaliacao', resource: 'physioAssessments', resourceId: a.id })
    }, 'Avaliação registrada')) { setOpen(false); setErr(null) }
  }
  const [cur, prev] = list
  return (
    <Section title="Avaliações funcionais" actions={canWrite ? <Button variant="primary" icon={<Plus />} onClick={() => { setF(blank()); setOpen(true) }} data-tour="primary-action">Nova avaliação</Button> : undefined}>
      <div className="stack">
        {!canWrite && <ReadOnly>Somente profissionais registram avaliações.</ReadOnly>}
        {!cur ? <p className="muted small">Nenhuma avaliação.</p> : (
          <>
            <div className="grid grid-4">
              <div className="kpi"><span className="kpi-label">Dor (0–10)</span><span className="kpi-value">{cur.pain}</span><span className="kpi-foot">{prev ? `Anterior: ${prev.pain} (${formatCivil(prev.date)})` : formatCivil(cur.date)}</span></div>
              <div className="kpi"><span className="kpi-label">Última avaliação</span><span className="kpi-value" style={{ fontSize: 18 }}>{formatCivil(cur.date)}</span><span className="kpi-foot">{proNameOf(pros, cur.professionalId)}</span></div>
            </div>
            <div className="grid grid-2">
              <div className="table-wrap"><table className="table">
                <caption>Amplitude de movimento (graus)</caption>
                <thead><tr><th scope="col">Articulação</th><th scope="col">Movimento</th><th scope="col">Lado</th><th scope="col" className="num">Atual</th><th scope="col" className="num">Anterior</th></tr></thead>
                <tbody>{cur.rom.map((r, i) => { const p = prev?.rom.find((x) => x.joint === r.joint && x.movement === r.movement && x.side === r.side); return <tr key={i}><td>{r.joint}</td><td>{r.movement}</td><td>{r.side}</td><td className="num">{r.degrees}°</td><td className="num">{p ? `${p.degrees}°` : '—'}</td></tr> })}</tbody>
              </table></div>
              <div className="table-wrap"><table className="table">
                <caption>Força muscular (0–5)</caption>
                <thead><tr><th scope="col">Músculo</th><th scope="col">Lado</th><th scope="col" className="num">Grau</th></tr></thead>
                <tbody>{cur.strength.map((s, i) => <tr key={i}><td>{s.muscle}</td><td>{s.side}</td><td className="num">{s.grade}/5</td></tr>)}</tbody>
              </table></div>
            </div>
            {cur.tests.length > 0 && <div><h3 className="small strong">Testes funcionais</h3><ul className="small" style={{ margin: 0, paddingLeft: 20 }}>{cur.tests.map((x, i) => <li key={i}>{x.name}: {x.result}</li>)}</ul></div>}
          </>
        )}
        {list.length > 1 && <details><summary>Avaliações anteriores ({list.length - 1})</summary><ul className="small" style={{ margin: 0, paddingLeft: 20 }}>{list.slice(1).map((a) => <li key={a.id}>{formatCivil(a.date)} — dor {a.pain}/10 · {a.notes}</li>)}</ul></details>}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Nova avaliação funcional" size="lg" footer={<><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar avaliação</Button></>}>
        <div className="stack">
          {err && <Alert tone="danger">{err}</Alert>}
          <div className="form-grid">
            <Field label="Data"><Input type="date" value={f.date} max={todayCivil()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label={`Escala de dor: ${f.pain}/10`}><input type="range" min={0} max={10} value={f.pain} onChange={(e) => setF({ ...f, pain: Number(e.target.value) })} aria-valuetext={`${f.pain} de 10`} /></Field>
          </div>
          <fieldset><legend>Amplitude de movimento</legend>
            {f.rom.map((r, i) => (
              <div key={i} className="form-grid" style={{ alignItems: 'end' }}>
                <Field label="Articulação"><Input value={r.joint} onChange={(e) => setF({ ...f, rom: f.rom.map((x, j) => j === i ? { ...x, joint: e.target.value } : x) })} /></Field>
                <Field label="Movimento"><Input value={r.movement} onChange={(e) => setF({ ...f, rom: f.rom.map((x, j) => j === i ? { ...x, movement: e.target.value } : x) })} /></Field>
                <Field label="Lado"><Select value={r.side} onChange={(e) => setF({ ...f, rom: f.rom.map((x, j) => j === i ? { ...x, side: e.target.value as 'D' } : x) })}><option value="D">Direito</option><option value="E">Esquerdo</option><option value="bilateral">Bilateral</option></Select></Field>
                <Field label="Graus"><Input inputMode="decimal" value={r.degrees} onChange={(e) => setF({ ...f, rom: f.rom.map((x, j) => j === i ? { ...x, degrees: e.target.value } : x) })} /></Field>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setF({ ...f, rom: [...f.rom, { joint: '', movement: '', side: 'D', degrees: '' }] })}>Adicionar articulação</Button>
          </fieldset>
          <fieldset><legend>Força muscular (0–5)</legend>
            {f.strength.map((s, i) => (
              <div key={i} className="form-grid" style={{ alignItems: 'end' }}>
                <Field label="Músculo/grupo"><Input value={s.muscle} onChange={(e) => setF({ ...f, strength: f.strength.map((x, j) => j === i ? { ...x, muscle: e.target.value } : x) })} /></Field>
                <Field label="Lado"><Select value={s.side} onChange={(e) => setF({ ...f, strength: f.strength.map((x, j) => j === i ? { ...x, side: e.target.value as 'D' } : x) })}><option value="D">Direito</option><option value="E">Esquerdo</option><option value="bilateral">Bilateral</option></Select></Field>
                <Field label="Grau"><Select value={s.grade} onChange={(e) => setF({ ...f, strength: f.strength.map((x, j) => j === i ? { ...x, grade: Number(e.target.value) } : x) })}>{[0, 1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{g}</option>)}</Select></Field>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setF({ ...f, strength: [...f.strength, { muscle: '', side: 'D', grade: 3 }] })}>Adicionar músculo</Button>
          </fieldset>
          <fieldset><legend>Testes funcionais</legend>
            {f.tests.map((x, i) => (
              <div key={i} className="form-grid">
                <Field label="Teste"><Input value={x.name} onChange={(e) => setF({ ...f, tests: f.tests.map((y, j) => j === i ? { ...y, name: e.target.value } : y) })} /></Field>
                <Field label="Resultado"><Input value={x.result} onChange={(e) => setF({ ...f, tests: f.tests.map((y, j) => j === i ? { ...y, result: e.target.value } : y) })} /></Field>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setF({ ...f, tests: [...f.tests, { name: '', result: '' }] })}>Adicionar teste</Button>
          </fieldset>
          <Field label="Observações"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} /></Field>
        </div>
      </Dialog>
    </Section>
  )
}

function GoalsTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const act = useAction()
  const { canWrite, proId } = useClinicalWriter()
  const goals = useCollection(t.tenantId, 'physioGoals').filter((g) => g.patientId === patient.id)
  const [f, setF] = useState({ specific: '', measure: '', target: '', dueOn: '' })
  const [err, setErr] = useState<string | null>(null)
  const add = () => {
    if (!f.specific.trim() || !f.measure.trim() || !f.target.trim() || !f.dueOn) return setErr('Preencha meta, medida, alvo e prazo (SMART).')
    if (act(() => db.insert(t.tenantId, 'physioGoals', { id: uid('pg_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, professionalId: proId!, ...f, status: 'ativa' }), 'Meta adicionada')) { setF({ specific: '', measure: '', target: '', dueOn: '' }); setErr(null) }
  }
  const today = todayCivil()
  return (
    <Section title="Metas (SMART simples)">
      <div className="stack">
        {goals.length === 0 && <p className="muted small">Nenhuma meta.</p>}
        {goals.map((g) => (
          <div key={g.id} className="list-card">
            <div className="row between"><strong>{g.specific}</strong><Badge tone={GOAL_TONE[g.status]}>{g.status === 'ativa' ? 'Ativa' : g.status === 'atingida' ? 'Atingida' : g.status === 'revisada' ? 'Revisada' : 'Cancelada'}</Badge></div>
            <span className="small">Medida: {g.measure} · Alvo: {g.target} · Prazo: {formatCivil(g.dueOn)} {g.status === 'ativa' && g.dueOn < today ? <Badge tone="warning">Prazo vencido</Badge> : null}</span>
            {canWrite && <Select aria-label={`Status da meta ${g.specific}`} value={g.status} style={{ maxWidth: 220 }} onChange={(e) => act(() => db.update(t.tenantId, 'physioGoals', g.id, { status: e.target.value as PhysioGoal['status'] }), 'Status da meta atualizado')}><option value="ativa">Ativa</option><option value="atingida">Atingida</option><option value="revisada">Revisada</option><option value="cancelada">Cancelada</option></Select>}
          </div>
        ))}
        {canWrite ? (
          <fieldset><legend>Nova meta</legend>
            {err && <Alert tone="danger">{err}</Alert>}
            <div className="form-grid">
              <Field label="Específica (o quê)"><Input value={f.specific} onChange={(e) => setF({ ...f, specific: e.target.value })} /></Field>
              <Field label="Mensurável (como medir)"><Input value={f.measure} onChange={(e) => setF({ ...f, measure: e.target.value })} /></Field>
              <Field label="Alvo"><Input value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field>
              <Field label="Prazo"><Input type="date" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} /></Field>
            </div>
            <div className="form-actions"><Button variant="primary" onClick={add} data-tour="primary-action">Adicionar meta</Button></div>
          </fieldset>
        ) : <ReadOnly>Somente profissionais definem metas.</ReadOnly>}
      </div>
    </Section>
  )
}

function SessionsTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const { pros, service } = useLookup()
  const { canWrite, proId } = useClinicalWriter()
  const plan = useCollection(t.tenantId, 'physioPlans').find((p) => p.patientId === patient.id)
  const appts = useCollection(t.tenantId, 'appointments').filter((a) => a.patientId === patient.id)
  const records = useCollection(t.tenantId, 'records').filter((r) => r.patientId === patient.id && r.specialty === 'fisioterapia').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const done = appts.filter((a) => a.status === 'concluida' && (!plan || a.start.slice(0, 10) >= plan.startOn))
  const upcoming = appts.filter((a) => ['confirmada', 'aguardando_confirmacao', 'solicitada'].includes(a.status) && new Date(a.start).getTime() > Date.now())
  const [planned, setPlanned] = useState(String(plan?.sessionsPlanned ?? 10))
  const [evo, setEvo] = useState({ dor: '', conduta: '', resposta: '' })
  const savePlan = () => {
    const n = Number(planned)
    if (!Number.isInteger(n) || n < 1 || n > 100) return act(() => { throw new Error('Sessões previstas entre 1 e 100.') })
    act(() => plan ? db.update(t.tenantId, 'physioPlans', plan.id, { sessionsPlanned: n }) : db.insert(t.tenantId, 'physioPlans', { id: uid('ppl_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, professionalId: proId!, sessionsPlanned: n, startOn: todayCivil(), notes: '' }), 'Plano de sessões salvo')
  }
  const saveEvo = () => act(() => {
    const dor = parseNum(evo.dor)
    if (dor == null || Number.isNaN(dor) || dor < 0 || dor > 10) throw new Error('Dor deve estar entre 0 e 10.')
    if (!evo.conduta.trim()) throw new Error('Informe a conduta.')
    const rec: ClinicalRecord = { id: uid('rec_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, professionalId: proId!, specialty: 'fisioterapia', templateId: 'fisio_evolucao', templateVersion: 1, title: 'Evolução fisioterapêutica', content: { dor, conduta: evo.conduta, resposta: evo.resposta }, status: 'rascunho', addenda: [], confidentiality: 'padrao', releasedToPortal: false, history: [{ at: nowISO(), from: null, to: 'rascunho', by: actor.name }] }
    clinicalRepo.save(t.tenantId, rec)
    clinicalRepo.finalize(t.tenantId, rec.id, actor.name)
    setEvo({ dor: '', conduta: '', resposta: '' })
  }, 'Evolução registrada e finalizada')
  const total = plan?.sessionsPlanned ?? 0
  return (
    <div className="grid grid-2">
      <Section title="Plano de sessões">
        <div className="stack">
          {plan ? <>
            <Progress value={done.length} max={total} label="Sessões realizadas" />
            <p><strong>{done.length}</strong> de {total} realizadas (agendamentos concluídos desde {formatCivil(plan.startOn)}) · {upcoming.length} agendada(s)</p>
          </> : <p className="muted small">Sem plano de sessões definido.</p>}
          {canWrite && <div className="row" style={{ alignItems: 'flex-end' }}><Field label="Sessões previstas"><Input inputMode="numeric" value={planned} onChange={(e) => setPlanned(e.target.value)} style={{ maxWidth: 120 }} /></Field><Button onClick={savePlan}>{plan ? 'Atualizar' : 'Criar plano'}</Button></div>}
          <details><summary>Sessões concluídas ({done.length})</summary><ul className="small" style={{ margin: 0, paddingLeft: 20 }}>{done.map((a) => <li key={a.id}>{formatDateTime(a.start)} — {service(a.serviceId)?.name} · {proNameOf(pros, a.professionalId)}</li>)}</ul></details>
        </div>
      </Section>
      <Section title="Evolução por sessão">
        <div className="stack">
          {canWrite && (
            <fieldset><legend>Nova evolução</legend>
              <div className="form-grid"><Field label="Dor hoje (0–10)"><Input inputMode="numeric" value={evo.dor} onChange={(e) => setEvo({ ...evo, dor: e.target.value })} /></Field></div>
              <Field label="Conduta"><Textarea value={evo.conduta} onChange={(e) => setEvo({ ...evo, conduta: e.target.value })} rows={2} /></Field>
              <Field label="Resposta do paciente"><Textarea value={evo.resposta} onChange={(e) => setEvo({ ...evo, resposta: e.target.value })} rows={2} /></Field>
              <div className="form-actions"><Button variant="primary" onClick={saveEvo} data-tour="primary-action">Registrar evolução</Button></div>
            </fieldset>
          )}
          <Timeline items={records.slice(0, 8).map((r) => ({ time: formatDateTime(r.createdAt), title: `Dor ${String(r.content.dor ?? '—')}/10 · ${proNameOf(pros, r.professionalId)}`, body: `${String(r.content.conduta ?? '')} ${r.content.resposta ? `— ${String(r.content.resposta)}` : ''}` }))} />
        </div>
      </Section>
    </div>
  )
}

function ExerciseIllustration({ label }: { label?: string }) {
  return (
    <figure className="ex-media">
      <svg viewBox="0 0 120 80" aria-hidden="true"><rect width="120" height="80" rx="8" fill="var(--q-surface-muted)" /><circle cx="40" cy="22" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M40 30 v20 l-12 18 M40 50 l12 18 M40 36 l-14 8 M40 36 l16 -4" stroke="currentColor" strokeWidth="2" fill="none" /><path d="M70 62 h40" stroke="currentColor" strokeWidth="2" opacity=".4" /></svg>
      <figcaption className="tiny muted">{label ?? 'Ilustração demonstrativa'} — placeholder, não é vídeo/foto real</figcaption>
    </figure>
  )
}

function ExercisesTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const { canWrite, proId } = useClinicalWriter()
  const plans = useCollection(t.tenantId, 'exercisePlans').filter((p) => p.patientId === patient.id)
  const plan = plans.find((p) => p.status === 'ativo') ?? plans[0]
  const [ex, setEx] = useState({ name: '', sets: '', reps: '', holdSec: '', frequency: '', instructions: '' })
  const [err, setErr] = useState<string | null>(null)
  const upd = (fn: (p: ExercisePlan) => ExercisePlan, msg: string) => plan && act(() => { db.update(t.tenantId, 'exercisePlans', plan.id, fn); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'fisio.exercicios', resource: 'exercisePlans', resourceId: plan.id, detail: msg }) }, msg)
  const addEx = () => {
    const n = (s: string) => { const v = parseNum(s); return v == null || Number.isNaN(v) || v <= 0 ? undefined : v }
    if (!ex.name.trim() || !ex.frequency.trim() || !ex.instructions.trim()) return setErr('Nome, frequência e instruções são obrigatórios.')
    if (!n(ex.reps) && !n(ex.holdSec)) return setErr('Informe repetições ou tempo (s).')
    setErr(null)
    if (upd((p) => ({ ...p, exercises: [...p.exercises, { id: uid('e_'), name: ex.name.trim(), sets: n(ex.sets), reps: n(ex.reps), holdSec: n(ex.holdSec), frequency: ex.frequency.trim(), instructions: ex.instructions.trim(), mediaLabel: `Ilustração demonstrativa — ${ex.name.trim()}` }] }), 'Exercício adicionado')) setEx({ name: '', sets: '', reps: '', holdSec: '', frequency: '', instructions: '' })
  }
  if (!plan) return <EmptyState title="Sem prescrição de exercícios" action={canWrite ? <Button variant="primary" onClick={() => act(() => db.insert(t.tenantId, 'exercisePlans', { id: uid('ex_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, professionalId: proId!, title: 'Programa de exercícios', exercises: [], releasedToPortal: false, adherence: [], status: 'ativo' }), 'Programa criado')}>Criar programa</Button> : undefined} />
  const byEx = (id: string) => plan.adherence.filter((a) => a.exerciseId === id)
  return (
    <div className="stack">
      <Section title={plan.title} actions={canWrite ? <Checkbox label="Liberado ao portal do paciente" checked={plan.releasedToPortal} onChange={(e) => upd((p) => ({ ...p, releasedToPortal: e.target.checked }), e.target.checked ? 'Programa liberado ao portal' : 'Programa recolhido do portal')} /> : <Badge tone={plan.releasedToPortal ? 'success' : 'neutral'}>{plan.releasedToPortal ? 'Liberado ao portal' : 'Não liberado'}</Badge>}>
        <div className="stack">
          <p className="small muted">Prescrição definida pelo profissional. Mídia demonstrativa = ilustração/placeholder rotulado.</p>
          <div className="grid grid-2">
            {plan.exercises.map((e) => {
              const ad = byEx(e.id)
              return (
                <div key={e.id} className="card tight row nowrap" style={{ alignItems: 'flex-start', '--gap': '12px' } as React.CSSProperties}>
                  <ExerciseIllustration label={e.mediaLabel} />
                  <div className="stack grow" style={{ '--gap': '4px' } as React.CSSProperties}>
                    <div className="row between"><strong>{e.name}</strong>{canWrite && <Button size="sm" variant="ghost" iconOnly icon={<Trash2 />} onClick={() => upd((p) => ({ ...p, exercises: p.exercises.filter((x) => x.id !== e.id) }), 'Exercício removido')}>Remover {e.name}</Button>}</div>
                    <span className="small">{[e.sets && `${e.sets} séries`, e.reps && `${e.reps} reps`, e.holdSec && `${e.holdSec} s`].filter(Boolean).join(' · ')} · {e.frequency}</span>
                    <span className="small muted">{e.instructions}</span>
                    <span className="small">Adesão declarada: {ad.length ? `${ad.filter((a) => a.done).length} feito(s) / ${ad.filter((a) => !a.done).length} não feito(s)` : 'sem declarações'}</span>
                  </div>
                </div>
              )
            })}
          </div>
          {canWrite && (
            <fieldset><legend>Adicionar exercício</legend>
              {err && <Alert tone="danger">{err}</Alert>}
              <div className="form-grid">
                <Field label="Exercício"><Input value={ex.name} onChange={(e) => setEx({ ...ex, name: e.target.value })} /></Field>
                <Field label="Séries"><Input inputMode="numeric" value={ex.sets} onChange={(e) => setEx({ ...ex, sets: e.target.value })} /></Field>
                <Field label="Repetições"><Input inputMode="numeric" value={ex.reps} onChange={(e) => setEx({ ...ex, reps: e.target.value })} /></Field>
                <Field label="Tempo (s)"><Input inputMode="numeric" value={ex.holdSec} onChange={(e) => setEx({ ...ex, holdSec: e.target.value })} /></Field>
                <Field label="Frequência"><Input value={ex.frequency} onChange={(e) => setEx({ ...ex, frequency: e.target.value })} placeholder="Ex.: 3x por semana" /></Field>
              </div>
              <Field label="Instruções"><Textarea value={ex.instructions} onChange={(e) => setEx({ ...ex, instructions: e.target.value })} rows={2} /></Field>
              <div className="form-actions"><Button variant="primary" icon={<Plus />} onClick={addEx} data-tour="primary-action">Adicionar</Button></div>
            </fieldset>
          )}
        </div>
      </Section>
      <Section title="Adesão declarada pelo paciente (portal)">
        <Alert tone="neutral">Informação DECLARADA pelo paciente no portal — não é verificação clínica.</Alert>
        {plan.adherence.length === 0 ? <p className="muted small">Sem declarações.</p> : (
          <div className="table-wrap" style={{ marginTop: 12 }}><table className="table">
            <caption className="sr-only">Adesão declarada</caption>
            <thead><tr><th scope="col">Data</th><th scope="col">Exercício</th><th scope="col">Declarado</th><th scope="col">Nota do paciente</th></tr></thead>
            <tbody>{[...plan.adherence].sort((a, b) => b.date.localeCompare(a.date)).map((a, i) => <tr key={i}><td>{formatCivil(a.date)}</td><td>{plan.exercises.find((e) => e.id === a.exerciseId)?.name ?? 'Programa'}</td><td>{a.done ? <Badge tone="success">Declarou feito</Badge> : <Badge tone="warning">Declarou não feito</Badge>}</td><td className="small">{a.note ?? '—'}</td></tr>)}</tbody>
          </table></div>
        )}
      </Section>
    </div>
  )
}

function ReportTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const { pros } = useLookup()
  const assess = useCollection(t.tenantId, 'physioAssessments').filter((a) => a.patientId === patient.id).sort((a, b) => a.date.localeCompare(b.date))
  const goals = useCollection(t.tenantId, 'physioGoals').filter((g) => g.patientId === patient.id)
  const plan = useCollection(t.tenantId, 'exercisePlans').find((p) => p.patientId === patient.id && p.status === 'ativo')
  const first = assess[0], last = assess.at(-1)
  return (
    <div className="stack">
      <div className="row end no-print"><Button variant="primary" icon={<Printer />} onClick={() => window.print()} data-tour="primary-action">Imprimir relatório</Button></div>
      <DemoPaper>
        <div className="stack" style={{ '--gap': '12px' } as React.CSSProperties}>
          <h2>Relatório fisioterapêutico (demonstrativo)</h2>
          <p><strong>{t.org.name}</strong> · Paciente: {patient.name} · Emitido em {formatCivil(todayCivil())}</p>
          {first && last ? <p>Evolução da dor: {first.pain}/10 ({formatCivil(first.date)}) → {last.pain}/10 ({formatCivil(last.date)}).</p> : <p>Sem avaliações registradas.</p>}
          {last && <p>ADM atual: {last.rom.map((r) => `${r.joint} ${r.movement} ${r.side}: ${r.degrees}°`).join('; ') || '—'}.</p>}
          <div><strong>Metas</strong><ul style={{ margin: 0 }}>{goals.map((g) => <li key={g.id}>{g.specific} — {g.measure}, alvo {g.target} até {formatCivil(g.dueOn)} ({g.status})</li>)}</ul></div>
          {plan && <div><strong>Programa de exercícios</strong><ul style={{ margin: 0 }}>{plan.exercises.map((e) => <li key={e.id}>{e.name}: {[e.sets && `${e.sets}x`, e.reps && `${e.reps} reps`, e.holdSec && `${e.holdSec}s`].filter(Boolean).join(' ')} — {e.frequency}</li>)}</ul></div>}
          <p className="small">Profissional: {proNameOf(pros, last?.professionalId ?? first?.professionalId)}. Documento de demonstração, sem validade clínica ou legal.</p>
        </div>
      </DemoPaper>
    </div>
  )
}
