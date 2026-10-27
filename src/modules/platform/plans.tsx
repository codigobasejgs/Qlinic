// Planos: preços por ciclo (DEMONSTRATIVOS), limites, módulos, excedentes, regras e versão.
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { usePlatformCollection } from '@/data/store'
import { MODULE_LABEL, type ModuleKey } from '@/domain/types'
import type { BillingCycle, Plan, PlanLimits } from '@/domain/platform'
import { Alert, Badge, Button, Checkbox, Field, Input, PageHeader, Select, Textarea } from '@/ui/core'
import { Dialog, useAction } from '@/ui/overlay'
import { formatBRL } from '@/lib/money'
import { uid } from '@/lib/util'
import { savePlan, togglePlan } from './actions'
import { CYCLE_LABEL, Guard, centsToInput, requireBRL, usePlatformMe } from './lib'
import { LIMIT_LABEL } from './planChange'

const DEMO_BANNER = 'Preços de demonstração — não são decisão comercial. Valores editáveis apenas para simular o produto.'
const ALL_MODULES = Object.keys(MODULE_LABEL) as ModuleKey[]
const UP_RULE: Record<Plan['upgradeRule'], string> = { imediato_pro_rata: 'Imediato, pro rata', proximo_ciclo: 'No próximo ciclo' }
const DOWN_RULE: Record<Plan['downgradeRule'], string> = { proximo_ciclo: 'No próximo ciclo', imediato_sem_reembolso: 'Imediato, sem reembolso' }

export function PlansAdminPage() {
  return <Guard area="planos" title="Planos"><Plans /></Guard>
}

