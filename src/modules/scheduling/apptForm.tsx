// Diálogos de agendamento: criar/editar/reagendar (com recorrência e série) e detalhe (status, histórico, check-in).
import { useState } from 'react'
import { CalendarClock, QrCode, Stethoscope } from 'lucide-react'
import type { Appointment, AppointmentStatus, ID } from '@/domain/types'
import { APPOINTMENT_STATUS_LABEL } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit } from '@/data/repositories'
import { changeAppointmentStatus, createAppointment, issueCheckInToken, rescheduleAppointment, validateAppointment, type CreateAppointmentInput } from '@/domain/appointments'
import { TRANSITIONS, weeklyRecurrence, type Conflict } from '@/domain/scheduling'
import { getPolicies } from '@/domain/settings'
import { visibleClinicalAlerts } from '@/domain/access'
import { addMinutes, formatDateTime, formatCivil, hhmmToMinutes, zonedParts, zonedToInstant, type CivilDate } from '@/lib/dates'
import { uid } from '@/lib/util'
import { Alert, Badge, Button, ButtonLink, DescList, Dialog, Field, Input, PatientPicker, Select, Textarea, Timeline, useAction, useConfirm, useLookup, useToast } from '@/ui'
import { QRCode } from './qr'
import { FIN_LABEL, FIN_TONE, STATUS_TONE, fmtCountdown, hhmm, today, useNow } from './lib'

const FINAL: AppointmentStatus[] = ['concluida', 'faltou', 'cancelada', 'em_atendimento']

export interface FormInit { date?: CivilDate; minutes?: number; professionalId?: ID; resourceId?: ID; unitId?: ID; serviceId?: ID; patientId?: ID }

interface Check { label: string; id?: ID; input: CreateAppointmentInput; conflicts: Conflict[] }

export function ConflictList({ checks, canApprove }: { checks: Check[]; canApprove: boolean }) {
  const bad = checks.filter((c) => c.conflicts.length)
  return (
    <div aria-live="polite">
      {bad.length === 0 ? (
        <Alert tone="success" title="Sem conflitos">{checks.length > 1 ? `${checks.length} ocorrências validadas.` : 'Horário validado: profissional, recurso, funcionamento, feriado e ausências.'}</Alert>
      ) : (
        <Alert tone="warning" title={`${bad.reduce((n, c) => n + c.conflicts.length, 0)} conflito(s) encontrado(s)`}>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {bad.flatMap((c, i) => c.conflicts.map((x, j) => (
              <li key={`${i}-${j}`}>{checks.length > 1 && <strong>{c.label}: </strong>}{x.message}</li>
            )))}
          </ul>
          <p className="small" style={{ marginTop: 6 }}>{canApprove ? 'Como gestor, você pode autorizar o encaixe com conflito (fica registrado).' : 'Escolha outro horário. Somente a gestão pode autorizar encaixe com conflito.'}</p>
        </Alert>
      )}
    </div>
  )
}

