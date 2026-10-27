// Veterinária: tutor → animais, ficha e peso, carteira de vacinação, internação, banho/tosa e calculadora de conversão.
import { useMemo, useState } from 'react'
import { BedDouble, Calculator, CheckCircle2, Clock, Copy, PawPrint, Plus, Scissors, Syringe, XCircle, AlertTriangle, Ban } from 'lucide-react'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit } from '@/data/repositories'
import type { VaccineRecord } from '@/domain/modules'
import type { ID, Patient } from '@/domain/types'
import { APPOINTMENT_STATUS_LABEL } from '@/domain/types'
import { Alert, Badge, Button, Checkbox, DescList, Dialog, EmptyState, Field, Input, Section, Select, Tabs, TabPanel, Textarea, Timeline, useAction, useConfirm, useLookup, SimBadge, type Tone } from '@/ui'
import { ageFromBirth, formatCivil, formatDateTime, formatTime, todayCivil, nowISO, zonedParts } from '@/lib/dates'
import { uid } from '@/lib/util'
import { calcVolume, CONC_UNITS, DOSE_UNITS, vaccinesFor, validateVaccine, taskState, TASK_LABEL, addPrescription, recordAdministration, suspendPrescription, discharge, type ConcUnit, type DoseUnit } from './lib'
import type { Hospitalization, HospTask, Prescription, TaskState } from './types'
import { NoAccess, ReadOnly, SpecShell, instantToLocal, localToInstant, parseNum, proNameOf, useClinicalWriter, useNow, useTz, useWriteUnit } from './common'

const TASK_TONE: Record<TaskState, Tone> = { agendado: 'info', administrado: 'success', atrasado: 'danger', nao_administrado: 'warning', suspenso: 'neutral' }
const TASK_ICON: Record<TaskState, typeof Clock> = { agendado: Clock, administrado: CheckCircle2, atrasado: AlertTriangle, nao_administrado: XCircle, suspenso: Ban }
export function TaskBadge({ s }: { s: TaskState }) {
  const I = TASK_ICON[s]
  return <Badge tone={TASK_TONE[s]} plain><I size={14} aria-hidden="true" />{TASK_LABEL[s]}</Badge>
}

const KIND_LABEL: Record<VaccineRecord['kind'], string> = { vacina: 'Vacina', vermifugo: 'Vermífugo', antiparasitario: 'Antiparasitário' }

export function VeterinaryPage() {
  const t = useTenant()
  const [tab, setTab] = useState('ficha')
  const clinical = t.scope('clinical') !== false
  const tabs = [
    { id: 'ficha', label: 'Tutor e animal' },
    { id: 'vacinas', label: 'Vacinas e vermífugos' },
    { id: 'internacao', label: 'Internação' },
    { id: 'banho', label: 'Banho e tosa' },
    { id: 'calc', label: 'Calculadora' },
  ]
  return (
    <SpecShell title="Veterinária" module="veterinaria" pickerLabel="Animal" filter={(p) => p.kind === 'animal'}
      subtitle="Tutor e animais, carteira por animal, internação demonstrativa, banho/tosa e conversão de dose prescrita.">
      {(animal, setAnimal) => (
        <>
          <Tabs tabs={tabs} value={tab} onChange={setTab} label="Seções da veterinária" />
          <TabPanel>
            {tab === 'banho' ? <GroomingTab /> : !clinical ? <NoAccess>Ficha clínica, vacinas, internação e calculadora são visíveis apenas para perfis clínicos. Banho e tosa está disponível para a recepção.</NoAccess>
              : tab === 'ficha' ? <AnimalTab animal={animal} onPick={setAnimal} />
              : tab === 'vacinas' ? <VaccinesTab animal={animal} />
              : tab === 'internacao' ? <HospitalTab animal={animal} />
              : <CalculatorTab animal={animal} />}
          </TabPanel>
        </>
      )}
    </SpecShell>
  )
}

function PickHint({ what = 'um animal' }: { what?: string }) {
  return <EmptyState title={`Selecione ${what}`} icon={<PawPrint aria-hidden="true" />}>Use o campo acima para buscar pelo nome. A ficha do paciente também abre esta tela já filtrada.</EmptyState>
}

