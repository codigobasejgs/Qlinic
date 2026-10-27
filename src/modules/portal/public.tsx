// Páginas públicas da clínica (/c/:slug): página institucional, agendamento sem login e link de proposta.
// Marca da clínica (ClinicGate aplica tokens). Sem dados reais.
import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { CalendarPlus, LogIn, MapPin, Phone, Clock, CheckCircle2, ShieldAlert } from 'lucide-react'
import './styles.css'
import { DemoBanner } from '@/app/layouts'
import { useSession } from '@/app/session'
import { db, useCollection } from '@/data/store'
import type { Appointment, ID, Organization, Patient, Person } from '@/domain/types'
import { createAppointment } from '@/domain/appointments'
import { getPolicies } from '@/domain/settings'
import { findProposalByToken } from '@/domain/proposals'
import type { Slot } from '@/domain/scheduling'
import { patientRepo, audit } from '@/data/repositories'
import { Alert, Button, ButtonLink, Checkbox, DemoOnly, demoText, EmptyState, Field, Input, Select, SimBadge } from '@/ui/core'
import { useAction } from '@/ui/overlay'
import { ClinicLogo, QlinicLogo, ThemeToggle } from '@/ui/brand'
import { InstallAppButton, OfflineNotice, useNetworkStatus } from '@/pwa/client'
import { addDaysCivil, formatDateLong, formatTime, minutesToHHMM, nowISO, todayCivil } from '@/lib/dates'
import { formatBRL } from '@/lib/money'
import { maskPhone, uid } from '@/lib/util'
import { OFFLINE_HINT, ProposalExperience, SlotPicker, proposalAvailable } from './shared'

const WD = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function PublicShell({ org, children }: { org: Organization; children: React.ReactNode }) {
  return (
    <div className="pt-shell">
      <a href="#main" className="skip-link">Pular para o conteúdo</a>
      <DemoBanner />
      <header className="pt-header">
        <div className="pt-bar">
          <Link to={`/c/${org.slug}`} className="pt-brand" title="Página inicial da clínica"><ClinicLogo org={org} height={32} /></Link>
          <div className="grow" />
          <ThemeToggle compact />
          <ButtonLink to={`/c/${org.slug}/portal`} variant="ghost" icon={<LogIn />} className="hide-mobile">Portal do paciente</ButtonLink>
        </div>
      </header>
      <div className="pt-context"><OfflineNotice /></div>
      <main id="main" className="pt-main" tabIndex={-1}>{children}</main>
      <footer className="pt-footer">
        <span>{org.name}<DemoOnly> · página demonstrativa com dados fictícios</DemoOnly></span>
        <span className="row" style={{ '--gap': '6px' } as React.CSSProperties}>plataforma <QlinicLogo height={14} decorative /><span className="sr-only">Qlinic</span></span>
      </footer>
    </div>
  )
}

function hoursSummary(h: Record<number, { start: number; end: number }[]>) {
  return [1, 2, 3, 4, 5, 6, 0].map((d) => [WD[d], h[d]?.length ? h[d].map((i) => `${minutesToHHMM(i.start)}–${minutesToHHMM(i.end)}`).join(', ') : 'Fechado'] as const)
}

