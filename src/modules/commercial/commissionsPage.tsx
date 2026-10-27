import { useState } from 'react'
import { Play, Plus, GitBranch } from 'lucide-react'
import type { PaymentMethod } from '@/domain/types'
import { PAYMENT_METHOD_LABEL } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { Alert, Badge, Button, Checkbox, DataTable, Dialog, Field, Input, PageHeader, Select, Tabs, TabPanel, useAction, EmptyState, type Column } from '@/ui'
import { addDaysCivil, formatCivil, formatDateTime, nowISO, todayCivil } from '@/lib/dates'
import { formatBRL, parseBRL } from '@/lib/money'
import { uid } from '@/lib/util'
import { addAdjustment, DEFAULT_FEES, newRuleVersion, nextPeriodStart, runClosing, totalsByProfessional } from './commissions'
import { ModuleOff, NoAccess, Toolbar } from './ui'
import type { CommissionClosing, CommissionRule } from './types'

export function CommissionsPage() {
  const t = useTenant()
  const [tab, setTab] = useState('fech')
  if (!t.moduleOn('comissoes')) return <ModuleOff name="Comissões e repasses" />
  const scope = t.scope('comissoes')
  if (!scope) return <NoAccess what="comissões e repasses" />
  return (
    <div data-tour="page-content" className="com-page">
      <PageHeader title="Comissões e repasses" subtitle="Cálculo gerencial com regras versionadas e snapshot imutável por fechamento." />
      <Alert tone="warning" title="Repasse gerencial NÃO equivale a split bancário executado pelo gateway">Os valores abaixo são apuração interna para pagamento aos profissionais. Nenhuma divisão de recebimento é feita no meio de pagamento.</Alert>
      <div style={{ height: 12 }} />
      <Tabs label="Comissões" value={tab} onChange={setTab} tabs={[{ id: 'fech', label: 'Fechamentos' }, { id: 'regras', label: 'Regras' }, { id: 'par', label: 'Parâmetros' }]} />
      <TabPanel>{tab === 'fech' ? <Closings own={scope === 'own'} /> : tab === 'regras' ? <Rules /> : <Params />}</TabPanel>
    </div>
  )
}

function useFees() {
  const p = useCollection(useTenant().tenantId, 'commissionParams')[0]
  return p ? { feeByMethod: { ...DEFAULT_FEES.feeByMethod, ...p.feeByMethod } } : DEFAULT_FEES
}

function Closings({ own }: { own: boolean }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const closings = useCollection(t.tenantId, 'commissionClosings')
  const pros = useCollection(t.tenantId, 'professionals')
  const fees = useFees()
  const next = nextPeriodStart(closings)
  const today = todayCivil()
  const firstDefault = next ?? addDaysCivil(today, -30)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState(today)
  const [sel, setSel] = useState<string | null>(closings[closings.length - 1]?.id ?? null)
  const [adj, setAdj] = useState(false)
  const cl = closings.find((c) => c.id === sel)
  const canRun = t.can('comissoes', 'create')
  return (
    <div className="stack">
      {canRun && (
        <Toolbar>
          <Field label="Início do período" hint={next ? `Próximo início sem sobreposição: ${formatCivil(next)}` : undefined}><Input type="date" value={start || firstDefault} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Fim do período"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <div className="row end"><Button variant="primary" icon={<Play />} data-tour="primary-action" onClick={() => run(() => { const c = runClosing(t.tenantId, start || firstDefault, end, fees, actor.name); setSel(c.id) }, 'Fechamento executado — snapshot gravado.')}>Executar fechamento</Button></div>
        </Toolbar>
      )}
      {closings.length === 0 ? <EmptyState title="Nenhum fechamento ainda">Execute o primeiro fechamento para apurar repasses do período.</EmptyState> : (
        <div className="row">{closings.map((c) => <button key={c.id} className="chip" aria-pressed={c.id === sel} onClick={() => setSel(c.id)}>{c.number} · {formatCivil(c.periodStart)}–{formatCivil(c.periodEnd)}</button>)}</div>
      )}
      {cl && <ClosingView cl={cl} own={own} pros={pros} onAdjust={() => setAdj(true)} />}
      {adj && cl && <AdjustDialog cl={cl} onClose={() => setAdj(false)} />}
    </div>
  )
}