export function AppointmentFormDialog({ init = {}, editing, onClose }: { init?: FormInit; editing?: Appointment; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const toast = useToast()
  const confirm = useConfirm()
  const run = useAction()
  const L = useLookup()
  const appts = useCollection(t.tenantId, 'appointments')
  const [unitId, setUnitId] = useState<ID>(editing?.unitId ?? init.unitId ?? t.unitId ?? t.allowedUnits[0]?.id ?? '')
  const unit = t.allowedUnits.find((u) => u.id === unitId)
  const tz = unit?.timezone ?? t.org.timezone
  const sp = editing ? zonedParts(editing.start, tz) : null
  const services = L.services.filter((s) => s.active)
  const [patientId, setPatientId] = useState<ID | null>(editing?.patientId ?? init.patientId ?? null)
  const [serviceId, setServiceId] = useState<ID>(editing?.serviceId ?? init.serviceId ?? services[0]?.id ?? '')
  const service = L.service(serviceId)
  const pros = L.pros.filter((p) => p.active && p.unitIds.includes(unitId))
  const [proId, setProId] = useState<ID>(init.professionalId ?? editing?.professionalId ?? '')
  const pro = pros.find((p) => p.id === proId) ?? (editing ? undefined : pros[0])
  const [date, setDate] = useState<CivilDate>(init.date ?? sp?.date ?? today(tz))
  const [time, setTime] = useState(hhmm(init.minutes ?? sp?.minutesOfDay ?? 9 * 60))
  const [dur, setDur] = useState(editing ? Math.round((new Date(editing.end).getTime() - new Date(editing.start).getTime()) / 60000) : service?.durationMin ?? 30)
  const [resSel, setResSel] = useState<Record<string, ID>>(() => {
    const r: Record<string, ID> = {}
    for (const id of editing?.resourceIds ?? []) { const x = L.resource(id); if (x) r[x.kind] = id }
    const ir = init.resourceId ? L.resource(init.resourceId) : undefined
    if (ir) r[ir.kind] = ir.id
    return r
  })
  const requireConfirm = getPolicies(t.tenantId, unitId).booking.requireConfirmation
  const [status, setStatus] = useState<AppointmentStatus>(requireConfirm ? 'aguardando_confirmacao' : 'confirmada')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [count, setCount] = useState(1)
  const [every, setEvery] = useState(1)
  const [scope, setScope] = useState<'one' | 'following'>('one')
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)

  const unitRes = L.resources.filter((r) => r.unitId === unitId && r.active)
  const kinds = service?.resourceKinds ?? []
  const minutes = /^\d{2}:\d{2}$/.test(time) ? hhmmToMinutes(time) : 0
  const start = date ? zonedToInstant(date, minutes, tz) : ''
  const baseInput = (resourceIds: ID[], s = start, e = start && addMinutes(start, dur)): CreateAppointmentInput => ({
    unitId, patientId: patientId ?? editing?.patientId ?? '', professionalId: pro?.id ?? '', serviceId, resourceIds, start: s, end: e, status, source: 'recepcao', notes: notes.trim() || undefined,
  })
  // ponytail: validação recalculada a cada render (≤52 ocorrências × poucas centenas de agendamentos); memoizar se a demo crescer.
  const resourceIds = kinds.map((k) => {
    const chosen = resSel[k]
    if (chosen && unitRes.some((r) => r.id === chosen && r.kind === k)) return chosen
    const cands = unitRes.filter((r) => r.kind === k)
    if (!start || !pro) return cands[0]?.id
    return (cands.find((r) => !validateAppointment(t.tenantId, baseInput([r.id]), editing?.id).some((c) => c.kind === 'recurso' || c.kind === 'recurso_bloqueado')) ?? cands[0])?.id
  }).filter((x): x is ID => !!x)

  const series = editing?.seriesId ? appts.filter((a) => a.seriesId === editing.seriesId && a.start >= editing.start && !FINAL.includes(a.status)).sort((a, b) => a.start.localeCompare(b.start)) : []
  const buildChecks = (): Check[] => {
    if (!start || !pro || !service) return []
    if (!editing) {
      return weeklyRecurrence(date, Math.max(1, Math.min(52, count)), Math.max(1, Math.min(8, every))).map((d) => {
        const s = zonedToInstant(d, minutes, tz)
        const input = baseInput(resourceIds, s, addMinutes(s, dur))
        return { label: formatCivil(d), input, conflicts: validateAppointment(t.tenantId, input) }
      })
    }
    const targets = scope === 'following' && series.length ? series : [editing]
    const delta = new Date(start).getTime() - new Date(editing.start).getTime()
    return targets.map((a) => {
      const s = a.id === editing.id ? start : new Date(new Date(a.start).getTime() + delta).toISOString()
      const len = a.id === editing.id ? dur : (new Date(a.end).getTime() - new Date(a.start).getTime()) / 60000
      const input = { ...baseInput(resourceIds, s, addMinutes(s, len)), patientId: a.patientId, serviceId: a.serviceId }
      return { label: formatDateTime(s, tz), id: a.id, input, conflicts: validateAppointment(t.tenantId, input, a.id) }
    })
  }
  const checks = buildChecks()

  const canApprove = t.can('agenda', 'approve', { unitId })
  const anyConflict = checks.some((c) => c.conflicts.length)
  const changed = !!editing && (start !== editing.start || dur * 60000 !== new Date(editing.end).getTime() - new Date(editing.start).getTime() || pro?.id !== editing.professionalId || resourceIds.join() !== editing.resourceIds.join() || unitId !== editing.unitId)

  const submit = async () => {
    setTried(true)
    if (!editing && !patientId) return toast('Selecione o paciente.', 'error')
    if (!pro || !service || !start) return toast('Preencha profissional, serviço, data e horário.', 'error')
    if (editing && changed && !reason.trim()) return toast('Informe o motivo do reagendamento.', 'error')
    if (editing && !changed) {
      if ((editing.notes ?? '') === notes.trim()) return onClose()
      if (run(() => { db.update(t.tenantId, 'appointments', editing.id, { notes: notes.trim() || undefined }); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'agendamento.observacao', resource: 'appointments', resourceId: editing.id, unitId }) }, 'Observações salvas.')) onClose()
      return
    }
    let ack = false
    if (anyConflict) {
      if (!canApprove) return toast('Há conflitos no horário. Ajuste antes de salvar.', 'error')
      const r = await confirm({ title: 'Autorizar encaixe com conflito?', body: 'O agendamento será salvo apesar dos conflitos listados. A autorização fica registrada na auditoria.', confirmLabel: 'Autorizar encaixe', danger: true })
      if (!r.ok) return
      ack = true
    }
    const ok = run(() => {
      if (!editing) {
        const seriesId = checks.length > 1 ? uid('ser_') : undefined
        for (const c of checks) createAppointment(t.tenantId, { ...c.input, seriesId, acknowledgeConflicts: ack }, actor.name)
      } else {
        for (const c of checks) rescheduleAppointment(t.tenantId, c.id!, { start: c.input.start, end: c.input.end, professionalId: c.input.professionalId, resourceIds: c.input.resourceIds, unitId }, actor.name, reason.trim(), ack)
        if ((editing.notes ?? '') !== notes.trim()) db.update(t.tenantId, 'appointments', editing.id, { notes: notes.trim() || undefined })
      }
    }, editing ? (checks.length > 1 ? `${checks.length} ocorrências reagendadas.` : 'Agendamento reagendado.') : checks.length > 1 ? `Série criada com ${checks.length} ocorrências.` : 'Agendamento criado.')
    if (ok) onClose()
  }

  return (
    <Dialog open onClose={onClose} size="lg" title={editing ? 'Editar / reagendar' : 'Novo agendamento'}
      description={`Horários no fuso da unidade (${tz}).`}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>{editing ? 'Salvar alterações' : checks.length > 1 ? `Criar ${checks.length} agendamentos` : 'Criar agendamento'}</Button></>}>
      <div className="stack">
        <div className="form-grid">
          {t.allowedUnits.length > 1 && (
            <Field label="Unidade" required>
              <Select value={unitId} onChange={(e) => { setUnitId(e.target.value); setResSel({}) }}>{t.allowedUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
            </Field>
          )}
          {editing ? (
            <Field label="Paciente"><Input readOnly value={L.patient(editing.patientId)?.name ?? '—'} /></Field>
          ) : (
            <PatientPicker value={patientId} onChange={setPatientId} required error={tried && !patientId ? 'Selecione o paciente.' : null} />
          )}
          <Field label="Serviço" required>
            <Select value={serviceId} disabled={!!editing} onChange={(e) => { setServiceId(e.target.value); const s = L.service(e.target.value); if (s) setDur(s.durationMin) }}>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMin} min)</option>)}
            </Select>
          </Field>
          <Field label="Profissional" required error={pros.length === 0 ? 'Nenhum profissional atende nesta unidade.' : null}>
            <Select value={pro?.id ?? ''} onChange={(e) => setProId(e.target.value)}>
              {!pro && <option value="">Selecione</option>}
              {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Data" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Início" required><Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Duração (min)" hint={service ? `Serviço: ${service.durationMin} min + intervalo ${service.bufferMin} min` : undefined}>
            <Input type="number" min={5} step={5} value={dur} onChange={(e) => setDur(Math.max(5, Number(e.target.value) || 0))} />
          </Field>
          {kinds.map((k) => (
            <Field key={k} label={`Recurso (${k})`} required>
              <Select value={resourceIds[kinds.indexOf(k)] ?? ''} onChange={(e) => setResSel({ ...resSel, [k]: e.target.value })}>
                {unitRes.filter((r) => r.kind === k).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
          ))}
          {!editing && (
            <Field label="Status inicial">
              <Select value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus)}>
                <option value="aguardando_confirmacao">Aguardando confirmação</option>
                <option value="confirmada">Confirmada</option>
                <option value="solicitada">Solicitada</option>
              </Select>
            </Field>
          )}
        </div>
        {!editing && (
          <fieldset>
            <legend>Recorrência semanal</legend>
            <div className="form-grid">
              <Field label="Número de ocorrências" hint="1 = sem recorrência (máx. 52)"><Input type="number" min={1} max={52} value={count} onChange={(e) => setCount(Math.max(1, Math.min(52, Number(e.target.value) || 1)))} /></Field>
              <Field label="A cada (semanas)"><Input type="number" min={1} max={8} value={every} onChange={(e) => setEvery(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} /></Field>
            </div>
          </fieldset>
        )}
        {editing?.seriesId && series.length > 1 && (
          <fieldset>
            <legend>Este agendamento faz parte de uma série</legend>
            <div className="segmented" role="radiogroup" aria-label="Aplicar alteração a">
              <button type="button" role="radio" aria-checked={scope === 'one'} aria-pressed={scope === 'one'} onClick={() => setScope('one')}>Somente esta</button>
              <button type="button" role="radio" aria-checked={scope === 'following'} aria-pressed={scope === 'following'} onClick={() => setScope('following')}>Esta e as seguintes ({series.length})</button>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>Cada ocorrência é revalidada individualmente; conflitos aparecem abaixo por data.</p>
          </fieldset>
        )}
        {editing && changed && (
          <Field label="Motivo do reagendamento" required error={tried && !reason.trim() ? 'Obrigatório para reagendar.' : null}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: pedido do paciente" />
          </Field>
        )}
        <Field label="Observações administrativas" hint="Não registre informação clínica aqui.">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {checks.length > 0 && <ConflictList checks={checks} canApprove={canApprove} />}
      </div>
    </Dialog>
  )
}

