import { useState } from 'react'
import { Plus, PackagePlus, PackageMinus, ArrowLeftRight, ClipboardCheck } from 'lucide-react'
import type { Lot, Product, StockMovementKind } from '@/domain/modules'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { getPolicies } from '@/domain/settings'
import { Alert, Badge, Button, Checkbox, DataTable, Dialog, Field, Input, Kpi, PageHeader, Select, Tabs, TabPanel, useAction, EmptyState, type Column } from '@/ui'
import { addDaysCivil, formatCivil, formatDateTime, nowISO, todayCivil } from '@/lib/dates'
import { formatBRL } from '@/lib/money'
import { normalize, uid } from '@/lib/util'
import { countLot, isExpired, issueStock, lossStock, receiveStock, reserveStock, stockOf, toBase, transferStock } from './inventory'
import { MoneyInput, ModuleOff, NoAccess, Toolbar, qtyFmt } from './ui'

export const MOVE_LABEL: Record<StockMovementKind, string> = {
  entrada: 'Entrada', saida: 'Saída', consumo_procedimento: 'Consumo (procedimento)', perda: 'Perda', ajuste: 'Ajuste', inventario: 'Inventário',
  transferencia_saida: 'Transferência (saída)', transferencia_entrada: 'Transferência (entrada)', reserva: 'Reserva', liberacao_reserva: 'Liberação de reserva',
}

export function InventoryPage() {
  const t = useTenant()
  const [tab, setTab] = useState('saldo')
  if (!t.moduleOn('estoque')) return <ModuleOff name="Estoque" />
  if (!t.can('estoque')) return <NoAccess what="o estoque" />
  return (
    <div data-tour="page-content" className="com-page">
      <PageHeader title="Estoque" subtitle="Saldos por lote em unidade base, validade, FEFO, inventário e fichas técnicas." />
      <Tabs label="Estoque" value={tab} onChange={setTab} tabs={[{ id: 'saldo', label: 'Produtos e lotes' }, { id: 'mov', label: 'Movimentos' }, { id: 'kits', label: 'Fichas técnicas' }]} />
      <TabPanel>{tab === 'saldo' ? <Balances /> : tab === 'mov' ? <Movements /> : <Kits />}</TabPanel>
    </div>
  )
}

type Op = { kind: 'entrada' | 'saida' | 'transferencia' | 'perda' | 'contagem' | 'reserva'; product: Product; lot?: Lot }

