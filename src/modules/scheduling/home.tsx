// Início da equipe: painel do dia conforme o perfil (recepção, profissional, gestão). Sem métricas decorativas.
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { Play, Stethoscope } from 'lucide-react'
import { APPOINTMENT_STATUS_LABEL } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { useCollection } from '@/data/store'
import { changeAppointmentStatus } from '@/domain/appointments'
import { BLOCKING } from '@/domain/scheduling'
import { formatBRL } from '@/lib/money'
import { addDaysCivil, formatTime, zonedParts } from '@/lib/dates'
import { Alert, Badge, Button, ButtonLink, EmptyState, Kpi, PageHeader, Section, useAction, useLookup } from '@/ui'
import { STATUS_TONE, fmtElapsed, proOpen, scopeUnitIds, today, tzOf, useNow } from './lib'
import './effects'

export function StaffHomePage() {
  const t = useTenant()
  const L = useLookup()
  const nav = useNavigate()
  const actor = useActor()
  const run = useAction()
  const now = useNow(30000)
  const appts = useCollection(t.tenantId, 'appointments')
  const charges = useCollection(t.tenantId, 'charges')
  const waitlist = useCollection(t.tenantId, 'waitlist')
  const freed = useCollection(t.tenantId, 'freedSlots')
  const tz = tzOf(t)
  const d = today(tz)
  const unitIds = scopeUnitIds(t)
  const units = t.allowedUnits.filter((u) => unitIds.includes(u.id))
  const roles = new Set(t.effectiveUser?.memberships.map((m) => m.role) ?? [])
  const isManager = roles.has('clinic_owner') || roles.has('network_manager') || roles.has('unit_manager')
  const isReception = roles.has('reception')
  const myPro = t.access.professionalId
  const dayAppts = appts.filter((a) => unitIds.includes(a.unitId) && zonedParts(a.start, tz).date === d).sort((a, b) => a.start.localeCompare(b.start))
  const first = t.effectiveUser?.name.split(/[\s—-]+/).filter((w) => w && !/^(dr|dra|me|ma|sr|sra)\.?$/i.test(w))[0] ?? ''

  // ---------- profissional ----------
  const mine = myPro ? dayAppts.filter((a) => a.professionalId === myPro && a.status !== 'cancelada') : []
  const start = (id: string) => {
    if (run(() => changeAppointmentStatus(t.tenantId, id, 'em_atendimento', actor.name), 'Atendimento iniciado.')) nav(`${t.base}/atendimento/${id}`)
  }

  // ---------- gestão ----------
  const pros = L.pros.filter((p) => p.active && p.unitIds.some((u) => unitIds.includes(u)))
  const openMin = pros.reduce((acc, p) => acc + proOpen(p, units, d).reduce((s, iv) => s + iv.end - iv.start, 0), 0)
  const busyMin = dayAppts.filter((a) => BLOCKING.includes(a.status)).reduce((s, a) => s + (new Date(a.end).getTime() - new Date(a.start).getTime()) / 60000, 0)
  const occ = openMin ? Math.round((busyMin / openMin) * 100) : 0
  const noShows = dayAppts.filter((a) => a.status === 'faltou').length
  const weekNoShows = appts.filter((a) => unitIds.includes(a.unitId) && a.status === 'faltou' && zonedParts(a.start, tz).date > addDaysCivil(d, -7) && zonedParts(a.start, tz).date <= d).length
  const scopeCharges = charges.filter((c) => unitIds.includes(c.unitId))
  const receivedToday = scopeCharges.flatMap((c) => c.payments).filter((p) => p.status === 'confirmado' && zonedParts(p.at, tz).date === d).reduce((s, p) => s + p.amountCents, 0)
  const overdue = scopeCharges.filter((c) => c.status === 'vencida' || (['aberta', 'parcial'].includes(c.status) && c.dueDate < d))
  const toConfirm = appts.filter((a) => unitIds.includes(a.unitId) && ['solicitada', 'aguardando_confirmacao'].includes(a.status) && new Date(a.start).getTime() > now && new Date(a.start).getTime() < now + 48 * 3600000)
  const waiting = waitlist.filter((w) => unitIds.includes(w.unitId) && w.status === 'aguardando')
  const freeSlots = freed.filter((f) => unitIds.includes(f.unitId) && f.status === 'livre' && new Date(f.start).getTime() > now)
  const conflicts = appts.filter((a) => unitIds.includes(a.unitId) && a.conflictAcknowledged && new Date(a.start).getTime() > now && BLOCKING.includes(a.status))

  // ---------- recepção ----------
  const arrived = dayAppts.filter((a) => a.status === 'chegou')
  const inService = dayAppts.filter((a) => a.status === 'em_atendimento')
  const nextArrivals = dayAppts.filter((a) => ['confirmada', 'aguardando_confirmacao', 'solicitada'].includes(a.status) && new Date(a.end).getTime() > now).slice(0, 8)

  const row = (a: (typeof dayAppts)[number], extra?: React.ReactNode) => (
    <div key={a.id} className="queue-row">
      <div className="stack" style={{ '--gap': '2px' } as CSSProperties}>
        <span className="strong">{formatTime(a.start, tz)} · {L.patient(a.patientId)?.name}</span>
        <span className="queue-meta"><span>{L.service(a.serviceId)?.name}</span><span>{L.pro(a.professionalId)?.name}</span>{units.length > 1 && <span>{L.unit(a.unitId)?.name}</span>}</span>
      </div>
      <div className="row">{<Badge tone={STATUS_TONE[a.status]}>{APPOINTMENT_STATUS_LABEL[a.status]}</Badge>}{extra}</div>
    </div>
  )

  const pend: { label: string; n: number; to: string }[] = [
    { label: 'Aguardando confirmação (próx. 48 h)', n: toConfirm.length, to: `${t.base}/agenda` },
    { label: 'Cobranças vencidas', n: overdue.length, to: `${t.base}/financeiro` },
    { label: 'Vagas liberadas sem oferta', n: freeSlots.length, to: `${t.base}/lista-espera` },
    { label: 'Pessoas na lista de espera', n: waiting.length, to: `${t.base}/lista-espera` },
    { label: 'Encaixes com conflito autorizado (futuros)', n: conflicts.length, to: `${t.base}/agenda` },
  ]

  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title={`Olá${first ? `, ${first}` : ''}`} subtitle={`${new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(now))} · ${units.length > 1 ? 'todas as unidades permitidas' : units[0]?.name ?? ''}`}
        actions={t.can('agenda', 'create') ? <ButtonLink to={`${t.base}/agenda?novo=1`} variant="primary" data-tour="primary-action">Novo agendamento</ButtonLink> : myPro ? <ButtonLink to={`${t.base}/agenda`} variant="primary">Minha agenda</ButtonLink> : undefined} />

      {myPro && (
        <Section title={`Meus atendimentos de hoje (${mine.length})`} id="mine">
          {mine.length === 0 ? <EmptyState title="Sem atendimentos hoje" /> : mine.map((a) => row(a,
            a.status === 'chegou' ? <Button size="sm" variant="primary" icon={<Play />} onClick={() => start(a.id)}>Iniciar atendimento</Button>
              : a.status === 'em_atendimento' ? <ButtonLink size="sm" to={`${t.base}/atendimento/${a.id}`} icon={<Stethoscope />}>Continuar atendimento</ButtonLink>
                : a.status === 'confirmada' ? <span className="small muted">Aguardando chegada</span> : null))}
        </Section>
      )}

      {(isReception || isManager) && (
        <div className="grid grid-2">
          <Section title={`Na recepção agora (${arrived.length + inService.length})`} id="fila" actions={<ButtonLink size="sm" to={`${t.base}/recepcao`}>Abrir recepção</ButtonLink>}>
            {arrived.length + inService.length === 0 ? <p className="muted small">Ninguém aguardando.</p> : [...arrived, ...inService].map((a) => row(a, <span className="small muted">{a.status === 'chegou' ? `espera ${fmtElapsed(a.arrivedAt, now)}` : `há ${fmtElapsed(a.startedAt, now)}`}</span>))}
          </Section>
          <Section title="Próximas chegadas" id="prox">
            {nextArrivals.length === 0 ? <p className="muted small">Sem novas chegadas previstas hoje.</p> : nextArrivals.map((a) => row(a))}
          </Section>
        </div>
      )}

      {isManager && (
        <>
          <div className="grid grid-4">
            <Kpi label="Ocupação hoje" value={`${occ}%`} foot={`${Math.round(busyMin / 60)} h agendadas de ${Math.round(openMin / 60)} h de jornada`} />
            <Kpi label="Faltas" value={noShows} foot={`${weekNoShows} nos últimos 7 dias`} />
            <Kpi label="Recebido hoje" value={formatBRL(receivedToday)} foot="Pagamentos confirmados (simulados)" />
            <Kpi label="Atendimentos hoje" value={dayAppts.filter((a) => a.status !== 'cancelada').length} foot={`${dayAppts.filter((a) => a.status === 'concluida').length} concluídos`} />
          </div>
          <Section title="Pendências" id="pend">
            <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, '--gap': '0px' } as CSSProperties}>
              {pend.map((p) => (
                <li key={p.label} className="queue-row">
                  <span>{p.label}</span>
                  <span className="row"><Badge tone={p.n ? 'warning' : 'success'} plain>{p.n}</Badge>{p.n > 0 && <ButtonLink size="sm" variant="ghost" to={p.to}>Ver</ButtonLink>}</span>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      {!myPro && !isReception && !isManager && (
        <Alert tone="info" title="Seu perfil não opera a agenda">Use o menu para acessar as áreas liberadas para você.</Alert>
      )}
    </div>
  )
}
