// Contratação dentro de /planos: 1 Plano escolhido · 2 Dados do contratante · 3 Seu contrato (ao vivo) · 4 Revisão e continuidade.
// Fonte única (useContractViewModel): oferta do catálogo + termos vigentes + partes + modelo + contratada → resumo, HTML, impressão e pedido.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Download, FileSignature, MessageCircle, Printer, RefreshCw, Save, Wand2 } from 'lucide-react'
import { setSession } from '@/app/session'
import { platformDb, usePlatformCollection } from '@/data/store'
import {
  buildOffer, emptyContractor, emptySignatory, findPlaceholders, GATEWAY_LABEL, looksReal, previewParties, realSignatureBlockers, renderContract, sectionsToText, selfSignatory, snapshotHash, UFS, validateParties,
  type ContractorParty, type ContractorSignatory, type OfferSnapshot,
} from '@/domain/contracts'
import { CYCLE_MONTHS, type BillingCycle, type Plan } from '@/domain/platform'
import { MODULE_LABEL, SEGMENT_LABEL, type Organization, type Segment } from '@/domain/types'
import { getSimScenario, setSimScenario, type SimScenario } from '@/domain/payments'
import { formatBRL } from '@/lib/money'
import { formatCivil, todayCivil } from '@/lib/dates'
import { downloadText, fakeCNPJ, fakeCPF, maskCEP, maskCNPJ, maskCPF, maskPhone } from '@/lib/util'
import { Alert, Button, Checkbox, Field, Input, Segmented, Select, SimBadge } from '@/ui/core'
import { useAction, useToast } from '@/ui/overlay'
import { acceptAndSign, currentTemplate, currentTerms, freezeForReview, getContract, legalProfile, liveSubscription, ownerOf, saveDraft, simulateEnvelope, startPayment } from './actions'
import { ContractDocument, DEMO_WATERMARK } from './document'
import { ContractEvents, ProviderCard, StatusTriplet } from './parts'
import { prefillFrom, setExplicitDemo, useWho, type Who } from './context'
import { submitContractRequest, type RequestResult } from './remote'
import './seed'
import './styles.css'

