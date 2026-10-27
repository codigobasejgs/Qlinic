// Componentes compartilhados do portal e das páginas públicas da clínica:
// seletor de horários, pagamento simulado (online + Pix manual), experiência de proposta.
import { useEffect, useMemo, useState } from 'react'
import { CreditCard, QrCode, Receipt, Send, XCircle, CheckCircle2 } from 'lucide-react'
import type { Charge, ID, Organization, PaymentMethod, Proposal, Service, SignatureFlow } from '@/domain/types'
import { PAYMENT_METHOD_LABEL } from '@/domain/types'
import { db, useCollection } from '@/data/store'
import { availableSlots, BLOCKING, type Slot } from '@/domain/scheduling'
import { getPolicies } from '@/domain/settings'
import { getSimScenario, setSimScenario, simulateOnlinePayment, submitPixReceipt, type SimScenario } from '@/domain/payments'
import { acceptProposal, isExpired, itemTotal, proposalTotals, rejectProposal, validateSelection } from '@/domain/proposals'
import { chargeBalance } from '@/data/repositories'
import { Alert, Badge, Button, Checkbox, Field, Input, Select, SimBadge, Textarea, EmptyState } from '@/ui/core'
import { useConfirm, useToast, useAction } from '@/ui/overlay'
import { FileUpload, SignaturePad } from '@/ui/widgets'
import { ClinicLogo } from '@/ui/brand'
import { useNetworkStatus } from '@/pwa/client'
import { QRCode } from '@/modules/scheduling/qr'
import { addDaysCivil, formatCivil, formatDateLong, formatDateTime, formatTime, nowISO, todayCivil } from '@/lib/dates'
import { formatBRL, splitInstallments } from '@/lib/money'
import { downloadText, uid } from '@/lib/util'
import { chooseAlternative, defaultSelection, isMandatory, optionGroups, toggleItem } from './lib'

export const OFFLINE_HINT = 'Sem conexão: nada é confirmado offline. Reconecte-se para continuar.'
export function requireOnline(online: boolean) {
  if (!online || !navigator.onLine) throw new Error(OFFLINE_HINT)
}

