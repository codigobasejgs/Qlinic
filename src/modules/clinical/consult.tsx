// /atendimento/:appointmentId — modo consulta: histórico à esquerda, registro estruturado à direita.
import { useEffect, useState } from 'react'
import { useBlocker, useParams } from 'react-router'
import { CheckCircle2, CircleStop, FileSignature, Mic, Pause, Play, Save, ShieldAlert, Trash2 } from 'lucide-react'
import type { ClinicalRecord } from '@/domain/types'
import { APPOINTMENT_STATUS_LABEL } from '@/domain/types'
import { useActor, useDraft, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit } from '@/data/repositories'
import { changeAppointmentStatus } from '@/domain/appointments'
import { canSeeRecord, visibleClinicalAlerts } from '@/domain/access'
import { useConfirmLeave } from '@/pwa/client'
import {
  Alert, Badge, Button, ButtonLink, Checkbox, Dialog, EmptyState, Field, PageHeader, Section, Select, SignaturePad, SimBadge, Textarea, useAction, useConfirm, useLookup, useToast,
} from '@/ui'
import { formatDateTime, formatTime } from '@/lib/dates'
import { uid } from '@/lib/util'
import { currentTemplate, findTemplate, validateRecordContent } from './templates'
import { addAddendum, appendToField, decideSegment, deleteDictationAudio, dictationElapsed, finalizeRecord, newRecord, ORIGIN_LABEL, pauseDictation, resumeDictation, RETENTION_LABEL, saveRecord, startDictation, stopDictation } from './lib'
import { RecordCard, RecordForm, RecordStatusBadge, patientSubtitle } from './shared'
import type { Dictation } from './types'

interface Draft { content: Record<string, unknown>; guidance: string; released: boolean; savedAt?: string }

export function ConsultPage() {
  const { appointmentId = '' } = useParams()
  const t = useTenant()
  const L = useLookup()
  const appts = useCollection(t.tenantId, 'appointments')
  const records = useCollection(t.tenantId, 'records')
  const a = appts.find((x) => x.id === appointmentId)
  const patient = a ? L.patient(a.patientId) : undefined
  if (!a || !patient || !t.allowedUnits.some((u) => u.id === a.unitId)) {
    return <><PageHeader title="Atendimento não encontrado" /><EmptyState title="Agendamento inexistente ou fora das suas unidades" action={<ButtonLink to={`${t.base}/agenda`}>Ir para a agenda</ButtonLink>} /></>
  }
  const rec = records.find((r) => r.appointmentId === a.id)
  const tpl = rec ? findTemplate(rec.templateId, rec.templateVersion) ?? currentTemplate(t.org.segment) : currentTemplate(t.org.segment)
  const res = tpl.restricted ? 'clinical_restricted' as const : 'clinical' as const
  const isOwner = t.access.professionalId === a.professionalId
  const canWrite = isOwner && t.can(res, 'create')
  const canRead = rec ? canSeeRecord(t, rec) : t.scope(res) !== false
  if (t.scope('clinical') === false && t.scope('clinical_restricted') === false) {
    return (
      <div className="stack">
        <PageHeader title="Modo consulta" breadcrumbs={[{ label: 'Pacientes', to: `${t.base}/pacientes` }, { label: patient.name, to: `${t.base}/pacientes/${patient.id}` }, { label: 'Atendimento' }]} />
        <EmptyState title="Seu perfil não acessa conteúdo clínico" icon={<ShieldAlert aria-hidden="true" />}>O registro do atendimento é feito pelo profissional responsável ({L.pro(a.professionalId)?.name}). A recepção acompanha o status pela agenda.</EmptyState>
      </div>
    )
  }
  return <ConsultInner key={a.id} apptId={a.id} rec={rec} canWrite={canWrite} canRead={canRead} />
}