const CYCLE_LABEL: Record<BillingCycle, string> = { mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' }
const PER: Record<BillingCycle, string> = { mensal: 'mês', trimestral: 'trimestre', anual: 'ano' }
const DEMO_FORM = 'qlinic.contract.demoForm'
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const draftKeyDemo = () => { try { let k = localStorage.getItem('qlinic.contract.draftKey'); if (!k) { k = `anon_${crypto.randomUUID()}`; localStorage.setItem('qlinic.contract.draftKey', k) } return k } catch { return 'anon_sem_armazenamento' } }
const readDemoForm = (): { party: ContractorParty; sig: ContractorSignatory } | null => { try { const v = sessionStorage.getItem(DEMO_FORM); return v ? JSON.parse(v) : null } catch { return null } }

/** Fonte única do contrato desta página. A formalização real recalcula a oferta no servidor (request_saas_contract). */
export function useContractViewModel(plan: Plan | undefined, cycle: BillingCycle, trial: boolean, party: ContractorParty, sig: ContractorSignatory, amendment: boolean) {
  usePlatformCollection('commercialTerms'); usePlatformCollection('contractTemplates'); usePlatformCollection('legalProfile')
  const terms = currentTerms(), tpl = currentTemplate(), provider = legalProfile()
  const offer = useMemo(() => (plan ? buildOffer(plan, terms, cycle, amendment ? false : trial, todayCivil(), amendment ? 'proxima_fatura' : undefined) : null), [plan, terms, cycle, trial, amendment])
  // prévia adiada: digitar não bloqueia o campo enquanto o contrato re-renderiza
  const dParty = useDeferredValue(party), dSig = useDeferredValue(sig)
  const sections = useMemo(() => {
    if (!offer) return []
    const p = previewParties(dParty, dSig)
    return renderContract({ number: 'atribuído na formalização', kind: amendment ? 'aditivo' : 'contrato', amendmentNote: amendment ? `alteração de plano/ciclo para ${offer.planName} ${offer.cycle}` : undefined, templateVersion: tpl.version, templateBody: tpl.body, offer, contractor: p.contractor, signatory: p.signatory, provider })
  }, [offer, dParty, dSig, tpl, provider, amendment])
  const pending = useMemo(() => findPlaceholders(sections), [sections])
  const hash = useMemo(() => (pending.length ? '' : snapshotHash(sections)), [pending, sections])
  return { offer, sections, pending, hash, terms, tpl, provider }
}

export function PlanCheckout({ plans, planId, cycle, invalidPlan, onChangePlan, onCycle }: {
  plans: Plan[]; planId: string | null; cycle: BillingCycle; invalidPlan: boolean; onChangePlan: () => void; onCycle: (c: BillingCycle) => void
}) {
  const [tick, setTick] = useState(0)
  const who = useWho(tick)
  const demo = who.kind === 'demo'
  const plan = plans.find((p) => p.id === planId)
  const head = useRef<HTMLHeadingElement>(null)
  const [trial, setTrial] = useState(false)
  const [party, setParty] = useState<ContractorParty>(() => readDemoForm()?.party ?? emptyContractor())
  const [sig, setSig] = useState<ContractorSignatory>(() => readDemoForm()?.sig ?? emptySignatory())
  const [showAll, setShowAll] = useState(false)
  // organização pela qual o usuário PODE contratar (nunca outra)
  const org: Organization | null = who.kind === 'owner' ? who.org : who.kind === 'demo' && who.authorized ? who.org : null
  usePlatformCollection('subscriptions')
  const live = org ? liveSubscription(org.id) : undefined
  const vm = useContractViewModel(plan, cycle, trial, party, sig, !!live)
  const errs = useMemo(() => (plan ? validateParties(party, sig, plan.limits.units, demo) : {}), [plan, party, sig, demo])

  // escolher plano: rolar até a seção e focar o título (sem animação se o usuário preferir)
  const lastPlan = useRef<string | null>(null)
  useEffect(() => {
    if (!planId || lastPlan.current === planId) return
    lastPlan.current = planId
    requestAnimationFrame(() => { document.getElementById('contratacao')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); head.current?.focus({ preventScroll: true }) })
  }, [planId])
  // pré-preenchimento único a partir da organização autorizada
  const prefilled = useRef(false)
  useEffect(() => {
    if (prefilled.current || !org || party.legalName) return
    const user = who.kind === 'owner' || who.kind === 'demo' ? who.user : null
    if (!user) return
    prefilled.current = true
    const p = prefillFrom(org, user); setParty(p.party); setSig(p.sig)
  }, [org, who, party.legalName])
  // demo: guarda só dados fictícios nesta aba; real: nada no navegador, avisa antes de perder
  useEffect(() => {
    if (demo) { if (!looksReal(errs)) try { sessionStorage.setItem(DEMO_FORM, JSON.stringify({ party, sig })) } catch { /* */ } return }
    const dirty = !!(party.legalName || party.document || sig.name)
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    addEventListener('beforeunload', h)
    return () => removeEventListener('beforeunload', h)
  }, [demo, party, sig, errs])

  const heading = <h2 id="ctr-h" ref={head} tabIndex={-1} style={{ fontSize: 26 }}>{plan ? `Contratar o plano ${plan.name}` : 'Contratação'}</h2>
  if (invalidPlan || !plan) return (
    <section id="contratacao" className="ctr-flow" aria-labelledby="ctr-h"><div className="ctr-col stack">
      {heading}
      {invalidPlan
        ? <Alert tone="warning" title="Plano indisponível">O plano do link não existe ou não está mais ativo. Nenhuma contratação foi iniciada. Escolha um dos planos acima.</Alert>
        : <p className="muted">Escolha um plano acima em “Assinar plano”. O formulário e o contrato aparecem aqui, já com o plano preenchido.</p>}
    </div></section>
  )
  if (plan.prices[cycle] <= 0) return (
    <section id="contratacao" className="ctr-flow" aria-labelledby="ctr-h"><div className="ctr-col stack">
      {heading}
      <Alert tone="info" title="Plano sob consulta">Este plano não tem preço publicado para o ciclo {CYCLE_LABEL[cycle].toLowerCase()}. Solicite uma proposta; não há contrato com condições indefinidas.</Alert>
    </div></section>
  )
  return (
    <section id="contratacao" className="ctr-flow" aria-labelledby="ctr-h">
      <div className="ctr-col stack" style={{ '--gap': '20px' } as React.CSSProperties}>
        <div className="row between">{heading}{demo && <SimBadge>Simulação — dados fictícios, sem assinatura ou cobrança reais</SimBadge>}</div>
        <WhoBanner who={who} onDemo={() => { setExplicitDemo(true); setTick((n) => n + 1) }} onRecheck={() => setTick((n) => n + 1)} />
        {vm.offer && <PlanBlock plan={plan} offer={vm.offer} trial={trial} setTrial={setTrial} cycle={cycle} onCycle={onCycle} onChangePlan={onChangePlan} units={party.units} live={live} />}
        <DataBlock party={party} setParty={setParty} sig={sig} setSig={setSig} demo={demo} maxUnits={plan.limits.units} errs={errs} showAll={showAll} />
        <section className="card ctr-block" aria-labelledby="b3-t">
          <h3 id="b3-t" className="ctr-bh"><span className="ctr-num" aria-hidden="true">3</span>Seu contrato</h3>
          <p className="small muted">Atualiza conforme você preenche. O texto integral está aqui; baixar é opcional.</p>
          <p className="sr-only" aria-live="polite">{vm.pending.length ? `${vm.pending.length} informação(ões) do contrato aguardando preenchimento.` : 'Contrato completo para revisão.'}</p>
          <ContractDocument sections={vm.sections} title={vm.tpl.title} fileName={`qlinic-minuta-${plan.id}-${cycle}`} watermark={DEMO_WATERMARK} printLabel="Imprimir contrato" downloadLabel="Baixar minuta"
            meta={<>Minuta não assinada · modelo v{vm.tpl.version}{vm.tpl.status !== 'publicado' ? ' (em revisão jurídica)' : ''} · plano {plan.name} v{plan.version} · {CYCLE_LABEL[cycle].toLowerCase()}</>} />
        </section>
        <ContinueBlock who={who} plan={plan} cycle={cycle} trial={trial} party={party} sig={sig} vm={vm} errs={errs} org={org} amendment={!!live} onInvalid={() => setShowAll(true)} onRecheck={() => setTick((n) => n + 1)} />
      </div>
    </section>
  )
}

