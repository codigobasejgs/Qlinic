// Etapas da jornada /contratar. Erros vinculados aos campos (Field → aria-describedby); voltar preserva dados.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, FileSignature, Save, Wand2 } from 'lucide-react'
import { setSession } from '@/app/session'
import { platformDb } from '@/data/store'
import { activationNote, GATEWAY_LABEL, UFS, type ContractorParty, type ContractorSignatory, type SaasContract } from '@/domain/contracts'
import type { BillingCycle, Plan } from '@/domain/platform'
import { SEGMENT_LABEL, type Segment } from '@/domain/types'
import { getSimScenario, setSimScenario, type SimScenario } from '@/domain/payments'
import { formatBRL } from '@/lib/money'
import { fakeCNPJ, fakeCPF, maskCEP, maskCNPJ, maskCPF, maskPhone } from '@/lib/util'
import { Alert, Button, Checkbox, Field, Input, Segmented, Select } from '@/ui/core'
import { useAction, useToast } from '@/ui/overlay'
import { acceptAndSign, getContract, legalProfile, ownerOf, reviseAfterSending, simulateEnvelope, startPayment } from './actions'
import { ContractDocument } from './document'
import { ContractEvents, ProviderCard, StatusTriplet } from './parts'

const CYCLES: { value: BillingCycle; label: string }[] = [{ value: 'mensal', label: 'Mensal' }, { value: 'trimestral', label: 'Trimestral' }, { value: 'anual', label: 'Anual' }]

export function PlanStep({ plans, planId, setPlanId, cycle, setCycle, trial, setTrial, trialDays, locked, onNext }: {
  plans: Plan[]; planId: string; setPlanId: (v: string) => void; cycle: BillingCycle; setCycle: (v: BillingCycle) => void; trial: boolean; setTrial: (v: boolean) => void; trialDays: number; locked: boolean; onNext: () => void
}) {
  return (
    <div className="stack">
      <h2 style={{ fontSize: 18 }}>Plano e resumo financeiro</h2>
      {locked && <Alert tone="warning">Este contrato já foi enviado para assinatura. Para mudar o plano, use “Alterar dados” na etapa de assinatura (gera nova versão).</Alert>}
      <fieldset className="stack" disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="strong small">Plano</legend>
        <div className="pub-prof-grid" role="radiogroup" aria-label="Plano">
          {plans.map((p) => (
            <label key={p.id} className="card tight check" style={{ cursor: 'pointer' }}>
              <input type="radio" name="plano" value={p.id} checked={planId === p.id} onChange={() => setPlanId(p.id)} />
              <span className="stack" style={{ '--gap': '2px' } as React.CSSProperties}><strong>{p.name}</strong><span className="small muted">{p.description}</span><span className="small num">{formatBRL(p.prices[cycle])} / {cycle === 'mensal' ? 'mês' : cycle === 'trimestral' ? 'trimestre' : 'ano'}</span></span>
            </label>
          ))}
        </div>
        <Segmented label="Ciclo de cobrança" value={cycle} onChange={setCycle} options={CYCLES} />
        <Checkbox checked={trial} onChange={(e) => setTrial(e.target.checked)} label={`Começar com teste gratuito de ${trialDays} dias`} hint="Sem cobrança no teste. Ao final não há conversão paga automática: você escolhe se continua." />
      </fieldset>
      <div className="ctr-actions"><span /><Button variant="primary" icon={<ArrowRight />} onClick={onNext}>Continuar para dados</Button></div>
    </div>
  )
}

