import { useMemo, useState } from 'react'
import { Printer, Plus, Undo2, Handshake, Percent, Wallet, Check, X } from 'lucide-react'
import type { Charge, ChargeStatus, Payment, PaymentMethod } from '@/domain/types'
import { PAYMENT_METHOD_LABEL } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { approveManualPayment, audit, billingRepo, chargeBalance, chargeNet } from '@/data/repositories'
import { cashMovement, closeCash, expectedCash, openCash, openSessionFor, receiveAtDesk } from '@/domain/cash'
import { getPolicies } from '@/domain/settings'
import { Alert, Badge, Button, Checkbox, ClinicLogo, DataTable, DemoPaper, demoText, Dialog, Field, Input, Kpi, PageHeader, Select, SimBadge, Tabs, TabPanel, Textarea, useAction, useConfirm, EmptyState, type Column } from '@/ui'
import { addDaysCivil, formatCivil, formatDateTime, nowISO, todayCivil } from '@/lib/dates'
import { formatBRL, type Cents } from '@/lib/money'
import { normalize, uid } from '@/lib/util'
import { applyEarlyDiscount, applyLateCharges, cashFlow, computeLateCharges, createAgreement, createPayables, payableBalance, payPayable, reversePayablePayment } from './finance'
import { CHARGE_STATUS, MoneyInput, NoAccess, StatusBadge, Toolbar } from './ui'
import type { Payable } from './types'

const DESK_METHODS: PaymentMethod[] = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito']

export function FinancePage() {
  const t = useTenant()
  const [tab, setTab] = useState('receber')
  const charges = useCollection(t.tenantId, 'charges')
  if (!t.can('financeiro') && !t.can('caixa')) return <NoAccess what="o financeiro" />
  const pending = charges.filter((c) => c.payments.some((p) => p.status === 'pendente_aprovacao')).length
  const tabs = [
    { id: 'receber', label: 'Contas a receber' }, { id: 'pix', label: 'Pix manual', badge: pending || undefined }, { id: 'pagar', label: 'Contas a pagar' },
    { id: 'caixa', label: 'Caixa' }, { id: 'fluxo', label: 'Fluxo de caixa' }, { id: 'docs', label: 'Documentos' }, { id: 'cad', label: 'Cadastros' },
  ]
  return (
    <div data-tour="page-content" className="com-page">
      <PageHeader title="Financeiro" subtitle="Recebimentos do paciente para a clínica (contexto B). Competência, vencimento, recebimento e disponibilidade separados." />
      <Tabs label="Áreas do financeiro" value={tab} onChange={setTab} tabs={tabs} />
      <TabPanel>
        {tab === 'receber' && <Receivables />}
        {tab === 'pix' && <PixQueue />}
        {tab === 'pagar' && <Payables />}
        {tab === 'caixa' && <Cash />}
        {tab === 'fluxo' && <Flow />}
        {tab === 'docs' && <Docs />}
        {tab === 'cad' && <Registries />}
      </TabPanel>
    </div>
  )
}

const lastPay = (c: Charge) => c.payments.filter((p) => p.status !== 'pendente_aprovacao').sort((a, b) => b.at.localeCompare(a.at))[0]

