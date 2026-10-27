import { useState } from 'react'
import { Plus, Wrench, Check, X, Send, PackageCheck } from 'lucide-react'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { Alert, Badge, Button, DataTable, Dialog, Field, Input, PageHeader, Select, Tabs, TabPanel, Timeline, useAction, useConfirm, EmptyState, type Column, type Tone } from '@/ui'
import { addDaysCivil, formatCivil, formatDateTime, nowISO, todayCivil, zonedToInstant } from '@/lib/dates'
import { formatBRL } from '@/lib/money'
import { uid } from '@/lib/util'
import { completeMaintenance, poTotal, receivePO, scheduleMaintenance, transitionPO } from './purchasing'
import { MoneyInput, ModuleOff, NoAccess, Toolbar, qtyFmt } from './ui'
import type { Equipment, PurchaseOrder, PurchaseStatus } from './types'

const PO_STATUS: Record<PurchaseStatus, { label: string; tone: Tone }> = {
  solicitada: { label: 'Solicitada', tone: 'info' }, aprovada: { label: 'Aprovada', tone: 'brand' }, recusada: { label: 'Recusada', tone: 'danger' }, pedido: { label: 'Pedido emitido', tone: 'info' },
  parcial: { label: 'Recebida parcial', tone: 'warning' }, recebida: { label: 'Recebida', tone: 'success' }, cancelada: { label: 'Cancelada', tone: 'neutral' },
}

export function PurchasingPage() {
  const t = useTenant()
  const [tab, setTab] = useState('compras')
  if (!t.moduleOn('compras')) return <ModuleOff name="Compras" />
  if (!t.can('compras')) return <NoAccess what="compras e equipamentos" />
  return (
    <div data-tour="page-content" className="com-page">
      <PageHeader title="Compras e equipamentos" subtitle="Solicitação → aprovação → pedido → recebimento (entrada por lote) → conta a pagar. Manutenção bloqueia a agenda." />
      <Tabs label="Compras" value={tab} onChange={setTab} tabs={[{ id: 'compras', label: 'Compras' }, { id: 'eq', label: 'Equipamentos' }]} />
      <TabPanel>{tab === 'compras' ? <Orders /> : <EquipmentTab />}</TabPanel>
    </div>
  )
}

