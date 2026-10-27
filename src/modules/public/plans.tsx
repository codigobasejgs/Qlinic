// Planos lidos de platformDb 'plans' (editáveis no Super Admin). Tabela no desktop, cartões no celular.
import { useState } from 'react'
import { Check, Minus } from 'lucide-react'
import { usePlatformCollection } from '@/data/store'
import type { BillingCycle, Plan } from '@/domain/platform'
import { MODULE_LABEL, type ModuleKey } from '@/domain/types'
import { formatBRL } from '@/lib/money'
import { Alert, Segmented } from '@/ui/core'
import { cycleSavingPercent, monthlyEquivalent } from './lib'

const CYCLES: { value: BillingCycle; label: string }[] = [
  { value: 'mensal', label: 'Mensal' }, { value: 'trimestral', label: 'Trimestral' }, { value: 'anual', label: 'Anual' },
]
const n = (v: number) => v.toLocaleString('pt-BR')

const LIMIT_ROWS: { label: string; get: (p: Plan) => string }[] = [
  { label: 'Usuários', get: (p) => n(p.limits.users) },
  { label: 'Profissionais', get: (p) => n(p.limits.professionals) },
  { label: 'Unidades', get: (p) => n(p.limits.units) },
  { label: 'Armazenamento', get: (p) => `${n(p.limits.storageGb)} GB` },
  { label: 'Mensagens/mês (WhatsApp + e-mail)', get: (p) => n(p.limits.messagesMonth) },
  { label: 'Créditos de IA/mês', get: (p) => n(p.limits.aiCreditsMonth) },
]
const OVERAGE_ROWS: { label: string; get: (p: Plan) => string }[] = [
  { label: 'Mensagem excedente', get: (p) => formatBRL(p.overage.messageCents) },
  { label: 'GB excedente/mês', get: (p) => formatBRL(p.overage.storageGbCents) },
  { label: 'Crédito de IA excedente', get: (p) => formatBRL(p.overage.aiCreditCents) },
  { label: 'Profissional adicional/mês', get: (p) => formatBRL(p.overage.extraProfessionalCents) },
]
const MODULE_ROWS: ModuleKey[] = ['agenda', 'prontuario', 'portal', 'pwa', 'financeiro', 'orcamentos', 'comunicacao', 'importacao', 'crm', 'comissoes', 'estoque', 'compras', 'convenios', 'automacoes', 'ia', 'multidisciplinar', 'odontologia']

function Has({ ok }: { ok: boolean }) {
  return ok ? <><Check size={18} aria-hidden="true" className="pub-ok" /><span className="sr-only">Incluído</span></> : <><Minus size={18} aria-hidden="true" className="muted" /><span className="sr-only">Não incluído</span></>
}
function modLabel(m: ModuleKey) { return m === 'odontologia' ? 'Módulos de especialidade' : MODULE_LABEL[m] }

export function PlansCompare({ compact }: { compact?: boolean }) {
  const plans = usePlatformCollection('plans').filter((p) => p.active)
  const [cycle, setCycle] = useState<BillingCycle>('mensal')
  if (!plans.length) return <Alert tone="neutral" title="Nenhum plano ativo">Os planos são cadastrados no Super Admin da demonstração.</Alert>
  const price = (p: Plan) => (
    <div className="stack" style={{ '--gap': '2px' } as React.CSSProperties}>
      <span className="pub-price num">{formatBRL(p.prices[cycle])}<span className="small muted"> / {cycle === 'mensal' ? 'mês' : cycle === 'trimestral' ? 'trimestre' : 'ano'}</span></span>
      {cycle !== 'mensal' && <span className="small muted num">equivale a {formatBRL(monthlyEquivalent(p, cycle))}/mês{cycleSavingPercent(p, cycle) > 0 ? ` · ${cycleSavingPercent(p, cycle)}% abaixo do mensal` : ''}</span>}
    </div>
  )
  return (
    <div className="stack">
      <div className="row between">
        <Segmented label="Ciclo de cobrança" value={cycle} onChange={setCycle} options={CYCLES} />
        <span className="badge sim">Valores de demonstração editáveis</span>
      </div>
      {/* Desktop: tabela comparativa */}
      <div className="table-wrap pub-plans-table">
        <table className="table">
          <caption className="sr-only">Comparativo de planos — ciclo {cycle}</caption>
          <thead><tr><th scope="col">Item</th>{plans.map((p) => <th key={p.id} scope="col">{p.name}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">Preço</th>{plans.map((p) => <td key={p.id}>{price(p)}</td>)}</tr>
            <tr><th scope="row">Indicado para</th>{plans.map((p) => <td key={p.id} className="small">{p.description}</td>)}</tr>
            {LIMIT_ROWS.map((r) => <tr key={r.label}><th scope="row">{r.label}</th>{plans.map((p) => <td key={p.id} className="num">{r.get(p)}</td>)}</tr>)}
            {!compact && OVERAGE_ROWS.map((r) => <tr key={r.label}><th scope="row">{r.label}</th>{plans.map((p) => <td key={p.id} className="num">{r.get(p)}</td>)}</tr>)}
            {!compact && MODULE_ROWS.map((m) => <tr key={m}><th scope="row">{modLabel(m)}</th>{plans.map((p) => <td key={p.id}><Has ok={p.modules.includes(m)} /></td>)}</tr>)}
          </tbody>
        </table>
      </div>
      {/* Celular: cartões */}
      <div className="pub-plans-cards">
        {plans.map((p) => (
          <article key={p.id} className="card stack" aria-labelledby={`plan-${p.id}`}>
            <h2 id={`plan-${p.id}`} style={{ fontSize: 18 }}>{p.name}</h2>
            <p className="small muted">{p.description}</p>
            {price(p)}
            <dl className="pub-dl">
              {LIMIT_ROWS.map((r) => <div key={r.label}><dt>{r.label}</dt><dd className="num">{r.get(p)}</dd></div>)}
              {!compact && OVERAGE_ROWS.map((r) => <div key={r.label}><dt>{r.label}</dt><dd className="num">{r.get(p)}</dd></div>)}
            </dl>
            {!compact && <p className="small"><strong>Módulos:</strong> {MODULE_ROWS.filter((m) => p.modules.includes(m)).map(modLabel).join(', ')}.</p>}
          </article>
        ))}
      </div>
      <p className="small muted">Preços e limites são de demonstração, lidos do cadastro de planos do Super Admin, e podem ser alterados lá. Upgrade: {plans[0].upgradeRule === 'imediato_pro_rata' ? 'imediato, proporcional ao período' : 'no próximo ciclo'}. Downgrade: {plans[0].downgradeRule === 'proximo_ciclo' ? 'no próximo ciclo' : 'imediato, sem reembolso'}.</p>
    </div>
  )
}