// ---------- Página pública ----------
export function ClinicPublicPage() {
  const org = useOutletContext<Organization>()
  const services = useCollection(org.id, 'services').filter((s) => s.publicBookable && s.active)
  const pros = useCollection(org.id, 'professionals').filter((p) => p.active)
  const units = useCollection(org.id, 'units')
  const booking = getPolicies(org.id).booking
  const pp = org.publicPage
  return (
    <PublicShell org={org}>
      <div className="stack" data-tour="page-content">
        <section className="cp-hero">
          <ClinicLogo org={org} height={48} />
          <h1>{pp.headline || org.name}</h1>
          {pp.about && <p className="lead">{pp.about}</p>}
          <div className="row">
            {booking.publicBookingEnabled && services.length > 0 && <ButtonLink to={`/c/${org.slug}/agendar`} variant="primary" icon={<CalendarPlus />}>Agendar horário</ButtonLink>}
            <ButtonLink to={`/c/${org.slug}/portal`} icon={<LogIn />}>Entrar no portal</ButtonLink>
            <InstallAppButton kind="portal" org={org} />
          </div>
          <p className="small muted">{org.city} · contato {org.contactPhone} · {org.contactEmail}</p>
        </section>
        {services.length > 0 && (
          <section className="cp-section" aria-labelledby="cp-svc">
            <h2 id="cp-svc">Serviços com agendamento online</h2>
            <ul className="grid grid-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {services.map((s) => (
                <li key={s.id} className="pt-card cp-service">
                  <span><strong>{s.name}</strong><br /><span className="small muted">{s.category} · {s.durationMin} min</span></span>
                  {pp.showPrices && s.priceCents > 0 && <span className="num strong nowrap-text">{formatBRL(s.priceCents)}</span>}
                </li>
              ))}
            </ul>
            {pp.showPrices && <p className="small muted">{demoText('Valores de referência demonstrativos; podem variar conforme avaliação.', 'Valores de referência; podem variar conforme avaliação.')}</p>}
          </section>
        )}
        {pp.showProfessionals && pros.length > 0 && (
          <section className="cp-section" aria-labelledby="cp-pro">
            <h2 id="cp-pro">Profissionais</h2>
            <ul className="grid grid-3" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {pros.map((p) => <li key={p.id} className="pt-card"><strong>{p.name}</strong><span className="small muted">{p.specialty}</span><span className="tiny muted">{p.council}</span></li>)}
            </ul>
          </section>
        )}
        <section className="cp-section" aria-labelledby="cp-un">
          <h2 id="cp-un">{units.length > 1 ? 'Unidades' : 'Onde estamos'}</h2>
          <div className="grid grid-2">
            {units.map((u) => (
              <article key={u.id} className="pt-card" aria-label={u.name}>
                <h3>{u.name}</h3>
                <div className="pt-meta"><span><MapPin aria-hidden="true" />{u.address}</span><span><Phone aria-hidden="true" />{u.phone}</span></div>
                <h4 className="row small" style={{ '--gap': '6px' } as React.CSSProperties}><Clock size={16} aria-hidden="true" />Horário</h4>
                <dl className="cp-hours">{hoursSummary(u.hours).map(([d, h]) => <div key={d} style={{ display: 'contents' }}><dt>{d}</dt><dd>{h}</dd></div>)}</dl>
                {u.holidays.filter((h) => h.date >= todayCivil()).slice(0, 2).map((h) => <p key={h.date} className="small muted">Fechado em {h.date.split('-').reverse().join('/')} — {h.name}</p>)}
              </article>
            ))}
          </div>
        </section>
      </div>
    </PublicShell>
  )
}

// ---------- Agendamento público ----------
interface PublicForm { name: string; phone: string; email: string; consent: boolean }