// ---------- Horários ----------
export function useSlotFinder(tenantId: ID, unitId: ID | null, service: Service | undefined, professionalId: ID | null, date: string, patientId?: ID, ignoreId?: ID) {
  const units = useCollection(tenantId, 'units')
  const pros = useCollection(tenantId, 'professionals')
  const resources = useCollection(tenantId, 'resources')
  const appts = useCollection(tenantId, 'appointments')
  const settings = useCollection(tenantId, 'settings')
  const pol = useMemo(() => getPolicies(tenantId, unitId).booking, [tenantId, unitId, settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const unit = units.find((u) => u.id === unitId)
  const today = todayCivil(unit?.timezone)
  const min = today
  const max = addDaysCivil(today, pol.maxAdvanceDays)
  const { slots, nextDate } = useMemo(() => {
    const compute = (d: string): Slot[] => {
      if (!unit || !service || d < min || d > max) return []
      const now = new Date()
      const earliest = now.getTime() + pol.minAdvanceHours * 3_600_000
      // Sem o próprio agendamento em reagendamento; sem sobrepor outra consulta do mesmo paciente.
      const others = appts.filter((x) => x.id !== ignoreId)
      const own = patientId ? others.filter((x) => x.patientId === patientId && BLOCKING.includes(x.status)) : []
      const list = availableSlots({ date: d, unit, service, professionals: pros.filter((p) => !professionalId || p.id === professionalId), resources, appointments: others, stepMin: pol.slotStepMin, now })
        .filter((s) => new Date(s.start).getTime() >= earliest && !own.some((x) => x.start < s.end && s.start < x.end))
      if (professionalId) return list
      const seen = new Set<string>()
      return list.filter((s) => (seen.has(s.start) ? false : (seen.add(s.start), true)))
    }
    const slots = compute(date)
    // Próxima data com horário (até 21 dias à frente) quando a escolhida não tem.
    let nextDate: string | null = null
    if (!slots.length && unit && service) for (let i = 1; i <= 21 && !nextDate; i++) { const d = addDaysCivil(date < min ? min : date, i); if (d > max) break; if (compute(d).length) nextDate = d }
    return { slots, nextDate }
  }, [unit, service, professionalId, date, min, max, pol, pros, resources, appts, patientId, ignoreId])
  return { slots, min, max, nextDate, unit, pol, pros }
}

export function SlotPicker({ tenantId, unitId, service, professionalId, date, onDate, value, onPick, patientId, ignoreId }: {
  tenantId: ID; unitId: ID | null; service?: Service; professionalId: ID | null; date: string; onDate: (d: string) => void; value: Slot | null; onPick: (s: Slot) => void; patientId?: ID; ignoreId?: ID
}) {
  const { slots, min, max, nextDate, unit, pol, pros } = useSlotFinder(tenantId, unitId, service, professionalId, date, patientId, ignoreId)
  const tz = unit?.timezone
  return (
    <div className="stack" style={{ '--gap': '12px' } as React.CSSProperties}>
      <Field label="Data" hint={`Agendamento com no mínimo ${pol.minAdvanceHours} h de antecedência e até ${pol.maxAdvanceDays} dias à frente.`}>
        <Input type="date" value={date} min={min} max={max} onChange={(e) => onDate(e.target.value)} />
      </Field>
      {!service || !unit ? <p className="muted small">Escolha o serviço e a unidade para ver os horários.</p> : (
        <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <h2 className="small strong" id="slots-h" style={{ fontSize: 14 }}>Horários em {date ? formatDateLong(`${date}T15:00:00Z`, 'UTC') : '—'} <span className="muted">(fuso da unidade)</span></h2>
          {slots.length === 0 ? (
            <div className="muted-surface small" role="status">
              Nenhum horário disponível nesta data.
              {nextDate && <> <Button size="sm" variant="link" onClick={() => onDate(nextDate!)}>Ver {formatCivil(nextDate)}</Button></>}
            </div>
          ) : (
            <div className="pt-slots" role="radiogroup" aria-labelledby="slots-h">
              {slots.map((s) => {
                const sel = value?.start === s.start && value.professionalId === s.professionalId
                return (
                  <button key={`${s.start}-${s.professionalId}`} type="button" role="radio" aria-checked={sel} className="pt-slot" onClick={() => onPick(s)}>
                    <span className="strong">{formatTime(s.start, tz)}</span>
                    {professionalId ? null : <span className="tiny muted truncate">{pros.find((p) => p.id === s.professionalId)?.name.split(' ').slice(0, 2).join(' ')}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Pagamento simulado ----------
const ONLINE: PaymentMethod[] = ['pix', 'cartao_credito', 'cartao_debito', 'boleto', 'link_pagamento']
const SCENARIOS: { value: SimScenario; label: string }[] = [
  { value: 'sucesso', label: 'Aprovado' }, { value: 'falha', label: 'Recusado' }, { value: 'timeout', label: 'Tempo esgotado' }, { value: 'webhook_duplicado', label: 'Webhook duplicado' },
]

export function receiptText(org: Organization, c: Charge, payerName: string) {
  const paid = c.payments.filter((p) => p.status === 'confirmado')
  return [
    `RECIBO DEMONSTRATIVO — SEM VALIDADE FISCAL`, '', org.name, `CNPJ (fictício): ${org.document}`, '',
    `Recebemos de: ${payerName}`, `Referente a: ${c.description}`, `Valor da cobrança: ${formatBRL(c.amountCents + c.adjustmentsCents)}`, '',
    ...paid.map((p) => `• ${formatDateTime(p.at)} — ${formatBRL(p.amountCents)} via ${PAYMENT_METHOD_LABEL[p.method]} (simulado)`), '',
    `Gerado em ${formatDateTime(nowISO())} pelo portal. Documento de demonstração: nenhum valor real foi cobrado.`,
  ].join('\n')
}

export function PayPanel({ org, chargeId, by, payerName }: { org: Organization; chargeId: ID; by: string; payerName: string }) {
  const charges = useCollection(org.id, 'charges')
  const charge = charges.find((c) => c.id === chargeId)
  const online = useNetworkStatus()
  const toast = useToast()
  const act = useAction()
  const allowed = getPolicies(org.id, charge?.unitId).payments.allowedMethods
  const methods = ONLINE.filter((m) => allowed.includes(m))
  const pixManual = allowed.includes('pix_manual')
  const [tab, setTab] = useState<'online' | 'pix'>(methods.length ? 'online' : 'pix')
  const [method, setMethod] = useState<PaymentMethod>(methods[0] ?? 'pix')
  const [scenario, setScenario] = useState<SimScenario>(getSimScenario())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [receipt, setReceipt] = useState<{ name: string; mime: string; size: number; dataUrl: string } | null>(null)
  if (!charge) return <Alert tone="danger">Cobrança não encontrada.</Alert>
  const balance = chargeBalance(charge)
  const pending = charge.payments.filter((p) => p.status === 'pendente_aprovacao')
  if (charge.status === 'cancelada' || charge.status === 'estornada') return <Badge>{charge.status === 'cancelada' ? 'Cancelada' : 'Estornada'}</Badge>
  if (balance <= 0) return (
    <div className="row">
      <Badge tone="success">Paga</Badge>
      <Button size="sm" icon={<Receipt />} onClick={() => downloadText(`recibo-${charge.id}.txt`, receiptText(org, charge, payerName))}>Baixar recibo</Button>
    </div>
  )
  const pay = async () => {
    setBusy(true); setResult(null); setSimScenario(scenario)
    try {
      requireOnline(online)
      if (!allowed.includes(method)) throw new Error('Método não permitido pela clínica.')
      const r = await simulateOnlinePayment(org.id, charge.id, method)
      setResult(r)
      toast(r.message, r.ok ? 'ok' : 'error')
    } catch (e) { const m = e instanceof Error ? e.message : String(e); setResult({ ok: false, message: m }); toast(m, 'error') }
    finally { setBusy(false) }
  }
  const sendPix = () => {
    if (!receipt) return
    act(() => {
      submitPixReceipt(org.id, charge.id, balance, by)
      // Comprovante guardado como arquivo do paciente (não confiável; revisão humana).
      db.insert(org.id, 'files', { id: uid('file_'), tenantId: org.id, createdAt: nowISO(), patientId: charge.patientId, category: 'documento', name: `Comprovante Pix — ${receipt.name}`, mime: receipt.mime, sizeBytes: receipt.size, versions: [{ version: 1, at: nowISO(), by, dataUrl: receipt.dataUrl, note: `Comprovante enviado pelo portal para a cobrança ${charge.id}` }], restricted: false })
      setReceipt(null)
    }, 'Comprovante enviado. A clínica confere e aprova manualmente.')
  }
  return (
    <div className="stack pt-pay" style={{ '--gap': '12px' } as React.CSSProperties}>
      <div className="row between"><span>Saldo em aberto: <strong className="num">{formatBRL(balance)}</strong></span><SimBadge /></div>
      {pending.length > 0 && <Alert tone="warning" title="Comprovante em análise">Pix manual de {formatBRL(pending.reduce((a, p) => a + p.amountCents, 0))} aguardando aprovação da clínica. Isso não é confirmação bancária.</Alert>}
      <div className="segmented" role="group" aria-label="Forma de pagamento">
        {methods.length > 0 && <button type="button" aria-pressed={tab === 'online'} onClick={() => setTab('online')}><CreditCard size={16} aria-hidden="true" /> Online</button>}
        {pixManual && <button type="button" aria-pressed={tab === 'pix'} onClick={() => setTab('pix')}><QrCode size={16} aria-hidden="true" /> Pix manual</button>}
      </div>
      {tab === 'online' && methods.length > 0 && (
        <div className="stack" style={{ '--gap': '12px' } as React.CSSProperties}>
          <div className="form-grid">
            <Field label="Método"><Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{methods.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}</Select></Field>
            <Field label="Cenário da simulação" hint="Só para demonstração: escolha o retorno do provedor."><Select value={scenario} onChange={(e) => setScenario(e.target.value as SimScenario)}>{SCENARIOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
          </div>
          <p className="small muted">O pagamento só é considerado confirmado após o aviso (webhook) do provedor. Voltar do checkout (redirect) não é prova de pagamento. Repetir usa a mesma chave de idempotência e não gera cobrança em dobro.</p>
          <Button variant="primary" icon={<CreditCard />} loading={busy} disabled={!online || busy} onClick={pay} data-tour="primary-action">Pagar {formatBRL(balance)} (simulado)</Button>
          {!online && <p className="small" role="status">{OFFLINE_HINT}</p>}
          <div aria-live="polite">{result && <Alert tone={result.ok ? 'success' : 'warning'} title={result.ok ? 'Pagamento confirmado (simulado)' : 'Pagamento não confirmado'}>{result.message}{!result.ok && ' Nenhum valor foi registrado como pago.'}</Alert>}</div>
        </div>
      )}
      {tab === 'pix' && pixManual && (
        <div className="stack" style={{ '--gap': '12px' } as React.CSSProperties}>
          <div className="row" style={{ alignItems: 'flex-start', '--gap': '16px' } as React.CSSProperties}>
            <QRCode value={`PIX-DEMONSTRATIVO-${charge.id}`} size={136} label="QR Code Pix demonstrativo — não pagável" />
            <div className="stack grow" style={{ '--gap': '6px', minWidth: 200 } as React.CSSProperties}>
              <p className="small">QR <strong>demonstrativo</strong>: não corresponde a nenhuma chave real e não pode ser pago.</p>
              <p className="small muted">{getPolicies(org.id, charge.unitId).payments.receivingAccountLabel}</p>
              <p className="small muted">Depois de pagar, envie o comprovante. Ele fica pendente até a clínica conferir — não é confirmação bancária automática.</p>
            </div>
          </div>
          {pending.length ? null : (
            <>
              <FileUpload accept={['image/png', 'image/jpeg', 'application/pdf']} maxMb={2} label="Selecionar comprovante" onFile={setReceipt} hint="PNG, JPG ou PDF até 2 MB. Use apenas arquivos fictícios." />
              {receipt && <p className="small" role="status">Selecionado: {receipt.name}</p>}
              <Button variant="primary" icon={<Send />} disabled={!receipt || !online} onClick={sendPix}>Enviar comprovante de {formatBRL(balance)}</Button>
              {!online && <p className="small" role="status">{OFFLINE_HINT}</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Proposta ----------
function signatureFlow(signer: string, method: 'rubrica_demo' | 'aceite_demo'): SignatureFlow {
  const at = nowISO()
  return { status: 'assinado', provider: 'demonstracao', signers: [{ name: signer, role: 'Paciente/Responsável', order: 1, status: 'assinado', at, method }], trail: [{ at, event: `Aceite registrado por ${signer} (${method === 'rubrica_demo' ? 'rubrica' : 'nome digitado'}) — assinatura demonstrativa` }] }
}

/** Disponível para interação? Mensagem genérica (sem dados) quando não. */
export function proposalAvailable(p: Proposal | undefined): boolean {
  if (!p) return false
  if (['rascunho', 'revogada'].includes(p.status)) return false
  return p.status !== 'expirada' && !isExpired(p)
}

export function ProposalExperience({ org, proposalId, by, signerName }: { org: Organization; proposalId: ID; by: string; signerName: string }) {
  const proposals = useCollection(org.id, 'proposals')
  const charges = useCollection(org.id, 'charges')
  const pros = useCollection(org.id, 'professionals')
  const p = proposals.find((x) => x.id === proposalId)
  const online = useNetworkStatus()
  const confirm = useConfirm()
  const act = useAction()
  const [selected, setSelected] = useState<ID[]>(() => (p ? defaultSelection(p) : []))
  const [inst, setInst] = useState(1)
  const [question, setQuestion] = useState('')
  const [signing, setSigning] = useState(false)
  const [generated, setGenerated] = useState<Charge[] | null>(null)

  // Abrir o link marca como visualizada (uma vez).
  useEffect(() => {
    if (p?.status === 'enviada') db.update(org.id, 'proposals', p.id, (prev) => prev.status !== 'enviada' ? prev : { ...prev, status: 'visualizada', history: [...prev.history, { at: nowISO(), from: 'enviada', to: 'visualizada', by }] })
  }, [p?.status, p?.id, org.id, by])

  const groups = useMemo(() => (p ? optionGroups(p) : []), [p])
  if (!p) return <EmptyState title="Proposta indisponível" />
  const accepted = p.status === 'aceita' || p.status === 'aceita_parcial'
  // Aceita (total) ainda permite aprovar opcionais restantes enquanto válida; só recusada/expirada fecha.
  const closed = p.status === 'recusada' || isExpired(p)
  const totals = proposalTotals(p, selected)
  const newIds = selected.filter((id) => !p.acceptedItemIds.includes(id))
  const newAmount = p.items.filter((i) => newIds.includes(i.id)).reduce((a, i) => a + itemTotal(i), 0)
  const preview = newAmount > 0 ? splitInstallments(newAmount, inst) : []
  const errors = validateSelection(p, newIds.length ? selected : [])
  const pro = pros.find((x) => x.id === p.professionalId)
  const myCharges = charges.filter((c) => p.chargeIds.includes(c.id)).sort((a, b) => a.installment.n - b.installment.n || a.createdAt.localeCompare(b.createdAt))
  const firstOpen = myCharges.find((c) => chargeBalance(c) > 0 && c.status !== 'cancelada')
  const locked = (id: ID) => p.acceptedItemIds.includes(id) || closed

  const sign = (r: { method: 'rubrica_demo' | 'aceite_demo'; typedName?: string }) => {
    act(() => {
      const res = acceptProposal(org.id, p.id, selected, inst, by, signatureFlow(r.typedName ?? signerName, r.method))
      setGenerated(res.charges)
      setSigning(false)
    }, 'Aceite registrado.')
  }
  const reject = async () => {
    const r = await confirm({ title: 'Recusar proposta?', body: 'A clínica será informada. Você pode pedir uma nova proposta depois.', confirmLabel: 'Recusar proposta', danger: true, requireReason: true, reasonLabel: 'Motivo da recusa' })
    if (r.ok && r.reason) act(() => rejectProposal(org.id, p.id, by, r.reason!), 'Proposta recusada.')
  }
  const ask = () => {
    const text = question.trim()
    if (text.length < 3) return
    act(() => { db.update(org.id, 'proposals', p.id, (prev) => ({ ...prev, questions: [...prev.questions, { id: uid('q_'), at: nowISO(), from: 'paciente', text }] })); setQuestion('') }, 'Pergunta enviada à clínica.')
  }
  const statusBadge = { enviada: <Badge tone="info">Enviada</Badge>, visualizada: <Badge tone="info">Visualizada</Badge>, aceita: <Badge tone="success">Aceita</Badge>, aceita_parcial: <Badge tone="success">Aceita parcialmente</Badge>, recusada: <Badge tone="danger">Recusada</Badge> }[p.status as 'enviada'] ?? <Badge>{p.status}</Badge>

  return (
    <div className="stack" data-tour="page-content">
      <div className="panel"><div className="panel-body stack" style={{ '--gap': '8px' } as React.CSSProperties}>
        <div className="row between"><ClinicLogo org={org} height={32} />{statusBadge}</div>
        <h1 style={{ fontSize: 22 }}>Proposta {p.number} <span className="muted small">versão {p.version}</span></h1>
        <p className="small muted">Válida até {formatCivil(p.validUntil)}{pro ? ` · ${pro.name}` : ''} · até {p.maxInstallments}x</p>
        <p className="small">{p.conditions}</p>
      </div></div>

      <section className="panel" aria-labelledby="pi-h">
        <div className="panel-head"><h2 id="pi-h" style={{ fontSize: 16 }}>Itens</h2><span className="small muted">Marque o que deseja aprovar</span></div>
        <div className="panel-body stack">
          {p.items.filter(isMandatory).map((i) => (
            <div key={i.id} className="pt-item">
              <Checkbox checked={selected.includes(i.id)} disabled={locked(i.id)} onChange={(e) => setSelected(toggleItem(p, selected, i.id, e.target.checked))}
                label={<span className="row between" style={{ width: '100%' }}><span>{i.description}</span><ItemPrice cents={itemTotal(i)} discount={i.discountCents} /></span>}
                hint={i.explanation ?? (p.acceptedItemIds.includes(i.id) ? 'Já aprovado.' : 'Recomendado pelo profissional. Desmarque para aprovar só parte.')} />
            </div>
          ))}
          {groups.map((g) => {
            const chosen = selected.find((id) => g.items.some((i) => i.id === id)) ?? ''
            const done = g.items.some((i) => p.acceptedItemIds.includes(i.id))
            return (
              <fieldset key={g.group} className="pt-group">
                <legend>Escolha uma alternativa</legend>
                {g.items[0].explanation && <p className="small muted">{g.items[0].explanation}</p>}
                {g.items.map((i) => (
                  <label key={i.id} className="check">
                    <input type="radio" name={`grp-${g.group}`} checked={chosen === i.id} disabled={done || closed} onChange={() => setSelected(chooseAlternative(p, selected, g.group, i.id))} />
                    <span className="row between grow"><span>{i.description}</span><ItemPrice cents={itemTotal(i)} discount={i.discountCents} /></span>
                  </label>
                ))}
                {!done && !closed && <label className="check"><input type="radio" name={`grp-${g.group}`} checked={!chosen} onChange={() => setSelected(chooseAlternative(p, selected, g.group, null))} /><span>Decidir depois</span></label>}
              </fieldset>
            )
          })}
          {p.items.filter((i) => i.optional && !i.optionGroup).map((i) => (
            <div key={i.id} className="pt-item">
              <Checkbox checked={selected.includes(i.id)} disabled={locked(i.id)} onChange={(e) => setSelected(toggleItem(p, selected, i.id, e.target.checked))}
                label={<span className="row between" style={{ width: '100%' }}><span>{i.description} <Badge plain>Opcional</Badge></span><ItemPrice cents={itemTotal(i)} discount={i.discountCents} /></span>} hint={i.explanation} />
            </div>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="pt-h">
        <div className="panel-head"><h2 id="pt-h" style={{ fontSize: 16 }}>Resumo</h2><SimBadge /></div>
        <div className="panel-body stack" aria-live="polite">
          <dl className="pt-totals">
            <div><dt>Subtotal</dt><dd className="num">{formatBRL(totals.gross)}</dd></div>
            <div><dt>Descontos</dt><dd className="num">− {formatBRL(totals.discount)}</dd></div>
            <div className="strong"><dt>Total selecionado</dt><dd className="num">{formatBRL(totals.net)}</dd></div>
            {p.acceptedItemIds.length > 0 && <div><dt>Novos itens a aprovar</dt><dd className="num">{formatBRL(newAmount)}</dd></div>}
          </dl>
          {!closed && newAmount > 0 && (
            <>
              <Field label="Parcelamento"><Select value={inst} onChange={(e) => setInst(Number(e.target.value))}>{Array.from({ length: p.maxInstallments }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n}x de {formatBRL(splitInstallments(newAmount, n)[n - 1])}{n > 1 && splitInstallments(newAmount, n)[0] !== splitInstallments(newAmount, n)[n - 1] ? ' (1ª ajustada)' : ''}</option>)}</Select></Field>
              <ol className="small pt-inst">{preview.map((v, k) => <li key={k}>Parcela {k + 1}: <span className="num">{formatBRL(v)}</span> — vence em {formatCivil(addDaysCivil(todayCivil(), k * 30))}</li>)}</ol>
            </>
          )}
          {errors.length > 0 && newIds.length > 0 && <Alert tone="warning">{errors.map((e) => e.message).join(' ')}</Alert>}
          {!closed && (
            signing ? (
              <div className="stack">
                <p className="small">Ao aceitar, você aprova {newIds.length} item(ns) totalizando {formatBRL(newAmount)} em {inst}x. As cobranças são geradas uma única vez.</p>
                {online ? <SignaturePad signerName={signerName} onSign={sign} /> : <p className="small" role="status">{OFFLINE_HINT}</p>}
                <Button onClick={() => setSigning(false)}>Voltar</Button>
              </div>
            ) : (
              <div className="row">
                <Button variant="primary" icon={<CheckCircle2 />} data-tour="primary-action" disabled={!online || newIds.length === 0 || errors.length > 0} onClick={() => setSigning(true)}>{accepted ? 'Aprovar itens adicionais' : 'Aceitar e assinar'}</Button>
                {!accepted && <Button variant="danger" icon={<XCircle />} disabled={!online} onClick={reject}>Recusar</Button>}
                {!online && <span className="small" role="status">{OFFLINE_HINT}</span>}
              </div>
            )
          )}
          {p.status === 'recusada' && <Alert tone="neutral" title="Proposta recusada">{p.history.at(-1)?.reason ? `Motivo informado: ${p.history.at(-1)!.reason}` : null}</Alert>}
        </div>
      </section>

      {(generated || myCharges.length > 0) && (
        <section className="panel" aria-labelledby="pc-h">
          <div className="panel-head"><h2 id="pc-h" style={{ fontSize: 16 }}>Cobranças desta proposta</h2></div>
          <div className="panel-body stack">
            {generated && <Alert tone="success" title="Aceite registrado">{generated.length ? `${generated.length} cobrança(s) gerada(s).` : 'Nenhuma cobrança nova: os itens já tinham cobrança gerada (sem duplicidade).'}</Alert>}
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, '--gap': '6px' } as React.CSSProperties}>
              {myCharges.map((c) => <li key={c.id} className="row between small"><span>{c.description} · vence {formatCivil(c.dueDate)}</span><span className="row"><span className="num strong">{formatBRL(c.amountCents)}</span><ChargeBadge c={c} /></span></li>)}
            </ul>
            {firstOpen && (
              <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
                <h3 style={{ fontSize: 15 }}>Pagar {firstOpen.installment.n === 1 ? '1ª parcela' : 'próxima parcela'}</h3>
                <PayPanel org={org} chargeId={firstOpen.id} by={by} payerName={signerName} />
              </div>
            )}
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="pq-h">
        <div className="panel-head"><h2 id="pq-h" style={{ fontSize: 16 }}>Perguntas</h2></div>
        <div className="panel-body stack">
          {p.questions.length === 0 ? <p className="small muted">Nenhuma pergunta ainda.</p> : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, '--gap': '8px' } as React.CSSProperties}>
              {p.questions.map((q) => <li key={q.id} className="muted-surface small"><strong>{q.from === 'paciente' ? 'Você' : org.name}</strong> · {formatDateTime(q.at)}<br />{q.text}</li>)}
            </ul>
          )}
          <Field label="Enviar pergunta à clínica" hint="Não inclua dados de saúde sensíveis; a clínica responde pelo portal ou contato.">
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={600} />
          </Field>
          <Button icon={<Send />} disabled={question.trim().length < 3} onClick={ask} style={{ alignSelf: 'flex-start' }}>Enviar pergunta</Button>
        </div>
      </section>
    </div>
  )
}

function ItemPrice({ cents, discount }: { cents: number; discount: number }) {
  return <span className="num nowrap-text strong">{formatBRL(cents)}{discount > 0 && <span className="tiny muted"> (−{formatBRL(discount)})</span>}</span>
}

export function ChargeBadge({ c }: { c: Charge }) {
  const pend = c.payments.some((p) => p.status === 'pendente_aprovacao')
  if (pend && chargeBalance(c) > 0) return <Badge tone="warning">Comprovante em análise</Badge>
  const map: Record<Charge['status'], [string, 'success' | 'warning' | 'danger' | 'info' | 'neutral']> = { aberta: ['Em aberto', 'info'], parcial: ['Parcial', 'warning'], paga: ['Paga', 'success'], vencida: ['Vencida', 'danger'], cancelada: ['Cancelada', 'neutral'], estornada: ['Estornada', 'neutral'] }
  const [l, t] = map[c.status]
  return <Badge tone={t}>{l}</Badge>
}

export function NoPermission({ what }: { what: string }) {
  return <EmptyState title="Sem permissão neste vínculo">Seu vínculo com este paciente não inclui acesso a {what}. Se precisar, peça à clínica a revisão das permissões em Perfil → Falar com a equipe.</EmptyState>
}