function Orders() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const orders = useCollection(t.tenantId, 'purchaseOrders')
  const suppliers = useCollection(t.tenantId, 'suppliers')
  const products = useCollection(t.tenantId, 'products')
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState(false)
  const [recv, setRecv] = useState<PurchaseOrder | null>(null)
  const rows = orders.filter((o) => (!t.unitId || o.unitId === t.unitId) && (!status || o.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const canApprove = t.can('compras', 'approve')
  const canEdit = t.can('compras', 'update')
  const o = orders.find((x) => x.id === open)
  const act = async (po: PurchaseOrder, to: PurchaseStatus) => {
    let reason: string | undefined
    if (to === 'recusada' || to === 'cancelada') { const r = await confirm({ title: to === 'recusada' ? 'Recusar solicitação' : 'Cancelar', requireReason: true, danger: true }); if (!r.ok) return; reason = r.reason }
    run(() => transitionPO(t.tenantId, po.id, to, actor.name, reason), `${po.number}: ${PO_STATUS[to].label}.`)
  }
  const cols: Column<PurchaseOrder>[] = [
    { id: 'n', header: 'Número', cell: (p) => p.number, value: (p) => p.number },
    { id: 's', header: 'Fornecedor', cell: (p) => suppliers.find((s) => s.id === p.supplierId)?.name ?? '—', value: (p) => suppliers.find((s) => s.id === p.supplierId)?.name },
    { id: 'st', header: 'Status', cell: (p) => <Badge tone={PO_STATUS[p.status].tone}>{PO_STATUS[p.status].label}</Badge>, value: (p) => p.status },
    { id: 'it', header: 'Itens', cell: (p) => p.items.map((i) => products.find((x) => x.id === i.productId)?.name).join(', ') },
    { id: 'v', header: 'Total', num: true, cell: (p) => formatBRL(poTotal(p)), value: (p) => poTotal(p) / 100 },
    { id: 'd', header: 'Criada', cell: (p) => formatDateTime(p.createdAt), value: (p) => p.createdAt },
  ]
  return (
    <div className="stack">
      {!canApprove && <Alert tone="neutral">Seu perfil pode solicitar compras; aprovação exige perfil com permissão de aprovar (gestor/financeiro/proprietário).</Alert>}
      <Toolbar>
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos</option>{Object.entries(PO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        {t.can('compras', 'create') && <div className="row end"><Button variant="primary" icon={<Plus />} data-tour="primary-action" onClick={() => setForm(true)}>Nova solicitação</Button></div>}
      </Toolbar>
      <DataTable caption="Solicitações e pedidos de compra" rows={rows} columns={cols} rowKey={(p) => p.id} onRowClick={(p) => setOpen(p.id)} exportName="compras" empty={<EmptyState title="Nenhuma compra" />}
        rowActions={(p) => <>
          {p.status === 'solicitada' && canApprove && <><Button size="sm" icon={<Check />} onClick={() => act(p, 'aprovada')}>Aprovar</Button><Button size="sm" icon={<X />} onClick={() => act(p, 'recusada')}>Recusar</Button></>}
          {p.status === 'aprovada' && canEdit && <Button size="sm" icon={<Send />} onClick={() => act(p, 'pedido')}>Emitir pedido</Button>}
          {(p.status === 'pedido' || p.status === 'parcial') && canEdit && <Button size="sm" icon={<PackageCheck />} onClick={() => setRecv(p)}>Receber</Button>}
        </>} />
      {o && (
        <Dialog open drawer onClose={() => setOpen(null)} title={o.number} description={`${PO_STATUS[o.status].label} · ${o.reason}`}>
          <div className="stack">
            <ul className="divider-list small" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{o.items.map((i) => { const p = products.find((x) => x.id === i.productId); return <li key={i.id} style={{ padding: '6px 0' }}>{p?.name}: {qtyFmt(i.receivedQty, 3)}/{i.qty} {i.unit} recebido(s) · {formatBRL(i.unitCostCents)}/{i.unit}</li> })}</ul>
            {o.payableIds.length > 0 && <p className="small">Contas a pagar geradas: {o.payableIds.length} (veja Financeiro → Contas a pagar).</p>}
            <Timeline items={[...o.history].reverse().map((h) => ({ time: formatDateTime(h.at), title: PO_STATUS[h.to].label, body: [h.by, h.reason].filter(Boolean).join(' · ') }))} />
            {['solicitada', 'aprovada', 'pedido'].includes(o.status) && canEdit && <Button variant="ghost" onClick={() => act(o, 'cancelada')}>Cancelar</Button>}
          </div>
        </Dialog>
      )}
      {form && <RequestDialog onClose={() => setForm(false)} />}
      {recv && <ReceiveDialog po={recv} onClose={() => setRecv(null)} />}
    </div>
  )
}

function RequestDialog({ onClose }: { onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const products = useCollection(t.tenantId, 'products').filter((p) => p.active)
  const suppliers = useCollection(t.tenantId, 'suppliers')
  const orders = useCollection(t.tenantId, 'purchaseOrders')
  const [supplierId, setSupplier] = useState(suppliers[0]?.id ?? '')
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState([{ productId: products[0]?.id ?? '', qty: 1, unit: products[0]?.conversions[0]?.unit ?? products[0]?.baseUnit ?? 'un', cost: null as number | null }])
  const save = () => { if (run(() => {
    if (!reason.trim()) throw new Error('Informe a justificativa.')
    if (lines.some((l) => !l.productId || !(l.qty > 0) || !l.cost)) throw new Error('Preencha produto, quantidade e custo de cada linha.')
    const po: PurchaseOrder = { id: uid('po_'), tenantId: t.tenantId, createdAt: nowISO(), number: `PC-${String(orders.length + 1).padStart(4, '0')}`, unitId: t.unitId ?? t.allowedUnits[0].id, supplierId, requestedBy: actor.name, reason,
      items: lines.map((l) => ({ id: uid('pl_'), productId: l.productId, qty: l.qty, unit: l.unit, unitCostCents: l.cost!, receivedQty: 0 })), status: 'solicitada', history: [{ at: nowISO(), from: null, to: 'solicitada', by: actor.name }], payableIds: [] }
    db.insert(t.tenantId, 'purchaseOrders', po)
  }, 'Solicitação criada; aguardando aprovação.')) onClose() }
  return (
    <Dialog open onClose={onClose} size="lg" title="Nova solicitação de compra" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Enviar para aprovação</Button></>}>
      <div className="stack">
        <div className="form-grid"><Field label="Fornecedor"><Select value={supplierId} onChange={(e) => setSupplier(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field><Field label="Justificativa" required><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
        {lines.map((l, k) => { const p = products.find((x) => x.id === l.productId); return (
          <fieldset key={k} className="form-grid"><legend>Item {k + 1}</legend>
            <Field label="Produto"><Select value={l.productId} onChange={(e) => { const np = products.find((x) => x.id === e.target.value); setLines(lines.map((x, i) => i === k ? { ...x, productId: e.target.value, unit: np?.conversions[0]?.unit ?? np?.baseUnit ?? 'un' } : x)) }}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Qtd."><Input type="number" min={1} value={l.qty} onChange={(e) => setLines(lines.map((x, i) => i === k ? { ...x, qty: Number(e.target.value) } : x))} /></Field>
            <Field label="Unidade de compra"><Select value={l.unit} onChange={(e) => setLines(lines.map((x, i) => i === k ? { ...x, unit: e.target.value } : x))}>{[p?.baseUnit, ...(p?.conversions.map((c) => c.unit) ?? [])].filter(Boolean).map((u) => <option key={u}>{u}</option>)}</Select></Field>
            <Field label={`Custo por ${l.unit} (R$)`}><MoneyInput value={l.cost} onChange={(v) => setLines(lines.map((x, i) => i === k ? { ...x, cost: v } : x))} /></Field>
          </fieldset>
        ) })}
        <Button icon={<Plus />} onClick={() => setLines([...lines, { productId: products[0]?.id ?? '', qty: 1, unit: products[0]?.conversions[0]?.unit ?? 'un', cost: null }])}>Adicionar item</Button>
      </div>
    </Dialog>
  )
}

function ReceiveDialog({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const products = useCollection(t.tenantId, 'products')
  const [nf, setNf] = useState('')
  const [lines, setLines] = useState(po.items.map((i) => ({ lineId: i.id, qty: Math.max(0, i.qty - i.receivedQty), lotCode: '', expiresOn: addDaysCivil(todayCivil(), 365) })))
  return (
    <Dialog open onClose={onClose} size="lg" title={`Recebimento — ${po.number}`} description="Gera entrada por lote (convertida para unidade base) e conta a pagar do valor efetivamente recebido."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => { if (run(() => receivePO(t.tenantId, po.id, lines, actor.name, nf), 'Recebimento registrado; estoque e contas a pagar atualizados.')) onClose() }}>Confirmar recebimento</Button></>}>
      <div className="stack">
        <Field label="Nota fiscal (número)"><Input value={nf} onChange={(e) => setNf(e.target.value)} /></Field>
        {po.items.map((i, k) => { const p = products.find((x) => x.id === i.productId); const f = p?.conversions.find((c) => c.unit === i.unit)?.factor ?? 1; return (
          <fieldset key={i.id} className="form-grid"><legend>{p?.name} — pendente {i.qty - i.receivedQty} {i.unit} (1 {i.unit} = {f} {p?.baseUnit})</legend>
            <Field label={`Recebido (${i.unit})`}><Input type="number" min={0} max={i.qty - i.receivedQty} value={lines[k].qty} onChange={(e) => setLines(lines.map((x, j) => j === k ? { ...x, qty: Number(e.target.value) } : x))} /></Field>
            <Field label="Lote"><Input value={lines[k].lotCode} onChange={(e) => setLines(lines.map((x, j) => j === k ? { ...x, lotCode: e.target.value } : x))} /></Field>
            <Field label="Validade"><Input type="date" value={lines[k].expiresOn} onChange={(e) => setLines(lines.map((x, j) => j === k ? { ...x, expiresOn: e.target.value } : x))} /></Field>
          </fieldset>
        ) })}
      </div>
    </Dialog>
  )
}

function EquipmentTab() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const eqs = useCollection(t.tenantId, 'equipment').filter((e) => !t.unitId || e.unitId === t.unitId)
  const resources = useCollection(t.tenantId, 'resources')
  const [mt, setMt] = useState<Equipment | null>(null)
  const [neu, setNeu] = useState<{ name: string; serial: string; resourceId: string } | null>(null)
  const canEdit = t.can('compras', 'update')
  return (
    <div className="stack">
      {canEdit && <div className="row end"><Button icon={<Plus />} onClick={() => setNeu({ name: '', serial: '', resourceId: '' })}>Novo equipamento</Button></div>}
      {eqs.length === 0 && <EmptyState title="Nenhum equipamento cadastrado" />}
      <div className="grid grid-3">
        {eqs.map((e) => { const r = resources.find((x) => x.id === e.resourceId); const active = e.maintenances.find((m) => m.status === 'agendada' && m.end > nowISO()); return (
          <section key={e.id} className="card tight stack" style={{ '--gap': '8px' } as React.CSSProperties}>
            <div className="row between"><strong>{e.name}</strong>{active ? <Badge tone="warning">Manutenção agendada</Badge> : <Badge tone="success">Disponível</Badge>}</div>
            <span className="small muted">Série {e.serial ?? '—'} · {t.units.find((u) => u.id === e.unitId)?.name} · recurso de agenda: {r?.name ?? 'não vinculado'}</span>
            {r && r.blocks.length > 0 && <span className="small">Bloqueios na agenda: {r.blocks.slice(-2).map((b) => `${formatDateTime(b.start)}–${formatDateTime(b.end)}`).join('; ')}</span>}
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{e.maintenances.map((m) => <li key={m.id}>{m.kind} · {formatDateTime(m.start)} · {m.reason} · {m.status}{m.status === 'agendada' && canEdit && <> · <button className="btn-link" style={{ minHeight: 0 }} onClick={() => run(() => completeMaintenance(t.tenantId, e.id, m.id), 'Manutenção concluída.')}>concluir</button></>}</li>)}</ul>
            {canEdit && <Button size="sm" icon={<Wrench />} onClick={() => setMt(e)}>Registrar manutenção</Button>}
          </section>
        ) })}
      </div>
      {mt && <MaintenanceDialog eq={mt} onClose={() => setMt(null)} />}
      {neu && (
        <Dialog open onClose={() => setNeu(null)} title="Novo equipamento" footer={<><Button onClick={() => setNeu(null)}>Cancelar</Button><Button variant="primary" onClick={() => { if (run(() => { if (!neu.name.trim()) throw new Error('Informe o nome.'); db.insert(t.tenantId, 'equipment', { id: uid('eq_'), tenantId: t.tenantId, createdAt: nowISO(), unitId: t.unitId ?? t.allowedUnits[0].id, name: neu.name.trim(), serial: neu.serial || undefined, resourceId: neu.resourceId || undefined, acquiredOn: todayCivil(), maintenances: [], active: true }) }, `Equipamento cadastrado por ${actor.name}.`)) setNeu(null) }}>Salvar</Button></>}>
          <Field label="Nome" required><Input value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })} /></Field>
          <Field label="Número de série"><Input value={neu.serial} onChange={(e) => setNeu({ ...neu, serial: e.target.value })} /></Field>
          <Field label="Recurso de agenda vinculado" hint="Manutenção bloqueia este recurso na agenda"><Select value={neu.resourceId} onChange={(e) => setNeu({ ...neu, resourceId: e.target.value })}><option value="">Nenhum</option>{resources.filter((r) => !t.unitId || r.unitId === t.unitId).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        </Dialog>
      )}
    </div>
  )
}

function MaintenanceDialog({ eq, onClose }: { eq: Equipment; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const tz = t.units.find((u) => u.id === eq.unitId)?.timezone
  const [f, setF] = useState({ kind: 'preventiva' as 'preventiva' | 'corretiva', date: addDaysCivil(todayCivil(), 1), start: '08:00', end: '12:00', reason: '', cost: null as number | null })
  const go = () => run(() => {
    const [sh, sm] = f.start.split(':').map(Number), [eh, em] = f.end.split(':').map(Number)
    scheduleMaintenance(t.tenantId, eq.id, { kind: f.kind, start: zonedToInstant(f.date, sh * 60 + sm, tz), end: zonedToInstant(f.date, eh * 60 + em, tz), reason: f.reason, by: actor.name, costCents: f.cost ?? undefined })
    onClose()
  }, eq.resourceId ? 'Manutenção registrada; horário bloqueado na agenda.' : 'Manutenção registrada (equipamento sem recurso de agenda vinculado).')
  return (
    <Dialog open onClose={onClose} title={`Manutenção — ${eq.name}`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={go}>Registrar e bloquear agenda</Button></>}>
      <div className="form-grid">
        <Field label="Tipo"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'preventiva' | 'corretiva' })}><option value="preventiva">Preventiva</option><option value="corretiva">Corretiva</option></Select></Field>
        <Field label="Data"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Início"><Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Fim"><Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        <Field label="Custo previsto (R$)"><MoneyInput value={f.cost} onChange={(v) => setF({ ...f, cost: v })} /></Field>
      </div>
      <Field label="Motivo" required><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      <p className="small muted">Horário em {formatCivil(f.date)}, fuso da unidade.</p>
    </Dialog>
  )
}