type Errs = Record<string, string>
export function DataStep({ party, setParty, sig, setSig, errors, maxUnits, contract, onBack, onSave }: {
  party: ContractorParty; setParty: (p: ContractorParty) => void; sig: ContractorSignatory; setSig: (s: ContractorSignatory) => void; errors: Errs; maxUnits: number; contract: SaasContract | null
  onBack: () => void; onSave: (andReview: boolean) => 'saved' | 'invalid' | 'ok'
}) {
  const toast = useToast()
  const [cepState, setCepState] = useState<'idle' | 'erro'>('idle')
  const locked = !!contract && !['draft', 'ready_for_review'].includes(contract.status)
  const set = (p: Partial<ContractorParty>) => setParty({ ...party, ...p })
  const addr = (p: Partial<ContractorParty['address']>) => set({ address: { ...party.address, ...p } })
  const fill = () => {
    const n = Math.floor(Math.random() * 800) + 1
    setParty({ ...party, legalName: party.kind === 'pj' ? `Clínica Exemplo ${n} Ltda. (fictícia)` : `Profissional Exemplo ${n}`, tradeName: party.kind === 'pj' ? `Clínica Exemplo ${n}` : '', document: (party.kind === 'pj' ? fakeCNPJ(n) : fakeCPF(n)).replace(/\D/g, ''), segment: party.segment || 'odontologia', units: 1, address: { cep: '00000-000', street: 'Rua Fictícia', number: String(n), complement: '', district: 'Bairro Exemplo', city: 'Cidade Exemplo', uf: 'SP' }, email: `contato${n}@clinica.exemplo.test`, phone: '(00) 90000-0000' })
    if (party.kind === 'pj') setSig({ name: `Representante Exemplo ${n}`, document: fakeCPF(n + 1000).replace(/\D/g, ''), role: 'sócio-administrador', email: `assinatura${n}@clinica.exemplo.test` })
  }
  // ponytail: consulta de CEP é integração futura; aqui sempre "indisponível" → preenchimento manual (testa o caminho de falha).
  const lookupCep = () => { setCepState('erro'); toast('Consulta de CEP indisponível nesta demonstração. Preencha o endereço manualmente.', 'error') }
  const e = (k: string) => errors[k] ?? null
  return (
    <form className="stack" noValidate onSubmit={(ev) => { ev.preventDefault(); if (onSave(true) === 'invalid') toast('Revise os campos destacados.', 'error') }}>
      <h2 style={{ fontSize: 18 }}>Dados da empresa e do signatário</h2>
      <ProviderCard p={legalProfile()} />
      <Alert tone="warning" title="Somente dados fictícios">Na simulação, use documentos fictícios (CPF iniciado por 000, CNPJ por 00.000), e-mail .exemplo.test e telefone com DDD 00. Validação de formato não verifica identidade nem poderes.</Alert>
      <fieldset className="stack" disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="strong">Contratante</legend>
        <div className="row between">
          <Segmented label="Tipo de contratante" value={party.kind} onChange={(k) => setParty({ ...party, kind: k, document: '' })} options={[{ value: 'pj', label: 'Empresa (PJ)' }, { value: 'pf', label: 'Profissional (PF)' }]} />
          <Button size="sm" variant="ghost" icon={<Wand2 />} onClick={fill}>Preencher com dados fictícios</Button>
        </div>
        <div className="grid grid-2">
          <Field label={party.kind === 'pj' ? 'Razão social' : 'Nome civil completo'} required error={e('legalName')} id="f-legalName"><Input value={party.legalName} maxLength={140} onChange={(x) => set({ legalName: x.target.value })} autoComplete="organization" /></Field>
          <Field label="Nome comercial da clínica" hint={party.kind === 'pf' ? 'Opcional para profissional em nome próprio.' : undefined} error={e('tradeName')} id="f-tradeName"><Input value={party.tradeName} maxLength={140} onChange={(x) => set({ tradeName: x.target.value })} /></Field>
          <Field label={party.kind === 'pj' ? 'CNPJ' : 'CPF'} required error={e('document')} id="f-document"><Input inputMode="numeric" value={party.kind === 'pj' ? maskCNPJ(party.document) : maskCPF(party.document)} onChange={(x) => set({ document: x.target.value.replace(/\D/g, '').slice(0, party.kind === 'pj' ? 14 : 11) })} autoComplete="off" /></Field>
          <Field label="Segmento" required error={e('segment')} id="f-segment"><Select value={party.segment} onChange={(x) => set({ segment: x.target.value as Segment })}><option value="">Selecione</option>{Object.entries(SEGMENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Unidades" hint={`O plano inclui até ${maxUnits}.`} required error={e('units')} id="f-units"><Input type="number" min={1} max={maxUnits} value={party.units} onChange={(x) => set({ units: Number(x.target.value) })} /></Field>
          <Field label="E-mail de comunicação contratual" required error={e('email')} id="f-email"><Input type="email" value={party.email} maxLength={120} onChange={(x) => set({ email: x.target.value })} autoComplete="email" /></Field>
          <Field label="Telefone" required error={e('phone')} id="f-phone"><Input inputMode="tel" value={party.phone} onChange={(x) => set({ phone: maskPhone(x.target.value) })} autoComplete="tel" /></Field>
        </div>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="strong small">Endereço completo</legend>
          <div className="grid grid-3">
            <Field label="CEP" required error={e('cep')} hint={cepState === 'erro' ? 'Consulta indisponível: preencha manualmente.' : 'Consulta automática é opcional.'} id="f-cep"><Input inputMode="numeric" value={party.address.cep} onChange={(x) => addr({ cep: maskCEP(x.target.value) })} autoComplete="postal-code" /></Field>
            <div className="field" style={{ justifyContent: 'flex-end' }}><Button size="sm" onClick={lookupCep}>Buscar CEP</Button></div>
            <Field label="UF" required error={e('uf')} id="f-uf"><Select value={party.address.uf} onChange={(x) => addr({ uf: x.target.value })}><option value="">UF</option>{UFS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
            <Field label="Logradouro" required error={e('street')} id="f-street"><Input value={party.address.street} maxLength={140} onChange={(x) => addr({ street: x.target.value })} autoComplete="address-line1" /></Field>
            <Field label="Número" required error={e('number')} id="f-number"><Input value={party.address.number} maxLength={20} onChange={(x) => addr({ number: x.target.value })} /></Field>
            <Field label="Complemento"><Input value={party.address.complement} maxLength={80} onChange={(x) => addr({ complement: x.target.value })} autoComplete="address-line2" /></Field>
            <Field label="Bairro" required error={e('district')} id="f-district"><Input value={party.address.district} maxLength={80} onChange={(x) => addr({ district: x.target.value })} /></Field>
            <Field label="Cidade" required error={e('city')} id="f-city"><Input value={party.address.city} maxLength={80} onChange={(x) => addr({ city: x.target.value })} autoComplete="address-level2" /></Field>
          </div>
        </fieldset>
        {party.kind === 'pj' ? (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="strong small">Representante que assina</legend>
            <div className="grid grid-2">
              <Field label="Nome completo" required error={e('sigName')} id="f-sigName"><Input value={sig.name} maxLength={120} onChange={(x) => setSig({ ...sig, name: x.target.value })} autoComplete="name" /></Field>
              <Field label="CPF" required hint="Acesso restrito: aparece completo só no documento; listas mostram mascarado." error={e('sigDocument')} id="f-sigDocument"><Input inputMode="numeric" value={maskCPF(sig.document)} onChange={(x) => setSig({ ...sig, document: x.target.value.replace(/\D/g, '').slice(0, 11) })} autoComplete="off" /></Field>
              <Field label="Cargo ou qualidade" required error={e('sigRole')} id="f-sigRole"><Input value={sig.role} maxLength={80} onChange={(x) => setSig({ ...sig, role: x.target.value })} /></Field>
              <Field label="E-mail de assinatura" required error={e('sigEmail')} id="f-sigEmail"><Input type="email" value={sig.email} maxLength={120} onChange={(x) => setSig({ ...sig, email: x.target.value })} /></Field>
            </div>
          </fieldset>
        ) : <p className="small muted">Profissional pessoa física assina em nome próprio; não é necessário informar empresa.</p>}
      </fieldset>
      <div className="ctr-actions">
        <Button icon={<ArrowLeft />} onClick={onBack}>Voltar ao plano</Button>
        <div className="row">
          {!locked && <Button icon={<Save />} onClick={() => { onSave(false); toast('Rascunho salvo neste navegador (simulação).') }}>Salvar rascunho</Button>}
          <Button type="submit" variant="primary" icon={<ArrowRight />} disabled={locked}>Revisar contrato</Button>
        </div>
      </div>
      <p className="tiny muted">Rascunho da demonstração fica neste navegador com dados fictícios. Em produção, o rascunho fica no servidor, com autenticação e prazo de retenção.</p>
    </form>
  )
}

export function ReviewStep({ c, draftKey, onBack, onSigned }: { c: SaasContract; draftKey: string; onBack: () => void; onSigned: () => void }) {
  const run = useAction()
  const [acc, setAcc] = useState({ terms: false, powers: false, privacyNotice: false, marketing: false })
  const [busy, setBusy] = useState(false)
  if (!c.snapshot) return <Alert tone="warning">Documento ainda não congelado. Volte e revise os dados.</Alert>
  return (
    <div className="stack">
      <h2 style={{ fontSize: 18 }}>Revisão do contrato completo</h2>
      <p className="small muted">Leia o texto integral antes de aceitar. Rolar até o fim não substitui sua manifestação de vontade.</p>
      <ContractDocument sections={c.snapshot.sections} title={`Contrato ${c.number}`} fileName={`qlinic-${c.number}-minuta`} meta={<>Modelo v{c.templateVersion} · revisão {c.revision} · integridade {c.snapshot.hash.slice(0, 16)}…</>} />
      <fieldset className="ctr-accept card">
        <legend className="strong">Aceites (cada um é independente)</legend>
        <Checkbox checked={acc.terms} onChange={(e) => setAcc({ ...acc, terms: e.target.checked })} label="Li e concordo com o contrato e o quadro comercial (Anexo A)." />
        <Checkbox checked={acc.powers} onChange={(e) => setAcc({ ...acc, powers: e.target.checked })} label={c.contractor.kind === 'pj' ? 'Declaro possuir poderes para contratar em nome do contratante.' : 'Declaro que contrato em nome próprio.'} hint="Sujeito a verificação quando necessária." />
        <Checkbox checked={acc.privacyNotice} onChange={(e) => setAcc({ ...acc, privacyNotice: e.target.checked })} label="Estou ciente do aviso de privacidade da contratada." hint="Ciência não equivale a consentimento para tratamento de dados de saúde." />
        <Checkbox checked={acc.marketing} onChange={(e) => setAcc({ ...acc, marketing: e.target.checked })} label="Quero receber novidades do Qlinic (opcional)." />
      </fieldset>
      <div className="ctr-actions">
        <Button icon={<ArrowLeft />} onClick={onBack}>Voltar e editar dados</Button>
        <Button variant="primary" icon={<FileSignature />} loading={busy} onClick={() => { setBusy(true); const ok = run(() => acceptAndSign(c.id, draftKey, acc), 'Simulação concluída: sua assinatura foi registrada (sem validade jurídica).'); setBusy(false); if (ok) onSigned() }}>Assinar (simulação)</Button>
      </div>
    </div>
  )
}

const SCEN: { value: SimScenario; label: string }[] = [{ value: 'sucesso', label: 'Aprovado' }, { value: 'falha', label: 'Recusado' }, { value: 'timeout', label: 'Sem resposta' }]

export function SignPayStep({ c, draftKey, step, go, onRevise }: { c: SaasContract; draftKey: string; step: number; go: (n: number) => void; onRevise: (n: SaasContract) => void }) {
  const run = useAction()
  const toast = useToast()
  const nav = useNavigate()
  const [scen, setScen] = useState<SimScenario>(getSimScenario())
  const [paying, setPaying] = useState(false)
  const sim = { id: 'contratante', name: 'Simulador da demonstração' }
  const ended = ['declined', 'expired', 'voided'].includes(c.status)
  const pay = async () => {
    setPaying(true)
    try { const r = await startPayment(c.id, draftKey); toast(r.payment.status === 'confirmed' ? 'Pagamento simulado confirmado.' : r.payment.uncertain ? 'Resultado do pagamento desconhecido. Não pague de novo; aguarde a confirmação.' : 'Pagamento recusado (simulação). Você pode tentar novamente.', r.payment.status === 'confirmed' ? undefined : 'error') }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'error') } finally { setPaying(false) }
  }
  const enter = () => {
    const fresh = getContract(c.id)
    const owner = fresh.tenantId ? ownerOf(fresh.tenantId) : undefined
    if (!fresh.tenantId || !owner) return
    try { sessionStorage.removeItem('qlinic.contract.current') } catch { /* */ }
    setSession({ kind: 'staff', tenantId: fresh.tenantId, userId: owner.id, unitId: null })
    nav(`/app/${slugOf(fresh.tenantId)}/onboarding`)
  }
  return (
    <div className="stack">
      <h2 style={{ fontSize: 18 }}>{step === 5 ? 'Confirmação' : step === 4 ? 'Pagamento' : 'Assinatura eletrônica'}</h2>
      <StatusTriplet c={c} />
      {ended && <Alert tone="danger" title="Este envelope foi encerrado">Não é possível retomar um envelope {c.status === 'declined' ? 'recusado' : c.status === 'expired' ? 'expirado' : 'cancelado'}. Gere uma nova versão para assinar novamente.</Alert>}
      <section className="card stack" aria-labelledby="sig-t">
        <h3 id="sig-t" style={{ fontSize: 15 }}>Assinaturas</h3>
        <ul className="ctr-list">
          <li><span className="grow">Contratante — {c.signatory.name}</span><span className="small">{c.status === 'pending_signatures' ? 'pendente' : ended && c.status === 'declined' ? 'recusou' : 'Simulação concluída'}</span></li>
          <li><span className="grow">Contratada — {legalProfile().legalName}</span><span className="small">{c.status === 'signed' ? 'Simulação concluída' : 'pendente (o titular/procurador assina por fluxo próprio)'}</span></li>
        </ul>
        {c.status === 'partially_signed' && <div className="row"><Button size="sm" onClick={() => run(() => simulateEnvelope(c.id, 'sign_provider', sim), 'Simulação: contratada assinou.')}>Simular assinatura da contratada</Button><Button size="sm" variant="ghost" onClick={() => run(() => simulateEnvelope(c.id, 'expire', sim), 'Simulação: prazo expirou.')}>Simular expiração</Button></div>}
        <p className="tiny muted">Simulação: não há certificado, IP, carimbo de tempo nem envio de e-mail/WhatsApp. Assinatura de uma parte não implica a da outra.</p>
      </section>
      {c.offer.billing === 'imediata' && !ended && (
        <section className="card stack" aria-labelledby="pay-t">
          <h3 id="pay-t" style={{ fontSize: 15 }}>Pagamento da mensalidade</h3>
          <p className="small">Recebedor: {legalProfile().legalName} (conta da plataforma {legalProfile().productName}, via {GATEWAY_LABEL[c.payment.provider]}). Valor do ciclo: <strong className="num">{formatBRL(c.offer.totalCents)}</strong>. A assinatura do contrato não autoriza débitos recorrentes por si só.</p>
          {c.status !== 'signed' && <Alert tone="info">Você já pode pagar; o acesso só é liberado quando a contratada também assinar.</Alert>}
          {c.payment.status !== 'confirmed' && <>
            <Segmented label="Resultado simulado do gateway" value={scen} onChange={(v) => { setScen(v); setSimScenario(v) }} options={SCEN} />
            <Button variant="primary" loading={paying} disabled={c.payment.uncertain || c.payment.status === 'pending'} onClick={pay}>{c.payment.status === 'failed' ? 'Tentar pagar novamente (simulação)' : 'Pagar (simulação)'}</Button>
          </>}
          {c.payment.uncertain && <Alert tone="warning" title="Pagamento em confirmação">Não houve resposta do provedor. Nenhuma nova cobrança será criada até a confirmação (o Super Admin reconcilia na simulação).</Alert>}
        </section>
      )}
      {step === 5 && c.tenantId && <Alert tone="success" title="Acesso liberado (simulação)" action={<Button variant="primary" onClick={enter}>Ir para a configuração inicial</Button>}>{c.saasStatus === 'trialing' ? `Teste até ${c.offer.trial?.end.split('-').reverse().join('/')}.` : 'Assinatura ativa.'} A cópia final fica em “Meu plano e contrato” no painel da clínica. Nenhum e-mail foi enviado.</Alert>}
      {step === 5 && !c.tenantId && <Alert tone="info">{activationNote(c) || 'Ativação em processamento.'}</Alert>}
      <details><summary className="small">Histórico do contrato</summary><ContractEvents c={c} /></details>
      <div className="ctr-actions">
        {(['pending_signatures', 'partially_signed'].includes(c.status) && c.payment.status === 'not_created') || ended
          ? <Button icon={<ArrowLeft />} onClick={() => run(() => { const n = reviseAfterSending(c.id, draftKey); onRevise(n) }, 'Nova versão criada; envelope anterior anulado. Revise os dados.')}>Alterar dados (nova versão)</Button>
          : <span />}
        {step === 4 && c.status === 'signed' && c.payment.status === 'confirmed' && <Button variant="primary" onClick={() => go(5)}>Ver confirmação</Button>}
        {step === 5 && <Link to="/" className="btn btn-ghost">Voltar ao site</Link>}
      </div>
    </div>
  )
}
function slugOf(tenantId: string) { return platformDb.list('organizations').find((o) => o.id === tenantId)?.slug ?? '' }
