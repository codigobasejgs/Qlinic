// Admin da clínica: “Meu plano e contrato” — ciclo, total, próximas cobranças, contrato final, aditivos, pagamentos,
// cancelamento com protocolo e exportação. Documento histórico nunca é reescrito por alterações cadastrais.
import { useState } from 'react'
import { useTenant, useActor } from '@/app/session'
import { usePlatformCollection } from '@/data/store'
import { CONTRACT_STATUS, CYCLE_NAME, type SaasContract } from '@/domain/contracts'
import { formatBRL } from '@/lib/money'
import { formatCivil } from '@/lib/dates'
import { downloadText } from '@/lib/util'
import { Alert, Badge, Button, EmptyState, Field, PageHeader, Section, SimBadge, Textarea } from '@/ui/core'
import { Dialog, useAction } from '@/ui/overlay'
import { DataTable } from '@/ui/table'
import { requestCancellation } from './actions'
import { ContractDocument } from './document'
import { ContractEvents, OfferSummary, StatusTriplet } from './parts'
import './styles.css'

export function MyPlanContractPage() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const all = usePlatformCollection('saasContracts').filter((c) => c.tenantId === t.tenantId)
  const subs = usePlatformCollection('subscriptions')
  const plans = usePlatformCollection('plans')
  const invoices = usePlatformCollection('saasInvoices').filter((i) => i.tenantId === t.tenantId)
  const [open, setOpen] = useState<SaasContract | null>(null)
  const [cancel, setCancel] = useState(false)
  const [reason, setReason] = useState('')
  if (!t.can('configuracoes', 'read')) return <div className="stack"><PageHeader title="Meu plano e contrato" /><EmptyState title="Sem acesso">Seu perfil não acessa as informações contratuais da clínica.</EmptyState></div>
  const sub = subs.find((s) => s.tenantId === t.tenantId)
  const main = all.filter((c) => c.kind === 'contrato' && c.status === 'signed').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const amendments = all.filter((c) => c.kind === 'aditivo')
  const canManage = t.can('configuracoes', 'update')
  const exportAll = () => downloadText(`qlinic-contratos-${t.org.slug}.json`, JSON.stringify({ exportadoEm: new Date().toISOString(), aviso: 'Simulação — documentos sem validade jurídica', contratos: all.map((c) => ({ numero: c.number, tipo: c.kind, status: c.status, pagamento: c.payment.status, assinaturaSaas: c.saasStatus, oferta: c.offer, hash: c.snapshot?.hash, eventos: c.events })), faturas: invoices }, null, 2), 'application/json')
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Meu plano e contrato" subtitle={`${t.org.name} · relação contratual com a fornecedora do Qlinic`} actions={<><SimBadge>Simulação — sem validade jurídica</SimBadge><Button onClick={exportAll}>Exportar</Button></>} />
      {!main && <Alert tone="info" title="Nenhum contrato assinado vinculado">Clínicas da demonstração criadas antes da contratação online não têm contrato gerado. Contrate um plano pela página pública para ver o fluxo completo.</Alert>}
      <div className="grid grid-2">
        <Section title="Plano atual">
          {sub ? <dl className="ctr-dl">
            <dt>Plano</dt><dd>{plans.find((p) => p.id === sub.planId)?.name ?? sub.planId}</dd>
            <dt>Ciclo</dt><dd>{CYCLE_NAME[sub.cycle]}</dd>
            <dt>Status</dt><dd>{sub.status}</dd>
            <dt>Período atual até</dt><dd>{formatCivil(sub.currentPeriodEnd)}</dd>
            {sub.cancelAt && <><dt>Cancelamento</dt><dd>efeito em {formatCivil(sub.cancelAt)}</dd></>}
          </dl> : <p className="small muted">Assinatura não encontrada.</p>}
        </Section>
        {main && <Section title={`Contrato ${main.number}`}><div className="stack"><StatusTriplet c={main} /><OfferSummary o={main.offer} units={main.contractor.units} /><Button onClick={() => setOpen(main)}>Ver cópia final</Button></div></Section>}
      </div>
      <Section title="Contratos e aditivos">
        <DataTable caption="Contratos e aditivos" rows={all} rowKey={(c) => c.id} empty={<EmptyState title="Sem documentos" />}
          columns={[
            { id: 'n', header: 'Número', cell: (c) => c.number, value: (c) => c.number },
            { id: 'k', header: 'Tipo', cell: (c) => (c.kind === 'aditivo' ? 'Aditivo' : 'Contrato'), mobile: true },
            { id: 's', header: 'Status', cell: (c) => <Badge tone={CONTRACT_STATUS[c.status][1]}>{CONTRACT_STATUS[c.status][0]}</Badge>, value: (c) => c.status, mobile: true },
            { id: 'v', header: 'Valor do ciclo', num: true, cell: (c) => formatBRL(c.offer.totalCents), value: (c) => c.offer.totalCents },
            { id: 'd', header: 'Criado em', cell: (c) => new Date(c.createdAt).toLocaleDateString('pt-BR'), value: (c) => c.createdAt },
          ]}
          rowActions={(c) => c.snapshot ? <Button size="sm" onClick={() => setOpen(c)}>Abrir</Button> : null} />
        {amendments.length > 0 && <p className="small muted">Aditivos vinculam explicitamente o contrato anterior e a alteração; o contrato original permanece inalterado.</p>}
      </Section>
      <Section title="Cobranças da mensalidade">
        <DataTable caption="Faturas SaaS" rows={invoices} rowKey={(i) => i.id} empty={<EmptyState title="Sem faturas" />}
          columns={[
            { id: 'n', header: 'Fatura', cell: (i) => i.number, value: (i) => i.number },
            { id: 'c', header: 'Competência', cell: (i) => i.competence, mobile: true },
            { id: 'v', header: 'Valor', num: true, cell: (i) => formatBRL(i.amountCents), value: (i) => i.amountCents, mobile: true },
            { id: 'due', header: 'Vencimento', cell: (i) => formatCivil(i.dueDate), value: (i) => i.dueDate },
            { id: 's', header: 'Status', cell: (i) => i.status, mobile: true },
          ]} />
      </Section>
      {canManage && main && !main.cancellation && main.saasStatus !== 'canceled' && <Section title="Cancelamento"><p className="small">O cancelamento gera protocolo, tem efeito conforme o Anexo A do seu contrato e não apaga o histórico nem o documento assinado.</p><Button variant="danger" onClick={() => setCancel(true)}>Solicitar cancelamento</Button></Section>}
      {main?.cancellation && <Alert tone="warning" title={`Cancelamento solicitado — protocolo ${main.cancellation.protocol}`}>Efeito em {formatCivil(main.cancellation.effectiveOn)}. Exportação de dados conforme o Anexo A.</Alert>}
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open ? `${open.kind === 'aditivo' ? 'Aditivo' : 'Contrato'} ${open.number}` : ''} size="xl">
        {open?.snapshot && <div className="stack">
          <StatusTriplet c={open} />
          <ContractDocument sections={open.snapshot.sections} title={`${open.kind === 'aditivo' ? 'Aditivo' : 'Contrato'} ${open.number}`} fileName={`qlinic-${open.number}${open.status === 'signed' ? '-final' : '-minuta'}`} meta={<>Modelo v{open.templateVersion} · integridade {open.snapshot.hash.slice(0, 16)}… · congelado em {new Date(open.snapshot.frozenAt).toLocaleString('pt-BR')}</>} />
          <details><summary className="small">Histórico</summary><ContractEvents c={open} /></details>
        </div>}
      </Dialog>
      <Dialog open={cancel} onClose={() => setCancel(false)} title="Solicitar cancelamento" footer={<><Button onClick={() => setCancel(false)}>Voltar</Button><Button variant="danger" onClick={() => { if (main && run(() => requestCancellation(main.id, reason, actor), 'Cancelamento registrado com protocolo.')) setCancel(false) }}>Confirmar solicitação</Button></>}>
        <Field label="Motivo" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} /></Field>
      </Dialog>
    </div>
  )
}
