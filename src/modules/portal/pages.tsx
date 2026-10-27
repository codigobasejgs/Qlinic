// Portal do paciente/tutor (/c/:slug/portal/*). Marca da clínica prevalece; Qlinic só no rodapé.
// Visibilidade demonstrativa (lib.ts). Produção: autenticação própria + autorização/RLS no servidor.
import { useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import {
  Home, CalendarPlus, CalendarDays, FileText, MoreHorizontal, Wallet, ClipboardList, FileSignature, Activity, Syringe, Bell, UserRound, LogOut,
  Clock, MapPin, Stethoscope, QrCode, CheckCircle2, RefreshCw, XCircle, MessageSquare, Download, Eye, PenLine, ChevronRight,
} from 'lucide-react'
import './styles.css'
import { DemoBanner } from '@/app/layouts'
import { setSession } from '@/app/session'
import { db, useCollection } from '@/data/store'
import type { Appointment, Charge, ClinicDocument, ID, Organization, Service } from '@/domain/types'
import { APPOINTMENT_STATUS_LABEL } from '@/domain/types'
import { changeAppointmentStatus, createAppointment, issueCheckInToken, rescheduleAppointment } from '@/domain/appointments'
import { getPolicies } from '@/domain/settings'
import type { Slot } from '@/domain/scheduling'
import { billingRepo, chargeBalance } from '@/data/repositories'
import { Alert, Badge, Button, ButtonLink, EmptyState, Field, Select, SimBadge, Textarea, Tabs, type Tone } from '@/ui/core'
import { Dialog, useAction, useConfirm } from '@/ui/overlay'
import { DemoPaper, SignaturePad } from '@/ui/widgets'
import { ClinicLogo, QlinicLogo, ThemeToggle, useDocumentBrand } from '@/ui/brand'
import { InstallAppButton, OfflineNotice, useNetworkStatus } from '@/pwa/client'
import { QRCode } from '@/modules/scheduling/qr'
import { addDaysCivil, formatCivil, formatDateLong, formatDateTime, formatTime, nowISO, todayCivil, zonedParts } from '@/lib/dates'
import { formatBRL, percentOf } from '@/lib/money'
import { downloadText, uid } from '@/lib/util'
import { useActivePatient, RELATION_LABEL, type LinkedPatient } from './ctx'
import { appointmentActions, CHANGEABLE, portalDocuments, portalGuidance } from './lib'
import { ChargeBadge, NoPermission, OFFLINE_HINT, PayPanel, SlotPicker, receiptText, requireOnline } from './shared'

export { PortalFormsPage, PortalProposalsPage, PortalTreatmentPage, PortalVaccinesPage, PortalPreferencesPage, PortalProfilePage } from './pages-more'

// ---------- Layout ----------
interface NavItem { to: string; label: string; icon: typeof Home; end?: boolean }
function useNavItems(org: Organization): { primary: NavItem[]; more: NavItem[] } {
  const primary: NavItem[] = [
    { to: '', label: 'Início', icon: Home, end: true }, { to: 'agendar', label: 'Agendar', icon: CalendarPlus },
    { to: 'consultas', label: 'Consultas', icon: CalendarDays }, { to: 'documentos', label: 'Documentos', icon: FileText },
  ]
  const more: NavItem[] = [
    { to: 'pagamentos', label: 'Pagamentos', icon: Wallet }, { to: 'formularios', label: 'Formulários', icon: ClipboardList },
    { to: 'propostas', label: 'Propostas', icon: FileSignature }, { to: 'tratamento', label: 'Tratamento', icon: Activity },
    ...(org.segment === 'veterinaria' ? [{ to: 'vacinas', label: 'Vacinas', icon: Syringe }] : []),
    { to: 'preferencias', label: 'Notificações', icon: Bell }, { to: 'perfil', label: 'Perfil', icon: UserRound },
  ]
  return { primary, more }
}

export function PortalLayout() {
  const { org, person, base, list, active, setActive } = useActivePatient()
  const { primary, more } = useNavItems(org)
  const [moreOpen, setMoreOpen] = useState(false)
  const loc = useLocation()
  const navigate = useNavigate()
  useDocumentBrand({ title: `${org.name} · Portal` })
  const href = (to: string) => (to ? `${base}/${to}` : base)
  const isActive = (to: string) => (to ? loc.pathname.startsWith(`${base}/${to}`) : loc.pathname === base || loc.pathname === `${base}/`)
  const exit = () => { setSession(null); navigate(`/c/${org.slug}`) }
  const vet = org.segment === 'veterinaria'
  return (
    <div className="pt-shell">
      <a href="#main" className="skip-link">Pular para o conteúdo</a>
      <DemoBanner />
      <header className="pt-header">
        <div className="pt-bar">
          <Link to={base} className="pt-brand" title="Início do portal"><ClinicLogo org={org} height={32} /></Link>
          <div className="grow" />
          <InstallAppButton kind="portal" org={org} compact />
          <ThemeToggle compact />
          <Button variant="ghost" icon={<LogOut />} onClick={exit} className="hide-mobile">Sair</Button>
        </div>
        <nav className="pt-topnav" aria-label="Menu do portal">
          {[...primary, ...more].map((n) => <NavLink key={n.to} to={href(n.to)} end={n.end} aria-current={isActive(n.to) ? 'page' : undefined}><n.icon aria-hidden="true" />{n.label}</NavLink>)}
        </nav>
      </header>
      <div className="pt-context stack" style={{ '--gap': '8px' } as React.CSSProperties}>
        <OfflineNotice />
        <div className="row between">
          <span className="small muted">Olá, <strong>{person.name.split(' ')[0]}</strong></span>
          {list.length > 1 && active && (
            <div className="pt-switch">
              <label htmlFor="pt-active" className="small strong">{vet ? 'Animal' : 'Paciente'}</label>
              <select id="pt-active" className="select" value={active.patient.id} onChange={(e) => setActive(e.target.value)}>
                {list.map((x) => <option key={x.patient.id} value={x.patient.id}>{x.patient.name}{x.patient.kind === 'animal' ? ` (${x.patient.species})` : x.relation === 'self' ? ' (você)' : ` (${RELATION_LABEL[x.relation].toLowerCase()})`}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
      <main id="main" className="pt-main" tabIndex={-1}>
        {active ? <Outlet key={`${org.id}:${person.id}:${active.patient.id}`} /> : <EmptyState title="Nenhum paciente vinculado">Seu cadastro ainda não está vinculado a um paciente {vet ? 'ou animal ' : ''}nesta clínica. Fale com a recepção.</EmptyState>}
      </main>
      <footer className="pt-footer">
        <span>{org.name} · dados fictícios</span>
        <span className="row" style={{ '--gap': '6px' } as React.CSSProperties}>plataforma <QlinicLogo height={14} decorative /><span className="sr-only">Qlinic</span></span>
      </footer>
      <nav className="bottom-nav" aria-label="Navegação rápida">
        {primary.map((n) => <NavLink key={n.to} to={href(n.to)} end={n.end} aria-current={isActive(n.to) ? 'page' : undefined}><n.icon aria-hidden="true" />{n.label}</NavLink>)}
        <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-current={more.some((m) => isActive(m.to)) ? 'page' : undefined}><MoreHorizontal aria-hidden="true" />Mais</button>
      </nav>
      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="Mais opções">
        <ul className="pt-more-list">
          {more.map((n) => <li key={n.to}><Link to={href(n.to)} onClick={() => setMoreOpen(false)} aria-current={isActive(n.to) ? 'page' : undefined}><n.icon aria-hidden="true" />{n.label}<ChevronRight aria-hidden="true" style={{ marginLeft: 'auto' }} /></Link></li>)}
          <li><a href="#sair" onClick={(e) => { e.preventDefault(); setMoreOpen(false); exit() }}><LogOut aria-hidden="true" />Sair</a></li>
        </ul>
        <div style={{ marginTop: 12 }}><InstallAppButton kind="portal" org={org} /></div>
      </Dialog>
    </div>
  )
}

// ---------- Hooks/lookups ----------
function usePortalData() {
  const ctx = useActivePatient()
  const { org } = ctx
  const services = useCollection(org.id, 'services')
  const pros = useCollection(org.id, 'professionals')
  const units = useCollection(org.id, 'units')
  return { ...ctx, a: ctx.active as LinkedPatient, services, pros, units, by: `${ctx.person.name} (portal)` }
}

function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return <div className="page-head"><div className="ph-text"><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>{actions && <div className="ph-actions">{actions}</div>}</div>
}

const STATUS_TONE: Record<Appointment['status'], Tone> = { solicitada: 'warning', aguardando_confirmacao: 'warning', confirmada: 'success', chegou: 'info', em_atendimento: 'info', concluida: 'neutral', faltou: 'danger', cancelada: 'neutral' }

// ---------- Cartão de consulta (início + consultas) ----------
function AppointmentCard({ ap, compact }: { ap: Appointment; compact?: boolean }) {
  const { org, a, services, pros, units, by, person } = usePortalData()
  const online = useNetworkStatus()
  const confirm = useConfirm()
  const act = useAction()
  const [resched, setResched] = useState(false)
  const unit = units.find((u) => u.id === ap.unitId)
  const svc = services.find((s) => s.id === ap.serviceId)
  const pro = pros.find((p) => p.id === ap.professionalId)
  const tz = unit?.timezone
  const pol = getPolicies(org.id, ap.unitId).booking
  const acts = appointmentActions(ap, Date.now(), pol, a.perms.canSchedule)
  const future = new Date(ap.end).getTime() > Date.now()
  const isToday = zonedParts(ap.start, tz).date === todayCivil(tz)
  const canQr = isToday && (ap.status === 'confirmada' || ap.status === 'aguardando_confirmacao')
  const qrValid = ap.checkIn && !ap.checkIn.usedAt && new Date(ap.checkIn.expiresAt).getTime() > Date.now()
  const doCancel = async () => {
    const r = await confirm({ title: 'Cancelar consulta?', body: `${formatDateLong(ap.start, tz)} às ${formatTime(ap.start, tz)}. A clínica será avisada.`, confirmLabel: 'Cancelar consulta', danger: true, requireReason: true, reasonLabel: 'Motivo do cancelamento' })
    if (r.ok && r.reason) act(() => {
      requireOnline(online)
      const fresh = db.get(org.id, 'appointments', ap.id)
      if (!fresh || !appointmentActions(fresh, Date.now(), getPolicies(org.id, fresh.unitId).booking, a.perms.canSchedule).canCancel) throw new Error('Prazo de cancelamento encerrado. Fale com a clínica.')
      changeAppointmentStatus(org.id, ap.id, 'cancelada', by, `Portal: ${r.reason}`)
    }, 'Consulta cancelada.')
  }
  const talk = () => act(() => db.insert(org.id, 'portalRequests', { id: uid('preq_'), tenantId: org.id, createdAt: nowISO(), personId: person.id, patientId: ap.patientId, kind: 'reagendamento', message: `Pedido de contato sobre a consulta de ${formatDateTime(ap.start, tz)} (fora da janela do portal).`, status: 'aberta' }), 'Pedido enviado. A recepção entrará em contato.')
  const blocked = future && CHANGEABLE.includes(ap.status) && (!acts.canCancel || !acts.canReschedule) ? acts.cancelBlocked ?? acts.rescheduleBlocked : undefined
  return (
    <article className="pt-card accent" aria-label={`Consulta em ${formatDateTime(ap.start, tz)}`}>
      <div className="row between">
        <h3>{formatDateLong(ap.start, tz)} · {formatTime(ap.start, tz)}</h3>
        <Badge tone={STATUS_TONE[ap.status]}>{APPOINTMENT_STATUS_LABEL[ap.status]}</Badge>
      </div>
      <div className="pt-meta">
        <span><Stethoscope aria-hidden="true" />{svc?.name ?? 'Atendimento'}</span>
        {pro && <span><UserRound aria-hidden="true" />{pro.name}</span>}
        <span><MapPin aria-hidden="true" />{unit?.name}</span>
        <span><Clock aria-hidden="true" />até {formatTime(ap.end, tz)}</span>
      </div>
      {ap.status === 'solicitada' && <p className="small muted">Solicitação recebida. A clínica confirmará o horário.</p>}
      {future && CHANGEABLE.includes(ap.status) && !compact && <p className="small muted">Política: cancelamento até {pol.cancelWindowHours} h e reagendamento até {pol.rescheduleWindowHours} h antes.</p>}
      {blocked && (
        <Alert tone="neutral" title="Alteração pelo portal indisponível">
          <span className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
            <span>{blocked} Para mudanças, fale com a clínica: {unit?.phone}.</span>
            <Button size="sm" icon={<MessageSquare />} disabled={!online} onClick={talk} style={{ alignSelf: 'flex-start' }}>Falar com a clínica</Button>
          </span>
        </Alert>
      )}
      {future && (
        <div className="row">
          {acts.canConfirm && <Button variant="primary" icon={<CheckCircle2 />} disabled={!online} onClick={() => act(() => changeAppointmentStatus(org.id, ap.id, 'confirmada', by, 'Confirmado pelo paciente no portal'), 'Presença confirmada.')}>Confirmar presença</Button>}
          {acts.canReschedule && <Button icon={<RefreshCw />} disabled={!online} onClick={() => setResched(true)}>Reagendar</Button>}
          {acts.canCancel && <Button variant="ghost" icon={<XCircle />} disabled={!online} onClick={doCancel}>Cancelar</Button>}
          {canQr && !qrValid && <Button icon={<QrCode />} disabled={!online} onClick={() => act(() => issueCheckInToken(org.id, ap.id), 'Código de check-in gerado (vale 10 min).')}>QR de check-in</Button>}
        </div>
      )}
      {!online && future && CHANGEABLE.includes(ap.status) && <p className="small" role="status">{OFFLINE_HINT}</p>}
      {canQr && qrValid && ap.checkIn && (
        <div className="row muted-surface" style={{ '--gap': '16px', alignItems: 'center' } as React.CSSProperties}>
          <QRCode value={ap.checkIn.token} size={150} label={`QR de check-in, código ${ap.checkIn.token}`} />
          <div className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
            <strong>Mostre no totem ou na recepção</strong>
            <span className="mono">Código: {ap.checkIn.token}</span>
            <span className="small muted">Válido até {formatTime(ap.checkIn.expiresAt, tz)}. O QR contém apenas um código temporário — nenhum dado de saúde.</span>
          </div>
        </div>
      )}
      {ap.checkIn?.usedAt && <p className="small"><Badge tone="success">Chegada registrada</Badge> {ap.checkIn.ticket && <>Senha: <strong>{ap.checkIn.ticket}</strong></>}</p>}
      {resched && svc && <RescheduleDialog ap={ap} service={svc} onClose={() => setResched(false)} />}
    </article>
  )
}

function RescheduleDialog({ ap, service, onClose }: { ap: Appointment; service: Service; onClose: () => void }) {
  const { org, by } = usePortalData()
  const act = useAction()
  const online = useNetworkStatus()
  const [date, setDate] = useState(() => addDaysCivil(todayCivil(), 1))
  const [slot, setSlot] = useState<Slot | null>(null)
  const [same, setSame] = useState(true)
  const [reason, setReason] = useState('')
  const save = () => {
    if (!slot) return
    if (act(() => {
      requireOnline(online)
      const fresh = db.get(org.id, 'appointments', ap.id)
      if (!fresh || !appointmentActions(fresh, Date.now(), getPolicies(org.id, fresh.unitId).booking).canReschedule) throw new Error('Prazo de reagendamento encerrado. Fale com a clínica.')
      rescheduleAppointment(org.id, ap.id, { start: slot.start, end: slot.end, professionalId: slot.professionalId, resourceIds: slot.resourceIds }, by, `Portal: ${reason.trim()}`)
    }, 'Consulta reagendada.')) onClose()
  }
  return (
    <Dialog open onClose={onClose} title="Reagendar consulta" size="lg" description={`${service.name} · mesma unidade`}
      footer={<><Button onClick={onClose}>Voltar</Button><Button variant="primary" disabled={!slot || reason.trim().length < 3 || !online} onClick={save}>Confirmar novo horário</Button></>}>
      <div className="stack">
        <label className="check"><input type="checkbox" checked={same} onChange={(e) => { setSame(e.target.checked); setSlot(null) }} /><span>Manter o mesmo profissional</span></label>
        <SlotPicker tenantId={org.id} unitId={ap.unitId} service={service} professionalId={same ? ap.professionalId : null} date={date} patientId={ap.patientId} ignoreId={ap.id} onDate={(d) => { setDate(d); setSlot(null) }} value={slot} onPick={setSlot} />
        <Field label="Motivo do reagendamento" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} /></Field>
        {!online && <p className="small" role="status">{OFFLINE_HINT}</p>}
      </div>
    </Dialog>
  )
}

// ---------- Início ----------
export function PortalHomePage() {
  const { org, a, base } = usePortalData()
  const appts = useCollection(org.id, 'appointments')
  const docs = useCollection(org.id, 'documents')
  const charges = useCollection(org.id, 'charges')
  const proposals = useCollection(org.id, 'proposals')
  const responses = useCollection(org.id, 'formResponses')
  const templates = useCollection(org.id, 'formTemplates')
  const pid = a.patient.id
  const now = Date.now()
  const next = appts.filter((x) => x.patientId === pid && CHANGEABLE.includes(x.status) && new Date(x.end).getTime() > now).sort((x, y) => x.start.localeCompare(y.start))[0]
  const visibleDocs = portalDocuments(docs, pid, a.perms)
  const toSign = visibleDocs.filter((d) => d.signature.status === 'pendente' || d.signature.status === 'parcial')
  const forms = responses.filter((r) => r.patientId === pid && r.status === 'pendente')
  const props = a.perms.canSeeFinancial ? proposals.filter((p) => p.patientId === pid && (p.status === 'enviada' || p.status === 'visualizada') && p.validUntil >= todayCivil()) : []
  const open = a.perms.canSeeFinancial ? charges.filter((c) => c.patientId === pid && chargeBalance(c) > 0 && !['cancelada', 'estornada'].includes(c.status)) : []
  const openTotal = open.reduce((s, c) => s + chargeBalance(c), 0)
  const tasks: { to: string; icon: ReactNode; title: string; sub: string }[] = [
    ...forms.map((f) => ({ to: `${base}/formularios`, icon: <ClipboardList />, title: templates.find((t) => t.id === f.templateId)?.name ?? 'Formulário', sub: 'Formulário para preencher' })),
    ...props.map((p) => ({ to: `${base}/propostas`, icon: <FileSignature />, title: `Proposta ${p.number}`, sub: `Válida até ${formatCivil(p.validUntil)}` })),
    ...toSign.map((d) => ({ to: `${base}/documentos`, icon: <PenLine />, title: d.title, sub: 'Documento aguardando sua assinatura' })),
    ...(open.length ? [{ to: `${base}/pagamentos`, icon: <Wallet />, title: `${open.length} cobrança(s) em aberto`, sub: `Total ${formatBRL(openTotal)}` }] : []),
  ]
  return (
    <div className="stack" data-tour="page-content">
      <PageTitle title={a.patient.kind === 'animal' ? `Portal de ${a.patient.name}` : 'Seu portal'} subtitle={org.name} />
      <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties} aria-labelledby="h-next">
        <h2 id="h-next" style={{ fontSize: 17 }}>Próxima consulta</h2>
        {next ? <AppointmentCard ap={next} compact /> : (
          <div className="pt-card"><p>Nenhuma consulta futura.</p>{a.perms.canSchedule && <ButtonLink to={`${base}/agendar`} variant="primary" icon={<CalendarPlus />}>Agendar</ButtonLink>}</div>
        )}
      </section>
      <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties} aria-labelledby="h-tasks">
        <h2 id="h-tasks" style={{ fontSize: 17 }}>Pendências {tasks.length > 0 && <Badge tone="warning">{tasks.length}</Badge>}</h2>
        {tasks.length === 0 ? <p className="muted small">Nada pendente por aqui.</p> : (
          <ul className="pt-list">{tasks.map((t, i) => <li key={i}><Link className="pt-task" to={t.to}>{t.icon}<span className="grow"><strong>{t.title}</strong><span className="small muted">{t.sub}</span></span><ChevronRight aria-hidden="true" /></Link></li>)}</ul>
        )}
      </section>
      <div className="grid grid-2">
        <section className="pt-card" aria-labelledby="h-docs">
          <div className="row between"><h2 id="h-docs" style={{ fontSize: 16 }}>Documentos liberados</h2><Link to={`${base}/documentos`} className="small">Ver todos</Link></div>
          {!a.perms.canSeeClinical && !a.perms.canSeeFinancial ? <p className="small muted">Seu vínculo não inclui documentos.</p> : visibleDocs.length === 0 ? <p className="small muted">Nenhum documento liberado.</p> : (
            <ul className="pt-list">{[...visibleDocs].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 3).map((d) => <li key={d.id} className="row between small"><span><FileText size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} /> {d.title}</span><span className="muted">{formatDateTime(d.createdAt)}</span></li>)}</ul>
          )}
        </section>
        <section className="pt-card" aria-labelledby="h-pay">
          <div className="row between"><h2 id="h-pay" style={{ fontSize: 16 }}>Pagamentos em aberto</h2><Link to={`${base}/pagamentos`} className="small">Ver pagamentos</Link></div>
          {!a.perms.canSeeFinancial ? <p className="small muted">Seu vínculo não inclui dados financeiros deste paciente.</p> : open.length === 0 ? <p className="small muted">Nenhuma cobrança em aberto.</p> : (
            <ul className="pt-list">{open.slice(0, 3).map((c) => <li key={c.id} className="row between small"><span>{c.description}<br /><span className="muted">vence {formatCivil(c.dueDate)}</span></span><span className="row"><span className="num strong">{formatBRL(chargeBalance(c))}</span><ChargeBadge c={c} /></span></li>)}</ul>
          )}
        </section>
      </div>
    </div>
  )
}