function Receivables() {
  const t = useTenant()
  const charges = useCollection(t.tenantId, 'charges')
  const patients = useCollection(t.tenantId, 'patients')
  const [f, setF] = useState({ status: '', due: '', comp: '', unit: t.unitId ?? '', q: '' })
  const [open, setOpen] = useState<string | null>(null)
  const [agree, setAgree] = useState(false)
  const today = todayCivil()
  const effStatus = (c: Charge): ChargeStatus => (c.status === 'aberta' && c.dueDate < today ? 'vencida' : c.status)
  const allowed = new Set(t.allowedUnits.map((u) => u.id))
  const rows = charges.filter((c) => allowed.has(c.unitId) && (!f.unit || c.unitId === f.unit) && (!f.status || effStatus(c) === f.status) && (!f.due || c.dueDate.startsWith(f.due)) && (!f.comp || c.competenceDate.startsWith(f.comp))
    && (!f.q || normalize(`${c.description} ${patients.find((p) => p.id === c.patientId)?.name ?? ''}`).includes(normalize(f.q)))).sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  const open$ = rows.filter((c) => !['cancelada', 'estornada'].includes(c.status)).reduce((a, c) => a + chargeBalance(c), 0)
  const overdue = rows.filter((c) => effStatus(c) === 'vencida').reduce((a, c) => a + chargeBalance(c), 0)
  const received = rows.reduce((a, c) => a + chargeNet(c), 0)
  const cols: Column<Charge>[] = [
    { id: 'pat', header: 'Paciente', cell: (c) => patients.find((p) => p.id === c.patientId)?.name ?? '—', value: (c) => patients.find((p) => p.id === c.patientId)?.name },
    { id: 'desc', header: 'Descrição', cell: (c) => <span>{c.description}{c.installment.of > 1 && <span className="muted small"> ({c.installment.n}/{c.installment.of})</span>}</span>, value: (c) => c.description },
    { id: 'st', header: 'Status', cell: (c) => <StatusBadge map={CHARGE_STATUS} value={effStatus(c)} />, value: (c) => effStatus(c) },
    { id: 'comp', header: 'Competência', cell: (c) => formatCivil(c.competenceDate), value: (c) => c.competenceDate },
    { id: 'due', header: 'Vencimento', cell: (c) => formatCivil(c.dueDate), value: (c) => c.dueDate },
    { id: 'rec', header: 'Recebimento', cell: (c) => lastPay(c) ? formatCivil(lastPay(c).at.slice(0, 10)) : '—', value: (c) => lastPay(c)?.at },
    { id: 'avail', header: 'Disponibilidade', cell: (c) => lastPay(c)?.availableOn ? formatCivil(lastPay(c).availableOn) : '—', value: (c) => lastPay(c)?.availableOn },
    { id: 'val', header: 'Valor', num: true, cell: (c) => formatBRL(c.amountCents + c.adjustmentsCents), value: (c) => (c.amountCents + c.adjustmentsCents) / 100 },
    { id: 'bal', header: 'Saldo', num: true, cell: (c) => formatBRL(['cancelada', 'estornada'].includes(c.status) ? 0 : chargeBalance(c)), value: (c) => chargeBalance(c) / 100 },
    { id: 'unit', header: 'Unidade', hidden: true, cell: (c) => t.units.find((u) => u.id === c.unitId)?.name, value: (c) => t.units.find((u) => u.id === c.unitId)?.name },
    { id: 'cat', header: 'Categoria', hidden: true, cell: (c) => c.category, value: (c) => c.category },
  ]
  return (
    <div className="stack">
      <div className="grid grid-4">
        <Kpi label="Saldo em aberto" value={formatBRL(open$)} /><Kpi label="Vencido" value={formatBRL(overdue)} /><Kpi label="Recebido líquido (filtro)" value={formatBRL(received)} /><Kpi label="Cobranças" value={rows.length} />
      </div>
      <Toolbar>
        <Field label="Buscar"><Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Paciente ou descrição" /></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Todos</option>{Object.entries(CHARGE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Vencimento (mês)"><Input type="month" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
        <Field label="Competência (mês)"><Input type="month" value={f.comp} onChange={(e) => setF({ ...f, comp: e.target.value })} /></Field>
        {t.allowedUnits.length > 1 && <Field label="Unidade"><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}><option value="">Todas permitidas</option>{t.allowedUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
      </Toolbar>
      <DataTable caption="Contas a receber" rows={rows} columns={cols} rowKey={(c) => c.id} onRowClick={(c) => setOpen(c.id)} exportName={t.can('financeiro', 'export') ? 'contas-a-receber' : undefined}
        actions={t.can('financeiro', 'update') ? <Button size="sm" icon={<Handshake />} onClick={() => setAgree(true)}>Acordo / renegociação</Button> : undefined} />
      {open && <ChargeDrawer id={open} onClose={() => setOpen(null)} />}
      {agree && <AgreementDialog onClose={() => setAgree(false)} />}
    </div>
  )
}

function ChargeDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const c = useCollection(t.tenantId, 'charges').find((x) => x.id === id)
  const adjs = useCollection(t.tenantId, 'chargeAdjustments').filter((a) => a.chargeId === id)
  const patient = useCollection(t.tenantId, 'patients').find((p) => p.id === c?.patientId)
  const [amount, setAmount] = useState<Cents | null>(null)
  const [method, setMethod] = useState<PaymentMethod>('dinheiro')
  const [refund, setRefund] = useState<Payment | null>(null)
  if (!c) return null
  const bal = chargeBalance(c)
  const pol = getPolicies(t.tenantId, c.unitId).payments
  const preview = computeLateCharges(c, pol, todayCivil(), adjs)
  const closed = ['cancelada', 'estornada', 'paga'].includes(c.status)
  const session = t.user ? openSessionFor(t.tenantId, c.unitId, t.user.id) : undefined
  const canRecv = t.can('caixa', 'create', { unitId: c.unitId }) || t.can('financeiro', 'create', { unitId: c.unitId })
  const receive = (full: boolean) => run(() => {
    const v = full ? bal : amount
    if (!v || v <= 0) throw new Error('Informe o valor recebido.')
    receiveAtDesk(t.tenantId, { chargeId: c.id, amountCents: v, method, operator: actor, unitId: c.unitId })
    setAmount(null)
  }, full ? 'Cobrança quitada (registrada no caixa).' : 'Recebimento parcial registrado no caixa.')
  const cancel = async () => {
    if (c.payments.some((p) => p.status === 'confirmado')) return run(() => { throw new Error('Cobrança com pagamento liquidado não é cancelada: use estorno/reembolso (movimentos não são apagados).') })
    const r = await confirm({ title: 'Cancelar cobrança', requireReason: true, danger: true })
    if (r.ok) run(() => { db.update(t.tenantId, 'charges', c.id, { status: 'cancelada', description: `${c.description} [cancelada: ${r.reason}]` }); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'cobranca.cancelada', resource: 'charges', resourceId: c.id, detail: r.reason }) }, 'Cobrança cancelada.')
  }
  return (
    <Dialog open drawer onClose={onClose} title={c.description} description={`${patient?.name ?? ''} · origem ${c.origin.kind}${c.origin.refId ? ` (${c.origin.refId.slice(-6)})` : ''}`}>
      <div className="stack">
        <div className="row"><StatusBadge map={CHARGE_STATUS} value={c.status} /><SimBadge /></div>
        <dl className="com-dl">
          <dt>Competência</dt><dd>{formatCivil(c.competenceDate)}</dd><dt>Vencimento</dt><dd>{formatCivil(c.dueDate)}</dd>
          <dt>Valor original</dt><dd>{formatBRL(c.amountCents)}</dd><dt>Encargos/descontos</dt><dd>{formatBRL(c.adjustmentsCents)}</dd>
          <dt>Recebido líquido</dt><dd>{formatBRL(chargeNet(c))}</dd><dt className="total">Saldo</dt><dd className="total">{formatBRL(closed ? 0 : bal)}</dd>
        </dl>
        {!closed && canRecv && (
          <fieldset className="stack"><legend>Receber</legend>
            {!session && <Alert tone="warning">Abra seu caixa nesta unidade (aba Caixa) para registrar recebimento presencial.</Alert>}
            <div className="form-grid">
              <Field label="Valor (R$)" hint="Parcial: informe menos que o saldo."><MoneyInput value={amount} onChange={setAmount} /></Field>
              <Field label="Forma"><Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{DESK_METHODS.filter((m) => pol.allowedMethods.includes(m)).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}</Select></Field>
            </div>
            <div className="row"><Button onClick={() => receive(false)} disabled={!session}>Registrar parcial</Button><Button variant="primary" onClick={() => receive(true)} disabled={!session}>Quitar {formatBRL(bal)}</Button></div>
          </fieldset>
        )}
        {!closed && t.can('financeiro', 'update') && (
          <fieldset className="stack"><legend>Juros, multa e desconto (política da clínica)</legend>
            <p className="small muted">Multa {pol.lateFeePercent}% · juros {pol.monthlyInterestPercent}% a.m. pró-rata · desconto antecipação {pol.earlyDiscountPercent}%.</p>
            {preview.lines.length ? <ul className="small" style={{ margin: 0 }}>{preview.lines.map((l, i) => <li key={i}>{l.label} = <strong>{formatBRL(l.cents)}</strong></li>)}</ul> : <p className="small">Nada a aplicar hoje ({preview.lateDays} dia(s) de atraso).</p>}
            <div className="row"><Button size="sm" icon={<Percent />} disabled={!preview.totalCents} onClick={() => run(() => applyLateCharges(t.tenantId, c.id, actor.name), 'Encargos aplicados com memória de cálculo.')}>Aplicar encargos</Button><Button size="sm" onClick={() => run(() => applyEarlyDiscount(t.tenantId, c.id, actor.name), 'Desconto aplicado.')}>Aplicar desconto de antecipação</Button></div>
          </fieldset>
        )}
        {adjs.length > 0 && <section><h3>Memória de cálculo</h3><ul className="com-memo">{adjs.map((a) => <li key={a.id}>{formatDateTime(a.createdAt)} · {a.by}: {a.lines.map((l) => `${l.label} = ${formatBRL(l.cents)}`).join('; ')}</li>)}</ul></section>}
        <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <h3>Pagamentos</h3>
          {c.payments.length === 0 && <p className="small muted">Nenhum pagamento.</p>}
          {c.payments.map((p) => {
            const refunded = c.refunds.filter((r) => r.paymentId === p.id).reduce((a, r) => a + r.amountCents, 0)
            return (
              <div key={p.id} className="list-card">
                <div className="row between"><strong>{formatBRL(p.amountCents)} · {PAYMENT_METHOD_LABEL[p.method]}</strong><Badge tone={p.status === 'confirmado' ? 'success' : p.status === 'pendente_aprovacao' ? 'warning' : 'neutral'}>{p.status.replace('_', ' ')}</Badge></div>
                <span className="small muted">Recebido {formatDateTime(p.at)} · disponível {formatCivil(p.availableOn)}{refunded ? ` · revertido ${formatBRL(refunded)}` : ''}</span>
                {p.status === 'confirmado' && t.can('financeiro', 'update') && refunded < p.amountCents && <Button size="sm" icon={<Undo2 />} onClick={() => setRefund(p)}>Estorno / reembolso / chargeback</Button>}
              </div>
            )
          })}
          {c.refunds.map((r) => <div key={r.id} className="list-card"><strong className="com-neg">− {formatBRL(r.amountCents)} · {r.kind}</strong><span className="small muted">{formatDateTime(r.at)} · {r.reason} · vinculado ao pagamento {r.paymentId.slice(-6)}</span></div>)}
        </section>
        {!['cancelada', 'estornada'].includes(c.status) && t.can('financeiro', 'update') && <Button variant="ghost" onClick={cancel}>Cancelar cobrança</Button>}
      </div>
      {refund && <RefundDialog c={c} p={refund} onClose={() => setRefund(null)} />}
    </Dialog>
  )
}

