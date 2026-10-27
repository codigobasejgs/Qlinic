// Lista de espera: entradas, vagas liberadas, oferta temporária, disputa simulada e expiração.
import { useEffect, useState, type CSSProperties } from 'react'
import { ListPlus, Timer } from 'lucide-react'
import type { ID, WaitlistEntry } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit } from '@/data/repositories'
import { acceptOffer, expireOffers, matchWaitlist, offerSlot, OFFER_TTL_MIN } from '@/domain/waitlist'
import { formatDateTime, hhmmToMinutes, nowISO } from '@/lib/dates'
import { uid } from '@/lib/util'
import { Alert, Badge, Button, Checkbox, Dialog, EmptyState, Field, Input, PageHeader, PatientPicker, Section, Select, SimBadge, Textarea, useAction, useConfirm, useLookup, useToast } from '@/ui'
import type { FreedSlot } from './effects'
import { WEEKDAY_LONG, WEEKDAY_SHORT, fmtCountdown, hhmm, scopeUnitIds, useNow } from './lib'

const WL_STATUS: Record<WaitlistEntry['status'], string> = { aguardando: 'Aguardando', ofertado: 'Oferta enviada', aceito: 'Aceito', expirado: 'Expirado', removido: 'Removido' }

export function WaitlistPage() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const toast = useToast()
  const L = useLookup()
  const list = useCollection(t.tenantId, 'waitlist')
  const freed = useCollection(t.tenantId, 'freedSlots')
  const now = useNow(1000)
  const [adding, setAdding] = useState(false)
  const [offerFor, setOfferFor] = useState<FreedSlot | null>(null)
  const unitIds = scopeUnitIds(t)
  const canEdit = t.can('agenda', 'update')
  const active = list.filter((w) => unitIds.includes(w.unitId) && ['aguardando', 'ofertado'].includes(w.status))
    .sort((a, b) => (a.priority === b.priority ? a.createdAt.localeCompare(b.createdAt) : a.priority === 'alta' ? -1 : 1))
  const slots = freed.filter((f) => unitIds.includes(f.unitId) && ['livre', 'ofertado'].includes(f.status) && new Date(f.start).getTime() > now).sort((a, b) => a.start.localeCompare(b.start))
  const hasExpired = list.some((w) => w.status === 'ofertado' && w.offer && new Date(w.offer.expiresAt).getTime() < now)

  // Ofertas vencidas voltam para a fila automaticamente enquanto a página está aberta.
  useEffect(() => { if (hasExpired) expireOffers(t.tenantId) }, [hasExpired, t.tenantId])
  // Vaga "ofertada" sem nenhuma oferta ativa (expirou/devolvida) volta a "livre".
  const stale = freed.filter((f) => f.status === 'ofertado' && !list.some((w) => w.status === 'ofertado' && w.offer?.appointmentSlot.start === f.start && w.offer.appointmentSlot.professionalId === f.professionalId)).map((f) => f.id)
  useEffect(() => { stale.forEach((id) => db.update(t.tenantId, 'freedSlots', id, { status: 'livre' })) }, [stale.join(), t.tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (w: WaitlistEntry) => {
    const r = await confirm({ title: 'Remover da lista de espera?', requireReason: true, confirmLabel: 'Remover', danger: true })
    if (r.ok) run(() => { db.update(t.tenantId, 'waitlist', w.id, { status: 'removido', notes: `${w.notes ? `${w.notes} · ` : ''}Removido: ${r.reason}`, offer: undefined }); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'lista_espera.removido', resource: 'waitlist', resourceId: w.id, detail: r.reason }) }, 'Removido da lista de espera.')
  }
  const accept = (w: WaitlistEntry) => {
    const name = L.patient(w.patientId)?.name
    run(() => {
      const a = acceptOffer(t.tenantId, w.id, `${name} (aceite simulado)`)
      const slot = freed.find((f) => f.status === 'ofertado' && f.start === w.offer?.appointmentSlot.start && f.professionalId === w.offer.appointmentSlot.professionalId)
      if (slot) db.update(t.tenantId, 'freedSlots', slot.id, { status: 'preenchido', filledAppointmentId: a.id })
    }, `${name} aceitou: agendamento confirmado.`)
  }
  /** Dois aceites "simultâneos": o 2º pedido foi emitido enquanto a oferta ainda estava ativa (snapshot) e chega depois do 1º. */
  const dispute = (a: WaitlistEntry, b: WaitlistEntry) => {
    const snapshot = { status: b.status, offer: b.offer }
    accept(a)
    try {
      if (db.get(t.tenantId, 'waitlist', b.id)?.status !== 'ofertado') db.update(t.tenantId, 'waitlist', b.id, snapshot)
      acceptOffer(t.tenantId, b.id, `${L.patient(b.patientId)?.name} (aceite simulado)`)
    } catch (e) {
      toast(`${L.patient(b.patientId)?.name}: ${e instanceof Error ? e.message.replace(/\s*\(.*\)$/, '') : String(e)}`, 'error')
    }
  }
  const tz = t.unit?.timezone ?? t.org.timezone

  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Lista de espera" subtitle="Ofertas temporárias para vagas liberadas por cancelamento."
        actions={canEdit ? <Button variant="primary" icon={<ListPlus />} data-tour="primary-action" onClick={() => setAdding(true)}>Adicionar à lista</Button> : undefined} />
      <Alert tone="info" title="Disputa por vaga (demonstração)">A primeira confirmação válida vence; a segunda recebe aviso de vaga ocupada e permanece na lista. A reserva definitiva, em produção, exige transação no servidor (bloqueio da vaga) — aqui é simulação local.</Alert>

      <Section title={`Vagas liberadas (${slots.length})`} id="vagas">
        {slots.length === 0 ? <p className="small muted">Nenhuma vaga futura liberada. Cancelamentos futuros na agenda aparecem aqui.</p> : slots.map((f) => {
          const matches = matchWaitlist(t.tenantId, { start: f.start, end: f.end, professionalId: f.professionalId, unitId: f.unitId, serviceId: f.serviceId })
          const offered = list.filter((w) => w.status === 'ofertado' && w.offer?.appointmentSlot.start === f.start && w.offer.appointmentSlot.professionalId === f.professionalId)
          return (
            <div key={f.id} className="queue-row">
              <div className="stack" style={{ '--gap': '2px' } as CSSProperties}>
                <span className="strong">{formatDateTime(f.start, tz)} · {L.pro(f.professionalId)?.name}</span>
                <span className="queue-meta"><span>{Math.round((new Date(f.end).getTime() - new Date(f.start).getTime()) / 60000)} min</span>{unitIds.length > 1 && <span>{L.unit(f.unitId)?.name}</span>}{f.reason && <span>{f.reason}</span>}<span>{matches.length} compatível(is)</span>{offered.length > 0 && <span>{offered.length} oferta(s) ativa(s)</span>}</span>
              </div>
              <div className="row">
                <Badge tone={f.status === 'ofertado' ? 'warning' : 'info'}>{f.status === 'ofertado' ? 'Ofertada' : 'Livre'}</Badge>
                {canEdit && offered.length >= 2 && <Button size="sm" variant="primary" onClick={() => dispute(offered[0], offered[1])}>Simular 2 aceites simultâneos</Button>}
                {canEdit && <Button size="sm" onClick={() => setOfferFor(f)} disabled={!matches.length}>Ofertar</Button>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => run(() => db.update(t.tenantId, 'freedSlots', f.id, { status: 'descartado' }), 'Vaga descartada.')}>Descartar</Button>}
              </div>
            </div>
          )
        })}
      </Section>

      <Section title={`Na lista (${active.length})`} id="lista" actions={canEdit ? <Button size="sm" icon={<Timer />} onClick={() => run(() => expireOffers(t.tenantId), 'Ofertas expiradas devolvidas à fila.')}>Expirar ofertas vencidas</Button> : undefined}>
        {active.length === 0 ? <EmptyState title="Lista de espera vazia" /> : active.map((w) => {
          const offer = w.status === 'ofertado' ? w.offer : undefined
          return (
            <div key={w.id} className="queue-row">
              <div className="stack" style={{ '--gap': '2px' } as CSSProperties}>
                <span className="strong">{L.patient(w.patientId)?.name} {w.priority === 'alta' && <Badge tone="danger">Prioridade alta</Badge>}</span>
                <span className="queue-meta">
                  <span>{L.service(w.serviceId)?.name} · {w.durationMin} min</span>
                  {w.professionalId && <span>Com {L.pro(w.professionalId)?.name}</span>}
                  <span>Disponível: {w.availability.map((a) => `${WEEKDAY_SHORT[a.weekday]} ${hhmm(a.start)}–${hhmm(a.end)}`).join(', ')}</span>
                  {w.notes && <span>{w.notes}</span>}
                </span>
                {offer && <span className="small" aria-live="polite">Oferta: {formatDateTime(offer.appointmentSlot.start, tz)} — expira em <span className="countdown">{fmtCountdown(offer.expiresAt, now)}</span></span>}
              </div>
              <div className="row">
                <Badge tone={w.status === 'ofertado' ? 'warning' : 'neutral'}>{WL_STATUS[w.status]}</Badge>
                {offer && canEdit && <Button size="sm" variant="primary" onClick={() => accept(w)}>Simular aceite</Button>}
                {offer && canEdit && <Button size="sm" variant="ghost" onClick={() => run(() => db.update(t.tenantId, 'waitlist', w.id, (p) => ({ ...p, offer: p.offer && { ...p.offer, expiresAt: nowISO() } })), 'Oferta marcada como vencida.')}>Vencer agora</Button>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => remove(w)}>Remover</Button>}
              </div>
            </div>
          )
        })}
      </Section>
      {adding && <AddEntryDialog onClose={() => setAdding(false)} />}
      {offerFor && <OfferDialog slot={offerFor} onClose={() => setOfferFor(null)} />}
    </div>
  )
}