// ---------- Agendar ----------
export function PortalBookingPage() {
  const { org, a, base, services, pros, units, by, person } = usePortalData()
  const online = useNetworkStatus()
  const act = useAction()
  const bookable = services.filter((s) => s.publicBookable && s.active)
  const [serviceId, setServiceId] = useState<ID>(bookable[0]?.id ?? '')
  const [unitId, setUnitId] = useState<ID>(a.patient.unitId && units.some((u) => u.id === a.patient.unitId) ? a.patient.unitId : units[0]?.id ?? '')
  const [proId, setProId] = useState<ID>('')
  const [date, setDate] = useState(() => addDaysCivil(todayCivil(), 1))
  const [slot, setSlot] = useState<Slot | null>(null)
  const [done, setDone] = useState<{ ap: Appointment; charge?: Charge } | null>(null)
  const svc = bookable.find((s) => s.id === serviceId)
  const unitPros = pros.filter((p) => p.active && p.unitIds.includes(unitId))
  const pol = getPolicies(org.id, unitId)
  if (!a.perms.canSchedule) return <><PageTitle title="Agendar" /><NoPermission what="agendamento" /></>
  if (!bookable.length) return <><PageTitle title="Agendar" /><EmptyState title="Agendamento online indisponível">Esta clínica ainda não publicou serviços para agendamento online. Fale com a recepção.</EmptyState></>
  const deposit = (s?: Service) => (s ? percentOf(s.priceCents, s.depositPercent ?? pol.booking.depositPercent) : 0)

  const book = () => {
    if (!svc || !slot) return
    act(() => {
      requireOnline(online)
      const policy = getPolicies(org.id, unitId).booking
      if (new Date(slot.start).getTime() < Date.now() + policy.minAdvanceHours * 3600000 || zonedParts(slot.start, units.find((u) => u.id === unitId)?.timezone).date > addDaysCivil(todayCivil(), policy.maxAdvanceDays)) throw new Error('Horário fora da antecedência permitida. Escolha novamente.')
      const ap = createAppointment(org.id, { unitId, patientId: a.patient.id, professionalId: slot.professionalId, serviceId: svc.id, resourceIds: slot.resourceIds, start: slot.start, end: slot.end, status: pol.booking.requireConfirmation ? 'solicitada' : 'confirmada', source: 'portal', notes: 'Agendado pelo portal do paciente' }, by)
      let charge: Charge | undefined
      const dep = deposit(svc)
      if (dep > 0) {
        const id = uid('ch_')
        charge = { id, tenantId: org.id, createdAt: nowISO(), unitId, patientId: a.patient.id, payerPersonId: person.id, origin: { kind: 'consulta', refId: ap.id }, description: `Sinal — ${svc.name}`, competenceDate: todayCivil(), dueDate: todayCivil(), amountCents: dep, adjustmentsCents: 0, installment: { n: 1, of: 1, groupId: id }, status: 'aberta', payments: [], refunds: [], professionalId: slot.professionalId, serviceId: svc.id, category: 'Sinal de agendamento' }
        billingRepo.createCharges(org.id, [charge])
      }
      setDone({ ap, charge })
    }, pol.booking.requireConfirmation ? 'Solicitação enviada à clínica.' : 'Consulta agendada.')
  }

  if (done) {
    const tz = units.find((u) => u.id === done.ap.unitId)?.timezone
    return (
      <div className="stack" data-tour="page-content">
        <PageTitle title={done.ap.status === 'solicitada' ? 'Solicitação enviada' : 'Consulta agendada'} />
        <Alert tone="success" title={done.ap.status === 'solicitada' ? 'A clínica confirmará o horário' : 'Horário confirmado'}>
          {formatDateLong(done.ap.start, tz)} às {formatTime(done.ap.start, tz)} — {svc?.name}. {done.ap.status === 'solicitada' && 'Você receberá a confirmação pelos canais escolhidos em Notificações.'}
        </Alert>
        {done.charge && (
          <section className="pt-card">
            <h2 style={{ fontSize: 16 }}>Sinal de {formatBRL(done.charge.amountCents)}</h2>
            <p className="small muted">A clínica pede sinal para este serviço. Você pode pagar agora (simulado) ou depois, em Pagamentos.</p>
            {a.perms.canSeeFinancial ? <PayPanel org={org} chargeId={done.charge.id} by={by} payerName={person.name} /> : <p className="small">O responsável financeiro será contatado pela clínica.</p>}
          </section>
        )}
        <div className="row"><ButtonLink to={`${base}/consultas`} variant="primary">Ver minhas consultas</ButtonLink><Button onClick={() => { setDone(null); setSlot(null) }}>Agendar outra</Button></div>
      </div>
    )
  }

  return (
    <div className="stack" data-tour="page-content">
      <PageTitle title="Agendar" subtitle={`Para ${a.patient.name}`} />
      <section className="pt-card">
        <div className="form-grid">
          <Field label="Serviço"><Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setSlot(null) }}>{bookable.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min</option>)}</Select></Field>
          {units.length > 1 && <Field label="Unidade"><Select value={unitId} onChange={(e) => { setUnitId(e.target.value); setProId(''); setSlot(null) }}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
          <Field label="Profissional" hint="Opcional"><Select value={proId} onChange={(e) => { setProId(e.target.value); setSlot(null) }}><option value="">Qualquer profissional</option>{unitPros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        </div>
        {svc && <p className="small muted">{svc.priceCents > 0 ? `Valor de referência: ${formatBRL(svc.priceCents)}.` : ''} {deposit(svc) > 0 ? `Sinal de ${formatBRL(deposit(svc))} (${svc.depositPercent ?? pol.booking.depositPercent}%).` : ''}</p>}
      </section>
      <section className="pt-card">
        <SlotPicker tenantId={org.id} unitId={unitId} service={svc} professionalId={proId || null} date={date} patientId={a.patient.id} onDate={(d) => { setDate(d); setSlot(null) }} value={slot} onPick={setSlot} />
      </section>
      <div className="pt-card" aria-live="polite">
        {slot ? <p><strong>Selecionado:</strong> {formatDateLong(slot.start, units.find((u) => u.id === unitId)?.timezone)} às {formatTime(slot.start, units.find((u) => u.id === unitId)?.timezone)} · {pros.find((p) => p.id === slot.professionalId)?.name}</p> : <p className="muted small">Escolha um horário.</p>}
        <p className="small muted">{pol.booking.requireConfirmation ? 'Esta clínica confirma cada solicitação antes de reservar o horário.' : 'O horário é reservado ao confirmar.'} Cancelamento pelo portal até {pol.booking.cancelWindowHours} h antes.</p>
        <Button variant="primary" icon={<CalendarPlus />} disabled={!slot || !online} onClick={book} data-tour="primary-action">{pol.booking.requireConfirmation ? 'Solicitar horário' : 'Confirmar agendamento'}</Button>
        {!online && <p className="small" role="status">{OFFLINE_HINT}</p>}
      </div>
    </div>
  )
}

