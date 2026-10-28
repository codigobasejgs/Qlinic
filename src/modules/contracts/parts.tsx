// Peças compartilhadas: cartão da contratada (somente leitura), resumo do plano, estados independentes, linha do tempo.
import type { ReactNode } from 'react'
import { activationNote, CONTRACT_STATUS, CYCLE_NAME, formatPhoneE164, GATEWAY_LABEL, PAYMENT_STATUS, providerAddress, SAAS_STATUS, type LegalProfile, type OfferSnapshot, type SaasContract } from '@/domain/contracts'
import { MODULE_LABEL } from '@/domain/types'
import { formatBRL } from '@/lib/money'
import { formatCivil, formatDateTime } from '@/lib/dates'
import { maskCNPJ } from '@/lib/util'
import { Alert, Badge, Timeline } from '@/ui/core'

export function ProviderCard({ p, title = 'Contratada (fornecedora do Qlinic)' }: { p: LegalProfile; title?: string }) {
  return (
    <section className="ctr-readonly" aria-labelledby="ctr-prov-t">
      <h3 id="ctr-prov-t" style={{ fontSize: 15, marginBottom: 8 }}>{title} <Badge plain>somente leitura</Badge></h3>
      <dl>
        <dt>Produto</dt><dd>{p.productName}</dd>
        <dt>Nome empresarial</dt><dd>{p.legalName}</dd>
        <dt>CNPJ</dt><dd>{maskCNPJ(p.taxId)}</dd>
        <dt>Natureza informada</dt><dd>{p.legalNature}</dd>
        <dt>Endereço</dt><dd>{providerAddress(p)}</dd>
        <dt>E-mail cadastral</dt><dd>{p.registeredEmail}</dd>
        <dt>Telefone cadastral</dt><dd>{formatPhoneE164(p.registeredPhone)}</dd>
        <dt>Signatário</dt><dd>{p.authorizedSignatory ? `${p.authorizedSignatory.name} (${p.authorizedSignatory.role})` : 'A definir pela contratada no processo de assinatura'}</dd>
      </dl>
      <p className="tiny muted" style={{ marginTop: 8 }}>Origem: {p.source}{p.sourceIsLiveRegistryCheck ? '' : ' — não é consulta online atualizada'}. O comprovante não informa nome fantasia; {p.productName} é o nome do produto. Telefone cadastral não é canal de WhatsApp nem atendimento 24 horas.</p>
    </section>
  )
}

export function OfferSummary({ o, units }: { o: OfferSnapshot; units?: number }) {
  const per = o.cycle === 'mensal' ? 'mês' : o.cycle === 'trimestral' ? 'trimestre' : 'ano'
  return (
    <div className="stack" style={{ '--gap': '10px' } as React.CSSProperties}>
      <div>
        <div className="strong">Plano {o.planName} <span className="tiny muted">v{o.planVersion}</span></div>
        <div className="pub-price num" style={{ fontSize: 24 }}>{formatBRL(o.totalCents)}<span className="small muted"> / {per}</span></div>
        {o.cycle !== 'mensal' && <div className="small muted num">equivale a {formatBRL(o.monthlyEqCents)}/mês (informativo)</div>}
      </div>
      {o.trial && <Alert tone="info" title={`Teste gratuito de ${o.trial.days} dias`}>De {formatCivil(o.trial.start)} a {formatCivil(o.trial.end)}. Sem cobrança no teste e sem conversão paga automática: continuar exige nova confirmação.</Alert>}
      {o.billing === 'proxima_fatura' && <Alert tone="info">Aditivo: diferença aplicada na próxima fatura, sem pagamento no ato.</Alert>}
      <dl className="ctr-dl">
        <dt>Ciclo</dt><dd>{CYCLE_NAME[o.cycle]}</dd>
        <dt>Desconto</dt><dd>{o.discountText}</dd>
        <dt>Implantação</dt><dd>{o.setupFeeCents ? formatBRL(o.setupFeeCents) : 'não cobrada'}</dd>
        <dt>Unidades</dt><dd>{units ? `${units} de ${o.limits.units}` : `até ${o.limits.units}`}</dd>
        <dt>Usuários</dt><dd>{o.limits.users}</dd>
        <dt>Profissionais</dt><dd>{o.limits.professionals}</dd>
        <dt>Armazenamento</dt><dd>{o.limits.storageGb} GB</dd>
        <dt>Mensagens/mês</dt><dd>{o.limits.messagesMonth.toLocaleString('pt-BR')}</dd>
        <dt>IA/mês</dt><dd>{o.limits.aiCreditsMonth.toLocaleString('pt-BR')} créditos</dd>
        <dt>Assinaturas eletrônicas</dt><dd>{o.terms.signaturesIncluded ? `${o.terms.signaturesIncluded}/mês` : 'não incluído'}</dd>
        <dt>Pagamento</dt><dd>{o.billing === 'sem_cobranca_no_teste' ? 'sem cobrança no teste' : `${GATEWAY_LABEL[o.terms.gateway]}, vence em ${o.terms.paymentDueDays} dia(s)`}</dd>
        <dt>Fidelidade</dt><dd>{o.terms.loyalty}</dd>
      </dl>
      <details><summary className="small">Módulos incluídos ({o.modules.length})</summary><p className="small">{o.modules.map((m) => MODULE_LABEL[m]).join(', ')}.</p></details>
      <p className="tiny muted">Oferta {o.offerVersion}. Valores lidos do cadastro de planos e do quadro comercial; o contrato reproduz estes mesmos valores.</p>
    </div>
  )
}

export function StatusTriplet({ c }: { c: SaasContract }) {
  const [cl, ct] = CONTRACT_STATUS[c.status], [pl, pt] = PAYMENT_STATUS[c.payment.status], [sl, st] = SAAS_STATUS[c.saasStatus]
  const note = activationNote(c)
  return (
    <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}>
      <div className="ctr-state" role="group" aria-label="Estados independentes">
        <span className="small">Contrato: <Badge tone={ct}>{cl}</Badge></span>
        <span className="small">Pagamento: <Badge tone={pt}>{pl}{c.payment.uncertain ? ' (em confirmação)' : ''}</Badge></span>
        <span className="small">Assinatura SaaS: <Badge tone={st}>{sl}</Badge></span>
      </div>
      {note && <p className="small muted" role="status">{note}</p>}
    </div>
  )
}

export function ContractEvents({ c, extra }: { c: SaasContract; extra?: ReactNode }) {
  return <div className="ctr-timeline"><Timeline items={[...c.events].reverse().map((e) => ({ time: formatDateTime(e.at), title: e.detail, body: `${e.type} · ${e.by}` }))} />{extra}</div>
}
