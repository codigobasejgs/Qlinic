// Agenda: dia/semana/mês/lista, filtros, grade no fuso da unidade, disponibilidade calculada.
import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import { useSearchParams } from 'react-router'
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Appointment, ID, Professional, Resource, Unit } from '@/domain/types'
import { APPOINTMENT_STATUS_LABEL } from '@/domain/types'
import { useTenant } from '@/app/session'
import { useCollection } from '@/data/store'
import { availableSlots } from '@/domain/scheduling'
import { addDaysCivil, civilWeekday, formatCivilLong, formatTime, zonedParts, type CivilDate } from '@/lib/dates'
import { Alert, Badge, Button, Checkbox, EmptyState, Field, Input, PageHeader, Section, Segmented, Select, useLookup } from '@/ui'
import { useMediaQuery } from '@/ui/brand'
import { AppointmentDetailDialog, AppointmentFormDialog, type FormInit } from './apptForm'
import { STATUS_TONE, WEEKDAY_SHORT, blocksOf, clipMinutes, closedReason, hhmm, layoutLanes, proOpen, scopeUnitIds, today, tzOf, unitOpen, useNow } from './lib'

type View = 'dia' | 'semana' | 'mes' | 'lista'
const SLOT = 30
const SLOT_H = 48
const PX = SLOT_H / SLOT
const HIDDEN = ['cancelada', 'faltou']

interface Col { key: string; title: string; sub?: string; date: CivilDate; isToday: boolean; open: { start: number; end: number }[]; blocks: { start: number; end: number; reason: string }[]; note?: string | null; match: (a: Appointment) => boolean; init: FormInit }