function WhoBanner({ who, onDemo, onRecheck }: { who: Who; onDemo: () => void; onRecheck: () => void }) {
  if (who.kind === 'loading') return <p className="small muted" role="status">Verificando sua sessão…</p>
  if (who.kind === 'demo') return who.org && !who.authorized
    ? <Alert tone="warning" title="Seu perfil não contrata por esta clínica">Na demonstração você está como {who.user?.name ?? 'usuário'} em {who.org.name}. Só o proprietário altera o plano da clínica; dados dela não foram carregados aqui.</Alert>
    : <Alert tone="info" title="Modo demonstração">Use apenas dados fictícios. Nada é assinado, enviado ou cobrado de verdade.</Alert>
  if (who.kind === 'visitor') return <Alert tone="info" title="Preencha e revise sem precisar de conta" action={<Button size="sm" variant="ghost" onClick={onDemo}>Usar modo demonstração</Button>}>Para enviar a solicitação você entra ou cria uma conta no passo 4. Identidade e poderes são verificados na formalização.</Alert>
  if (who.kind === 'user' && who.reason === 'sem_clinica') return <Alert tone="info" title="Contratação para uma nova clínica">Você está conectado sem clínica selecionada. A solicitação fica vinculada à sua conta; a clínica é criada na ativação.</Alert>
  if (who.kind === 'user') return <Alert tone="warning" title="Seu perfil não pode contratar por esta clínica" action={<Button size="sm" variant="ghost" onClick={onRecheck}>Verificar novamente</Button>}>{who.orgName ? `Em ${who.orgName}, a` : 'A'}lteração de plano é feita pelo proprietário da clínica. Nenhum dado da clínica foi carregado aqui. Peça ao proprietário, ou entre com outro perfil em <Link to="/auth/login">Entrar</Link>.</Alert>
  return <Alert tone="success" title={`Contratando por ${who.org.name}`}>Dados preenchidos com o cadastro desta clínica. Revise antes de enviar.</Alert>
}

