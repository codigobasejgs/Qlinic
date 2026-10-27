// Recepção: busca rápida, cadastro progressivo, fila do dia, chamada, documentos pendentes, caixa e recebimentos.
import { useMemo, useState, type CSSProperties } from 'react'
import { Megaphone, UserPlus, Wallet } from 'lucide-react'
import type { Appointment, ID, Patient, PaymentMethod } from '@/domain/types'
import { APPOINTMENT_STATUS_LABEL, PAYMENT_METHOD_LABEL } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { useCollection } from '@/data/store'
import { audit, chargeBalance, patientRepo } from '@/data/repositories'
import { callPatient, changeAppointmentStatus } from '@/domain/appointments'
import { closeCash, expectedCash, openCash, receiveAtDesk } from '@/domain/cash'
import { getPolicies } from '@/domain/settings'
import { visibleClinicalAlerts } from '@/domain/access'
import { formatBRL, parseBRL } from '@/lib/money'
import { formatCivil, formatTime, zonedParts } from '@/lib/dates'
import { isValidCPF, maskCPF, maskPhone, normalize } from '@/lib/util'
import { Alert, Badge, Button, ButtonLink, Dialog, EmptyState, Field, Input, PageHeader, Section, Select, SimBadge, Tabs, TabPanel, useAction, useConfirm, useLookup, useToast } from '@/ui'
import { AppointmentDetailDialog, AppointmentFormDialog } from './apptForm'
import { STATUS_TONE, assignDeskTicket, fmtElapsed, scopeUnitIds, today, tzOf, useNow } from './lib'

export function ReceptionPage() {
  const t = useTenant()
  const [tab, setTab] = useState('fila')
  const [newOpen, setNewOpen] = useState(false)
  const canRead = t.can('recepcao')
  if (!canRead) return <><PageHeader title="Recepção" /><Alert tone="info" title="Sem acesso à recepção">Seu perfil não inclui a operação de recepção.</Alert></>
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Recepção" subtitle={t.unit?.name ?? 'Todas as unidades permitidas'}
        actions={t.can('pacientes', 'create') ? <Button variant="primary" icon={<UserPlus />} data-tour="primary-action" onClick={() => setNewOpen(true)}>Cadastro rápido</Button> : undefined} />
      <QuickSearch />
      <Tabs label="Áreas da recepção" value={tab} onChange={setTab} tabs={[{ id: 'fila', label: 'Fila do dia' }, { id: 'docs', label: 'Documentos pendentes' }, { id: 'caixa', label: 'Caixa e recebimentos' }]} />
      <TabPanel>{tab === 'fila' ? <Queue /> : tab === 'docs' ? <PendingDocs /> : <CashDesk />}</TabPanel>
      {newOpen && <QuickRegister onClose={() => setNewOpen(false)} />}
    </div>
  )
}