function OfferDialog({ slot, onClose }: { slot: FreedSlot; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const L = useLookup()
  const matches = matchWaitlist(t.tenantId, { start: slot.start, end: slot.end, professionalId: slot.professionalId, unitId: slot.unitId, serviceId: slot.serviceId })
  const [sel, setSel] = useState<ID[]>(() => matches.slice(0, 2).map((m) => m.id))
  const send = () => {
    if (!sel.length) return
    if (run(() => {
      offerSlot(t.tenantId, sel, { start: slot.start, end: slot.end, professionalId: slot.professionalId, resourceIds: slot.resourceIds }, actor.name)
      db.update(t.tenantId, 'freedSlots', slot.id, { status: 'ofertado' })
    }, `Oferta enviada a ${sel.length} pessoa(s) — expira em ${OFFER_TTL_MIN} min.`)) onClose()
  }
  return (
    <Dialog open onClose={onClose} title="Ofertar vaga" description={`${formatDateTime(slot.start, t.unit?.timezone)} · ${L.pro(slot.professionalId)?.name}`}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!sel.length} onClick={send}>Enviar oferta ({sel.length})</Button></>}>
      <div className="stack">
        <SimBadge />
        <p className="small muted">Selecione duas ou mais pessoas para simular a disputa. A oferta é temporária ({OFFER_TTL_MIN} min) e não é reserva até a confirmação.</p>
        {matches.length === 0 ? <p className="small">Ninguém compatível aguardando (disponibilidade, duração ou profissional).</p> : matches.map((w) => (
          <Checkbox key={w.id} checked={sel.includes(w.id)} onChange={(e) => setSel(e.target.checked ? [...sel, w.id] : sel.filter((x) => x !== w.id))}
            label={`${L.patient(w.patientId)?.name}${w.priority === 'alta' ? ' (prioridade alta)' : ''}`} hint={`${L.service(w.serviceId)?.name} · ${w.durationMin} min`} />
        ))}
      </div>
    </Dialog>
  )
}