function ClosingView({ cl, own, pros, onAdjust }: { cl: CommissionClosing; own: boolean; pros: { id: string; name: string }[]; onAdjust: () => void }) {
  const t = useTenant()
  const services = useCollection(t.tenantId, 'services')
  const myPro = t.effectiveUser?.professionalId
  const items = own ? cl.items.filter((i) => i.professionalId === myPro) : cl.items
  const totals = [...totalsByProfessional(cl).entries()].filter(([id]) => !own || id === myPro)
  const name = (id: string) => pros.find((p) => p.id === id)?.name ?? id
  const cols: Column<typeof items[number]>[] = [
    { id: 'pro', header: 'Profissional', cell: (i) => name(i.professionalId), value: (i) => name(i.professionalId) },
    { id: 'd', header: 'Data', cell: (i) => formatCivil(i.date), value: (i) => i.date },
    { id: 'svc', header: 'Serviço', cell: (i) => services.find((s) => s.id === i.serviceId)?.name ?? '—', value: (i) => services.find((s) => s.id === i.serviceId)?.name },
    { id: 'k', header: 'Tipo', cell: (i) => <Badge tone={i.kind === 'estorno' ? 'danger' : 'neutral'}>{i.kind === 'estorno' ? 'Estorno' : 'Recebimento'}</Badge>, value: (i) => i.kind },
    { id: 'm', header: 'Forma', cell: (i) => PAYMENT_METHOD_LABEL[i.method], value: (i) => i.method, hidden: true },
    { id: 'b', header: 'Base', num: true, cell: (i) => formatBRL(i.baseCents), value: (i) => i.baseCents / 100 },
    { id: 'r', header: 'Regra', cell: (i) => `v${i.ruleVersion} · ${i.percent}%`, value: (i) => `${i.ruleKey} v${i.ruleVersion}` },
    { id: 'c', header: 'Repasse', num: true, cell: (i) => <span className={i.commissionCents < 0 ? 'com-neg' : undefined}>{formatBRL(i.commissionCents)}</span>, value: (i) => i.commissionCents / 100 },
    { id: 'memo', header: 'Memória de cálculo', cell: (i) => <span className="com-memo">{i.memo}</span>, value: (i) => i.memo, hidden: true },
  ]
  return (
    <div className="stack">
      <p className="small muted">{cl.number} executado em {formatDateTime(cl.createdAt)} por {cl.executedBy}. Snapshot imutável: alterações de regra posteriores não afetam este fechamento.</p>
      <div className="grid grid-3">
        {totals.map(([id, v]) => <div key={id} className="kpi"><span className="kpi-label">{name(id)}</span><span className="kpi-value">{formatBRL(v.commission + v.adjustments)}</span><span className="kpi-foot">{v.count} item(ns) · base {formatBRL(v.base)}{v.adjustments ? ` · ajustes ${formatBRL(v.adjustments)}` : ''}</span></div>)}
      </div>
      <DataTable caption={`Itens do fechamento ${cl.number}`} rows={items} columns={cols} rowKey={(i) => i.id} exportName={t.can('comissoes', 'export') ? `repasse-${cl.number}` : undefined}
        actions={t.can('comissoes', 'approve') ? <Button size="sm" icon={<Plus />} onClick={onAdjust}>Ajuste autorizado</Button> : undefined} />
      <details><summary className="strong">Memória de cálculo detalhada ({items.length})</summary><ul className="com-memo">{items.map((i) => <li key={i.id}>{name(i.professionalId)} · {formatCivil(i.date)}: {i.memo}</li>)}</ul></details>
      {cl.adjustments.length > 0 && <section><h3>Ajustes autorizados</h3><ul className="small">{cl.adjustments.filter((a) => !own || a.professionalId === myPro).map((a) => <li key={a.id}>{formatDateTime(a.at)} · {name(a.professionalId)} · {formatBRL(a.amountCents)} · {a.reason} · aprovado por {a.approvedBy}</li>)}</ul></section>}
      {!own && cl.skipped.length > 0 && <details><summary className="small">{cl.skipped.length} pagamento(s) não incluído(s)</summary><ul className="com-memo">{cl.skipped.map((s) => <li key={s.paymentId}>{s.paymentId.slice(-8)}: {s.reason}</li>)}</ul></details>}
    </div>
  )
}

