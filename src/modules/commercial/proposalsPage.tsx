import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Copy, Plus, Send, Trash2, GitBranch, Ban, CheckCheck, XCircle } from 'lucide-react'
import type { Proposal, ProposalItem, ProposalStatus, Charge } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit, notificationProvider, saveProposal } from '@/data/repositories'
import { acceptProposal, isExpired, itemTotal, newProposalVersion, proposalTotals, rejectProposal, validateDiscounts, validateSelection } from '@/domain/proposals'
import { getPolicies } from '@/domain/settings'
import { Alert, Badge, Button, Checkbox, DataTable, Dialog, Field, Input, Kpi, PageHeader, PatientPicker, Select, SimBadge, Textarea, Timeline, useAction, useConfirm, useToast, EmptyState, type Column } from '@/ui'
import { addDaysCivil, formatCivil, formatDateTime, nowISO, todayCivil } from '@/lib/dates'
import { formatBRL, marginPercent, splitInstallments } from '@/lib/money'
import { normalize, uid } from '@/lib/util'
import { CHARGE_STATUS, MoneyInput, ModuleOff, NoAccess, PROPOSAL_STATUS, StatusBadge, Toolbar, pct } from './ui'
import { suppliesCost } from './commissions'

const EDITABLE: ProposalStatus[] = ['rascunho']

