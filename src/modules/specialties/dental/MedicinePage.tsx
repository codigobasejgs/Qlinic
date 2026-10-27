// /medicina — SOAP configurável, sinais vitais, exames, encaminhamentos, retornos, receitas/atestados (rascunho demo),
// diretório de especialidades/templates e pediatria (curva de EXEMPLO, sem percentis).
import { useMemo, useState } from 'react'
import { CalendarPlus, CheckCircle2, FileText, Plus, Save } from 'lucide-react'
import type { ClinicDocument, ClinicalRecord } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { clinicalRepo, documentRepo } from '@/data/repositories'
import { createAppointment } from '@/domain/appointments'
import { Alert, Badge, Button, DataTable, DemoPaper, Dialog, Field, FileUpload, Input, PageHeader, Section, Select, Tabs, TabPanel, Textarea, Timeline, useAction, useLookup, usePatientParam, type Column, type Tone } from '@/ui'
import { ageFromBirth, formatCivil, formatDateTime, hhmmToMinutes, nowISO, todayCivil, zonedToInstant, addMinutes } from '@/lib/dates'
import { uid } from '@/lib/util'
import { DEFAULT_SOAP, VITAL_LIMITS, bmi, bmiBand, transitionExam, validateGrowth, validateVitals, type ExamOrder, type FollowUp, type GrowthMeasure, type Referral, type ReferralPriority, type SoapSection, type SoapTemplate, type VitalInput, type VitalSigns } from './medicine'
import { ChoosePatient, NoAccess, PatientBar, ReadOnlyNotice, S, nf, num, useClinicalAccess, patientIdAllowed } from './common'

export function MedicinePage() {
  const t = useTenant()
  const acc = useClinicalAccess()
  const [patientId, setPatientId] = usePatientParam()
  const [tab, setTab] = useState('soap')
  if (!t.moduleOn('medicina')) return <><PageHeader title="Medicina" /><NoAccess what="o módulo de Medicina ambulatorial (desligado neste plano)" resource="módulo Medicina" /></>
  const tabs = [
    { id: 'soap', label: 'Evolução SOAP' }, { id: 'vitais', label: 'Sinais vitais' }, { id: 'exames', label: 'Exames' }, { id: 'encaminhamentos', label: 'Encaminhamentos' },
    { id: 'retornos', label: 'Retornos' }, { id: 'documentos', label: 'Receitas e atestados' }, { id: 'pediatria', label: 'Pediatria' }, { id: 'diretorio', label: 'Diretório e templates' },
  ]
  return (
    <>
      <PageHeader title="Medicina ambulatorial" subtitle="Evolução, sinais vitais, exames, encaminhamentos, retornos e documentos em rascunho." breadcrumbs={[{ label: 'Início', to: t.base }, { label: 'Medicina' }]} />
      <div className="stack" data-tour="page-content">
        {!acc.canRead ? <NoAccess what="dados clínicos" resource="prontuário (leitura clínica)" /> : (
          <>
            <PatientBar value={patientId} onChange={setPatientId} />
            <Tabs label="Seções de medicina" tabs={tabs} value={tab} onChange={setTab} />
            <div key={`${t.tenantId}-${t.effectiveUser?.id}-${patientId}-${t.unitId}`}><TabPanel>
              {tab === 'diretorio' ? <DirectoryTab /> : !patientId ? <ChoosePatient /> : !patientIdAllowed(t, patientId) ? <NoAccess what="este paciente (inexistente ou fora da unidade)" resource="paciente da unidade permitida" /> : (
                <>
                  {tab === 'soap' && <SoapTab patientId={patientId} />}
                  {tab === 'vitais' && <VitalsTab patientId={patientId} />}
                  {tab === 'exames' && <ExamsTab patientId={patientId} />}
                  {tab === 'encaminhamentos' && <ReferralsTab patientId={patientId} />}
                  {tab === 'retornos' && <FollowUpsTab patientId={patientId} />}
                  {tab === 'documentos' && <DocsTab patientId={patientId} />}
                  {tab === 'pediatria' && <PediatricsTab patientId={patientId} />}
                </>
              )}
            </TabPanel></div>
          </>
        )}
      </div>
    </>
  )
}

