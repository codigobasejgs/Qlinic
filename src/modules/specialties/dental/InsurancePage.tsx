// /convenios — operadoras fictícias, carteirinhas, elegibilidade SIMULADA, autorizações, guias, lotes, glosas, recurso e conciliação.
// TISS/TUSS = integração versionada futura; aqui só artefato DEMONSTRATIVO claramente marcado.
import { useState } from 'react'
import { Download, Plus, Search } from 'lucide-react'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { Alert, Badge, Button, DataTable, Dialog, Field, Input, Kpi, PageHeader, Section, Select, SimBadge, Tabs, TabPanel, Textarea, useAction, useConfirm, useLookup, usePatientParam, PatientPicker, type Column, type Tone } from '@/ui'
import { formatCivil, formatDateTime, nowISO, todayCivil } from '@/lib/dates'
import { formatBRL, parseBRL } from '@/lib/money'
import { downloadText, uid } from '@/lib/util'
import {
  ELIGIBILITY_LABEL, TISS_MARK, addGlosa, appealGlosa, buildTissArtifact, guideGlosado, guideTotal, makeCardNumber, reconcile, registerGuidePayment, resolveAppeal,
  simulateEligibility, transitionBatch, type Authorization, type BatchStatus, type Guide, type GuideBatch, type InsuranceCard, type InsurancePayer,
} from './medicine'
import { NoAccess, S, patientAllowed } from './common'

const ELIG_TONE = { elegivel: 'success', carencia: 'warning', carteira_invalida: 'danger', vencida: 'danger' } as const
const AUTH_TONE: Record<Authorization['status'], Tone> = { solicitada: 'warning', autorizada: 'success', negada: 'danger' }
const BATCH_LABEL: Record<BatchStatus, string> = { aberto: 'Aberto', fechado: 'Fechado', enviado: 'Enviado (simulado)', processado: 'Processado' }
const GUIDE_LABEL: Record<Guide['status'], string> = { aberta: 'Aberta', em_lote: 'Em lote', enviada: 'Enviada', processada: 'Processada' }

export function InsurancePage() {
  const t = useTenant()
  const [tab, setTab] = useState('carteirinhas')
  const canRead = t.can('financeiro') || t.can('recepcao')
  const canWrite = t.can('financeiro', 'create')
  const canManage = t.can('financeiro', 'update')
  if (!t.moduleOn('convenios')) return <><PageHeader title="Convênios" /><NoAccess what="o módulo de Convênios (desligado neste plano)" resource="módulo Convênios" /></>
  const tabs = [{ id: 'carteirinhas', label: 'Carteirinhas e elegibilidade' }, { id: 'autorizacoes', label: 'Autorizações' }, { id: 'guias', label: 'Guias' }, { id: 'lotes', label: 'Lotes' }, { id: 'glosas', label: 'Glosas e conciliação' }, { id: 'operadoras', label: 'Operadoras' }]
  return (
    <>
      <PageHeader title="Convênios" subtitle="Faturamento de convênios em modo demonstrativo." breadcrumbs={[{ label: 'Início', to: t.base }, { label: 'Convênios' }]} actions={<SimBadge>Simulado — sem envio à operadora</SimBadge>} />
      <div className="stack" data-tour="page-content">
        {!canRead ? <NoAccess what="o faturamento de convênios" resource="financeiro ou recepção" /> : (
          <>
            <Alert tone="info" title="TISS/TUSS: integração versionada futura">Operadoras, códigos e retornos são fictícios. Nenhum arquivo aqui é TISS homologado.</Alert>
            {!canWrite && <Alert tone="neutral">Seu perfil consulta convênios; registrar guias, lotes e glosas é do financeiro/recepção.</Alert>}
            <Tabs label="Seções de convênios" tabs={tabs} value={tab} onChange={setTab} />
            <TabPanel>
              {tab === 'carteirinhas' && <CardsTab canWrite={canWrite || t.can('recepcao', 'create')} />}
              {tab === 'autorizacoes' && <AuthTab canWrite={canWrite || t.can('recepcao', 'create')} />}
              {tab === 'guias' && <GuidesTab canWrite={canWrite} />}
              {tab === 'lotes' && <BatchesTab canManage={canManage} />}
              {tab === 'glosas' && <GlosasTab canManage={canManage} />}
              {tab === 'operadoras' && <PayersTab canManage={canManage} />}
            </TabPanel>
          </>
        )}
      </div>
    </>
  )
}