function AdjustDialog({ cl, onClose }: { cl: CommissionClosing; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const pros = useCollection(t.tenantId, 'professionals')
  const [pro, setPro] = useState(pros[0]?.id ?? '')
  const [v, setV] = useState('')
  const [reason, setReason] = useState('')
  return (
    <Dialog open onClose={onClose} title={`Ajuste autorizado — ${cl.number}`} description="Ajuste é acrescentado com motivo e aprovador; itens calculados não são alterados." footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => { if (run(() => { const c = parseBRL(v.replace(/^-/, '')); if (c == null) throw new Error('Valor inválido.'); addAdjustment(t.tenantId, cl.id, { professionalId: pro, amountCents: v.trim().startsWith('-') ? -c : c, reason, approvedBy: actor.name }) }, 'Ajuste registrado.')) onClose() }}>Aprovar ajuste</Button></>}>
      <Field label="Profissional"><Select value={pro} onChange={(e) => setPro(e.target.value)}>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <Field label="Valor (R$)" hint="Use sinal negativo para desconto (ex.: -50,00)."><Input value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" /></Field>
      <Field label="Motivo" required><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Dialog>
  )
}

function Rules() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const rules = useCollection(t.tenantId, 'commissionRules')
  const pros = useCollection(t.tenantId, 'professionals')
  const services = useCollection(t.tenantId, 'services')
  const [edit, setEdit] = useState<{ base: CommissionRule; isNew: boolean } | null>(null)
  const canEdit = t.can('comissoes', 'update') || t.can('comissoes', 'create')
  const keys = Array.from(new Set(rules.map((r) => r.ruleKey)))
  const today = todayCivil()
  const blank = (): CommissionRule => ({ id: uid('cr_'), tenantId: t.tenantId, createdAt: nowISO(), ruleKey: uid('crk_'), version: 1, name: '', validFrom: today, percent: 30, base: 'bruta', deductFees: false, labPercent: 0, deductSupplies: false, deductDiscounts: false, createdBy: actor.name })
  const save = (r: CommissionRule, isNew: boolean) => run(() => {
    if (!r.name.trim()) throw new Error('Informe o nome da regra.')
    if (r.percent < 0 || r.percent > 100) throw new Error('Percentual entre 0 e 100.')
    if (r.tierMinCents != null && r.tierMaxCents != null && r.tierMinCents > r.tierMaxCents) throw new Error('Faixa inválida.')
    db.insert(t.tenantId, 'commissionRules', isNew ? r : newRuleVersion(rules, r.ruleKey, r, actor.name, t.tenantId))
    setEdit(null)
  }, isNew ? 'Regra criada.' : 'Nova versão gravada. Versões anteriores permanecem para fechamentos passados.')
  return (
    <div className="stack">
      {canEdit && <div className="row end"><Button variant="primary" icon={<Plus />} onClick={() => setEdit({ base: blank(), isNew: true })}>Nova regra</Button></div>}
      <p className="small muted">Prioridade: profissional + procedimento &gt; profissional &gt; procedimento &gt; geral. Vale a versão vigente na data do recebimento.</p>
      {keys.map((k) => {
        const vs = rules.filter((r) => r.ruleKey === k).sort((a, b) => b.version - a.version)
        const cur = vs.find((r) => r.validFrom <= today) ?? vs[vs.length - 1]
        return (
          <section key={k} className="panel"><div className="panel-head"><h2 style={{ fontSize: 15 }}>{cur.name}{cur.archived && <Badge>encerrada</Badge>}</h2>{canEdit && <Button size="sm" icon={<GitBranch />} onClick={() => setEdit({ base: { ...vs[0], validFrom: addDaysCivil(today, 1) }, isNew: false })}>Nova versão</Button>}</div>
            <div className="panel-body"><ul className="divider-list small" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{vs.map((r) => (
              <li key={r.id} style={{ padding: '6px 0' }}><strong>v{r.version}</strong> · desde {formatCivil(r.validFrom)} · {r.percent}% base {r.base}{r.base === 'liquida' ? ` (${[r.deductDiscounts && 'descontos', r.deductFees && 'taxas', r.labPercent && `lab ${r.labPercent}%`, r.deductSupplies && 'insumos'].filter(Boolean).join(', ') || 'sem deduções'})` : ''}
                {' · '}{r.professionalId ? pros.find((p) => p.id === r.professionalId)?.name : 'Todos os profissionais'}{r.serviceId ? ` · ${services.find((s) => s.id === r.serviceId)?.name}` : ''}{r.tierMinCents != null ? ` · faixa ≥ ${formatBRL(r.tierMinCents)}` : ''}{r.archived ? ' · encerrada' : ''}{r.note ? ` · ${r.note}` : ''}</li>
            ))}</ul></div>
          </section>
        )
      })}
      {edit && <RuleDialog init={edit.base} isNew={edit.isNew} onSave={save} onClose={() => setEdit(null)} />}
    </div>
  )
}

