// /odontologia — abas: odontograma, plano/orçamento, periodontograma, ortodontia, laboratório, imagens, esterilização.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { CheckCircle2, FilePlus2, Plus, Undo2 } from 'lucide-react'
import type { Proposal, TreatmentItem } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit, saveProposal } from '@/data/repositories'
import { getPolicies } from '@/domain/settings'
import { Alert, Badge, Button, ButtonLink, Checkbox, Field, Input, PageHeader, Section, Segmented, Select, Tabs, TabPanel, Textarea, useAction, useConfirm, useLookup, usePatientParam, type Tone } from '@/ui'
import { addDaysCivil, formatCivil, nowISO, todayCivil } from '@/lib/dates'
import { formatBRL } from '@/lib/money'
import { uid } from '@/lib/util'
import './types'
import type { Face, MarkState, OdontogramEntry, ToothCondition } from './types'
import { CONDITIONS, FACES, STATE_LABEL, activeEntries, conditionDef, dentitionRows, faceCode, faceLabel, facesCode, normalizeFaces, quadrantLabel, quadrantOf, toothName, validateEntry, type Dentition } from './odonto'
import { COND_COLOR, Odontogram, OdontogramLegend } from './Odontogram'
import { ChoosePatient, NoAccess, PatientBar, ReadOnlyNotice, S, useClinicalAccess, patientIdAllowed, clinicalOwned } from './common'
import { ImagesTab, LabTab, OrthoTab, PerioTab, SterilizationTab } from './DentalTabs'

export const TI_STATUS: Record<TreatmentItem['status'], { label: string; tone: Tone }> = {
  planejado: { label: 'Planejado', tone: 'info' }, orcado: { label: 'Orçado', tone: 'warning' }, aprovado: { label: 'Aprovado', tone: 'success' },
  em_execucao: { label: 'Em execução', tone: 'brand' }, concluido: { label: 'Concluído', tone: 'success' }, cancelado: { label: 'Cancelado', tone: 'neutral' }, recusado: { label: 'Recusado', tone: 'danger' },
}

export function OdontologyPage() {
  const t = useTenant()
  const acc = useClinicalAccess()
  const [patientId, setPatientId] = usePatientParam()
  const [tab, setTab] = useState('odontograma')
  if (!t.moduleOn('odontologia')) return <><PageHeader title="Odontologia" /><NoAccess what="o módulo de Odontologia (desligado neste plano)" resource="módulo Odontologia" /></>
  const tabs = [
    { id: 'odontograma', label: 'Odontograma' }, { id: 'plano', label: 'Plano e orçamento' }, { id: 'perio', label: 'Periodontograma' },
    { id: 'orto', label: 'Ortodontia' }, { id: 'lab', label: 'Próteses/laboratório' }, { id: 'imagens', label: 'Imagens' }, { id: 'esterilizacao', label: 'Esterilização' },
  ]
  const patientTabs = ['odontograma', 'plano', 'perio', 'imagens']
  return (
    <>
      <PageHeader title="Odontologia" subtitle="Odontograma, plano de tratamento, periodonto, ortodontia, laboratório, imagens e esterilização." breadcrumbs={[{ label: 'Início', to: t.base }, { label: 'Odontologia' }]} />
      <div className="stack" data-tour="page-content">
        {!acc.canRead ? <NoAccess what="dados clínicos odontológicos" resource="prontuário (leitura clínica)" /> : (
          <>
            <PatientBar value={patientId} onChange={setPatientId} />
            <Tabs label="Seções de odontologia" tabs={tabs} value={tab} onChange={setTab} />
            <div key={`${t.tenantId}-${t.effectiveUser?.id}-${patientId}-${t.unitId}`}><TabPanel>
              {patientId && !patientIdAllowed(t, patientId) ? <NoAccess what="este paciente (inexistente ou fora da unidade)" resource="paciente da unidade permitida" /> : patientTabs.includes(tab) && !patientId ? <ChoosePatient /> : (
                <>
                  {tab === 'odontograma' && <OdontogramTab patientId={patientId!} onPlan={() => setTab('plano')} />}
                  {tab === 'plano' && <PlanTab patientId={patientId!} />}
                  {tab === 'perio' && <PerioTab patientId={patientId!} />}
                  {tab === 'orto' && <OrthoTab patientId={patientId} />}
                  {tab === 'lab' && <LabTab patientId={patientId} />}
                  {tab === 'imagens' && <ImagesTab patientId={patientId!} />}
                  {tab === 'esterilizacao' && <SterilizationTab />}
                </>
              )}
            </TabPanel></div>
          </>
        )}
      </div>
    </>
  )
}