// ---------------- Ficha: tutor → animais, peso ----------------
function AnimalTab({ animal, onPick }: { animal: Patient | null; onPick: (id: ID) => void }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const links = useCollection(t.tenantId, 'links')
  const persons = useCollection(t.tenantId, 'persons')
  const patients = useCollection(t.tenantId, 'patients')
  const [kg, setKg] = useState('')
  const [date, setDate] = useState(todayCivil())
  const [err, setErr] = useState<string | null>(null)
  if (!animal) return <PickHint />
  const animalLinks = links.filter((l) => l.patientId === animal.id)
  const tutorLink = animalLinks.find((l) => l.relation === 'tutor')
  const tutor = persons.find((p) => p.id === tutorLink?.personId)
  const siblings = tutor ? links.filter((l) => l.personId === tutor.id && l.relation === 'tutor').map((l) => patients.find((p) => p.id === l.patientId)).filter((p): p is Patient => !!p) : []
  const payers = animalLinks.filter((l) => l.relation === 'responsavel_financeiro').map((l) => persons.find((p) => p.id === l.personId)?.name)
  const weights = [...(animal.weights ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const canWeigh = t.can('pacientes', 'update')
  const addWeight = () => {
    const v = parseNum(kg)
    if (v == null || Number.isNaN(v) || v <= 0) return setErr('Informe o peso em kg (maior que zero).')
    if (!date || date > todayCivil()) return setErr('Data inválida (não pode ser futura).')
    setErr(null)
    if (act(() => {
      db.update(t.tenantId, 'patients', animal.id, (p) => ({ ...p, weights: [...(p.weights ?? []).filter((w) => w.date !== date), { date, kg: v }] }))
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'animal.pesagem', resource: 'patients', resourceId: animal.id, detail: `${v} kg em ${formatCivil(date)}` })
    }, `Pesagem registrada: ${v} kg`)) setKg('')
  }
  return (
    <div className="grid grid-2">
      <Section title={`Ficha de ${animal.name}`}>
        <div className="stack">
          <DescList items={[
            ['Espécie', animal.species], ['Raça', animal.breed], ['Sexo', animal.sex === 'F' ? 'Fêmea' : animal.sex === 'M' ? 'Macho' : 'Não informado'],
            ['Idade', animal.birthDate ? `${ageFromBirth(animal.birthDate, todayCivil())} ano(s)${animal.birthDateEstimated ? ' (data estimada)' : ''}` : '—'],
            ['Nascimento', animal.birthDate ? `${formatCivil(animal.birthDate)}${animal.birthDateEstimated ? ' — estimada' : ''}` : '—'],
            ['Pelagem', animal.coat], ['Microchip', animal.microchip ? <span className="mono">{animal.microchip}</span> : 'Não informado'],
            ['Peso atual', weights.length ? `${weights[weights.length - 1].kg} kg` : '—'],
          ]} />
          {(animal.allergies.length > 0 || animal.clinicalAlerts.length > 0) && <Alert tone="warning" title="Alertas clínicos">{[...animal.allergies, ...animal.clinicalAlerts].join(' · ')}</Alert>}
        </div>
      </Section>
      <Section title="Tutor e responsáveis">
        <div className="stack">
          {tutor ? <DescList items={[['Tutor', tutor.name], ['Contato', tutor.phone], ['Responsável financeiro', payers.length ? payers.join(', ') : 'O próprio tutor']]} /> : <p className="muted">Sem tutor vinculado.</p>}
          <p className="small muted">Tutor, responsável financeiro e acesso ao portal são vínculos separados.</p>
          {siblings.length > 1 && (
            <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}>
              <h3 className="small strong">Animais deste tutor</h3>
              <div className="row">{siblings.map((s) => <button key={s.id} type="button" className="chip" aria-pressed={s.id === animal.id} onClick={() => onPick(s.id)}><PawPrint size={14} aria-hidden="true" />{s.name} · {s.species}</button>)}</div>
            </div>
          )}
        </div>
      </Section>
      <Section title="Histórico de peso">
        <div className="stack">
          <WeightChart data={weights} />
          <table className="table">
            <caption className="sr-only">Pesagens de {animal.name}</caption>
            <thead><tr><th scope="col">Data</th><th scope="col" className="num">Peso (kg)</th></tr></thead>
            <tbody>{[...weights].reverse().map((w) => <tr key={w.date}><td>{formatCivil(w.date)}</td><td className="num">{w.kg.toLocaleString('pt-BR')}</td></tr>)}</tbody>
          </table>
          {canWeigh ? (
            <div className="form-grid" style={{ alignItems: 'end' }}>
              <Field label="Data da pesagem"><Input type="date" value={date} max={todayCivil()} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Peso (kg)" error={err}><Input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="Ex.: 12,4" /></Field>
              <Button variant="primary" icon={<Plus />} onClick={addWeight} data-tour="primary-action">Registrar pesagem</Button>
            </div>
          ) : <ReadOnly>Seu perfil não registra pesagens.</ReadOnly>}
        </div>
      </Section>
    </div>
  )
}

function WeightChart({ data }: { data: { date: string; kg: number }[] }) {
  if (data.length < 2) return <p className="small muted">Registre ao menos duas pesagens para ver o gráfico.</p>
  const W = 480, H = 160, pad = 32
  const ks = data.map((d) => d.kg)
  const min = Math.min(...ks), max = Math.max(...ks)
  const span = max - min || 1
  const x = (i: number) => pad + (i * (W - pad * 2)) / (data.length - 1)
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2)
  const pts = data.map((d, i) => `${x(i)},${y(d.kg)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gráfico de peso: de ${data[0].kg} kg em ${formatCivil(data[0].date)} a ${data[data.length - 1].kg} kg em ${formatCivil(data[data.length - 1].date)}`} className="spec-chart">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="currentColor" opacity=".2" />
      <polyline points={pts} fill="none" stroke="var(--q-primary)" strokeWidth="2.5" />
      {data.map((d, i) => (
        <g key={d.date}>
          <circle cx={x(i)} cy={y(d.kg)} r="4" fill="var(--q-primary)" />
          <text x={x(i)} y={y(d.kg) - 10} textAnchor="middle" fontSize="12" fill="currentColor">{d.kg}</text>
          <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="currentColor" opacity=".7">{formatCivil(d.date).slice(0, 5)}</text>
        </g>
      ))}
    </svg>
  )
}

