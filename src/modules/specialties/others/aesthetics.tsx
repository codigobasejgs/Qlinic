// Estética: mapa facial/corporal (SVG + lista), aplicações por sessão, pacotes e comparador antes/depois com consentimento por finalidade.
import { useState } from 'react'
import { Megaphone, Plus, ShieldCheck, Sparkles } from 'lucide-react'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit } from '@/data/repositories'
import type { AestheticPackage } from '@/domain/modules'
import type { ID, Patient } from '@/domain/types'
import { Alert, Badge, Button, Checkbox, demoText, Dialog, EmptyState, Field, ImageCompare, Input, Progress, Section, Select, Tabs, TabPanel, Textarea, useAction, useConfirm, useLookup, ZoomPan } from '@/ui'
import { formatCivil, formatDateTime, nowISO, todayCivil } from '@/lib/dates'
import { formatBRL } from '@/lib/money'
import { groupBy, uid } from '@/lib/util'
import { addPackageSession, packageState } from './lib'
import type { AestheticApplication, AestheticComparison, BodyView, ConsentEntry } from './types'
import { NoAccess, ReadOnly, SpecShell, parseNum, proNameOf, useClinicalWriter } from './common'

interface Region { id: string; label: string; view: BodyView; x: number; y: number; r: number }
const REGIONS: Region[] = [
  { id: 'fronte', label: 'Fronte', view: 'face', x: 150, y: 80, r: 26 },
  { id: 'glabela', label: 'Glabela', view: 'face', x: 150, y: 118, r: 14 },
  { id: 'periorbital_d', label: 'Periorbital direita', view: 'face', x: 112, y: 135, r: 16 },
  { id: 'periorbital_e', label: 'Periorbital esquerda', view: 'face', x: 188, y: 135, r: 16 },
  { id: 'malar_d', label: 'Malar direita', view: 'face', x: 105, y: 172, r: 18 },
  { id: 'malar_e', label: 'Malar esquerda', view: 'face', x: 195, y: 172, r: 18 },
  { id: 'nasolabial_d', label: 'Sulco nasolabial direito', view: 'face', x: 118, y: 205, r: 13 },
  { id: 'nasolabial_e', label: 'Sulco nasolabial esquerdo', view: 'face', x: 182, y: 205, r: 13 },
  { id: 'labios', label: 'Lábios', view: 'face', x: 150, y: 226, r: 15 },
  { id: 'mento', label: 'Mento', view: 'face', x: 150, y: 262, r: 14 },
  { id: 'abdomen', label: 'Abdômen', view: 'frente', x: 150, y: 175, r: 32 },
  { id: 'braco_d', label: 'Braço direito', view: 'frente', x: 88, y: 140, r: 18 },
  { id: 'braco_e', label: 'Braço esquerdo', view: 'frente', x: 212, y: 140, r: 18 },
  { id: 'coxa_d', label: 'Coxa direita', view: 'frente', x: 128, y: 265, r: 22 },
  { id: 'coxa_e', label: 'Coxa esquerda', view: 'frente', x: 172, y: 265, r: 22 },
  { id: 'dorso', label: 'Dorso', view: 'costas', x: 150, y: 140, r: 32 },
  { id: 'flancos', label: 'Flancos', view: 'costas', x: 150, y: 200, r: 26 },
  { id: 'gluteos', label: 'Glúteos', view: 'costas', x: 150, y: 245, r: 28 },
]
const VIEW_LABEL: Record<BodyView, string> = { face: 'Face', frente: 'Corpo — frente', costas: 'Corpo — costas' }
const regionLabel = (id: string) => REGIONS.find((r) => r.id === id)?.label ?? id

export function AestheticsPage() {
  const t = useTenant()
  const [tab, setTab] = useState('mapa')
  const clinical = t.scope('clinical') !== false
  return (
    <SpecShell title="Estética" module="estetica" subtitle="Mapa facial/corporal, aplicações por sessão, pacotes e comparador antes/depois com consentimento por finalidade.">
      {(patient) => (
        <>
          <Alert tone="warning" title="Sem promessa de resultado">Simulações e comparações são ilustrativas. Resultado estético nunca é garantido e varia de pessoa para pessoa.</Alert>
          <Tabs value={tab} onChange={setTab} label="Seções da estética" tabs={[{ id: 'mapa', label: 'Mapa e aplicações' }, { id: 'pacotes', label: 'Pacotes' }, { id: 'comparador', label: 'Antes e depois' }]} />
          <TabPanel>
            {tab === 'pacotes' ? <PackagesTab patient={patient} /> : !clinical ? <NoAccess>Mapa, aplicações e imagens são visíveis apenas para perfis clínicos. Pacotes estão disponíveis à recepção.</NoAccess>
              : !patient ? <EmptyState title="Selecione um paciente" icon={<Sparkles aria-hidden="true" />} />
              : tab === 'mapa' ? <MapTab patient={patient} /> : <CompareTab patient={patient} />}
          </TabPanel>
        </>
      )}
    </SpecShell>
  )
}