// ---------- Consultas ----------
export function PortalAppointmentsPage() {
  const { org, a, base } = usePortalData()
  const appts = useCollection(org.id, 'appointments')
  const [tab, setTab] = useState('futuras')
  const now = Date.now()
  const mine = appts.filter((x) => x.patientId === a.patient.id)
  const future = mine.filter((x) => new Date(x.end).getTime() > now && x.status !== 'cancelada' && x.status !== 'concluida' && x.status !== 'faltou').sort((x, y) => x.start.localeCompare(y.start))
  const past = mine.filter((x) => !future.includes(x)).sort((x, y) => y.start.localeCompare(x.start))
  const list = tab === 'futuras' ? future : past
  return (
    <div className="stack" data-tour="page-content">
      <PageTitle title="Consultas" subtitle={a.patient.name} actions={a.perms.canSchedule ? <ButtonLink to={`${base}/agendar`} variant="primary" icon={<CalendarPlus />}>Agendar</ButtonLink> : undefined} />
      <Tabs label="Consultas" value={tab} onChange={setTab} tabs={[{ id: 'futuras', label: 'Próximas', badge: future.length }, { id: 'passadas', label: 'Anteriores', badge: past.length }]} />
      <div role="tabpanel" className="stack">
        {list.length === 0 ? <EmptyState title={tab === 'futuras' ? 'Nenhuma consulta futura' : 'Nenhuma consulta anterior'} /> : list.slice(0, 30).map((ap) => <AppointmentCard key={ap.id} ap={ap} />)}
      </div>
    </div>
  )
}

