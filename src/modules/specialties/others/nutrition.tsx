// Nutrição: anamnese alimentar estruturada, medidas com comparação, plano alimentar versionado editado pelo profissional → revisar → liberar.
import { useState } from 'react'
import { Apple, Plus, Trash2 } from 'lucide-react'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit } from '@/data/repositories'
import type { NutritionPlan } from '@/domain/modules'
import type { Patient } from '@/domain/types'
import { Alert, Badge, Button, EmptyState, Field, Input, Section, Select, Tabs, TabPanel, Textarea, useAction, useConfirm, useLookup } from '@/ui'
import { formatCivil, formatDateTime, nowISO, todayCivil } from '@/lib/dates'
import { uid } from '@/lib/util'
import { bmi, diffAssessments } from './lib'
import type { NutritionAnamnesis, NutritionAssessment } from './types'
import { NoAccess, ReadOnly, SpecShell, parseNum, proNameOf, useClinicalWriter } from './common'

export function NutritionPage() {
  const t = useTenant()
  const [tab, setTab] = useState('plano')
  return (
    <SpecShell title="Nutrição" module="nutricao" filter={(p) => p.kind === 'human'} subtitle="Anamnese alimentar, medidas e evolução, plano alimentar editado e revisado pelo profissional.">
      {(patient) => (
        <>
          <Alert tone="info" title="Nada é gerado automaticamente">Nenhuma dieta ou meta clínica é gerada automaticamente. O plano é escrito, revisado e liberado pelo nutricionista.</Alert>
          <Tabs value={tab} onChange={setTab} label="Seções da nutrição" tabs={[{ id: 'plano', label: 'Plano alimentar' }, { id: 'medidas', label: 'Medidas e evolução' }, { id: 'anamnese', label: 'Anamnese alimentar' }]} />
          <TabPanel>
            {t.scope('clinical') === false ? <NoAccess /> : !patient ? <EmptyState title="Selecione um paciente" icon={<Apple aria-hidden="true" />} />
              : tab === 'plano' ? <PlanTab patient={patient} /> : tab === 'medidas' ? <MeasuresTab patient={patient} /> : <AnamnesisTab patient={patient} />}
          </TabPanel>
        </>
      )}
    </SpecShell>
  )
}

const ANAM_FIELDS: { key: keyof NutritionAnamnesis; label: string; multiline?: boolean }[] = [
  { key: 'routine', label: 'Rotina e horários', multiline: true }, { key: 'preferences', label: 'Preferências' }, { key: 'aversions', label: 'Aversões' },
  { key: 'intolerances', label: 'Intolerâncias/alergias relatadas' }, { key: 'supplements', label: 'Suplementos em uso' }, { key: 'activity', label: 'Atividade física' },
  { key: 'sleep', label: 'Sono' }, { key: 'bowel', label: 'Hábito intestinal' }, { key: 'notes', label: 'Observações', multiline: true },
]

function AnamnesisTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const act = useAction()
  const { pros } = useLookup()
  const { canWrite, proId } = useClinicalWriter()
  const list = useCollection(t.tenantId, 'nutritionAnamneses').filter((a) => a.patientId === patient.id).sort((a, b) => b.date.localeCompare(a.date))
  const cur = list[0]
  const empty = { mealsPerDay: '4', waterL: '', routine: '', preferences: '', aversions: '', intolerances: '', supplements: '', activity: '', sleep: '', bowel: '', notes: '' }
  const [f, setF] = useState<typeof empty | null>(null)
  const start = () => setF(cur ? { ...empty, ...Object.fromEntries(ANAM_FIELDS.map((x) => [x.key, String(cur[x.key] ?? '')])), mealsPerDay: String(cur.mealsPerDay), waterL: String(cur.waterL).replace('.', ',') } : empty)
  const save = () => f && act(() => {
    const meals = Number(f.mealsPerDay), water = parseNum(f.waterL)
    if (!Number.isInteger(meals) || meals < 1 || meals > 12) throw new Error('Refeições por dia entre 1 e 12.')
    if (water == null || Number.isNaN(water) || water < 0 || water > 15) throw new Error('Água (L/dia) inválida.')
    db.insert(t.tenantId, 'nutritionAnamneses', { ...f, id: uid('na_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, professionalId: proId!, date: todayCivil(), mealsPerDay: meals, waterL: water })
    setF(null)
  }, 'Anamnese registrada (nova versão)')
  return (
    <Section title="Anamnese alimentar" actions={canWrite && !f ? <Button variant="primary" onClick={start} data-tour="primary-action">{cur ? 'Atualizar anamnese' : 'Registrar anamnese'}</Button> : undefined}>
      {f ? (
        <div className="stack">
          <div className="form-grid">
            <Field label="Refeições por dia" required><Input inputMode="numeric" value={f.mealsPerDay} onChange={(e) => setF({ ...f, mealsPerDay: e.target.value })} /></Field>
            <Field label="Água (litros/dia)" required><Input inputMode="decimal" value={f.waterL} onChange={(e) => setF({ ...f, waterL: e.target.value })} /></Field>
          </div>
          <div className="form-grid">{ANAM_FIELDS.map((x) => <Field key={x.key} label={x.label}>{x.multiline ? <Textarea value={f[x.key as keyof typeof f]} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} rows={2} /> : <Input value={f[x.key as keyof typeof f]} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} />}</Field>)}</div>
          <div className="form-actions"><Button onClick={() => setF(null)}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar</Button></div>
        </div>
      ) : !cur ? <p className="muted small">Sem anamnese registrada.</p> : (
        <div className="stack">
          <p className="small muted">Registrada em {formatCivil(cur.date)} por {proNameOf(pros, cur.professionalId)}{list.length > 1 ? ` · ${list.length - 1} versão(ões) anterior(es)` : ''}</p>
          <dl className="grid grid-3" style={{ margin: 0 }}>
            <div><dt className="small muted">Refeições/dia</dt><dd style={{ margin: 0 }} className="strong">{cur.mealsPerDay}</dd></div>
            <div><dt className="small muted">Água</dt><dd style={{ margin: 0 }} className="strong">{cur.waterL.toLocaleString('pt-BR')} L/dia</dd></div>
            {ANAM_FIELDS.map((x) => <div key={x.key}><dt className="small muted">{x.label}</dt><dd style={{ margin: 0 }}>{String(cur[x.key] || '—')}</dd></div>)}
          </dl>
          {!canWrite && <ReadOnly>Somente o profissional atualiza a anamnese.</ReadOnly>}
        </div>
      )}
    </Section>
  )
}

function MeasuresTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const act = useAction()
  const { canWrite, proId } = useClinicalWriter()
  const list = useCollection(t.tenantId, 'nutritionAssessments').filter((a) => a.patientId === patient.id).sort((a, b) => a.date.localeCompare(b.date))
  const [aId, setA] = useState<string>('')
  const [bId, setB] = useState<string>('')
  const a = list.find((x) => x.id === aId) ?? list.at(-2)
  const b = list.find((x) => x.id === bId) ?? list.at(-1)
  const blank = { date: todayCivil(), weightKg: '', heightCm: String(list.at(-1)?.heightCm ?? ''), waistCm: '', hipCm: '', armCm: '', bodyFatPct: '', notes: '' }
  const [f, setF] = useState(blank)
  const [err, setErr] = useState<string | null>(null)
  const save = () => {
    const n = (s: string) => parseNum(s)
    const w = n(f.weightKg), h = n(f.heightCm)
    if (w == null || Number.isNaN(w) || w <= 0 || w > 400) return setErr('Peso (kg) obrigatório e válido.')
    if (h == null || Number.isNaN(h) || h < 40 || h > 250) return setErr('Altura (cm) obrigatória e válida.')
    const opt = (s: string, max: number) => { const v = n(s); if (v == null) return undefined; if (Number.isNaN(v) || v <= 0 || v > max) throw new Error('Medida opcional inválida.'); return v }
    if (act(() => {
      const r: NutritionAssessment = { id: uid('nm_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, professionalId: proId!, date: f.date, weightKg: w, heightCm: h, waistCm: opt(f.waistCm, 300), hipCm: opt(f.hipCm, 300), armCm: opt(f.armCm, 100), bodyFatPct: opt(f.bodyFatPct, 80), notes: f.notes }
      db.insert(t.tenantId, 'nutritionAssessments', r)
    }, 'Avaliação registrada')) { setF(blank); setErr(null) }
  }
  const diff = a && b && a.id !== b.id ? diffAssessments(a, b) : null
  return (
    <div className="stack">
      <Section title="Comparação entre avaliações">
        {list.length < 2 ? <p className="muted small">Registre ao menos duas avaliações para comparar.</p> : (
          <div className="stack">
            <div className="form-grid">
              <Field label="Avaliação inicial"><Select value={a?.id} onChange={(e) => setA(e.target.value)}>{list.map((x) => <option key={x.id} value={x.id}>{formatCivil(x.date)}</option>)}</Select></Field>
              <Field label="Avaliação final"><Select value={b?.id} onChange={(e) => setB(e.target.value)}>{list.map((x) => <option key={x.id} value={x.id}>{formatCivil(x.date)}</option>)}</Select></Field>
            </div>
            {diff ? (
              <div className="table-wrap"><table className="table">
                <caption>Diferenças entre {formatCivil(a!.date)} e {formatCivil(b!.date)}</caption>
                <thead><tr><th scope="col">Medida</th><th scope="col" className="num">{formatCivil(a!.date)}</th><th scope="col" className="num">{formatCivil(b!.date)}</th><th scope="col" className="num">Diferença</th></tr></thead>
                <tbody>{diff.map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{r.before != null ? `${r.before.toLocaleString('pt-BR')} ${r.unit}` : '—'}</td><td className="num">{r.after != null ? `${r.after.toLocaleString('pt-BR')} ${r.unit}` : '—'}</td><td className="num">{r.delta != null ? `${r.delta > 0 ? '+' : ''}${r.delta.toLocaleString('pt-BR')} ${r.unit}` : '—'}</td></tr>)}</tbody>
              </table></div>
            ) : <Alert tone="neutral">Selecione duas avaliações diferentes.</Alert>}
            <p className="small muted">IMC é cálculo matemático; % de gordura é valor informado (método externo). Interpretação cabe ao profissional.</p>
          </div>
        )}
      </Section>
      <Section title="Histórico de medidas">
        <div className="stack">
          <div className="table-wrap"><table className="table">
            <caption className="sr-only">Avaliações antropométricas</caption>
            <thead><tr><th scope="col">Data</th><th scope="col" className="num">Peso</th><th scope="col" className="num">Altura</th><th scope="col" className="num">IMC</th><th scope="col" className="num">Cintura</th><th scope="col" className="num">% gordura (inf.)</th></tr></thead>
            <tbody>{[...list].reverse().map((x) => <tr key={x.id}><td>{formatCivil(x.date)}</td><td className="num">{x.weightKg} kg</td><td className="num">{x.heightCm} cm</td><td className="num">{bmi(x.weightKg, x.heightCm)}</td><td className="num">{x.waistCm ?? '—'}</td><td className="num">{x.bodyFatPct ?? '—'}</td></tr>)}</tbody>
          </table></div>
          {canWrite ? (
            <fieldset><legend>Nova avaliação</legend>
              {err && <Alert tone="danger">{err}</Alert>}
              <div className="form-grid">
                <Field label="Data"><Input type="date" value={f.date} max={todayCivil()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
                <Field label="Peso (kg)" required><Input inputMode="decimal" value={f.weightKg} onChange={(e) => setF({ ...f, weightKg: e.target.value })} /></Field>
                <Field label="Altura (cm)" required><Input inputMode="decimal" value={f.heightCm} onChange={(e) => setF({ ...f, heightCm: e.target.value })} /></Field>
                <Field label="Cintura (cm)"><Input inputMode="decimal" value={f.waistCm} onChange={(e) => setF({ ...f, waistCm: e.target.value })} /></Field>
                <Field label="Quadril (cm)"><Input inputMode="decimal" value={f.hipCm} onChange={(e) => setF({ ...f, hipCm: e.target.value })} /></Field>
                <Field label="Braço (cm)"><Input inputMode="decimal" value={f.armCm} onChange={(e) => setF({ ...f, armCm: e.target.value })} /></Field>
                <Field label="% gordura (informado)" hint="Valor medido por método externo"><Input inputMode="decimal" value={f.bodyFatPct} onChange={(e) => setF({ ...f, bodyFatPct: e.target.value })} /></Field>
              </div>
              <div className="form-actions"><Button variant="primary" icon={<Plus />} onClick={save}>Registrar avaliação</Button></div>
            </fieldset>
          ) : <ReadOnly>Somente o profissional registra medidas.</ReadOnly>}
        </div>
      </Section>
    </div>
  )
}

type Meal = NutritionPlan['meals'][number]
function PlanTab({ patient }: { patient: Patient }) {
  const t = useTenant()
  const act = useAction()
  const actor = useActor()
  const confirm = useConfirm()
  const { pros } = useLookup()
  const { canWrite, proId } = useClinicalWriter()
  const plans = useCollection(t.tenantId, 'nutritionPlans').filter((p) => p.patientId === patient.id).sort((a, b) => b.version - a.version)
  const latest = plans[0]
  const draft = latest?.status === 'rascunho' ? latest : null
  const released = plans.find((p) => p.status === 'liberado')
  const [view, setView] = useState<string>('')
  const shown = plans.find((p) => p.id === view) ?? draft ?? released ?? latest
  const upd = (fn: (p: NutritionPlan) => NutritionPlan) => draft && db.update(t.tenantId, 'nutritionPlans', draft.id, fn)
  const newVersion = () => act(() => {
    if (draft) throw new Error('Já existe um rascunho em edição.')
    const base = released ?? latest
    db.insert(t.tenantId, 'nutritionPlans', { id: uid('np_'), tenantId: t.tenantId, createdAt: nowISO(), patientId: patient.id, professionalId: proId!, version: (latest?.version ?? 0) + 1, title: base?.title ?? 'Plano alimentar', meals: base ? base.meals.map((m) => ({ ...m, items: [...m.items] })) : [], guidance: base?.guidance ?? '', releasedToPortal: false, status: 'rascunho' })
    setView('')
  }, 'Nova versão em rascunho')
  const review = () => act(() => {
    if (!draft) return
    if (!draft.meals.length || draft.meals.some((m) => !m.name.trim() || !m.time || !m.items.some((i) => i.trim()))) throw new Error('Cada refeição precisa de nome, horário e ao menos um item.')
    upd((p) => ({ ...p, meals: p.meals.map((m) => ({ ...m, items: m.items.filter((i) => i.trim()) })), reviewedAt: nowISO() }))
  }, 'Plano revisado pelo profissional')
  const release = async () => {
    if (!draft?.reviewedAt) return
    const r = await confirm({ title: `Liberar versão ${draft.version} ao portal?`, body: released ? `A versão ${released.version} atualmente liberada será substituída e deixará de aparecer no portal.` : 'O paciente verá este plano no portal.', confirmLabel: 'Liberar' })
    if (!r.ok) return
    act(() => {
      plans.filter((p) => p.status === 'liberado').forEach((p) => db.update(t.tenantId, 'nutritionPlans', p.id, { status: 'substituido', releasedToPortal: false }))
      db.update(t.tenantId, 'nutritionPlans', draft.id, { status: 'liberado', releasedToPortal: true })
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'nutricao.plano_liberado', resource: 'nutritionPlans', resourceId: draft.id, detail: `v${draft.version}` })
    }, `Versão ${draft.version} liberada ao portal`)
  }
  const recall = () => released && act(() => db.update(t.tenantId, 'nutritionPlans', released.id, { releasedToPortal: !released.releasedToPortal }), released.releasedToPortal ? 'Plano recolhido do portal' : 'Plano exibido no portal')
  const editMeal = (id: string, patch: Partial<Meal>) => upd((p) => ({ ...p, reviewedAt: undefined, meals: p.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))
  if (!latest) return <EmptyState title="Sem plano alimentar" action={canWrite ? <Button variant="primary" onClick={newVersion} data-tour="primary-action">Começar plano (em branco)</Button> : undefined}>O plano começa em branco: o profissional escreve cada refeição.</EmptyState>
  const editing = !!draft && shown?.id === draft.id && canWrite
  return (
    <Section title={`Plano alimentar — versão ${shown.version}`} actions={
      <div className="row">
        <Select aria-label="Versão" value={shown.id} onChange={(e) => setView(e.target.value)} style={{ width: 'auto' }}>{plans.map((p) => <option key={p.id} value={p.id}>v{p.version} — {p.status === 'liberado' ? 'liberado' : p.status === 'rascunho' ? 'rascunho' : 'substituído'}</option>)}</Select>
        {canWrite && !draft && <Button variant="primary" onClick={newVersion} data-tour="primary-action">Nova versão</Button>}
      </div>}>
      <div className="stack">
        <div className="steps-inline row">
          <Badge tone={shown.status === 'rascunho' ? 'warning' : 'neutral'}>1. Edição</Badge>
          <Badge tone={shown.reviewedAt ? 'success' : 'neutral'}>2. Revisado {shown.reviewedAt ? `em ${formatDateTime(shown.reviewedAt)}` : ''}</Badge>
          <Badge tone={shown.status === 'liberado' ? 'success' : 'neutral'}>3. {shown.status === 'liberado' ? (shown.releasedToPortal ? 'Liberado ao portal' : 'Liberado (oculto do portal)') : shown.status === 'substituido' ? 'Substituído' : 'Não liberado'}</Badge>
        </div>
        <p className="small muted">Responsável: {proNameOf(pros, shown.professionalId)}</p>
        {!canWrite && <ReadOnly>Somente o profissional edita e libera o plano.</ReadOnly>}
        {editing ? <Field label="Título"><Input value={shown.title} onChange={(e) => upd((p) => ({ ...p, title: e.target.value, reviewedAt: undefined }))} /></Field> : null}
        <div className="grid grid-2">
          {shown.meals.map((m) => (
            <div key={m.id} className="card tight stack" style={{ '--gap': '8px' } as React.CSSProperties}>
              {editing ? (
                <>
                  <div className="form-grid">
                    <Field label="Refeição"><Input value={m.name} onChange={(e) => editMeal(m.id, { name: e.target.value })} /></Field>
                    <Field label="Horário"><Input type="time" value={m.time} onChange={(e) => editMeal(m.id, { time: e.target.value })} /></Field>
                  </div>
                  <Field label="Itens (um por linha)"><Textarea value={m.items.join('\n')} onChange={(e) => editMeal(m.id, { items: e.target.value.split('\n') })} rows={4} /></Field>
                  <Field label="Observação"><Input value={m.notes ?? ''} onChange={(e) => editMeal(m.id, { notes: e.target.value || undefined })} /></Field>
                  <div><Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => upd((p) => ({ ...p, reviewedAt: undefined, meals: p.meals.filter((x) => x.id !== m.id) }))}>Remover refeição</Button></div>
                </>
              ) : (
                <>
                  <div className="row between"><strong>{m.name}</strong><span className="num muted">{m.time}</span></div>
                  <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>{m.items.map((i, k) => <li key={k}>{i}</li>)}</ul>
                  {m.notes && <span className="small muted">{m.notes}</span>}
                </>
              )}
            </div>
          ))}
        </div>
        {editing && <div><Button icon={<Plus />} onClick={() => upd((p) => ({ ...p, reviewedAt: undefined, meals: [...p.meals, { id: uid('m_'), name: '', time: '', items: [''] }] }))}>Adicionar refeição</Button></div>}
        {editing ? <Field label="Orientações gerais"><Textarea value={shown.guidance} onChange={(e) => upd((p) => ({ ...p, guidance: e.target.value, reviewedAt: undefined }))} rows={3} /></Field> : shown.guidance && <p className="small"><strong>Orientações:</strong> {shown.guidance}</p>}
        {editing && (
          <div className="form-actions">
            <Button variant="danger" onClick={() => draft && act(() => db.remove(t.tenantId, 'nutritionPlans', draft.id), 'Rascunho descartado')}>Descartar rascunho</Button>
            <Button onClick={review} disabled={!!draft?.reviewedAt}>{draft?.reviewedAt ? 'Revisado' : 'Marcar como revisado'}</Button>
            <Button variant="primary" onClick={release} disabled={!draft?.reviewedAt}>Liberar ao portal</Button>
          </div>
        )}
        {canWrite && shown.status === 'liberado' && <div><Button size="sm" variant="ghost" onClick={recall}>{shown.releasedToPortal ? 'Ocultar do portal' : 'Exibir no portal'}</Button></div>}
      </div>
    </Section>
  )
}