function RuleDialog({ init, isNew, onSave, onClose }: { init: CommissionRule; isNew: boolean; onSave: (r: CommissionRule, isNew: boolean) => void; onClose: () => void }) {
  const t = useTenant()
  const pros = useCollection(t.tenantId, 'professionals')
  const services = useCollection(t.tenantId, 'services')
  const [r, setR] = useState(init)
  const money = (c?: number) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','))
  return (
    <Dialog open onClose={onClose} size="lg" title={isNew ? 'Nova regra de repasse' : `Nova versão de "${init.name}"`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => onSave(r, isNew)}>Salvar</Button></>}>
      <div className="form-grid">
        <Field label="Nome" required><Input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></Field>
        <Field label="Profissional"><Select value={r.professionalId ?? ''} onChange={(e) => setR({ ...r, professionalId: e.target.value || undefined })}><option value="">Todos</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Procedimento"><Select value={r.serviceId ?? ''} onChange={(e) => setR({ ...r, serviceId: e.target.value || undefined })}><option value="">Todos</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Vigente a partir de"><Input type="date" value={r.validFrom} onChange={(e) => setR({ ...r, validFrom: e.target.value })} /></Field>
        <Field label="Percentual (%)"><Input type="number" min={0} max={100} step={0.1} value={r.percent} onChange={(e) => setR({ ...r, percent: Number(e.target.value) })} /></Field>
        <Field label="Base"><Select value={r.base} onChange={(e) => setR({ ...r, base: e.target.value as 'bruta' | 'liquida' })}><option value="bruta">Bruta</option><option value="liquida">Líquida</option></Select></Field>
        <Field label="Faixa: produção mínima (R$)"><Input defaultValue={money(r.tierMinCents)} onChange={(e) => setR({ ...r, tierMinCents: parseBRL(e.target.value) ?? undefined })} /></Field>
        <Field label="Faixa: produção máxima (R$)"><Input defaultValue={money(r.tierMaxCents)} onChange={(e) => setR({ ...r, tierMaxCents: parseBRL(e.target.value) ?? undefined })} /></Field>
        <Field label="Laboratório (% do bruto)"><Input type="number" min={0} max={100} value={r.labPercent} disabled={r.base !== 'liquida'} onChange={(e) => setR({ ...r, labPercent: Number(e.target.value) })} /></Field>
      </div>
      <fieldset disabled={r.base !== 'liquida'}><legend>Deduções da base líquida</legend>
        <Checkbox label="Descontos concedidos" checked={r.deductDiscounts} onChange={(e) => setR({ ...r, deductDiscounts: e.target.checked })} />
        <Checkbox label="Taxas do meio de pagamento (parâmetros)" checked={r.deductFees} onChange={(e) => setR({ ...r, deductFees: e.target.checked })} />
        <Checkbox label="Insumos (custo da ficha técnica)" checked={r.deductSupplies} onChange={(e) => setR({ ...r, deductSupplies: e.target.checked })} />
      </fieldset>
      {!isNew && <Checkbox label="Encerrar esta regra a partir da data (versão de encerramento)" checked={!!r.archived} onChange={(e) => setR({ ...r, archived: e.target.checked })} />}
    </Dialog>
  )
}

function Params() {
  const t = useTenant()
  const run = useAction()
  const cur = useFees()
  const [fees, setFees] = useState(cur.feeByMethod)
  const can = t.can('comissoes', 'update')
  return (
    <div className="stack">
      <p className="small muted">Taxas estimadas do meio de pagamento usadas na base líquida. Informadas pela clínica — confira com o contrato do provedor. Ficam gravadas no snapshot de cada fechamento.</p>
      <div className="form-grid">{(Object.keys(fees) as PaymentMethod[]).map((m) => <Field key={m} label={`${PAYMENT_METHOD_LABEL[m]} (%)`}><Input type="number" min={0} step={0.01} disabled={!can} value={fees[m]} onChange={(e) => setFees({ ...fees, [m]: Number(e.target.value) })} /></Field>)}</div>
      {can && <div className="row end"><Button variant="primary" onClick={() => run(() => { if (Object.values(fees).some((v) => !(v >= 0 && v < 100))) throw new Error('Taxas devem estar entre 0 e 100%.'); db.set(t.tenantId, 'commissionParams', [{ id: 'params', tenantId: t.tenantId, createdAt: nowISO(), feeByMethod: fees }]) }, 'Parâmetros salvos para os próximos fechamentos.')}>Salvar parâmetros</Button></div>}
    </div>
  )
}