function PlanBlock({ plan, offer, trial, setTrial, cycle, onCycle, onChangePlan, units, live }: {
  plan: Plan; offer: OfferSnapshot; trial: boolean; setTrial: (v: boolean) => void; cycle: BillingCycle; onCycle: (c: BillingCycle) => void; onChangePlan: () => void; units: number
  live: ReturnType<typeof liveSubscription>
}) {
  const plans = usePlatformCollection('plans')
  const same = live && live.planId === plan.id && live.cycle === cycle && live.status === 'ativa'
  return (
    <section className="card ctr-block" aria-labelledby="b1-t">
      <div className="row between"><h3 id="b1-t" className="ctr-bh"><span className="ctr-num" aria-hidden="true">1</span>Plano escolhido</h3><Button size="sm" icon={<RefreshCw />} onClick={onChangePlan}>Alterar plano</Button></div>
      {live && <Alert tone={same ? 'warning' : 'info'} title={`Plano atual da clínica: ${plans.find((p) => p.id === live.planId)?.name ?? live.planId} (${live.cycle})`}>{same ? 'É o plano e o ciclo atuais: não há nova contratação a fazer.' : `A troca gera um aditivo da assinatura existente (não uma segunda assinatura). ${plan.upgradeRule === 'imediato_pro_rata' ? 'Upgrade: imediato, diferença proporcional na próxima fatura.' : 'Vale no próximo ciclo.'}`}</Alert>}
      <div className="ctr-plan-grid">
        <div className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
          <span className="strong" style={{ fontSize: 18 }}>{plan.name} <span className="tiny muted">versão {plan.version}</span></span>
          <span className="small muted">{plan.description}</span>
          <span className="pub-price num" data-testid="ctr-total">{formatBRL(offer.totalCents)}<span className="small muted"> cobrados por {PER[cycle]}</span></span>
          {cycle !== 'mensal' && <span className="small muted num">Equivale a {formatBRL(offer.monthlyEqCents)}/mês, apenas referência: a cobrança é do total do ciclo, sem parcelamento.</span>}
        </div>
        <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <Segmented label="Ciclo da assinatura" value={cycle} onChange={onCycle} options={(Object.keys(CYCLE_MONTHS) as BillingCycle[]).map((c) => ({ value: c, label: CYCLE_LABEL[c] }))} />
          {!live && <Checkbox checked={trial} onChange={(e) => setTrial(e.target.checked)} label={`Começar com teste gratuito de ${offer.terms.trialDays} dias`} hint="Sem cobrança no teste e sem conversão paga automática." />}
        </div>
      </div>
      {offer.trial && <p className="small">Teste de {formatCivil(offer.trial.start)} a {formatCivil(offer.trial.end)}. {offer.terms.trialRule}</p>}
      <dl className="ctr-dl ctr-dl-2">
        <dt>Desconto</dt><dd>{offer.discountText}</dd>
        <dt>Após o desconto</dt><dd>{offer.afterDiscountText}</dd>
        <dt>Unidades</dt><dd>{units} de até {offer.limits.units}</dd>
        <dt>Usuários / profissionais</dt><dd>{offer.limits.users} / {offer.limits.professionals}</dd>
        <dt>Armazenamento</dt><dd>{offer.limits.storageGb} GB</dd>
        <dt>Mensagens / IA por mês</dt><dd>{offer.limits.messagesMonth.toLocaleString('pt-BR')} / {offer.limits.aiCreditsMonth.toLocaleString('pt-BR')} créditos</dd>
        <dt>Implantação</dt><dd>{offer.setupFeeCents ? formatBRL(offer.setupFeeCents) : 'não cobrada'}</dd>
        <dt>Pagamento</dt><dd>{offer.billing === 'sem_cobranca_no_teste' ? 'sem cobrança no teste' : offer.billing === 'proxima_fatura' ? 'ajuste na próxima fatura' : `${GATEWAY_LABEL[offer.terms.gateway]}, ${offer.terms.paymentDueDays} dia(s) após a emissão`}</dd>
      </dl>
      <details><summary className="small">Módulos incluídos neste plano ({offer.modules.length})</summary><p className="small">{offer.modules.map((m) => MODULE_LABEL[m]).join(', ')}.</p></details>
    </section>
  )
}