// ---------- Documentos ----------
const DOC_KIND: Record<ClinicDocument['kind'], string> = { receita: 'Receita', atestado: 'Atestado', orientacao: 'Orientação', recibo: 'Recibo', termo: 'Termo', laudo: 'Laudo', pedido_exame: 'Pedido de exame', encaminhamento: 'Encaminhamento', declaracao: 'Declaração', contrato: 'Contrato', relatorio: 'Relatório' }
const SIG_LABEL: Record<ClinicDocument['signature']['status'], [string, Tone] | null> = { nao_requerida: null, pendente: ['Assinatura pendente', 'warning'], parcial: ['Assinatura parcial', 'warning'], assinado: ['Assinado (demo)', 'success'], recusado: ['Recusado', 'danger'], expirado: ['Expirado', 'neutral'] }

function docText(org: Organization, patientName: string, d: ClinicDocument) {
  return [`DOCUMENTO DE DEMONSTRAÇÃO — SEM VALIDADE`, '', org.name, `${DOC_KIND[d.kind]}: ${d.title}`, `Paciente: ${patientName}`, `Emitido em: ${formatDateTime(d.createdAt)}`, '', d.body, '',
    ...(d.signature.trail.length ? ['Trilha de assinatura (demonstrativa):', ...d.signature.trail.map((t) => `• ${formatDateTime(t.at)} — ${t.event}`)] : [])].join('\n')
}

