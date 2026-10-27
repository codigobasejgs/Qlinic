import { useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { Alert, Button, Field, Input, PageHeader, Select, useAction } from '@/ui'
import { nowISO } from '@/lib/dates'
import { formatBRL } from '@/lib/money'
import { uid } from '@/lib/util'
import { DEFAULT_PRICING, simulatePrice } from './pricing'
import { MoneyInput, NoAccess, pct } from './ui'
import type { PricingInputs } from './types'

const NUM: { k: keyof PricingInputs; label: string; step?: number; hint?: string }[] = [
  { k: 'rooms', label: 'Salas/cadeiras' }, { k: 'hoursPerDay', label: 'Horas por dia' }, { k: 'daysPerMonth', label: 'Dias úteis/mês' },
  { k: 'occupancyPercent', label: 'Ocupação (%)', hint: 'Fração da capacidade efetivamente vendida' }, { k: 'durationMin', label: 'Duração do procedimento (min)' },
  { k: 'taxPercent', label: 'Impostos informados (%)', step: 0.01, hint: 'Informe a alíquota do seu regime (contador)' }, { k: 'paymentFeePercent', label: 'Taxa do meio de pagamento (%)', step: 0.01 },
  { k: 'commissionPercent', label: 'Repasse ao profissional (%)', step: 0.1 }, { k: 'markupPercent', label: 'Markup sobre custo (%)' }, { k: 'targetMarginPercent', label: 'Margem desejada sobre preço (%)' },
]

export function PricingSimulatorPage() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const scenarios = useCollection(t.tenantId, 'pricingScenarios')
  const services = useCollection(t.tenantId, 'services')
  const [i, setI] = useState<PricingInputs>(scenarios[0]?.inputs ?? DEFAULT_PRICING)
  const [name, setName] = useState('')
  const [cmp, setCmp] = useState<string[]>(scenarios.slice(0, 2).map((s) => s.id))
  if (!t.can('financeiro')) return <NoAccess what="a precificação" />
  const r = simulatePrice(i)
  const set = (k: keyof PricingInputs, v: number) => setI({ ...i, [k]: Number.isFinite(v) ? v : 0 })
  const compared = scenarios.filter((s) => cmp.includes(s.id))
  return (
    <div data-tour="page-content" className="com-page">
      <PageHeader title="Simulador de precificação" subtitle="Custo/hora, custo do procedimento e preço sugerido por markup e por margem." />
      <div className="stack">
        <Alert tone="info" title="Margem é estimativa, não lucro contábil garantido">Os resultados dependem das premissas informadas (custos, ocupação, impostos, taxas). Não substituem apuração contábil nem orientação do seu contador.</Alert>
        <div className="grid grid-2">
          <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Premissas</h2>
            <Select aria-label="Carregar cenário" value="" onChange={(e) => { const s = scenarios.find((x) => x.id === e.target.value); if (s) setI(s.inputs) }}><option value="">Carregar cenário…</option>{scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          </div><div className="panel-body form-grid">
            <Field label="Custos fixos mensais (R$)" hint="Aluguel, equipe fixa, sistemas, depreciação…"><MoneyInput value={i.fixedMonthlyCents} onChange={(v) => set('fixedMonthlyCents', v ?? 0)} /></Field>
            <Field label="Insumos por procedimento (R$)" hint="Use a ficha técnica do serviço"><MoneyInput value={i.suppliesCents} onChange={(v) => set('suppliesCents', v ?? 0)} /></Field>
            {NUM.map((n) => <Field key={n.k} label={n.label} hint={n.hint}><Input type="number" min={0} step={n.step ?? 1} value={i[n.k]} onChange={(e) => set(n.k, Number(e.target.value))} /></Field>)}
          </div></section>
          <section className="panel" aria-live="polite"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Resultado</h2></div><div className="panel-body stack">
            {r.errors.map((e) => <Alert key={e} tone="danger">{e}</Alert>)}
            <dl className="com-dl">
              <dt>Capacidade efetiva</dt><dd>{r.capacityHours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h/mês</dd>
              <dt>Custo fixo por hora</dt><dd>{formatBRL(r.costPerHour)}</dd>
              <dt>Rateio fixo do procedimento</dt><dd>{formatBRL(r.fixedShare)}</dd>
              <dt>+ Insumos</dt><dd>{formatBRL(i.suppliesCents)}</dd>
              <dt className="total">Custo direto do procedimento</dt><dd className="total">{formatBRL(r.directCost)}</dd>
              <dt>Variáveis sobre o preço</dt><dd>{pct(r.variablePercent, 2)}</dd>
            </dl>
            <div className="grid grid-2">
              <div className="kpi"><span className="kpi-label">Preço por markup {pct(i.markupPercent)}</span><span className="kpi-value">{formatBRL(r.markup.price)}</span><span className="kpi-foot">Margem estimada após variáveis: <strong className={r.markup.profit < 0 ? 'com-neg' : undefined}>{pct(r.markup.marginPercent)}</strong> ({formatBRL(r.markup.profit)})</span></div>
              <div className="kpi"><span className="kpi-label">Preço por margem {pct(i.targetMarginPercent)}</span><span className="kpi-value">{formatBRL(r.margin.price)}</span><span className="kpi-foot">Resultado estimado: {formatBRL(r.margin.profit)} por procedimento</span></div>
            </div>
            <p className="small muted"><strong>Diferença conceitual:</strong> markup é aplicado sobre o custo (custo × (1 + markup)); margem é a fração do preço que sobra (custo ÷ (1 − variáveis − margem)). Um markup de 100% não significa margem de 100% — e, depois de impostos, taxas e repasse, pode até ser prejuízo.</p>
            {services.length > 0 && <p className="small">Referência: {services.slice(0, 3).map((s) => `${s.name} ${formatBRL(s.priceCents)}`).join(' · ')}</p>}
            {t.can('financeiro', 'create') && <div className="row" style={{ alignItems: 'flex-end' }}>
              <Field label="Nome do cenário" className="grow"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Button variant="primary" icon={<Save />} data-tour="primary-action" onClick={() => { if (run(() => { if (!name.trim()) throw new Error('Dê um nome ao cenário.'); const id = uid('ps_'); db.insert(t.tenantId, 'pricingScenarios', { id, tenantId: t.tenantId, createdAt: nowISO(), name: name.trim(), inputs: i, createdBy: actor.name }); setCmp((c) => [...c, id].slice(-3)) }, 'Cenário salvo.')) setName('') }}>Salvar cenário</Button>
            </div>}
          </div></section>
        </div>
        <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Cenários lado a lado</h2></div><div className="panel-body stack">
          <div className="row">{scenarios.map((s) => <button key={s.id} className="chip" aria-pressed={cmp.includes(s.id)} onClick={() => setCmp(cmp.includes(s.id) ? cmp.filter((x) => x !== s.id) : [...cmp, s.id].slice(-3))}>{s.name}</button>)}</div>
          <div className="com-scen">
            {compared.map((s) => { const x = simulatePrice(s.inputs); return (
              <div key={s.id} className="card tight stack" style={{ '--gap': '8px' } as React.CSSProperties}>
                <div className="row between"><strong>{s.name}</strong>{t.can('financeiro', 'delete') && <Button size="sm" variant="ghost" iconOnly icon={<Trash2 />} onClick={() => run(() => db.remove(t.tenantId, 'pricingScenarios', s.id), 'Cenário removido.')}>Remover cenário {s.name}</Button>}</div>
                <dl className="com-dl">
                  <dt>Ocupação</dt><dd>{pct(s.inputs.occupancyPercent)}</dd><dt>Custo/hora</dt><dd>{formatBRL(x.costPerHour)}</dd><dt>Custo do procedimento</dt><dd>{formatBRL(x.directCost)}</dd>
                  <dt>Preço (markup {pct(s.inputs.markupPercent)})</dt><dd>{formatBRL(x.markup.price)}</dd><dt>Margem resultante</dt><dd>{pct(x.markup.marginPercent)}</dd>
                  <dt>Preço (margem {pct(s.inputs.targetMarginPercent)})</dt><dd>{formatBRL(x.margin.price)}</dd>
                </dl>
                <Button size="sm" onClick={() => setI(s.inputs)}>Editar premissas</Button>
              </div>
            ) })}
            {!compared.length && <p className="small muted">Selecione até 3 cenários para comparar.</p>}
          </div>
        </div></section>
      </div>
    </div>
  )
}
