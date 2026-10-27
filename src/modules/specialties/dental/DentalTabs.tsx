// Abas de Odontologia: periodontograma, ortodontia/alinhadores, laboratório, imagens intraorais, esterilização.
import { useMemo, useState } from 'react'
import { Camera, CheckCircle2, Lock, PackagePlus, Plus, Send } from 'lucide-react'
import type { FileAsset, StatusChange } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit } from '@/data/repositories'
import { Alert, Badge, Button, DataTable, demoText, Dialog, Field, FileUpload, Input, Kpi, Section, Select, SimBadge, Textarea, Timeline, useAction, useConfirm, useLookup, type Column, type Tone } from '@/ui'
import { addDaysCivil, formatCivil, formatDateTime, nowISO, todayCivil } from '@/lib/dates'
import { formatBRL, parseBRL } from '@/lib/money'
import { uid } from '@/lib/util'
import './types'
import type { LabOrder, LabStatus, OrthoCase, PerioExam, PerioTooth, SterilIndicator, SterilizationCycle } from './types'
import { PERIO_SITES } from './types'
import {
  LAB_LABEL, LAB_TRANSITIONS, PERMANENT_LOWER, PERMANENT_UPPER, attachmentLevel, compareExams, emptyPerioTooth, isLabLate, isMultiRooted, isValidTooth,
  maxPd, packageExpired, perioSummary, planAligners, planVisits, releaseBlockers, transitionLab, validatePerioTooth,
} from './odonto'
import { ReadOnlyNotice, S, nf, num, useClinicalAccess, clinicalOwned } from './common'

// ======================= Periodontograma =======================
const pdTone = (v: number | null) => (v === null ? '' : v >= 6 ? 'pd-hi' : v >= 4 ? 'pd-mid' : 'pd-ok')