function AddEntryDialog({ onClose }: { onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const toast = useToast()
  const L = useLookup()
  const [patientId, setPatientId] = useState<ID | null>(null)
  const services = L.services.filter((s) => s.active)
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '')
  const [proId, setProId] = useState('')
  const [unitId, setUnitId] = useState(t.unitId ?? t.allowedUnits[0]?.id ?? '')
  const [dur, setDur] = useState(services[0]?.durationMin ?? 30)
  const [priority, setPriority] = useState<'normal' | 'alta'>('normal')
  const [notes, setNotes] = useState('')
  const [days, setDays] = useState<number[]>([1, 3])
  const [from, setFrom] = useState('08:00')
  const [to, setTo] = useState('12:00')
  const save = () => {
    if (!patientId) return toast('Selecione o paciente.', 'error')
    if (!days.length) return toast('Escolha ao menos um dia da semana.', 'error')
    const s = hhmmToMinutes(from), e = hhmmToMinutes(to)
    if (!(e - s >= dur)) return toast('A janela de disponibilidade precisa comportar a duração.', 'error')
    const entry: WaitlistEntry = { id: uid('wl_'), tenantId: t.tenantId, createdAt: nowISO(), unitId, patientId, serviceId, professionalId: proId || undefined, durationMin: dur, availability: days.map((weekday) => ({ weekday, start: s, end: e })), priority, notes: notes.trim() || undefined, status: 'aguardando' }
    db.insert(t.tenantId, 'waitlist', entry)
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'lista_espera.adicionado', resource: 'waitlist', resourceId: entry.id, unitId })
    toast('Adicionado à lista de espera.')
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title="Adicionar à lista de espera" size="lg" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Adicionar</Button></>}>
      <div className="stack">
        <div className="form-grid">
          <PatientPicker value={patientId} onChange={setPatientId} required />
          {t.allowedUnits.length > 1 && <Field label="Unidade"><Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>{t.allowedUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
          <Field label="Serviço"><Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setDur(L.service(e.target.value)?.durationMin ?? dur) }}>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Duração (min)"><Input type="number" min={5} step={5} value={dur} onChange={(e) => setDur(Math.max(5, Number(e.target.value) || 5))} /></Field>
          <Field label="Profissional (opcional)"><Select value={proId} onChange={(e) => setProId(e.target.value)}><option value="">Qualquer</option>{L.pros.filter((p) => p.unitIds.includes(unitId)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Prioridade operacional"><Select value={priority} onChange={(e) => setPriority(e.target.value as 'normal' | 'alta')}><option value="normal">Normal</option><option value="alta">Alta</option></Select></Field>
        </div>
        <fieldset>
          <legend>Disponibilidade declarada</legend>
          <div className="row" role="group" aria-label="Dias da semana">
            {[1, 2, 3, 4, 5, 6].map((d) => <button key={d} type="button" className="chip" aria-pressed={days.includes(d)} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort())}>{WEEKDAY_LONG[d]}</button>)}
          </div>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <Field label="Das"><Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Até"><Input type="time" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        </fieldset>
        <Field label="Observações operacionais" hint="Sem informação clínica."><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Dialog>
  )
}