function Balances() {
  const t = useTenant()
  const products = useCollection(t.tenantId, 'products')
  const lots = useCollection(t.tenantId, 'lots')
  const suppliers = useCollection(t.tenantId, 'suppliers')
  const [unit, setUnit] = useState(t.unitId ?? t.allowedUnits[0]?.id ?? '')
  const [q, setQ] = useState('')
  const [op, setOp] = useState<Op | null>(null)
  const [newP, setNewP] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const today = todayCivil()
  const soon = addDaysCivil(today, 30)
  const canW = t.can('estoque', 'update') || t.can('estoque', 'create')
  const ul = lots.filter((l) => l.unitId === unit)
  const rows = products.filter((p) => p.active && (!q || normalize(`${p.name} ${p.sku} ${p.category}`).includes(normalize(q))))
  const low = rows.filter((p) => { const s = stockOf(ul, p.id); return s.qty - s.reserved < p.minQty })
  const expiring = ul.filter((l) => l.qty > 0 && l.expiresOn && l.expiresOn >= today && l.expiresOn <= soon)
  const expired = ul.filter((l) => l.qty > 0 && isExpired(l, today))
  const negPolicy = getPolicies(t.tenantId, unit).payments.allowNegativeStock
  const cols: Column<Product>[] = [
    { id: 'n', header: 'Produto', cell: (p) => p.name, value: (p) => p.name },
    { id: 'cat', header: 'Categoria', cell: (p) => p.category, value: (p) => p.category },
    { id: 'q', header: 'Saldo', num: true, cell: (p) => { const s = stockOf(ul, p.id); return <span className={s.qty - s.reserved < p.minQty ? 'com-neg strong' : undefined}>{qtyFmt(s.qty, p.decimals)} {p.baseUnit}</span> }, value: (p) => stockOf(ul, p.id).qty },
    { id: 'r', header: 'Reservado', num: true, cell: (p) => qtyFmt(stockOf(ul, p.id).reserved, p.decimals), value: (p) => stockOf(ul, p.id).reserved },
    { id: 'min', header: 'Mínimo', num: true, cell: (p) => `${qtyFmt(p.minQty, p.decimals)} ${p.baseUnit}`, value: (p) => p.minQty },
    { id: 'conv', header: 'Conversões', cell: (p) => p.conversions.map((c) => `1 ${c.unit} = ${c.factor} ${p.baseUnit}`).join('; ') || '—' },
    { id: 'sup', header: 'Fornecedor', hidden: true, cell: (p) => suppliers.find((s) => s.id === p.supplierId)?.name ?? '—', value: (p) => suppliers.find((s) => s.id === p.supplierId)?.name },
    { id: 'cost', header: 'Custo/un. base', hidden: true, num: true, cell: (p) => formatBRL(p.costCents), value: (p) => p.costCents / 100 },
  ]
  return (
    <div className="stack">
      <div className="grid grid-4">
        <Kpi label="Produtos ativos" value={rows.length} /><Kpi label="Abaixo do mínimo" value={low.length} foot={low.slice(0, 2).map((p) => p.name).join(', ')} />
        <Kpi label="Lotes vencendo em 30 dias" value={expiring.length} /><Kpi label="Lotes vencidos com saldo" value={expired.length} foot="Bloqueados para uso; registre perda" />
      </div>
      {low.length > 0 && <Alert tone="warning" title="Estoque abaixo do mínimo">{low.map((p) => p.name).join(', ')}. Alerta enviado à equipe de estoque (fila simulada). Gere uma solicitação em Compras.</Alert>}
      {expiring.length > 0 && <Alert tone="info" title="Validade próxima">{expiring.map((l) => `${products.find((p) => p.id === l.productId)?.name} lote ${l.code} (${formatCivil(l.expiresOn)})`).join('; ')}.</Alert>}
      <Toolbar>
        <Field label="Unidade"><Select value={unit} onChange={(e) => setUnit(e.target.value)}>{t.allowedUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Buscar"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, SKU ou categoria" /></Field>
        <div className="row end">{t.can('estoque', 'create') && <Button variant="primary" icon={<Plus />} data-tour="primary-action" onClick={() => setNewP(true)}>Novo produto</Button>}</div>
      </Toolbar>
      <p className="small muted">Saldo negativo: {negPolicy ? 'permitido pela política da unidade' : 'bloqueado pela política'} (produtos podem ter exceção individual). Baixas seguem FEFO e não usam lotes vencidos.</p>
      <DataTable caption="Saldos por produto" rows={rows} columns={cols} rowKey={(p) => p.id} onRowClick={(p) => setOpen(p.id)} exportName={t.can('estoque', 'export') ? 'estoque' : undefined}
        rowActions={(p) => canW ? <><Button size="sm" icon={<PackagePlus />} onClick={() => setOp({ kind: 'entrada', product: p })}>Entrada</Button><Button size="sm" icon={<PackageMinus />} onClick={() => setOp({ kind: 'saida', product: p })}>Saída</Button></> : null} />
      {open && (() => { const p = products.find((x) => x.id === open)!; return (
        <Dialog open drawer size="lg" onClose={() => setOpen(null)} title={p.name} description={`SKU ${p.sku} · unidade base ${p.baseUnit} · ${p.decimals} casa(s) decimal(is)`}>
          <div className="stack">
            {canW && <div className="row">
              <Button size="sm" icon={<PackagePlus />} onClick={() => setOp({ kind: 'entrada', product: p })}>Entrada</Button>
              <Button size="sm" icon={<PackageMinus />} onClick={() => setOp({ kind: 'saida', product: p })}>Saída FEFO</Button>
              {t.allowedUnits.length > 1 && <Button size="sm" icon={<ArrowLeftRight />} onClick={() => setOp({ kind: 'transferencia', product: p })}>Transferir</Button>}
            </div>}
            {canW && <Checkbox label="Permitir saldo negativo para este produto (exceção à política)" checked={p.allowNegative} disabled={!t.can('estoque', 'update')} onChange={(e) => db.update(t.tenantId, 'products', p.id, { allowNegative: e.target.checked })} />}
            <h3>Lotes nesta unidade</h3>
            {ul.filter((l) => l.productId === p.id).length === 0 && <p className="small muted">Sem lotes.</p>}
            {[...ul.filter((l) => l.productId === p.id)].sort((a, b) => (a.expiresOn ?? '9').localeCompare(b.expiresOn ?? '9')).map((l) => (
              <div key={l.id} className="list-card">
                <div className="row between"><strong>Lote {l.code}</strong>{isExpired(l) ? <Badge tone="danger">Vencido</Badge> : l.expiresOn && l.expiresOn <= soon ? <Badge tone="warning">Vence {formatCivil(l.expiresOn)}</Badge> : <Badge tone="neutral">Val. {formatCivil(l.expiresOn)}</Badge>}</div>
                <span className="small">Saldo {qtyFmt(l.qty, p.decimals)} {p.baseUnit} · reservado {qtyFmt(l.reserved, p.decimals)}</span>
                {canW && <div className="row">
                  <Button size="sm" onClick={() => setOp({ kind: 'perda', product: p, lot: l })}>Perda</Button>
                  <Button size="sm" icon={<ClipboardCheck />} onClick={() => setOp({ kind: 'contagem', product: p, lot: l })}>Contagem / ajuste</Button>
                  <Button size="sm" onClick={() => setOp({ kind: 'reserva', product: p, lot: l })}>Reserva</Button>
                </div>}
              </div>
            ))}
          </div>
        </Dialog>
      ) })()}
      {op && <OpDialog op={op} unit={unit} onClose={() => setOp(null)} />}
      {newP && <ProductDialog onClose={() => setNewP(false)} />}
    </div>
  )
}

function OpDialog({ op, unit, onClose }: { op: Op; unit: string; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const p = op.product
  const units = [p.baseUnit, ...p.conversions.map((c) => c.unit)]
  const [f, setF] = useState({ qty: '', unit: op.kind === 'entrada' && p.conversions[0] ? p.conversions[0].unit : p.baseUnit, lot: '', exp: addDaysCivil(todayCivil(), 365), reason: '', to: t.allowedUnits.find((u) => u.id !== unit)?.id ?? '', release: false, mode: 'inventario' as 'inventario' | 'ajuste' })
  const n = Number(f.qty.replace(',', '.'))
  let preview = ''
  try { if (f.qty && op.kind !== 'contagem') preview = `= ${qtyFmt(toBase(p, n, f.unit), p.decimals)} ${p.baseUnit}` } catch (e) { preview = (e as Error).message }
  const titles = { entrada: 'Entrada em estoque', saida: 'Saída (FEFO)', transferencia: 'Transferência entre unidades', perda: `Perda — lote ${op.lot?.code}`, contagem: `Contagem — lote ${op.lot?.code}`, reserva: `Reserva — lote ${op.lot?.code}` }
  const go = () => run(() => {
    if (!Number.isFinite(n) || f.qty === '') throw new Error('Informe a quantidade.')
    if (op.kind === 'entrada') receiveStock(t.tenantId, { productId: p.id, unitId: unit, qty: n, unit: f.unit, lotCode: f.lot, expiresOn: f.exp || undefined, reason: f.reason || undefined, by: actor.name })
    if (op.kind === 'saida') { if (!f.reason.trim()) throw new Error('Informe o motivo da saída.'); issueStock(t.tenantId, { productId: p.id, unitId: unit, qty: n, unit: f.unit, kind: 'saida', reason: f.reason, by: actor.name }) }
    if (op.kind === 'transferencia') transferStock(t.tenantId, { productId: p.id, fromUnitId: unit, toUnitId: f.to, qty: toBase(p, n, f.unit), by: actor.name, reason: f.reason || undefined })
    if (op.kind === 'perda') lossStock(t.tenantId, { lotId: op.lot!.id, qty: n, reason: f.reason, by: actor.name })
    if (op.kind === 'contagem') { const r = countLot(t.tenantId, { lotId: op.lot!.id, counted: n, reason: f.reason, by: actor.name, kind: f.mode }); if (r.diff === 0) throw new Error('Contagem igual ao sistema: nenhum ajuste necessário.') }
    if (op.kind === 'reserva') reserveStock(t.tenantId, { lotId: op.lot!.id, qty: n, by: actor.name, reason: f.reason || undefined, release: f.release })
    onClose()
  }, 'Movimento registrado.')
  return (
    <Dialog open onClose={onClose} title={titles[op.kind]} description={p.name} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={go}>Registrar</Button></>}>
      <div className="form-grid">
        <Field label={op.kind === 'contagem' ? `Quantidade contada (${p.baseUnit})` : 'Quantidade'} hint={op.kind === 'contagem' ? `Sistema: ${qtyFmt(op.lot!.qty, p.decimals)} ${p.baseUnit}` : preview || undefined}><Input inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        {['entrada', 'saida', 'transferencia'].includes(op.kind) && <Field label="Unidade de medida"><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{units.map((u) => <option key={u}>{u}</option>)}</Select></Field>}
        {op.kind === 'entrada' && <><Field label="Lote" required><Input value={f.lot} onChange={(e) => setF({ ...f, lot: e.target.value })} /></Field><Field label="Validade"><Input type="date" value={f.exp} onChange={(e) => setF({ ...f, exp: e.target.value })} /></Field></>}
        {op.kind === 'transferencia' && <Field label="Destino"><Select value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}>{t.allowedUnits.filter((u) => u.id !== unit).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
        {op.kind === 'contagem' && <Field label="Tipo"><Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as 'inventario' | 'ajuste' })}><option value="inventario">Inventário (contagem periódica)</option><option value="ajuste">Ajuste pontual</option></Select></Field>}
      </div>
      {op.kind === 'reserva' && <Checkbox label="Liberar reserva (em vez de reservar)" checked={f.release} onChange={(e) => setF({ ...f, release: e.target.checked })} />}
      <Field label="Motivo" required={['saida', 'perda', 'contagem'].includes(op.kind)}><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
    </Dialog>
  )
}