export function PublicBookingPage() {
  const org = useOutletContext<Organization>()
  const services = useCollection(org.id, 'services').filter((s) => s.publicBookable && s.active)
  const units = useCollection(org.id, 'units')
  const pros = useCollection(org.id, 'professionals')
  const online = useNetworkStatus()
  const act = useAction()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [serviceId, setServiceId] = useState<ID>(services[0]?.id ?? '')
  const [unitId, setUnitId] = useState<ID>(units[0]?.id ?? '')
  const [date, setDate] = useState(() => addDaysCivil(todayCivil(), 1))
  const [slot, setSlot] = useState<Slot | null>(null)
  const [f, setF] = useState<PublicForm>({ name: '', phone: '', email: '', consent: false })
  const [errors, setErrors] = useState<Partial<Record<keyof PublicForm, string>>>({})
  const [done, setDone] = useState<{ ap: Appointment; review: boolean } | null>(null)
  const pol = getPolicies(org.id, unitId).booking
  const svc = services.find((s) => s.id === serviceId)
  const tz = units.find((u) => u.id === unitId)?.timezone

  if (!pol.publicBookingEnabled || services.length === 0) return <PublicShell org={org}><EmptyState title="Agendamento online indisponível" action={<ButtonLink to={`/c/${org.slug}`}>Voltar</ButtonLink>}>Esta clínica não oferece agendamento online no momento. Entre em contato pelo telefone {org.contactPhone}.</EmptyState></PublicShell>

  const validate = () => {
    const e: typeof errors = {}
    if (f.name.trim().split(/\s+/).length < 2) e.name = 'Informe nome e sobrenome.'
    if (f.phone.replace(/\D/g, '').length < 10) e.phone = 'Telefone com DDD.'
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'E-mail inválido.'
    if (!f.consent) e.consent = 'É preciso autorizar o contato para a clínica confirmar.'
    setErrors(e)
    const first = Object.keys(e)[0]
    if (first) document.getElementById(`pb-${first}`)?.focus()
    return !first
  }

  const submit = () => {
    if (!svc || !slot || !validate()) return
    act(() => {
      const name = f.name.trim().replace(/\s+/g, ' ')
      const dups = patientRepo.findDuplicates(org.id, { name, phone: f.phone })
      const now = nowISO()
      const personId = uid('per_')
      const person: Person = { id: personId, tenantId: org.id, createdAt: now, name, phone: f.phone, email: f.email.trim() || undefined, communication: { whatsapp: true, email: !!f.email.trim(), push: false, marketing: false } }
      db.insert(org.id, 'persons', person)
      // Possível duplicidade: NÃO mescla. Cria cadastro vinculado à sugestão para revisão da recepção.
      const patient: Patient = patientRepo.create(org.id, {
        kind: org.segment === 'veterinaria' ? 'animal' : 'human', name: org.segment === 'veterinaria' ? `Animal de ${name.split(' ')[0]} (a identificar)` : name,
        phone: f.phone, email: f.email.trim() || undefined, personId: org.segment === 'veterinaria' ? undefined : personId, allergies: [], clinicalAlerts: [],
        tags: ['Agendamento público', ...(dups.length ? ['Revisar duplicidade'] : [])], unitId, status: 'ativo', pendingDocuments: [], sharing: { portal: true, multidisciplinar: false },
        duplicateOf: dups.length ? dups.map((d) => d.id) : undefined,
      })
      db.insert(org.id, 'links', { id: uid('lk_'), tenantId: org.id, createdAt: now, patientId: patient.id, personId, relation: org.segment === 'veterinaria' ? 'tutor' : 'self', canSeeClinical: true, canSeeFinancial: true, canSchedule: true })
      const ap = createAppointment(org.id, { unitId, patientId: patient.id, professionalId: slot.professionalId, serviceId: svc.id, resourceIds: slot.resourceIds, start: slot.start, end: slot.end, status: 'solicitada', source: 'publico', notes: `Solicitação pela página pública${dups.length ? ' — possível cadastro duplicado, revisar antes de confirmar' : ''}. Consentimento de contato registrado em ${now}.` }, 'Página pública')
      if (dups.length) audit(org.id, { actorId: 'publico', actorName: 'Página pública', action: 'paciente.duplicidade_sugerida', resource: 'patients', resourceId: patient.id, detail: `Possível duplicado de ${dups.map((d) => d.id).join(', ')} — sem mesclagem automática` })
      setDone({ ap, review: dups.length > 0 })
      setStep(3)
    }, 'Solicitação enviada.')
  }

  const steps = ['Serviço e horário', 'Seus dados', 'Confirmação']
  return (
    <PublicShell org={org}>
      <div className="stack" data-tour="page-content" style={{ maxWidth: 760, margin: '0 auto' }}>
        <div className="page-head"><div className="ph-text"><h1>Agendar em {org.name}</h1><p className="muted">Sem cadastro prévio. A clínica confirma o horário.</p></div></div>
        <ol className="cp-steps" aria-label="Etapas">{steps.map((s, i) => <li key={s} aria-current={step === i + 1 ? 'step' : undefined}>{i + 1}. {s}</li>)}</ol>
        {step === 1 && (
          <>
            <section className="pt-card">
              <div className="form-grid">
                <Field label="Serviço"><Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setSlot(null) }}>{services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min{org.publicPage.showPrices && s.priceCents ? ` · ${formatBRL(s.priceCents)}` : ''}</option>)}</Select></Field>
                {units.length > 1 && <Field label="Unidade"><Select value={unitId} onChange={(e) => { setUnitId(e.target.value); setSlot(null) }}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
              </div>
            </section>
            <section className="pt-card"><SlotPicker tenantId={org.id} unitId={unitId} service={svc} professionalId={null} date={date} onDate={(d) => { setDate(d); setSlot(null) }} value={slot} onPick={setSlot} /></section>
            <Button variant="primary" disabled={!slot} onClick={() => setStep(2)} style={{ alignSelf: 'flex-end' }}>Continuar</Button>
          </>
        )}
        {step === 2 && slot && (
          <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); submit() }}>
            <Alert tone="info">Horário escolhido: <strong>{formatDateLong(slot.start, tz)} às {formatTime(slot.start, tz)}</strong> · {svc?.name} · {pros.find((p) => p.id === slot.professionalId)?.name}. Ainda não está reservado: a clínica confirmará.</Alert>
            <section className="pt-card">
              <div className="form-grid">
                <Field label={org.segment === 'veterinaria' ? 'Nome do tutor' : 'Nome completo'} required error={errors.name} id="pb-name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" maxLength={120} /></Field>
                <Field label="Telefone (WhatsApp)" required error={errors.phone} id="pb-phone" hint={demoText('Use um número fictício, ex.: (00) 90000-0000', 'Com DDD, ex.: (00) 90000-0000')}><Input value={f.phone} mask={maskPhone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" autoComplete="tel" /></Field>
                <Field label="E-mail" hint="Opcional — use domínio .exemplo.test" error={errors.email} id="pb-email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" maxLength={160} /></Field>
              </div>
              <div>
                <Checkbox id="pb-consent" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} aria-invalid={errors.consent ? true : undefined} aria-describedby={errors.consent ? 'pb-consent-err' : undefined}
                  label={`Autorizo ${org.name} a entrar em contato por WhatsApp/e-mail sobre esta solicitação.`} hint="Somente mensagens sobre o agendamento. Sem campanhas." />
                {errors.consent && <span id="pb-consent-err" className="error small" role="alert" style={{ color: 'var(--q-danger)' }}>{errors.consent}</span>}
              </div>
              <p className="tiny muted">{demoText('Não informe dados de saúde aqui. Demonstração: use apenas dados fictícios.', 'Não informe dados de saúde aqui.')}</p>
            </section>
            <div className="form-actions">
              <Button onClick={() => setStep(1)}>Voltar</Button>
              <Button type="submit" variant="primary" icon={<CalendarPlus />} disabled={!online} data-tour="primary-action">Enviar solicitação</Button>
            </div>
            {!online && <p className="small" role="status">{OFFLINE_HINT}</p>}
          </form>
        )}
        {step === 3 && done && (
          <section className="pt-card" aria-live="polite">
            <CheckCircle2 aria-hidden="true" style={{ width: 40, height: 40, color: 'var(--q-success)' }} />
            <h2 style={{ fontSize: 20 }}>Solicitação recebida</h2>
            <p>A clínica confirmará o horário de <strong>{formatDateLong(done.ap.start, tz)} às {formatTime(done.ap.start, tz)}</strong> pelo contato informado. Até a confirmação, o horário não está garantido.</p>
            {done.review && <p className="small muted">Encontramos um cadastro parecido; a recepção vai conferir antes de confirmar.</p>}
            <SimBadge>Simulado — nenhuma mensagem real será enviada</SimBadge>
            <div className="row"><ButtonLink to={`/c/${org.slug}`}>Voltar à página da clínica</ButtonLink></div>
          </section>
        )}
      </div>
    </PublicShell>
  )
}