export function ProposalsPage() {
  const t = useTenant()
  const actor = useActor()
  const nav = useNavigate()
  const run = useAction()
  const [sp, setSp] = useSearchParams()
  const proposals = useCollection(t.tenantId, 'proposals')
  const patients = useCollection(t.tenantId, 'patients')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [newOpen, setNewOpen] = useState(!!sp.get('novo'))
  const [pat, setPat] = useState<string | null>(sp.get('novo'))
  if (!t.moduleOn('orcamentos')) return <ModuleOff name="Orçamentos" />
  if (!t.can('orcamentos')) return <NoAccess what="orçamentos" />
  const rows = proposals.filter((p) => (!status || p.status === status) && (!t.unitId || p.unitId === t.unitId) && (!q || normalize(`${p.number} ${patients.find((x) => x.id === p.patientId)?.name ?? ''}`).includes(normalize(q))))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const create = () => {
    let id = ''
    const ok = run(() => {
      if (!pat) throw new Error('Selecione o paciente.')
      const patient = patients.find((x) => x.id === pat)!
      const pol = getPolicies(t.tenantId, patient.unitId).payments
      const n = proposals.reduce((m, p) => Math.max(m, Number(p.number.replace(/\D/g, '')) || 0), 0) + 1
      const p: Proposal = {
        id: uid('prop_'), tenantId: t.tenantId, createdAt: nowISO(), unitId: t.unitId ?? patient.unitId, patientId: patient.id, professionalId: t.effectiveUser?.professionalId, number: `ORC-${String(n).padStart(4, '0')}`, version: 1,
        token: `demo-${uid()}${uid()}`, items: [], validUntil: addDaysCivil(todayCivil(), 15), maxInstallments: pol.maxInstallments, conditions: 'Valores demonstrativos. Pagamento simulado — sem cobrança real.', maxDiscountPercent: 10,
        financialResponsibleId: patient.personId, status: 'rascunho', acceptedItemIds: [], questions: [], history: [{ at: nowISO(), from: null, to: 'rascunho', by: actor.name }], chargeIds: [],
      }
      db.insert(t.tenantId, 'proposals', p)
      id = p.id
    }, 'Orçamento criado.')
    if (ok) { setSp({}, { replace: true }); nav(`${t.base}/orcamentos/${id}`) }
  }
  const sum = (s: ProposalStatus[]) => proposals.filter((p) => s.includes(p.status)).reduce((a, p) => a + proposalTotals(p, s.includes('aceita') ? p.acceptedItemIds : undefined).net, 0)
  const cols: Column<Proposal>[] = [
    { id: 'n', header: 'Número', cell: (p) => `${p.number} v${p.version}`, value: (p) => p.number },
    { id: 'pat', header: 'Paciente', cell: (p) => patients.find((x) => x.id === p.patientId)?.name ?? '—', value: (p) => patients.find((x) => x.id === p.patientId)?.name },
    { id: 'st', header: 'Status', cell: (p) => <StatusBadge map={PROPOSAL_STATUS} value={isExpired(p) && ['enviada', 'visualizada', 'rascunho'].includes(p.status) ? 'expirada' : p.status} />, value: (p) => p.status },
    { id: 'tot', header: 'Total (itens base)', num: true, cell: (p) => formatBRL(proposalTotals(p).net), value: (p) => proposalTotals(p).net },
    { id: 'acc', header: 'Aceito', num: true, cell: (p) => p.acceptedItemIds.length ? formatBRL(proposalTotals(p, p.acceptedItemIds).net) : '—', value: (p) => proposalTotals(p, p.acceptedItemIds).net },
    { id: 'val', header: 'Validade', cell: (p) => formatCivil(p.validUntil), value: (p) => p.validUntil },
  ]
  return (
    <div data-tour="page-content" className="com-page">
      <PageHeader title="Orçamentos" subtitle="Propostas com versões, alternativas, aceite parcial e link para o paciente."
        actions={t.can('orcamentos', 'create') ? <Button variant="primary" icon={<Plus />} data-tour="primary-action" onClick={() => setNewOpen(true)}>Novo orçamento</Button> : undefined} />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Kpi label="Em aberto (enviadas)" value={formatBRL(sum(['enviada', 'visualizada']))} />
        <Kpi label="Aceitas" value={formatBRL(sum(['aceita', 'aceita_parcial']))} />
        <Kpi label="Rascunhos" value={proposals.filter((p) => p.status === 'rascunho').length} />
        <Kpi label="Recusadas" value={proposals.filter((p) => p.status === 'recusada').length} />
      </div>
      <Toolbar>
        <Field label="Buscar"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número ou paciente" /></Field>
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos</option>{Object.entries(PROPOSAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
      </Toolbar>
      <DataTable caption="Orçamentos" rows={rows} columns={cols} rowKey={(p) => p.id} onRowClick={(p) => nav(`${t.base}/orcamentos/${p.id}`)} exportName="orcamentos"
        empty={<EmptyState title="Nenhum orçamento">Crie um orçamento a partir do paciente.</EmptyState>} />
      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="Novo orçamento" footer={<><Button onClick={() => setNewOpen(false)}>Cancelar</Button><Button variant="primary" onClick={create}>Criar e editar</Button></>}>
        <PatientPicker value={pat} onChange={setPat} required />
      </Dialog>
    </div>
  )
}

export function ProposalEditorPage() {
  const t = useTenant()
  const { proposalId } = useParams()
  const p = useCollection(t.tenantId, 'proposals').find((x) => x.id === proposalId)
  if (!t.can('orcamentos')) return <NoAccess what="orçamentos" />
  if (!p) return <EmptyState title="Orçamento não encontrado" action={<Link className="btn btn-secondary" to={`${t.base}/orcamentos`}>Voltar aos orçamentos</Link>} />
  return <Editor key={p.id} p={p} />
}

function Editor({ p }: { p: Proposal }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const toast = useToast()
  const confirm = useConfirm()
  const nav = useNavigate()
  const services = useCollection(t.tenantId, 'services').filter((s) => s.active)
  const patient = useCollection(t.tenantId, 'patients').find((x) => x.id === p.patientId)
  const persons = useCollection(t.tenantId, 'persons')
  const links = useCollection(t.tenantId, 'links')
  const charges = useCollection(t.tenantId, 'charges')
  const kits = useCollection(t.tenantId, 'serviceKits')
  const products = useCollection(t.tenantId, 'products')
  const versions = useCollection(t.tenantId, 'proposals').filter((x) => x.number === p.number).sort((a, b) => a.version - b.version)
  const [d, setD] = useState<Proposal>(p)
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [reply, setReply] = useState('')
  useEffect(() => { setD(p) }, [p])
  const editable = EDITABLE.includes(p.status) && t.can('orcamentos', 'update')
  const dirty = JSON.stringify(d) !== JSON.stringify(p)
  const discErr = validateDiscounts(d)
  const tot = proposalTotals(d)
  const supplies = d.items.reduce((a, i) => a + suppliesCost(i.serviceId, kits, services, products) * i.qty, 0)
  const cost = d.estimatedCostCents ?? 0
  const responsibles = persons.filter((x) => x.id === patient?.personId || links.some((l) => l.patientId === p.patientId && l.personId === x.id && l.canSeeFinancial))
  const link = `${location.origin}/c/${t.org.slug}/proposta/${p.token}`
  const linkedCharges = charges.filter((c) => p.chargeIds.includes(c.id))
  const expired = isExpired(p)

  const setItem = (id: string, patch: Partial<ProposalItem>) => setD({ ...d, items: d.items.map((i) => i.id === id ? { ...i, ...patch } : i) })
  const addItem = () => { const s = services[0]; if (!s) return; setD({ ...d, items: [...d.items, { id: uid('pi_'), serviceId: s.id, description: s.name, qty: 1, unitCents: s.priceCents, discountCents: 0 }] }) }
  const save = () => run(() => {
    if (!d.items.length) throw new Error('Inclua ao menos um item.')
    if (discErr.length) throw new Error(discErr.map((e) => e.message).join(' '))
    if (d.items.some((i) => !Number.isFinite(i.qty) || i.qty <= 0 || !Number.isInteger(i.unitCents) || i.unitCents < 0)) throw new Error('Quantidade e valor unitário devem ser válidos.')
    if (d.validUntil < todayCivil()) throw new Error('Validade não pode estar no passado.')
    const maxPol = getPolicies(t.tenantId, d.unitId).payments.maxInstallments
    if (d.maxInstallments < 1 || d.maxInstallments > maxPol) throw new Error(`Parcelamento máximo permitido pela política: ${maxPol}x.`)
    saveProposal(t.tenantId, { ...d, updatedAt: nowISO() })
  }, 'Orçamento salvo.')
  const send = () => run(() => {
    if (dirty) throw new Error('Salve as alterações antes de enviar.')
    if (!p.items.length) throw new Error('Inclua itens antes de enviar.')
    if (validateDiscounts(p).length) throw new Error('Corrija os descontos antes de enviar.')
    if (expired) throw new Error('Validade vencida: ajuste a validade.')
    db.update(t.tenantId, 'proposals', p.id, { status: 'enviada', history: [...p.history, { at: nowISO(), from: p.status, to: 'enviada', by: actor.name }] })
    const ref = p.financialResponsibleId ?? patient?.personId
    if (ref) notificationProvider.enqueue(t.tenantId, { event: 'proposta_disponivel', channel: 'email', recipientName: persons.find((x) => x.id === ref)?.name ?? patient?.name ?? '', recipientRef: ref, subject: `Sua proposta ${p.number} está disponível`, preview: 'Abra o link para ver itens, alternativas e condições.', dedupeKey: `proposta:${p.id}:v${p.version}`, link: `/c/${t.org.slug}/proposta/${p.token}` })
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'proposta.enviada', resource: 'proposals', resourceId: p.id })
  }, 'Proposta enviada (simulado) — mensagem na fila de comunicação.')
  const revoke = async () => {
    const r = await confirm({ title: 'Revogar proposta', body: 'O link deixa de aceitar respostas. Cobranças já geradas não são apagadas.', requireReason: true, danger: true, confirmLabel: 'Revogar' })
    if (r.ok) run(() => db.update(t.tenantId, 'proposals', p.id, { status: 'revogada', history: [...p.history, { at: nowISO(), from: p.status, to: 'revogada', by: actor.name, reason: r.reason }] }), 'Proposta revogada.')
  }
  const reject = async () => {
    const r = await confirm({ title: 'Registrar recusa do paciente', requireReason: true, danger: true, confirmLabel: 'Registrar recusa' })
    if (r.ok) run(() => rejectProposal(t.tenantId, p.id, actor.name, r.reason!), 'Recusa registrada.')
  }
  const version = () => { let id = ''; if (run(() => { id = newProposalVersion(t.tenantId, p.id, actor.name).id }, 'Nova versão criada; a anterior foi revogada.')) nav(`${t.base}/orcamentos/${id}`) }
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado.') } catch { toast('Não foi possível copiar. Selecione o link manualmente.', 'error') } }

  return (
    <div data-tour="page-content" className="com-page">
      <PageHeader title={`${p.number} · versão ${p.version}`} subtitle={patient?.name} breadcrumbs={[{ label: 'Orçamentos', to: `${t.base}/orcamentos` }, { label: `${p.number} v${p.version}` }]}
        actions={<>
          <StatusBadge map={PROPOSAL_STATUS} value={expired && ['rascunho', 'enviada', 'visualizada'].includes(p.status) ? 'expirada' : p.status} />
          {editable && <Button variant="primary" data-tour="primary-action" onClick={save} disabled={!dirty}>Salvar</Button>}
        </>} />
      <div className="stack">
        {!editable && p.status !== 'rascunho' && <Alert tone="neutral">Proposta {PROPOSAL_STATUS[p.status].label.toLowerCase()}: itens bloqueados. {p.chargeIds.length ? 'Já possui cobranças — para itens adicionais crie um novo orçamento.' : 'Para alterar, crie uma nova versão (a atual será revogada).'}</Alert>}
        <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Itens</h2>{editable && <Button size="sm" icon={<Plus />} onClick={addItem}>Adicionar item</Button>}</div>
          <div className="panel-body com-items">
            {d.items.length === 0 && <p className="muted small">Nenhum item.</p>}
            {d.items.map((i, k) => {
              const err = discErr.find((e) => e.message.includes(`"${i.description}"`))
              return (
                <fieldset key={i.id} className="com-item" disabled={!editable}>
                  <legend>Item {k + 1}{i.optionGroup ? ` · alternativa "${i.optionGroup}"` : ''}{i.optional ? ' · opcional' : ''}{p.acceptedItemIds.includes(i.id) ? ' · aceito' : ''}</legend>
                  <Field label="Serviço"><Select value={i.serviceId} onChange={(e) => { const s = services.find((x) => x.id === e.target.value)!; setItem(i.id, { serviceId: s.id, description: s.name, unitCents: s.priceCents }) }}>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                  <Field label="Descrição"><Input value={i.description} onChange={(e) => setItem(i.id, { description: e.target.value })} /></Field>
                  <Field label="Qtd."><Input type="number" min={1} step={1} value={i.qty} onChange={(e) => setItem(i.id, { qty: Math.max(1, Math.round(Number(e.target.value) || 1)) })} /></Field>
                  <Field label="Valor unitário (R$)"><MoneyInput value={i.unitCents} onChange={(c) => setItem(i.id, { unitCents: c ?? 0 })} /></Field>
                  <Field label="Desconto (R$)" hint={`Máx. ${d.maxDiscountPercent}% = ${formatBRL(Math.floor((i.qty * i.unitCents * d.maxDiscountPercent) / 100))}`} error={err?.message ?? null}><MoneyInput value={i.discountCents} onChange={(c) => setItem(i.id, { discountCents: c ?? 0 })} /></Field>
                  <Field label="Grupo de alternativas" hint="Mesmo nome = escolher apenas uma"><Input value={i.optionGroup ?? ''} onChange={(e) => setItem(i.id, { optionGroup: e.target.value.trim() || undefined, optional: e.target.value.trim() ? false : i.optional })} /></Field>
                  <Checkbox label="Opcional" checked={!!i.optional} disabled={!editable || !!i.optionGroup} onChange={(e) => setItem(i.id, { optional: e.target.checked })} />
                  <div className="strong right">{formatBRL(itemTotal(i))}</div>
                  {(editable || i.explanation) && <Field label="Explicação ao paciente" className="wide"><Textarea rows={2} value={i.explanation ?? ''} onChange={(e) => setItem(i.id, { explanation: e.target.value || undefined })} /></Field>}
                  {editable && <div className="wide row end"><Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setD({ ...d, items: d.items.filter((x) => x.id !== i.id) })}>Remover item</Button></div>}
                </fieldset>
              )
            })}
          </div>
        </section>

        <div className="grid grid-2">
          <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Condições</h2></div><div className="panel-body stack">
            <fieldset disabled={!editable} className="form-grid" style={{ border: 0, padding: 0 }}>
              <Field label="Validade"><Input type="date" value={d.validUntil} onChange={(e) => setD({ ...d, validUntil: e.target.value })} /></Field>
              <Field label="Parcelamento máximo" hint={`Política: até ${getPolicies(t.tenantId, d.unitId).payments.maxInstallments}x`}><Input type="number" min={1} value={d.maxInstallments} onChange={(e) => setD({ ...d, maxInstallments: Math.round(Number(e.target.value) || 1) })} /></Field>
              <Field label="Desconto máximo (%)"><Input type="number" min={0} max={100} value={d.maxDiscountPercent} onChange={(e) => setD({ ...d, maxDiscountPercent: Number(e.target.value) || 0 })} /></Field>
              <Field label="Responsável financeiro"><Select value={d.financialResponsibleId ?? ''} onChange={(e) => setD({ ...d, financialResponsibleId: e.target.value || undefined })}><option value="">Não definido</option>{responsibles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
            </fieldset>
            <Field label="Condições"><Textarea disabled={!editable} value={d.conditions} onChange={(e) => setD({ ...d, conditions: e.target.value })} /></Field>
          </div></section>
          <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Totais e margem estimada</h2></div><div className="panel-body stack">
            <dl className="com-dl">
              <dt>Bruto (itens base)</dt><dd>{formatBRL(tot.gross)}</dd>
              <dt>Descontos</dt><dd>− {formatBRL(tot.discount)}</dd>
              <dt className="total">Líquido</dt><dd className="total">{formatBRL(tot.net)}</dd>
              <dt>Custos previstos</dt><dd>{formatBRL(cost)}</dd>
              <dt>Margem estimada</dt><dd>{tot.net ? pct(marginPercent(tot.net, cost)) : '—'}</dd>
            </dl>
            <Field label="Custos previstos (R$)" hint={`Insumos das fichas técnicas: ${formatBRL(Math.round(supplies))}. Inclua laboratório e outros custos.`}>
              <MoneyInput value={d.estimatedCostCents ?? null} disabled={!editable} onChange={(c) => setD({ ...d, estimatedCostCents: c ?? undefined })} />
            </Field>
            {editable && <Button size="sm" onClick={() => setD({ ...d, estimatedCostCents: Math.round(supplies) })}>Usar custo dos insumos</Button>}
            <p className="small muted">Margem é estimativa gerencial (não considera impostos/taxas) e não é lucro contábil.</p>
          </div></section>
        </div>

        <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Envio, link e aceite</h2><SimBadge /></div><div className="panel-body stack">
          <Field label="Link do paciente" hint="Token opaco de demonstração. Produção: autenticação, expiração e revogação no servidor."><Input readOnly value={link} /></Field>
          <div className="row">
            {p.status === 'rascunho' && t.can('orcamentos', 'update') && <Button variant="primary" icon={<Send />} onClick={send}>Enviar ao paciente</Button>}
            <Button icon={<Copy />} onClick={copy}>Copiar link</Button>
            <a className="btn btn-secondary" href={`/c/${t.org.slug}/proposta/${p.token}`} target="_blank" rel="noreferrer">Abrir link</a>
            {!['revogada', 'recusada', 'expirada'].includes(p.status) && t.can('orcamentos', 'update') && <Button icon={<CheckCheck />} onClick={() => setAcceptOpen(true)}>Registrar aceite presencial</Button>}
            {['enviada', 'visualizada', 'rascunho'].includes(p.status) && t.can('orcamentos', 'update') && <Button icon={<XCircle />} onClick={reject}>Registrar recusa</Button>}
            {!p.chargeIds.length && p.status !== 'revogada' && t.can('orcamentos', 'update') && <Button icon={<GitBranch />} onClick={version}>Nova versão</Button>}
            {!['revogada', 'recusada'].includes(p.status) && t.can('orcamentos', 'update') && <Button variant="ghost" icon={<Ban />} onClick={revoke}>Revogar</Button>}
          </div>
          {linkedCharges.length > 0 && (
            <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
              <h3>Cobranças geradas ({linkedCharges.length})</h3>
              <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {linkedCharges.map((c) => <li key={c.id} className="row between" style={{ padding: '6px 0' }}><span className="small">{c.description} · venc. {formatCivil(c.dueDate)}</span><span className="row"><StatusBadge map={CHARGE_STATUS} value={c.status} /><strong className="num">{formatBRL(c.amountCents)}</strong></span></li>)}
              </ul>
              <p className="small muted">Repetir o aceite com os mesmos itens não gera novas cobranças; incluir item novo gera cobrança só da diferença.</p>
            </div>
          )}
        </div></section>

        <div className="grid grid-2">
          <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Perguntas do paciente</h2></div><div className="panel-body stack">
            {p.questions.length > 0 && <Timeline items={p.questions.map((q) => ({ time: formatDateTime(q.at), title: q.from === 'paciente' ? 'Paciente' : 'Clínica', body: q.text }))} />}
            {p.questions.length === 0 && <p className="small muted">Nenhuma pergunta.</p>}
            {t.can('orcamentos', 'update') && <>
              <Field label="Responder"><Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} /></Field>
              <Button onClick={() => { if (run(() => { if (!reply.trim()) throw new Error('Escreva a resposta.'); db.update(t.tenantId, 'proposals', p.id, { questions: [...p.questions, { id: uid('q_'), at: nowISO(), from: 'clinica', text: reply.trim() }] }) }, 'Resposta registrada e visível no link.')) setReply('') }}>Enviar resposta</Button>
            </>}
          </div></section>
          <section className="panel"><div className="panel-head"><h2 style={{ fontSize: 16 }}>Versões e histórico</h2></div><div className="panel-body stack">
            <div className="row">{versions.map((v) => <Link key={v.id} to={`${t.base}/orcamentos/${v.id}`} className="chip" aria-current={v.id === p.id ? 'page' : undefined} aria-pressed={v.id === p.id}>v{v.version} · {PROPOSAL_STATUS[v.status].label}</Link>)}</div>
            <Timeline items={[...p.history].reverse().map((h) => ({ time: formatDateTime(h.at), title: `${h.from ? PROPOSAL_STATUS[h.from].label + ' → ' : ''}${PROPOSAL_STATUS[h.to].label}`, body: [h.by, h.reason].filter(Boolean).join(' · ') }))} />
          </div></section>
        </div>
      </div>
      {acceptOpen && <AcceptDialog p={p} onClose={() => setAcceptOpen(false)} />}
    </div>
  )
}

