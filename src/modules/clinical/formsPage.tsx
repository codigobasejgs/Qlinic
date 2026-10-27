// /formularios — construtor, prévia validada, versões imutáveis, envio ao paciente e respostas por versão.
import { useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Eye, FilePlus2, Plus, Send, Trash2, Upload } from 'lucide-react'
import type { FormField, FormTemplate } from '@/domain/modules'
import type { ID } from '@/domain/types'
import { useActor, useDraft, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit } from '@/data/repositories'
import { Alert, Badge, Button, Checkbox, Dialog, EmptyState, Field, Input, PageHeader, PatientPicker, Section, Select, Tabs, TabPanel, useAction, useConfirm, useLookup } from '@/ui'
import { formatDateTime } from '@/lib/dates'
import { uid } from '@/lib/util'
import { FIELD_TYPE_LABEL, publishVersion, pruneHidden, validateAnswers, validateSchema, versionOf } from './forms'
import { sendForm } from './lib'
import { FormRenderer } from './shared'

export function FormsPage() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const templates = useCollection(t.tenantId, 'formTemplates')
  const [sel, setSel] = useState<ID | null>(templates[0]?.id ?? null)
  const [tab, setTab] = useState('editar')
  const tpl = templates.find((x) => x.id === sel) ?? null
  const canEdit = t.scope('clinical', 'create') !== false || t.can('configuracoes', 'update')
  if (t.scope('clinical') === false && !t.can('configuracoes')) return <><PageHeader title="Formulários" /><EmptyState title="Seu perfil não acessa formulários clínicos" /></>
  const create = () => {
    const id = uid('ft_')
    if (run(() => { db.insert(t.tenantId, 'formTemplates', { id, tenantId: t.tenantId, createdAt: new Date().toISOString(), name: 'Novo formulário', specialty: t.org.segment, audience: 'paciente', versions: [], currentVersion: 0, active: true }); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'formulario.criado', resource: 'formTemplates', resourceId: id }) }, 'Formulário criado. Monte os campos e publique a versão 1.')) { setSel(id); setTab('editar') }
  }
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Formulários" subtitle="Anamneses e triagens com versões imutáveis. Respostas guardam a versão respondida."
        actions={canEdit ? <Button variant="primary" icon={<FilePlus2 />} onClick={create} data-tour="primary-action">Novo formulário</Button> : undefined} />
      <div className="forms-layout">
        <nav aria-label="Modelos de formulário" className="forms-list">
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, '--gap': '6px' } as React.CSSProperties}>
            {templates.map((x) => (
              <li key={x.id}><button type="button" className="form-pick" aria-current={x.id === sel ? 'true' : undefined} onClick={() => setSel(x.id)}>
                <span className="strong">{x.name}</span>
                <span className="tiny muted">{x.currentVersion ? `v${x.currentVersion} publicada` : 'Sem versão publicada'} · {x.versions.length} versão(ões){!x.active ? ' · inativo' : ''}</span>
              </button></li>
            ))}
          </ul>
        </nav>
        <div className="stack" style={{ minWidth: 0 }}>
          {!tpl ? <EmptyState title="Selecione ou crie um formulário" /> : (
            <>
              <Tabs label="Seções do formulário" value={tab} onChange={setTab} tabs={[{ id: 'editar', label: 'Construtor' }, { id: 'versoes', label: 'Versões', badge: tpl.versions.length || undefined }, { id: 'respostas', label: 'Envios e respostas' }]} />
              <TabPanel>
                {tab === 'editar' && <Builder key={tpl.id} tpl={tpl} canEdit={canEdit} />}
                {tab === 'versoes' && <Versions tpl={tpl} />}
                {tab === 'respostas' && <Responses tpl={tpl} />}
              </TabPanel>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const newField = (type: FormField['type']): FormField => ({ id: uid('f_'), type, label: '', ...(type === 'single' || type === 'multi' ? { options: ['Opção 1', 'Opção 2'] } : {}) })

function Builder({ tpl, canEdit }: { tpl: FormTemplate; canEdit: boolean }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const base = versionOf(tpl, tpl.currentVersion)?.fields ?? []
  const [fields, setFields, clearFields] = useDraft<FormField[]>(`form.${tpl.id}`, base)
  const [name, setName] = useState(tpl.name)
  const [preview, setPreview] = useState(false)
  const dirty = JSON.stringify(fields) !== JSON.stringify(base)
  const problems = validateSchema(fields)
  const upd = (i: number, f: Partial<FormField>) => setFields(fields.map((x, j) => (j === i ? { ...x, ...f } : x)))
  const move = (i: number, d: -1 | 1) => { const n = [...fields]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setFields(n.map((f, j) => (f.showIf && !n.slice(0, j).some((p) => p.id === f.showIf!.fieldId) ? { ...f, showIf: undefined } : f))) }
  const publish = async () => {
    const r = await confirm({ title: `Publicar versão ${Math.max(0, ...tpl.versions.map((v) => v.version)) + 1}?`, body: 'A versão publicada é imutável. Respostas antigas continuam ligadas à versão em que foram respondidas. Envios novos usarão esta versão.', confirmLabel: 'Publicar' })
    if (!r.ok) return
    if (run(() => { const next = publishVersion({ ...tpl, name: name.trim() || tpl.name }, fields, new Date().toISOString()); db.update(t.tenantId, 'formTemplates', tpl.id, next); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'formulario.publicado', resource: 'formTemplates', resourceId: tpl.id, detail: `v${next.currentVersion}` }) }, 'Nova versão publicada.')) clearFields()
  }
  return (
    <div className="stack">
      <div className="form-grid">
        <Field label="Nome do formulário"><Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} onBlur={() => { if (name.trim() && name !== tpl.name) run(() => db.update(t.tenantId, 'formTemplates', tpl.id, { name: name.trim() }), 'Nome atualizado.') }} /></Field>
        <Field label="Público"><Select value={tpl.audience} disabled={!canEdit} onChange={(e) => run(() => db.update(t.tenantId, 'formTemplates', tpl.id, { audience: e.target.value as FormTemplate['audience'] }), 'Público atualizado.')}><option value="paciente">Preenchido pelo paciente/tutor</option><option value="profissional">Preenchido pelo profissional</option></Select></Field>
      </div>
      <Checkbox label="Formulário ativo (disponível para envio)" checked={tpl.active} disabled={!canEdit} onChange={(e) => run(() => db.update(t.tenantId, 'formTemplates', tpl.id, { active: e.target.checked }), e.target.checked ? 'Formulário ativado.' : 'Formulário inativado.')} />
      {dirty ? <Alert tone="info" title="Rascunho da próxima versão">Alterações não afetam a versão publicada nem respostas existentes até você publicar.</Alert> : tpl.currentVersion ? <p className="small muted">Editando a partir da versão {tpl.currentVersion}.</p> : null}
      <ol className="builder">
        {fields.map((f, i) => {
          const prev = fields.slice(0, i).filter((x) => x.type !== 'section')
          const src = prev.find((x) => x.id === f.showIf?.fieldId)
          return (
            <li key={f.id} className="builder-item">
              <div className="row between">
                <Badge tone={f.type === 'section' ? 'brand' : 'neutral'}>{FIELD_TYPE_LABEL[f.type]}</Badge>
                {canEdit && <div className="row nowrap">
                  <Button size="sm" variant="ghost" iconOnly icon={<ArrowUp />} disabled={i === 0} onClick={() => move(i, -1)}>Mover para cima</Button>
                  <Button size="sm" variant="ghost" iconOnly icon={<ArrowDown />} disabled={i === fields.length - 1} onClick={() => move(i, 1)}>Mover para baixo</Button>
                  <Button size="sm" variant="ghost" iconOnly icon={<Copy />} onClick={() => setFields([...fields.slice(0, i + 1), { ...f, id: uid('f_'), label: `${f.label} (cópia)` }, ...fields.slice(i + 1)])}>Duplicar campo</Button>
                  <Button size="sm" variant="ghost" iconOnly icon={<Trash2 />} onClick={() => setFields(fields.filter((x) => x.id !== f.id).map((x) => (x.showIf?.fieldId === f.id ? { ...x, showIf: undefined } : x)))}>Remover campo</Button>
                </div>}
              </div>
              <div className="form-grid">
                <Field label={f.type === 'section' ? 'Título da seção' : 'Pergunta'}><Input value={f.label} disabled={!canEdit} onChange={(e) => upd(i, { label: e.target.value })} /></Field>
                <Field label="Tipo"><Select value={f.type} disabled={!canEdit} onChange={(e) => { const type = e.target.value as FormField['type']; upd(i, { type, options: type === 'single' || type === 'multi' ? f.options ?? ['Opção 1', 'Opção 2'] : undefined }) }}>{Object.entries(FIELD_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                {f.type !== 'section' && <Field label="Texto de ajuda"><Input value={f.help ?? ''} disabled={!canEdit} onChange={(e) => upd(i, { help: e.target.value || undefined })} /></Field>}
              </div>
              {(f.type === 'single' || f.type === 'multi') && <Field label="Opções (uma por linha)"><textarea className="textarea" rows={3} disabled={!canEdit} value={(f.options ?? []).join('\n')} onChange={(e) => upd(i, { options: e.target.value.split('\n') })} onBlur={() => upd(i, { options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) })} /></Field>}
              {f.type !== 'section' && (
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <Checkbox label="Obrigatório" checked={!!f.required} disabled={!canEdit} onChange={(e) => upd(i, { required: e.target.checked })} />
                  {(f.type === 'number' || f.type === 'text' || f.type === 'textarea' || f.type === 'multi') && <>
                    <Field label={f.type === 'number' ? 'Mínimo' : f.type === 'multi' ? 'Mín. de escolhas' : 'Mín. caracteres'}><Input type="number" value={f.min ?? ''} disabled={!canEdit} onChange={(e) => upd(i, { min: e.target.value === '' ? undefined : Number(e.target.value) })} style={{ maxWidth: 120 }} /></Field>
                    <Field label={f.type === 'number' ? 'Máximo' : f.type === 'multi' ? 'Máx. de escolhas' : 'Máx. caracteres'}><Input type="number" value={f.max ?? ''} disabled={!canEdit} onChange={(e) => upd(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })} style={{ maxWidth: 120 }} /></Field>
                  </>}
                </div>
              )}
              {prev.length > 0 && (
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <Field label="Exibir somente se"><Select value={f.showIf?.fieldId ?? ''} disabled={!canEdit} onChange={(e) => upd(i, { showIf: e.target.value ? { fieldId: e.target.value, equals: prev.find((x) => x.id === e.target.value)?.type === 'boolean' ? 'sim' : '' } : undefined })}><option value="">Sempre exibir</option>{prev.map((x) => <option key={x.id} value={x.id}>{x.label || '(sem rótulo)'}</option>)}</Select></Field>
                  {src && <Field label="Valor esperado">{src.type === 'boolean' ? <Select value={f.showIf!.equals} disabled={!canEdit} onChange={(e) => upd(i, { showIf: { ...f.showIf!, equals: e.target.value } })}><option value="sim">Sim</option><option value="nao">Não</option></Select> : src.options ? <Select value={f.showIf!.equals} disabled={!canEdit} onChange={(e) => upd(i, { showIf: { ...f.showIf!, equals: e.target.value } })}><option value="">Selecione</option>{src.options.map((o) => <option key={o}>{o}</option>)}</Select> : <Input value={f.showIf!.equals} disabled={!canEdit} onChange={(e) => upd(i, { showIf: { ...f.showIf!, equals: e.target.value } })} />}</Field>}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {fields.length === 0 && <EmptyState title="Nenhum campo">Adicione perguntas abaixo.</EmptyState>}
      {canEdit && (
        <div className="row" role="group" aria-label="Adicionar campo">
          {(Object.keys(FIELD_TYPE_LABEL) as FormField['type'][]).map((k) => <Button key={k} size="sm" icon={<Plus />} onClick={() => setFields([...fields, newField(k)])}>{FIELD_TYPE_LABEL[k]}</Button>)}
        </div>
      )}
      {problems.length > 0 && fields.length > 0 && <Alert tone="warning" title="Antes de publicar">{problems.slice(0, 4).join(' ')}</Alert>}
      <div className="form-actions">
        <Button icon={<Eye />} onClick={() => setPreview(true)} disabled={!fields.length}>Prévia interativa</Button>
        {canEdit && dirty && <Button variant="ghost" onClick={() => clearFields()}>Descartar rascunho</Button>}
        {canEdit && <Button variant="primary" icon={<Upload />} onClick={publish} disabled={!dirty && tpl.currentVersion > 0}>Publicar nova versão</Button>}
      </div>
      {preview && <PreviewDialog fields={fields} title={name} onClose={() => setPreview(false)} />}
    </div>
  )
}

function PreviewDialog({ fields, title, onClose }: { fields: FormField[]; title: string; onClose: () => void }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [ok, setOk] = useState(false)
  return (
    <Dialog open onClose={onClose} size="lg" title={`Prévia: ${title}`} description="Como o paciente verá. Nada é salvo."
      footer={<><Button onClick={() => { setAnswers({}); setErrors({}); setOk(false) }}>Limpar</Button><Button variant="primary" onClick={() => { const e = validateAnswers(fields, answers); setErrors(e); setOk(!Object.keys(e).length) }}>Validar respostas</Button></>}>
      <div className="stack">
        {ok && <Alert tone="success" title="Respostas válidas">Dados que seriam salvos: {Object.keys(pruneHidden(fields, answers)).length} campo(s) (campos ocultos por condição são descartados).</Alert>}
        <FormRenderer fields={fields} answers={answers} onChange={(a) => { setAnswers(a); setOk(false); if (Object.keys(errors).length) setErrors(validateAnswers(fields, a)) }} errors={errors} />
      </div>
    </Dialog>
  )
}

function Versions({ tpl }: { tpl: FormTemplate }) {
  const responses = useCollection(useTenant().tenantId, 'formResponses').filter((r) => r.templateId === tpl.id)
  const [view, setView] = useState<number | null>(null)
  if (!tpl.versions.length) return <EmptyState title="Nenhuma versão publicada" />
  const v = view != null ? versionOf(tpl, view) : null
  return (
    <div className="stack">
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">Versões publicadas</caption>
          <thead><tr><th scope="col">Versão</th><th scope="col">Publicada em</th><th scope="col" className="num">Campos</th><th scope="col" className="num">Respostas</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{[...tpl.versions].reverse().map((x) => <tr key={x.version}><td>v{x.version} {x.version === tpl.currentVersion && <Badge tone="success">Atual</Badge>}</td><td>{x.publishedAt ? formatDateTime(x.publishedAt) : '—'}</td><td className="num">{x.fields.filter((f) => f.type !== 'section').length}</td><td className="num">{responses.filter((r) => r.templateVersion === x.version).length}</td><td className="right"><Button size="sm" onClick={() => setView(x.version)}>Ver campos</Button></td></tr>)}</tbody>
        </table>
      </div>
      {v && <Dialog open onClose={() => setView(null)} size="lg" title={`${tpl.name} · v${v.version}`} description="Versão imutável (somente leitura)."><FormRenderer fields={v.fields} answers={{}} readOnly /></Dialog>}
    </div>
  )
}

function Responses({ tpl }: { tpl: FormTemplate }) {
  const t = useTenant()
  const L = useLookup()
  const actor = useActor()
  const run = useAction()
  const responses = useCollection(t.tenantId, 'formResponses').filter((r) => r.templateId === tpl.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const [patientId, setPatientId] = useState<ID | null>(null)
  const [verFilter, setVerFilter] = useState<number | ''>('')
  const [view, setView] = useState<ID | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const canSend = t.can('pacientes') && (t.scope('clinical', 'create') !== false || t.can('recepcao', 'create'))
  const shown = responses.filter((r) => verFilter === '' || r.templateVersion === verFilter)
  const viewing = responses.find((r) => r.id === view)
  const vFields = viewing ? versionOf(tpl, viewing.templateVersion)?.fields ?? [] : []
  return (
    <div className="stack">
      {canSend && (
        <Section title="Enviar ao paciente">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="grow"><PatientPicker value={patientId} onChange={setPatientId} error={err} filter={(p) => t.allowedUnits.some((u) => u.id === p.unitId)} /></div>
            <Button variant="primary" icon={<Send />} onClick={() => { if (!patientId) { setErr('Selecione o paciente.'); return } setErr(null); if (run(() => sendForm(t.tenantId, tpl, patientId, actor), `Enviado (v${tpl.currentVersion}). O paciente preenche pelo portal.`)) setPatientId(null) }}>Enviar v{tpl.currentVersion || '—'}</Button>
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>Cria um pendente visível no portal do paciente/responsável. Sem envio de mensagem real.</p>
        </Section>
      )}
      <div className="row between">
        <Field label="Versão"><Select value={verFilter} onChange={(e) => setVerFilter(e.target.value === '' ? '' : Number(e.target.value))}><option value="">Todas</option>{tpl.versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}</Select></Field>
        <span className="small muted" aria-live="polite">{shown.length} envio(s)</span>
      </div>
      {shown.length === 0 ? <EmptyState title="Nenhum envio" /> : (
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, '--gap': '8px' } as React.CSSProperties}>
          {shown.map((r) => (
            <li key={r.id} className="card tight row between">
              <div className="stack" style={{ '--gap': '2px' } as React.CSSProperties}><strong>{L.patient(r.patientId)?.name ?? 'Paciente'}</strong><span className="small muted">v{r.templateVersion}{r.templateVersion !== tpl.currentVersion ? ' (versão anterior)' : ''} · enviado {formatDateTime(r.createdAt)}{r.submittedAt ? ` · respondido ${formatDateTime(r.submittedAt)}` : ''}</span></div>
              <div className="row"><Badge tone={r.status === 'enviado' ? 'success' : 'warning'}>{r.status === 'enviado' ? 'Respondido' : 'Pendente no portal'}</Badge>{r.status === 'enviado' && <Button size="sm" onClick={() => setView(r.id)}>Ver respostas</Button>}</div>
            </li>
          ))}
        </ul>
      )}
      {viewing && <Dialog open onClose={() => setView(null)} size="lg" title={`Respostas · ${L.patient(viewing.patientId)?.name}`} description={`Respondido na versão ${viewing.templateVersion}. Exibido com os campos dessa versão.`}><FormRenderer fields={vFields} answers={viewing.answers} readOnly /></Dialog>}
    </div>
  )
}
