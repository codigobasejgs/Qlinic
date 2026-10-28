// Super Admin: “Contratos SaaS” (lista com CPF mascarado, detalhes, envelope, pagamento, aditivo, auditoria)
// e “Contratação” (contratada, signatário, quadro comercial, modelos versionados, provedor, prazos, pendências).
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { usePlatformCollection } from '@/data/store'
import { CONTRACT_STATUS, GATEWAY_LABEL, maskSectionsCpf, PAYMENT_STATUS, realSignatureBlockers, SAAS_STATUS, TERMS_LABEL, TERMS_TEXT_FIELDS, type CommercialTerms, type ContractStatus, type SaasContract } from '@/domain/contracts'
import type { BillingCycle } from '@/domain/platform'
import { formatBRL } from '@/lib/money'
import { maskCPFPartial, maskCNPJ } from '@/lib/util'
import { Alert, Badge, Button, Checkbox, EmptyState, Field, Input, PageHeader, Section, Select, SimBadge, Tabs, TabPanel, Textarea, Timeline } from '@/ui/core'
import { Dialog, useAction } from '@/ui/overlay'
import { DataTable, type Column } from '@/ui/table'
import { Guard, usePlatformMe } from '@/modules/platform/lib'
import { logAudit } from '@/modules/platform/actions'
import { approveTerms, createAmendment, currentTemplate, currentTerms, legalProfile, paymentEvent, publishTemplate, reconcilePayment, resendInvite, saveTemplateDraft, saveTerms, simulateEnvelope, updateLegalProfile } from './actions'
import { ContractDocument } from './document'
import { ContractEvents, ProviderCard, StatusTriplet } from './parts'
import { MINUTA_MD } from './seed'
import './styles.css'

const docMasked = (c: SaasContract) => (c.contractor.kind === 'pj' ? maskCNPJ(c.contractor.document) : maskCPFPartial(c.contractor.document))