// ======================= Odontograma =======================
function OdontogramTab({ patientId, onPlan }: { patientId: string; onPlan: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const acc = useClinicalAccess()
  const run = useAction()
  const confirm = useConfirm()
  const L = useLookup()
  const all = useCollection(t.tenantId, 'odontogramEntries')
  const entries = useMemo(() => all.filter((e) => e.patientId === patientId && (acc.scope !== 'own' || e.professionalId === acc.professionalId)), [all, patientId, acc.scope, acc.professionalId])
  const [dentition, setDentition] = useState<Dentition>('permanente')
  const [tooth, setTooth] = useState<number | null>(null)
  const [faces, setFaces] = useState<Face[]>([])
  const [state, setState] = useState<MarkState>('existente')
  const [condition, setCondition] = useState<ToothCondition | ''>('')
  const [serviceId, setServiceId] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [showVoided, setShowVoided] = useState(false)
  const services = L.services.filter((s) => s.active)
  const rows = dentitionRows(dentition)
  const allTeeth = rows.flat()
  const marked = Array.from(new Set(activeEntries(entries).map((e) => e.tooth))).filter((x) => allTeeth.includes(x)).sort((a, b) => a - b)

  const select = (n: number) => { if (n !== tooth) { setFaces([]); setErrors([]) } setTooth(n) }
  const toggleFace = (n: number, f: Face) => {
    if (n !== tooth) { setTooth(n); setFaces([f]); setErrors([]); return }
    setFaces((v) => (v.includes(f) ? v.filter((x) => x !== f) : [...v, f]))
  }
  const def = conditionDef(condition || undefined)
  const toothEntries = tooth ? entries.filter((e) => e.tooth === tooth && (showVoided || !e.voided)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []

  const register = () => {
    if (!tooth) return
    const draft = { tooth, faces, condition: condition || undefined, serviceId: serviceId || undefined, state }
    const errs = validateEntry(draft)
    setErrors(errs)
    if (errs.length) return
    run(() => {
      const id = uid('odo_')
      const svc = L.service(serviceId || undefined)
      let treatmentItemId: string | undefined
      const nf = normalizeFaces(draft)
      if (state === 'planejado' && svc) {
        treatmentItemId = uid('ti_')
        const ti: TreatmentItem = {
          id: treatmentItemId, tenantId: t.tenantId, createdAt: nowISO(), patientId, professionalId: acc.professionalId, serviceId: svc.id,
          description: `${svc.name} — dente ${tooth}${nf.length ? ` (${facesCode(tooth, nf)})` : ''}`, origin: { kind: 'odontograma', tooth, faces: nf.map((f) => faceCode(tooth, f)), refId: id },
          priceCents: svc.priceCents, status: 'planejado',
        }
        db.insert(t.tenantId, 'treatmentItems', ti)
      }
      const entry: OdontogramEntry = {
        id, tenantId: t.tenantId, createdAt: nowISO(), patientId, tooth, faces: nf, condition: condition || undefined, serviceId: svc?.id, state, date: todayCivil(),
        authorId: actor.id, authorName: actor.name, professionalId: acc.professionalId, note: note.trim() || undefined, treatmentItemId, doneOn: state === 'realizado' ? todayCivil() : undefined,
      }
      db.insert(t.tenantId, 'odontogramEntries', entry)
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'odontograma.marcacao', resource: 'odontogramEntries', resourceId: id, detail: `Dente ${tooth}` })
      setNote(''); setFaces([])
    }, state === 'planejado' && serviceId ? `Marcação registrada no dente ${tooth} e item incluído no plano de tratamento.` : `Marcação registrada no dente ${tooth}.`)
  }
  const markDone = (e: OdontogramEntry) => run(() => {
    const ti = e.treatmentItemId ? db.get(t.tenantId, 'treatmentItems', e.treatmentItemId) : undefined
    if (ti && !['aprovado', 'em_execucao'].includes(ti.status)) throw new Error(`Item do plano está "${TI_STATUS[ti.status].label}". Só é possível registrar como realizado após aprovação no orçamento.`)
    db.update(t.tenantId, 'odontogramEntries', e.id, { state: 'realizado', doneOn: todayCivil() })
    if (ti) db.update(t.tenantId, 'treatmentItems', ti.id, { status: 'concluido' })
  }, `Dente ${e.tooth}: procedimento registrado como realizado.`)
  const voidEntry = async (e: OdontogramEntry) => {
    const r = await confirm({ title: `Anular marcação do dente ${e.tooth}?`, body: 'A marcação continua no histórico como anulada (não é apagada).', requireReason: true, danger: true, confirmLabel: 'Anular' })
    if (!r.ok) return
    run(() => {
      db.update(t.tenantId, 'odontogramEntries', e.id, { voided: { at: nowISO(), by: actor.name, reason: r.reason! } })
      const ti = e.treatmentItemId ? db.get(t.tenantId, 'treatmentItems', e.treatmentItemId) : undefined
      if (ti && ti.status === 'planejado') db.update(t.tenantId, 'treatmentItems', ti.id, { status: 'cancelado' })
    }, 'Marcação anulada (mantida no histórico).')
  }
  const canChange = (e: OdontogramEntry) => acc.canEdit && t.can('clinical', 'update', { ownerProfessionalId: e.professionalId ?? '__none__' })

  return (
    <div className="stack">
      <Alert tone="warning" title="Marcação visual não é diagnóstico automático">O odontograma registra o que o profissional informou. Nenhuma condição é inferida pelo sistema.</Alert>
      {acc.scope === 'own' && <p className="small muted">Exibindo apenas marcações registradas por você (escopo do seu perfil).</p>}
      <div className="odo-layout">
        <Section title="Odontograma" actions={<Segmented label="Dentição" value={dentition} onChange={(v) => { setDentition(v); setTooth(null) }} options={[{ value: 'permanente', label: 'Permanente' }, { value: 'decidua', label: 'Decídua' }, { value: 'mista', label: 'Mista' }]} />}>
          <div className="stack" style={S(12)}>
            <Odontogram entries={entries} dentition={dentition} selected={tooth} selectedFaces={faces} onSelect={select} onFace={toggleFace} />
            <p className="tiny muted">Vista frontal: lado direito do paciente à esquerda da tela. Teclado: Tab até um dente, setas para navegar, Enter ou Espaço para selecionar. No celular, use os botões de zoom ou a lista abaixo.</p>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <Field label="Ir para o dente" className="odo-goto">
                <Select value={tooth ?? ''} onChange={(e) => e.target.value && select(Number(e.target.value))}>
                  <option value="">Escolher…</option>
                  {rows.map((r, i) => <optgroup key={i} label={`Linha ${i + 1}`}>{r.map((n) => <option key={n} value={n}>{n} — {toothName(n)}</option>)}</optgroup>)}
                </Select>
              </Field>
              {marked.length > 0 && (
                <div className="stack" style={S(4)}>
                  <span className="small muted">Dentes com marcações</span>
                  <div className="row" style={S(4)}>{marked.map((n) => <button key={n} type="button" className="chip" aria-pressed={tooth === n} onClick={() => select(n)}>{n}</button>)}</div>
                </div>
              )}
            </div>
            <OdontogramLegend />
          </div>
        </Section>

        <Section title={tooth ? `Dente ${tooth}` : 'Dente selecionado'}>
          {!tooth ? <p className="muted">Selecione um dente no odontograma, na lista ou pelo teclado.</p> : (
            <div className="stack" style={S(14)} aria-live="polite">
              <div><div className="strong">{toothName(tooth)}</div><div className="small muted">Quadrante {quadrantOf(tooth)} — {quadrantLabel(quadrantOf(tooth))}</div></div>
              <fieldset>
                <legend>Faces</legend>
                <div className="odo-faces" role="group" aria-label={`Faces do dente ${tooth}`}>
                  {FACES.map((f) => (
                    <button key={f} type="button" className="chip odo-face-btn" aria-pressed={faces.includes(f)} aria-label={`Dente ${tooth}, face ${faceLabel(tooth, f)}`} onClick={() => toggleFace(tooth, f)} disabled={def?.scope === 'dente'}>
                      <strong>{faceCode(tooth, f)}</strong> {faceLabel(tooth, f)}
                    </button>
                  ))}
                </div>
                {def?.scope === 'dente' && <p className="tiny muted">"{def.label}" se aplica ao dente inteiro — faces não são usadas.</p>}
              </fieldset>
              {!acc.canEdit ? <ReadOnlyNotice /> : (
                <>
                  <div className="form-grid">
                    <Field label="Estado"><Select value={state} onChange={(e) => setState(e.target.value as MarkState)}>{(['existente', 'planejado', 'realizado'] as MarkState[]).map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}</Select></Field>
                    <Field label="Condição"><Select value={condition} onChange={(e) => setCondition(e.target.value as ToothCondition | '')}><option value="">Nenhuma (só procedimento)</option>{CONDITIONS.map((c) => <option key={c.key} value={c.key}>{c.label}{c.scope === 'dente' ? ' (dente)' : ''}</option>)}</Select></Field>
                    <Field label="Procedimento (serviço)" hint={state === 'planejado' ? 'Obrigatório para planejar — gera item no plano.' : 'Opcional.'}><Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}><option value="">—</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name} · {formatBRL(s.priceCents)}</option>)}</Select></Field>
                  </div>
                  <Field label="Observação"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                  {errors.length > 0 && <Alert tone="danger" title="Corrija antes de registrar"><ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((x) => <li key={x}>{x}</li>)}</ul></Alert>}
                  <div className="row end"><Button variant="primary" icon={<Plus />} onClick={register} data-tour="primary-action">Registrar marcação</Button></div>
                </>
              )}
              <div className="stack" style={S(8)}>
                <div className="row between"><h3>Histórico do dente</h3><Checkbox label="Mostrar anuladas" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /></div>
                {toothEntries.length === 0 ? <p className="small muted">Sem marcações neste dente.</p> : (
                  <ul className="odo-hist">
                    {toothEntries.map((e) => {
                      const ti = e.treatmentItemId ? db.get(t.tenantId, 'treatmentItems', e.treatmentItemId) : undefined
                      return (
                        <li key={e.id} className={e.voided ? 'voided' : undefined}>
                          <span className="odo-chip" style={{ background: e.condition ? COND_COLOR[e.condition] : 'var(--q-neutral)' }} aria-hidden="true" />
                          <div className="grow stack" style={S(2)}>
                            <div className="row" style={S(6)}>
                              <strong>{conditionDef(e.condition)?.label ?? 'Procedimento'}</strong>
                              {e.faces.length > 0 && <span className="mono">{facesCode(e.tooth, e.faces)}</span>}
                              <Badge tone={e.state === 'planejado' ? 'info' : e.state === 'realizado' ? 'success' : 'neutral'}>{STATE_LABEL[e.state]}</Badge>
                              {ti && <Badge tone={TI_STATUS[ti.status].tone} plain>Plano: {TI_STATUS[ti.status].label}</Badge>}
                              {e.voided && <Badge tone="danger">Anulada</Badge>}
                            </div>
                            <span className="small muted">{formatCivil(e.date)} · {e.authorName}{e.serviceId ? ` · ${L.service(e.serviceId)?.name}` : ''}{e.doneOn ? ` · realizado em ${formatCivil(e.doneOn)}` : ''}</span>
                            {e.note && <span className="small">{e.note}</span>}
                            {e.voided && <span className="small muted">Anulada por {e.voided.by}: {e.voided.reason}</span>}
                          </div>
                          {!e.voided && canChange(e) && (
                            <div className="row" style={S(4)}>
                              {e.state === 'planejado' && <Button size="sm" icon={<CheckCircle2 />} onClick={() => markDone(e)}>Realizado</Button>}
                              <Button size="sm" variant="ghost" icon={<Undo2 />} onClick={() => voidEntry(e)}>Anular</Button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <Button variant="link" onClick={onPlan}>Ver plano de tratamento e gerar orçamento</Button>
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

// ======================= Plano de tratamento → orçamento =======================
export function nextProposalNumber(list: Proposal[]) {
  const max = list.reduce((m, p) => Math.max(m, Number(/(\d+)$/.exec(p.number)?.[1] ?? 0)), 0)
  return `ORC-${String(max + 1).padStart(4, '0')}`
}

function PlanTab({ patientId }: { patientId: string }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const nav = useNavigate()
  const L = useLookup()
  const items = useCollection(t.tenantId, 'treatmentItems').filter((i) => i.patientId === patientId && clinicalOwned(t, i.professionalId))
  const proposals = useCollection(t.tenantId, 'proposals')
  const [sel, setSel] = useState<string[]>([])
  const [groups, setGroups] = useState<Record<string, string>>({})
  const [validDays, setValidDays] = useState('15')
  const canPropose = t.can('orcamentos', 'create')
  const planned = items.filter((i) => i.status === 'planejado')
  const patient = L.patient(patientId)

  const generate = () => run(() => {
    const chosen = planned.filter((i) => sel.includes(i.id))
    if (!chosen.length) throw new Error('Selecione ao menos um item planejado.')
    const days = Number(validDays)
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('Validade deve ser de 1 a 90 dias.')
    const count: Record<string, number> = {}
    chosen.forEach((i) => { const g = groups[i.id]; if (g) count[g] = (count[g] ?? 0) + 1 })
    const lonely = Object.entries(count).filter(([, n]) => n < 2).map(([g]) => g)
    if (lonely.length) throw new Error(`Grupo de alternativas ${lonely.join(', ')} precisa de 2 ou mais itens.`)
    const pol = getPolicies(t.tenantId, patient?.unitId ?? t.unitId)
    const fin = db.list(t.tenantId, 'links').find((l) => l.patientId === patientId && l.relation === 'responsavel_financeiro')?.personId ?? patient?.personId
    const id = uid('prop_')
    const p: Proposal = {
      id, tenantId: t.tenantId, createdAt: nowISO(), unitId: patient?.unitId ?? t.unitId ?? t.units[0].id, patientId, professionalId: chosen[0].professionalId,
      number: nextProposalNumber(db.list(t.tenantId, 'proposals')), version: 1, token: `demo-${uid()}${uid()}`,
      items: chosen.map((i) => ({ id: uid('pi_'), treatmentItemId: i.id, serviceId: i.serviceId, description: i.description, qty: 1, unitCents: i.priceCents, discountCents: 0, optionGroup: groups[i.id] ? `Alternativa ${groups[i.id]}` : undefined, explanation: groups[i.id] ? 'Alternativas para o mesmo objetivo: o paciente escolhe uma.' : undefined })),
      validUntil: addDaysCivil(todayCivil(), days), maxInstallments: pol.payments.maxInstallments, conditions: 'Valores demonstrativos gerados a partir do plano de tratamento. Pagamento simulado — sem cobrança real.',
      maxDiscountPercent: 10, financialResponsibleId: fin, status: 'rascunho', acceptedItemIds: [], questions: [], history: [{ at: nowISO(), from: null, to: 'rascunho', by: actor.name, reason: 'Gerado a partir do odontograma' }], chargeIds: [],
    }
    saveProposal(t.tenantId, p)
    db.set(t.tenantId, 'treatmentItems', db.list(t.tenantId, 'treatmentItems').map((i) => (sel.includes(i.id) && i.status === 'planejado' ? { ...i, status: 'orcado', proposalId: id } : i)))
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'orcamento.gerado', resource: 'proposals', resourceId: id, detail: `${chosen.length} item(ns) do plano` })
    setSel([])
    nav(`${t.base}/orcamentos/${id}`)
  }, 'Orçamento gerado em rascunho.')

  const totalSel = planned.filter((i) => sel.includes(i.id)).reduce((a, i) => a + i.priceCents, 0)
  return (
    <div className="stack">
      <Section title="Itens planejados" actions={canPropose && planned.length > 0 ? <Button variant="primary" icon={<FilePlus2 />} onClick={generate} disabled={!sel.length} data-tour="primary-action">Gerar orçamento</Button> : undefined}>
        {planned.length === 0 ? <p className="muted">Nenhum item planejado em aberto. Registre marcações "planejado" com procedimento no odontograma para alimentar o plano.</p> : (
          <div className="stack" style={S(12)}>
            {!canPropose && <Alert tone="neutral">Seu perfil não cria orçamentos. Peça à recepção ou ao profissional responsável.</Alert>}
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Itens planejados do plano de tratamento</caption>
                <thead><tr><th scope="col">Incluir</th><th scope="col">Item</th><th scope="col">Dente/faces</th><th scope="col">Alternativa</th><th scope="col" className="num">Valor</th></tr></thead>
                <tbody>
                  {planned.map((i) => (
                    <tr key={i.id}>
                      <td><input type="checkbox" aria-label={`Incluir ${i.description}`} checked={sel.includes(i.id)} disabled={!canPropose} onChange={(e) => setSel((v) => (e.target.checked ? [...v, i.id] : v.filter((x) => x !== i.id)))} style={{ width: 20, height: 20 }} /></td>
                      <td>{i.description}</td>
                      <td className="mono">{i.origin.tooth ?? '—'} {i.origin.faces?.join('')}</td>
                      <td><select className="select" style={{ minHeight: 36, width: 120 }} aria-label={`Grupo de alternativas de ${i.description}`} value={groups[i.id] ?? ''} disabled={!canPropose} onChange={(e) => setGroups((g) => ({ ...g, [i.id]: e.target.value }))}><option value="">—</option>{['A', 'B', 'C'].map((g) => <option key={g} value={g}>Grupo {g}</option>)}</select></td>
                      <td className="num">{formatBRL(i.priceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row between">
              <Field label="Validade (dias)" className="odo-goto"><Input type="number" min={1} max={90} value={validDays} onChange={(e) => setValidDays(e.target.value)} /></Field>
              <span className="strong" aria-live="polite">Selecionado: {formatBRL(totalSel)}</span>
            </div>
            <p className="tiny muted">Itens no mesmo grupo viram alternativas no orçamento (o paciente aceita no máximo uma). Parcelamento máximo segue a política financeira da clínica.</p>
          </div>
        )}
      </Section>
      <Section title="Plano de tratamento — todos os itens">
        {items.length === 0 ? <p className="muted">Sem itens de tratamento para este paciente.</p> : (
          <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((i) => {
              const prop = proposals.find((p) => p.id === i.proposalId)
              return (
                <li key={i.id} className="row between" style={{ padding: '10px 0' }}>
                  <div className="stack grow" style={S(2)}>
                    <span className="strong">{i.description}</span>
                    <span className="small muted">{i.origin.kind === 'odontograma' ? `Odontograma · dente ${i.origin.tooth}` : 'Manual'} · {formatBRL(i.priceCents)}</span>
                  </div>
                  <div className="row" style={S(6)}>
                    <Badge tone={TI_STATUS[i.status].tone}>{TI_STATUS[i.status].label}</Badge>
                    {prop && t.can('orcamentos') && <ButtonLink size="sm" variant="link" to={`${t.base}/orcamentos/${prop.id}`}>{prop.number} v{prop.version}</ButtonLink>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="tiny muted" style={{ marginTop: 8 }}>Status "Aprovado"/"Recusado" refletem o aceite (inclusive parcial) do orçamento pelo paciente.</p>
      </Section>
    </div>
  )
}