export function PortalDocumentsPage() {
  const { org, a, person, by } = usePortalData()
  const docs = useCollection(org.id, 'documents')
  const records = useCollection(org.id, 'records')
  const pros = useCollection(org.id, 'professionals')
  const online = useNetworkStatus()
  const act = useAction()
  const [view, setView] = useState<ClinicDocument | null>(null)
  const [sign, setSign] = useState<ClinicDocument | null>(null)
  const list = useMemo(() => portalDocuments(docs, a.patient.id, a.perms).sort((x, y) => y.createdAt.localeCompare(x.createdAt)), [docs, a])
  const guidance = portalGuidance(records, a.patient.id, a.perms)
  const doSign = (r: { method: 'rubrica_demo' | 'aceite_demo'; typedName?: string }) => {
    if (!sign) return
    const ok = act(() => db.update(org.id, 'documents', sign.id, (prev) => {
      requireOnline(online)
      if (!portalDocuments([prev], a.patient.id, a.perms).length) throw new Error('Documento indisponível.')
      if (prev.signature.status !== 'pendente' && prev.signature.status !== 'parcial') throw new Error('Este documento não está aguardando assinatura.')
      if (prev.signature.expiresAt && new Date(prev.signature.expiresAt).getTime() < Date.now()) throw new Error('Prazo de assinatura expirado. Peça novo envio à clínica.')
      const at = nowISO()
      let done = false
      const signers = [...prev.signature.signers].sort((x, y) => x.order - y.order).map((s) => (!done && s.status === 'pendente' ? (done = true, { ...s, status: 'assinado' as const, at, method: r.method }) : s))
      const all = signers.every((s) => s.status === 'assinado')
      return { ...prev, signature: { ...prev.signature, signers, status: all ? 'assinado' : 'parcial', trail: [...prev.signature.trail, { at, event: `Assinado no portal por ${r.typedName ?? person.name} (${r.method === 'rubrica_demo' ? 'rubrica' : 'nome digitado'}) — demonstrativo` }] } }
    }), 'Documento assinado (demonstração).')
    if (ok) setSign(null)
  }
  return (
    <div className="stack" data-tour="page-content">
      <PageTitle title="Documentos" subtitle={`Somente documentos liberados pela clínica para ${a.patient.name}.`} />
      {org.segment === 'psicologia' && <Alert tone="info">Registros de sessão são sigilosos e nunca aparecem no portal. Aqui ficam apenas documentos que o profissional liberou explicitamente.</Alert>}
      {!a.perms.canSeeClinical && <Alert tone="neutral">Seu vínculo não inclui documentos clínicos deste paciente{a.perms.canSeeFinancial ? '; apenas recibos.' : '.'}</Alert>}
      {list.length === 0 ? <EmptyState title="Nenhum documento liberado" /> : (
        <ul className="pt-list">
          {list.map((d) => {
            const sig = SIG_LABEL[d.signature.status]
            const needs = d.signature.status === 'pendente' || d.signature.status === 'parcial'
            return (
              <li key={d.id} className="pt-card">
                <div className="row between"><h3>{d.title}</h3><span className="row"><Badge plain>{DOC_KIND[d.kind]}</Badge>{sig && <Badge tone={sig[1]}>{sig[0]}</Badge>}</span></div>
                <span className="small muted">Liberado em {formatDateTime(d.createdAt)}</span>
                <div className="row">
                  <Button size="sm" icon={<Eye />} onClick={() => setView(d)}>Visualizar</Button>
                  <Button size="sm" icon={<Download />} onClick={() => downloadText(`${d.kind}-${d.id}.txt`, docText(org, a.patient.name, d))}>Baixar</Button>
                  {needs && <Button size="sm" variant="primary" icon={<PenLine />} disabled={!online} onClick={() => setSign(d)} data-tour="primary-action">Assinar</Button>}
                </div>
                {needs && !online && <p className="small" role="status">{OFFLINE_HINT}</p>}
              </li>
            )
          })}
        </ul>
      )}
      <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties} aria-labelledby="h-guid">
        <h2 id="h-guid" style={{ fontSize: 17 }}>Orientações dos atendimentos</h2>
        {!a.perms.canSeeClinical ? <p className="small muted">Não disponível para o seu vínculo.</p> : guidance.length === 0 ? <p className="small muted">Nenhuma orientação liberada.</p> : (
          <ul className="pt-list">{guidance.slice(0, 10).map((g) => <li key={g.id} className="pt-card"><span className="small muted">{formatDateTime(g.at)} · {pros.find((p) => p.id === g.professionalId)?.name}</span><p>{g.text}</p></li>)}</ul>
        )}
        <p className="tiny muted">O prontuário completo e as anotações internas não são exibidos no portal.</p>
      </section>
      <Dialog open={!!view} onClose={() => setView(null)} title={view?.title} size="lg" footer={view && <><Button icon={<Download />} onClick={() => downloadText(`${view.kind}-${view.id}.txt`, docText(org, a.patient.name, view))}>Baixar</Button><Button variant="primary" onClick={() => setView(null)}>Fechar</Button></>}>
        {view && (
          <DemoPaper>
            <div className="stack" style={{ '--gap': '12px' } as React.CSSProperties}>
              <ClinicLogo org={org} height={28} />
              <h2 style={{ fontSize: 18 }}>{DOC_KIND[view.kind]} — {view.title}</h2>
              <p className="small">Paciente: {a.patient.name} · Emitido em {formatDateTime(view.createdAt)}</p>
              <p style={{ whiteSpace: 'pre-wrap' }}>{view.body}</p>
              {view.signature.trail.length > 0 && <div className="small"><strong>Trilha (demonstrativa)</strong><ul>{view.signature.trail.map((t, i) => <li key={i}>{formatDateTime(t.at)} — {t.event}</li>)}</ul></div>}
            </div>
          </DemoPaper>
        )}
      </Dialog>
      <Dialog open={!!sign} onClose={() => setSign(null)} title={`Assinar: ${sign?.title ?? ''}`} description="Assinatura demonstrativa — não equivale a certificado ICP-Brasil.">
        {sign && <div className="stack"><p className="small">{sign.body}</p><fieldset disabled={!online}><SignaturePad signerName={person.name} onSign={doSign} /></fieldset>{!online && <p role="status">{OFFLINE_HINT}</p>}<p className="tiny muted">Registro: {by}.</p></div>}
      </Dialog>
    </div>
  )
}