function RefundDialog({ c, p, onClose }: { c: Charge; p: Payment; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const left = p.amountCents - c.refunds.filter((r) => r.paymentId === p.id).reduce((a, r) => a + r.amountCents, 0)
  const [v, setV] = useState<Cents | null>(left)
  const [kind, setKind] = useState<'estorno' | 'reembolso' | 'chargeback'>('estorno')
  const [reason, setReason] = useState('')
  const go = () => run(() => {
    if (!v) throw new Error('Informe o valor.')
    billingRepo.refund(t.tenantId, c.id, p.id, v, reason, kind)
    // Estorno de recebimento em caixa aberto gera movimento de saída vinculado.
    if (p.cashSessionId) db.update(t.tenantId, 'cashSessions', p.cashSessionId, (s) => s.status === 'aberto' ? { ...s, movements: [...s.movements, { id: uid('mv_'), at: nowISO(), kind: 'estorno', amountCents: v, method: p.method, chargeId: c.id, note: reason }] } : s)
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: `cobranca.${kind}`, resource: 'charges', resourceId: c.id, detail: `${v / 100}: ${reason}` })
    onClose()
  }, 'Reversão registrada e vinculada ao pagamento original.')
  return (
    <Dialog open onClose={onClose} title="Reverter pagamento" description="O pagamento liquidado não é apagado: é criada reversão vinculada." footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="danger" onClick={go}>Registrar</Button></>}>
      <div className="form-grid">
        <Field label="Tipo"><Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="estorno">Estorno</option><option value="reembolso">Reembolso</option><option value="chargeback">Chargeback (contestação)</option></Select></Field>
        <Field label="Valor (R$)" hint={`Máximo ${formatBRL(left)}`}><MoneyInput value={v} onChange={setV} /></Field>
      </div>
      <Field label="Motivo" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Dialog>
  )
}