function usePayers() {
  const t = useTenant()
  const payers = useCollection(t.tenantId, 'insurancePayers')
  return { payers, payer: (id?: string) => payers.find((p) => p.id === id) }
}

// ---------------- Carteirinhas + elegibilidade ----------------
function CardsTab({ canWrite }: { canWrite: boolean }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const L = useLookup()
  const { payers, payer } = usePayers()
  const [patientId, setPatientId] = usePatientParam()
  const cards = useCollection(t.tenantId, 'insuranceCards').filter((c) => !patientId || c.patientId === patientId)
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ payerId: '', number: '', plan: '', start: todayCivil(), until: '' })
  const check = (c: InsuranceCard) => run(() => {
    const p = payer(c.payerId)
    if (!p) throw new Error('Operadora não encontrada.')
    const r = simulateEligibility(c, p, todayCivil())
    db.update(t.tenantId, 'insuranceCards', c.id, { checks: [...c.checks, { at: nowISO(), result: r.result, message: r.message, by: actor.name }] })
    return r
  }, 'Elegibilidade verificada (simulado).')
  const create = () => run(() => {
    if (!patientId) throw new Error('Selecione o paciente.')
    if (!f.payerId) throw new Error('Escolha a operadora.')
    if (f.number.replace(/\D/g, '').length !== 16) throw new Error('Carteirinha deve ter 16 dígitos.')
    if (!f.until || f.until <= f.start) throw new Error('Validade deve ser posterior ao início.')
    db.insert(t.tenantId, 'insuranceCards', { id: uid('cart_'), tenantId: t.tenantId, createdAt: nowISO(), patientId, payerId: f.payerId, cardNumber: f.number.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 '), plan: f.plan || 'Plano (fictício)', startDate: f.start, validUntil: f.until, checks: [] })
    setOpen(false)
  }, 'Carteirinha cadastrada.')
  const cols: Column<InsuranceCard>[] = [
    { id: 'p', header: 'Paciente', cell: (c) => L.patient(c.patientId)?.name ?? '—', value: (c) => L.patient(c.patientId)?.name },
    { id: 'op', header: 'Operadora', cell: (c) => payer(c.payerId)?.name ?? '—' },
    { id: 'n', header: 'Carteirinha', cell: (c) => <span className="mono">{c.cardNumber}</span> },
    { id: 'v', header: 'Validade', cell: (c) => formatCivil(c.validUntil), value: (c) => c.validUntil },
    { id: 'e', header: 'Última elegibilidade', cell: (c) => { const last = c.checks[c.checks.length - 1]; return last ? <span className="stack" style={S(2)}><Badge tone={ELIG_TONE[last.result]}>{ELIGIBILITY_LABEL[last.result]}</Badge><span className="tiny muted">{last.message}</span></span> : <span className="muted small">Não verificada</span> } },
  ]
  return (
    <div className="stack">
      <div className="panel"><div className="panel-body row" style={{ alignItems: 'flex-end' }}>
        <div className="grow" style={{ maxWidth: 420 }}><PatientPicker value={patientId} onChange={setPatientId} label="Filtrar por paciente" filter={(x) => patientAllowed(t, x)} /></div>
        {canWrite && patientId && <Button variant="primary" icon={<Plus />} onClick={() => { setF({ payerId: payers.find((p) => p.active)?.id ?? '', number: makeCardNumber(String(Date.now()).slice(-15)), plan: '', start: todayCivil(), until: '' }); setOpen(true) }}>Nova carteirinha</Button>}
      </div></div>
      <Section title="Carteirinhas" actions={<SimBadge>Elegibilidade simulada</SimBadge>}>
        <DataTable caption="Carteirinhas de convênio" rows={cards} columns={cols} rowKey={(c) => c.id} empty={<p className="muted">Nenhuma carteirinha{patientId ? ' para este paciente' : ''}.</p>}
          rowActions={(c) => canWrite ? <Button size="sm" icon={<Search />} onClick={() => check(c)} data-tour="primary-action">Verificar elegibilidade</Button> : null} />
        <p className="tiny muted" style={{ marginTop: 8 }}>Regra demonstrativa determinística: dígito verificador da carteirinha, validade e carência da operadora. Nenhuma consulta real é feita.</p>
      </Section>
      <Dialog open={open} onClose={() => setOpen(false)} title="Nova carteirinha" footer={<><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" onClick={create}>Cadastrar</Button></>}>
        <div className="form-grid">
          <Field label="Operadora"><Select value={f.payerId} onChange={(e) => setF({ ...f, payerId: e.target.value })}>{payers.map((p) => <option key={p.id} value={p.id} disabled={!p.active}>{p.name}{p.active ? '' : ' (inativa)'}</option>)}</Select></Field>
          <Field label="Número (16 dígitos, fictício)" hint="Sugerido com dígito verificador demonstrativo válido."><Input className="mono" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
          <Field label="Plano"><Input value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} /></Field>
          <Field label="Início da vigência"><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Validade"><Input type="date" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} /></Field>
        </div>
      </Dialog>
    </div>
  )
}

// ---------------- Autorizações ----------------
function AuthTab({ canWrite }: { canWrite: boolean }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const L = useLookup()
  const { payer } = usePayers()
  const list = useCollection(t.tenantId, 'authorizations').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const cards = useCollection(t.tenantId, 'insuranceCards')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ cardId: '', serviceId: '' })
  const create = () => run(() => {
    const c = cards.find((x) => x.id === f.cardId)
    if (!c || !f.serviceId) throw new Error('Escolha carteirinha e procedimento.')
    db.insert(t.tenantId, 'authorizations', { id: uid('aut_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: c.patientId, payerId: c.payerId, serviceId: f.serviceId, status: 'solicitada', history: [{ at: nowISO(), from: null, to: 'solicitada', by: actor.name }] })
    setOpen(false)
  }, 'Autorização solicitada (simulado).')
  const decide = async (a: Authorization, to: 'autorizada' | 'negada') => {
    let reason: string | undefined
    if (to === 'negada') { const r = await confirm({ title: 'Registrar negativa', requireReason: true, reasonLabel: 'Motivo informado pela operadora', danger: true }); if (!r.ok) return; reason = r.reason }
    run(() => db.update(t.tenantId, 'authorizations', a.id, (p) => {
      if (p.status !== 'solicitada') throw new Error('Autorização já respondida.')
      return { ...p, status: to, reason, number: to === 'autorizada' ? `AUT-DEMO-${String(list.length + 1).padStart(4, '0')}` : undefined, history: [...p.history, { at: nowISO(), from: p.status, to, by: actor.name, reason }] }
    }), to === 'autorizada' ? 'Resposta registrada: autorizada (simulado).' : 'Resposta registrada: negada.')
  }
  const cols: Column<Authorization>[] = [
    { id: 'p', header: 'Paciente', cell: (a) => L.patient(a.patientId)?.name ?? '—' },
    { id: 's', header: 'Procedimento', cell: (a) => L.service(a.serviceId)?.name ?? '—' },
    { id: 'o', header: 'Operadora', cell: (a) => payer(a.payerId)?.name ?? '—' },
    { id: 'st', header: 'Status', cell: (a) => <span className="stack" style={S(2)}><Badge tone={AUTH_TONE[a.status]}>{a.status === 'solicitada' ? 'Solicitada' : a.status === 'autorizada' ? `Autorizada ${a.number ?? ''}` : 'Negada'}</Badge>{a.reason && <span className="tiny muted">{a.reason}</span>}</span>, value: (a) => a.status },
    { id: 'd', header: 'Atualizado', cell: (a) => formatDateTime(a.history[a.history.length - 1].at) },
  ]
  return (
    <Section title="Autorizações" actions={canWrite ? <Button variant="primary" icon={<Plus />} onClick={() => { setF({ cardId: cards[0]?.id ?? '', serviceId: L.services[0]?.id ?? '' }); setOpen(true) }}>Solicitar autorização</Button> : undefined}>
      <DataTable caption="Autorizações de procedimentos" rows={list} columns={cols} rowKey={(a) => a.id} empty={<p className="muted">Sem autorizações.</p>}
        rowActions={(a) => canWrite && a.status === 'solicitada' ? <><Button size="sm" onClick={() => decide(a, 'autorizada')}>Autorizada</Button><Button size="sm" variant="ghost" onClick={() => decide(a, 'negada')}>Negada</Button></> : null} />
      <p className="tiny muted" style={{ marginTop: 8 }}>A resposta da operadora é registrada manualmente (simulação). Sem webservice real.</p>
      <Dialog open={open} onClose={() => setOpen(false)} title="Solicitar autorização" footer={<><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" onClick={create}>Solicitar</Button></>}>
        <div className="form-grid">
          <Field label="Carteirinha"><Select value={f.cardId} onChange={(e) => setF({ ...f, cardId: e.target.value })}>{cards.map((c) => <option key={c.id} value={c.id}>{L.patient(c.patientId)?.name} — {payer(c.payerId)?.name}</option>)}</Select></Field>
          <Field label="Procedimento"><Select value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>{L.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        </div>
      </Dialog>
    </Section>
  )
}

// ---------------- Guias ----------------
function GuidesTab({ canWrite }: { canWrite: boolean }) {
  const t = useTenant()
  const run = useAction()
  const L = useLookup()
  const { payer } = usePayers()
  const guides = useCollection(t.tenantId, 'guides')
  const cards = useCollection(t.tenantId, 'insuranceCards')
  const appts = useCollection(t.tenantId, 'appointments')
  const auths = useCollection(t.tenantId, 'authorizations')
  const [open, setOpen] = useState(false)
  const [apId, setApId] = useState('')
  const [kind, setKind] = useState<Guide['kind']>('consulta')
  // Atendimentos concluídos de pacientes com carteirinha, ainda sem guia.
  const eligible = appts.filter((a) => a.status === 'concluida' && cards.some((c) => c.patientId === a.patientId) && !guides.some((g) => g.appointmentId === a.id)).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 30)
  const create = () => run(() => {
    const a = appts.find((x) => x.id === apId)
    if (!a) throw new Error('Escolha um atendimento concluído.')
    if (a.status !== 'concluida') throw new Error('Guia só para atendimento concluído.')
    if (guides.some((g) => g.appointmentId === a.id)) throw new Error('Este atendimento já possui guia.')
    const card = cards.find((c) => c.patientId === a.patientId)!
    const svc = L.service(a.serviceId)!
    const auth = auths.find((x) => x.patientId === a.patientId && x.serviceId === a.serviceId && x.status === 'autorizada')
    if (kind === 'sp_sadt' && !auth) throw new Error('SP/SADT exige autorização registrada como autorizada para este procedimento.')
    const n = Math.max(0, ...db.list(t.tenantId, 'guides').map((g) => Number(/(\d+)$/.exec(g.number)?.[1] ?? 0))) + 1
    db.insert(t.tenantId, 'guides', { id: uid('guia_'), tenantId: t.tenantId, createdAt: nowISO(), kind, number: `G-DEMO-${String(n).padStart(5, '0')}`, appointmentId: a.id, patientId: a.patientId, payerId: card.payerId, cardId: card.id, authorizationId: auth?.id,
      items: [{ serviceId: svc.id, code: svc.code ?? `DEMO-${svc.id.slice(-4)}`, description: svc.name, qty: 1, unitCents: svc.priceCents || 15000 }], status: 'aberta', paidCents: 0, glosas: [] })
    setOpen(false)
  }, 'Guia criada.')
  const cols: Column<Guide>[] = [
    { id: 'n', header: 'Guia', cell: (g) => <span className="mono">{g.number}</span>, value: (g) => g.number },
    { id: 'k', header: 'Tipo', cell: (g) => (g.kind === 'consulta' ? 'Consulta' : 'SP/SADT') },
    { id: 'p', header: 'Paciente', cell: (g) => L.patient(g.patientId)?.name ?? '—' },
    { id: 'a', header: 'Atendimento', cell: (g) => { const a = appts.find((x) => x.id === g.appointmentId); return a ? formatDateTime(a.start) : '—' } },
    { id: 'o', header: 'Operadora', cell: (g) => payer(g.payerId)?.name ?? '—', hidden: true },
    { id: 'v', header: 'Valor', num: true, cell: (g) => formatBRL(guideTotal(g)), value: (g) => guideTotal(g) },
    { id: 's', header: 'Status', cell: (g) => <Badge tone={g.status === 'processada' ? 'success' : g.status === 'aberta' ? 'neutral' : 'info'}>{GUIDE_LABEL[g.status]}</Badge>, value: (g) => g.status },
  ]
  return (
    <Section title="Guias (simplificadas)" actions={canWrite ? <Button variant="primary" icon={<Plus />} onClick={() => { setApId(eligible[0]?.id ?? ''); setOpen(true) }} data-tour="primary-action">Nova guia</Button> : undefined}>
      <DataTable caption="Guias de convênio" rows={guides} columns={cols} rowKey={(g) => g.id} exportName="guias-demonstrativo" empty={<p className="muted">Sem guias.</p>} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Nova guia" description="Vinculada a um atendimento concluído de paciente com carteirinha." footer={<><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" onClick={create} disabled={!eligible.length}>Criar guia</Button></>}>
        {eligible.length === 0 ? <p className="muted">Nenhum atendimento concluído elegível (sem guia e com carteirinha).</p> : (
          <div className="form-grid">
            <Field label="Atendimento concluído"><Select value={apId} onChange={(e) => setApId(e.target.value)}>{eligible.map((a) => <option key={a.id} value={a.id}>{formatDateTime(a.start)} · {L.patient(a.patientId)?.name} · {L.service(a.serviceId)?.name}</option>)}</Select></Field>
            <Field label="Tipo"><Select value={kind} onChange={(e) => setKind(e.target.value as Guide['kind'])}><option value="consulta">Consulta</option><option value="sp_sadt">SP/SADT (exige autorização)</option></Select></Field>
          </div>
        )}
      </Dialog>
    </Section>
  )
}

// ---------------- Lotes ----------------
function BatchesTab({ canManage }: { canManage: boolean }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const { payers, payer } = usePayers()
  const batches = useCollection(t.tenantId, 'guideBatches').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const guides = useCollection(t.tenantId, 'guides')
  const [payerId, setPayerId] = useState('')
  const open = () => run(() => {
    const pid = payerId || payers.find((p) => p.active)?.id
    if (!pid) throw new Error('Cadastre uma operadora.')
    if (batches.some((b) => b.payerId === pid && b.status === 'aberto')) throw new Error('Já existe lote aberto para esta operadora.')
    const n = Math.max(0, ...batches.map((b) => Number(/(\d+)$/.exec(b.number)?.[1] ?? 0))) + 1
    db.insert(t.tenantId, 'guideBatches', { id: uid('lote_'), tenantId: t.tenantId, createdAt: nowISO(), payerId: pid, number: `LOTE-DEMO-${String(n).padStart(4, '0')}`, status: 'aberto', guideIds: [], history: [{ at: nowISO(), from: null, to: 'aberto', by: actor.name }] })
  }, 'Lote aberto.')
  const toggle = (b: GuideBatch, g: Guide) => run(() => {
    if (b.status !== 'aberto') throw new Error('Só é possível alterar guias de lote aberto.')
    const inB = b.guideIds.includes(g.id)
    db.update(t.tenantId, 'guideBatches', b.id, { guideIds: inB ? b.guideIds.filter((x) => x !== g.id) : [...b.guideIds, g.id] })
    db.update(t.tenantId, 'guides', g.id, { status: inB ? 'aberta' : 'em_lote', batchId: inB ? undefined : b.id })
  })
  const move = (b: GuideBatch, to: BatchStatus) => run(() => {
    db.update(t.tenantId, 'guideBatches', b.id, (p) => transitionBatch(p, to, actor.name))
    if (to === 'enviado') b.guideIds.forEach((id) => db.update(t.tenantId, 'guides', id, { status: 'enviada' }))
    if (to === 'aberto') b.guideIds.forEach((id) => db.update(t.tenantId, 'guides', id, { status: 'em_lote' }))
  }, to === 'enviado' ? 'Lote enviado (simulado — nada foi transmitido).' : `Lote ${BATCH_LABEL[to].toLowerCase()}.`)
  const artifact = (b: GuideBatch, format: 'json' | 'xml') => run(() => {
    const p = payer(b.payerId)
    if (!p) throw new Error('Operadora não encontrada.')
    const a = buildTissArtifact(b, guides.filter((g) => b.guideIds.includes(g.id)), p, t.org.name, format)
    downloadText(a.filename, a.content, a.mime)
  }, `Artefato baixado — ${TISS_MARK}.`)
  return (
    <div className="stack">
      {canManage && (
        <div className="panel"><div className="panel-body row" style={{ alignItems: 'flex-end' }}>
          <Field label="Operadora"><Select value={payerId} onChange={(e) => setPayerId(e.target.value)}><option value="">Primeira ativa</option>{payers.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Button variant="primary" icon={<Plus />} onClick={open}>Abrir lote</Button>
        </div></div>
      )}
      {batches.length === 0 ? <Section title="Lotes"><p className="muted">Sem lotes.</p></Section> : batches.map((b) => {
        const inB = guides.filter((g) => b.guideIds.includes(g.id))
        const avail = guides.filter((g) => g.status === 'aberta' && g.payerId === b.payerId)
        return (
          <Section key={b.id} title={<span className="row">{b.number} <Badge tone={b.status === 'processado' ? 'success' : b.status === 'aberto' ? 'neutral' : 'info'}>{BATCH_LABEL[b.status]}</Badge></span>} actions={<>
            <Button size="sm" icon={<Download />} onClick={() => artifact(b, 'xml')} disabled={!inB.length}>Gerar artefato TISS demonstrativo (XML)</Button>
            <Button size="sm" variant="ghost" onClick={() => artifact(b, 'json')} disabled={!inB.length}>JSON</Button>
          </>}>
            <div className="stack" style={S(10)}>
              <span className="small muted">{payer(b.payerId)?.name} · {inB.length} guia(s) · {formatBRL(inB.reduce((a, g) => a + guideTotal(g), 0))}</span>
              <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {[...inB, ...(b.status === 'aberto' ? avail : [])].map((g) => (
                  <li key={g.id} className="row between" style={{ padding: '6px 0' }}>
                    <span className="small"><span className="mono">{g.number}</span> · {formatBRL(guideTotal(g))}</span>
                    {b.status === 'aberto' && canManage ? <Button size="sm" onClick={() => toggle(b, g)}>{b.guideIds.includes(g.id) ? 'Remover do lote' : 'Incluir no lote'}</Button> : <Badge plain>{GUIDE_LABEL[g.status]}</Badge>}
                  </li>
                ))}
              </ul>
              {canManage && (
                <div className="row end">
                  {b.status === 'aberto' && <Button variant="primary" onClick={() => move(b, 'fechado')}>Fechar lote</Button>}
                  {b.status === 'fechado' && <><Button onClick={() => move(b, 'aberto')}>Reabrir</Button><Button variant="primary" onClick={() => move(b, 'enviado')}>Enviar (simulado)</Button></>}
                  {b.status === 'enviado' && <Button onClick={() => move(b, 'processado')}>Marcar como processado</Button>}
                </div>
              )}
            </div>
          </Section>
        )
      })}
    </div>
  )
}

// ---------------- Glosas, recurso e conciliação ----------------
function GlosasTab({ canManage }: { canManage: boolean }) {
  const t = useTenant()
  const run = useAction()
  const L = useLookup()
  const guides = useCollection(t.tenantId, 'guides')
  const sent = guides.filter((g) => g.status === 'enviada' || g.status === 'processada')
  const rec = reconcile(sent)
  const [dlg, setDlg] = useState<{ kind: 'glosa' | 'recurso' | 'resposta' | 'pago'; g: Guide; glosaId?: string } | null>(null)
  const [f, setF] = useState({ reason: '', value: '', ok: 'aceito' })
  const submit = () => dlg && run(() => {
    const { g } = dlg
    const v = parseBRL(f.value)
    let next: Guide
    if (dlg.kind === 'glosa') next = addGlosa(g, f.reason, v ?? NaN, uid('gl_'))
    else if (dlg.kind === 'recurso') next = appealGlosa(g, dlg.glosaId!, f.reason)
    else if (dlg.kind === 'resposta') next = resolveAppeal(g, dlg.glosaId!, f.ok === 'aceito', v ?? 0)
    else next = registerGuidePayment(g, v ?? NaN)
    db.update(t.tenantId, 'guides', g.id, next)
    setDlg(null)
  }, 'Registro atualizado.')
  const openDlg = (kind: NonNullable<typeof dlg>['kind'], g: Guide, glosaId?: string) => { setF({ reason: '', value: kind === 'pago' ? (Math.max(0, guideTotal(g) - guideGlosado(g)) / 100).toFixed(2).replace('.', ',') : '', ok: 'aceito' }); setDlg({ kind, g, glosaId }) }
  return (
    <div className="stack">
      <div className="grid grid-4">
        <Kpi label="Faturado (enviadas)" value={formatBRL(rec.billed)} />
        <Kpi label="Pago (informado)" value={formatBRL(rec.paid)} />
        <Kpi label="Glosado líquido" value={formatBRL(rec.glosado)} foot="Glosas − recursos aceitos" />
        <Kpi label="A receber/conciliar" value={formatBRL(rec.pending)} />
      </div>
      <Section title="Conciliação por guia" actions={<SimBadge>Retorno da operadora simulado</SimBadge>}>
        {sent.length === 0 ? <p className="muted">Nenhuma guia enviada.</p> : (
          <div className="stack">
            {sent.map((g) => (
              <div key={g.id} className="card tight stack" style={S(8)}>
                <div className="row between">
                  <span><span className="mono strong">{g.number}</span> · {L.patient(g.patientId)?.name}</span>
                  <span className="small num">Faturado {formatBRL(guideTotal(g))} · Pago {formatBRL(g.paidCents)} · Glosado {formatBRL(guideGlosado(g))}</span>
                </div>
                {g.glosas.map((x) => (
                  <div key={x.id} className="muted-surface row between">
                    <span className="small"><strong>Glosa {formatBRL(x.valueCents)}</strong> — {x.reason}{x.appeal ? ` · Recurso: ${x.appeal.status}${x.appeal.status === 'aceito' ? ` (recuperado ${formatBRL(x.appeal.recoveredCents)})` : ''}` : ''}</span>
                    {canManage && !x.appeal && <Button size="sm" onClick={() => openDlg('recurso', g, x.id)}>Recorrer</Button>}
                    {canManage && x.appeal?.status === 'enviado' && <Button size="sm" onClick={() => openDlg('resposta', g, x.id)}>Registrar resposta</Button>}
                  </div>
                ))}
                {canManage && <div className="row end"><Button size="sm" onClick={() => openDlg('glosa', g)}>Registrar glosa</Button><Button size="sm" onClick={() => openDlg('pago', g)}>Registrar pagamento</Button></div>}
              </div>
            ))}
          </div>
        )}
      </Section>
      <Dialog open={!!dlg} onClose={() => setDlg(null)} title={dlg?.kind === 'glosa' ? 'Registrar glosa' : dlg?.kind === 'recurso' ? 'Recurso de glosa' : dlg?.kind === 'resposta' ? 'Resposta ao recurso' : 'Pagamento informado pela operadora'} footer={<><Button onClick={() => setDlg(null)}>Cancelar</Button><Button variant="primary" onClick={submit}>Registrar</Button></>}>
        <div className="stack" style={S(12)}>
          {(dlg?.kind === 'glosa' || dlg?.kind === 'recurso') && <Field label={dlg.kind === 'glosa' ? 'Motivo da glosa' : 'Justificativa do recurso'} required><Textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>}
          {dlg?.kind === 'resposta' && <Field label="Resultado"><Select value={f.ok} onChange={(e) => setF({ ...f, ok: e.target.value })}><option value="aceito">Aceito</option><option value="negado">Negado</option></Select></Field>}
          {(dlg?.kind === 'glosa' || dlg?.kind === 'pago' || (dlg?.kind === 'resposta' && f.ok === 'aceito')) && <Field label={dlg?.kind === 'resposta' ? 'Valor recuperado (R$)' : 'Valor (R$)'} required><Input inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>}
        </div>
      </Dialog>
    </div>
  )
}

// ---------------- Operadoras ----------------
function PayersTab({ canManage }: { canManage: boolean }) {
  const t = useTenant()
  const run = useAction()
  const { payers } = usePayers()
  const [f, setF] = useState({ name: '', carencia: '30' })
  const add = () => run(() => {
    if (f.name.trim().length < 3) throw new Error('Nome da operadora muito curto.')
    const c = Number(f.carencia)
    if (!Number.isInteger(c) || c < 0 || c > 730) throw new Error('Carência: 0 a 730 dias.')
    db.insert(t.tenantId, 'insurancePayers', { id: uid('op_'), tenantId: t.tenantId, createdAt: nowISO(), name: `${f.name.trim()} (fictícia)`, code: `DEMO-${String(payers.length + 1).padStart(6, '0')}`, carenciaDays: c, active: true, contact: 'contato@operadora.exemplo.test' })
    setF({ name: '', carencia: '30' })
  }, 'Operadora cadastrada.')
  const cols: Column<InsurancePayer>[] = [
    { id: 'n', header: 'Operadora', cell: (p) => p.name, value: (p) => p.name },
    { id: 'c', header: 'Registro (demo)', cell: (p) => <span className="mono">{p.code}</span> },
    { id: 'k', header: 'Carência', num: true, cell: (p) => `${p.carenciaDays} dias` },
    { id: 'a', header: 'Situação', cell: (p) => <Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Ativa' : 'Inativa'}</Badge> },
  ]
  return (
    <Section title="Operadoras (fictícias)">
      <div className="stack" style={S(12)}>
        {canManage && <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="Nome" className="grow"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Carência (dias)"><Input inputMode="numeric" value={f.carencia} onChange={(e) => setF({ ...f, carencia: e.target.value })} /></Field>
          <Button onClick={add}>Adicionar</Button>
        </div>}
        <Field label="Credenciais de webservice"><Input disabled placeholder="configuração futura no servidor" /></Field>
        <DataTable caption="Operadoras" rows={payers} columns={cols} rowKey={(p) => p.id} empty={<p className="muted">Nenhuma operadora.</p>}
          rowActions={(p) => canManage ? <Button size="sm" variant="ghost" onClick={() => run(() => db.update(t.tenantId, 'insurancePayers', p.id, { active: !p.active }), 'Situação atualizada.')}>{p.active ? 'Desativar' : 'Ativar'}</Button> : null} />
      </div>
    </Section>
  )
}