// ---------- Link de proposta ----------
export function ProposalLinkPage() {
  const org = useOutletContext<Organization>()
  const { token = '' } = useParams()
  useCollection(org.id, 'proposals') // re-render em mudanças
  const session = useSession()
  const patients = useCollection(org.id, 'patients')
  const persons = useCollection(org.id, 'persons')
  const p = token.length >= 8 ? findProposalByToken(org.id, token) : undefined
  if (!proposalAvailable(p)) {
    return (
      <PublicShell org={org}>
        <div className="stack" style={{ maxWidth: 560, margin: '24px auto' }} role="alert">
          <ShieldAlert aria-hidden="true" style={{ width: 40, height: 40, color: 'var(--q-text-muted)' }} />
          <h1>Link indisponível</h1>
          <p className="muted">Este link de proposta não é válido, expirou ou foi substituído por uma nova versão. Peça um novo link à clínica.</p>
          <p className="small muted">Contato: {org.contactPhone}</p>
        </div>
      </PublicShell>
    )
  }
  const patient = patients.find((x) => x.id === p!.patientId)
  const payer = persons.find((x) => x.id === (p!.financialResponsibleId ?? patient?.personId))
  const signer = payer?.name ?? patient?.name ?? 'Paciente'
  const by = session?.kind === 'portal' && session.tenantId === org.id ? `Portal (${signer})` : `Link de proposta (${signer})`
  return (
    <PublicShell org={org}>
      <div className="stack" style={{ maxWidth: 860, margin: '0 auto' }}>
        <Alert tone="neutral">{demoText('Links sensíveis futuros exigirão autenticação, expiração e revogação; este protótipo usa apenas dados fictícios.', 'Links sensíveis futuros exigirão autenticação, expiração e revogação.')}</Alert>
        <ProposalExperience org={org} proposalId={p!.id} by={by} signerName={signer} />
      </div>
    </PublicShell>
  )
}