function ProductDialog({ onClose }: { onClose: () => void }) {
  const t = useTenant()
  const run = useAction()
  const suppliers = useCollection(t.tenantId, 'suppliers')
  const [p, setP] = useState({ name: '', sku: '', category: '', baseUnit: 'un', decimals: 0, minQty: 0, cost: null as number | null, supplierId: '', convUnit: '', convFactor: '' })
  const save = () => { if (run(() => {
    if (!p.name.trim() || !p.baseUnit.trim()) throw new Error('Nome e unidade base são obrigatórios.')
    const factor = Number(p.convFactor.replace(',', '.'))
    if (p.convUnit && !(factor > 0)) throw new Error('Fator de conversão deve ser maior que zero.')
    const prod: Product = { id: uid('prd_'), tenantId: t.tenantId, createdAt: nowISO(), name: p.name.trim(), sku: p.sku || `SKU-${uid().slice(0, 6).toUpperCase()}`, category: p.category || 'Geral', baseUnit: p.baseUnit.trim(), conversions: p.convUnit ? [{ unit: p.convUnit.trim(), factor }] : [], minQty: p.minQty, decimals: Math.max(0, Math.min(3, p.decimals)), supplierId: p.supplierId || undefined, allowNegative: false, costCents: p.cost ?? 0, active: true }
    db.insert(t.tenantId, 'products', prod)
  }, 'Produto cadastrado.')) onClose() }
  return (
    <Dialog open onClose={onClose} size="lg" title="Novo produto" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar</Button></>}>
      <div className="form-grid">
        <Field label="Nome" required><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
        <Field label="SKU"><Input value={p.sku} onChange={(e) => setP({ ...p, sku: e.target.value })} /></Field>
        <Field label="Categoria"><Input value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })} /></Field>
        <Field label="Unidade base" required hint="Ex.: un, ml, g"><Input value={p.baseUnit} onChange={(e) => setP({ ...p, baseUnit: e.target.value })} /></Field>
        <Field label="Casas decimais" hint="0 = inteiro; 1–3 para fracionados"><Input type="number" min={0} max={3} value={p.decimals} onChange={(e) => setP({ ...p, decimals: Number(e.target.value) })} /></Field>
        <Field label="Estoque mínimo (unidade base)"><Input type="number" min={0} value={p.minQty} onChange={(e) => setP({ ...p, minQty: Number(e.target.value) })} /></Field>
        <Field label="Unidade de compra" hint="Ex.: caixa"><Input value={p.convUnit} onChange={(e) => setP({ ...p, convUnit: e.target.value })} /></Field>
        <Field label="1 unidade de compra = ? base" hint="Ex.: caixa = 50 un"><Input inputMode="decimal" value={p.convFactor} onChange={(e) => setP({ ...p, convFactor: e.target.value })} /></Field>
        <Field label="Custo por unidade base (R$)"><MoneyInput value={p.cost} onChange={(v) => setP({ ...p, cost: v })} /></Field>
        <Field label="Fornecedor"><Select value={p.supplierId} onChange={(e) => setP({ ...p, supplierId: e.target.value })}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      </div>
    </Dialog>
  )
}