function DataBlock({ party, setParty, sig, setSig, demo, maxUnits, errs, showAll }: {
  party: ContractorParty; setParty: (p: ContractorParty) => void; sig: ContractorSignatory; setSig: (s: ContractorSignatory) => void; demo: boolean; maxUnits: number; errs: Record<string, string>; showAll: boolean
}) {
  const toast = useToast()
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [cepFail, setCepFail] = useState(false)
  const e = (k: string) => (touched[k] || showAll ? errs[k] ?? null : null)
  const set = (p: Partial<ContractorParty>) => setParty({ ...party, ...p })
  const addr = (p: Partial<ContractorParty['address']>) => set({ address: { ...party.address, ...p } })
  const fill = () => {
    const n = Math.floor(Math.random() * 800) + 1
    setParty({ ...party, legalName: party.kind === 'pj' ? `Clínica Exemplo ${n} Ltda. (fictícia)` : `Profissional Exemplo ${n}`, tradeName: party.kind === 'pj' ? `Clínica Exemplo ${n}` : '', document: (party.kind === 'pj' ? fakeCNPJ(n) : fakeCPF(n)).replace(/\D/g, ''), segment: party.segment || 'odontologia', units: 1, address: { cep: '00000-000', street: 'Rua Fictícia', number: String(n), complement: '', district: 'Bairro Exemplo', city: 'Cidade Exemplo', uf: 'SP' }, email: `contato${n}@clinica.exemplo.test`, phone: '(00) 90000-0000' })
    if (party.kind === 'pj') setSig({ name: `Representante Exemplo ${n}`, document: fakeCPF(n + 1000).replace(/\D/g, ''), role: 'sócio-administrador', email: `assinatura${n}@clinica.exemplo.test` })
  }
  // ponytail: consulta automática de CEP é integração futura; “indisponível” leva ao preenchimento manual.
  const lookupCep = () => { setCepFail(true); toast('Consulta de CEP indisponível. Preencha o endereço manualmente.', 'error') }
  return (
    <section className="card ctr-block" aria-labelledby="b2-t" onBlur={(ev) => { const id = (ev.target as HTMLElement).id?.replace(/^f-/, ''); if (id) setTouched((x) => (x[id] ? x : { ...x, [id]: true })) }}>
      <h3 id="b2-t" className="ctr-bh"><span className="ctr-num" aria-hidden="true">2</span>Dados do contratante</h3>
      {demo && <Alert tone="warning" title="Somente dados fictícios na demonstração">CPF iniciado por 000, CNPJ por 00.000, e-mail .exemplo.test e telefone com DDD 00. Validar formato não verifica identidade nem poderes.</Alert>}
      <div className="row between">
        <Segmented label="Tipo de contratante" value={party.kind} onChange={(k) => setParty({ ...party, kind: k, document: '' })} options={[{ value: 'pj', label: 'Empresa (PJ)' }, { value: 'pf', label: 'Profissional (PF)' }]} />
        {demo && <Button size="sm" variant="ghost" icon={<Wand2 />} onClick={fill}>Preencher com dados fictícios</Button>}
      </div>
      <div className="grid grid-2">
        <Field id="f-legalName" label={party.kind === 'pj' ? 'Razão social' : 'Nome civil completo'} required error={e('legalName')}><Input value={party.legalName} maxLength={140} onChange={(x) => set({ legalName: x.target.value })} autoComplete={party.kind === 'pj' ? 'organization' : 'name'} /></Field>
        {party.kind === 'pj' && <Field id="f-tradeName" label="Nome comercial da clínica" error={e('tradeName')}><Input value={party.tradeName} maxLength={140} onChange={(x) => set({ tradeName: x.target.value })} /></Field>}
        <Field id="f-document" label={party.kind === 'pj' ? 'CNPJ' : 'CPF'} required error={e('document')}><Input inputMode="numeric" value={party.kind === 'pj' ? maskCNPJ(party.document) : maskCPF(party.document)} onChange={(x) => set({ document: x.target.value.replace(/\D/g, '').slice(0, party.kind === 'pj' ? 14 : 11) })} autoComplete="off" /></Field>
        <Field id="f-segment" label="Segmento" required error={e('segment')}><Select value={party.segment} onChange={(x) => set({ segment: x.target.value as Segment })}><option value="">Selecione</option>{Object.entries(SEGMENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field id="f-units" label="Unidades" hint={`Este plano inclui até ${maxUnits}.`} required error={e('units')}><Input type="number" min={1} max={maxUnits} value={party.units} onChange={(x) => set({ units: Number(x.target.value) })} /></Field>
        <Field id="f-email" label="E-mail de comunicação" required error={e('email')}><Input type="email" value={party.email} maxLength={120} onChange={(x) => set({ email: x.target.value })} autoComplete="email" /></Field>
        <Field id="f-phone" label="Telefone" required error={e('phone')}><Input inputMode="tel" value={party.phone} onChange={(x) => set({ phone: maskPhone(x.target.value) })} autoComplete="tel" /></Field>
      </div>
      <fieldset className="stack ctr-fs">
        <legend className="strong small">Endereço</legend>
        <div className="ctr-addr">
          <Field id="f-cep" label="CEP" required error={e('cep')} hint={cepFail ? 'Consulta indisponível: preencha manualmente.' : 'Consulta automática opcional.'}><Input inputMode="numeric" value={party.address.cep} onChange={(x) => addr({ cep: maskCEP(x.target.value) })} autoComplete="postal-code" /></Field>
          <div className="field ctr-cep-btn"><Button size="sm" onClick={lookupCep}>Buscar CEP</Button></div>
          <Field id="f-street" label="Logradouro" required error={e('street')} className="ctr-span2"><Input value={party.address.street} maxLength={140} onChange={(x) => addr({ street: x.target.value })} autoComplete="address-line1" /></Field>
          <Field id="f-number" label="Número" required error={e('number')}><Input value={party.address.number} maxLength={20} onChange={(x) => addr({ number: x.target.value })} /></Field>
          <Field id="f-complement" label="Complemento (opcional)"><Input value={party.address.complement} maxLength={80} onChange={(x) => addr({ complement: x.target.value })} autoComplete="address-line2" /></Field>
          <Field id="f-district" label="Bairro" required error={e('district')}><Input value={party.address.district} maxLength={80} onChange={(x) => addr({ district: x.target.value })} /></Field>
          <Field id="f-city" label="Cidade" required error={e('city')}><Input value={party.address.city} maxLength={80} onChange={(x) => addr({ city: x.target.value })} autoComplete="address-level2" /></Field>
          <Field id="f-uf" label="UF" required error={e('uf')}><Select value={party.address.uf} onChange={(x) => addr({ uf: x.target.value })}><option value="">UF</option>{UFS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
        </div>
      </fieldset>
      {party.kind === 'pj' ? (
        <fieldset className="stack ctr-fs">
          <legend className="strong small">Representante legal que assina</legend>
          <div className="grid grid-2">
            <Field id="f-sigName" label="Nome completo" required error={e('sigName')}><Input value={sig.name} maxLength={120} onChange={(x) => setSig({ ...sig, name: x.target.value })} autoComplete="name" /></Field>
            <Field id="f-sigDocument" label="CPF" required hint="Aparece completo só no contrato; listas mostram mascarado." error={e('sigDocument')}><Input inputMode="numeric" value={maskCPF(sig.document)} onChange={(x) => setSig({ ...sig, document: x.target.value.replace(/\D/g, '').slice(0, 11) })} autoComplete="off" /></Field>
            <Field id="f-sigRole" label="Cargo ou qualidade" required error={e('sigRole')}><Input value={sig.role} maxLength={80} onChange={(x) => setSig({ ...sig, role: x.target.value })} /></Field>
            <Field id="f-sigEmail" label="E-mail de assinatura" required error={e('sigEmail')}><Input type="email" value={sig.email} maxLength={120} onChange={(x) => setSig({ ...sig, email: x.target.value })} /></Field>
          </div>
        </fieldset>
      ) : <p className="small muted">Profissional pessoa física assina em nome próprio: não há empresa nem representante a informar.</p>}
      <ProviderCard p={legalProfile()} />
    </section>
  )
}

type Acc = { terms: boolean; powers: boolean; privacyNotice: boolean; marketing: boolean }
const NO_ACC: Acc = { terms: false, powers: false, privacyNotice: false, marketing: false }

function ContinueBlock({ who, plan, cycle, trial, party, sig, vm, errs, org, amendment, onInvalid, onRecheck }: {
  who: Who; plan: Plan; cycle: BillingCycle; trial: boolean; party: ContractorParty; sig: ContractorSignatory; vm: ReturnType<typeof useContractViewModel>
  errs: Record<string, string>; org: Organization | null; amendment: boolean; onInvalid: () => void; onRecheck: () => void
}) {
  const [acc, setAcc] = useState<Acc>(NO_ACC)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<RequestResult | null>(null)
  const [demoContract, setDemoContract] = useState<string | null>(null)
  const toast = useToast()
  const run = useAction()
  const demo = who.kind === 'demo'
  // mudança material depois do aceite: aceites desmarcados e nova revisão
  const material = JSON.stringify([plan.id, plan.version, cycle, trial, party, sig, vm.tpl.version])
  const lastMaterial = useRef(material)
  useEffect(() => {
    if (lastMaterial.current === material) return
    lastMaterial.current = material
    setSent(null)
    setAcc((a) => {
      if (!a.terms && !a.powers && !a.privacyNotice) return a
      toast('As condições ou os dados mudaram: revise o contrato e marque os aceites novamente.')
      return { ...NO_ACC, marketing: a.marketing }
    })
  }, [material, toast])
  const providerReady = realSignatureBlockers(vm.provider, vm.terms, vm.tpl.status === 'publicado' ? vm.tpl : undefined).length === 0
  const blockedPerm = (who.kind === 'user' && who.reason === 'sem_permissao') || (who.kind === 'demo' && !!who.org && !who.authorized)
  const same = amendment && org && liveSubscription(org.id)?.planId === plan.id && liveSubscription(org.id)?.cycle === cycle && liveSubscription(org.id)?.status === 'ativa'
  const check = (): string | null => {
    const first = Object.keys(errs)[0]
    if (first) { onInvalid(); requestAnimationFrame(() => document.getElementById(`f-${first}`)?.focus()); return `Revise os dados: ${errs[first]}` }
    if (vm.pending.length) return 'Ainda há informações pendentes no contrato.'
    if (!acc.terms) return 'Marque a concordância com o contrato.'
    if (!acc.powers) return party.kind === 'pj' ? 'Confirme a declaração de poderes.' : 'Confirme que contrata em nome próprio.'
    if (!acc.privacyNotice) return 'Confirme a ciência do aviso de privacidade.'
    return null
  }
  const simulate = () => {
    const m = check(); if (m) { toast(m, 'error'); return }
    setBusy(true)
    run(() => {
      const key = draftKeyDemo()
      const c = saveDraft(key, { planId: plan.id, cycle, trial, contractor: party, signatory: sig, marketing: acc.marketing, tenantId: org?.id ?? null })
      freezeForReview(c.id, key)
      acceptAndSign(c.id, key, acc)
      setDemoContract(c.id)
    }, 'Simulação concluída: sua assinatura foi registrada, sem validade jurídica. Falta a contratada.')
    setBusy(false)
  }
  const send = async () => {
    const m = check(); if (m) { toast(m, 'error'); return }
    if (!vm.offer) return
    setBusy(true)
    try {
      const r = await submitContractRequest({ planId: plan.id, cycle, trial, tenantId: who.kind === 'owner' ? who.org.id : null, contractor: party, signatory: party.kind === 'pf' ? selfSignatory(party) : sig, templateVersion: vm.tpl.version, documentHash: vm.hash, clientTotalCents: vm.offer.totalCents, acceptances: acc })
      setSent(r)
      toast(r.existing ? `Solicitação ${r.protocol} já estava registrada.` : `Solicitação ${r.protocol} registrada.`)
    } catch (x) { toast(x instanceof Error ? x.message : 'Não foi possível enviar.', 'error'); onRecheck() } finally { setBusy(false) }
  }
  return (
    <section className="card ctr-block" aria-labelledby="b4-t">
      <h3 id="b4-t" className="ctr-bh"><span className="ctr-num" aria-hidden="true">4</span>Revisão e continuidade</h3>
      {vm.pending.length > 0 && <Alert tone="info" title={`Faltam ${vm.pending.length} informação(ões) no contrato`}>Os trechos destacados no contrato indicam o que preencher no passo 2.</Alert>}
      <fieldset className="ctr-accept">
        <legend className="sr-only">Aceites, cada um independente</legend>
        <Checkbox checked={acc.terms} onChange={(x) => setAcc({ ...acc, terms: x.target.checked })} label="Li o contrato acima e concordo com ele e com o quadro comercial (Anexo A)." />
        <Checkbox checked={acc.powers} onChange={(x) => setAcc({ ...acc, powers: x.target.checked })} label={party.kind === 'pj' ? 'Declaro possuir poderes para contratar em nome do contratante.' : 'Declaro que contrato em nome próprio.'} hint="Sujeito a verificação na formalização." />
        <Checkbox checked={acc.privacyNotice} onChange={(x) => setAcc({ ...acc, privacyNotice: x.target.checked })} label="Estou ciente do aviso de privacidade da contratada." hint="Ciência não equivale a consentimento para tratamento de dados de saúde." />
        <Checkbox checked={acc.marketing} onChange={(x) => setAcc({ ...acc, marketing: x.target.checked })} label="Quero receber novidades do Qlinic (opcional)." />
      </fieldset>
      {blockedPerm && <Alert tone="warning">Envio indisponível: seu perfil não pode contratar pela clínica selecionada.</Alert>}
      {same && <Alert tone="warning">Este já é o plano e o ciclo atuais da clínica.</Alert>}

      <div className="row no-print"><Button size="sm" icon={<Printer />} onClick={() => window.print()}>Imprimir contrato</Button><Button size="sm" icon={<Download />} onClick={() => downloadText(`qlinic-minuta-${plan.id}-${cycle}.md`, sectionsToText(vm.sections, `Minuta não assinada — ${vm.tpl.title}`).replace(/⟨([^⟩]*)⟩/g, '[pendente: $1]'), 'text/markdown;charset=utf-8')}>Baixar minuta</Button></div>
      {demo && !demoContract && <div className="ctr-actions"><span className="small muted">Simulação: nada é assinado de verdade.</span><Button variant="primary" icon={<FileSignature />} loading={busy} disabled={blockedPerm || !!same} onClick={simulate}>Simular assinatura</Button></div>}
      {demo && demoContract && <DemoAfterSign id={demoContract} />}

      {!demo && who.kind !== 'loading' && (sent
        ? <Alert tone="success" title={`Solicitação ${sent.protocol} registrada`}>{sent.kind === 'alteracao' ? 'Pedido de alteração do plano atual' : 'Pedido de contratação'} recebido, com o valor recalculado pelo servidor ({formatBRL(sent.total_cents)}). <strong>Ainda não há contrato assinado.</strong> A assinatura eletrônica e o pagamento acontecem em etapa posterior, informada ao e-mail de assinatura. Nenhuma cobrança foi feita.</Alert>
        : <div className="stack">
          {!providerReady && <Alert tone="neutral" title="Assinatura eletrônica ainda não habilitada">Revise e envie a solicitação; a assinatura e o pagamento acontecem depois, em etapa própria. Marcar os aceites não assina o contrato.</Alert>}
          {who.kind === 'visitor' && <Alert tone="info" title="Entre para enviar" action={<Button size="sm" onClick={onRecheck}>Já entrei</Button>}>Abra <a href="/auth/login" target="_blank" rel="noopener">Entrar</a> ou <a href="/auth/login?modo=cadastro" target="_blank" rel="noopener">Criar conta</a> em outra aba; seus dados continuam nesta página. Depois clique em “Já entrei”.</Alert>}
          <div className="ctr-actions">
            <span className="small muted">Dados pessoais não ficam salvos neste navegador.</span>
            <Button variant="primary" icon={providerReady ? <FileSignature /> : <Save />} loading={busy} disabled={who.kind === 'visitor' || blockedPerm || !!same} onClick={send}>{providerReady ? 'Continuar para assinatura' : 'Enviar solicitação de contratação'}</Button>
          </div>
        </div>)}
      <WhatsAppSecondary />
    </section>
  )
}

/** Só aparece com canal WhatsApp autorizado no cadastro. Abrir conversa não envia documento, CPF nem assina nada. */
function WhatsAppSecondary() {
  usePlatformCollection('legalProfile')
  const ch = legalProfile().supportChannels.find((c) => /whats/i.test(c.channel))
  const num = ch?.channel.replace(/\D/g, '')
  if (!num || num.length < 12) return null
  return <a className="btn btn-ghost btn-sm" href={`https://wa.me/${num}?text=${encodeURIComponent('Olá! Quero falar sobre a contratação do Qlinic.')}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" /> Falar sobre esta contratação</a>
}

const SCEN: { value: SimScenario; label: string }[] = [{ value: 'sucesso', label: 'Aprovado' }, { value: 'falha', label: 'Recusado' }, { value: 'timeout', label: 'Sem resposta' }]
function DemoAfterSign({ id }: { id: string }) {
  usePlatformCollection('saasContracts')
  const c = getContract(id)
  const run = useAction(); const toast = useToast(); const nav = useNavigate()
  const [scen, setScen] = useState<SimScenario>(getSimScenario())
  const [paying, setPaying] = useState(false)
  const sim = { id: 'contratante', name: 'Simulador da demonstração' }
  const pay = async () => {
    setPaying(true)
    try { const r = await startPayment(c.id, c.draftKey); toast(r.payment.status === 'confirmed' ? 'Pagamento simulado confirmado.' : r.payment.uncertain ? 'Sem resposta do provedor: não pague de novo.' : 'Pagamento recusado (simulação).', r.payment.status === 'confirmed' ? undefined : 'error') }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'error') } finally { setPaying(false) }
  }
  const enter = () => {
    const f = getContract(id), owner = f.tenantId ? ownerOf(f.tenantId) : undefined
    const slug = platformDb.list('organizations').find((o) => o.id === f.tenantId)?.slug
    if (!f.tenantId || !owner || !slug) return
    setSession({ kind: 'staff', tenantId: f.tenantId, userId: owner.id, unitId: null })
    nav(f.kind === 'aditivo' ? `/app/${slug}/meu-plano` : `/app/${slug}/onboarding`)
  }
  return (
    <div className="stack" role="region" aria-label="Situação da contratação simulada">
      <StatusTriplet c={c} />
      <ul className="ctr-list">
        <li><span className="grow">Contratante — {c.signatory.name}</span><span className="small">Simulação concluída</span></li>
        <li><span className="grow">Contratada — {c.provider?.legalName}</span><span className="small">{c.status === 'signed' ? 'Simulação concluída' : 'pendente: titular ou procurador assina por fluxo próprio'}</span></li>
      </ul>
      {c.status === 'partially_signed' && <Button size="sm" onClick={() => run(() => simulateEnvelope(c.id, 'sign_provider', sim), 'Simulação: contratada assinou.')}>Simular assinatura da contratada</Button>}
      {c.offer.billing === 'imediata' && c.payment.status !== 'confirmed' && ['partially_signed', 'signed'].includes(c.status) && <div className="stack">
        <p className="small">Mensalidade do ciclo: <strong className="num" data-testid="ctr-charge">{formatBRL(c.offer.totalCents)}</strong>, recebida por {c.provider?.legalName} via {GATEWAY_LABEL[c.payment.provider]} (simulação).</p>
        <Segmented label="Resultado simulado do gateway" value={scen} onChange={(v) => { setScen(v); setSimScenario(v) }} options={SCEN} />
        <Button variant="primary" loading={paying} disabled={c.payment.uncertain || c.payment.status === 'pending'} onClick={pay}>{c.payment.status === 'failed' ? 'Tentar pagar novamente (simulação)' : 'Pagar (simulação)'}</Button>
      </div>}
      {c.saasStatus !== 'pending_activation' && c.tenantId && <Alert tone="success" title={c.kind === 'aditivo' ? 'Plano alterado (simulação)' : 'Acesso liberado (simulação)'} action={<Button variant="primary" onClick={enter}>{c.kind === 'aditivo' ? 'Ver meu plano e contrato' : 'Ir para a configuração inicial'}</Button>}>{c.kind === 'aditivo' ? 'Aditivo vigente; a diferença entra na próxima fatura.' : c.saasStatus === 'trialing' ? 'Teste gratuito ativo.' : 'Assinatura ativa.'} Cópia em “Meu plano e contrato”.</Alert>}
      <details><summary className="small">Histórico</summary><ContractEvents c={c} /></details>
    </div>
  )
}