// ---------------- Mapa ----------------
function BodySvg({ view }: { view: BodyView }) {
  const skin = '#F3E3D6', line = '#9A7B66'
  if (view === 'face') return (
    <g>
      <ellipse cx="150" cy="165" rx="92" ry="122" fill={skin} stroke={line} strokeWidth="2" />
      <path d="M95 128 q17 -10 34 0 M171 128 q17 -10 34 0" stroke={line} strokeWidth="2" fill="none" />
      <path d="M150 140 v45 q-8 8 0 10" stroke={line} strokeWidth="2" fill="none" />
      <path d="M128 228 q22 12 44 0" stroke={line} strokeWidth="2" fill="none" />
    </g>
  )
  return (
    <g fill={skin} stroke={line} strokeWidth="2">
      <circle cx="150" cy="45" r="28" />
      <rect x="112" y="78" width="76" height="140" rx="26" />
      <rect x="72" y="86" width="30" height="110" rx="14" />
      <rect x="198" y="86" width="30" height="110" rx="14" />
      <rect x="114" y="210" width="34" height="110" rx="14" />
      <rect x="152" y="210" width="34" height="110" rx="14" />
      {view === 'costas' && <path d="M150 85 v120" fill="none" strokeDasharray="4 4" />}
    </g>
  )
}

function MapTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const { pros } = useLookup()
  const { canWrite, proId } = useClinicalWriter()
  const all = useCollection(t.tenantId, 'aestheticApplications').filter((a) => a.patientId === patient.id)
  const [view, setView] = useState<BodyView>('face')
  const [region, setRegion] = useState<Region | null>(null)
  const blank = { product: '', amount: '', unit: 'U' as 'U' | 'mL', lot: '', professionalId: proId ?? '', notes: '', sessionDate: todayCivil() }
  const [f, setF] = useState(blank)
  const [err, setErr] = useState<string | null>(null)
  const regions = REGIONS.filter((r) => r.view === view)
  const marks = all.filter((a) => a.view === view)
  const pick = (r: Region) => { setRegion(r); setErr(null) }
  const save = () => {
    if (!region) return setErr('Selecione uma região no mapa ou na lista.')
    const amount = parseNum(f.amount)
    if (!f.product.trim() || !f.lot.trim() || !f.professionalId) return setErr('Produto, lote e profissional são obrigatórios.')
    if (amount == null || Number.isNaN(amount) || amount <= 0) return setErr('Informe a quantidade (maior que zero).')
    if (act(() => {
      const a: AestheticApplication = { id: uid('apl_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, sessionDate: f.sessionDate, view, regionId: region.id, point: { x: region.x, y: region.y }, product: f.product.trim(), amount, unit: f.unit, lot: f.lot.trim(), professionalId: f.professionalId, notes: f.notes || undefined, by: actor.name }
      db.insert(t.tenantId, 'aestheticApplications', a)
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'estetica.aplicacao', resource: 'aestheticApplications', resourceId: a.id, detail: `${region.label}: ${a.amount} ${a.unit}` })
    }, `Aplicação registrada em ${region.label}`)) setF({ ...blank, sessionDate: f.sessionDate, professionalId: f.professionalId, product: f.product, lot: f.lot, unit: f.unit })
  }
  const bySession = groupBy([...all].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate)), (a) => a.sessionDate)
  return (
    <div className="stack">
      <div className="grid grid-2">
        <Section title="Mapa" actions={<div className="segmented" role="group" aria-label="Vista">{(['face', 'frente', 'costas'] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => { setView(v); setRegion(null) }}>{VIEW_LABEL[v]}</button>)}</div>}>
          <div className="stack">
            <ZoomPan label={`Mapa ${VIEW_LABEL[view]}`} height={380}>
              <svg viewBox="0 0 300 330" className="body-map" role="group" aria-label={`Regiões — ${VIEW_LABEL[view]}`}>
                <BodySvg view={view} />
                {regions.map((r) => (
                  <g key={r.id} role="button" tabIndex={0} aria-label={`${r.label}${marks.some((m) => m.regionId === r.id) ? ' (com aplicações)' : ''}`} aria-pressed={region?.id === r.id}
                    onClick={() => pick(r)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(r) } }} className="map-region">
                    <circle cx={r.x} cy={r.y} r={r.r} />
                  </g>
                ))}
                {marks.map((m) => <circle key={m.id} cx={m.point.x} cy={m.point.y} r="4" className="map-mark" />)}
              </svg>
            </ZoomPan>
            <p className="small muted">Clique na região, use Tab + Enter, ou escolha na lista. Pontos marcam aplicações registradas.</p>
          </div>
        </Section>
        <Section title="Registrar aplicação">
          <div className="stack">
            <Field label="Região (alternativa ao mapa)"><Select value={region?.id ?? ''} onChange={(e) => { const r = REGIONS.find((x) => x.id === e.target.value); if (r) pick(r) }}><option value="">Selecione</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
            {!canWrite ? <ReadOnly>Somente profissionais registram aplicações.</ReadOnly> : (
              <>
                {err && <Alert tone="danger">{err}</Alert>}
                <div className="form-grid">
                  <Field label="Data da sessão" required><Input type="date" value={f.sessionDate} max={todayCivil()} onChange={(e) => setF({ ...f, sessionDate: e.target.value })} /></Field>
                  <Field label="Produto" required><Input value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} /></Field>
                  <Field label="Quantidade" required><Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
                  <Field label="Unidade"><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as 'U' | 'mL' })}><option value="U">Unidades (U)</option><option value="mL">Volume (mL)</option></Select></Field>
                  <Field label="Lote" required><Input value={f.lot} onChange={(e) => setF({ ...f, lot: e.target.value })} /></Field>
                  <Field label="Profissional" required><Select value={f.professionalId} onChange={(e) => setF({ ...f, professionalId: e.target.value })}><option value="">Selecione</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
                </div>
                <Field label="Observações"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} /></Field>
                <div><Button variant="primary" icon={<Plus />} onClick={save} data-tour="primary-action">Registrar em {region?.label ?? '…'}</Button></div>
              </>
            )}
          </div>
        </Section>
      </div>
      <Section title="Histórico por sessão">
        {all.length === 0 ? <p className="muted small">Nenhuma aplicação registrada.</p> : Object.entries(bySession).map(([date, list]) => (
          <div key={date} className="stack" style={{ '--gap': '6px', marginBottom: 12 } as React.CSSProperties}>
            <h3 className="small strong">Sessão de {formatCivil(date)}</h3>
            <div className="table-wrap"><table className="table">
              <caption className="sr-only">Aplicações em {formatCivil(date)}</caption>
              <thead><tr><th scope="col">Região</th><th scope="col">Produto</th><th scope="col" className="num">Qtd.</th><th scope="col">Lote</th><th scope="col">Profissional</th><th scope="col">Obs.</th></tr></thead>
              <tbody>{list.map((a) => <tr key={a.id}><td>{regionLabel(a.regionId)}</td><td>{a.product}</td><td className="num">{a.amount.toLocaleString('pt-BR')} {a.unit}</td><td className="mono">{a.lot}</td><td>{proNameOf(pros, a.professionalId)}</td><td className="small">{a.notes ?? '—'}</td></tr>)}</tbody>
            </table></div>
          </div>
        ))}
      </Section>
    </div>
  )
}