// ---------------- Carteira de vacinação POR ANIMAL ----------------
function VaccinesTab({ animal }: { animal: Patient | null }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const { pros } = useLookup()
  const all = useCollection(t.tenantId, 'vaccines')
  const { canWrite, proId } = useClinicalWriter()
  const [open, setOpen] = useState(false)
  const blank = { kind: 'vacina' as VaccineRecord['kind'], product: '', manufacturer: '', lot: '', appliedOn: todayCivil(), nextDueOn: '', professionalId: proId ?? '', notes: '' }
  const [f, setF] = useState(blank)
  const [errs, setErrs] = useState<string[]>([])
  if (!animal) return <PickHint />
  const list = vaccinesFor(all, animal.id)
  const today = todayCivil()
  const save = () => {
    const rec: Partial<VaccineRecord> = { ...f, patientId: animal.id, nextDueOn: f.nextDueOn || undefined, manufacturer: f.manufacturer || undefined, notes: f.notes || undefined }
    const e = validateVaccine(rec)
    setErrs(e)
    if (e.length) return
    if (act(() => {
      const v: VaccineRecord = { ...(rec as VaccineRecord), id: uid('vax_'), tenantId: t.tenantId, createdAt: nowISO(), status: 'aplicada' }
      db.insert(t.tenantId, 'vaccines', v)
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'vacina.registrada', resource: 'vaccines', resourceId: v.id, detail: `${animal.name}: ${v.product} lote ${v.lot}` })
    }, `Registro adicionado à carteira de ${animal.name}`)) { setOpen(false); setF(blank) }
  }
  return (
    <Section title={`Carteira de ${animal.name}`} actions={canWrite ? <Button variant="primary" icon={<Syringe />} onClick={() => { setF(blank); setErrs([]); setOpen(true) }} data-tour="primary-action">Registrar aplicação</Button> : undefined}>
      <div className="stack">
        <Alert tone="info" title="Retorno definido pelo veterinário">Não existe reforço anual universal: a data de retorno é decidida caso a caso pelo profissional e digitada manualmente. O sistema não sugere datas.</Alert>
        {!canWrite && <ReadOnly>Somente profissionais registram aplicações.</ReadOnly>}
        {list.length === 0 ? <EmptyState title="Sem registros para este animal">Registros de outros animais do mesmo tutor não aparecem aqui.</EmptyState> : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Vacinas e vermífugos de {animal.name}</caption>
              <thead><tr><th scope="col">Aplicação</th><th scope="col">Tipo</th><th scope="col">Produto / fabricante</th><th scope="col">Lote</th><th scope="col">Profissional</th><th scope="col">Retorno</th></tr></thead>
              <tbody>{list.map((v) => (
                <tr key={v.id}>
                  <td>{formatCivil(v.appliedOn)}</td>
                  <td><Badge>{KIND_LABEL[v.kind]}</Badge>{v.status === 'cancelada' && <> <Badge tone="danger">Cancelado</Badge></>}</td>
                  <td><div className="strong">{v.product}</div><div className="small muted">{v.manufacturer ?? '—'}</div>{v.notes && <div className="small muted">{v.notes}</div>}</td>
                  <td className="mono">{v.lot}</td>
                  <td>{proNameOf(pros, v.professionalId)}</td>
                  <td>{v.nextDueOn ? <>{formatCivil(v.nextDueOn)} {v.nextDueOn < today ? <Badge tone="warning">Vencido</Badge> : null}</> : <span className="muted small">Não definido</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Registrar aplicação — ${animal.name}`} size="lg" footer={<><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar na carteira</Button></>}>
        <div className="stack">
          {errs.length > 0 && <Alert tone="danger" title="Corrija os campos">{errs.join(' ')}</Alert>}
          <div className="form-grid">
            <Field label="Tipo" required><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as VaccineRecord['kind'] })}><option value="vacina">Vacina</option><option value="vermifugo">Vermífugo</option><option value="antiparasitario">Antiparasitário</option></Select></Field>
            <Field label="Produto" required><Input value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} /></Field>
            <Field label="Fabricante"><Input value={f.manufacturer} onChange={(e) => setF({ ...f, manufacturer: e.target.value })} /></Field>
            <Field label="Lote" required><Input value={f.lot} onChange={(e) => setF({ ...f, lot: e.target.value })} /></Field>
            <Field label="Profissional" required><Select value={f.professionalId} onChange={(e) => setF({ ...f, professionalId: e.target.value })}><option value="">Selecione</option>{pros.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Data de aplicação" required><Input type="date" value={f.appliedOn} max={todayCivil()} onChange={(e) => setF({ ...f, appliedOn: e.target.value })} /></Field>
            <Field label="Data de retorno (definida pelo veterinário)" hint="Opcional e manual. Sem sugestão automática."><Input type="date" value={f.nextDueOn} onChange={(e) => setF({ ...f, nextDueOn: e.target.value })} /></Field>
          </div>
          <Field label="Observações"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} /></Field>
        </div>
      </Dialog>
    </Section>
  )
}

// ---------------- Internação ----------------
function HospitalTab({ animal }: { animal: Patient | null }) {
  const t = useTenant()
  const tz = useTz()
  const now = useNow()
  const act = useAction()
  const actor = useActor()
  const unitId = useWriteUnit()
  const { patient, pros } = useLookup()
  const resources = useCollection(t.tenantId, 'resources')
  const hosps = useCollection(t.tenantId, 'hospitalizations')
  const links = useCollection(t.tenantId, 'links')
  const persons = useCollection(t.tenantId, 'persons')
  const { canWrite, proId } = useClinicalWriter()
  const canAdminister = canWrite || (t.effectiveUser?.memberships.some((m) => m.role === 'assistant') ?? false)
  const boxes = resources.filter((r) => r.kind === 'box' && r.active && (!t.unitId || r.unitId === t.unitId))
  const active = hosps.filter((h) => h.status === 'internado')
  const [sel, setSel] = useState<ID | null>(() => active.find((h) => h.patientId === animal?.id)?.id ?? active[0]?.id ?? null)
  const [admitBox, setAdmitBox] = useState<ID | null>(null)
  const h = hosps.find((x) => x.id === sel) ?? null

  const save = (fn: (prev: Hospitalization) => Hospitalization, msg: string, action: string) => act(() => {
    if (!h) throw new Error('Selecione uma internação.')
    db.update(t.tenantId, 'hospitalizations', h.id, fn)
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action, resource: 'hospitalizations', resourceId: h.id })
  }, msg)

  return (
    <div className="stack">
      <Alert tone="neutral" title="Internação demonstrativa">Prescrições são digitadas pelo profissional; o sistema não sugere medicamento, dose ou via. Horários das tarefas derivam apenas da frequência informada.</Alert>
      <Section title="Mapa de boxes">
        {boxes.length === 0 ? <EmptyState title="Nenhum box cadastrado">Cadastre recursos do tipo “box” em Configurações.</EmptyState> : (
          <ul className="box-map" aria-label="Boxes de internação">
            {boxes.map((b) => {
              const occ = active.find((x) => x.boxId === b.id)
              const late = occ ? occ.tasks.filter((k) => taskState(k, now) === 'atrasado').length : 0
              return (
                <li key={b.id}>
                  <button type="button" className={`box-cell${occ ? ' occupied' : ''}`} aria-pressed={!!occ && occ.id === sel}
                    onClick={() => occ ? setSel(occ.id) : canWrite ? setAdmitBox(b.id) : undefined} disabled={!occ && !canWrite}>
                    <span className="row between nowrap"><strong>{b.name}</strong><BedDouble size={18} aria-hidden="true" /></span>
                    {occ ? <><span>{patient(occ.patientId)?.name ?? '—'}</span><span className="small muted">Desde {formatDateTime(occ.admittedAt, tz)}</span>{late > 0 ? <Badge tone="danger">{late} atrasada(s)</Badge> : <Badge tone="success">Em dia</Badge>}</>
                      : <><span className="muted">Livre</span>{canWrite && <span className="small">Admitir animal</span>}</>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
      {h ? <HospDetail h={h} now={now} tz={tz} canWrite={canWrite} canAdminister={canAdminister} proId={proId} save={save} pros={pros} animalName={patient(h.patientId)?.name ?? '—'} tutorName={persons.find((p) => p.id === h.tutorPersonId)?.name} boxName={resources.find((r) => r.id === h.boxId)?.name ?? ''} />
        : <EmptyState title="Nenhuma internação selecionada">Selecione um box ocupado no mapa.</EmptyState>}
      <Section title="Altas recentes">
        {hosps.filter((x) => x.status === 'alta').length === 0 ? <p className="muted small">Sem altas registradas.</p> : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, '--gap': '8px' } as React.CSSProperties}>
            {hosps.filter((x) => x.status === 'alta').map((x) => <li key={x.id} className="list-card"><strong>{patient(x.patientId)?.name} — alta em {formatDateTime(x.discharge!.at, tz)}</strong><span className="small">{x.discharge!.summary}</span><span className="small muted">Por {x.discharge!.by}</span></li>)}
          </ul>
        )}
      </Section>
      {admitBox && <AdmitDialog boxId={admitBox} boxName={resources.find((r) => r.id === admitBox)?.name ?? ''} defaultAnimal={animal?.id ?? null} onClose={() => setAdmitBox(null)}
        onAdmit={(input) => {
          const tutorLink = links.find((l) => l.patientId === input.patientId && l.relation === 'tutor')
          const id = uid('hosp_')
          const ok = act(() => {
            if (active.some((x) => x.patientId === input.patientId)) throw new Error('Este animal já está internado.')
            if (active.some((x) => x.boxId === admitBox)) throw new Error('Box ocupado.')
            db.insert(t.tenantId, 'hospitalizations', {
              id, tenantId: t.tenantId, createdAt: nowISO(), unitId, patientId: input.patientId, boxId: admitBox, reason: input.reason, professionalId: input.professionalId,
              tutorPersonId: tutorLink?.personId, admittedAt: nowISO(), admittedBy: actor.name, status: 'internado', evolutions: [], prescriptions: [], tasks: [],
            })
            audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'internacao.admissao', resource: 'hospitalizations', resourceId: id })
          }, 'Admissão registrada')
          if (ok) { setSel(id); setAdmitBox(null) }
        }} />}
    </div>
  )
}

function AdmitDialog({ boxId, boxName, defaultAnimal, onClose, onAdmit }: { boxId: ID; boxName: string; defaultAnimal: ID | null; onClose: () => void; onAdmit: (i: { patientId: ID; reason: string; professionalId: ID }) => void }) {
  const { patients, pros } = useLookup()
  const { proId } = useClinicalWriter()
  const [pid, setPid] = useState<ID>(defaultAnimal ?? '')
  const [reason, setReason] = useState('')
  const [pro, setPro] = useState<ID>(proId ?? '')
  const [err, setErr] = useState<string | null>(null)
  void boxId
  return (
    <Dialog open onClose={onClose} title={`Admissão — ${boxName}`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => { if (!pid || !reason.trim() || !pro) return setErr('Animal, motivo e responsável são obrigatórios.'); onAdmit({ patientId: pid, reason: reason.trim(), professionalId: pro }) }}>Admitir</Button></>}>
      <div className="stack">
        {err && <Alert tone="danger">{err}</Alert>}
        <Field label="Animal" required><Select value={pid} onChange={(e) => setPid(e.target.value)}><option value="">Selecione</option>{patients.filter((p) => p.kind === 'animal' && p.status === 'ativo').map((p) => <option key={p.id} value={p.id}>{p.name} · {p.species}</option>)}</Select></Field>
        <Field label="Motivo da internação" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} /></Field>
        <Field label="Profissional responsável" required><Select value={pro} onChange={(e) => setPro(e.target.value)}><option value="">Selecione</option>{pros.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      </div>
    </Dialog>
  )
}

function HospDetail({ h, now, tz, canWrite, canAdminister, proId, save, pros, animalName, tutorName, boxName }: {
  h: Hospitalization; now: Date; tz: string; canWrite: boolean; canAdminister: boolean; proId?: ID
  save: (fn: (p: Hospitalization) => Hospitalization, msg: string, action: string) => boolean; pros: { id: ID; name: string }[]; animalName: string; tutorName?: string; boxName: string
}) {
  const actor = useActor()
  const confirm = useConfirm()
  const [evo, setEvo] = useState('')
  const [rxOpen, setRxOpen] = useState(false)
  const [adm, setAdm] = useState<HospTask | null>(null)
  const [dis, setDis] = useState(false)
  const [summary, setSummary] = useState('')
  const [filter, setFilter] = useState<TaskState | 'todas'>('todas')
  const tasks = useMemo(() => [...h.tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt)), [h.tasks])
  const counts = tasks.reduce<Record<string, number>>((acc, k) => { const s = taskState(k, now); acc[s] = (acc[s] ?? 0) + 1; return acc }, {})
  const visible = tasks.filter((k) => filter === 'todas' || taskState(k, now) === filter)
  const rxOf = (id: ID) => h.prescriptions.find((p) => p.id === id)
  return (
    <Section title={`${animalName} — ${boxName}`} actions={canWrite && h.status === 'internado' ? <Button variant="danger" onClick={() => { setSummary(''); setDis(true) }}>Registrar alta</Button> : undefined}>
      <div className="stack">
        <DescList items={[['Motivo', h.reason], ['Responsável', proNameOf(pros, h.professionalId)], ['Tutor', tutorName ?? '—'], ['Admissão', `${formatDateTime(h.admittedAt, tz)} por ${h.admittedBy}`]]} />
        <div className="grid grid-2">
          <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
            <div className="row between"><h3>Prescrições</h3>{canWrite && <Button size="sm" icon={<Plus />} onClick={() => setRxOpen(true)} data-tour="primary-action">Nova prescrição</Button>}</div>
            {h.prescriptions.length === 0 ? <p className="muted small">Nenhuma prescrição registrada.</p> : h.prescriptions.map((p) => (
              <div key={p.id} className="list-card">
                <div className="row between"><strong>{p.medication}</strong>{p.active ? <Badge tone="success">Ativa</Badge> : <Badge>Encerrada</Badge>}</div>
                <span className="small">Dose: {p.dose} · Via: {p.route} · a cada {p.everyHours} h por {p.durationHours} h</span>
                <span className="small muted">Prescrito por {p.prescribedBy} em {formatDateTime(p.prescribedAt, tz)}{p.suspendReason ? ` · encerrada: ${p.suspendReason}` : ''}</span>
                {canWrite && p.active && <div><Button size="sm" variant="ghost" onClick={async () => { const r = await confirm({ title: `Suspender ${p.medication}?`, body: 'Tarefas futuras agendadas desta prescrição serão encerradas. Registros já feitos são mantidos.', requireReason: true, reasonLabel: 'Motivo da suspensão', danger: true, confirmLabel: 'Suspender' }); if (r.ok && r.reason) save((prev) => suspendPrescription(prev, p.id, r.reason!, nowISO()), 'Prescrição suspensa; tarefas futuras encerradas', 'internacao.prescricao_suspensa') }}>Suspender</Button></div>}
              </div>
            ))}
          </div>
          <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
            <h3>Evolução</h3>
            <Timeline items={[...h.evolutions].reverse().map((e) => ({ time: formatDateTime(e.at, tz), title: e.by, body: e.text }))} />
            {canWrite && h.status === 'internado' && (
              <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
                <Field label="Nova evolução"><Textarea value={evo} onChange={(e) => setEvo(e.target.value)} rows={2} /></Field>
                <div><Button size="sm" disabled={!evo.trim()} onClick={() => { if (save((prev) => ({ ...prev, evolutions: [...prev.evolutions, { id: uid('ev_'), at: nowISO(), by: actor.name, text: evo.trim() }] }), 'Evolução registrada', 'internacao.evolucao')) setEvo('') }}>Registrar evolução</Button></div>
              </div>
            )}
          </div>
        </div>
        <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <div className="row between">
            <h3>Tarefas por horário</h3>
            <div className="row" role="group" aria-label="Filtrar tarefas">
              {(['todas', 'atrasado', 'agendado', 'administrado', 'nao_administrado', 'suspenso'] as const).map((s) => (
                <button key={s} type="button" className="chip" aria-pressed={filter === s} onClick={() => setFilter(s)}>{s === 'todas' ? 'Todas' : TASK_LABEL[s]} ({s === 'todas' ? tasks.length : counts[s] ?? 0})</button>
              ))}
            </div>
          </div>
          <div className="legend" aria-hidden="true">{(['agendado', 'atrasado', 'administrado', 'nao_administrado'] as const).map((s) => <TaskBadge key={s} s={s} />)}</div>
          {visible.length === 0 ? <p className="muted small">Nenhuma tarefa neste filtro.</p> : (
            <ul className="task-list" aria-live="polite">
              {visible.map((k) => {
                const s = taskState(k, now)
                const rx = rxOf(k.prescriptionId)
                return (
                  <li key={k.id} className={`task-row st-${s}`}>
                    <span className="task-time num">{formatTime(k.dueAt, tz)}<span className="tiny muted">{formatDateTime(k.dueAt, tz).slice(0, 5)}</span></span>
                    <span className="grow"><strong>{rx?.medication}</strong> <span className="small">{rx?.dose} · {rx?.route}</span>
                      {k.doneAt && <span className="small muted" style={{ display: 'block' }}>{s === 'administrado' ? 'Administrado' : 'Registrado'} por {k.by} às {formatTime(k.doneAt, tz)}{k.reason ? ` — motivo: ${k.reason}` : ''}{k.note ? ` — ${k.note}` : ''}</span>}
                      {s === 'suspenso' && k.reason && <span className="small muted" style={{ display: 'block' }}>Motivo: {k.reason}</span>}
                    </span>
                    <TaskBadge s={s} />
                    {canAdminister && (s === 'agendado' || s === 'atrasado') && h.status === 'internado' && <Button size="sm" onClick={() => setAdm(k)}>Registrar</Button>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
      {rxOpen && <RxDialog tz={tz} onClose={() => setRxOpen(false)} onSave={(p) => { if (save((prev) => addPrescription(prev, { ...p, id: uid('rx_'), professionalId: proId ?? h.professionalId, prescribedBy: actor.name, prescribedAt: nowISO(), active: true }, () => uid('tk_')), 'Prescrição registrada e tarefas geradas', 'internacao.prescricao')) setRxOpen(false) }} />}
      {adm && <AdminDialog task={adm} tz={tz} rx={rxOf(adm.prescriptionId)} onClose={() => setAdm(null)} onSave={(r) => { if (save((prev) => recordAdministration(prev, adm.id, r), r.given ? 'Administração registrada' : 'Não administração registrada', 'internacao.administracao')) setAdm(null) }} />}
      <Dialog open={dis} onClose={() => setDis(false)} title={`Alta de ${animalName}`} footer={<><Button onClick={() => setDis(false)}>Cancelar</Button><Button variant="danger" disabled={!summary.trim()} onClick={() => { if (save((prev) => discharge(prev, summary, actor.name, nowISO()), 'Alta registrada; box liberado', 'internacao.alta')) setDis(false) }}>Confirmar alta</Button></>}>
        <div className="stack">
          <p className="small muted">Prescrições ativas e tarefas futuras serão encerradas com o motivo “Alta”. Tarefas pendentes atrasadas continuam visíveis no histórico.</p>
          <Field label="Sumário de alta" required><Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={5} /></Field>
        </div>
      </Dialog>
    </Section>
  )
}

function RxDialog({ tz, onClose, onSave }: { tz: string; onClose: () => void; onSave: (p: Omit<Prescription, 'id' | 'professionalId' | 'prescribedBy' | 'prescribedAt' | 'active'>) => void }) {
  const [f, setF] = useState({ medication: '', dose: '', route: '', everyHours: '', durationHours: '24', firstAt: instantToLocal(new Date(), tz), notes: '' })
  const [err, setErr] = useState<string | null>(null)
  const submit = () => {
    const every = parseNum(f.everyHours), dur = parseNum(f.durationHours)
    if (!f.medication.trim() || !f.dose.trim() || !f.route.trim()) return setErr('Medicamento, dose e via são obrigatórios.')
    if (every == null || Number.isNaN(every) || every <= 0) return setErr('Informe a frequência (a cada N horas, maior que zero).')
    if (dur == null || Number.isNaN(dur) || dur <= 0) return setErr('Informe a duração em horas.')
    try { onSave({ medication: f.medication.trim(), dose: f.dose.trim(), route: f.route.trim(), everyHours: every, durationHours: dur, firstAt: localToInstant(f.firstAt, tz), notes: f.notes || undefined }) } catch (e) { setErr((e as Error).message) }
  }
  return (
    <Dialog open onClose={onClose} title="Nova prescrição (registrada pelo profissional)" size="lg" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Registrar e gerar tarefas</Button></>}>
      <div className="stack">
        <Alert tone="info">Todos os campos são digitados pelo profissional. Não há lista nem sugestão de medicamento, dose ou via.</Alert>
        {err && <Alert tone="danger">{err}</Alert>}
        <div className="form-grid">
          <Field label="Medicamento" required><Input value={f.medication} onChange={(e) => setF({ ...f, medication: e.target.value })} autoComplete="off" /></Field>
          <Field label="Dose (com unidade)" required hint="Ex.: texto livre conforme prescrição"><Input value={f.dose} onChange={(e) => setF({ ...f, dose: e.target.value })} autoComplete="off" /></Field>
          <Field label="Via" required><Input value={f.route} onChange={(e) => setF({ ...f, route: e.target.value })} autoComplete="off" /></Field>
          <Field label="Frequência — a cada (horas)" required><Input inputMode="decimal" value={f.everyHours} onChange={(e) => setF({ ...f, everyHours: e.target.value })} /></Field>
          <Field label="Duração (horas)" required><Input inputMode="decimal" value={f.durationHours} onChange={(e) => setF({ ...f, durationHours: e.target.value })} /></Field>
          <Field label="Primeira administração" required><Input type="datetime-local" value={f.firstAt} onChange={(e) => setF({ ...f, firstAt: e.target.value })} /></Field>
        </div>
        <Field label="Observações"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} /></Field>
      </div>
    </Dialog>
  )
}

function AdminDialog({ task, rx, tz, onClose, onSave }: { task: HospTask; rx?: Prescription; tz: string; onClose: () => void; onSave: (r: Parameters<typeof recordAdministration>[2]) => void }) {
  const actor = useActor()
  const [given, setGiven] = useState(true)
  const [by, setBy] = useState(actor.name)
  const [at, setAt] = useState(instantToLocal(new Date(), tz))
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const submit = () => {
    try {
      const atI = localToInstant(at, tz)
      if (!by.trim()) return setErr('Informe quem administrou.')
      if (!given && !reason.trim()) return setErr('Informe o motivo da não administração.')
      onSave(given ? { given: true, by: by.trim(), at: atI, note: note || undefined } : { given: false, by: by.trim(), at: atI, reason: reason.trim(), note: note || undefined })
    } catch (e) { setErr((e as Error).message) }
  }
  return (
    <Dialog open onClose={onClose} title="Registrar administração" description={`${rx?.medication ?? ''} · ${rx?.dose ?? ''} · ${rx?.route ?? ''} — agendado para ${formatDateTime(task.dueAt, tz)}`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Salvar registro</Button></>}>
      <div className="stack">
        {err && <Alert tone="danger">{err}</Alert>}
        <div className="segmented" role="group" aria-label="Resultado">
          <button type="button" aria-pressed={given} onClick={() => setGiven(true)}>Administrado</button>
          <button type="button" aria-pressed={!given} onClick={() => setGiven(false)}>Não administrado</button>
        </div>
        <div className="form-grid">
          <Field label="Quem administrou / registrou" required><Input value={by} onChange={(e) => setBy(e.target.value)} /></Field>
          <Field label="Quando" required><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        </div>
        {!given && <Field label="Motivo da não administração" required><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
        <Field label="Observação"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>
      </div>
    </Dialog>
  )
}

// ---------------- Banho e tosa ----------------
function GroomingTab() {
  const t = useTenant()
  const tz = useTz()
  const act = useAction()
  const actor = useActor()
  const { patient, service, pros } = useLookup()
  const services = useCollection(t.tenantId, 'services').filter((s) => s.category === 'Estética animal')
  const appts = useCollection(t.tenantId, 'appointments')
  const notes = useCollection(t.tenantId, 'groomingNotes')
  const links = useCollection(t.tenantId, 'links')
  const persons = useCollection(t.tenantId, 'persons')
  const today = todayCivil(tz)
  const canEdit = t.can('agenda', 'update') || t.can('recepcao', 'update')
  const svcIds = new Set(services.map((s) => s.id))
  const list = appts.filter((a) => svcIds.has(a.serviceId) && zonedParts(a.start, tz).date === today && (!t.unitId || a.unitId === t.unitId) && a.status !== 'cancelada').sort((a, b) => a.start.localeCompare(b.start))
  const upsert = (appointmentId: ID, fn: (n: import('./types').GroomingNote) => import('./types').GroomingNote, msg: string) => act(() => {
    const ex = notes.find((n) => n.appointmentId === appointmentId)
    if (ex) db.update(t.tenantId, 'groomingNotes', ex.id, fn)
    else db.insert(t.tenantId, 'groomingNotes', fn({ id: uid('gn_'), tenantId: t.tenantId, createdAt: nowISO(), appointmentId, notes: '', authorization: [] }))
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'banho_tosa.atualizado', resource: 'groomingNotes', resourceId: appointmentId, detail: msg })
  }, msg)
  return (
    <div className="stack">
      <Section title="Serviços de estética animal">
        <div className="row">{services.map((s) => <Badge key={s.id} tone="brand" plain><Scissors size={14} aria-hidden="true" />{s.name} · {s.durationMin} min</Badge>)}</div>
      </Section>
      <Section title={`Agenda de hoje (${formatCivil(today)})`}>
        {!canEdit && <ReadOnly>Seu perfil visualiza, mas não altera banho/tosa.</ReadOnly>}
        {list.length === 0 ? <EmptyState title="Nenhum banho/tosa hoje">Agende pelo módulo Agenda com um serviço da categoria “Estética animal”.</EmptyState> : (
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {list.map((a) => <GroomingCard key={a.id} canEdit={canEdit} tz={tz} a={a} note={notes.find((n) => n.appointmentId === a.id)} animal={patient(a.patientId)} svcName={service(a.serviceId)?.name ?? ''} proName={proNameOf(pros, a.professionalId)}
              tutor={persons.find((p) => p.id === links.find((l) => l.patientId === a.patientId && l.relation === 'tutor')?.personId)?.name} upsert={upsert} actorName={actor.name} />)}
          </ul>
        )}
      </Section>
    </div>
  )
}

function GroomingCard({ a, note, animal, svcName, proName, tutor, tz, canEdit, upsert, actorName }: {
  a: import('@/domain/types').Appointment; note?: import('./types').GroomingNote; animal?: Patient; svcName: string; proName: string; tutor?: string; tz: string; canEdit: boolean; actorName: string
  upsert: (id: ID, fn: (n: import('./types').GroomingNote) => import('./types').GroomingNote, msg: string) => boolean
}) {
  const [text, setText] = useState(note?.notes ?? '')
  const [who, setWho] = useState('')
  const [when, setWhen] = useState(instantToLocal(new Date(), tz))
  const [err, setErr] = useState<string | null>(null)
  const auth = note?.authorization.at(-1)
  return (
    <li className="card tight stack" style={{ '--gap': '10px' } as React.CSSProperties}>
      <div className="row between">
        <div><strong>{formatTime(a.start, tz)} · {animal?.name}</strong> <span className="muted small">{animal?.species} · {animal?.breed}</span><div className="small">{svcName} · {proName} · Tutor: {tutor ?? '—'}</div></div>
        <div className="row"><Badge>{APPOINTMENT_STATUS_LABEL[a.status]}</Badge>{note?.delivery ? <Badge tone="success">Entregue</Badge> : auth?.authorized ? <Badge tone="info">Autorizado</Badge> : <Badge tone="warning">Sem autorização</Badge>}</div>
      </div>
      <Checkbox label="Tutor autorizou o serviço" hint={auth ? `Último registro: ${auth.authorized ? 'autorizado' : 'autorização retirada'} por ${auth.by} em ${formatDateTime(auth.at, tz)}` : 'Registro obrigatório antes do início.'}
        checked={!!auth?.authorized} disabled={!canEdit || !!note?.delivery}
        onChange={(e) => { const v = e.target.checked; upsert(a.id, (n) => ({ ...n, authorization: [...n.authorization, { authorized: v, at: nowISO(), by: actorName }] }), v ? 'Autorização do tutor registrada' : 'Autorização retirada (registrado)') }} />
      <Field label="Observações do serviço"><Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} disabled={!canEdit} /></Field>
      {canEdit && <div><Button size="sm" disabled={text === (note?.notes ?? '')} onClick={() => upsert(a.id, (n) => ({ ...n, notes: text }), 'Observações salvas')}>Salvar observações</Button></div>}
      {note?.delivery ? <Alert tone="success" title="Entregue">Retirado por {note.delivery.pickedUpBy} às {formatTime(note.delivery.at, tz)} (registrado por {note.delivery.registeredBy}).</Alert> : canEdit && (
        <div className="form-grid" style={{ alignItems: 'end' }}>
          <Field label="Quem retirou" error={err}><Input value={who} onChange={(e) => setWho(e.target.value)} /></Field>
          <Field label="Horário da entrega"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          <Button variant="primary" onClick={() => {
            if (!auth?.authorized) return setErr('Registre a autorização do tutor antes da entrega.')
            if (!who.trim()) return setErr('Informe quem retirou o animal.')
            setErr(null)
            upsert(a.id, (n) => ({ ...n, delivery: { at: localToInstant(when, tz), pickedUpBy: who.trim(), registeredBy: actorName } }), 'Entrega registrada')
          }}>Registrar entrega</Button>
        </div>
      )}
    </li>
  )
}

// ---------------- Calculadora de conversão ----------------
const SPECIES = ['Cão', 'Gato', 'Coelho', 'Ave', 'Réptil', 'Outro']
function CalculatorTab({ animal }: { animal: Patient | null }) {
  const lastKg = animal?.weights?.length ? [...animal.weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.kg : null
  const [species, setSpecies] = useState(animal?.species ?? '')
  const [context, setContext] = useState('')
  const [dose, setDose] = useState('')
  const [doseUnit, setDoseUnit] = useState<DoseUnit>('mg/kg')
  const [weight, setWeight] = useState(lastKg != null ? String(lastKg).replace('.', ',') : '')
  const [conc, setConc] = useState('')
  const [concUnit, setConcUnit] = useState<ConcUnit>('mg/mL')
  const [copied, setCopied] = useState(false)
  const touched = dose !== '' || conc !== ''
  const n = (s: string) => { const v = parseNum(s); return v == null ? null : v }
  const r = calcVolume({ species, context, dose: n(dose), doseUnit, weightKg: n(weight), concentration: n(conc), concUnit })
  const text = r.ok ? `CÁLCULO (conferir antes de usar) — ${species}${animal ? ` ${animal.name}` : ''}; contexto: ${context}. ${r.steps.join('; ')}.` : ''
  return (
    <Section title="Calculadora de conversão (opcional)">
      <div className="stack">
        <Alert tone="warning" title="Ferramenta de conversão, não de prescrição">Só converte uma dose JÁ prescrita pelo profissional em volume. Não sugere medicamento nem dose, não aplica fórmula sem espécie/contexto e não grava prescrição. Confira sempre o resultado.</Alert>
        <div className="form-grid">
          <Field label="Espécie" required><Select value={species} onChange={(e) => setSpecies(e.target.value)}><option value="">Selecione</option>{SPECIES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Contexto / prescrição de referência" required hint="Ex.: prescrição da internação de hoje"><Input value={context} onChange={(e) => setContext(e.target.value)} /></Field>
        </div>
        <div className="form-grid">
          <Field label="Dose prescrita" required><Input inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} /></Field>
          <Field label="Unidade da dose"><Select value={doseUnit} onChange={(e) => setDoseUnit(e.target.value as DoseUnit)}>{DOSE_UNITS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
          <Field label="Peso (kg)" hint={lastKg != null ? `Última pesagem: ${lastKg} kg` : doseUnit.endsWith('/kg') ? 'Obrigatório para dose por kg' : 'Não usado em dose total'}><Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></Field>
          <Field label="Concentração do produto" required><Input inputMode="decimal" value={conc} onChange={(e) => setConc(e.target.value)} /></Field>
          <Field label="Unidade da concentração"><Select value={concUnit} onChange={(e) => setConcUnit(e.target.value as ConcUnit)}>{CONC_UNITS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
        </div>
        <div aria-live="polite">
          {!touched ? <p className="muted small">Preencha os campos para ver o cálculo.</p> : r.ok ? (
            <div className="calc-result stack" style={{ '--gap': '6px' } as React.CSSProperties}>
              <span className="small strong"><Calculator size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-3px' }} /> Cálculo (não é prescrição)</span>
              <span className="calc-value num">{r.volumeMl.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} mL</span>
              <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>{r.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              <div><Button size="sm" icon={<Copy />} onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { setCopied(false) } }}>{copied ? 'Copiado' : 'Copiar resultado'}</Button></div>
            </div>
          ) : <Alert tone="danger" title="Não foi possível calcular">{r.errors.map((e) => <div key={e}>{e}</div>)}</Alert>}
        </div>
        <SimBadge>Nada é gravado — apenas cópia para a área de transferência</SimBadge>
      </div>
    </Section>
  )
}