export function PerioTab({ patientId }: { patientId: string }) {
  const t = useTenant()
  const actor = useActor()
  const acc = useClinicalAccess()
  const run = useAction()
  const exams = useCollection(t.tenantId, 'perioExams').filter((e) => e.patientId === patientId && clinicalOwned(t, e.professionalId)).sort((a, b) => b.date.localeCompare(a.date))
  const [examId, setExamId] = useState<string | null>(null)
  const exam = exams.find((e) => e.id === examId) ?? exams[0]
  const [tooth, setTooth] = useState<number | null>(null)
  const [cmp, setCmp] = useState<[string, string] | null>(null)

  const newExam = () => run(() => {
    const prev = exams[0]
    const teeth: Record<string, PerioTooth> = {}
    for (const n of [...PERMANENT_UPPER, ...PERMANENT_LOWER]) teeth[n] = prev?.teeth[n]?.missing ? { ...emptyPerioTooth(), missing: true } : emptyPerioTooth()
    const e: PerioExam = { id: uid('perio_'), tenantId: t.tenantId, createdAt: nowISO(), patientId, date: todayCivil(), professionalId: acc.professionalId, authorName: actor.name, teeth, status: 'rascunho' }
    db.insert(t.tenantId, 'perioExams', e)
    setExamId(e.id)
  }, 'Novo exame periodontal em rascunho (dentes ausentes do exame anterior mantidos).')
  const finalize = () => exam && run(() => {
    const errs = Object.entries(exam.teeth).flatMap(([n, d]) => validatePerioTooth(Number(n), d))
    if (errs.length) throw new Error(errs.slice(0, 3).join(' '))
    if (perioSummary(exam).sites === 0) throw new Error('Registre ao menos um sítio antes de finalizar.')
    db.update(t.tenantId, 'perioExams', exam.id, { status: 'finalizado' })
  }, 'Exame periodontal finalizado.')

  const sum = exam ? perioSummary(exam) : null
  const canEdit = acc.canEdit && exam?.status === 'rascunho'
  return (
    <div className="stack">
      <Section title="Periodontograma" actions={<>
        {exams.length > 0 && <Select aria-label="Exame" value={exam?.id} onChange={(e) => { setExamId(e.target.value); setTooth(null) }} style={{ minHeight: 40, width: 'auto' }}>{exams.map((e) => <option key={e.id} value={e.id}>{formatCivil(e.date)} — {e.status === 'rascunho' ? 'rascunho' : 'finalizado'}</option>)}</Select>}
        {exams.length >= 2 && <Button size="sm" onClick={() => setCmp([exams[1].id, exams[0].id])}>Comparar exames</Button>}
        {acc.canEdit && <Button size="sm" variant="primary" icon={<Plus />} onClick={newExam}>Novo exame</Button>}
      </>}>
        {!exam ? <p className="muted">Nenhum exame periodontal. {acc.canEdit ? 'Crie um novo exame.' : ''}</p> : (
          <div className="stack" style={S(14)}>
            {sum && <div className="grid grid-4">
              <Kpi label="Sítios registrados" value={sum.sites} foot={`${sum.present} dentes · ${sum.missing} ausentes`} />
              <Kpi label="Sangramento à sondagem" value={`${nf(sum.bleedingPct)}%`} foot={`${sum.bleeding} sítios`} />
              <Kpi label="Sítios ≥ 4 mm" value={sum.deep4} foot={`${sum.deep6} sítios ≥ 6 mm`} />
              <Kpi label="Médias" value={`PS ${nf(sum.meanPd)} mm`} foot={`NIC médio ${nf(sum.meanCal)} mm`} />
            </div>}
            <p className="small muted">{exam.authorName} · {formatCivil(exam.date)} · {exam.status === 'finalizado' ? 'finalizado (somente leitura)' : 'rascunho'}. Números = maior profundidade de sondagem do dente. Valores registrados pelo profissional; o resumo é cálculo, não diagnóstico.</p>
            <div className="scroll-x">
              <div className="perio-chart" role="group" aria-label="Mapa periodontal (maior profundidade por dente)">
                {[PERMANENT_UPPER, PERMANENT_LOWER].map((row, ri) => (
                  <div key={ri} className="perio-row">
                    {row.map((n) => {
                      const d = exam.teeth[n]
                      const m = maxPd(d)
                      const bleed = d?.sites.some((s) => s.bleeding)
                      return (
                        <button key={n} type="button" className={`perio-cell ${d?.missing ? 'missing' : pdTone(m)}`} aria-pressed={tooth === n} onClick={() => setTooth(n)}
                          aria-label={`Dente ${n}: ${d?.missing ? 'ausente' : m === null ? 'sem registro' : `maior profundidade ${m} mm${bleed ? ', com sangramento' : ''}`}`}>
                          <span className="tiny">{n}</span><strong>{d?.missing ? '×' : m ?? '·'}</strong>{bleed && <span className="perio-bleed" aria-hidden="true">●</span>}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="legend"><span><span className="perio-sw pd-ok" />1–3 mm</span><span><span className="perio-sw pd-mid" />4–5 mm</span><span><span className="perio-sw pd-hi" />≥ 6 mm</span><span>● sangramento</span><span>× ausente</span></div>
            {exam.status === 'rascunho' && acc.canEdit && <div className="row end"><Button variant="primary" icon={<CheckCircle2 />} onClick={finalize} data-tour="primary-action">Finalizar exame</Button></div>}
            {!acc.canEdit && <ReadOnlyNotice />}
          </div>
        )}
      </Section>
      {exam && tooth && <PerioToothEditor key={`${exam.id}-${tooth}`} exam={exam} tooth={tooth} canEdit={!!canEdit} />}
      {cmp && <PerioCompare a={exams.find((e) => e.id === cmp[0])!} b={exams.find((e) => e.id === cmp[1])!} exams={exams} onChange={setCmp} onClose={() => setCmp(null)} />}
    </div>
  )
}

function PerioToothEditor({ exam, tooth, canEdit }: { exam: PerioExam; tooth: number; canEdit: boolean }) {
  const t = useTenant()
  const run = useAction()
  const init = exam.teeth[tooth] ?? emptyPerioTooth()
  const [d, setD] = useState<PerioTooth>(init)
  const [errs, setErrs] = useState<string[]>([])
  const str = (v: number | null) => (v === null ? '' : String(v))
  const parse = (s: string): number | null => { const v = num(s); return v === undefined ? null : v }
  const setSite = (i: number, patch: Partial<PerioTooth['sites'][number]>) => setD((x) => ({ ...x, sites: x.sites.map((s, k) => (k === i ? { ...s, ...patch } : s)) }))
  const save = () => {
    const e = validatePerioTooth(tooth, d)
    setErrs(e)
    if (e.length) return
    run(() => db.update(t.tenantId, 'perioExams', exam.id, (p) => {
      if (p.status === 'finalizado') throw new Error('Exame finalizado não pode ser alterado.')
      return { ...p, teeth: { ...p.teeth, [tooth]: d } }
    }), `Dente ${tooth} salvo no periodontograma.`)
  }
  const dis = !canEdit || d.missing
  return (
    <Section title={`Dente ${tooth} — sítios`} actions={canEdit ? <label className="row small"><input type="checkbox" checked={!!d.missing} onChange={(e) => setD(e.target.checked ? { ...emptyPerioTooth(), missing: true } : emptyPerioTooth())} style={{ width: 20, height: 20 }} />Dente ausente</label> : undefined}>
      <div className="stack" style={S(12)}>
        <div className="scroll-x">
          <table className="table perio-table">
            <caption className="sr-only">Medições dos 6 sítios do dente {tooth}</caption>
            <thead><tr><th scope="col">Sítio</th><th scope="col">PS (mm)</th><th scope="col">Recessão (mm)</th><th scope="col">NIC</th><th scope="col">Sangramento</th><th scope="col">Supuração</th></tr></thead>
            <tbody>
              {PERIO_SITES.map((site, i) => {
                const s = d.sites[i]
                return (
                  <tr key={site}>
                    <th scope="row">{site}</th>
                    <td><input className="input perio-in" inputMode="numeric" aria-label={`Dente ${tooth} ${site}: profundidade de sondagem`} value={str(s.pd)} disabled={dis} onChange={(e) => setSite(i, { pd: parse(e.target.value) })} /></td>
                    <td><input className="input perio-in" inputMode="numeric" aria-label={`Dente ${tooth} ${site}: recessão`} value={str(s.rec)} disabled={dis} onChange={(e) => setSite(i, { rec: parse(e.target.value) })} /></td>
                    <td className="num" aria-label="Nível de inserção clínica">{nf(attachmentLevel(s.pd, s.rec), 0)}</td>
                    <td><input type="checkbox" aria-label={`Dente ${tooth} ${site}: sangramento`} checked={s.bleeding} disabled={dis} onChange={(e) => setSite(i, { bleeding: e.target.checked })} style={{ width: 22, height: 22 }} /></td>
                    <td><input type="checkbox" aria-label={`Dente ${tooth} ${site}: supuração`} checked={s.suppuration} disabled={dis} onChange={(e) => setSite(i, { suppuration: e.target.checked })} style={{ width: 22, height: 22 }} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="form-grid">
          <Field label="Mobilidade (0–3)"><Input inputMode="numeric" value={str(d.mobility)} disabled={dis} onChange={(e) => setD({ ...d, mobility: parse(e.target.value) })} /></Field>
          <Field label="Furca (0–3)" hint={isMultiRooted(tooth) ? 'Dente multirradicular.' : 'Não se aplica a unirradicular.'}><Input inputMode="numeric" value={str(d.furcation)} disabled={dis || !isMultiRooted(tooth)} onChange={(e) => setD({ ...d, furcation: parse(e.target.value) })} /></Field>
        </div>
        <p className="tiny muted">NIC (nível de inserção clínica) = PS + recessão. Recessão negativa indica margem gengival coronal à junção cemento-esmalte.</p>
        {errs.length > 0 && <Alert tone="danger" title="Valores inválidos"><ul style={{ margin: 0, paddingLeft: 18 }}>{errs.map((x) => <li key={x}>{x}</li>)}</ul></Alert>}
        {canEdit ? <div className="row end"><Button variant="primary" onClick={save}>Salvar dente {tooth}</Button></div> : <p className="small muted"><Lock size={14} aria-hidden="true" style={{ display: 'inline' }} /> {exam.status === 'finalizado' ? 'Exame finalizado: crie um novo exame para nova medição.' : 'Somente leitura.'}</p>}
      </div>
    </Section>
  )
}

function PerioCompare({ a, b, exams, onChange, onClose }: { a: PerioExam; b: PerioExam; exams: PerioExam[]; onChange: (v: [string, string]) => void; onClose: () => void }) {
  const c = compareExams(a, b)
  const opt = exams.map((e) => <option key={e.id} value={e.id}>{formatCivil(e.date)}</option>)
  return (
    <Dialog open onClose={onClose} title="Comparação entre exames periodontais" size="lg" footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="stack" style={S(12)}>
        <div className="form-grid">
          <Field label="Exame A (anterior)"><Select value={a.id} onChange={(e) => onChange([e.target.value, b.id])}>{opt}</Select></Field>
          <Field label="Exame B (atual)"><Select value={b.id} onChange={(e) => onChange([a.id, e.target.value])}>{opt}</Select></Field>
        </div>
        <div className="grid grid-3">
          <Kpi label="Sangramento" value={`${nf(c.a.bleedingPct)}% → ${nf(c.b.bleedingPct)}%`} />
          <Kpi label="Sítios ≥ 4 mm" value={`${c.a.deep4} → ${c.b.deep4}`} />
          <Kpi label="PS média" value={`${nf(c.a.meanPd)} → ${nf(c.b.meanPd)} mm`} />
        </div>
        <div className="table-wrap" style={{ maxHeight: 320 }}>
          <table className="table">
            <caption className="sr-only">Maior profundidade por dente nos dois exames</caption>
            <thead><tr><th scope="col">Dente</th><th scope="col" className="num">A</th><th scope="col" className="num">B</th><th scope="col" className="num">Diferença</th></tr></thead>
            <tbody>{c.rows.map((r) => <tr key={r.tooth}><td>{r.tooth}</td><td className="num">{nf(r.a, 0)}</td><td className="num">{nf(r.b, 0)}</td><td className="num">{r.delta === null ? '—' : r.delta > 0 ? `+${r.delta} ▲` : r.delta < 0 ? `${r.delta} ▼` : '0'}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="tiny muted">Comparação numérica; a interpretação é do profissional.</p>
      </div>
    </Dialog>
  )
}

// ======================= Ortodontia / alinhadores =======================
export function OrthoTab({ patientId }: { patientId: string | null }) {
  const t = useTenant()
  const acc = useClinicalAccess()
  const run = useAction()
  const L = useLookup()
  const cases = useCollection(t.tenantId, 'orthoCases').filter((c) => (!patientId || c.patientId === patientId) && clinicalOwned(t, c.professionalId))
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ kind: 'aparelho' as OrthoCase['kind'], appliance: '', startDate: todayCivil(), interval: '30', count: '12', total: '20', change: '14' })
  const today = todayCivil()
  const create = () => run(() => {
    if (!patientId) throw new Error('Selecione o paciente.')
    if (!f.appliance.trim()) throw new Error('Descreva o aparelho/alinhador.')
    const visits = planVisits(f.startDate, Number(f.interval), Number(f.count)).map((d) => ({ id: uid('ov_'), plannedOn: d, status: 'prevista' as const }))
    const c: OrthoCase = { id: uid('ortho_'), tenantId: t.tenantId, createdAt: nowISO(), patientId, professionalId: acc.professionalId, kind: f.kind, appliance: f.appliance.trim(), startDate: f.startDate, intervalDays: Number(f.interval), maintenances: visits, status: 'ativo',
      aligner: f.kind === 'alinhador' ? { total: Number(f.total), changeDays: Number(f.change), stages: planAligners(f.startDate, Number(f.total), Number(f.change)) } : undefined }
    db.insert(t.tenantId, 'orthoCases', c)
    setOpen(false)
  }, 'Caso ortodôntico criado com manutenções previstas.')
  const visit = (c: OrthoCase, id: string, status: 'realizada' | 'faltou') => run(() => db.update(t.tenantId, 'orthoCases', c.id, { maintenances: c.maintenances.map((v) => (v.id === id ? { ...v, status, doneOn: status === 'realizada' ? today : undefined } : v)) }), status === 'realizada' ? 'Manutenção registrada como realizada.' : 'Falta registrada.')
  const deliver = (c: OrthoCase, n: number) => run(() => {
    const st = c.aligner!.stages
    const upTo = st.find((s) => s.n === n)!
    if (st.some((s) => s.n < n && !s.deliveredOn)) throw new Error('Entregue as placas anteriores primeiro (sequência).')
    db.update(t.tenantId, 'orthoCases', c.id, { aligner: { ...c.aligner!, stages: st.map((s) => (s.n === upTo.n ? { ...s, deliveredOn: today } : s)) } })
  }, `Placa ${n} registrada como entregue.`)
  return (
    <div className="stack">
      <Section title="Ortodontia e alinhadores" actions={acc.canEdit && patientId ? <Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>Novo caso</Button> : undefined}>
        {!patientId && <p className="small muted" style={{ marginBottom: 8 }}>Mostrando todos os casos. Selecione um paciente para filtrar ou criar.</p>}
        {cases.length === 0 ? <p className="muted">Nenhum caso ortodôntico{patientId ? ' para este paciente' : ''}.</p> : (
          <div className="stack">
            {cases.map((c) => {
              const done = c.maintenances.filter((v) => v.status === 'realizada').length
              const next = c.maintenances.find((v) => v.status === 'prevista')
              const delivered = c.aligner?.stages.filter((s) => s.deliveredOn).length ?? 0
              const current = c.aligner ? [...c.aligner.stages].reverse().find((s) => s.plannedChangeOn <= today && s.deliveredOn) : undefined
              return (
                <div key={c.id} className="card tight stack" style={S(10)}>
                  <div className="row between">
                    <div className="stack" style={S(2)}><strong>{L.patient(c.patientId)?.name}</strong><span className="small muted">{c.appliance} · início {formatCivil(c.startDate)} · {L.pro(c.professionalId)?.name ?? '—'}</span></div>
                    <Badge tone={c.kind === 'alinhador' ? 'info' : 'brand'}>{c.kind === 'alinhador' ? 'Alinhador' : 'Aparelho'}</Badge>
                  </div>
                  <div className="small">Manutenções: <strong>{done}</strong> realizadas de {c.maintenances.length} previstas{next ? ` · próxima ${formatCivil(next.plannedOn)}` : ''}</div>
                  <details>
                    <summary>Manutenções</summary>
                    <ul className="divider-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {c.maintenances.map((v, i) => (
                        <li key={v.id} className="row between" style={{ padding: '6px 0' }}>
                          <span className="small">#{i + 1} · {formatCivil(v.plannedOn)}{v.note ? ` · ${v.note}` : ''}</span>
                          <div className="row" style={S(4)}>
                            <Badge tone={v.status === 'realizada' ? 'success' : v.status === 'faltou' ? 'danger' : v.plannedOn < today ? 'warning' : 'neutral'}>{v.status === 'prevista' && v.plannedOn < today ? 'Prevista (vencida)' : v.status === 'realizada' ? 'Realizada' : v.status === 'faltou' ? 'Faltou' : 'Prevista'}</Badge>
                            {acc.canEdit && v.status === 'prevista' && <><Button size="sm" onClick={() => visit(c, v.id, 'realizada')}>Realizada</Button><Button size="sm" variant="ghost" onClick={() => visit(c, v.id, 'faltou')}>Faltou</Button></>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                  {c.aligner && (
                    <div className="stack" style={S(6)}>
                      <div className="small">Placas: <strong>{delivered}</strong> de {c.aligner.total} entregues · em uso: <strong>{current ? `placa ${current.n} de ${c.aligner.total}` : '—'}</strong> · troca a cada {c.aligner.changeDays} dias</div>
                      <div className="aligner-grid" role="list" aria-label="Etapas do alinhador">
                        {c.aligner.stages.map((s) => {
                          const can = acc.canEdit && !s.deliveredOn
                          return (
                            <button key={s.n} role="listitem" type="button" className={`aligner-step${s.deliveredOn ? ' done' : ''}${current?.n === s.n ? ' current' : ''}`} disabled={!can}
                              onClick={() => deliver(c, s.n)} aria-label={`Placa ${s.n} de ${c.aligner!.total}: troca prevista ${formatCivil(s.plannedChangeOn)}${s.deliveredOn ? `, entregue em ${formatCivil(s.deliveredOn)}` : can ? ', registrar entrega' : ''}`}>
                              <strong>{s.n}</strong><span className="tiny">{formatCivil(s.plannedChangeOn).slice(0, 5)}</span>
                            </button>
                          )
                        })}
                      </div>
                      <p className="tiny muted">Preenchido = entregue; contorno destacado = placa em uso. Clique numa placa pendente para registrar a entrega.</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>
      <Dialog open={open} onClose={() => setOpen(false)} title="Novo caso ortodôntico" footer={<><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" onClick={create}>Criar caso</Button></>}>
        <div className="form-grid">
          <Field label="Tipo"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as OrthoCase['kind'] })}><option value="aparelho">Aparelho</option><option value="alinhador">Alinhador</option></Select></Field>
          <Field label="Descrição do aparelho" required><Input value={f.appliance} onChange={(e) => setF({ ...f, appliance: e.target.value })} /></Field>
          <Field label="Início"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
          <Field label="Intervalo de manutenção (dias)"><Input type="number" value={f.interval} onChange={(e) => setF({ ...f, interval: e.target.value })} /></Field>
          <Field label="Manutenções previstas"><Input type="number" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></Field>
          {f.kind === 'alinhador' && <>
            <Field label="Total de placas"><Input type="number" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} /></Field>
            <Field label="Troca a cada (dias)"><Input type="number" value={f.change} onChange={(e) => setF({ ...f, change: e.target.value })} /></Field>
          </>}
        </div>
      </Dialog>
    </div>
  )
}

// ======================= Laboratório =======================
const LAB_TONE: Record<LabStatus, Tone> = { solicitado: 'neutral', enviado: 'info', recebido: 'brand', ajuste: 'warning', entregue: 'success', cancelado: 'neutral' }
export function LabTab({ patientId }: { patientId: string | null }) {
  const t = useTenant()
  const actor = useActor()
  const acc = useClinicalAccess()
  const run = useAction()
  const confirm = useConfirm()
  const L = useLookup()
  const orders = useCollection(t.tenantId, 'labOrders').filter((o) => !patientId || o.patientId === patientId)
  const items = useCollection(t.tenantId, 'treatmentItems')
  const [open, setOpen] = useState(false)
  const [hist, setHist] = useState<LabOrder | null>(null)
  const [f, setF] = useState({ lab: 'Laboratório Dental Exemplo (fictício)', work: '', tooth: '', cost: '', due: addDaysCivil(todayCivil(), 10), ti: '' })
  const today = todayCivil()
  const create = () => run(() => {
    if (!patientId) throw new Error('Selecione o paciente.')
    if (!f.work.trim()) throw new Error('Descreva o trabalho.')
    const cost = parseBRL(f.cost)
    if (cost === null || cost < 0) throw new Error('Custo inválido (ex.: 480,00).')
    const tooth = f.tooth ? Number(f.tooth) : undefined
    if (tooth !== undefined && !isValidTooth(tooth)) throw new Error('Dente inválido (FDI).')
    if (f.due < today) throw new Error('Prazo não pode estar no passado.')
    const o: LabOrder = { id: uid('lab_'), tenantId: t.tenantId, createdAt: nowISO(), patientId, treatmentItemId: f.ti || undefined, lab: f.lab, work: f.work.trim(), tooth, costCents: cost, requestedOn: today, dueOn: f.due, status: 'solicitado', history: [{ at: nowISO(), from: null, to: 'solicitado', by: actor.name }] }
    db.insert(t.tenantId, 'labOrders', o)
    setOpen(false)
  }, 'Pedido de laboratório registrado.')
  const move = async (o: LabOrder, to: LabStatus) => {
    let reason: string | undefined
    if (to === 'cancelado' || to === 'ajuste') {
      const r = await confirm({ title: to === 'ajuste' ? 'Enviar para ajuste' : 'Cancelar pedido', requireReason: true, reasonLabel: to === 'ajuste' ? 'Ajuste necessário' : 'Motivo', danger: to === 'cancelado' })
      if (!r.ok) return
      reason = r.reason
    }
    run(() => { db.update(t.tenantId, 'labOrders', o.id, (prev) => transitionLab(prev, to, actor.name, reason)); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: `laboratorio.${to}`, resource: 'labOrders', resourceId: o.id }) }, `Pedido: ${LAB_LABEL[to]}.`)
  }
  const cols: Column<LabOrder>[] = [
    { id: 'work', header: 'Trabalho', cell: (o) => <span className="stack" style={S(2)}><strong>{o.work}</strong><span className="small muted">{L.patient(o.patientId)?.name}{o.tooth ? ` · dente ${o.tooth}` : ''}</span></span>, value: (o) => o.work },
    { id: 'lab', header: 'Laboratório', cell: (o) => o.lab, value: (o) => o.lab },
    { id: 'status', header: 'Status', cell: (o) => <span className="row" style={S(4)}><Badge tone={LAB_TONE[o.status]}>{LAB_LABEL[o.status]}</Badge>{isLabLate(o, today) && <Badge tone="danger">Atrasado</Badge>}</span>, value: (o) => o.status },
    { id: 'due', header: 'Prazo', cell: (o) => <span className={isLabLate(o, today) ? 'strong lab-late' : undefined}>{formatCivil(o.dueOn)}</span>, value: (o) => o.dueOn },
    { id: 'cost', header: 'Custo', num: true, cell: (o) => formatBRL(o.costCents), value: (o) => o.costCents },
    { id: 'ti', header: 'Plano', cell: (o) => items.find((i) => i.id === o.treatmentItemId)?.description ?? '—', mobile: false },
  ]
  const late = orders.filter((o) => isLabLate(o, today)).length
  return (
    <div className="stack">
      {late > 0 && <Alert tone="danger" title={`${late} pedido(s) com prazo vencido`}>Verifique com o laboratório. Atraso calculado pelo prazo informado.</Alert>}
      <Section title="Próteses e laboratório" actions={acc.canEdit && patientId ? <Button variant="primary" icon={<PackagePlus />} onClick={() => setOpen(true)}>Novo pedido</Button> : undefined}>
        {!acc.canEdit && <div style={{ marginBottom: 12 }}><ReadOnlyNotice /></div>}
        <DataTable caption="Pedidos de laboratório" rows={orders} columns={cols} rowKey={(o) => o.id} onRowClick={setHist}
          empty={<p className="muted">Nenhum pedido{patientId ? ' para este paciente' : ''}.</p>}
          rowActions={(o) => acc.canEdit ? LAB_TRANSITIONS[o.status].map((to) => <Button key={to} size="sm" variant={to === 'cancelado' ? 'ghost' : 'secondary'} onClick={() => move(o, to)}>{to === 'enviado' && o.status === 'ajuste' ? 'Reenviar' : LAB_LABEL[to]}</Button>) : null} />
      </Section>
      <Dialog open={open} onClose={() => setOpen(false)} title="Novo pedido de laboratório" footer={<><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" onClick={create}>Registrar pedido</Button></>}>
        <div className="form-grid">
          <Field label="Laboratório (fictício)"><Select value={f.lab} onChange={(e) => setF({ ...f, lab: e.target.value })}>{['Laboratório Dental Exemplo (fictício)', 'Prótese Modelo Ltda. (fictício)', 'Lab Sorriso Demonstração (fictício)'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="Trabalho" required><Input value={f.work} onChange={(e) => setF({ ...f, work: e.target.value })} /></Field>
          <Field label="Dente (FDI)"><Input inputMode="numeric" value={f.tooth} onChange={(e) => setF({ ...f, tooth: e.target.value })} /></Field>
          <Field label="Custo (R$)" required><Input inputMode="decimal" placeholder="0,00" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
          <Field label="Prazo"><Input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
          <Field label="Vínculo ao plano"><Select value={f.ti} onChange={(e) => setF({ ...f, ti: e.target.value })}><option value="">—</option>{items.filter((i) => i.patientId === patientId && !['cancelado', 'recusado'].includes(i.status)).map((i) => <option key={i.id} value={i.id}>{i.description}</option>)}</Select></Field>
        </div>
      </Dialog>
      <Dialog open={!!hist} onClose={() => setHist(null)} title={hist ? `Histórico — ${hist.work}` : ''} footer={<Button onClick={() => setHist(null)}>Fechar</Button>}>
        {hist && <Timeline items={(orders.find((o) => o.id === hist.id) ?? hist).history.map((h) => ({ time: formatDateTime(h.at), title: LAB_LABEL[h.to], body: [h.by, h.reason].filter(Boolean).join(' · ') }))} />}
      </Dialog>
    </div>
  )
}

// ======================= Imagens intraorais =======================
export function ImagesTab({ patientId }: { patientId: string }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const files = useCollection(t.tenantId, 'files')
  const meta = useCollection(t.tenantId, 'dentalImages').filter((m) => m.patientId === patientId)
  const canUpload = t.can('arquivos', 'create')
  const [kind, setKind] = useState<'imagem_intraoral' | 'radiografia'>('imagem_intraoral')
  const [tooth, setTooth] = useState('')
  const [date, setDate] = useState(todayCivil())
  const [filterTooth, setFilterTooth] = useState('')
  const list = useMemo(() => meta.map((m) => ({ m, f: files.find((x) => x.id === m.fileId) })).filter((x) => x.f && (!filterTooth || String(x.m.tooth) === filterTooth)).sort((a, b) => b.m.takenOn.localeCompare(a.m.takenOn)), [meta, files, filterTooth])
  const byDate = list.reduce<Record<string, typeof list>>((acc, x) => { (acc[x.m.takenOn] ??= []).push(x); return acc }, {})
  const onFile = (u: { name: string; mime: string; size: number; dataUrl: string }) => run(() => {
    const n = tooth ? Number(tooth) : undefined
    if (n !== undefined && !isValidTooth(n)) throw new Error('Dente inválido (FDI).')
    if (date > todayCivil()) throw new Error('Data da imagem não pode ser futura.')
    const fid = uid('file_')
    const f: FileAsset = { id: fid, tenantId: t.tenantId, createdAt: nowISO(), patientId, category: kind, name: u.name, mime: u.mime, sizeBytes: u.size, versions: [{ version: 1, at: nowISO(), by: actor.id, dataUrl: u.dataUrl, note: demoText('Upload demonstrativo (armazenado só neste navegador)', 'Upload de imagem') }], restricted: false, consent: { clinical: true, marketing: false } }
    db.insert(t.tenantId, 'files', f)
    db.insert(t.tenantId, 'dentalImages', { id: uid('dimg_'), tenantId: t.tenantId, createdAt: nowISO(), patientId, fileId: fid, tooth: n, takenOn: date, kind })
  }, 'Imagem adicionada à galeria do paciente.')
  const teeth = Array.from(new Set(meta.map((m) => m.tooth).filter(Boolean))).sort() as number[]
  return (
    <div className="stack">
      <div className="grid grid-2">
        <Section title={demoText('Enviar imagem (demonstrativo)', 'Enviar imagem')}>
          {!canUpload ? <ReadOnlyNotice>Seu perfil não envia arquivos clínicos.</ReadOnlyNotice> : (
            <div className="stack" style={S(12)}>
              <div className="form-grid">
                <Field label="Categoria"><Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="imagem_intraoral">Imagem intraoral</option><option value="radiografia">Radiografia</option></Select></Field>
                <Field label="Dente (opcional)"><Input inputMode="numeric" value={tooth} onChange={(e) => setTooth(e.target.value)} /></Field>
                <Field label="Data"><Input type="date" value={date} max={todayCivil()} onChange={(e) => setDate(e.target.value)} /></Field>
              </div>
              <FileUpload accept={['image/png', 'image/jpeg', 'image/webp']} maxMb={2} onFile={onFile} label="Selecionar imagem" hint={demoText('PNG, JPG ou WebP até 2 MB. Use apenas imagens fictícias.', 'PNG, JPG ou WebP até 2 MB.')} />
              <p className="tiny muted">O original não é recomprimido. DICOM/visualização diagnóstica é integração específica futura.</p>
            </div>
          )}
        </Section>
        <Section title={<span className="row"><Camera size={18} aria-hidden="true" />Adaptador de dispositivo — integração futura</span>}>
          <div className="stack" style={S(8)}>
            <SimBadge>Sem conexão com dispositivo real</SimBadge>
            <p className="small">Câmera intraoral / RX digital conectarão por um agente local ou SDK do fabricante, entregando ao Qlinic:</p>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              <li><span className="mono">captureStart(patientId, tooth?)</span> → sessão de captura</li>
              <li><span className="mono">onImage({'{'} mime, bytes, takenAt, deviceId, modality {'}'})</span> → original sem recompressão</li>
              <li>DICOM: armazenado como original + miniatura derivada separada; visualizador diagnóstico dedicado</li>
              <li>Upload para storage privado com link temporário e autorização por registro</li>
            </ul>
            <Button disabled>Conectar dispositivo (configuração futura no servidor)</Button>
          </div>
        </Section>
      </div>
      <Section title="Galeria" actions={teeth.length > 0 ? <Select aria-label="Filtrar por dente" value={filterTooth} onChange={(e) => setFilterTooth(e.target.value)} style={{ minHeight: 40, width: 'auto' }}><option value="">Todos os dentes</option>{teeth.map((n) => <option key={n} value={n}>Dente {n}</option>)}</Select> : undefined}>
        {list.length === 0 ? <p className="muted">Nenhuma imagem{filterTooth ? ' para este dente' : ''}.{demoText(' Envie uma imagem fictícia para demonstrar.', ' Envie uma imagem.')}</p> : (
          <div className="stack">
            {Object.entries(byDate).map(([d, xs]) => (
              <div key={d} className="stack" style={S(8)}>
                <h3 className="small muted">{formatCivil(d)}</h3>
                <div className="img-grid">
                  {xs.map(({ m, f }) => (
                    <figure key={m.id} className="img-card">
                      <img src={f!.versions[f!.versions.length - 1].dataUrl} alt={`${m.kind === 'radiografia' ? 'Radiografia' : 'Imagem intraoral'}${m.tooth ? ` do dente ${m.tooth}` : ''}, ${formatCivil(m.takenOn)}`} />
                      <figcaption className="tiny"><Badge tone={m.kind === 'radiografia' ? 'info' : 'brand'} plain>{m.kind === 'radiografia' ? 'RX' : 'Intraoral'}</Badge> {m.tooth ? `Dente ${m.tooth}` : 'Geral'}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ======================= Esterilização =======================
const ST_LABEL: Record<SterilizationCycle['status'], { l: string; tone: Tone }> = { em_processo: { l: 'Em processo', tone: 'warning' }, liberado: { l: 'Liberado pelo responsável', tone: 'success' }, reprovado: { l: 'Reprovado', tone: 'danger' } }
export function SterilizationTab() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const L = useLookup()
  const cycles = useCollection(t.tenantId, 'sterilizationCycles').filter((c) => !t.unitId || c.unitId === t.unitId).sort((a, b) => b.date.localeCompare(a.date) || b.cycleNo - a.cycleNo)
  const appts = useCollection(t.tenantId, 'appointments')
  const canEdit = t.can('clinical', 'create') || t.can('estoque', 'update')
  const equipments = L.resources.filter((r) => r.kind === 'equipamento' && r.active && (!t.unitId || r.unitId === t.unitId))
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ equipmentId: '', temp: '134', minutes: '7', kits: 'Kit clínico básico', validity: '30' })
  const today = todayCivil()
  const upcoming = appts.filter((a) => a.start >= nowISO() && ['confirmada', 'aguardando_confirmacao', 'chegou'].includes(a.status) && (!t.unitId || a.unitId === t.unitId)).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 20)
  const h = (c: SterilizationCycle, to: SterilizationCycle['status'], reason?: string): StatusChange<SterilizationCycle['status']>[] => [...c.history, { at: nowISO(), from: c.status, to, by: actor.name, reason }]

  const create = () => run(() => {
    const eq = equipments.find((e) => e.id === f.equipmentId) ?? equipments[0]
    if (!eq) throw new Error('Cadastre um equipamento (autoclave) nos recursos da unidade.')
    const kits = f.kits.split(/\n|;/).map((x) => x.trim()).filter(Boolean)
    if (!kits.length) throw new Error('Informe ao menos um kit/pacote.')
    const v = Number(f.validity)
    if (!Number.isInteger(v) || v < 1 || v > 365) throw new Error('Validade do pacote: 1 a 365 dias (conforme protocolo da clínica).')
    const no = Math.max(0, ...db.list(t.tenantId, 'sterilizationCycles').filter((c) => c.equipmentId === eq.id).map((c) => c.cycleNo)) + 1
    const c: SterilizationCycle = { id: uid('est_'), tenantId: t.tenantId, createdAt: nowISO(), unitId: eq.unitId, equipmentId: eq.id, cycleNo: no, date: today, temperatureC: num(f.temp), minutes: num(f.minutes), responsible: actor.name,
      indicators: [{ kind: 'quimico', result: 'pendente' }, { kind: 'biologico', result: 'pendente' }], packages: kits.map((k) => ({ id: uid('pk_'), kit: k, expiresOn: addDaysCivil(today, v) })), status: 'em_processo', history: [{ at: nowISO(), from: null, to: 'em_processo', by: actor.name }] }
    db.insert(t.tenantId, 'sterilizationCycles', c)
    setOpen(false)
  }, 'Ciclo registrado (indicadores pendentes).')
  const setIndicator = (c: SterilizationCycle, i: number, result: SterilIndicator['result']) => run(() => db.update(t.tenantId, 'sterilizationCycles', c.id, (p) => {
    if (p.status !== 'em_processo') throw new Error('Ciclo encerrado: indicadores não podem ser alterados.')
    return { ...p, indicators: p.indicators.map((x, k) => (k === i ? { ...x, result, recordedAt: nowISO(), note: `Informado por ${actor.name}` } : x)) }
  }), 'Resultado do indicador registrado.')
  const release = (c: SterilizationCycle) => run(() => {
    const b = releaseBlockers(c)
    if (b.length) throw new Error(b.join(' '))
    db.update(t.tenantId, 'sterilizationCycles', c.id, { status: 'liberado', history: h(c, 'liberado', 'Liberação registrada pelo responsável') })
  }, 'Lote liberado (registro do responsável).')
  const reject = async (c: SterilizationCycle) => {
    const r = await confirm({ title: `Reprovar ciclo ${c.cycleNo}?`, requireReason: true, danger: true, confirmLabel: 'Reprovar' })
    if (r.ok) run(() => db.update(t.tenantId, 'sterilizationCycles', c.id, { status: 'reprovado', history: h(c, 'reprovado', r.reason) }), 'Ciclo reprovado — pacotes bloqueados.')
  }
  const link = (c: SterilizationCycle, pkId: string, apId: string) => run(() => {
    if (c.status !== 'liberado') throw new Error('Só pacotes de lote liberado podem ser vinculados.')
    const pk = c.packages.find((p) => p.id === pkId)!
    const ap = appts.find((a) => a.id === apId)
    if (ap && packageExpired(pk.expiresOn, ap.start.slice(0, 10))) throw new Error('Pacote vence antes do atendimento.')
    db.update(t.tenantId, 'sterilizationCycles', c.id, { packages: c.packages.map((p) => (p.id === pkId ? { ...p, appointmentId: apId || undefined, serviceId: ap?.serviceId } : p)) })
  }, apId ? 'Kit vinculado ao agendamento/procedimento.' : 'Vínculo removido.')
  return (
    <div className="stack">
      <Alert tone="info" title="Registro operacional">O Qlinic registra ciclos, indicadores e responsáveis informados pela equipe. Não declara conformidade sanitária automaticamente.</Alert>
      <Section title="Ciclos de autoclave" actions={canEdit ? <Button variant="primary" icon={<Plus />} onClick={() => { setF({ ...f, equipmentId: equipments[0]?.id ?? '' }); setOpen(true) }}>Novo ciclo</Button> : undefined}>
        {!canEdit && <div style={{ marginBottom: 12 }}><ReadOnlyNotice>Somente profissionais e auxiliares registram ciclos.</ReadOnlyNotice></div>}
        {cycles.length === 0 ? <p className="muted">Nenhum ciclo registrado{t.unitId ? ' nesta unidade' : ''}.</p> : (
          <div className="stack">
            {cycles.map((c) => (
              <div key={c.id} className="card tight stack" style={S(10)}>
                <div className="row between">
                  <div className="stack" style={S(2)}><strong>Ciclo {c.cycleNo} · {L.resource(c.equipmentId)?.name ?? 'Equipamento'}</strong><span className="small muted">{formatCivil(c.date)} · {nf(c.temperatureC, 0)} °C · {nf(c.minutes, 0)} min · responsável: {c.responsible}</span></div>
                  <Badge tone={ST_LABEL[c.status].tone}>{ST_LABEL[c.status].l}</Badge>
                </div>
                <div className="row" style={S(12)}>
                  {c.indicators.map((ind, i) => (
                    <div key={i} className="row" style={S(6)}>
                      <span className="small">{ind.kind === 'quimico' ? 'Indicador químico' : 'Indicador biológico'}:</span>
                      {c.status === 'em_processo' && canEdit ? (
                        <Select aria-label={`Resultado do indicador ${ind.kind} do ciclo ${c.cycleNo}`} value={ind.result} onChange={(e) => setIndicator(c, i, e.target.value as SterilIndicator['result'])} style={{ minHeight: 36, width: 'auto' }}>
                          <option value="pendente">Pendente</option><option value="aprovado">Aprovado (informado)</option><option value="reprovado">Reprovado (informado)</option>
                        </Select>
                      ) : <Badge tone={ind.result === 'aprovado' ? 'success' : ind.result === 'reprovado' ? 'danger' : 'warning'} plain>{ind.result === 'aprovado' ? 'Aprovado (informado)' : ind.result === 'reprovado' ? 'Reprovado (informado)' : 'Pendente'}</Badge>}
                    </div>
                  ))}
                </div>
                <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {c.packages.map((p) => {
                    const exp = packageExpired(p.expiresOn, today)
                    return (
                      <li key={p.id} className="row between" style={{ padding: '6px 0' }}>
                        <span className="small"><strong>{p.kit}</strong> · validade {formatCivil(p.expiresOn)} {exp && <Badge tone="danger">Vencido</Badge>}{p.serviceId ? ` · ${L.service(p.serviceId)?.name}` : ''}</span>
                        {c.status === 'liberado' && canEdit && !exp ? (
                          <Select aria-label={`Vincular ${p.kit} a um agendamento`} value={p.appointmentId ?? ''} onChange={(e) => link(c, p.id, e.target.value)} style={{ minHeight: 36, width: 'auto', maxWidth: '100%' }}>
                            <option value="">Sem vínculo</option>
                            {[...upcoming, ...appts.filter((a) => a.id === p.appointmentId && !upcoming.includes(a))].map((a) => <option key={a.id} value={a.id}>{formatDateTime(a.start)} · {L.service(a.serviceId)?.name} · {L.patient(a.patientId)?.name}</option>)}
                          </Select>
                        ) : p.appointmentId ? <span className="small muted">Vinculado a {(() => { const a = appts.find((x) => x.id === p.appointmentId); return a ? formatDateTime(a.start) : 'agendamento' })()}</span> : null}
                      </li>
                    )
                  })}
                </ul>
                {c.status === 'em_processo' && canEdit && (
                  <div className="row end">
                    <Button variant="ghost" onClick={() => reject(c)}>Reprovar</Button>
                    <Button variant="primary" icon={<Send />} onClick={() => release(c)}>Registrar liberação</Button>
                  </div>
                )}
                <details><summary className="small">Histórico</summary><Timeline items={c.history.map((x) => ({ time: formatDateTime(x.at), title: ST_LABEL[x.to].l, body: [x.by, x.reason].filter(Boolean).join(' · ') }))} /></details>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Dialog open={open} onClose={() => setOpen(false)} title="Novo ciclo de esterilização" footer={<><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" onClick={create}>Registrar ciclo</Button></>}>
        <div className="stack" style={S(12)}>
          <div className="form-grid">
            <Field label="Equipamento"><Select value={f.equipmentId} onChange={(e) => setF({ ...f, equipmentId: e.target.value })}>{equipments.map((e) => <option key={e.id} value={e.id}>{e.name} — {L.unit(e.unitId)?.name}</option>)}</Select></Field>
            <Field label="Temperatura (°C)"><Input inputMode="numeric" value={f.temp} onChange={(e) => setF({ ...f, temp: e.target.value })} /></Field>
            <Field label="Tempo (min)"><Input inputMode="numeric" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></Field>
            <Field label="Validade dos pacotes (dias)" hint="Conforme protocolo da clínica."><Input inputMode="numeric" value={f.validity} onChange={(e) => setF({ ...f, validity: e.target.value })} /></Field>
          </div>
          <Field label="Kits/pacotes (um por linha)"><Textarea rows={3} value={f.kits} onChange={(e) => setF({ ...f, kits: e.target.value })} /></Field>
        </div>
      </Dialog>
    </div>
  )
}