function ConsultInner({ apptId, rec, canWrite, canRead }: { apptId: string; rec?: ClinicalRecord; canWrite: boolean; canRead: boolean }) {
  const t = useTenant()
  const L = useLookup()
  const actor = useActor()
  const run = useAction()
  const toast = useToast()
  const confirm = useConfirm()
  const a = useCollection(t.tenantId, 'appointments').find((x) => x.id === apptId)!
  const patient = L.patient(a.patientId)!
  const pro = L.pro(a.professionalId)
  const tz = L.unit(a.unitId)?.timezone
  const tpl = rec ? findTemplate(rec.templateId, rec.templateVersion) ?? currentTemplate(t.org.segment) : currentTemplate(t.org.segment)
  const [initial] = useState<Draft>(() => ({ content: rec?.content ?? {}, guidance: rec?.portalGuidance ?? '', released: rec?.releasedToPortal ?? false }))
  const [draft, setDraftRaw, clearDraft] = useDraft<Draft>(`consult.${apptId}`, initial)
  const setDraft = (d: Draft) => setDraftRaw({ ...d, savedAt: new Date().toISOString() })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [finOpen, setFinOpen] = useState(false)
  const [notes, setNotes] = useState(a.notes ?? '')
  const finalized = rec?.status === 'finalizado'
  const editable = canWrite && !finalized
  const persisted = { content: rec?.content ?? {}, guidance: rec?.portalGuidance ?? '', released: rec?.releasedToPortal ?? false }
  const dirty = editable && JSON.stringify({ c: draft.content, g: draft.guidance, r: draft.released && !!draft.guidance.trim() }) !== JSON.stringify({ c: persisted.content, g: persisted.guidance, r: persisted.released })
  useConfirmLeave(dirty)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

  const patch = { content: draft.content, portalGuidance: draft.guidance.trim() || undefined, releasedToPortal: draft.released && !!draft.guidance.trim() }
  const save = (to?: 'revisado') => {
    if (to) { const e = validateRecordContent(tpl, draft.content); setErrors(e); if (Object.keys(e).length) { toast('Preencha os campos obrigatórios destacados.', 'error'); return false } }
    return run(() => {
      if (rec) saveRecord(t.tenantId, rec, patch, actor, to, tpl)
      else {
        const r = newRecord(t.tenantId, { patientId: patient.id, appointmentId: a.id, professionalId: a.professionalId, segment: t.org.segment, template: tpl, ...patch }, actor)
        if (to) saveRecord(t.tenantId, r, patch, actor, to, tpl)
      }
    }, to ? 'Registro marcado como revisado.' : 'Registro salvo.')
  }
  const start = () => run(() => changeAppointmentStatus(t.tenantId, a.id, 'em_atendimento', actor.name), 'Atendimento iniciado.')
  const openFinalize = () => {
    const e = validateRecordContent(tpl, draft.content)
    setErrors(e)
    if (Object.keys(e).length) { toast('Há campos obrigatórios ou inválidos. Revise antes de finalizar.', 'error'); return }
    setFinOpen(true)
  }
  const doFinalize = (sig: { method: 'rubrica_demo' | 'aceite_demo'; dataUrl?: string; typedName?: string }) => {
    const ok = run(() => {
      const r = rec ?? newRecord(t.tenantId, { patientId: patient.id, appointmentId: a.id, professionalId: a.professionalId, segment: t.org.segment, template: tpl, ...patch }, actor)
      const fin = finalizeRecord(t.tenantId, db.get(t.tenantId, 'records', r.id)!, patch, tpl, actor)
      db.insert(t.tenantId, 'recordSignatures', { id: uid('sig_'), tenantId: t.tenantId, createdAt: new Date().toISOString(), recordId: fin.id, signerName: pro?.name ?? actor.name, method: sig.method, typedName: sig.typedName, dataUrl: sig.dataUrl, by: actor.id })
      const cur = db.get(t.tenantId, 'appointments', a.id)!
      if (cur.status === 'chegou') changeAppointmentStatus(t.tenantId, a.id, 'em_atendimento', actor.name)
      if (db.get(t.tenantId, 'appointments', a.id)!.status === 'em_atendimento') changeAppointmentStatus(t.tenantId, a.id, 'concluida', actor.name)
    }, 'Registro finalizado e assinado (demonstração). Atendimento concluído.')
    if (ok) { clearDraft(); setFinOpen(false) }
  }
  const saveNotes = () => run(() => { db.update(t.tenantId, 'appointments', a.id, { notes: notes.trim() || undefined }); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'agendamento.notas', resource: 'appointments', resourceId: a.id }) }, 'Notas administrativas salvas.')
  const discard = async () => {
    const r = await confirm({ title: 'Descartar alterações não salvas?', body: 'O rascunho local volta ao último conteúdo salvo.', danger: true, confirmLabel: 'Descartar' })
    if (r.ok) { setDraftRaw(persisted); setErrors({}) }
  }
  const sig = useCollection(t.tenantId, 'recordSignatures').find((s) => s.recordId === rec?.id)
  const canNotes = t.can('agenda', 'update', { ownerProfessionalId: a.professionalId })

  return (
    <div className="stack" data-tour="page-content">
      <PageHeader breadcrumbs={[{ label: 'Agenda', to: `${t.base}/agenda` }, { label: patient.name, to: `${t.base}/pacientes/${patient.id}` }, { label: 'Modo consulta' }]}
        title={<>Modo consulta · {patient.socialName ?? patient.name}</>}
        subtitle={<>{formatDateTime(a.start, tz)}–{formatTime(a.end, tz)} · {L.service(a.serviceId)?.name} · {pro?.name}</>}
        actions={<span className="row"><Badge tone={a.status === 'em_atendimento' ? 'info' : a.status === 'concluida' ? 'success' : 'neutral'}>{APPOINTMENT_STATUS_LABEL[a.status]}</Badge>{rec && <RecordStatusBadge status={rec.status} addenda={rec.addenda.length} />}</span>} />
      {a.status === 'chegou' && canWrite && <Alert tone="info" title="Paciente na recepção" action={<Button variant="primary" icon={<Play />} onClick={start} data-tour="primary-action">Iniciar atendimento</Button>}>Ao iniciar, a recepção vê o status "Em atendimento".</Alert>}
      {!canWrite && <Alert tone="neutral" title="Somente leitura">{t.access.professionalId && t.access.professionalId !== a.professionalId ? 'Este atendimento pertence a outro profissional. Você só edita os seus registros.' : 'Seu perfil pode consultar, mas não registrar atendimento.'}</Alert>}
      {blocker.state === 'blocked' && (
        <Dialog open onClose={() => blocker.reset?.()} title="Sair sem salvar?" footer={<><Button onClick={() => blocker.reset?.()}>Continuar editando</Button><Button variant="danger" onClick={() => blocker.proceed?.()}>Sair (manter rascunho local)</Button></>}>
          <p>Há alterações não salvas no registro. O rascunho local permanece neste navegador até você salvar ou trocar de organização.</p>
        </Dialog>
      )}
      <div className="consult">
        <aside className="consult-side stack" aria-label="Histórico do paciente">
          <HistoryPanel patientId={patient.id} currentId={rec?.id} />
        </aside>
        <section className="consult-main stack" aria-label="Registro do atendimento">
          {!canRead ? <Alert tone="neutral">Registro deste atendimento é restrito ao profissional responsável.</Alert> : finalized && rec ? (
            <>
              <RecordCard record={rec} proName={pro?.name} />
              {sig && <p className="small muted"><FileSignature size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} /> Assinado (demonstração) por {sig.signerName} em {formatDateTime(sig.createdAt, tz)} — {sig.method === 'rubrica_demo' ? 'rubrica desenhada' : `aceite digitado: "${sig.typedName}"`}. Sem validade jurídica.</p>}
              {canWrite && <AddendumForm recId={rec.id} />}
            </>
          ) : (
            <>
              <Section title={<>{tpl.title} <span className="tiny muted">· modelo {tpl.id} v{tpl.version}{tpl.restricted ? ' · registro restrito' : ''}</span></>}
                actions={editable ? <span className="small muted" aria-live="polite">{dirty ? 'Alterações não salvas' : 'Tudo salvo'}{draft.savedAt ? ` · rascunho local ${formatTime(draft.savedAt, tz)}` : ''}</span> : undefined}>
                {tpl.note && <p className="small muted" style={{ marginBottom: 8 }}>{tpl.note}</p>}
                <RecordForm tpl={tpl} content={draft.content} onChange={(c) => { setDraft({ ...draft, content: c }); if (Object.keys(errors).length) setErrors(validateRecordContent(tpl, c)) }} errors={errors} disabled={!editable} />
              </Section>
              {editable && <DictationPanel apptId={a.id} patientId={patient.id} onAccept={(field, text) => setDraft({ ...draft, content: appendToField(draft.content, field, text) })} fieldLabel={(f) => tpl.fields.find((x) => x.id === f)?.label ?? f} />}
              <Section title="Orientações ao paciente">
                <div className="stack">
                  <Field label="Orientações (texto separado do registro clínico)" hint="Somente este texto pode ir ao portal, e apenas se marcado abaixo."><Textarea value={draft.guidance} onChange={(e) => setDraft({ ...draft, guidance: e.target.value })} rows={3} disabled={!editable} /></Field>
                  <Checkbox label="Liberar estas orientações no portal do paciente" hint={patient.sharing.portal ? 'Liberação explícita. O registro clínico em si nunca é enviado.' : 'Portal desativado no cadastro deste paciente.'} checked={draft.released} disabled={!editable || !patient.sharing.portal || !draft.guidance.trim()} onChange={(e) => setDraft({ ...draft, released: e.target.checked })} />
                </div>
              </Section>
              {editable && (
                <div className="consult-actions">
                  {dirty && <Button variant="ghost" onClick={discard}>Descartar alterações</Button>}
                  <Button icon={<Save />} onClick={() => save()} disabled={!dirty && !!rec}>Salvar rascunho</Button>
                  <Button icon={<CheckCircle2 />} onClick={() => save('revisado')} disabled={rec?.status === 'revisado' && !dirty}>Marcar como revisado</Button>
                  <Button variant="primary" icon={<FileSignature />} onClick={openFinalize}>Finalizar e assinar</Button>
                </div>
              )}
            </>
          )}
          <Section title="Notas administrativas do agendamento">
            <p className="small muted" style={{ marginBottom: 8 }}>Visíveis à recepção. Não registre informação clínica aqui.</p>
            <Field label="Notas"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={!canNotes} /></Field>
            {canNotes && <div className="form-actions"><Button size="sm" onClick={saveNotes} disabled={notes === (a.notes ?? '')}>Salvar notas</Button></div>}
          </Section>
        </section>
      </div>
      {finOpen && (
        <Dialog open onClose={() => setFinOpen(false)} title="Finalizar registro" description="Após finalizar, o registro não pode ser editado. Correções serão feitas por adendo com autor, data e motivo.">
          <div className="stack">
            <Alert tone="warning">Ao finalizar, o atendimento será marcado como concluído (pode gerar cobrança e baixa de estoque configuradas pela clínica).</Alert>
            <SignaturePad signerName={pro?.name ?? actor.name} onSign={doFinalize} />
            <p className="tiny muted">Assinatura demonstrativa: não equivale a certificado ICP-Brasil e não possui carimbo de tempo certificado.</p>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function HistoryPanel({ patientId, currentId }: { patientId: string; currentId?: string }) {
  const t = useTenant()
  const L = useLookup()
  const p = L.patient(patientId)!
  const all = useCollection(t.tenantId, 'records').filter((r) => r.patientId === patientId && r.id !== currentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const vis = all.filter((r) => canSeeRecord(t, r))
  const alerts = visibleClinicalAlerts(t, p)
  const an = useCollection(t.tenantId, 'anamneses').find((x) => x.patientId === patientId)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      <div className="card tight stack" style={{ '--gap': '6px' } as React.CSSProperties}>
        <strong>{p.name}</strong>
        <span className="small muted">{patientSubtitle(p)}</span>
        {p.kind === 'animal' && p.weights?.length ? <span className="small">Último peso: {p.weights[p.weights.length - 1].kg} kg</span> : null}
      </div>
      {alerts.length > 0 ? <Alert tone="danger" title="Alergias e alertas">{alerts.join(' · ')}</Alert> : <p className="small muted">Sem alergias/alertas registrados.</p>}
      {an && (an.problems.some((x) => x.status === 'ativo') || an.medications.length > 0) && (
        <div className="card tight small stack" style={{ '--gap': '4px' } as React.CSSProperties}>
          {an.problems.filter((x) => x.status === 'ativo').length > 0 && <div><strong>Problemas ativos:</strong> {an.problems.filter((x) => x.status === 'ativo').map((x) => x.description).join('; ')}</div>}
          {an.medications.length > 0 && <div><strong>Medicamentos:</strong> {an.medications.join('; ')}</div>}
        </div>
      )}
      <h2 className="h-sm">Registros anteriores ({vis.length})</h2>
      {all.length > vis.length && <p className="small muted">{all.length - vis.length} registro(s) restrito(s) oculto(s) para seu perfil.</p>}
      {vis.length === 0 ? <p className="small muted">Nenhum registro anterior visível.</p> : vis.slice(0, 12).map((r) => (
        <details key={r.id} open={open === r.id} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setOpen(r.id) }} className="hist-item">
          <summary><span className="grow">{formatDateTime(r.createdAt)} · {r.title}</span><RecordStatusBadge status={r.status} /></summary>
          <RecordCard record={r} proName={L.pro(r.professionalId)?.name} />
        </details>
      ))}
    </>
  )
}