// ---------- Pagamentos ----------
export function PortalPaymentsPage() {
  const { org, a, by, person } = usePortalData()
  const charges = useCollection(org.id, 'charges')
  const [pay, setPay] = useState<ID | null>(null)
  if (!a.perms.canSeeFinancial) return <><PageTitle title="Pagamentos" /><NoPermission what="dados financeiros" /></>
  const mine = charges.filter((c) => c.patientId === a.patient.id).sort((x, y) => x.dueDate.localeCompare(y.dueDate))
  const open = mine.filter((c) => chargeBalance(c) > 0 && !['cancelada', 'estornada'].includes(c.status))
  const closed = mine.filter((c) => !open.includes(c)).reverse()
  return (
    <div className="stack" data-tour="page-content">
      <PageTitle title="Pagamentos" subtitle={a.patient.name} actions={<SimBadge />} />
      <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties} aria-labelledby="h-open">
        <h2 id="h-open" style={{ fontSize: 17 }}>Em aberto</h2>
        {open.length === 0 ? <p className="muted small">Nenhuma cobrança em aberto.</p> : (
          <ul className="pt-list">{open.map((c) => (
            <li key={c.id} className="pt-card">
              <div className="row between"><h3>{c.description}</h3><ChargeBadge c={c} /></div>
              <div className="pt-meta"><span>Vencimento {formatCivil(c.dueDate)}</span><span>Total {formatBRL(c.amountCents + c.adjustmentsCents)}</span><span>Saldo <strong className="num">{formatBRL(chargeBalance(c))}</strong></span></div>
              <Button variant="primary" icon={<Wallet />} onClick={() => setPay(c.id)} style={{ alignSelf: 'flex-start' }}>Pagar</Button>
            </li>
          ))}</ul>
        )}
      </section>
      <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties} aria-labelledby="h-closed">
        <h2 id="h-closed" style={{ fontSize: 17 }}>Histórico e recibos</h2>
        {closed.length === 0 ? <p className="muted small">Sem histórico.</p> : (
          <ul className="pt-list">{closed.slice(0, 30).map((c) => (
            <li key={c.id} className="pt-card">
              <div className="row between"><span className="strong">{c.description}</span><span className="row"><span className="num">{formatBRL(c.amountCents)}</span><ChargeBadge c={c} /></span></div>
              {c.status === 'paga' && <Button size="sm" icon={<Download />} onClick={() => downloadText(`recibo-${c.id}.txt`, receiptText(org, c, person.name))} style={{ alignSelf: 'flex-start' }}>Baixar recibo (demonstrativo)</Button>}
              {c.refunds.length > 0 && <span className="small muted">Estorno: {c.refunds.map((r) => `${formatBRL(r.amountCents)} — ${r.reason}`).join('; ')}</span>}
            </li>
          ))}</ul>
        )}
      </section>
      <Dialog open={!!pay} onClose={() => setPay(null)} title="Pagar cobrança" size="lg">{pay && <PayPanel org={org} chargeId={pay} by={by} payerName={person.name} />}</Dialog>
    </div>
  )
}