function AgreementDialog({ onClose }: { onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const charges = useCollection(t.tenantId, 'charges')
  const patients = useCollection(t.tenantId, 'patients')
  const eligible = charges.filter((c) => ['aberta', 'vencida', 'parcial'].includes(c.status) && chargeBalance(c) > 0)
  const pats = Array.from(new Set(eligible.map((c) => c.patientId)))
  const [pat, setPat] = useState(pats[0] ?? '')
  const [sel, setSel] = useState<string[]>([])
  const [n, setN] = useState(3)
  const [first, setFirst] = useState(addDaysCivil(todayCivil(), 7))
  const [reason, setReason] = useState('')
  const list = eligible.filter((c) => c.patientId === pat)
  const total = list.filter((c) => sel.includes(c.id)).reduce((a, c) => a + chargeBalance(c), 0)
  return (
    <Dialog open onClose={onClose} size="lg" title="Acordo / renegociação" description="Saldo antigo é cancelado com vínculo (pagamentos preservados) e novas parcelas são criadas com origem 'acordo'."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => { if (run(() => createAgreement(t.tenantId, { chargeIds: sel, installments: n, firstDue: first, reason, by: actor.name }), 'Acordo criado.')) onClose() }}>Criar acordo</Button></>}>
      <div className="stack">
        <Field label="Paciente"><Select value={pat} onChange={(e) => { setPat(e.target.value); setSel([]) }}>{pats.map((id) => <option key={id} value={id}>{patients.find((p) => p.id === id)?.name}</option>)}</Select></Field>
        <fieldset><legend>Cobranças com saldo</legend>{list.map((c) => <Checkbox key={c.id} label={`${c.description} — venc. ${formatCivil(c.dueDate)} — saldo ${formatBRL(chargeBalance(c))}`} checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} />)}</fieldset>
        <div className="form-grid">
          <Field label="Parcelas"><Select value={n} onChange={(e) => setN(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}x</option>)}</Select></Field>
          <Field label="1º vencimento"><Input type="date" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
          <div><span className="small muted">Total renegociado</span><div className="strong num">{formatBRL(total)}</div></div>
        </div>
        <Field label="Motivo" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Dialog>
  )
}

function PixQueue() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const charges = useCollection(t.tenantId, 'charges')
  const reviews = useCollection(t.tenantId, 'pixReviews')
  const patients = useCollection(t.tenantId, 'patients')
  const queue = charges.flatMap((c) => c.payments.filter((p) => p.status === 'pendente_aprovacao').map((p) => ({ c, p })))
  const canApprove = t.can('financeiro', 'approve')
  const decide = async (c: Charge, p: Payment, ok: boolean) => {
    let note: string | undefined
    if (!ok) { const r = await confirm({ title: 'Recusar comprovante', requireReason: true, danger: true, confirmLabel: 'Recusar' }); if (!r.ok) return; note = r.reason }
    run(() => {
      approveManualPayment(t.tenantId, c.id, p.id, ok)
      db.insert(t.tenantId, 'pixReviews', { id: uid('pr_'), tenantId: t.tenantId, createdAt: nowISO(), chargeId: c.id, paymentId: p.id, amountCents: p.amountCents, decision: ok ? 'aprovado' : 'recusado', by: actor.name, note })
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: ok ? 'pix_manual.aprovado' : 'pix_manual.recusado', resource: 'charges', resourceId: c.id, detail: note })
    }, ok ? 'Comprovante aprovado — pagamento confirmado manualmente.' : 'Comprovante recusado.')
  }
  return (
    <div className="stack">
      <Alert tone="warning" title="Pix manual não é confirmação bancária automática">A aprovação é humana, com base no comprovante informado pelo paciente. Confira no extrato da conta recebedora antes de aprovar.</Alert>
      {!canApprove && <Alert tone="neutral">Seu perfil pode ver a fila, mas não aprovar/recusar.</Alert>}
      {queue.length === 0 ? <EmptyState title="Nenhum comprovante pendente" /> : (
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, '--gap': '8px' } as React.CSSProperties}>
          {queue.map(({ c, p }) => (
            <li key={p.id} className="list-card">
              <div className="row between"><strong>{patients.find((x) => x.id === c.patientId)?.name} · {formatBRL(p.amountCents)}</strong><Badge tone="warning">Pendente de aprovação</Badge></div>
              <span className="small muted">{c.description} · enviado {formatDateTime(p.at)} · saldo da cobrança {formatBRL(chargeBalance({ ...c, payments: c.payments.filter((x) => x.id !== p.id) }))}</span>
              {canApprove && <div className="row"><Button size="sm" variant="primary" icon={<Check />} onClick={() => decide(c, p, true)}>Aprovar</Button><Button size="sm" icon={<X />} onClick={() => decide(c, p, false)}>Recusar</Button></div>}
            </li>
          ))}
        </ul>
      )}
      <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Histórico de decisões</h2></div><div className="panel-body">
        {reviews.length === 0 ? <p className="small muted">Sem decisões registradas.</p> : <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{[...reviews].reverse().map((r) => <li key={r.id} style={{ padding: '6px 0' }} className="small">{formatDateTime(r.createdAt)} · <strong>{r.decision}</strong> · {formatBRL(r.amountCents)} · {r.by}{r.note ? ` · ${r.note}` : ''}</li>)}</ul>}
      </div></section>
    </div>
  )
}