function AddendumForm({ recId }: { recId: string }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const [reason, setReason] = useState('')
  const [text, setText] = useState('')
  const [err, setErr] = useState<Record<string, string>>({})
  const submit = () => {
    const e: Record<string, string> = {}
    if (!reason.trim()) e.reason = 'Informe o motivo.'
    if (!text.trim()) e.text = 'Informe o texto do adendo.'
    setErr(e)
    if (Object.keys(e).length) return
    if (run(() => addAddendum(t.tenantId, recId, reason, text, actor), 'Adendo registrado com autor, data e motivo.')) { setReason(''); setText('') }
  }
  return (
    <Section title="Registrar adendo">
      <p className="small muted" style={{ marginBottom: 8 }}>O registro finalizado não é alterado. O adendo fica anexado com seu nome, data e motivo.</p>
      <div className="stack">
        <Field label="Motivo da correção/complemento" required error={err.reason}><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Field label="Texto do adendo" required error={err.text}><Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="form-actions"><Button variant="primary" onClick={submit}>Registrar adendo</Button></div>
      </div>
    </Section>
  )
}

// ---------------- Ditado/transcrição SIMULADO ----------------
function DictationPanel({ apptId, patientId, onAccept, fieldLabel }: { apptId: string; patientId: string; onAccept: (field: string, text: string) => void; fieldLabel: (f: string) => string }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const list = useCollection(t.tenantId, 'dictations').filter((d) => d.appointmentId === apptId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const cur = list[0]
  const [consentOpen, setConsentOpen] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => {
    if (cur?.status !== 'gravando') return
    const id = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [cur?.status])
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const accept = (d: Dictation, segId: string) => {
    const s = d.segments.find((x) => x.id === segId)!
    if (run(() => decideSegment(t.tenantId, d.id, segId, true, actor), 'Trecho aceito e inserido no rascunho. Revise antes de finalizar.')) onAccept(s.field, s.text)
  }
  const delAudio = async (d: Dictation) => {
    const r = await confirm({ title: 'Excluir áudio da gravação?', body: 'A exclusão é registrada na auditoria. Trechos já aceitos permanecem no rascunho.', danger: true, confirmLabel: 'Excluir áudio' })
    if (r.ok) run(() => deleteDictationAudio(t.tenantId, d.id, actor, r.reason ?? 'Exclusão manual pelo profissional'), 'Áudio excluído.')
  }
  return (
    <Section title={<span className="row">Ditado e transcrição <SimBadge>Simulado — nenhum áudio real é gravado</SimBadge></span>}
      actions={!cur || cur.status === 'encerrado' ? <Button size="sm" icon={<Mic />} onClick={() => setConsentOpen(true)}>Nova gravação</Button> : undefined}>
      {!cur && <p className="small muted">Grave somente com autorização. A transcrição entra como sugestão para você revisar trecho a trecho; nada vira registro clínico sem sua aceitação.</p>}
      {cur && cur.status !== 'encerrado' && (
        <div className={`rec-live ${cur.status}`} role="status" aria-live="polite">
          <span className="rec-dot" aria-hidden="true" />
          <strong>{cur.status === 'gravando' ? 'GRAVANDO' : 'Gravação pausada'}</strong>
          <span className="num">{fmt(dictationElapsed(cur))}</span>
          <span className="small">· {ORIGIN_LABEL[cur.origin]} · {RETENTION_LABEL[cur.retention]}</span>
          <span className="grow" />
          {cur.status === 'gravando' ? <Button size="sm" icon={<Pause />} onClick={() => run(() => pauseDictation(t.tenantId, cur.id))}>Pausar</Button> : <Button size="sm" icon={<Play />} onClick={() => run(() => resumeDictation(t.tenantId, cur.id))}>Retomar</Button>}
          <Button size="sm" variant="danger" icon={<CircleStop />} onClick={() => run(() => stopDictation(t.tenantId, cur.id, t.org.segment, actor), 'Gravação encerrada. Transcrição simulada gerada como sugestão.')}>Encerrar</Button>
        </div>
      )}
      {cur && cur.status === 'encerrado' && (
        <div className="stack" style={{ '--gap': '10px' } as React.CSSProperties}>
          <div className="small muted">Gravação de {formatDateTime(cur.startedAt)} · {fmt(cur.elapsedSec)} · {ORIGIN_LABEL[cur.origin]} · consentimento registrado por {cur.consent.by}: "{cur.consent.statement}"</div>
          <div className="row">
            {cur.audioDeletedAt ? <Badge>Áudio excluído em {formatDateTime(cur.audioDeletedAt)} por {cur.audioDeletedBy}</Badge> : <><Badge tone="warning">Áudio retido: {RETENTION_LABEL[cur.retention]}{cur.audio?.deleteAfter ? ` (até ${formatDateTime(cur.audio.deleteAfter)})` : ''}</Badge><Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => delAudio(cur)}>Excluir áudio</Button></>}
          </div>
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, '--gap': '8px' } as React.CSSProperties} aria-label="Trechos transcritos">
            {cur.segments.map((s) => (
              <li key={s.id} className={`seg seg-${s.status}`}>
                <div className="row between">
                  <span className="row"><Badge tone={s.status === 'pendente' ? 'sim' : s.status === 'aceito' ? 'success' : 'neutral'}>{s.status === 'pendente' ? 'Sugestão — revisar' : s.status === 'aceito' ? 'Aceito' : 'Descartado'}</Badge><span className="small muted">Campo sugerido: {fieldLabel(s.field)}</span></span>
                  {s.status === 'pendente' && <span className="row"><Button size="sm" onClick={() => run(() => decideSegment(t.tenantId, cur.id, s.id, false, actor), 'Trecho descartado.')}>Descartar</Button><Button size="sm" variant="primary" onClick={() => accept(cur, s.id)}>Aceitar no campo</Button></span>}
                </div>
                <p className="pre">“{s.text}”</p>
                <span className="tiny muted">Fonte: transcrição simulada (fixture determinística){s.decidedBy ? ` · decidido por ${s.decidedBy}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {consentOpen && <ConsentDialog onClose={() => setConsentOpen(false)} onStart={(o) => { if (run(() => startDictation(t.tenantId, { appointmentId: apptId, patientId, ...o }, actor), 'Gravação (simulada) iniciada.')) setConsentOpen(false) }} />}
    </Section>
  )
}

function ConsentDialog({ onClose, onStart }: { onClose: () => void; onStart: (o: { origin: Dictation['origin']; retention: Dictation['retention']; consentStatement: string }) => void }) {
  const [ok, setOk] = useState(false)
  const [who, setWho] = useState<'paciente' | 'responsavel'>('paciente')
  const [origin, setOrigin] = useState<Dictation['origin']>('microfone_consultorio')
  const [retention, setRetention] = useState<Dictation['retention']>('apos_revisao')
  return (
    <Dialog open onClose={onClose} title="Consentimento para gravação" description="A gravação só começa após autorização explícita. Haverá aviso visível durante todo o tempo."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon={<Mic />} disabled={!ok} onClick={() => onStart({ origin, retention, consentStatement: `${who === 'paciente' ? 'Paciente' : 'Responsável'} autorizou verbalmente a gravação para fins de transcrição do atendimento.` })}>Iniciar gravação</Button></>}>
      <div className="stack">
        <SimBadge>Simulado — nenhum áudio real é capturado nesta demonstração</SimBadge>
        <Field label="Quem autorizou"><Select value={who} onChange={(e) => setWho(e.target.value as typeof who)}><option value="paciente">Paciente</option><option value="responsavel">Responsável legal / tutor</option></Select></Field>
        <Field label="Origem do áudio"><Select value={origin} onChange={(e) => setOrigin(e.target.value as Dictation['origin'])}>{Object.entries(ORIGIN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Retenção do áudio" hint="A transcrição aceita fica no registro; o áudio segue esta política."><Select value={retention} onChange={(e) => setRetention(e.target.value as Dictation['retention'])}>{Object.entries(RETENTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Checkbox label="Confirmo que expliquei a finalidade e obtive autorização para gravar" checked={ok} onChange={(e) => setOk(e.target.checked)} />
      </div>
    </Dialog>
  )
}
