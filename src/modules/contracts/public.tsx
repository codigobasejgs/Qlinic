// Landing: /contrato (condições gerais publicadas, sem dados de clientes) e /contratar (jornada completa, simulada).
// Etapas: plano → dados → revisão do contrato completo → assinatura → pagamento → confirmação/onboarding.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { usePlatformCollection } from '@/data/store'
import { SiteLayout } from '@/modules/public/site'
import '@/modules/public/styles.css'
import { emptyContractor, emptySignatory, parseBody, validateParties, type ContractorParty, type ContractorSignatory, type SaasContract } from '@/domain/contracts'
import type { BillingCycle } from '@/domain/platform'
import { formatBRL } from '@/lib/money'
import { Alert, Button, ButtonLink, SimBadge } from '@/ui/core'
import { isConnectedEnv } from '@/lib/env'
import { currentTemplate, currentTerms, freezeForReview, getContract, legalProfile, listDrafts, saveDraft } from './actions'
import { ContractDocument } from './document'
import { OfferSummary, ProviderCard } from './parts'
import { DataStep, PlanStep, ReviewStep, SignPayStep } from './steps'
import { buildOffer } from '@/domain/contracts'
import { todayCivil } from '@/lib/dates'
import './styles.css'

/** Chave anônima do rascunho neste navegador (demo). Produção: rascunho no servidor, autenticado, com retenção. */
function draftKey(): string {
  try {
    let k = localStorage.getItem('qlinic.contract.draftKey')
    if (!k) { k = `anon_${crypto.randomUUID()}`; localStorage.setItem('qlinic.contract.draftKey', k) }
    return k
  } catch { return 'anon_sem_armazenamento' }
}

// ======================= /contrato =======================
export function ContractPublicPage() {
  usePlatformCollection('contractTemplates'); usePlatformCollection('legalProfile')
  const tpl = currentTemplate()
  const prof = legalProfile()
  const sections = useMemo(() => parseBody(tpl.body.replaceAll('{{contratada.privacidade}}', prof.privacyContact ?? 'canal a ser publicado pela contratada')), [tpl, prof])
  const isDraft = tpl.status !== 'publicado'
  return (
    <SiteLayout title="Contrato">
      <section className="hero container stack" style={{ '--gap': '16px' } as React.CSSProperties}>
        <h1>Condições gerais de contratação</h1>
        <p className="pub-lead">Contrato de licença de uso e prestação de serviços SaaS entre a fornecedora do {prof.productName} e a clínica ou profissional contratante. Não substitui os documentos entre a clínica e seus pacientes.</p>
        {isDraft
          ? <Alert tone="warning" title={`Minuta ${tpl.version} — em revisão`}>Este texto ainda não foi aprovado juridicamente nem pelo quadro comercial. Nesta demonstração a assinatura é simulada e não tem validade.</Alert>
          : <Alert tone="info" title={`Modelo publicado — versão ${tpl.version}`}>Publicado em {tpl.publishedAt ? new Date(tpl.publishedAt).toLocaleDateString('pt-BR') : '—'}. Contratos já assinados não mudam quando o modelo é atualizado.</Alert>}
        <div className="ctr-plan-cta"><ButtonLink to="/planos" variant="primary">Escolher plano</ButtonLink><SimBadge>Simulação — nenhuma assinatura real</SimBadge></div>
        <ProviderCard p={prof} />
        <p className="small muted">O quadro de identificação do contratante e o Anexo A (quadro comercial do plano escolhido) são gerados na contratação e revisados antes da assinatura.</p>
        <ContractDocument sections={sections} title={tpl.title} fileName={`qlinic-condicoes-gerais-v${tpl.version}`} meta={<>Modelo v{tpl.version} · {isDraft ? 'minuta' : 'publicado'}</>} watermark={isDraft ? 'MINUTA - NÃO ASSINADA' : null} />
      </section>
    </SiteLayout>
  )
}

// ======================= /contratar =======================
const STEPS = ['Plano', 'Dados', 'Revisão', 'Assinatura', 'Pagamento', 'Confirmação'] as const

function stepOf(c: SaasContract | null): number {
  if (!c) return 0
  if (c.saasStatus !== 'pending_activation') return 5
  if (['pending_signatures', 'partially_signed', 'signed'].includes(c.status)) return c.offer.billing === 'imediata' ? 4 : 5
  if (['declined', 'expired', 'voided'].includes(c.status)) return 3
  return c.status === 'ready_for_review' ? 2 : 1
}