function QuickSearch() {
  const t = useTenant()
  const patients = useCollection(t.tenantId, 'patients')
  const [q, setQ] = useState('')
  const [sched, setSched] = useState<ID | null>(null)
  const digits = q.replace(/\D/g, '')
  const res = q.trim().length < 2 ? [] : patients.filter((p) => p.status === 'ativo' && (normalize(p.name).includes(normalize(q)) || (digits.length >= 3 && ((p.cpf ?? '').replace(/\D/g, '').includes(digits) || (p.phone ?? '').replace(/\D/g, '').includes(digits))))).slice(0, 8)
  return (
    <section className="stack" style={{ '--gap': '8px' } as CSSProperties} aria-label="Busca rápida de paciente">
      <Field label="Buscar paciente (nome, CPF ou telefone)">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: Ana, 000.123 ou 90000" autoComplete="off" />
      </Field>
      {q.trim().length >= 2 && (
        <div aria-live="polite">
          {res.length === 0 ? <p className="small muted">Nenhum paciente encontrado. Use “Cadastro rápido”.</p> : (
            <ul className="sch-list">
              {res.map((p) => (
                <li key={p.id} className="list-card">
                  <div className="row between">
                    <div className="stack" style={{ '--gap': '2px' } as CSSProperties}>
                      <span className="strong">{p.name}{p.duplicateOf?.length ? <> <Badge tone="warning">Possível duplicidade</Badge></> : null}</span>
                      <span className="small muted">{[p.cpf, p.phone, p.birthDate && `Nasc. ${formatCivil(p.birthDate)}`].filter(Boolean).join(' · ') || 'Cadastro incompleto'}</span>
                    </div>
                    <div className="row">
                      {t.can('agenda', 'create') && <Button size="sm" onClick={() => setSched(p.id)}>Agendar</Button>}
                      {t.can('pacientes') && <ButtonLink size="sm" variant="ghost" to={`${t.base}/pacientes/${p.id}`}>Ficha</ButtonLink>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {sched && <AppointmentFormDialog init={{ patientId: sched }} onClose={() => setSched(null)} />}
    </section>
  )
}

function QuickRegister({ onClose }: { onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const toast = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [cpf, setCpf] = useState('')
  const [birth, setBirth] = useState('')
  const [tried, setTried] = useState(false)
  const [ack, setAck] = useState(false)
  const unitId = t.unitId ?? t.allowedUnits[0]?.id ?? ''
  const dups = name.trim().length >= 3 || cpf || phone.replace(/\D/g, '').length >= 10 ? patientRepo.findDuplicates(t.tenantId, { name: name.trim(), cpf: cpf || undefined, phone: phone || undefined, birthDate: birth || undefined }) : []
  const errName = !name.trim() || name.trim().split(/\s+/).length < 2 ? 'Informe nome e sobrenome.' : null
  const errPhone = phone.replace(/\D/g, '').length < 10 ? 'Telefone com DDD.' : null
  const errCpf = cpf && !isValidCPF(cpf) ? 'CPF inválido.' : null
  const save = () => {
    setTried(true)
    if (errName || errPhone || errCpf) return
    if (dups.length && !ack) return toast('Revise as possíveis duplicidades antes de salvar.', 'error')
    const p = patientRepo.create(t.tenantId, {
      kind: 'human', name: name.trim(), phone, cpf: cpf || undefined, birthDate: birth || undefined, allergies: [], clinicalAlerts: [], tags: ['Cadastro rápido'], unitId, status: 'ativo',
      pendingDocuments: ['Completar cadastro (documento, endereço, responsável)'], sharing: { portal: false, multidisciplinar: false },
      duplicateOf: dups.length ? dups.map((d) => d.id) : undefined,
    } satisfies Omit<Patient, 'id' | 'tenantId' | 'createdAt'>)
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'paciente.cadastro_rapido', resource: 'patients', resourceId: p.id, unitId, detail: dups.length ? `Sugestão de duplicidade com ${dups.length} cadastro(s) — revisão manual` : undefined })
    toast(dups.length ? `${p.name} cadastrado e marcado para revisão de duplicidade.` : `${p.name} cadastrado. Complete os dados depois.`)
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title="Cadastro rápido" description="Mínimo: nome e telefone. Os demais dados podem ser completados depois na ficha."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar cadastro</Button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Nome completo" required error={tried ? errName : null}><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></Field>
          <Field label="Telefone" required error={tried ? errPhone : null}><Input value={phone} mask={maskPhone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(00) 90000-0000" /></Field>
          <Field label="CPF (opcional)" error={tried ? errCpf : null}><Input value={cpf} mask={maskCPF} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" /></Field>
          <Field label="Nascimento (opcional)"><Input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} /></Field>
        </div>
        {dups.length > 0 && (
          <Alert tone="warning" title={`Possível duplicidade (${dups.length})`}>
            <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{dups.map((d) => <li key={d.id}>{d.name} · {d.phone ?? 'sem telefone'}{d.birthDate ? ` · ${formatCivil(d.birthDate)}` : ''}</li>)}</ul>
            <p className="small">Não fazemos mesclagem automática. Se for a mesma pessoa, use o cadastro existente; se não, confirme abaixo — o novo cadastro fica sinalizado para revisão.</p>
            <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>Revisei: é outra pessoa (manter sinalização para revisão)</span></label>
          </Alert>
        )}
      </div>
    </Dialog>
  )
}

function Queue() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const L = useLookup()
  const appts = useCollection(t.tenantId, 'appointments')
  const now = useNow(15000)
  const [detail, setDetail] = useState<ID | null>(null)
  const tz = tzOf(t)
  const d = today(tz)
  const unitIds = scopeUnitIds(t)
  const day = appts.filter((a) => unitIds.includes(a.unitId) && zonedParts(a.start, tz).date === d).sort((a, b) => a.start.localeCompare(b.start))
  const canUpd = (a: Appointment) => t.can('recepcao', 'update', { unitId: a.unitId })
  const groups: { title: string; items: Appointment[] }[] = [
    { title: 'Aguardando atendimento', items: day.filter((a) => a.status === 'chegou').sort((a, b) => (a.arrivedAt ?? '').localeCompare(b.arrivedAt ?? '')) },
    { title: 'Em atendimento', items: day.filter((a) => a.status === 'em_atendimento') },
    { title: 'Previstos', items: day.filter((a) => ['confirmada', 'aguardando_confirmacao', 'solicitada'].includes(a.status)) },
    { title: 'Encerrados', items: day.filter((a) => ['concluida', 'faltou', 'cancelada'].includes(a.status)) },
  ]
  const arrive = (a: Appointment) => run(() => {
    if (a.status === 'solicitada' || a.status === 'aguardando_confirmacao') changeAppointmentStatus(t.tenantId, a.id, 'confirmada', actor.name, 'Confirmado na chegada')
    changeAppointmentStatus(t.tenantId, a.id, 'chegou', actor.name)
    const ticket = assignDeskTicket(t.tenantId, a.id, tz)
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'recepcao.chegada_manual', resource: 'appointments', resourceId: a.id, unitId: a.unitId, detail: `Senha ${ticket}` })
  }, `Chegada registrada: ${L.patient(a.patientId)?.name}.`)
  const call = (a: Appointment) => run(() => { if (!a.checkIn?.ticket) assignDeskTicket(t.tenantId, a.id, tz); callPatient(t.tenantId, a.id) }, 'Chamada enviada ao painel.')
  const noShow = async (a: Appointment) => { const r = await confirm({ title: 'Registrar falta?', confirmLabel: 'Registrar falta', danger: true }); if (r.ok) run(() => changeAppointmentStatus(t.tenantId, a.id, 'faltou', actor.name), 'Falta registrada.') }

  return (
    <div className="stack">
      <div className="row between">
        <p className="small muted" aria-live="polite">{groups[0].items.length} aguardando · {groups[1].items.length} em atendimento · {groups[2].items.length} previstos</p>
        <div className="row">
          <ButtonLink size="sm" to={`/c/${t.org.slug}/painel`} target="_blank" rel="noopener" icon={<Megaphone />}>Abrir painel de chamada</ButtonLink>
          <ButtonLink size="sm" to={`/c/${t.org.slug}/totem`} target="_blank" rel="noopener">Abrir totem</ButtonLink>
        </div>
      </div>
      {day.length === 0 && <EmptyState title="Sem agendamentos hoje" />}
      {groups.filter((g) => g.items.length).map((g) => (
        <Section key={g.title} title={`${g.title} (${g.items.length})`}>
          {g.items.map((a) => {
            const p = L.patient(a.patientId)
            const alerts = p ? visibleClinicalAlerts(t, p) : []
            return (
              <div key={a.id} className="queue-row">
                <div className="stack" style={{ '--gap': '2px', minWidth: 0 } as CSSProperties}>
                  <button type="button" className="btn-link" style={{ minHeight: 0, padding: 0, textAlign: 'left' }} onClick={() => setDetail(a.id)}>{formatTime(a.start, tz)} · {p?.name}</button>
                  <span className="queue-meta">
                    <span>{L.service(a.serviceId)?.name}</span><span>{L.pro(a.professionalId)?.name}</span>
                    {a.checkIn?.ticket && <span>Senha <strong>{a.checkIn.ticket}</strong></span>}
                    {a.status === 'chegou' && <span>Espera: <strong>{fmtElapsed(a.arrivedAt, now)}</strong></span>}
                    {a.status === 'em_atendimento' && <span>Em atendimento há <strong>{fmtElapsed(a.startedAt, now)}</strong></span>}
                    {a.calledAt && a.status === 'chegou' && <span>Chamado às {formatTime(a.calledAt, tz)}</span>}
                    {p && p.pendingDocuments.length > 0 && <span>{p.pendingDocuments.length} doc. pendente(s)</span>}
                  </span>
                  {alerts.length > 0 && <span className="small" style={{ color: 'var(--q-danger)' }}>Alerta clínico: {alerts.join(' · ')}</span>}
                </div>
                <div className="row">
                  <Badge tone={STATUS_TONE[a.status]}>{APPOINTMENT_STATUS_LABEL[a.status]}</Badge>
                  {canUpd(a) && ['confirmada', 'aguardando_confirmacao', 'solicitada'].includes(a.status) && <Button size="sm" variant="primary" onClick={() => arrive(a)}>Registrar chegada</Button>}
                  {canUpd(a) && ['confirmada', 'aguardando_confirmacao'].includes(a.status) && new Date(a.start).getTime() < now && <Button size="sm" variant="ghost" onClick={() => noShow(a)}>Falta</Button>}
                  {canUpd(a) && a.status === 'chegou' && <Button size="sm" icon={<Megaphone />} onClick={() => call(a)}>{a.calledAt ? 'Chamar novamente' : 'Chamar'}</Button>}
                </div>
              </div>
            )
          })}
        </Section>
      ))}
      {detail && <AppointmentDetailDialog id={detail} onClose={() => setDetail(null)} onEdit={() => setDetail(null)} />}
    </div>
  )
}

function PendingDocs() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const patients = useCollection(t.tenantId, 'patients')
  const appts = useCollection(t.tenantId, 'appointments')
  const tz = tzOf(t)
  const d = today(tz)
  const unitIds = scopeUnitIds(t)
  const todayIds = new Set(appts.filter((a) => unitIds.includes(a.unitId) && zonedParts(a.start, tz).date === d && a.status !== 'cancelada').map((a) => a.patientId))
  const list = patients.filter((p) => p.status === 'ativo' && unitIds.includes(p.unitId) && p.pendingDocuments.length).sort((a, b) => Number(todayIds.has(b.id)) - Number(todayIds.has(a.id)))
  const resolve = (p: Patient, doc: string) => run(() => {
    patientRepo.update(t.tenantId, p.id, { pendingDocuments: p.pendingDocuments.filter((x) => x !== doc) })
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'paciente.documento_recebido', resource: 'patients', resourceId: p.id, detail: doc })
  }, `Pendência resolvida: ${doc}.`)
  if (!list.length) return <EmptyState title="Nenhum documento pendente" />
  return (
    <div className="stack" style={{ '--gap': '0px' } as CSSProperties}>
      {list.map((p) => (
        <div key={p.id} className="queue-row">
          <div className="stack" style={{ '--gap': '4px' } as CSSProperties}>
            <span className="strong">{p.name} {todayIds.has(p.id) && <Badge tone="info">Atendimento hoje</Badge>}</span>
            <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
              {p.pendingDocuments.map((doc) => (
                <li key={doc} className="row between" style={{ display: 'list-item' }}>
                  {doc} {t.can('pacientes', 'update') && <Button size="sm" variant="ghost" onClick={() => resolve(p, doc)}>Marcar como recebido</Button>}
                </li>
              ))}
            </ul>
          </div>
          {t.can('pacientes') && <ButtonLink size="sm" variant="ghost" to={`${t.base}/pacientes/${p.id}`}>Ficha</ButtonLink>}
        </div>
      ))}
    </div>
  )
}

function CashDesk() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const toast = useToast()
  const L = useLookup()
  const sessions = useCollection(t.tenantId, 'cashSessions')
  const charges = useCollection(t.tenantId, 'charges')
  const [unitId, setUnitId] = useState<ID>(t.unitId ?? t.allowedUnits[0]?.id ?? '')
  const [opening, setOpening] = useState('100,00')
  const [counted, setCounted] = useState('')
  const [patientQ, setPatientQ] = useState('')
  const [recv, setRecv] = useState<{ chargeId: ID; amount: string; method: PaymentMethod } | null>(null)
  const session = sessions.find((s) => s.status === 'aberto' && s.unitId === unitId && s.operatorId === actor.id)
  const methods = getPolicies(t.tenantId, unitId).payments.allowedMethods.filter((m) => ['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'pix_manual'].includes(m))
  const canCash = t.can('caixa', 'create', { unitId })
  const open = useMemo(() => charges.filter((c) => c.unitId === unitId && ['aberta', 'parcial', 'vencida'].includes(c.status) && chargeBalance(c) > 0), [charges, unitId])
  const shown = patientQ.trim().length >= 2 ? open.filter((c) => normalize(L.patient(c.patientId)?.name ?? '').includes(normalize(patientQ))) : open.slice(0, 10)

  if (!canCash) return <Alert tone="info" title="Recebimentos não autorizados">Seu perfil não pode operar o caixa nesta unidade.</Alert>
  return (
    <div className="stack">
      <SimBadge>Simulado — sem cobrança real</SimBadge>
      {t.allowedUnits.length > 1 && (
        <Field label="Unidade do caixa"><Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>{t.allowedUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
      )}
      {!session ? (
        <Section title="Caixa fechado">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Fundo de troco (R$)"><Input value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" /></Field>
            <Button variant="primary" icon={<Wallet />} onClick={() => { const c = parseBRL(opening); if (c === null) return toast('Valor inválido.', 'error'); run(() => openCash(t.tenantId, unitId, actor, c), 'Caixa aberto.') }}>Abrir caixa</Button>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>Recebimentos presenciais exigem caixa aberto por operador e unidade.</p>
        </Section>
      ) : (
        <Section title={`Caixa aberto — ${session.operatorName}`} actions={<Badge tone="success">Aberto às {formatTime(session.openedAt, tzOf(t))}</Badge>}>
          <div className="stack">
            <p className="small">Fundo: {formatBRL(session.openingCents)} · Recebimentos: {session.movements.filter((m) => m.kind === 'recebimento').length} · Esperado em dinheiro: <strong>{formatBRL(expectedCash(session))}</strong></p>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <Field label="Dinheiro contado (R$)"><Input value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="decimal" /></Field>
              <Button onClick={() => { const c = parseBRL(counted); if (c === null) return toast('Informe o valor contado.', 'error'); if (run(() => closeCash(t.tenantId, session.id, c, actor), `Caixa fechado. Diferença: ${formatBRL(c - expectedCash(session))}.`)) setCounted('') }}>Fechar caixa</Button>
            </div>
          </div>
        </Section>
      )}
      <Section title="Receber cobranças do paciente">
        <div className="stack">
          <Field label="Filtrar por paciente"><Input type="search" value={patientQ} onChange={(e) => setPatientQ(e.target.value)} /></Field>
          {shown.length === 0 ? <p className="small muted">Nenhuma cobrança em aberto.</p> : shown.map((c) => (
            <div key={c.id} className="queue-row">
              <div className="stack" style={{ '--gap': '2px' } as CSSProperties}>
                <span className="strong">{L.patient(c.patientId)?.name}</span>
                <span className="queue-meta"><span>{c.description}</span><span>Venc. {formatCivil(c.dueDate)}</span><span>Saldo <strong>{formatBRL(chargeBalance(c))}</strong></span></span>
              </div>
              <div className="row">
                <Badge tone={c.status === 'vencida' ? 'danger' : c.status === 'parcial' ? 'warning' : 'neutral'}>{c.status}</Badge>
                <Button size="sm" disabled={!session} title={!session ? 'Abra o caixa primeiro' : undefined} onClick={() => setRecv({ chargeId: c.id, amount: (chargeBalance(c) / 100).toFixed(2).replace('.', ','), method: methods[0] ?? 'dinheiro' })}>Receber</Button>
              </div>
            </div>
          ))}
          {!session && <p className="small muted">Abra o caixa para habilitar recebimentos.</p>}
        </div>
      </Section>
      {recv && (
        <Dialog open onClose={() => setRecv(null)} title="Registrar recebimento" footer={<><Button onClick={() => setRecv(null)}>Cancelar</Button><Button variant="primary" onClick={() => {
          const cents = parseBRL(recv.amount)
          if (cents === null) return toast('Valor inválido.', 'error')
          if (run(() => receiveAtDesk(t.tenantId, { chargeId: recv.chargeId, amountCents: cents, method: recv.method, operator: actor, unitId }), `Recebido ${formatBRL(cents)} (simulado).`)) setRecv(null)
        }}>Confirmar recebimento</Button></>}>
          <div className="stack">
            <SimBadge />
            <Field label="Valor (R$)" required><Input value={recv.amount} onChange={(e) => setRecv({ ...recv, amount: e.target.value })} inputMode="decimal" /></Field>
            <Field label="Forma de pagamento" hint="Formas permitidas pela política da clínica."><Select value={recv.method} onChange={(e) => setRecv({ ...recv, method: e.target.value as PaymentMethod })}>{methods.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}</Select></Field>
          </div>
        </Dialog>
      )}
    </div>
  )
}