// ======================= Contratos SaaS =======================
export function SaasContractsPage() {
  return <Guard area="contratos" title="Contratos SaaS"><ContractsList /></Guard>
}
function ContractsList() {
  const rows = usePlatformCollection('saasContracts')
  const plans = usePlatformCollection('plans')
  const orgs = usePlatformCollection('organizations')
  const [f, setF] = useState({ q: '', plan: '', version: '', status: '' as '' | ContractStatus, from: '', to: '' })
  const [open, setOpen] = useState<string | null>(null)
  const list = rows.filter((c) => (!f.q || `${c.contractor.legalName} ${c.contractor.tradeName} ${c.number}`.toLowerCase().includes(f.q.toLowerCase()))
    && (!f.plan || c.offer.planId === f.plan) && (!f.version || String(c.templateVersion) === f.version) && (!f.status || c.status === f.status)
    && (!f.from || c.createdAt.slice(0, 10) >= f.from) && (!f.to || c.createdAt.slice(0, 10) <= f.to))
  const versions = [...new Set(rows.map((c) => c.templateVersion))].sort()
  const cols: Column<SaasContract>[] = [
    { id: 'n', header: 'Número', cell: (c) => <button type="button" className="btn btn-link" onClick={() => setOpen(c.id)}>{c.number}</button>, value: (c) => c.number },
    { id: 'cl', header: 'Contratante', cell: (c) => <span>{c.contractor.tradeName || c.contractor.legalName}<br /><span className="tiny muted">{docMasked(c)}</span></span>, value: (c) => c.contractor.legalName, mobile: true },
    { id: 't', header: 'Clínica', cell: (c) => (c.tenantId ? <Link to={`/master/contratantes/${c.tenantId}`}>{orgs.find((o) => o.id === c.tenantId)?.name ?? c.tenantId}</Link> : '—') },
    { id: 'k', header: 'Tipo', cell: (c) => (c.kind === 'aditivo' ? 'Aditivo' : 'Contrato') },
    { id: 'p', header: 'Plano', cell: (c) => `${c.offer.planName} · ${c.offer.cycle}`, value: (c) => c.offer.planName },
    { id: 'v', header: 'Modelo', cell: (c) => `v${c.templateVersion}`, value: (c) => c.templateVersion },
    { id: 's', header: 'Contrato', cell: (c) => <Badge tone={CONTRACT_STATUS[c.status][1]}>{CONTRACT_STATUS[c.status][0]}</Badge>, value: (c) => c.status, mobile: true },
    { id: 'pg', header: 'Pagamento', cell: (c) => <Badge tone={PAYMENT_STATUS[c.payment.status][1]}>{PAYMENT_STATUS[c.payment.status][0]}{c.payment.uncertain ? '?' : ''}</Badge>, value: (c) => c.payment.status },
    { id: 'ss', header: 'SaaS', cell: (c) => <Badge tone={SAAS_STATUS[c.saasStatus][1]}>{SAAS_STATUS[c.saasStatus][0]}</Badge>, value: (c) => c.saasStatus },
    { id: 'tot', header: 'Total do ciclo', num: true, cell: (c) => formatBRL(c.offer.totalCents), value: (c) => c.offer.totalCents },
    { id: 'd', header: 'Criado', cell: (c) => new Date(c.createdAt).toLocaleDateString('pt-BR'), value: (c) => c.createdAt },
  ]
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Contratos SaaS" subtitle="Contratos e aditivos entre a fornecedora do Qlinic e as clínicas. Documento, assinatura, pagamento e ativação são estados independentes." actions={<SimBadge>Simulação — sem validade jurídica</SimBadge>} />
      <div className="grid grid-3">
        <Field label="Buscar cliente ou número"><Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></Field>
        <Field label="Plano"><Select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}><option value="">Todos</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Versão do modelo"><Select value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })}><option value="">Todas</option>{versions.map((v) => <option key={v} value={v}>v{v}</option>)}</Select></Field>
        <Field label="Status do contrato"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ContractStatus | '' })}><option value="">Todos</option>{Object.entries(CONTRACT_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Criado a partir de"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Criado até"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
      </div>
      <DataTable caption="Contratos SaaS" rows={list} columns={cols} rowKey={(c) => c.id} empty={<EmptyState title="Nenhum contrato neste filtro" />} />
      <p className="tiny muted">CPF aparece mascarado nas listas. Exportação desta tabela não inclui CPF completo.</p>
      {open && <ContractDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ContractDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const me = usePlatformMe()
  const run = useAction()
  const c = usePlatformCollection('saasContracts').find((x) => x.id === id)
  const env = usePlatformCollection('signatureEnvelopes').find((e) => e.id === c?.envelopeId)
  const audit = usePlatformCollection('platformAudit').filter((a) => a.target === c?.number || a.target === c?.tenantId)
  const plans = usePlatformCollection('plans').filter((p) => p.active)
  const [tab, setTab] = useState('resumo')
  const [reason, setReason] = useState('')
  const [am, setAm] = useState({ planId: plans[0]?.id ?? '', cycle: 'mensal' as BillingCycle, note: '' })
  const [showCpf, setShowCpf] = useState(false)
  const owner = me.role === 'platform_owner'
  const finance = me.role === 'platform_finance' || owner
  const sections = useMemo(() => (c?.snapshot ? (showCpf ? c.snapshot.sections : maskSectionsCpf(c.snapshot.sections, [c.signatory.document, c.contractor.kind === 'pf' ? c.contractor.document : ''])) : []), [c, showCpf])
  if (!c) return null
  const msg = (r: { result: string }) => r.result
  return (
    <Dialog open onClose={onClose} title={`${c.kind === 'aditivo' ? 'Aditivo' : 'Contrato'} ${c.number}`} description={`${c.contractor.legalName} · ${docMasked(c)}`} size="xl">
      <div className="stack">
        <StatusTriplet c={c} />
        <Tabs label="Detalhes do contrato" value={tab} onChange={setTab} tabs={[{ id: 'resumo', label: 'Resumo' }, { id: 'documento', label: 'Documento' }, { id: 'assinatura', label: 'Signatários e evidências' }, { id: 'pagamento', label: 'Pagamento' }, { id: 'historico', label: 'Histórico e auditoria' }]} />
        <TabPanel>
          {tab === 'resumo' && <div className="stack">
            <dl className="ctr-dl">
              <dt>Oferta</dt><dd>{c.offer.offerVersion}</dd><dt>Modelo</dt><dd>{c.templateId} v{c.templateVersion}</dd><dt>Revisão</dt><dd>{c.revision}</dd>
              <dt>Envelope</dt><dd>{c.envelopeId ?? '—'}</dd><dt>Integridade</dt><dd className="tiny">{c.snapshot?.hash ?? '—'}</dd>
              {c.amendsContractId && <><dt>Aditivo de</dt><dd>{c.amendsContractId}</dd><dt>Alteração</dt><dd>{c.amendmentNote}</dd></>}
              {c.supersedes && <><dt>Substitui</dt><dd>{c.supersedes}</dd></>}{c.supersededBy && <><dt>Substituído por</dt><dd>{c.supersededBy}</dd></>}
            </dl>
            {owner && c.status === 'signed' && c.tenantId && c.kind === 'contrato' && <Section title="Gerar aditivo">
              <div className="grid grid-3">
                <Field label="Novo plano"><Select value={am.planId} onChange={(e) => setAm({ ...am, planId: e.target.value })}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
                <Field label="Ciclo"><Select value={am.cycle} onChange={(e) => setAm({ ...am, cycle: e.target.value as BillingCycle })}><option value="mensal">Mensal</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option></Select></Field>
                <Field label="Alteração (texto do aditivo)" required><Input value={am.note} onChange={(e) => setAm({ ...am, note: e.target.value })} /></Field>
              </div>
              <Button onClick={() => run(() => createAmendment(c.id, am.planId, am.cycle, am.note, me.actor), 'Aditivo gerado para revisão e assinatura.')}>Gerar aditivo</Button>
            </Section>}
          </div>}
          {tab === 'documento' && (c.snapshot ? <div className="stack">
            {owner && <Checkbox checked={showCpf} onChange={(e) => { setShowCpf(e.target.checked); if (e.target.checked) logAudit(me.actor, 'contrato.cpf_completo_exibido', c.number) }} label="Exibir CPF completo (acesso restrito, registrado em auditoria)" />}
            <ContractDocument sections={sections} title={`${c.kind === 'aditivo' ? 'Aditivo' : 'Contrato'} ${c.number}`} fileName={`qlinic-${c.number}${c.status === 'signed' ? '-final' : '-minuta'}`} meta={<>Modelo v{c.templateVersion} · hash {c.snapshot.hash.slice(0, 16)}…</>} />
          </div> : <EmptyState title="Documento ainda não congelado" />)}
          {tab === 'assinatura' && <div className="stack">
            {env ? <>
              <p className="small">Provedor: {env.provider === 'mock' ? 'simulação local' : 'real'} · status: <strong>{env.status}</strong> · expira em {new Date(env.expiresAt).toLocaleString('pt-BR')}</p>
              <ul className="ctr-list">{env.signers.map((s) => <li key={s.id}><span className="grow">{s.order}. {s.role} — {s.name}</span><span className="small">{s.status === 'signed' ? `Simulação concluída · ${new Date(s.at!).toLocaleString('pt-BR')}` : s.status}</span></li>)}</ul>
              <Timeline items={env.events.map((e) => ({ time: new Date(e.at).toLocaleString('pt-BR'), title: `${e.type} — ${e.result}`, body: e.detail }))} />
              <Alert tone="warning">Evidências reais (método de identificação, IP, carimbo de tempo, arquivo final do provedor e dossiê) só existem com provedor contratado. Nada aqui comprova assinatura.</Alert>
              {owner && ['created', 'sent', 'partially_signed'].includes(env.status) && <div className="stack">
                <div className="row">
                  <Button size="sm" onClick={() => run(() => resendInvite(c.id, me.actor), 'Reenvio registrado (simulação, nada enviado).')}>Reenviar convite</Button>
                  <Button size="sm" onClick={() => run(() => msg(simulateEnvelope(c.id, 'sign_provider', me.actor)), 'Evento simulado aplicado.')}>Simular assinatura da contratada</Button>
                  <Button size="sm" onClick={() => run(() => msg(simulateEnvelope(c.id, 'replay', me.actor)), 'Webhook duplicado reenviado (deve ser ignorado).')}>Simular webhook duplicado</Button>
                  <Button size="sm" onClick={() => run(() => msg(simulateEnvelope(c.id, 'expire', me.actor)), 'Expiração simulada.')}>Simular expiração</Button>
                </div>
                <Field label="Motivo (recusa ou cancelamento do envelope)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                <div className="row"><Button size="sm" variant="danger" onClick={() => run(() => msg(simulateEnvelope(c.id, 'cancel', me.actor, reason)), 'Envelope cancelado.')}>Cancelar envelope</Button><Button size="sm" variant="ghost" onClick={() => run(() => msg(simulateEnvelope(c.id, 'decline', me.actor, reason)), 'Recusa simulada.')}>Simular recusa do contratante</Button></div>
              </div>}
              {!owner && <p className="small muted">Seu perfil não pode alterar envelopes nem forçar assinatura.</p>}
            </> : <EmptyState title="Sem envelope" />}
          </div>}
          {tab === 'pagamento' && <div className="stack">
            <dl className="ctr-dl"><dt>Gateway</dt><dd>{GATEWAY_LABEL[c.payment.provider]}</dd><dt>Valor</dt><dd>{formatBRL(c.payment.amountCents)}</dd><dt>Tentativas</dt><dd>{c.payment.attempts}</dd><dt>Chave idempotente</dt><dd className="tiny">{c.payment.idempotencyKey ?? '—'}</dd><dt>Referência</dt><dd className="tiny">{c.payment.providerRef ?? '—'}</dd></dl>
            {finance && <div className="row">
              {c.payment.uncertain && <Button size="sm" variant="primary" onClick={() => run(() => reconcilePayment(c.id, me.actor), 'Reconciliado: provedor confirmou (simulação).')}>Reconciliar com o provedor</Button>}
              {c.payment.status === 'confirmed' && <Button size="sm" onClick={() => run(() => paymentEvent(c.id, 'refunded', `refund_${c.id}`, me.actor), 'Estorno registrado; contrato preservado.')}>Simular estorno</Button>}
              {c.payment.status === 'confirmed' && <Button size="sm" variant="ghost" onClick={() => run(() => paymentEvent(c.id, 'disputed', `dispute_${c.id}`, me.actor), 'Disputa registrada.')}>Simular disputa</Button>}
              {c.payment.idempotencyKey && <Button size="sm" variant="ghost" onClick={() => run(() => paymentEvent(c.id, 'confirmed', `pay_${c.payment.idempotencyKey}`, me.actor), 'Webhook duplicado reenviado.')}>Reenviar webhook (duplicado)</Button>}
            </div>}
            <p className="small muted">Reembolso não apaga contrato. Cancelar a assinatura SaaS não invalida historicamente o contrato assinado.</p>
          </div>}
          {tab === 'historico' && <div className="stack"><ContractEvents c={c} /><h3 style={{ fontSize: 15 }}>Auditoria da plataforma</h3><Timeline items={audit.map((a) => ({ time: new Date(a.at).toLocaleString('pt-BR'), title: a.action, body: `${a.actor}${a.detail ? ` · ${a.detail}` : ''}` }))} /></div>}
        </TabPanel>
      </div>
    </Dialog>
  )
}

// ======================= Contratação (configurações) =======================
export function ContractSettingsPage() {
  return <Guard area="contratos" title="Configurações de contratação"><Settings /></Guard>
}
function Settings() {
  const me = usePlatformMe()
  const owner = me.role === 'platform_owner'
  usePlatformCollection('legalProfile'); usePlatformCollection('commercialTerms'); const templates = usePlatformCollection('contractTemplates')
  const p = legalProfile()
  const terms = currentTerms()
  const tpl = currentTemplate()
  const [tab, setTab] = useState('contratada')
  const blockers = realSignatureBlockers(p, terms, templates.find((t) => t.status === 'publicado'))
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Configurações de contratação" subtitle="Dados da contratada, signatários, quadro comercial, modelos versionados, provedor, canais e prazos." actions={<SimBadge>Simulação</SimBadge>} />
      {blockers.length > 0 && <Alert tone="warning" title="Assinatura real bloqueada"><ul style={{ margin: 0, paddingLeft: 18 }}>{blockers.map((b) => <li key={b}>{b}</li>)}</ul>A jornada segue disponível em modo simulado, sempre identificada.</Alert>}
      {!owner && <Alert tone="info">Seu perfil consulta estas configurações, mas não edita modelos nem dados da contratada.</Alert>}
      <Tabs label="Seções" value={tab} onChange={setTab} tabs={[{ id: 'contratada', label: 'Contratada' }, { id: 'quadro', label: `Quadro comercial v${terms.version}` }, { id: 'modelos', label: `Modelos (v${tpl.version})` }, { id: 'pendencias', label: 'Pendências' }]} />
      <TabPanel>
        {tab === 'contratada' && <ProviderSettings owner={owner} />}
        {tab === 'quadro' && <TermsSettings terms={terms} owner={owner} />}
        {tab === 'modelos' && <TemplateSettings owner={owner} />}
        {tab === 'pendencias' && <Section title="Tarefas de pré-lançamento"><ul className="ctr-list">{p.tasks.map((t) => <li key={t.id} className="stack" style={{ alignItems: 'flex-start' }}><span className="strong">{t.title} <Badge tone={t.status === 'aberta' ? 'warning' : 'success'}>{t.status}</Badge></span><span className="small">{t.detail}</span>{owner && t.status === 'aberta' && <ToggleTask id={t.id} />}</li>)}</ul></Section>}
      </TabPanel>
    </div>
  )
}
function ToggleTask({ id }: { id: string }) {
  const me = usePlatformMe(); const run = useAction()
  return <Button size="sm" onClick={() => run(() => updateLegalProfile({ tasks: legalProfile().tasks.map((t) => (t.id === id ? { ...t, status: 'concluida' as const } : t)) }, me.actor), 'Tarefa concluída.')}>Marcar como concluída (após conferência real)</Button>
}

function ProviderSettings({ owner }: { owner: boolean }) {
  const me = usePlatformMe(); const run = useAction()
  const p = legalProfile()
  const [s, setS] = useState({ name: p.authorizedSignatory?.name ?? '', role: p.authorizedSignatory?.role ?? '', email: p.authorizedSignatory?.email ?? '', contract: p.contractChannel ?? '', privacy: p.privacyContact ?? '', support: p.supportChannels.map((x) => `${x.channel} | ${x.hours}`).join('\n'), reminder: p.reminderDays, expiry: p.envelopeExpiryDays, retention: p.draftRetentionDays, provider: p.signatureProvider, legal: p.legalReviewStatus === 'done', commercial: p.commercialTermsStatus === 'done' })
  const save = () => run(() => updateLegalProfile({
    authorizedSignatory: s.name.trim() ? { name: s.name.trim(), role: s.role.trim(), email: s.email.trim(), method: s.provider === 'future' ? 'provedor_externo' : 'simulacao' } : null,
    contractChannel: s.contract.trim() || null, privacyContact: s.privacy.trim() || null,
    supportChannels: s.support.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter(([c]) => c).map(([channel, hours]) => ({ channel, hours: hours ?? 'horário a informar' })),
    reminderDays: Number(s.reminder), envelopeExpiryDays: Number(s.expiry), draftRetentionDays: Number(s.retention), signatureProvider: s.provider,
    legalReviewStatus: s.legal ? 'done' : 'pending', commercialTermsStatus: s.commercial ? 'done' : 'pending',
  }, me.actor), 'Cadastro da contratada atualizado. Contratos já congelados não mudam.')
  return (
    <div className="stack">
      <ProviderCard p={p} title="Dados cadastrais (comprovante de CNPJ)" />
      <fieldset className="stack card" disabled={!owner}>
        <legend className="strong">Signatário autorizado e canais</legend>
        <div className="grid grid-3">
          <Field label="Nome do titular/procurador"><Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></Field>
          <Field label="Cargo/qualidade"><Input value={s.role} onChange={(e) => setS({ ...s, role: e.target.value })} /></Field>
          <Field label="E-mail de assinatura"><Input type="email" value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} /></Field>
          <Field label="Canal contratual"><Input value={s.contract} onChange={(e) => setS({ ...s, contract: e.target.value })} /></Field>
          <Field label="Canal de privacidade"><Input value={s.privacy} onChange={(e) => setS({ ...s, privacy: e.target.value })} /></Field>
          <Field label="Provedor de assinatura"><Select value={s.provider} onChange={(e) => setS({ ...s, provider: e.target.value as 'mock' | 'future' })}><option value="mock">Simulação local</option><option value="future">Provedor real (a contratar)</option></Select></Field>
          <Field label="Lembrete a cada (dias)"><Input type="number" value={s.reminder} onChange={(e) => setS({ ...s, reminder: Number(e.target.value) })} /></Field>
          <Field label="Envelope expira em (dias)"><Input type="number" value={s.expiry} onChange={(e) => setS({ ...s, expiry: Number(e.target.value) })} /></Field>
          <Field label="Retenção de rascunhos (dias)"><Input type="number" value={s.retention} onChange={(e) => setS({ ...s, retention: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Canais e horários de suporte" hint="Um por linha: canal | dias e horários (fuso). Não presuma WhatsApp ou 24 horas."><Textarea rows={3} value={s.support} onChange={(e) => setS({ ...s, support: e.target.value })} /></Field>
        <Checkbox checked={s.legal} onChange={(e) => setS({ ...s, legal: e.target.checked })} label="Revisão jurídica do contrato efetivamente realizada" />
        <Checkbox checked={s.commercial} onChange={(e) => setS({ ...s, commercial: e.target.checked })} label="Condições comerciais efetivamente aprovadas" />
        <p className="tiny muted">Habilitar assinatura em produção não é possível pelo navegador: depende de backend, provedor homologado e credenciais no servidor.</p>
        {owner && <Button variant="primary" onClick={save} style={{ alignSelf: 'flex-start' }}>Salvar</Button>}
      </fieldset>
    </div>
  )
}

function TermsSettings({ terms, owner }: { terms: CommercialTerms; owner: boolean }) {
  const me = usePlatformMe(); const run = useAction()
  const { id: _i, version: _v, status: _s, approvedBy: _b, approvedAt: _a, ...base } = terms
  void _i; void _v; void _s; void _b; void _a
  const [t, setT] = useState(base)
  const [reviewer, setReviewer] = useState('')
  return (
    <div className="stack">
      <p className="small">Status: <Badge tone={terms.status === 'approved' ? 'success' : 'warning'}>{terms.status === 'approved' ? `aprovado por ${terms.approvedBy}` : 'pendente de aprovação'}</Badge>. Preços, limites e módulos vêm do cadastro de planos. Nova versão não altera contratos existentes.</p>
      <fieldset className="stack" disabled={!owner} style={{ border: 0, padding: 0 }}>
        <div className="grid grid-3">
          <Field label="Dias de teste gratuito"><Input type="number" value={t.trialDays} onChange={(e) => setT({ ...t, trialDays: Number(e.target.value) })} /></Field>
          <Field label="Implantação (centavos; 0 = não cobrada)"><Input type="number" value={t.setupFeeCents} onChange={(e) => setT({ ...t, setupFeeCents: Number(e.target.value) })} /></Field>
          <Field label="Prazo de pagamento (dias)"><Input type="number" value={t.paymentDueDays} onChange={(e) => setT({ ...t, paymentDueDays: Number(e.target.value) })} /></Field>
          <Field label="Gateway da mensalidade"><Select value={t.gateway} onChange={(e) => setT({ ...t, gateway: e.target.value as CommercialTerms['gateway'] })}><option value="asaas">Asaas</option><option value="mercadopago">Mercado Pago</option><option value="infinitepay">InfinitePay</option></Select></Field>
          <Field label="Assinaturas eletrônicas/mês (0 = não incluído)"><Input type="number" value={t.signaturesIncluded} onChange={(e) => setT({ ...t, signaturesIncluded: Number(e.target.value) })} /></Field>
        </div>
        {TERMS_TEXT_FIELDS.map((k) => <Field key={k} label={TERMS_LABEL[k]}><Textarea rows={2} value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} /></Field>)}
        {owner && <div className="row"><Button variant="primary" onClick={() => run(() => saveTerms(t, me.actor), 'Nova versão do quadro comercial criada (pendente).')}>Salvar como nova versão</Button></div>}
      </fieldset>
      {owner && terms.status !== 'approved' && <Section title="Aprovação comercial"><div className="row"><Field label="Aprovado por (nome e função)"><Input value={reviewer} onChange={(e) => setReviewer(e.target.value)} /></Field><Button onClick={() => run(() => approveTerms(reviewer, me.actor), 'Quadro comercial aprovado.')}>Registrar aprovação realizada</Button></div></Section>}
    </div>
  )
}

function TemplateSettings({ owner }: { owner: boolean }) {
  const me = usePlatformMe(); const run = useAction()
  const all = usePlatformCollection('contractTemplates')
  const latest = all.reduce((a, b) => (b.version > a.version ? b : a))
  const [body, setBody] = useState(latest.body)
  const [rev, setRev] = useState({ legal: false, commercial: false, reviewer: '' })
  const [view, setView] = useState<string | null>(null)
  const viewing = all.find((x) => x.id === view)
  return (
    <div className="stack">
      <DataTable caption="Versões do modelo" rows={[...all].sort((a, b) => b.version - a.version)} rowKey={(x) => x.id} columns={[
        { id: 'v', header: 'Versão', cell: (x) => `v${x.version}`, value: (x) => x.version },
        { id: 's', header: 'Status', cell: (x) => <Badge tone={x.status === 'publicado' ? 'success' : x.status === 'minuta' ? 'warning' : 'neutral'}>{x.status}</Badge>, mobile: true },
        { id: 'r', header: 'Revisão', cell: (x) => (x.reviewedBy ? `${x.reviewedBy}` : 'não realizada') },
        { id: 'c', header: 'Criado por', cell: (x) => x.createdBy },
      ]} rowActions={(x) => <Button size="sm" onClick={() => setView(x.id)}>Ver</Button>} />
      {owner && <Section title="Nova versão (minuta)">
        <Field label="Texto do modelo" hint="Markdown simples: “### Título”, parágrafos e “<!-- PAGE -->”. Variável: {{contratada.privacidade}}. Identificação, Anexo A e registro das partes são gerados pelo sistema."><Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="row"><Button onClick={() => run(() => saveTemplateDraft(body, me.actor), 'Nova minuta criada. Contratos antigos não mudam.')}>Salvar como nova versão</Button><Button variant="ghost" onClick={() => setBody(latest.body)}>Descartar edição</Button><a className="btn btn-ghost" href={`data:text/markdown;charset=utf-8,${encodeURIComponent(MINUTA_MD)}`} download="CONTRATO_QLINIC_MINUTA.md">Baixar minuta original</a></div>
      </Section>}
      {owner && latest.status === 'minuta' && <Section title={`Publicar v${latest.version}`}>
        <Checkbox checked={rev.legal} onChange={(e) => setRev({ ...rev, legal: e.target.checked })} label="A revisão jurídica desta versão foi efetivamente realizada" />
        <Checkbox checked={rev.commercial} onChange={(e) => setRev({ ...rev, commercial: e.target.checked })} label="A revisão comercial desta versão foi efetivamente realizada" />
        <Field label="Revisado por (nome, OAB/função)"><Input value={rev.reviewer} onChange={(e) => setRev({ ...rev, reviewer: e.target.value })} /></Field>
        <Button variant="primary" onClick={() => run(() => publishTemplate(latest.id, rev, me.actor), 'Modelo publicado. Novas contratações usam esta versão.')}>Publicar</Button>
      </Section>}
      <Dialog open={!!viewing} onClose={() => setView(null)} title={viewing ? `Modelo v${viewing.version}` : ''} size="xl">{viewing && <pre className="small" style={{ whiteSpace: 'pre-wrap' }}>{viewing.body}</pre>}</Dialog>
    </div>
  )
}