function Plans() {
  const plans = usePlatformCollection('plans')
  const orgs = usePlatformCollection('organizations')
  const me = usePlatformMe()
  const run = useAction()
  const [editing, setEditing] = useState<Plan | null>(null)
  const blank = (): Plan => ({ id: uid('plan_'), name: '', description: '', prices: { mensal: 0, trimestral: 0, anual: 0 }, limits: { users: 5, professionals: 3, units: 1, storageGb: 20, messagesMonth: 1000, aiCreditsMonth: 100 }, modules: ['agenda', 'recepcao', 'pacientes', 'prontuario'], overage: { messageCents: 10, storageGbCents: 100, aiCreditCents: 5, extraProfessionalCents: 3900 }, upgradeRule: 'imediato_pro_rata', downgradeRule: 'proximo_ciclo', active: true, version: 0 })
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Planos" subtitle="Ciclos mensal, trimestral e anual; limites, módulos, excedentes e regras de mudança."
        actions={<Button variant="primary" icon={<Plus />} data-tour="primary-action" onClick={() => setEditing(blank())}>Novo plano</Button>} />
      <Alert tone="warning" title="Preços de demonstração">{DEMO_BANNER}</Alert>
      <div className="grid grid-3">
        {plans.map((p) => {
          const count = orgs.filter((o) => o.planId === p.id && o.status !== 'cancelled').length
          return (
            <article key={p.id} className="card stack" style={{ '--gap': '12px' } as React.CSSProperties} aria-labelledby={`pl-${p.id}`}>
              <div className="row between"><h2 id={`pl-${p.id}`} style={{ fontSize: 18 }}>{p.name}</h2><span className="row"><Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Ativo' : 'Inativo'}</Badge><Badge plain>v{p.version}</Badge></span></div>
              <p className="small muted">{p.description}</p>
              <table className="table">
                <caption className="sr-only">Preços do plano {p.name}</caption>
                <thead><tr><th scope="col">Ciclo</th><th scope="col" className="num">Valor do ciclo</th><th scope="col" className="num">Equiv. mês</th></tr></thead>
                <tbody>{(['mensal', 'trimestral', 'anual'] as BillingCycle[]).map((c) => <tr key={c}><td>{CYCLE_LABEL[c]}</td><td className="num">{formatBRL(p.prices[c])}</td><td className="num">{formatBRL(Math.round(p.prices[c] / ({ mensal: 1, trimestral: 3, anual: 12 } as const)[c]))}</td></tr>)}</tbody>
              </table>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {(Object.keys(p.limits) as (keyof PlanLimits)[]).map((k) => <li key={k}>{LIMIT_LABEL[k]}: <strong>{p.limits[k].toLocaleString('pt-BR')}</strong></li>)}
              </ul>
              <p className="small"><strong>{p.modules.length}</strong> módulos · Upgrade: {UP_RULE[p.upgradeRule]} · Downgrade: {DOWN_RULE[p.downgradeRule]}</p>
              <p className="small muted">Excedentes: mensagem {formatBRL(p.overage.messageCents)} · GB {formatBRL(p.overage.storageGbCents)} · crédito IA {formatBRL(p.overage.aiCreditCents)} · profissional extra {formatBRL(p.overage.extraProfessionalCents)}</p>
              <p className="small">{count} contratante(s) neste plano</p>
              <div className="row">
                <Button size="sm" onClick={() => setEditing(p)}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => togglePlan(p.id, me.actor), p.active ? 'Plano desativado: não aparece para novas atribuições; contratantes atuais permanecem.' : 'Plano ativado.')}>{p.active ? 'Desativar' : 'Ativar'}</Button>
              </div>
            </article>
          )
        })}
      </div>
      <Alert tone="info" title="Plano, feature flag e permissão são coisas diferentes">O plano limita o que o contratante pode habilitar; feature flags controlam liberação gradual de funcionalidades; permissões definem o que cada usuário da clínica pode fazer. Mudar o plano não altera papéis de usuários. Para mudar o plano de um contratante, use a ficha em Contratantes.</Alert>
      {editing && <PlanEditor plan={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PlanEditor({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const me = usePlatformMe()
  const run = useAction()
  const isNew = plan.version === 0
  const [f, setF] = useState({
    name: plan.name, description: plan.description,
    mensal: centsToInput(plan.prices.mensal), trimestral: centsToInput(plan.prices.trimestral), anual: centsToInput(plan.prices.anual),
    limits: Object.fromEntries(Object.entries(plan.limits).map(([k, v]) => [k, String(v)])) as Record<keyof PlanLimits, string>,
    modules: plan.modules, upgradeRule: plan.upgradeRule, downgradeRule: plan.downgradeRule,
    ov: { messageCents: centsToInput(plan.overage.messageCents), storageGbCents: centsToInput(plan.overage.storageGbCents), aiCreditCents: centsToInput(plan.overage.aiCreditCents), extraProfessionalCents: centsToInput(plan.overage.extraProfessionalCents) },
  })
  const save = () => run(() => {
    const limits = Object.fromEntries(Object.entries(f.limits).map(([k, v]) => { const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new Error(`${LIMIT_LABEL[k as keyof PlanLimits]}: valor inválido.`); return [k, n] })) as unknown as PlanLimits
    savePlan({
      ...plan, name: f.name.trim(), description: f.description.trim(),
      prices: { mensal: requireBRL(f.mensal, 'Preço mensal'), trimestral: requireBRL(f.trimestral, 'Preço trimestral'), anual: requireBRL(f.anual, 'Preço anual') },
      limits, modules: f.modules, upgradeRule: f.upgradeRule, downgradeRule: f.downgradeRule,
      overage: { messageCents: requireBRL(f.ov.messageCents, 'Excedente mensagem'), storageGbCents: requireBRL(f.ov.storageGbCents, 'Excedente GB'), aiCreditCents: requireBRL(f.ov.aiCreditCents, 'Excedente IA'), extraProfessionalCents: requireBRL(f.ov.extraProfessionalCents, 'Profissional extra') },
    }, me.actor)
    onClose()
  }, isNew ? 'Plano criado (v1).' : `Plano salvo — versão ${plan.version + 1}.`)
  const toggleMod = (m: ModuleKey) => setF({ ...f, modules: f.modules.includes(m) ? f.modules.filter((x) => x !== m) : [...f.modules, m] })
  return (
    <Dialog open onClose={onClose} size="xl" title={isNew ? 'Novo plano' : `Editar ${plan.name} (v${plan.version} → v${plan.version + 1})`} description="Salvar incrementa a versão. Contratantes atuais mantêm módulos já habilitados até nova mudança de plano."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar plano</Button></>}>
      <div className="stack">
        <Alert tone="warning">{DEMO_BANNER}</Alert>
        <div className="form-grid">
          <Field label="Nome" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Preço mensal (R$)" required><Input inputMode="decimal" value={f.mensal} onChange={(e) => setF({ ...f, mensal: e.target.value })} /></Field>
          <Field label="Preço trimestral (R$, ciclo)" required><Input inputMode="decimal" value={f.trimestral} onChange={(e) => setF({ ...f, trimestral: e.target.value })} /></Field>
          <Field label="Preço anual (R$, ciclo)" required><Input inputMode="decimal" value={f.anual} onChange={(e) => setF({ ...f, anual: e.target.value })} /></Field>
        </div>
        <Field label="Descrição"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <fieldset><legend>Limites e franquias</legend>
          <div className="form-grid">{(Object.keys(f.limits) as (keyof PlanLimits)[]).map((k) => <Field key={k} label={LIMIT_LABEL[k]}><Input type="number" min={0} value={f.limits[k]} onChange={(e) => setF({ ...f, limits: { ...f.limits, [k]: e.target.value } })} /></Field>)}</div>
        </fieldset>
        <fieldset><legend>Excedentes (R$ por unidade)</legend>
          <div className="form-grid">
            <Field label="Mensagem"><Input inputMode="decimal" value={f.ov.messageCents} onChange={(e) => setF({ ...f, ov: { ...f.ov, messageCents: e.target.value } })} /></Field>
            <Field label="GB de armazenamento"><Input inputMode="decimal" value={f.ov.storageGbCents} onChange={(e) => setF({ ...f, ov: { ...f.ov, storageGbCents: e.target.value } })} /></Field>
            <Field label="Crédito de IA"><Input inputMode="decimal" value={f.ov.aiCreditCents} onChange={(e) => setF({ ...f, ov: { ...f.ov, aiCreditCents: e.target.value } })} /></Field>
            <Field label="Profissional extra (mês)"><Input inputMode="decimal" value={f.ov.extraProfessionalCents} onChange={(e) => setF({ ...f, ov: { ...f.ov, extraProfessionalCents: e.target.value } })} /></Field>
          </div>
        </fieldset>
        <div className="form-grid">
          <Field label="Regra de upgrade"><Select value={f.upgradeRule} onChange={(e) => setF({ ...f, upgradeRule: e.target.value as Plan['upgradeRule'] })}>{Object.entries(UP_RULE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Regra de downgrade"><Select value={f.downgradeRule} onChange={(e) => setF({ ...f, downgradeRule: e.target.value as Plan['downgradeRule'] })}>{Object.entries(DOWN_RULE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        </div>
        <fieldset><legend>Módulos incluídos ({f.modules.length})</legend>
          <div className="pl-mods">{ALL_MODULES.map((m) => <Checkbox key={m} label={MODULE_LABEL[m]} checked={f.modules.includes(m)} onChange={() => toggleMod(m)} />)}</div>
        </fieldset>
      </div>
    </Dialog>
  )
}