const VERB: Partial<Record<AppointmentStatus, string>> = {
  confirmada: 'Confirmar', aguardando_confirmacao: 'Voltar a aguardar confirmação', chegou: 'Registrar chegada', em_atendimento: 'Iniciar atendimento',
  concluida: 'Concluir', faltou: 'Marcar falta', cancelada: 'Cancelar…',
}

export function AppointmentDetailDialog({ id, onClose, onEdit }: { id: ID; onClose: () => void; onEdit: (a: Appointment) => void }) {
  const t = useTenant()
  const actor = useActor()
  const confirm = useConfirm()
  const run = useAction()
  const L = useLookup()
  const appts = useCollection(t.tenantId, 'appointments')
  const now = useNow(1000)
  const a = appts.find((x) => x.id === id)
  if (!a) return null
  const unit = L.unit(a.unitId)
  const tz = unit?.timezone ?? t.org.timezone
  const pat = L.patient(a.patientId)
  const canEdit = t.can('agenda', 'update', { unitId: a.unitId, ownerProfessionalId: a.professionalId })
  const alerts = pat ? visibleClinicalAlerts(t, pat) : []
  const ck = a.checkIn && !a.checkIn.usedAt && new Date(a.checkIn.expiresAt).getTime() > now ? a.checkIn : null

  const go = async (to: AppointmentStatus) => {
    let reason: string | undefined
    if (to === 'cancelada') {
      const r = await confirm({ title: 'Cancelar agendamento?', body: 'A vaga liberada (se futura) aparecerá na Lista de espera para oferta.', requireReason: true, reasonLabel: 'Motivo do cancelamento', confirmLabel: 'Cancelar agendamento', danger: true })
      if (!r.ok) return
      reason = r.reason
    } else if (to === 'faltou') {
      const r = await confirm({ title: 'Registrar falta?', body: 'Estado final: não poderá ser revertido.', confirmLabel: 'Registrar falta', danger: true })
      if (!r.ok) return
    }
    run(() => changeAppointmentStatus(t.tenantId, a.id, to, actor.name, reason), `Status: ${APPOINTMENT_STATUS_LABEL[to]}.`)
  }

  return (
    <Dialog open onClose={onClose} drawer size="lg" title={pat?.name ?? 'Agendamento'} description={`${formatDateTime(a.start, tz)} – ${formatDateTime(a.end, tz).slice(-5)} · ${unit?.name ?? ''}`}
      footer={<>
        {canEdit && !FINAL.includes(a.status) && <Button icon={<CalendarClock />} onClick={() => onEdit(a)}>Editar / reagendar</Button>}
        <Button variant="primary" onClick={onClose}>Fechar</Button>
      </>}>
      <div className="stack">
        <div className="row">
          <Badge tone={STATUS_TONE[a.status]}>{APPOINTMENT_STATUS_LABEL[a.status]}</Badge>
          <Badge tone={FIN_TONE[a.financialStatus]} title="Status financeiro (separado do agendamento)">Financeiro: {FIN_LABEL[a.financialStatus]}</Badge>
          {a.conflictAcknowledged && <Badge tone="warning">Encaixe autorizado</Badge>}
          {a.seriesId && <Badge tone="info">Recorrente</Badge>}
        </div>
        {alerts.length > 0 && <Alert tone="danger" title="Alertas clínicos">{alerts.join(' · ')}</Alert>}
        <DescList items={[
          ['Profissional', L.pro(a.professionalId)?.name],
          ['Serviço', L.service(a.serviceId)?.name],
          ['Recursos', a.resourceIds.map((r) => L.resource(r)?.name).join(', ') || '—'],
          ['Origem', a.source],
          ['Senha', a.checkIn?.ticket ?? '—'],
          ['Observações', a.notes ?? '—'],
        ]} />
        <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties} aria-label="Ações de status">
          <h3>Mudar status</h3>
          {!canEdit ? <p className="small muted">Seu perfil só pode alterar agendamentos próprios.</p> : TRANSITIONS[a.status].length === 0 ? <p className="small muted">Estado final — sem transições.</p> : (
            <div className="row">
              {TRANSITIONS[a.status].map((to) => (
                <Button key={to} size="sm" variant={to === 'cancelada' || to === 'faltou' ? 'danger' : 'secondary'} onClick={() => go(to)}>
                  {a.status === 'chegou' && to === 'confirmada' ? 'Desfazer chegada' : VERB[to]}
                </Button>
              ))}
            </div>
          )}
          {(a.status === 'chegou' || a.status === 'em_atendimento') && t.scope('clinical') !== false && (
            <ButtonLink to={`${t.base}/atendimento/${a.id}`} size="sm" icon={<Stethoscope />}>Abrir atendimento</ButtonLink>
          )}
        </section>
        {(a.status === 'confirmada' || a.status === 'aguardando_confirmacao') && t.can('recepcao', 'update', { unitId: a.unitId }) && (
          <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties} aria-label="Check-in">
            <h3>Check-in por QR</h3>
            {ck ? (
              <div className="row" style={{ alignItems: 'flex-start', '--gap': '16px' } as React.CSSProperties}>
                <QRCode value={ck.token} size={168} label={`QR de check-in, código ${ck.token}`} />
                <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}>
                  <span className="small muted">Código</span>
                  <span className="mono strong" style={{ fontSize: 22, letterSpacing: '0.1em' }}>{ck.token}</span>
                  <span className="small" aria-live="polite">Expira em {fmtCountdown(ck.expiresAt, now)} ({formatDateTime(ck.expiresAt, tz).slice(-5)})</span>
                  <span className="small muted">O QR contém apenas este código opaco — nenhum dado clínico.</span>
                  <ButtonLink to={`/c/${t.org.slug}/totem`} size="sm" target="_blank" rel="noopener">Abrir totem</ButtonLink>
                </div>
              </div>
            ) : (
              <div className="row">
                <Button size="sm" icon={<QrCode />} onClick={() => run(() => issueCheckInToken(t.tenantId, a.id), 'Código de check-in gerado (10 min).')}>{a.checkIn ? 'Gerar novo código' : 'Gerar código de check-in'}</Button>
                {a.checkIn?.usedAt && <span className="small muted">Código anterior já utilizado.</span>}
                {a.checkIn && !a.checkIn.usedAt && <span className="small muted">Código anterior expirado.</span>}
              </div>
            )}
          </section>
        )}
        <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <h3>Histórico</h3>
          <Timeline items={[...a.history].reverse().map((h) => ({ time: formatDateTime(h.at, tz), title: h.from && h.from !== h.to ? `${APPOINTMENT_STATUS_LABEL[h.from]} → ${APPOINTMENT_STATUS_LABEL[h.to]}` : h.from ? APPOINTMENT_STATUS_LABEL[h.to] : `Criado como ${APPOINTMENT_STATUS_LABEL[h.to]}`, body: `${h.by}${h.reason ? ` · ${h.reason}` : ''}` }))} />
        </section>
      </div>
    </Dialog>
  )
}