export function ContractCheckoutPage() {
  const [sp] = useSearchParams()
  const plans = usePlatformCollection('plans').filter((p) => p.active)
  usePlatformCollection('commercialTerms'); usePlatformCollection('legalProfile')
  const contracts = usePlatformCollection('saasContracts')
  const key = useMemo(draftKey, [])
  const [contractId, setContractId] = useState<string | null>(() => { try { return sessionStorage.getItem('qlinic.contract.current') } catch { return null } })
  const contract = contracts.find((c) => c.id === contractId && c.draftKey === key) ?? null
  const [planId, setPlanId] = useState(() => contract?.offer.planId ?? (plans.some((p) => p.id === sp.get('plano')) ? sp.get('plano')! : plans[0]?.id ?? ''))
  const [cycle, setCycle] = useState<BillingCycle>(contract?.offer.cycle ?? 'mensal')
  const [trial, setTrial] = useState<boolean>(contract ? !!contract.offer.trial : false)
  const [party, setParty] = useState<ContractorParty>(contract?.contractor ?? emptyContractor())
  const [sig, setSig] = useState<ContractorSignatory>(contract?.signatory ?? emptySignatory())
  const [step, setStep] = useState(() => stepOf(contract))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const head = useRef<HTMLHeadingElement>(null)
  const plan = plans.find((p) => p.id === planId)
  const preview = useMemo(() => (plan ? buildOffer(plan, currentTerms(), cycle, trial, todayCivil()) : null), [plan, cycle, trial])
  const remember = (id: string | null) => { setContractId(id); try { if (id) sessionStorage.setItem('qlinic.contract.current', id); else sessionStorage.removeItem('qlinic.contract.current') } catch { /* */ } }
  const go = (n: number) => { setStep(n); requestAnimationFrame(() => head.current?.focus()) }
  useEffect(() => { document.querySelector('main')?.scrollTo?.(0, 0) }, [step])

  // Rascunho com dados pessoais reais nunca vai para o navegador: no ambiente conectado a jornada aguarda o backend de contratação.
  if (isConnectedEnv()) return <SiteLayout title="Contratar"><section className="hero container stack"><Alert tone="info" title="Contratação online em preparação">A contratação com contrato e assinatura reais depende do backend de contratação, provedor de assinatura e aprovação jurídica. Fale com a equipe Qlinic pelos canais oficiais.</Alert><ButtonLink to="/contrato">Ler as condições gerais</ButtonLink></section></SiteLayout>
  if (!plan || !preview) return <SiteLayout title="Contratar"><section className="hero container"><Alert tone="neutral" title="Nenhum plano ativo">Os planos são cadastrados no Super Admin.</Alert></section></SiteLayout>
  const drafts = listDrafts(key).filter((d) => d.id !== contract?.id)
  const locked = !!contract && !['draft', 'ready_for_review'].includes(contract.status)

  return (
    <SiteLayout title="Contratar">
      <section className="container stack" style={{ '--gap': '16px', paddingBlock: 24 } as React.CSSProperties}>
        <div className="row between">
          <h1 ref={head} tabIndex={-1} style={{ fontSize: 26 }}>Contratar o Qlinic — {STEPS[step]}</h1>
          <SimBadge>Simulação — sem assinatura, envio ou cobrança reais</SimBadge>
        </div>
        <nav aria-label="Etapas da contratação">
          <ol className="steps">{STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'done' : i === step ? 'current' : undefined}>
              <button type="button" disabled={i > stepOf(contract) || i === step || (locked && i < 3)} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)} aria-label={`Etapa ${i + 1}: ${s}${i < step ? ' (concluída)' : ''}`}>
                <strong>{i + 1}. <span className="hide-mobile">{s}</span></strong>
              </button>
            </li>))}
          </ol>
        </nav>
        {drafts.length > 0 && step <= 1 && <Alert tone="info" title="Você tem rascunho salvo neste navegador" action={<Button size="sm" onClick={() => { const d = drafts[0]; remember(d.id); setPlanId(d.offer.planId); setCycle(d.offer.cycle); setTrial(!!d.offer.trial); setParty(d.contractor); setSig(d.signatory); go(stepOf(d)) }}>Retomar {drafts[0].number}</Button>}>Salvo em {new Date(drafts[0].updatedAt).toLocaleString('pt-BR')}.</Alert>}

        <div className="ctr-layout">
          <div className="stack card">
            {step === 0 && <PlanStep plans={plans} planId={planId} setPlanId={setPlanId} cycle={cycle} setCycle={setCycle} trial={trial} setTrial={setTrial} trialDays={preview.terms.trialDays} locked={locked} onNext={() => go(1)} />}
            {step === 1 && <DataStep party={party} setParty={setParty} sig={sig} setSig={setSig} errors={errors} maxUnits={plan.limits.units} contract={contract}
              onBack={() => go(0)}
              onSave={(andReview) => {
                const e = validateParties(party, sig, plan.limits.units)
                const c = saveDraft(key, { planId, cycle, trial, contractor: party, signatory: sig }, contract?.id)
                remember(c.id)
                setErrors(e)
                if (!andReview) return 'saved'
                if (Object.keys(e).length) { requestAnimationFrame(() => document.getElementById(`f-${Object.keys(e)[0]}`)?.focus()); return 'invalid' }
                freezeForReview(c.id, key)
                go(2)
                return 'ok'
              }} />}
            {step === 2 && contract && <ReviewStep c={contract} draftKey={key} onBack={() => go(1)} onSigned={() => go(stepOf(getContract(contract.id)))} />}
            {step >= 3 && contract && <SignPayStep c={contract} draftKey={key} step={step} go={go} onRevise={(n) => { remember(n.id); setParty(n.contractor); setSig(n.signatory); go(1) }} />}
          </div>
          <aside className="ctr-aside stack" aria-label="Resumo do plano">
            <div className="card ctr-summary-desktop"><h2 style={{ fontSize: 16, marginBottom: 8 }}>Resumo</h2><OfferSummary o={contract && step >= 2 ? contract.offer : preview} units={party.units} /></div>
            <details className="card ctr-summary-mobile"><summary><span>Plano {(contract && step >= 2 ? contract.offer : preview).planName}</span><span className="num">{formatBRL((contract && step >= 2 ? contract.offer : preview).totalCents)}</span></summary><OfferSummary o={contract && step >= 2 ? contract.offer : preview} units={party.units} /></details>
          </aside>
        </div>
      </section>
    </SiteLayout>
  )
}