function Payables() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const list = useCollection(t.tenantId, 'payables')
  const suppliers = useCollection(t.tenantId, 'suppliers')
  const cats = useCollection(t.tenantId, 'financeCategories').filter((c) => c.kind === 'despesa' && c.active)
  const ccs = useCollection(t.tenantId, 'costCenters').filter((c) => c.active)
  const [form, setForm] = useState<null | { supplierId: string; description: string; category: string; costCenter: string; competence: string; due: string; total: Cents | null; n: number }>(null)
  const [status, setStatus] = useState('')
  const today = todayCivil()
  const rows = list.filter((p) => (!t.unitId || p.unitId === t.unitId) && (!status || (status === 'vencida' ? p.status === 'aberta' && p.dueDate < today : p.status === status))).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const pay = (p: Payable) => run(() => payPayable(t.tenantId, p.id, payableBalance(p), 'pix', actor.name), 'Pagamento registrado.')
  const reverse = async (p: Payable) => {
    const last = [...p.payments].reverse().find((x) => x.amountCents > 0 && !p.payments.some((y) => y.reversalOf === x.id))
    if (!last) return
    const r = await confirm({ title: 'Estornar pagamento', body: `Será criado lançamento negativo de ${formatBRL(last.amountCents)} vinculado ao pagamento original.`, requireReason: true, danger: true })
    if (r.ok) run(() => reversePayablePayment(t.tenantId, p.id, last.id, r.reason!, actor.name), 'Estorno registrado.')
  }
  const save = () => { if (!form) return; if (run(() => { if (!form.total) throw new Error('Informe o valor.'); createPayables(t.tenantId, { unitId: t.unitId ?? t.allowedUnits[0].id, supplierId: form.supplierId || undefined, description: form.description, category: form.category, costCenter: form.costCenter || undefined, competenceDate: form.competence, firstDue: form.due, totalCents: form.total, installments: form.n }) }, 'Conta(s) a pagar criada(s).')) setForm(null) }
  const cols: Column<Payable>[] = [
    { id: 'd', header: 'Descrição', cell: (p) => p.description, value: (p) => p.description },
    { id: 's', header: 'Fornecedor', cell: (p) => suppliers.find((s) => s.id === p.supplierId)?.name ?? '—', value: (p) => suppliers.find((s) => s.id === p.supplierId)?.name },
    { id: 'cat', header: 'Categoria', cell: (p) => p.category, value: (p) => p.category },
    { id: 'cc', header: 'Centro de custo', cell: (p) => p.costCenter ?? '—', value: (p) => p.costCenter },
    { id: 'due', header: 'Vencimento', cell: (p) => <span className={p.status === 'aberta' && p.dueDate < today ? 'com-neg' : undefined}>{formatCivil(p.dueDate)}</span>, value: (p) => p.dueDate },
    { id: 'v', header: 'Valor', num: true, cell: (p) => formatBRL(p.amountCents), value: (p) => p.amountCents / 100 },
    { id: 'bal', header: 'Saldo', num: true, cell: (p) => formatBRL(payableBalance(p)), value: (p) => payableBalance(p) / 100 },
    { id: 'st', header: 'Status', cell: (p) => <Badge tone={p.status === 'paga' ? 'success' : p.dueDate < today ? 'danger' : 'info'}>{p.status === 'aberta' && p.dueDate < today ? 'vencida' : p.status}</Badge>, value: (p) => p.status },
  ]
  return (
    <div className="stack">
      <div className="grid grid-4"><Kpi label="A pagar (aberto)" value={formatBRL(rows.filter((p) => p.status === 'aberta').reduce((a, p) => a + payableBalance(p), 0))} /><Kpi label="Vencidas" value={rows.filter((p) => p.status === 'aberta' && p.dueDate < today).length} /><Kpi label="Próximos 7 dias" value={formatBRL(rows.filter((p) => p.status === 'aberta' && p.dueDate >= today && p.dueDate <= addDaysCivil(today, 7)).reduce((a, p) => a + payableBalance(p), 0))} /></div>
      <Toolbar>
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos</option><option value="aberta">Aberta</option><option value="vencida">Vencida</option><option value="paga">Paga</option></Select></Field>
        {t.can('financeiro', 'create') && <div className="row end"><Button variant="primary" icon={<Plus />} onClick={() => setForm({ supplierId: '', description: '', category: cats[0]?.name ?? 'Insumos', costCenter: '', competence: today, due: addDaysCivil(today, 10), total: null, n: 1 })}>Nova conta a pagar</Button></div>}
      </Toolbar>
      <DataTable caption="Contas a pagar" rows={rows} columns={cols} rowKey={(p) => p.id} exportName={t.can('financeiro', 'export') ? 'contas-a-pagar' : undefined}
        rowActions={(p) => t.can('financeiro', 'update') ? <>{p.status === 'aberta' && <Button size="sm" onClick={() => pay(p)}>Pagar</Button>}{p.payments.some((x) => x.amountCents > 0 && !p.payments.some((y) => y.reversalOf === x.id)) && <Button size="sm" variant="ghost" icon={<Undo2 />} onClick={() => reverse(p)}>Estornar</Button>}</> : null} />
      {form && (
        <Dialog open onClose={() => setForm(null)} title="Nova conta a pagar" footer={<><Button onClick={() => setForm(null)}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar</Button></>}>
          <div className="form-grid">
            <Field label="Descrição" required><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Fornecedor"><Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Categoria"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{cats.map((c) => <option key={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Centro de custo"><Select value={form.costCenter} onChange={(e) => setForm({ ...form, costCenter: e.target.value })}><option value="">—</option>{ccs.map((c) => <option key={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Competência"><Input type="date" value={form.competence} onChange={(e) => setForm({ ...form, competence: e.target.value })} /></Field>
            <Field label="1º vencimento"><Input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></Field>
            <Field label="Valor total (R$)" required><MoneyInput value={form.total} onChange={(v) => setForm({ ...form, total: v })} /></Field>
            <Field label="Parcelas"><Select value={form.n} onChange={(e) => setForm({ ...form, n: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}x</option>)}</Select></Field>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function Cash() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const sessions = useCollection(t.tenantId, 'cashSessions')
  const [unit, setUnit] = useState(t.unitId ?? t.allowedUnits[0]?.id ?? '')
  const [opening, setOpening] = useState<Cents | null>(20000)
  const [mv, setMv] = useState<{ kind: 'sangria' | 'suprimento'; v: Cents | null; note: string } | null>(null)
  const [counted, setCounted] = useState<Cents | null>(null)
  const mine = t.user ? sessions.find((s) => s.status === 'aberto' && s.unitId === unit && s.operatorId === t.user!.id) : undefined
  const list = sessions.filter((s) => s.unitId === unit).sort((a, b) => b.openedAt.localeCompare(a.openedAt))
  const canCash = t.can('caixa', 'create', { unitId: unit })
  if (!t.can('caixa')) return <NoAccess what="o caixa" />
  return (
    <div className="stack">
      <Toolbar>
        <Field label="Unidade"><Select value={unit} onChange={(e) => setUnit(e.target.value)}>{t.allowedUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
      </Toolbar>
      {mine ? (
        <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Meu caixa — aberto {formatDateTime(mine.openedAt)}</h2><Badge tone="success">Aberto</Badge></div><div className="panel-body stack">
          <div className="grid grid-4"><Kpi label="Fundo de troco" value={formatBRL(mine.openingCents)} /><Kpi label="Esperado em dinheiro" value={formatBRL(expectedCash(mine))} /><Kpi label="Recebido (todas formas)" value={formatBRL(mine.movements.filter((m) => m.kind === 'recebimento').reduce((a, m) => a + m.amountCents, 0))} /><Kpi label="Movimentos" value={mine.movements.length} /></div>
          <div className="row"><Button onClick={() => setMv({ kind: 'sangria', v: null, note: '' })}>Sangria</Button><Button onClick={() => setMv({ kind: 'suprimento', v: null, note: '' })}>Suprimento</Button></div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Contagem física em dinheiro (R$)" hint={counted != null ? `Diferença: ${formatBRL(counted - expectedCash(mine))}` : 'Conte a gaveta antes de fechar.'}><MoneyInput value={counted} onChange={setCounted} /></Field>
            <Button variant="primary" onClick={() => { if (counted == null) return run(() => { throw new Error('Informe a contagem.') }); if (run(() => closeCash(t.tenantId, mine.id, counted, actor), `Caixa fechado. Diferença ${formatBRL(counted - expectedCash(mine))}.`)) setCounted(null) }}>Fechar caixa</Button>
          </div>
          <ul className="divider-list small" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{[...mine.movements].reverse().map((m) => <li key={m.id} className="row between" style={{ padding: '6px 0' }}><span>{formatDateTime(m.at)} · {m.kind}{m.method ? ` (${PAYMENT_METHOD_LABEL[m.method as PaymentMethod] ?? m.method})` : ''}{m.note ? ` · ${m.note}` : ''}</span><strong className={m.kind === 'sangria' || m.kind === 'estorno' ? 'com-neg num' : 'num'}>{m.kind === 'sangria' || m.kind === 'estorno' ? '− ' : ''}{formatBRL(m.amountCents)}</strong></li>)}</ul>
        </div></section>
      ) : canCash ? (
        <section className="panel"><div className="panel-body row" style={{ alignItems: 'flex-end' }}>
          <Field label="Fundo de troco (R$)"><MoneyInput value={opening} onChange={setOpening} /></Field>
          <Button variant="primary" icon={<Wallet />} onClick={() => run(() => openCash(t.tenantId, unit, actor, opening ?? 0), 'Caixa aberto.')}>Abrir meu caixa</Button>
          <span className="small muted">Caixa é por unidade e operador ({actor.name}).</span>
        </div></section>
      ) : <Alert tone="neutral">Seu perfil não opera caixa nesta unidade.</Alert>}
      <DataTable caption="Sessões de caixa" rows={list} rowKey={(s) => s.id} exportName="caixa" columns={[
        { id: 'op', header: 'Operador', cell: (s) => s.operatorName, value: (s) => s.operatorName },
        { id: 'o', header: 'Abertura', cell: (s) => formatDateTime(s.openedAt), value: (s) => s.openedAt },
        { id: 'c', header: 'Fechamento', cell: (s) => s.closedAt ? formatDateTime(s.closedAt) : '—', value: (s) => s.closedAt },
        { id: 'e', header: 'Esperado', num: true, cell: (s) => formatBRL(expectedCash(s)), value: (s) => expectedCash(s) / 100 },
        { id: 'k', header: 'Contado', num: true, cell: (s) => s.countedCents != null ? formatBRL(s.countedCents) : '—', value: (s) => (s.countedCents ?? 0) / 100 },
        { id: 'd', header: 'Diferença', num: true, cell: (s) => s.countedCents != null ? <span className={s.countedCents - expectedCash(s) ? 'com-neg' : undefined}>{formatBRL(s.countedCents - expectedCash(s))}</span> : '—', value: (s) => s.countedCents != null ? (s.countedCents - expectedCash(s)) / 100 : null },
        { id: 's', header: 'Status', cell: (s) => <Badge tone={s.status === 'aberto' ? 'success' : 'neutral'}>{s.status}</Badge>, value: (s) => s.status },
      ]} />
      {mv && mine && (
        <Dialog open onClose={() => setMv(null)} title={mv.kind === 'sangria' ? 'Sangria' : 'Suprimento'} footer={<><Button onClick={() => setMv(null)}>Cancelar</Button><Button variant="primary" onClick={() => { if (run(() => cashMovement(t.tenantId, mine.id, mv.kind, mv.v ?? 0, mv.note), 'Movimento registrado.')) setMv(null) }}>Registrar</Button></>}>
          <Field label="Valor (R$)" required><MoneyInput value={mv.v} onChange={(v) => setMv({ ...mv, v })} /></Field>
          <Field label="Justificativa" required><Textarea value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} /></Field>
        </Dialog>
      )}
    </div>
  )
}

function Flow() {
  const t = useTenant()
  const charges = useCollection(t.tenantId, 'charges').filter((c) => !t.unitId || c.unitId === t.unitId)
  const months = useMemo(() => { const base = todayCivil().slice(0, 7); const [y, m] = base.split('-').map(Number); return Array.from({ length: 6 }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - 3 + i, 1)); return d.toISOString().slice(0, 7) }) }, [])
  const data = cashFlow(charges, months)
  const max = Math.max(1, ...data.flatMap((d) => [d.competence, d.received, d.available]))
  const W = 640, H = 240, pad = 36, bw = (W - pad * 2) / months.length
  const label = (m: string) => new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${m}-01T12:00:00Z`))
  return (
    <div className="stack">
      <p className="small muted">Competência = valor do serviço no mês em que foi prestado/contratado. Caixa = recebido (líquido de estornos) no mês do recebimento. Disponibilidade = quando o dinheiro fica disponível (ex.: cartão D+30).</p>
      <div className="com-legend"><span><i className="com-sw-1" />Competência</span><span><i className="com-sw-2" />Caixa (recebido)</span><span><i className="com-sw-3" />Disponibilidade</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="com-chart" role="img" aria-label="Gráfico de fluxo por competência, caixa e disponibilidade nos últimos meses">
        <line className="axis" x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} />
        {data.map((d, i) => {
          const x = pad + i * bw + bw * 0.15, w = (bw * 0.7) / 3
          return (
            <g key={d.key}>
              {[d.competence, d.received, d.available].map((v, k) => { const h = (Math.max(0, v) / max) * (H - pad * 2); return <rect key={k} className={`com-sw-${k + 1}`} x={x + k * w} y={H - pad - h} width={w - 2} height={h} rx={2} /> })}
              <text x={pad + i * bw + bw / 2} y={H - pad + 16} textAnchor="middle">{label(d.key)}</text>
            </g>
          )
        })}
      </svg>
      <DataTable caption="Fluxo por mês" rows={data} rowKey={(d) => d.key} exportName="fluxo-de-caixa" columns={[
        { id: 'm', header: 'Mês', cell: (d) => label(d.key), value: (d) => d.key },
        { id: 'c', header: 'Competência', num: true, cell: (d) => formatBRL(d.competence), value: (d) => d.competence / 100 },
        { id: 'r', header: 'Caixa (recebido)', num: true, cell: (d) => formatBRL(d.received), value: (d) => d.received / 100 },
        { id: 'a', header: 'Disponibilidade', num: true, cell: (d) => formatBRL(d.available), value: (d) => d.available / 100 },
      ]} />
    </div>
  )
}

function Docs() {
  const t = useTenant()
  const charges = useCollection(t.tenantId, 'charges').filter((c) => c.payments.some((p) => p.status === 'confirmado'))
  const patients = useCollection(t.tenantId, 'patients')
  const [id, setId] = useState(charges[0]?.id ?? '')
  const [kind, setKind] = useState<'recibo' | 'demonstrativo' | 'nfse'>('recibo')
  const c = charges.find((x) => x.id === id)
  const patient = patients.find((p) => p.id === c?.patientId)
  const unit = t.units.find((u) => u.id === c?.unitId)
  const title = kind === 'recibo' ? 'Recibo de pagamento' : kind === 'demonstrativo' ? 'Demonstrativo de cobrança' : 'NFS-e demonstrativa'
  return (
    <div className="stack">
      <Toolbar>
        <Field label="Cobrança"><Select value={id} onChange={(e) => setId(e.target.value)}>{charges.slice(0, 200).map((x) => <option key={x.id} value={x.id}>{patients.find((p) => p.id === x.patientId)?.name} — {x.description}</option>)}</Select></Field>
        <Field label="Documento"><Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="recibo">Recibo</option><option value="demonstrativo">Demonstrativo</option><option value="nfse">NFS-e demonstrativa</option></Select></Field>
        <div className="row end"><Button icon={<Printer />} onClick={() => window.print()} disabled={!c}>Imprimir</Button></div>
      </Toolbar>
      {kind === 'nfse' && <Alert tone="warning" title="NFS-e demonstrativa — sem validade fiscal">A emissão real depende de integração com o provedor/prefeitura do município da clínica (integração futura). Nenhuma nota é transmitida.</Alert>}
      {c ? (
        <DemoPaper watermark={kind === 'nfse' ? 'NFS-e DEMONSTRATIVA — SEM VALIDADE FISCAL' : undefined}>
          <div className="stack">
            <div className="row between"><ClinicLogo org={t.org} height={36} /><div className="right small">{t.org.legalName}<br />CNPJ {t.org.document}{demoText(' (fictício)', '')}<br />{unit?.address}</div></div>
            <h2 style={{ fontSize: 20 }}>{title}</h2>
            <p>Pagador/paciente: <strong>{patient?.name}</strong>{patient?.cpf ? ` · CPF ${patient.cpf}${demoText(' (fictício)', '')}` : ''}</p>
            <table className="com-paper-table"><caption className="sr-only">Itens</caption><thead><tr><th>Descrição</th><th>Competência</th><th className="num">Valor</th></tr></thead>
              <tbody><tr><td>{c.description}</td><td>{formatCivil(c.competenceDate)}</td><td className="num">{formatBRL(c.amountCents)}</td></tr>{c.adjustmentsCents !== 0 && <tr><td>Encargos/descontos</td><td /><td className="num">{formatBRL(c.adjustmentsCents)}</td></tr>}</tbody></table>
            {kind !== 'nfse' && <table className="com-paper-table"><caption className="sr-only">Pagamentos</caption><thead><tr><th>Pagamento</th><th>Forma</th><th className="num">Valor</th></tr></thead>
              <tbody>{c.payments.filter((p) => p.status !== 'pendente_aprovacao').map((p) => <tr key={p.id}><td>{formatDateTime(p.at)}</td><td>{PAYMENT_METHOD_LABEL[p.method]}</td><td className="num">{formatBRL(p.amountCents)}</td></tr>)}{c.refunds.map((r) => <tr key={r.id}><td>{formatDateTime(r.at)}</td><td>{r.kind}</td><td className="num">− {formatBRL(r.amountCents)}</td></tr>)}</tbody></table>}
            <p className="strong">Total recebido: {formatBRL(chargeNet(c))}{kind === 'demonstrativo' ? ` · Saldo: ${formatBRL(chargeBalance(c))}` : ''}</p>
            <p className="small">Documento demonstrativo emitido em {formatDateTime(nowISO())}. Sem validade fiscal ou jurídica. Pagamentos simulados.</p>
          </div>
        </DemoPaper>
      ) : <EmptyState title="Nenhuma cobrança com pagamento confirmado" />}
    </div>
  )
}

function Registries() {
  const t = useTenant()
  const run = useAction()
  const sup = useCollection(t.tenantId, 'suppliers')
  const cats = useCollection(t.tenantId, 'financeCategories')
  const ccs = useCollection(t.tenantId, 'costCenters')
  const [s, setS] = useState({ name: '', document: '', email: '' })
  const [c, setC] = useState({ name: '', kind: 'despesa' as 'receita' | 'despesa' })
  const [cc, setCc] = useState('')
  const can = t.can('financeiro', 'create')
  const base = () => ({ id: uid('reg_'), tenantId: t.tenantId, createdAt: nowISO() })
  return (
    <div className="grid grid-3">
      <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Fornecedores ({sup.length})</h2></div><div className="panel-body stack">
        <ul className="divider-list small" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{sup.map((x) => <li key={x.id} style={{ padding: '6px 0' }}>{x.name} <span className="muted">· {x.category}</span></li>)}</ul>
        {can && <><Field label="Nome"><Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></Field><Field label={demoText('CNPJ (fictício)', 'CNPJ')}><Input value={s.document} onChange={(e) => setS({ ...s, document: e.target.value })} /></Field><Field label="E-mail"><Input value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} placeholder="contato@exemplo.test" /></Field>
          <Button onClick={() => { if (run(() => { if (!s.name.trim()) throw new Error('Informe o nome.'); db.insert(t.tenantId, 'suppliers', { ...base(), name: s.name.trim(), document: s.document || undefined, email: s.email || undefined, category: 'Insumos', active: true }) }, 'Fornecedor cadastrado.')) setS({ name: '', document: '', email: '' }) }}>Adicionar fornecedor</Button></>}
      </div></section>
      <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Categorias ({cats.length})</h2></div><div className="panel-body stack">
        <ul className="divider-list small" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{cats.map((x) => <li key={x.id} style={{ padding: '6px 0' }}>{x.name} <Badge plain tone={x.kind === 'receita' ? 'success' : 'neutral'}>{x.kind}</Badge></li>)}</ul>
        {can && <><Field label="Nome"><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field><Field label="Tipo"><Select value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value as 'receita' | 'despesa' })}><option value="despesa">Despesa</option><option value="receita">Receita</option></Select></Field>
          <Button onClick={() => { if (run(() => { if (!c.name.trim()) throw new Error('Informe o nome.'); db.insert(t.tenantId, 'financeCategories', { ...base(), name: c.name.trim(), kind: c.kind, active: true }) }, 'Categoria criada.')) setC({ ...c, name: '' }) }}>Adicionar categoria</Button></>}
      </div></section>
      <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Centros de custo ({ccs.length})</h2></div><div className="panel-body stack">
        <ul className="divider-list small" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{ccs.map((x) => <li key={x.id} style={{ padding: '6px 0' }}>{x.name}</li>)}</ul>
        {can && <><Field label="Nome"><Input value={cc} onChange={(e) => setCc(e.target.value)} /></Field><Button onClick={() => { if (run(() => { if (!cc.trim()) throw new Error('Informe o nome.'); db.insert(t.tenantId, 'costCenters', { ...base(), name: cc.trim(), active: true }) }, 'Centro de custo criado.')) setCc('') }}>Adicionar centro de custo</Button></>}
      </div></section>
    </div>
  )
}