function AcceptDialog({ p, onClose }: { p: Proposal; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const [sel, setSel] = useState<string[]>(p.acceptedItemIds.length ? p.acceptedItemIds : p.items.filter((i) => !i.optional && !i.optionGroup).map((i) => i.id))
  const [inst, setInst] = useState(Math.min(p.chosenInstallments ?? 1, p.maxInstallments))
  const [result, setResult] = useState<Charge[] | null>(null)
  const errs = validateSelection(p, sel)
  const newAmount = p.items.filter((i) => sel.includes(i.id) && !p.acceptedItemIds.includes(i.id)).reduce((a, i) => a + itemTotal(i), 0)
  const groups = useMemo(() => Array.from(new Set(p.items.filter((i) => i.optionGroup).map((i) => i.optionGroup!))), [p.items])
  const toggle = (id: string, on: boolean) => {
    const it = p.items.find((i) => i.id === id)!
    setSel((s) => on ? [...s.filter((x) => !it.optionGroup || p.items.find((i) => i.id === x)?.optionGroup !== it.optionGroup), id] : s.filter((x) => x !== id))
  }
  return (
    <Dialog open onClose={onClose} size="lg" title="Aceite presencial" description="Selecione os itens aceitos pelo paciente. Itens já aceitos não geram nova cobrança."
      footer={<><Button onClick={onClose}>Fechar</Button><Button variant="primary" disabled={errs.length > 0} onClick={() => run(() => { const r = acceptProposal(t.tenantId, p.id, sel, inst, actor.name); setResult(r.charges) })}>Confirmar aceite</Button></>}>
      <div className="stack">
        <SimBadge>Aceite demonstrativo — sem validade jurídica; cobrança simulada</SimBadge>
        <fieldset><legend>Itens</legend>
          {p.items.filter((i) => !i.optionGroup).map((i) => <Checkbox key={i.id} label={`${i.description} — ${formatBRL(itemTotal(i))}${i.optional ? ' (opcional)' : ''}${p.acceptedItemIds.includes(i.id) ? ' · já aceito' : ''}`} checked={sel.includes(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} />)}
        </fieldset>
        {groups.map((g) => (
          <fieldset key={g}><legend>Alternativas: {g} (escolha uma)</legend>
            {p.items.filter((i) => i.optionGroup === g).map((i) => (
              <label key={i.id} className="check"><input type="radio" name={`g-${g}`} checked={sel.includes(i.id)} onChange={() => toggle(i.id, true)} /><span>{i.description} — {formatBRL(itemTotal(i))}{i.explanation ? <span className="small muted"> · {i.explanation}</span> : null}</span></label>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setSel((s) => s.filter((x) => p.items.find((i) => i.id === x)?.optionGroup !== g))}>Nenhuma alternativa</Button>
          </fieldset>
        ))}
        <div className="form-grid">
          <Field label="Parcelas"><Select value={inst} onChange={(e) => setInst(Number(e.target.value))}>{Array.from({ length: p.maxInstallments }, (_, i) => <option key={i} value={i + 1}>{i + 1}x</option>)}</Select></Field>
          <div className="stack" style={{ '--gap': '2px' } as React.CSSProperties}><span className="small muted">Novo valor a cobrar</span><strong className="num">{formatBRL(newAmount)}</strong>{newAmount > 0 && <span className="small muted">{splitInstallments(newAmount, inst).map(formatBRL).join(' + ')}</span>}</div>
        </div>
        {errs.length > 0 && <Alert tone="warning">{errs.map((e) => e.message).join(' ')}</Alert>}
        {result && (
          <Alert tone="success" title={result.length ? `${result.length} cobrança(s) gerada(s)` : 'Nenhuma cobrança nova'}>
            {result.length ? result.map((c) => `${c.description}: ${formatBRL(c.amountCents)} (venc. ${formatCivil(c.dueDate)})`).join(' · ') : 'Os itens selecionados já estavam cobrados — o aceite foi atualizado sem duplicar cobrança.'}
          </Alert>
        )}
        {result && <Badge tone="info">Status atual: {PROPOSAL_STATUS[db.get(t.tenantId, 'proposals', p.id)!.status].label}</Badge>}
      </div>
    </Dialog>
  )
}