// ---------------- Pacotes ----------------
function PackagesTab({ patient }: { patient: Patient | null }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const { pros, service } = useLookup()
  const services = useCollection(t.tenantId, 'services')
  const all = useCollection(t.tenantId, 'aestheticPackages')
  const today = todayCivil()
  const canEdit = t.can('agenda', 'update') || t.can('clinical', 'create')
  const canCreate = t.can('orcamentos', 'create') || t.can('financeiro', 'create')
  const list = patient ? all.filter((p) => p.patientId === patient.id) : all.filter((p) => { const s = packageState(p, today); return s.expiringSoon || s.expired })
  const [open, setOpen] = useState(false)
  const [nf, setNf] = useState({ serviceId: '', sessionsTotal: '6', validUntil: '', price: '' })
  const [err, setErr] = useState<string | null>(null)
  const register = (p: AestheticPackage) => act(() => {
    db.update(t.tenantId, 'aestheticPackages', p.id, (prev) => addPackageSession(prev, { date: today, professionalId: t.access.professionalId, note: `Registrado por ${actor.name}` }, today))
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'pacote.sessao', resource: 'aestheticPackages', resourceId: p.id })
  }, 'Sessão registrada no pacote')
  const create = () => {
    if (!patient) return
    const n = parseNum(nf.sessionsTotal), price = parseNum(nf.price.replace(/\./g, ''))
    const svc = services.find((s) => s.id === nf.serviceId)
    if (!svc) return setErr('Selecione o serviço.')
    if (n == null || Number.isNaN(n) || n < 1 || !Number.isInteger(n)) return setErr('Número de sessões inválido.')
    if (!nf.validUntil || nf.validUntil <= today) return setErr('Validade contratual deve ser futura.')
    if (price == null || Number.isNaN(price) || price < 0) return setErr('Valor inválido.')
    if (act(() => db.insert(t.tenantId, 'aestheticPackages', { id: uid('pkg_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, serviceId: svc.id, name: `${svc.name} — ${n} sessões`, sessionsTotal: n, sessions: [], validUntil: nf.validUntil, priceCents: Math.round(price * 100), status: 'ativo' }), 'Pacote criado')) { setOpen(false); setErr(null) }
  }
  return (
    <Section title={patient ? `Pacotes de ${patient.name}` : 'Pacotes expirando ou vencidos'} actions={patient && canCreate ? <Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)} data-tour="primary-action">Novo pacote</Button> : undefined}>
      {list.length === 0 ? <EmptyState title={patient ? 'Sem pacotes' : 'Nenhum pacote em alerta'}>{patient ? 'Crie um pacote para controlar sessões previstas e realizadas.' : 'Selecione um paciente para ver todos os pacotes.'}</EmptyState> : (
        <div className="grid grid-2">
          {list.map((p) => {
            const s = packageState(p, today)
            return (
              <div key={p.id} className="card tight stack" style={{ '--gap': '8px' } as React.CSSProperties}>
                <div className="row between"><strong>{p.name}</strong>{s.expired ? <Badge tone="danger">Validade vencida</Badge> : p.status === 'concluido' ? <Badge tone="success">Concluído</Badge> : s.expiringSoon ? <Badge tone="warning">Expira em breve</Badge> : <Badge tone="info">Ativo</Badge>}</div>
                <span className="small muted">{service(p.serviceId)?.name} · {formatBRL(p.priceCents)} · validade contratual {formatCivil(p.validUntil)}</span>
                <Progress value={s.done} max={p.sessionsTotal} label={`Sessões realizadas de ${p.name}`} tone={s.expired ? 'danger' : s.expiringSoon ? 'warn' : undefined} />
                <span className="small"><strong>{s.done}</strong> de {p.sessionsTotal} realizadas · {s.remaining} restantes</span>
                {(s.expiringSoon || s.expired) && s.remaining > 0 && <Alert tone={s.expired ? 'danger' : 'warning'}>{s.expired ? 'Validade vencida com sessões não utilizadas. Avalie renovação/exceção com a gestão.' : `${s.remaining} sessão(ões) a consumir até ${formatCivil(p.validUntil)}.`}</Alert>}
                <details><summary>Sessões realizadas</summary>
                  <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>{p.sessions.map((x, i) => <li key={i}>{formatCivil(x.date)} — {proNameOf(pros, x.professionalId)}{x.note ? ` · ${x.note}` : ''}</li>)}</ol>
                </details>
                {canEdit && !s.complete && !s.expired && p.status !== 'cancelado' && <div><Button size="sm" onClick={() => register(p)}>Registrar sessão de hoje</Button></div>}
              </div>
            )
          })}
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Novo pacote" footer={<><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" onClick={create}>Criar pacote</Button></>}>
        <div className="stack">
          {err && <Alert tone="danger">{err}</Alert>}
          <Field label="Serviço" required><Select value={nf.serviceId} onChange={(e) => setNf({ ...nf, serviceId: e.target.value })}><option value="">Selecione</option>{services.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <div className="form-grid">
            <Field label="Sessões previstas" required><Input inputMode="numeric" value={nf.sessionsTotal} onChange={(e) => setNf({ ...nf, sessionsTotal: e.target.value })} /></Field>
            <Field label="Validade contratual" required><Input type="date" value={nf.validUntil} onChange={(e) => setNf({ ...nf, validUntil: e.target.value })} /></Field>
            <Field label="Valor total (R$)" required><Input inputMode="decimal" value={nf.price} onChange={(e) => setNf({ ...nf, price: e.target.value })} placeholder="0,00" /></Field>
          </div>
        </div>
      </Dialog>
    </Section>
  )
}

// ---------------- Comparador ----------------
function Illustration({ variant, after }: { variant: number; after: boolean }) {
  // Ilustração vetorial fictícia — nunca foto real.
  const fold = after ? 0.35 : 1
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="400" height="300" fill={after ? '#EFE4DA' : '#EADBCF'} />
      <ellipse cx="200" cy="160" rx="120" ry="150" fill="#F3E3D6" stroke="#9A7B66" strokeWidth="2" />
      <path d="M150 130 q18 -10 36 0 M214 130 q18 -10 36 0" stroke="#9A7B66" strokeWidth="2.5" fill="none" />
      <path d={`M160 ${200 - 6 * fold} q-${14 * fold} 24 4 44`} stroke="#9A7B66" strokeWidth={1.5 + 2 * fold} fill="none" opacity={0.4 + 0.5 * fold} />
      <path d={`M240 ${200 - 6 * fold} q${14 * fold} 24 -4 44`} stroke="#9A7B66" strokeWidth={1.5 + 2 * fold} fill="none" opacity={0.4 + 0.5 * fold} />
      <path d="M175 250 q25 12 50 0" stroke="#9A7B66" strokeWidth="2.5" fill="none" />
      <text x="12" y="290" fontSize="12" fill="#6B4F3A">Ilustração fictícia #{variant} — não é foto</text>
    </svg>
  )
}

function CompareTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const confirm = useConfirm()
  const { canWrite } = useClinicalWriter()
  const list = useCollection(t.tenantId, 'aestheticComparisons').filter((c) => c.patientId === patient.id)
  const [sel, setSel] = useState<ID | null>(null)
  const c = list.find((x) => x.id === sel) ?? list[0] ?? null
  const upd = (fn: (p: AestheticComparison) => AestheticComparison, msg: string, action: string) => c && act(() => { db.update(t.tenantId, 'aestheticComparisons', c.id, fn); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action, resource: 'aestheticComparisons', resourceId: c.id, detail: msg }) }, msg)
  const setConsent = async (which: 'clinical' | 'marketing', granted: boolean) => {
    const label = which === 'clinical' ? 'uso clínico' : 'uso publicitário'
    const r = await confirm({ title: `${granted ? 'Registrar' : 'Revogar'} consentimento para ${label}?`, body: granted ? 'Registre apenas se houver termo assinado pelo paciente para esta finalidade específica.' : 'A revogação vale a partir de agora e fica registrada.', confirmLabel: granted ? 'Registrar' : 'Revogar', danger: !granted })
    if (!r.ok) return
    const entry: ConsentEntry = { granted, at: nowISO(), by: actor.name }
    upd((p) => ({ ...p, consent: { ...p.consent, [which]: entry }, marketingUse: which === 'marketing' && !granted ? undefined : p.marketingUse, history: [...p.history, { at: nowISO(), by: actor.name, text: `Consentimento para ${label}: ${granted ? 'concedido' : 'revogado'}` }] }), `Consentimento para ${label} ${granted ? 'registrado' : 'revogado'}`, 'estetica.consentimento')
  }
  const create = () => act(() => {
    const id = uid('cmp_')
    db.insert(t.tenantId, 'aestheticComparisons', { id, tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, title: 'Novo comparativo', regionLabel: 'Face (ilustração)', beforeOn: todayCivil(), afterOn: todayCivil(), variant: list.length + 1, offset: { x: 0, y: 0 }, consent: { clinical: { granted: false }, marketing: { granted: false } }, history: [{ at: nowISO(), by: actor.name, text: 'Comparativo criado' }] })
    setSel(id)
  }, 'Comparativo criado (ilustração fictícia)')
  if (!c) return <EmptyState title="Nenhum comparativo" action={canWrite ? <Button variant="primary" onClick={create}>Criar comparativo ilustrativo</Button> : undefined}>{demoText('Imagens são sempre ilustrações fictícias nesta demonstração.', 'Imagens são sempre ilustrações fictícias, nunca fotos reais.')}</EmptyState>
  const clinicalOk = c.consent.clinical.granted
  const mktOk = c.consent.marketing.granted
  return (
    <div className="grid grid-2">
      <Section title={c.title} actions={list.length > 1 ? <Select aria-label="Comparativo" value={c.id} onChange={(e) => setSel(e.target.value)}>{list.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select> : canWrite ? <Button size="sm" onClick={create}>Novo comparativo</Button> : undefined}>
        <div className="stack">
          {clinicalOk ? (
            <ImageCompare label={c.title} offset={c.offset} before={<Illustration variant={c.variant} after={false} />} after={<Illustration variant={c.variant} after />} />
          ) : <Alert tone="warning" title="Sem consentimento para uso clínico">As imagens só são exibidas após o registro do consentimento para uso clínico.</Alert>}
          <p className="small muted">Antes: {formatCivil(c.beforeOn)} · Depois: {formatCivil(c.afterOn)} · {c.regionLabel}. Ilustração simulada; não representa resultado garantido.</p>
          {canWrite && clinicalOk && (
            <fieldset><legend>Ajuste de alinhamento da imagem “depois”</legend>
              <div className="form-grid">
                <Field label={`Deslocamento horizontal (${c.offset.x}px)`}><input type="range" min={-40} max={40} value={c.offset.x} onChange={(e) => db.update(t.tenantId, 'aestheticComparisons', c.id, { offset: { ...c.offset, x: Number(e.target.value) } })} /></Field>
                <Field label={`Deslocamento vertical (${c.offset.y}px)`}><input type="range" min={-40} max={40} value={c.offset.y} onChange={(e) => db.update(t.tenantId, 'aestheticComparisons', c.id, { offset: { ...c.offset, y: Number(e.target.value) } })} /></Field>
              </div>
              <Button size="sm" variant="ghost" onClick={() => upd((p) => ({ ...p, offset: { x: 0, y: 0 } }), 'Alinhamento restaurado', 'estetica.alinhamento')}>Restaurar alinhamento</Button>
            </fieldset>
          )}
        </div>
      </Section>
      <Section title="Consentimento por finalidade">
        <div className="stack">
          <p className="small muted">Cada finalidade é independente. Consentir com uso clínico não autoriza divulgação.</p>
          {(['clinical', 'marketing'] as const).map((w) => {
            const e = c.consent[w]
            return (
              <div key={w} className="list-card">
                <div className="row between"><strong>{w === 'clinical' ? <><ShieldCheck size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-3px' }} /> Uso clínico (prontuário)</> : <><Megaphone size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-3px' }} /> Uso publicitário (divulgação)</>}</strong>{e.granted ? <Badge tone="success">Concedido</Badge> : <Badge tone="warning">Não concedido</Badge>}</div>
                {e.at && <span className="small muted">{e.granted ? 'Registrado' : 'Revogado'} por {e.by} em {formatDateTime(e.at)}</span>}
                {canWrite && <Checkbox label={w === 'clinical' ? 'Paciente consentiu com uso clínico' : 'Paciente consentiu com uso publicitário'} checked={e.granted} onChange={(ev) => setConsent(w, ev.target.checked)} />}
              </div>
            )
          })}
          <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}>
            <Button variant="primary" icon={<Megaphone />} disabled={!mktOk || !canWrite || !!c.marketingUse} aria-describedby="mkt-hint" onClick={() => upd((p) => ({ ...p, marketingUse: { at: nowISO(), by: actor.name }, history: [...p.history, { at: nowISO(), by: actor.name, text: 'Marcado para uso em divulgação' }] }), 'Marcado para uso em divulgação', 'estetica.divulgacao')}>
              {c.marketingUse ? 'Já marcado para divulgação' : 'Usar em divulgação'}
            </Button>
            <span id="mkt-hint" className="small muted">{mktOk ? c.marketingUse ? `Marcado por ${c.marketingUse.by} em ${formatDateTime(c.marketingUse.at)}.` : 'Consentimento publicitário registrado.' : 'Bloqueado: sem consentimento para uso publicitário.'}</span>
          </div>
          <details><summary>Histórico</summary><ul className="small" style={{ margin: 0, paddingLeft: 20 }}>{[...c.history].reverse().map((h, i) => <li key={i}>{formatDateTime(h.at)} — {h.by}: {h.text}</li>)}</ul></details>
        </div>
      </Section>
    </div>
  )
}