export function AgendaPage() {
  const t = useTenant()
  const L = useLookup()
  const appts = useCollection(t.tenantId, 'appointments')
  const [sp, setSp] = useSearchParams()
  const mobile = useMediaQuery('(max-width: 767px)')
  const tz = tzOf(t)
  const [view, setView] = useState<View>(() => (mobile ? 'lista' : 'dia'))
  const [date, setDate] = useState<CivilDate>(() => sp.get('data') ?? today(tz))
  const [proF, setProF] = useState('')
  const [resF, setResF] = useState('')
  const [svcF, setSvcF] = useState('')
  const [colsBy, setColsBy] = useState<'profissional' | 'recurso'>('profissional')
  const [showCancelled, setShowCancelled] = useState(false)
  const [form, setForm] = useState<{ init?: FormInit; editing?: Appointment } | null>(null)
  const [detail, setDetail] = useState<ID | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)
  const now = useNow(60000)

  useEffect(() => {
    if (sp.get('novo') === '1') {
      setForm({ init: { patientId: sp.get('paciente') ?? undefined } })
      const n = new URLSearchParams(sp); n.delete('novo'); setSp(n, { replace: true })
    }
  }, [sp, setSp])

  const unitIds = scopeUnitIds(t)
  const units = t.allowedUnits.filter((u) => unitIds.includes(u.id))
  const pros = L.pros.filter((p) => p.active && p.unitIds.some((u) => unitIds.includes(u)))
  const resources = L.resources.filter((r) => r.active && unitIds.includes(r.unitId))
  const canCreate = t.can('agenda', 'create')
  const own = t.scope('agenda', 'update') === 'own'

  const filtered = useMemo(() => appts.filter((a) => unitIds.includes(a.unitId) && (!proF || a.professionalId === proF) && (!resF || a.resourceIds.includes(resF)) && (!svcF || a.serviceId === svcF) && (showCancelled || !HIDDEN.includes(a.status))),
    [appts, unitIds.join(), proF, resF, svcF, showCancelled]) // eslint-disable-line react-hooks/exhaustive-deps

  const step = view === 'semana' ? 7 : view === 'mes' ? 0 : 1
  const move = (dir: number) => {
    if (view === 'mes') { const [y, m] = date.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + dir, 1)); setDate(d.toISOString().slice(0, 10)) }
    else setDate(addDaysCivil(date, dir * step))
  }
  const weekStart = addDaysCivil(date, -((civilWeekday(date) + 6) % 7))
  const label = view === 'semana' ? `${formatCivilLong(weekStart)} – ${formatCivilLong(addDaysCivil(weekStart, 6))}`
    : view === 'mes' ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) : formatCivilLong(date)

  const openNew = (init: FormInit) => { if (canCreate) setForm({ init }) }
  const todayD = today(tz)

  // ---------- colunas ----------
  const unionOpen = (d: CivilDate) => units.flatMap((u) => unitOpen(u, d))
  const proCol = (p: Professional, d: CivilDate, title?: string): Col => ({
    key: `${p.id}|${d}`, title: title ?? p.name, sub: title ? undefined : p.specialty, date: d, isToday: d === todayD,
    open: proOpen(p, units, d), blocks: blocksOf(p, d, tz), match: (a) => a.professionalId === p.id && zonedParts(a.start, tz).date === d,
    init: { date: d, professionalId: p.id, unitId: units.find((u) => p.schedule.some((j) => j.unitId === u.id && j.weekday === civilWeekday(d)))?.id },
  })
  const resCol = (r: Resource, d: CivilDate): Col => {
    const u = units.find((x) => x.id === r.unitId) as Unit
    return { key: `${r.id}|${d}`, title: r.name, sub: units.length > 1 ? u?.name : r.kind, date: d, isToday: d === todayD, open: u ? unitOpen(u, d) : [], blocks: blocksOf(r, d, tz), match: (a) => a.resourceIds.includes(r.id) && zonedParts(a.start, tz).date === d, init: { date: d, resourceId: r.id, unitId: r.unitId } }
  }
  const dayCols = (d: CivilDate): Col[] => colsBy === 'recurso'
    ? resources.filter((r) => !resF || r.id === resF).map((r) => resCol(r, d))
    : pros.filter((p) => !proF || p.id === proF).map((p) => proCol(p, d))
  const weekCols: Col[] = Array.from({ length: 7 }, (_, i) => addDaysCivil(weekStart, i)).map((d) => {
    const p = proF ? pros.find((x) => x.id === proF) : undefined
    const title = `${WEEKDAY_SHORT[civilWeekday(d)]} ${d.slice(8)}/${d.slice(5, 7)}`
    if (p) return proCol(p, d, title)
    return { key: d, title, date: d, isToday: d === todayD, open: unionOpen(d), blocks: [], note: units.length === 1 ? closedReason(units[0], d) : null, match: (a) => zonedParts(a.start, tz).date === d, init: { date: d, unitId: t.unitId ?? undefined } }
  })

  const cols = view === 'semana' ? weekCols : dayCols(date)
  const range = useMemo(() => {
    let s = 24 * 60, e = 0
    for (const u of units) for (const iv of Object.values(u.hours).flat()) { s = Math.min(s, iv.start); e = Math.max(e, iv.end) }
    if (e <= s) { s = 8 * 60; e = 18 * 60 }
    return { s: Math.floor(s / 60) * 60, e: Math.ceil(e / 60) * 60 }
  }, [units.map((u) => u.id).join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const startMin = Math.min(range.s, ...filtered.filter((a) => cols.some((c) => c.match(a))).map((a) => Math.floor(zonedParts(a.start, tz).minutesOfDay / 60) * 60))
  const endMin = Math.max(range.e, ...filtered.filter((a) => cols.some((c) => c.match(a))).map((a) => Math.min(1440, Math.ceil((clipMinutes(a.start, a.end, zonedParts(a.start, tz).date, tz)?.end ?? 0) / 60) * 60)))
  const slots = Array.from({ length: (endMin - startMin) / SLOT }, (_, i) => startMin + i * SLOT)
  const nowParts = zonedParts(new Date(now), tz)

  const onDrop = (e: DragEvent, c: Col, m: number) => {
    e.preventDefault(); setDropKey(null)
    const a = appts.find((x) => x.id === e.dataTransfer.getData('text/plain'))
    if (!a) return
    setForm({ editing: a, init: { date: c.date, minutes: m, professionalId: c.init.professionalId, resourceId: c.init.resourceId, unitId: c.init.unitId ?? a.unitId } })
  }

  const grid = (
    <div className="cal" style={{ '--slot-h': `${SLOT_H}px`, gridTemplateColumns: `56px repeat(${cols.length}, minmax(140px, 1fr))` } as CSSProperties} role="region" aria-label={`Grade da agenda — ${label}`} tabIndex={0}>
      <div className="cal-corner" aria-hidden="true" />
      {cols.map((c) => <div key={c.key} className={`cal-head${c.isToday ? ' is-today' : ''}`}><span className="truncate" style={{ maxWidth: '100%' }}>{c.title}</span>{c.sub && <span className="sub truncate" style={{ maxWidth: '100%' }}>{c.sub}</span>}</div>)}
      <div className="cal-hours" aria-hidden="true">{slots.map((m) => <div key={m} className="cal-hour">{m % 60 === 0 ? hhmm(m) : ''}</div>)}</div>
      {cols.map((c) => {
        const evs = layoutLanes(filtered.filter(c.match).map((a) => { const cm = clipMinutes(a.start, a.end, c.date, tz)!; return { a, s: cm.start, e: cm.end } }))
        return (
          <div key={c.key} className="cal-col" style={{ height: slots.length * SLOT_H }}>
            {slots.map((m) => {
              const open = c.open.some((iv) => m >= iv.start && m + SLOT <= iv.end)
              const k = `${c.key}|${m}`
              return (
                <div key={m} className={`cal-cell${open ? '' : ' cal-closed'}${dropKey === k ? ' drop-target' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); if (dropKey !== k) setDropKey(k) }} onDragLeave={() => setDropKey(null)} onDrop={(e) => onDrop(e, c, m)}>
                  {open && canCreate && <button type="button" aria-label={`Novo agendamento ${c.title} ${hhmm(m)}`} onClick={() => openNew({ ...c.init, minutes: m })} />}
                </div>
              )
            })}
            {c.blocks.map((b, i) => <div key={i} className="cal-block" style={{ top: (Math.max(b.start, startMin) - startMin) * PX, height: (Math.min(b.end, endMin) - Math.max(b.start, startMin)) * PX }}>{b.reason}</div>)}
            {c.note && <div className="cal-block" style={{ top: 0, height: 28 }}>{c.note}</div>}
            {c.isToday && nowParts.minutesOfDay >= startMin && nowParts.minutesOfDay <= endMin && <div className="cal-now" style={{ top: (nowParts.minutesOfDay - startMin) * PX }} aria-hidden="true" />}
            {evs.map(({ a, s, e, lane, lanes }) => {
              const pro = L.pro(a.professionalId)
              const editable = t.can('agenda', 'update', { unitId: a.unitId, ownerProfessionalId: a.professionalId }) && !['concluida', 'cancelada', 'faltou', 'em_atendimento'].includes(a.status)
              return (
                <button key={a.id} type="button" className={`cal-ev st-${a.status}`} draggable={editable}
                  onDragStart={(ev) => { ev.dataTransfer.setData('text/plain', a.id); ev.dataTransfer.effectAllowed = 'move' }}
                  style={{ top: (s - startMin) * PX + 1, height: Math.max(22, (e - s) * PX - 2), left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)`, right: 'auto', borderColor: pro?.color ?? 'var(--q-border)' }}
                  onClick={() => setDetail(a.id)}
                  aria-label={`${formatTime(a.start, tz)} ${L.patient(a.patientId)?.name ?? ''}, ${L.service(a.serviceId)?.name ?? ''}, ${APPOINTMENT_STATUS_LABEL[a.status]}`}>
                  <div className="ev-time">{formatTime(a.start, tz)}{view === 'semana' && !proF ? ` · ${pro?.name.split(' ').slice(0, 2).join(' ')}` : ''}</div>
                  <div className="ev-title truncate">{L.patient(a.patientId)?.name}</div>
                  <div className="truncate">{L.service(a.serviceId)?.name}</div>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )

  const dayList = (d: CivilDate) => {
    const items = filtered.filter((a) => zonedParts(a.start, tz).date === d).sort((a, b) => a.start.localeCompare(b.start))
    const reasons = units.map((u) => closedReason(u, d)).filter(Boolean)
    return (
      <div className="stack" style={{ '--gap': '8px' } as CSSProperties}>
        {reasons.length > 0 && <Alert tone="warning">{reasons.join(' · ')}</Alert>}
        {items.length === 0 ? <EmptyState title="Nenhum agendamento neste dia">{canCreate ? 'Use "Novo agendamento" ou a disponibilidade calculada.' : undefined}</EmptyState> : (
          <ul className="sch-list" aria-label={`Agendamentos de ${formatCivilLong(d)}`}>
            {items.map((a) => (
              <li key={a.id}>
                <button type="button" className="sch-item" style={{ '--pro': L.pro(a.professionalId)?.color } as CSSProperties} onClick={() => setDetail(a.id)}>
                  <span className="t">{formatTime(a.start, tz)}</span>
                  <span className="stack" style={{ '--gap': '0px', minWidth: 0 } as CSSProperties}><span className="strong truncate">{L.patient(a.patientId)?.name}</span><span className="small muted truncate">{L.service(a.serviceId)?.name} · {L.pro(a.professionalId)?.name}{units.length > 1 ? ` · ${L.unit(a.unitId)?.name}` : ''}</span></span>
                  <Badge tone={STATUS_TONE[a.status]}>{APPOINTMENT_STATUS_LABEL[a.status]}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const month = () => {
    const [y, m] = date.split('-').map(Number)
    const first = `${y}-${String(m).padStart(2, '0')}-01`
    const gridStart = addDaysCivil(first, -((civilWeekday(first) + 6) % 7))
    const days = Array.from({ length: 42 }, (_, i) => addDaysCivil(gridStart, i))
    return (
      <div className="month-grid" role="grid" aria-label={label}>
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => <div key={d} className="mg-head" role="columnheader">{d}</div>)}
        {days.map((d) => {
          const items = filtered.filter((a) => zonedParts(a.start, tz).date === d)
          const closed = unionOpen(d).length === 0
          return (
            <div key={d} role="gridcell" className={[d.slice(5, 7) !== String(m).padStart(2, '0') && 'mg-out', d === todayD && 'mg-today', closed && 'mg-closed'].filter(Boolean).join(' ')}>
              <button type="button" className="mg-day" onClick={() => { setDate(d); setView(mobile ? 'lista' : 'dia') }} aria-label={`${formatCivilLong(d)}: ${items.length} agendamento(s)${closed ? ', fechado' : ''}`}>{Number(d.slice(8))}</button>
              {items.length > 0 && <span className="small strong">{items.length} agend.</span>}
              {items.slice(0, 3).map((a) => <span key={a.id} className="mg-ev">{formatTime(a.start, tz)} {L.patient(a.patientId)?.name.split(' ')[0]}</span>)}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Agenda" subtitle={`${units.length > 1 ? 'Todas as unidades permitidas' : units[0]?.name ?? ''} · fuso ${tz}`}
        actions={canCreate ? <Button variant="primary" icon={<CalendarPlus />} data-tour="primary-action" onClick={() => setForm({ init: { date } })}>Novo agendamento</Button> : undefined} />
      {own && <Alert tone="info">Você pode alterar apenas os seus próprios atendimentos. A agenda dos colegas aparece somente para consulta.</Alert>}
      <div className="sch-toolbar" role="group" aria-label="Filtros da agenda">
        {t.allowedUnits.length > 1 && (
          <Field label="Unidade"><Select value={t.unitId ?? ''} onChange={(e) => t.setUnitId(e.target.value || null)}><option value="">Todas permitidas</option>{t.allowedUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        )}
        <Field label="Profissional"><Select value={proF} onChange={(e) => setProF(e.target.value)}><option value="">Todos</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Sala / cadeira / recurso"><Select value={resF} onChange={(e) => setResF(e.target.value)}><option value="">Todos</option>{resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label="Procedimento"><Select value={svcF} onChange={(e) => setSvcF(e.target.value)}><option value="">Todos</option>{L.services.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Checkbox label="Exibir cancelados e faltas" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
      </div>
      <div className="row between">
        <div className="sch-datenav">
          <Button size="sm" iconOnly icon={<ChevronLeft />} onClick={() => move(-1)}>Anterior</Button>
          <Button size="sm" onClick={() => setDate(todayD)}>Hoje</Button>
          <Button size="sm" iconOnly icon={<ChevronRight />} onClick={() => move(1)}>Próximo</Button>
          <label className="sr-only" htmlFor="ag-date">Ir para data</label>
          <Input id="ag-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 160 }} />
          <span className="sch-datelabel" aria-live="polite">{label}</span>
        </div>
        <div className="row">
          {view === 'dia' && <Segmented label="Colunas" value={colsBy} onChange={setColsBy} options={[{ value: 'profissional', label: 'Por profissional' }, { value: 'recurso', label: 'Por recurso' }]} />}
          <Segmented label="Visão" value={view} onChange={setView} options={[{ value: 'dia', label: 'Dia' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }, { value: 'lista', label: 'Lista' }]} />
        </div>
      </div>
      {(view === 'dia' || view === 'semana') && (cols.length === 0 ? <EmptyState title="Nenhuma coluna para exibir">Ajuste os filtros ou a unidade.</EmptyState> : <>
        {grid}
        <div className="legend" aria-label="Legenda">
          <span><span className="swatch cal-closed" style={{ width: 16, height: 16 }} /> Fechado / fora da jornada</span>
          <span><span className="swatch cal-block" style={{ position: 'static', width: 16, height: 16 }} /> Ausência ou bloqueio de recurso</span>
          <span><span className="dot" style={{ background: 'var(--q-danger)' }} /> Agora</span>
          <span>Arraste um agendamento para mover, ou abra-o e use “Editar / reagendar”.</span>
        </div>
      </>)}
      {view === 'lista' && dayList(date)}
      {view === 'mes' && month()}
      <AvailabilityPanel date={date} units={units} pros={pros.filter((p) => !proF || p.id === proF)} initialService={svcF} onPick={(init) => openNew(init)} canCreate={canCreate} />
      {form && <AppointmentFormDialog init={form.init} editing={form.editing} onClose={() => setForm(null)} />}
      {detail && <AppointmentDetailDialog id={detail} onClose={() => setDetail(null)} onEdit={(a) => { setDetail(null); setForm({ editing: a }) }} />}
    </div>
  )
}

function AvailabilityPanel({ date, units, pros, initialService, onPick, canCreate }: { date: CivilDate; units: Unit[]; pros: Professional[]; initialService: string; onPick: (i: FormInit) => void; canCreate: boolean }) {
  const t = useTenant()
  const L = useLookup()
  const appts = useCollection(t.tenantId, 'appointments')
  const services = L.services.filter((s) => s.active)
  const [svcId, setSvcId] = useState(initialService || services[0]?.id || '')
  const [d, setD] = useState(date)
  useEffect(() => setD(date), [date])
  useEffect(() => { if (initialService) setSvcId(initialService) }, [initialService])
  const svc = L.service(svcId)
  const byUnit = useMemo(() => svc ? units.map((u) => ({ u, slots: availableSlots({ date: d, unit: u, service: svc, professionals: pros, resources: L.resources, appointments: appts, stepMin: 30, now: new Date() }) })) : [],
    [svc, d, units, pros, L.resources, appts])
  return (
    <Section title="Disponibilidade calculada" id="disp">
      <div className="stack">
        <div className="form-grid">
          <Field label="Serviço"><Select value={svcId} onChange={(e) => setSvcId(e.target.value)}>{services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMin} min)</option>)}</Select></Field>
          <Field label="Dia"><Input type="date" value={d} onChange={(e) => e.target.value && setD(e.target.value)} /></Field>
        </div>
        <p className="small muted">Considera jornada, funcionamento da unidade, feriados, horários especiais, ausências, bloqueios, buffer do serviço e recursos exigidos. A confirmação definitiva de reserva concorrente será do servidor (transação).</p>
        {byUnit.map(({ u, slots }) => (
          <div key={u.id} className="stack" style={{ '--gap': '6px' } as CSSProperties}>
            {units.length > 1 && <h3>{u.name}</h3>}
            {slots.length === 0 ? <p className="small muted">{closedReason(u, d) ?? 'Sem horários livres para este serviço neste dia.'}</p> : pros.filter((p) => slots.some((s) => s.professionalId === p.id)).map((p) => (
              <div key={p.id} className="stack" style={{ '--gap': '4px' } as CSSProperties}>
                <span className="small strong">{p.name}</span>
                <div className="slot-chips" role="group" aria-label={`Horários livres de ${p.name}`}>
                  {slots.filter((s) => s.professionalId === p.id).map((s) => {
                    const m = zonedParts(s.start, u.timezone).minutesOfDay
                    return <button key={s.start} type="button" className="chip" disabled={!canCreate} onClick={() => onPick({ date: d, minutes: m, professionalId: p.id, unitId: u.id, serviceId: svcId, resourceId: s.resourceIds[0] })}>{hhmm(m)}</button>
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Section>
  )
}