// ======================= SOAP =======================
function SoapTab({ patientId }: { patientId: string }) {
  const t = useTenant()
  const actor = useActor()
  const acc = useClinicalAccess()
  const run = useAction()
  const templates = useCollection(t.tenantId, 'soapTemplates').filter((x) => x.active)
  const records = useCollection(t.tenantId, 'records').filter((r) => r.patientId === patientId && r.specialty === 'medicina' && (acc.scope === 'all' || r.professionalId === acc.professionalId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const [tplId, setTplId] = useState(templates[0]?.id ?? 'default')
  const tpl: Pick<SoapTemplate, 'id' | 'version' | 'name' | 'sections'> = templates.find((x) => x.id === tplId) ?? { id: 'default', version: 1, name: 'SOAP padrão', sections: DEFAULT_SOAP }
  const draft = records.find((r) => r.status === 'rascunho' && r.professionalId === acc.professionalId)
  const [editId, setEditId] = useState<string | null>(null)
  const [content, setContent] = useState<Record<string, string>>({})
  const [view, setView] = useState<ClinicalRecord | null>(null)
  const [addendum, setAddendum] = useState({ reason: '', text: '' })
  const editing = editId ? records.find((r) => r.id === editId) : undefined
  const sections: SoapSection[] = editing ? (templates.find((x) => x.id === editing.templateId)?.sections ?? DEFAULT_SOAP) : tpl.sections
  const start = (r?: ClinicalRecord) => { setEditId(r?.id ?? 'new'); setContent(r ? Object.fromEntries(Object.entries(r.content).map(([k, v]) => [k, String(v ?? '')])) : {}) }
  const save = (finalize: boolean) => run(() => {
    if (!acc.professionalId) throw new Error('Somente profissionais registram evolução.')
    if (finalize && sections.some((s) => !(content[s.key] ?? '').trim())) throw new Error('Preencha todas as seções antes de finalizar.')
    if (!Object.values(content).some((v) => v.trim())) throw new Error('Evolução vazia.')
    const id = editing?.id ?? uid('rec_')
    const rec: ClinicalRecord = editing ? { ...editing, content } : {
      id, tenantId: t.tenantId, createdAt: nowISO(), patientId, professionalId: acc.professionalId, specialty: 'medicina', templateId: tpl.id, templateVersion: tpl.version, title: `Evolução — ${tpl.name}`,
      content, status: 'rascunho', addenda: [], confidentiality: 'padrao', releasedToPortal: false, history: [{ at: nowISO(), from: null, to: 'rascunho', by: actor.name }],
    }
    clinicalRepo.save(t.tenantId, rec)
    if (finalize) clinicalRepo.finalize(t.tenantId, id, actor.name)
    setEditId(null); setContent({})
  }, finalize ? 'Evolução finalizada (não pode mais ser sobrescrita; use adendo).' : 'Rascunho salvo.')
  const addAdd = () => view && run(() => {
    clinicalRepo.addAddendum(t.tenantId, view.id, { authorId: actor.id, authorName: actor.name, ...addendum })
    setView(db.get(t.tenantId, 'records', view.id) ?? null); setAddendum({ reason: '', text: '' })
  }, 'Adendo registrado.')
  return (
    <div className="stack">
      {acc.canEdit && !editId && (
        <Section title="Nova evolução" actions={<Button variant="primary" icon={<Plus />} onClick={() => start(draft)} data-tour="primary-action">{draft ? 'Continuar rascunho' : 'Iniciar evolução'}</Button>}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Template"><Select value={tplId} onChange={(e) => setTplId(e.target.value)}>{(templates.length ? templates : [tpl as SoapTemplate]).map((x) => <option key={x.id} value={x.id}>{x.name} (v{x.version})</option>)}</Select></Field>
            <span className="small muted">Seções: {tpl.sections.map((s) => s.label).join(' · ')}. Edite templates em "Diretório e templates".</span>
          </div>
        </Section>
      )}
      {!acc.canEdit && <ReadOnlyNotice />}
      {editId && (
        <Section title={editing ? 'Editar rascunho' : `Nova evolução — ${tpl.name}`}>
          <div className="stack" style={S(12)}>
            {sections.map((s) => <Field key={s.key} label={s.label} hint={s.hint}><Textarea rows={3} value={content[s.key] ?? ''} onChange={(e) => setContent({ ...content, [s.key]: e.target.value })} /></Field>)}
            <p className="tiny muted">O sistema não sugere diagnóstico, medicamento ou conduta. Texto registrado pelo médico.</p>
            <div className="form-actions"><Button onClick={() => setEditId(null)}>Cancelar</Button><Button icon={<Save />} onClick={() => save(false)}>Salvar rascunho</Button><Button variant="primary" icon={<CheckCircle2 />} onClick={() => save(true)}>Finalizar</Button></div>
          </div>
        </Section>
      )}
      <Section title="Evoluções do paciente">
        {records.length === 0 ? <p className="muted">Sem evoluções médicas{acc.scope === 'own' ? ' registradas por você' : ''}.</p> : (
          <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {records.map((r) => (
              <li key={r.id} className="row between" style={{ padding: '10px 0' }}>
                <div className="stack grow" style={S(2)}><strong>{r.title}</strong><span className="small muted">{formatDateTime(r.createdAt)} · {db.get(t.tenantId, 'professionals', r.professionalId)?.name}{r.addenda.length ? ` · ${r.addenda.length} adendo(s)` : ''}</span></div>
                <div className="row" style={S(6)}>
                  <Badge tone={r.status === 'finalizado' ? 'success' : 'warning'}>{r.status === 'finalizado' ? 'Finalizado' : 'Rascunho'}</Badge>
                  {r.status === 'rascunho' && acc.canEdit && r.professionalId === acc.professionalId ? <Button size="sm" onClick={() => start(r)}>Editar</Button> : <Button size="sm" onClick={() => setView(r)}>Abrir</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Dialog open={!!view} onClose={() => setView(null)} title={view?.title ?? ''} size="lg" footer={<Button onClick={() => setView(null)}>Fechar</Button>}>
        {view && <div className="stack" style={S(12)}>
          {Object.entries(view.content).map(([k, v]) => <div key={k}><div className="small muted">{(templates.find((x) => x.id === view.templateId)?.sections ?? DEFAULT_SOAP).find((s) => s.key === k)?.label ?? k}</div><p style={{ whiteSpace: 'pre-wrap' }}>{String(v)}</p></div>)}
          {view.addenda.length > 0 && <Timeline items={view.addenda.map((a) => ({ time: formatDateTime(a.at), title: `Adendo — ${a.authorName}`, body: `${a.reason}: ${a.text}` }))} />}
          {view.status === 'finalizado' && acc.canEdit && view.professionalId === acc.professionalId && (
            <fieldset><legend>Adicionar adendo</legend><div className="stack" style={S(8)}>
              <Field label="Motivo" required><Input value={addendum.reason} onChange={(e) => setAddendum({ ...addendum, reason: e.target.value })} /></Field>
              <Field label="Texto" required><Textarea rows={2} value={addendum.text} onChange={(e) => setAddendum({ ...addendum, text: e.target.value })} /></Field>
              <div className="row end"><Button variant="primary" onClick={addAdd}>Registrar adendo</Button></div>
            </div></fieldset>
          )}
        </div>}
      </Dialog>
    </div>
  )
}

// ======================= Sinais vitais =======================
const VKEYS = Object.keys(VITAL_LIMITS) as (keyof typeof VITAL_LIMITS)[]
function VitalsTab({ patientId }: { patientId: string }) {
  const t = useTenant()
  const actor = useActor()
  const acc = useClinicalAccess()
  const run = useAction()
  const rows = useCollection(t.tenantId, 'vitalSigns').filter((v) => v.patientId === patientId).sort((a, b) => b.at.localeCompare(a.at))
  const canWrite = acc.canEdit || t.can('arquivos', 'create') // auxiliar/enfermagem registra sinais vitais
  const [f, setF] = useState<Record<string, string>>({})
  const [errs, setErrs] = useState<ReturnType<typeof validateVitals>>({})
  const input: VitalInput = Object.fromEntries(VKEYS.map((k) => [k, num(f[k] ?? '')]).filter(([, v]) => v !== undefined))
  const liveBmi = bmi(input.weightKg, input.heightCm ?? rows.find((r) => r.heightCm)?.heightCm)
  const save = () => {
    const e = validateVitals(input)
    setErrs(e)
    if (Object.keys(e).length) return
    run(() => { db.insert(t.tenantId, 'vitalSigns', { id: uid('vs_'), tenantId: t.tenantId, createdAt: nowISO(), patientId, at: nowISO(), by: actor.name, ...input } as VitalSigns); setF({}) }, 'Sinais vitais registrados.')
  }
  const cols: Column<VitalSigns>[] = [
    { id: 'at', header: 'Data', cell: (v) => formatDateTime(v.at), value: (v) => v.at },
    { id: 'pa', header: 'PA (mmHg)', cell: (v) => (v.sys ? `${v.sys}×${v.dia}` : '—') },
    { id: 'hr', header: 'FC', num: true, cell: (v) => nf(v.hr, 0), value: (v) => v.hr },
    { id: 'rr', header: 'FR', num: true, cell: (v) => nf(v.rr, 0) },
    { id: 't', header: 'Temp. °C', num: true, cell: (v) => nf(v.tempC) },
    { id: 's', header: 'SpO₂ %', num: true, cell: (v) => nf(v.spo2, 0) },
    { id: 'w', header: 'Peso kg', num: true, cell: (v) => nf(v.weightKg, 2) },
    { id: 'h', header: 'Altura cm', num: true, cell: (v) => nf(v.heightCm) },
    { id: 'imc', header: 'IMC', num: true, cell: (v) => nf(bmi(v.weightKg, v.heightCm)) },
    { id: 'by', header: 'Registrado por', cell: (v) => v.by, hidden: true },
  ]
  return (
    <div className="stack">
      <Section title="Registrar sinais vitais">
        {!canWrite ? <ReadOnlyNotice /> : (
          <div className="stack" style={S(12)}>
            <div className="form-grid">
              {VKEYS.map((k) => <Field key={k} label={`${VITAL_LIMITS[k].label} (${VITAL_LIMITS[k].unit})`} error={errs[k]}><Input inputMode="decimal" value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
            </div>
            <div className="muted-surface small" aria-live="polite">IMC calculado: <strong>{liveBmi === null ? '—' : nf(liveBmi)}</strong>{liveBmi !== null && <> · faixa de referência para adultos: {bmiBand(liveBmi)} kg/m² (apenas informativo; não se aplica a crianças, gestantes e outros contextos — interpretação do médico)</>}</div>
            {errs.form && <Alert tone="danger">{errs.form}</Alert>}
            <p className="tiny muted">Validação apenas de faixas plausíveis (erro de digitação), não de normalidade clínica.</p>
            <div className="row end"><Button variant="primary" onClick={save} data-tour="primary-action">Registrar</Button></div>
          </div>
        )}
      </Section>
      <Section title="Histórico">
        <DataTable caption="Histórico de sinais vitais" rows={rows} columns={cols} rowKey={(v) => v.id} exportName="sinais-vitais" empty={<p className="muted">Sem registros.</p>} />
      </Section>
    </div>
  )
}

// ======================= Exames =======================
const EX_TONE: Record<ExamOrder['status'], Tone> = { solicitado: 'warning', coletado: 'info', recebido: 'success', cancelado: 'neutral' }
const EX_LABEL: Record<ExamOrder['status'], string> = { solicitado: 'Solicitado', coletado: 'Coletado', recebido: 'Recebido', cancelado: 'Cancelado' }
function ExamsTab({ patientId }: { patientId: string }) {
  const t = useTenant()
  const actor = useActor()
  const acc = useClinicalAccess()
  const run = useAction()
  const exams = useCollection(t.tenantId, 'examOrders').filter((e) => e.patientId === patientId).sort((a, b) => b.requestedOn.localeCompare(a.requestedOn))
  const files = useCollection(t.tenantId, 'files')
  const [name, setName] = useState('')
  const [recv, setRecv] = useState<ExamOrder | null>(null)
  const [note, setNote] = useState('')
  const [fileId, setFileId] = useState<string | undefined>()
  const request = () => run(() => {
    if (!name.trim()) throw new Error('Informe o exame.')
    db.insert(t.tenantId, 'examOrders', { id: uid('ex_'), tenantId: t.tenantId, createdAt: nowISO(), patientId, name: name.trim(), requestedOn: todayCivil(), requestedBy: actor.name, professionalId: acc.professionalId, status: 'solicitado', history: [{ at: nowISO(), from: null, to: 'solicitado', by: actor.name }] })
    setName('')
  }, 'Exame solicitado.')
  const move = (e: ExamOrder, to: ExamOrder['status'], patch?: Partial<ExamOrder>) => run(() => db.update(t.tenantId, 'examOrders', e.id, (p) => transitionExam(p, to, actor.name, patch)), `Exame: ${EX_LABEL[to]}.`)
  const attach = (u: { name: string; mime: string; size: number; dataUrl: string }) => {
    const id = uid('file_')
    db.insert(t.tenantId, 'files', { id, tenantId: t.tenantId, createdAt: nowISO(), patientId, category: 'exame', name: u.name, mime: u.mime, sizeBytes: u.size, versions: [{ version: 1, at: nowISO(), by: actor.id, dataUrl: u.dataUrl, note: 'Anexo demonstrativo' }], restricted: false })
    setFileId(id)
  }
  return (
    <div className="stack">
      {acc.canEdit ? (
        <Section title="Solicitar exame">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Exame" className="grow"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Hemograma completo" /></Field>
            <Button variant="primary" icon={<Plus />} onClick={request} data-tour="primary-action">Solicitar</Button>
          </div>
        </Section>
      ) : <ReadOnlyNotice />}
      <Section title="Exames">
        {exams.length === 0 ? <p className="muted">Sem exames.</p> : (
          <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {exams.map((e) => {
              const f = files.find((x) => x.id === e.fileId)
              return (
                <li key={e.id} className="row between" style={{ padding: '10px 0' }}>
                  <div className="stack grow" style={S(2)}>
                    <strong>{e.name}</strong>
                    <span className="small muted">Solicitado {formatCivil(e.requestedOn)} por {e.requestedBy}{e.receivedOn ? ` · recebido ${formatCivil(e.receivedOn)}` : ''}</span>
                    {e.resultNote && <span className="small">{e.resultNote}</span>}
                    {f && <a className="small" href={f.versions[0].dataUrl} download={f.name}>Anexo: {f.name}</a>}
                  </div>
                  <div className="row" style={S(6)}>
                    <Badge tone={EX_TONE[e.status]}>{EX_LABEL[e.status]}</Badge>
                    {acc.canEdit && e.status === 'solicitado' && <Button size="sm" onClick={() => move(e, 'coletado')}>Coletado</Button>}
                    {acc.canEdit && (e.status === 'solicitado' || e.status === 'coletado') && <><Button size="sm" onClick={() => { setRecv(e); setNote(''); setFileId(undefined) }}>Registrar recebimento</Button><Button size="sm" variant="ghost" onClick={() => move(e, 'cancelado')}>Cancelar</Button></>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
      <Dialog open={!!recv} onClose={() => setRecv(null)} title={`Recebimento — ${recv?.name ?? ''}`} footer={<><Button onClick={() => setRecv(null)}>Cancelar</Button><Button variant="primary" onClick={() => { if (recv) { move(recv, 'recebido', { receivedOn: todayCivil(), resultNote: note.trim() || undefined, fileId }); setRecv(null) } }}>Registrar</Button></>}>
        <div className="stack" style={S(12)}>
          <Field label="Observação"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <FileUpload accept={['application/pdf', 'image/png', 'image/jpeg']} maxMb={2} onFile={attach} label="Anexar resultado (demonstrativo)" hint="PDF/PNG/JPG fictício até 2 MB." />
          {fileId && <p className="small" aria-live="polite">Anexo pronto.</p>}
        </div>
      </Dialog>
    </div>
  )
}

// ======================= Encaminhamentos =======================
const PRIO: Record<ReferralPriority, { l: string; tone: Tone }> = { rotina: { l: 'Rotina', tone: 'neutral' }, prioritario: { l: 'Prioritário', tone: 'warning' }, urgente: { l: 'Urgente', tone: 'danger' } }
function ReferralsTab({ patientId }: { patientId: string }) {
  const t = useTenant()
  const actor = useActor()
  const acc = useClinicalAccess()
  const run = useAction()
  const specs = useCollection(t.tenantId, 'medSpecialties').filter((s) => s.active)
  const list = useCollection(t.tenantId, 'referrals').filter((r) => r.patientId === patientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const [f, setF] = useState({ specialtyId: '', reason: '', priority: 'rotina' as ReferralPriority })
  const create = () => run(() => {
    if (!f.specialtyId) throw new Error('Escolha a especialidade do diretório.')
    if (f.reason.trim().length < 5) throw new Error('Descreva o motivo do encaminhamento.')
    db.insert(t.tenantId, 'referrals', { id: uid('enc_'), tenantId: t.tenantId, createdAt: nowISO(), patientId, specialtyId: f.specialtyId, reason: f.reason.trim(), priority: f.priority, status: 'aberto', professionalId: acc.professionalId, by: actor.name })
    setF({ specialtyId: '', reason: '', priority: 'rotina' })
  }, 'Encaminhamento registrado.')
  const set = (r: Referral, status: Referral['status']) => run(() => db.update(t.tenantId, 'referrals', r.id, { status }), 'Encaminhamento atualizado.')
  return (
    <div className="stack">
      {acc.canEdit ? (
        <Section title="Novo encaminhamento">
          <div className="stack" style={S(12)}>
            <div className="form-grid">
              <Field label="Especialidade" required><Select value={f.specialtyId} onChange={(e) => setF({ ...f, specialtyId: e.target.value })}><option value="">Escolher…</option>{specs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Prioridade operacional" hint="Organiza a fila; não é classificação de risco."><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as ReferralPriority })}>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</Select></Field>
            </div>
            <Field label="Motivo" required><Textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
            <div className="row end"><Button variant="primary" onClick={create} data-tour="primary-action">Encaminhar</Button></div>
          </div>
        </Section>
      ) : <ReadOnlyNotice />}
      <Section title="Encaminhamentos">
        {list.length === 0 ? <p className="muted">Sem encaminhamentos.</p> : (
          <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {list.map((r) => (
              <li key={r.id} className="row between" style={{ padding: '10px 0' }}>
                <div className="stack grow" style={S(2)}><strong>{specs.find((s) => s.id === r.specialtyId)?.name ?? 'Especialidade'}</strong><span className="small">{r.reason}</span><span className="small muted">{formatDateTime(r.createdAt)} · {r.by}</span></div>
                <div className="row" style={S(6)}>
                  <Badge tone={PRIO[r.priority].tone}>{PRIO[r.priority].l}</Badge><Badge plain>{r.status}</Badge>
                  {acc.canEdit && r.status === 'aberto' && <><Button size="sm" onClick={() => set(r, 'concluido')}>Concluir</Button><Button size="sm" variant="ghost" onClick={() => set(r, 'cancelado')}>Cancelar</Button></>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

// ======================= Retornos =======================
function FollowUpsTab({ patientId }: { patientId: string }) {
  const t = useTenant()
  const actor = useActor()
  const acc = useClinicalAccess()
  const run = useAction()
  const L = useLookup()
  const list = useCollection(t.tenantId, 'followUps').filter((r) => r.patientId === patientId).sort((a, b) => a.dueOn.localeCompare(b.dueOn))
  const patient = L.patient(patientId)
  const retorno = L.services.find((s) => /retorno/i.test(s.name)) ?? L.services[0]
  const [f, setF] = useState({ dueOn: '', time: '09:00', note: '', serviceId: retorno?.id ?? '' })
  const canSchedule = t.can('agenda', 'create') || t.can('agenda', 'update', { ownerProfessionalId: acc.professionalId })
  const add = (schedule: boolean) => run(() => {
    if (!f.dueOn) throw new Error('Defina a data do retorno.')
    if (f.dueOn < todayCivil()) throw new Error('Data do retorno não pode estar no passado.')
    const id = uid('ret_')
    let appointmentId: string | undefined
    if (schedule) {
      const proId = acc.professionalId ?? L.pros[0]?.id
      const svc = L.service(f.serviceId)
      const unit = L.unit(patient?.unitId) ?? t.units[0]
      if (!proId || !svc || !unit) throw new Error('Profissional, serviço ou unidade indisponível.')
      const res = L.resources.find((r) => r.unitId === unit.id && svc.resourceKinds.includes(r.kind) && r.active)
      const start = zonedToInstant(f.dueOn, hhmmToMinutes(f.time), unit.timezone)
      const a = createAppointment(t.tenantId, { unitId: unit.id, patientId, professionalId: proId, serviceId: svc.id, resourceIds: res ? [res.id] : [], start, end: addMinutes(start, svc.durationMin), source: 'recepcao', notes: 'Retorno definido pelo médico', status: 'aguardando_confirmacao' }, actor.name)
      appointmentId = a.id
    }
    db.insert(t.tenantId, 'followUps', { id, tenantId: t.tenantId, createdAt: nowISO(), patientId, dueOn: f.dueOn, note: f.note.trim() || 'Retorno', professionalId: acc.professionalId, appointmentId, status: schedule ? 'agendado' : 'lembrete', by: actor.name })
    setF({ ...f, dueOn: '', note: '' })
  }, schedule ? 'Retorno agendado (aguardando confirmação).' : 'Lembrete de retorno registrado.')
  const set = (r: FollowUp, status: FollowUp['status']) => run(() => db.update(t.tenantId, 'followUps', r.id, { status }), 'Retorno atualizado.')
  return (
    <div className="stack">
      {acc.canEdit ? (
        <Section title="Definir retorno">
          <div className="stack" style={S(12)}>
            <div className="form-grid">
              <Field label="Data (definida pelo médico)" required><Input type="date" min={todayCivil()} value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} /></Field>
              <Field label="Horário (para agendar)"><Input type="time" step={900} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
              <Field label="Serviço"><Select value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>{L.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            </div>
            <Field label="Observação"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            <div className="form-actions">
              <Button onClick={() => add(false)}>Só registrar lembrete</Button>
              {canSchedule && <Button variant="primary" icon={<CalendarPlus />} onClick={() => add(true)} data-tour="primary-action">Criar agendamento</Button>}
            </div>
            <p className="tiny muted">O agendamento passa pelas mesmas regras da agenda (horário, conflitos, recursos). Em caso de conflito, a mensagem explica o motivo.</p>
          </div>
        </Section>
      ) : <ReadOnlyNotice />}
      <Section title="Retornos">
        {list.length === 0 ? <p className="muted">Sem retornos definidos.</p> : (
          <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {list.map((r) => {
              const ap = r.appointmentId ? db.get(t.tenantId, 'appointments', r.appointmentId) : undefined
              return (
                <li key={r.id} className="row between" style={{ padding: '10px 0' }}>
                  <div className="stack grow" style={S(2)}><strong>{formatCivil(r.dueOn)}</strong><span className="small">{r.note}</span><span className="small muted">{r.by}{ap ? ` · agendado ${formatDateTime(ap.start)}` : ''}</span></div>
                  <div className="row" style={S(6)}>
                    <Badge tone={r.status === 'agendado' ? 'success' : r.status === 'concluido' ? 'neutral' : r.dueOn < todayCivil() ? 'danger' : 'info'}>{r.status === 'lembrete' ? (r.dueOn < todayCivil() ? 'Lembrete vencido' : 'Lembrete') : r.status === 'agendado' ? 'Agendado' : 'Concluído'}</Badge>
                    {acc.canEdit && r.status !== 'concluido' && <Button size="sm" onClick={() => set(r, 'concluido')}>Concluir</Button>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}

// ======================= Receitas e atestados (rascunho demo) =======================
function DocsTab({ patientId }: { patientId: string }) {
  const t = useTenant()
  const acc = useClinicalAccess()
  const run = useAction()
  const L = useLookup()
  const docs =useCollection(t.tenantId, 'documents').filter((d) => d.patientId === patientId && (d.kind === 'receita' || d.kind === 'atestado')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const [kind, setKind] = useState<'receita' | 'atestado'>('receita')
  const [body, setBody] = useState('')
  const [view, setView] = useState<ClinicDocument | null>(null)
  const patient = L.patient(patientId)
  const pro = L.pro(acc.professionalId)
  const create = () => run(() => {
    if (!acc.professionalId) throw new Error('Somente médicos redigem receitas e atestados.')
    if (body.trim().length < 3) throw new Error('Escreva o conteúdo do documento.')
    const d: ClinicDocument = {
      id: uid('doc_'), tenantId: t.tenantId, createdAt: nowISO(), patientId, kind, title: kind === 'receita' ? 'Receita (rascunho demonstrativo)' : 'Atestado (rascunho demonstrativo)', body: body.trim(),
      status: 'rascunho', releasedToPortal: false, confidentiality: 'padrao', signature: { status: 'nao_requerida', provider: 'demonstracao', signers: [], trail: [{ at: nowISO(), event: 'Rascunho criado (demonstração)' }] }, createdBy: acc.professionalId, demoWatermark: true,
    }
    documentRepo.save(t.tenantId, d)
    setBody(''); setView(d)
  }, 'Rascunho demonstrativo salvo.')
  return (
    <div className="stack">
      <Alert tone="warning" title="Sempre rascunho demonstrativo">Documentos sem validade legal. O sistema não sugere medicamento, dose ou dias de afastamento: todo o conteúdo é digitado pelo médico. Emissão real depende de assinatura digital qualificada (integração futura).</Alert>
      {acc.canEdit ? (
        <Section title="Novo rascunho">
          <div className="stack" style={S(12)}>
            <Field label="Tipo"><Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="receita">Receita</option><option value="atestado">Atestado</option></Select></Field>
            <Field label="Conteúdo (redigido pelo médico)"><Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
            <div className="row end"><Button variant="primary" icon={<FileText />} onClick={create} data-tour="primary-action">Salvar rascunho</Button></div>
          </div>
        </Section>
      ) : <ReadOnlyNotice />}
      <Section title="Rascunhos">
        {docs.length === 0 ? <p className="muted">Sem receitas/atestados.</p> : (
          <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {docs.map((d) => <li key={d.id} className="row between" style={{ padding: '10px 0' }}><div className="stack" style={S(2)}><strong>{d.title}</strong><span className="small muted">{formatDateTime(d.createdAt)}</span></div><div className="row"><Badge tone="warning">Rascunho</Badge><Button size="sm" onClick={() => setView(d)}>Visualizar</Button></div></li>)}
          </ul>
        )}
      </Section>
      <Dialog open={!!view} onClose={() => setView(null)} title="Pré-visualização (demonstração)" size="lg" footer={<><Button onClick={() => window.print()}>Imprimir</Button><Button variant="primary" onClick={() => setView(null)}>Fechar</Button></>}>
        {view && <DemoPaper watermark="RASCUNHO DEMONSTRATIVO — SEM VALIDADE">
          <div className="stack" style={S(12)}>
            <strong>{t.org.name}</strong>
            <h2 style={{ fontSize: 18 }}>{view.kind === 'receita' ? 'Receituário' : 'Atestado'}</h2>
            <p>Paciente: {patient?.name}</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{view.body}</p>
            <p className="small">{L.pro(view.createdBy)?.name ?? pro?.name} · {L.pro(view.createdBy)?.council ?? pro?.council}</p>
            <p className="tiny">Documento de demonstração gerado em {formatDateTime(view.createdAt)}. Sem assinatura digital, sem validade legal.</p>
          </div>
        </DemoPaper>}
      </Dialog>
    </div>
  )
}

// ======================= Pediatria =======================
function PediatricsTab({ patientId }: { patientId: string }) {
  const t = useTenant()
  const actor = useActor()
  const acc = useClinicalAccess()
  const run = useAction()
  const L = useLookup()
  const p = L.patient(patientId)
  const list = useCollection(t.tenantId, 'growthMeasures').filter((m) => m.patientId === patientId).sort((a, b) => a.date.localeCompare(b.date))
  const [f, setF] = useState({ date: todayCivil(), w: '', h: '', pc: '' })
  const [metric, setMetric] = useState<'weightKg' | 'heightCm' | 'headCm'>('weightKg')
  const [errs, setErrs] = useState<string[]>([])
  const age = p?.birthDate ? ageFromBirth(p.birthDate, todayCivil()) : null
  const add = () => {
    const m = { weightKg: num(f.w), heightCm: num(f.h), headCm: num(f.pc) }
    const e = validateGrowth(m)
    if (p?.birthDate && f.date < p.birthDate) e.push('Data anterior ao nascimento.')
    if (f.date > todayCivil()) e.push('Data não pode ser futura.')
    setErrs(e)
    if (e.length) return
    run(() => { db.insert(t.tenantId, 'growthMeasures', { id: uid('gm_'), tenantId: t.tenantId, createdAt: nowISO(), patientId, date: f.date, ...m, by: actor.name } as GrowthMeasure); setF({ date: todayCivil(), w: '', h: '', pc: '' }) }, 'Medidas registradas.')
  }
  const pts = list.filter((m) => m[metric] !== undefined).map((m) => ({ x: p?.birthDate ? (Date.parse(m.date) - Date.parse(p.birthDate)) / (365.25 * 86400000) : 0, y: m[metric]!, d: m.date }))
  const unit = metric === 'weightKg' ? 'kg' : 'cm'
  return (
    <div className="stack">
      {age !== null && age >= 18 && <Alert tone="info">Paciente adulto ({age} anos). A entrada de medidas pediátricas é usada para menores de 18 anos.</Alert>}
      {acc.canEdit ? (
        <Section title="Registrar medidas">
          <div className="stack" style={S(12)}>
            <div className="form-grid">
              <Field label="Data"><Input type="date" max={todayCivil()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
              <Field label="Peso (kg)"><Input inputMode="decimal" value={f.w} onChange={(e) => setF({ ...f, w: e.target.value })} /></Field>
              <Field label="Estatura (cm)"><Input inputMode="decimal" value={f.h} onChange={(e) => setF({ ...f, h: e.target.value })} /></Field>
              <Field label="Perímetro cefálico (cm)"><Input inputMode="decimal" value={f.pc} onChange={(e) => setF({ ...f, pc: e.target.value })} /></Field>
            </div>
            {errs.length > 0 && <Alert tone="danger"><ul style={{ margin: 0, paddingLeft: 18 }}>{errs.map((x) => <li key={x}>{x}</li>)}</ul></Alert>}
            <div className="row end"><Button variant="primary" onClick={add} data-tour="primary-action">Registrar</Button></div>
          </div>
        </Section>
      ) : <ReadOnlyNotice />}
      <Section title="Evolução (curva de EXEMPLO)" actions={<Select aria-label="Medida" value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)} style={{ minHeight: 40, width: 'auto' }}><option value="weightKg">Peso</option><option value="heightCm">Estatura</option><option value="headCm">Perímetro cefálico</option></Select>}>
        <div className="stack" style={S(10)}>
          <Alert tone="warning">Curva de EXEMPLO sem percentis — curvas clínicas reais dependem de referência validada. Mostra apenas os valores registrados do próprio paciente.</Alert>
          <GrowthChart pts={pts} unit={unit} label={metric === 'weightKg' ? 'Peso' : metric === 'heightCm' ? 'Estatura' : 'Perímetro cefálico'} />
          <div className="table-wrap">
            <table className="table"><caption className="sr-only">Medidas registradas</caption>
              <thead><tr><th scope="col">Data</th><th scope="col" className="num">Idade</th><th scope="col" className="num">Peso</th><th scope="col" className="num">Estatura</th><th scope="col" className="num">PC</th></tr></thead>
              <tbody>{list.map((m) => <tr key={m.id}><td>{formatCivil(m.date)}</td><td className="num">{p?.birthDate ? `${nf((Date.parse(m.date) - Date.parse(p.birthDate)) / (365.25 * 86400000))} a` : '—'}</td><td className="num">{nf(m.weightKg, 2)}</td><td className="num">{nf(m.heightCm)}</td><td className="num">{nf(m.headCm)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </Section>
    </div>
  )
}

function GrowthChart({ pts, unit, label }: { pts: { x: number; y: number; d: string }[]; unit: string; label: string }) {
  const W = 640, H = 240, P = { l: 48, r: 16, t: 16, b: 32 }
  const geo = useMemo(() => {
    if (!pts.length) return null
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    const x0 = Math.floor(Math.min(...xs)), x1 = Math.max(Math.ceil(Math.max(...xs)), x0 + 1)
    const pad = (Math.max(...ys) - Math.min(...ys)) * 0.15 || 1
    const y0 = Math.floor(Math.min(...ys) - pad), y1 = Math.ceil(Math.max(...ys) + pad)
    const sx = (x: number) => P.l + ((x - x0) / (x1 - x0)) * (W - P.l - P.r)
    const sy = (y: number) => H - P.b - ((y - y0) / (y1 - y0)) * (H - P.t - P.b)
    return { x0, x1, y0, y1, sx, sy }
  }, [pts, P.l, P.r, P.t, P.b])
  if (!geo) return <p className="muted">Sem medidas para exibir.</p>
  const { x0, x1, y0, y1, sx, sy } = geo
  const yTicks = Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4)
  const xTicks = Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i)
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="growth-svg" role="img" aria-label={`Gráfico de ${label} por idade: ${pts.map((p) => `${nf(p.y)} ${unit} em ${formatCivil(p.d)}`).join('; ')}`}>
        {yTicks.map((y) => <g key={y}><line x1={P.l} x2={W - P.r} y1={sy(y)} y2={sy(y)} className="gc-grid" /><text x={P.l - 6} y={sy(y) + 4} textAnchor="end" className="gc-tick">{nf(y)}</text></g>)}
        {xTicks.map((x) => <text key={x} x={sx(x)} y={H - 10} textAnchor="middle" className="gc-tick">{x} a</text>)}
        <text x={P.l} y={10} className="gc-tick">{unit}</text>
        <polyline points={pts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} className="gc-line" />
        {pts.map((p) => <circle key={p.d} cx={sx(p.x)} cy={sy(p.y)} r={4} className="gc-pt"><title>{`${formatCivil(p.d)}: ${nf(p.y)} ${unit}`}</title></circle>)}
        <text x={W - P.r} y={P.t + 4} textAnchor="end" className="gc-ex">EXEMPLO — sem percentis</text>
      </svg>
      <figcaption className="tiny muted">Eixo X: idade (anos) · eixo Y: {label.toLowerCase()} ({unit}).</figcaption>
    </figure>
  )
}

// ======================= Diretório de especialidades e templates =======================
function DirectoryTab() {
  const t = useTenant()
  const run = useAction()
  const canManage = t.can('configuracoes', 'update') || t.can('clinical', 'create')
  const specs = useCollection(t.tenantId, 'medSpecialties')
  const tpls = useCollection(t.tenantId, 'soapTemplates')
  const [name, setName] = useState('')
  const [editTpl, setEditTpl] = useState<SoapTemplate | null>(null)
  const addSpec = () => run(() => {
    if (name.trim().length < 3) throw new Error('Nome da especialidade muito curto.')
    if (specs.some((s) => s.name.toLowerCase() === name.trim().toLowerCase())) throw new Error('Especialidade já cadastrada.')
    db.insert(t.tenantId, 'medSpecialties', { id: uid('esp_'), tenantId: t.tenantId, createdAt: nowISO(), name: name.trim(), description: 'Cadastrada pela clínica.', active: true })
    setName('')
  }, 'Especialidade adicionada ao diretório.')
  const saveTpl = () => editTpl && run(() => {
    const secs = editTpl.sections.filter((s) => s.label.trim())
    if (!editTpl.name.trim() || !secs.length) throw new Error('Template precisa de nome e ao menos uma seção.')
    const exists = db.get(t.tenantId, 'soapTemplates', editTpl.id)
    // ponytail: versão incrementa a cada edição; registros guardam templateVersion. Histórico de versões completo = backend futuro.
    const next = { ...editTpl, sections: secs.map((s, i) => ({ ...s, key: s.key || `sec${i + 1}` })), version: exists ? exists.version + 1 : 1 }
    if (exists) db.update(t.tenantId, 'soapTemplates', next.id, next); else db.insert(t.tenantId, 'soapTemplates', next)
    setEditTpl(null)
  }, 'Template salvo.')
  return (
    <div className="grid grid-2">
      <Section title="Diretório de especialidades">
        <div className="stack" style={S(12)}>
          {canManage && <div className="row" style={{ alignItems: 'flex-end' }}><Field label="Nova especialidade" className="grow"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><Button onClick={addSpec}>Adicionar</Button></div>}
          <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {specs.map((s) => <li key={s.id} className="row between" style={{ padding: '8px 0' }}><span>{s.name}</span>{canManage ? <Button size="sm" variant="ghost" onClick={() => run(() => db.update(t.tenantId, 'medSpecialties', s.id, { active: !s.active }), s.active ? 'Especialidade desativada.' : 'Especialidade ativada.')}>{s.active ? 'Desativar' : 'Ativar'}</Button> : <Badge plain>{s.active ? 'Ativa' : 'Inativa'}</Badge>}</li>)}
          </ul>
        </div>
      </Section>
      <Section title="Templates de evolução" actions={canManage ? <Button size="sm" icon={<Plus />} onClick={() => setEditTpl({ id: uid('soap_'), tenantId: t.tenantId, createdAt: nowISO(), name: 'Novo template', version: 0, active: true, sections: DEFAULT_SOAP.map((s) => ({ ...s })) })}>Novo template</Button> : undefined}>
        <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {tpls.map((x) => <li key={x.id} className="row between" style={{ padding: '8px 0' }}><span className="stack" style={S(2)}><strong>{x.name}</strong><span className="small muted">v{x.version} · {x.sections.map((s) => s.label).join(' · ')}</span></span>{canManage && <Button size="sm" onClick={() => setEditTpl({ ...x, sections: x.sections.map((s) => ({ ...s })) })}>Editar</Button>}</li>)}
        </ul>
      </Section>
      <Dialog open={!!editTpl} onClose={() => setEditTpl(null)} title="Template de evolução" footer={<><Button onClick={() => setEditTpl(null)}>Cancelar</Button><Button variant="primary" onClick={saveTpl}>Salvar (nova versão)</Button></>}>
        {editTpl && <div className="stack" style={S(10)}>
          <Field label="Nome"><Input value={editTpl.name} onChange={(e) => setEditTpl({ ...editTpl, name: e.target.value })} /></Field>
          {editTpl.sections.map((s, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
              <Field label={`Seção ${i + 1}`} className="grow"><Input value={s.label} onChange={(e) => setEditTpl({ ...editTpl, sections: editTpl.sections.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /></Field>
              <Button variant="ghost" onClick={() => setEditTpl({ ...editTpl, sections: editTpl.sections.filter((_, k) => k !== i) })}>Remover</Button>
            </div>
          ))}
          <Button icon={<Plus />} onClick={() => setEditTpl({ ...editTpl, sections: [...editTpl.sections, { key: `sec${Date.now().toString(36)}`, label: '' }] })}>Adicionar seção</Button>
          <p className="tiny muted">Evoluções já gravadas preservam a versão do template usada.</p>
        </div>}
      </Dialog>
    </div>
  )
}