function Movements() {
  const t = useTenant()
  const mvs = useCollection(t.tenantId, 'stockMovements')
  const products = useCollection(t.tenantId, 'products')
  const lots = useCollection(t.tenantId, 'lots')
  const [kind, setKind] = useState('')
  const rows = mvs.filter((m) => (!t.unitId || m.unitId === t.unitId) && (!kind || m.kind === kind)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <div className="stack">
      <Toolbar><Field label="Tipo"><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Todos</option>{Object.entries(MOVE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field></Toolbar>
      <DataTable caption="Movimentos de estoque" rows={rows} rowKey={(m) => m.id} exportName={t.can('estoque', 'export') ? 'movimentos-estoque' : undefined} empty={<EmptyState title="Sem movimentos" />} columns={[
        { id: 'at', header: 'Quando', cell: (m) => formatDateTime(m.createdAt), value: (m) => m.createdAt },
        { id: 'p', header: 'Produto', cell: (m) => products.find((p) => p.id === m.productId)?.name ?? '—', value: (m) => products.find((p) => p.id === m.productId)?.name },
        { id: 'k', header: 'Tipo', cell: (m) => MOVE_LABEL[m.kind], value: (m) => m.kind },
        { id: 'q', header: 'Qtd. (base)', num: true, cell: (m) => <span className={m.qty < 0 ? 'com-neg' : undefined}>{m.qty > 0 ? '+' : ''}{m.qty}</span>, value: (m) => m.qty },
        { id: 'l', header: 'Lote', cell: (m) => lots.find((l) => l.id === m.lotId)?.code ?? '—', value: (m) => lots.find((l) => l.id === m.lotId)?.code },
        { id: 'by', header: 'Quem', cell: (m) => m.by, value: (m) => m.by },
        { id: 'r', header: 'Motivo / vínculo', cell: (m) => <span className="small">{m.reason ?? '—'}{m.appointmentId ? ` · atendimento ${m.appointmentId.slice(-6)}` : ''}</span>, value: (m) => `${m.reason ?? ''} ${m.appointmentId ?? ''}` },
      ]} />
    </div>
  )
}

function Kits() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const services = useCollection(t.tenantId, 'services').filter((s) => s.active)
  const kits = useCollection(t.tenantId, 'serviceKits')
  const products = useCollection(t.tenantId, 'products').filter((p) => p.active)
  const [svc, setSvc] = useState(kits[0]?.serviceId ?? services[0]?.id ?? '')
  const kit = kits.find((k) => k.serviceId === svc)
  const [items, setItems] = useState(kit?.items ?? [])
  const [loaded, setLoaded] = useState(svc)
  if (loaded !== svc) { setLoaded(svc); setItems(kits.find((k) => k.serviceId === svc)?.items ?? []) }
  const can = t.can('estoque', 'update')
  const cost = items.reduce((a, i) => a + i.qty * (products.find((p) => p.id === i.productId)?.costCents ?? 0), 0)
  const save = () => run(() => {
    if (items.some((i) => !(i.qty > 0))) throw new Error('Quantidades devem ser maiores que zero.')
    if (new Set(items.map((i) => i.productId)).size !== items.length) throw new Error('Produto repetido na ficha.')
    if (kit) db.update(t.tenantId, 'serviceKits', kit.id, { items, updatedBy: actor.name })
    else db.insert(t.tenantId, 'serviceKits', { id: uid('kit_'), tenantId: t.tenantId, createdAt: nowISO(), serviceId: svc, items, updatedBy: actor.name })
  }, 'Ficha técnica salva.')
  return (
    <div className="stack">
      <p className="small muted">Ao concluir um atendimento, a ficha técnica do serviço é consumida uma única vez (FEFO). Cancelamento posterior não devolve material automaticamente.</p>
      <Toolbar>
        <Field label="Serviço"><Select value={svc} onChange={(e) => setSvc(e.target.value)}>{services.map((s) => <option key={s.id} value={s.id}>{s.name}{kits.some((k) => k.serviceId === s.id && k.items.length) ? ' ✓' : ''}</option>)}</Select></Field>
      </Toolbar>
      <section className="panel"><div className="panel-body stack">
        {items.length === 0 && <p className="small muted">Sem itens na ficha técnica.</p>}
        {items.map((it, k) => { const p = products.find((x) => x.id === it.productId); return (
          <div key={k} className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Produto" className="grow"><Select value={it.productId} disabled={!can} onChange={(e) => setItems(items.map((x, i) => i === k ? { ...x, productId: e.target.value } : x))}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label={`Qtd. (${p?.baseUnit ?? ''})`}><Input type="number" min={0} step={p?.decimals ? 1 / 10 ** p.decimals : 1} disabled={!can} value={it.qty} onChange={(e) => setItems(items.map((x, i) => i === k ? { ...x, qty: Number(e.target.value) } : x))} /></Field>
            {can && <Button variant="ghost" onClick={() => setItems(items.filter((_, i) => i !== k))}>Remover</Button>}
          </div>
        ) })}
        <p className="small">Custo estimado de insumos: <strong>{formatBRL(Math.round(cost))}</strong></p>
        {can && <div className="row"><Button icon={<Plus />} onClick={() => products[0] && setItems([...items, { productId: products[0].id, qty: 1 }])}>Adicionar insumo</Button><Button variant="primary" onClick={save}>Salvar ficha técnica</Button></div>}
      </div></section>
    </div>
  )
}
