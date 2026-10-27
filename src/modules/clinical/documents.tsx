// /documentos — lista/filtro, editor com templates versionados, prévia imprimível, fluxo de assinatura demonstrativo, liberação ao portal.
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Ban, FilePlus2, Printer, Send, ShieldCheck, Timer, UserPlus, X } from 'lucide-react'
import type { ClinicDocument, DocumentKind, ID } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { useCollection } from '@/data/store'
import { audit, documentRepo } from '@/data/repositories'
import { canSeeDocument } from '@/domain/access'
import {
  Alert, Badge, Button, Checkbox, ClinicLogo, DataTable, DemoPaper, Dialog, DocumentEditor, EmptyState, Field, Input, PageHeader, PatientPicker, Section, Select, SignaturePad, SimBadge, Textarea, Timeline, fillTemplate, useAction, useConfirm, useLookup, type Column,
} from '@/ui'
import { formatCivil, formatDateTime, todayCivil, addDaysCivil, zonedToInstant } from '@/lib/dates'
import { uid, normalize } from '@/lib/util'
import { DEMO_ONLY_KINDS, DOC_KIND_LABEL, DOC_VARIABLES, docTemplatesFor, type DocTemplate } from './templates'
import { expireFlow, newSignatureFlow, portalRecipients, releaseDocument, requestSignatures, signerAct } from './lib'

const EDITABLE_KINDS: DocumentKind[] = ['receita', 'atestado', 'orientacao', 'termo', 'declaracao', 'encaminhamento', 'pedido_exame', 'relatorio', 'laudo']
const SIG_LABEL: Record<ClinicDocument['signature']['status'], string> = { nao_requerida: 'Sem assinatura', pendente: 'Aguardando', parcial: 'Parcial', assinado: 'Assinado', recusado: 'Recusado', expirado: 'Expirado' }

export function DocumentsPage() {
  const t = useTenant()
  const L = useLookup()
  const [sp, setSp] = useSearchParams()
  const docs = useCollection(t.tenantId, 'documents')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<DocumentKind | ''>('')
  const [status, setStatus] = useState<ClinicDocument['status'] | ''>('')
  const [portal, setPortal] = useState<'' | 'sim' | 'nao'>('')
  const openId = sp.get('doc')
  const creating = sp.get('novo') === '1'
  const setParam = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k === 'doc') n.delete('novo'); setSp(n, { replace: true }) }
  const allowedPatients = new Set(L.patients.filter((p) => t.allowedUnits.some((u) => u.id === p.unitId)).map((p) => p.id))
  const visible = docs.filter((d) => allowedPatients.has(d.patientId) && canSeeDocument(t, d))
  const hidden = docs.filter((d) => allowedPatients.has(d.patientId)).length - visible.length
  const nq = normalize(q)
  const rows = visible.filter((d) => (!kind || d.kind === kind) && (!status || d.status === status) && (!portal || d.releasedToPortal === (portal === 'sim')) && (!nq || normalize(`${d.title} ${L.patient(d.patientId)?.name ?? ''}`).includes(nq))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (!t.can('documentos')) return <><PageHeader title="Documentos" /><EmptyState title="Seu perfil não acessa documentos" /></>
  const cols: Column<ClinicDocument>[] = [
    { id: 'title', header: 'Documento', value: (d) => d.title, cell: (d) => d.title },
    { id: 'patient', header: 'Paciente', value: (d) => L.patient(d.patientId)?.name ?? '', cell: (d) => L.patient(d.patientId)?.name ?? '—' },
    { id: 'kind', header: 'Tipo', value: (d) => DOC_KIND_LABEL[d.kind], cell: (d) => DOC_KIND_LABEL[d.kind] },
    { id: 'status', header: 'Status', value: (d) => d.status, cell: (d) => <Badge tone={d.status === 'emitido' ? 'success' : d.status === 'cancelado' ? 'neutral' : 'warning'}>{d.status === 'emitido' ? 'Emitido' : d.status === 'cancelado' ? 'Cancelado' : 'Rascunho'}</Badge> },
    { id: 'sig', header: 'Assinatura', value: (d) => d.signature.status, cell: (d) => <span className="small">{SIG_LABEL[d.signature.status]}</span> },
    { id: 'portal', header: 'Portal', value: (d) => (d.releasedToPortal ? 1 : 0), cell: (d) => d.releasedToPortal ? <Badge tone="info">Liberado</Badge> : <Badge plain>Interno</Badge> },
    { id: 'date', header: 'Criado em', value: (d) => d.createdAt, cell: (d) => <span className="small">{formatDateTime(d.createdAt)}</span> },
  ]
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Documentos" subtitle="Modelos versionados, prévia imprimível e assinatura demonstrativa."
        actions={t.can('documentos', 'create') ? <Button variant="primary" icon={<FilePlus2 />} onClick={() => setParam('novo', '1')} data-tour="primary-action">Novo documento</Button> : undefined} />
      <Alert tone="warning" title="Documentos de demonstração">Sem validade legal ou fiscal. Assinatura simulada não equivale a ICP-Brasil e não há carimbo de tempo certificado. Receitas e atestados ficam como rascunho demonstrativo (prescrição real = integração futura).</Alert>
      {hidden > 0 && <p className="small muted">{hidden} documento(s) restrito(s) oculto(s) para seu perfil.</p>}
      <div className="filters">
        <Field label="Buscar"><Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título ou paciente" /></Field>
        <Field label="Tipo"><Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="">Todos</option>{Object.entries(DOC_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="">Todos</option><option value="rascunho">Rascunho</option><option value="emitido">Emitido</option><option value="cancelado">Cancelado</option></Select></Field>
        <Field label="Portal"><Select value={portal} onChange={(e) => setPortal(e.target.value as typeof portal)}><option value="">Todos</option><option value="sim">Liberados</option><option value="nao">Internos</option></Select></Field>
      </div>
      <DataTable caption="Documentos da clínica" rows={rows} columns={cols} rowKey={(d) => d.id} onRowClick={(d) => setParam('doc', d.id)} empty={<EmptyState title="Nenhum documento encontrado" />} />
      {creating && <NewDocDialog initialPatient={sp.get('paciente')} onClose={() => setParam('novo', null)} onCreated={(id) => setParam('doc', id)} />}
      {openId && (() => { const d = visible.find((x) => x.id === openId); return d ? <DocDrawer doc={d} onClose={() => setParam('doc', null)} /> : null })()}
    </div>
  )
}

function useVars(patientId: ID | null) {
  const t = useTenant()
  const L = useLookup()
  const actor = useActor()
  const links = useCollection(t.tenantId, 'links')
  const persons = useCollection(t.tenantId, 'persons')
  return useMemo(() => {
    const p = L.patient(patientId ?? undefined)
    const pro = L.pro(t.access.professionalId) ?? L.pros[0]
    const resp = links.find((l) => l.patientId === patientId && l.relation !== 'self')
    const respName = resp ? persons.find((x) => x.id === resp.personId)?.name : p?.name
    const unit = L.unit(p?.unitId) ?? t.units[0]
    return {
      paciente_nome: p?.name ?? '[paciente]', paciente_cpf: p?.cpf ?? '[CPF não informado]', paciente_nascimento: formatCivil(p?.birthDate), responsavel_nome: respName ?? '[responsável]',
      profissional_nome: t.access.professionalId ? pro?.name ?? actor.name : pro?.name ?? actor.name, profissional_registro: pro?.council ?? '', clinica_nome: t.org.name, clinica_cnpj: t.org.document,
      clinica_cidade: t.org.city, unidade_endereco: unit?.address ?? '', data_hoje: formatCivil(todayCivil(unit?.timezone)),
    }
  }, [L, t, actor.name, links, persons, patientId])
}

function NewDocDialog({ onClose, onCreated, initialPatient }: { onClose: () => void; onCreated: (id: ID) => void; initialPatient: string | null }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const [patientId, setPatientId] = useState<ID | null>(initialPatient)
  const [kind, setKind] = useState<DocumentKind>('orientacao')
  const tpls = docTemplatesFor(kind)
  const [tplKey, setTplKey] = useState('')
  const tpl: DocTemplate | undefined = tpls.find((x) => `${x.id}@${x.version}` === tplKey) ?? [...tpls].sort((a, b) => b.version - a.version)[0]
  const [body, setBody] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [restricted, setRestricted] = useState(t.org.segment === 'psicologia' && kind === 'relatorio')
  const [err, setErr] = useState<string | null>(null)
  const vars = useVars(patientId)
  const text = body ?? tpl?.body ?? ''
  const create = () => {
    if (!patientId) { setErr('Selecione o paciente.'); return }
    setErr(null)
    let id = ''
    if (run(() => {
      const d: ClinicDocument = { id: uid('doc_'), tenantId: t.tenantId, createdAt: new Date().toISOString(), patientId, kind, title: (title ?? tpl?.title ?? DOC_KIND_LABEL[kind]).trim() || DOC_KIND_LABEL[kind], body: text, templateId: tpl?.id, templateVersion: tpl?.version, status: 'rascunho', releasedToPortal: false, confidentiality: restricted ? 'restrito' : 'padrao', signature: newSignatureFlow(), createdBy: t.access.professionalId ?? actor.id, demoWatermark: true }
      documentRepo.save(t.tenantId, d)
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'documento.criado', resource: 'documents', resourceId: d.id, detail: `${DOC_KIND_LABEL[kind]}${tpl ? ` · modelo ${tpl.id} v${tpl.version}` : ''}` })
      id = d.id
    }, 'Rascunho criado.')) onCreated(id)
  }
  return (
    <Dialog open onClose={onClose} size="xl" title="Novo documento" description="Escolha o modelo; variáveis são preenchidas com os dados do paciente e da clínica."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={create}>Criar rascunho</Button></>}>
      <div className="doc-editor-grid">
        <div className="stack">
          <PatientPicker value={patientId} onChange={setPatientId} required error={err} filter={(p) => t.allowedUnits.some((u) => u.id === p.unitId)} />
          <div className="form-grid">
            <Field label="Tipo"><Select value={kind} onChange={(e) => { setKind(e.target.value as DocumentKind); setTplKey(''); setBody(null); setTitle(null) }}>{EDITABLE_KINDS.map((k) => <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>)}</Select></Field>
            <Field label="Modelo (versão)"><Select value={tpl ? `${tpl.id}@${tpl.version}` : ''} onChange={(e) => { setTplKey(e.target.value); setBody(null); setTitle(null) }}>{tpls.length === 0 && <option value="">Em branco</option>}{tpls.map((x) => <option key={`${x.id}@${x.version}`} value={`${x.id}@${x.version}`}>{x.title} · v{x.version}</option>)}</Select></Field>
          </div>
          {DEMO_ONLY_KINDS.includes(kind) && <Alert tone="warning">{DOC_KIND_LABEL[kind]} permanece como rascunho demonstrativo. Emissão real depende de integração futura.</Alert>}
          <Field label="Título"><Input value={title ?? tpl?.title ?? DOC_KIND_LABEL[kind]} onChange={(e) => setTitle(e.target.value)} /></Field>
          <DocumentEditor value={text} onChange={setBody} variables={DOC_VARIABLES} />
          <Checkbox label="Documento restrito (somente autor e perfis com acesso restrito)" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
        </div>
        <div className="stack">
          <h3 className="h-sm">Prévia</h3>
          <DocPreview title={title ?? tpl?.title ?? ''} body={fillTemplate(text, vars)} meta={tpl ? `Modelo ${tpl.id} v${tpl.version}` : 'Sem modelo'} />
        </div>
      </div>
    </Dialog>
  )
}

function DocPreview({ title, body, meta }: { title: string; body: string; meta?: string }) {
  const t = useTenant()
  return (
    <DemoPaper>
      <div className="row between" style={{ marginBottom: 20 }}>
        <ClinicLogo org={t.org} height={36} />
        <div className="right tiny" style={{ color: '#475569' }}>{t.org.legalName}<br />CNPJ {t.org.document}<br />{t.org.city}</div>
      </div>
      <h2 style={{ fontSize: 18, marginBottom: 16, color: '#102A43' }}>{title}</h2>
      <p className="pre" style={{ color: '#102A43' }}>{body}</p>
      <p className="tiny" style={{ marginTop: 28, color: '#475569' }}>Documento de demonstração gerado no Qlinic. Sem validade legal/fiscal.{meta ? ` ${meta}.` : ''}</p>
    </DemoPaper>
  )
}

function DocDrawer({ doc, onClose }: { doc: ClinicDocument; onClose: () => void }) {
  const t = useTenant()
  const L = useLookup()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const nav = useNavigate()
  const vars = useVars(doc.patientId)
  const [body, setBody] = useState(doc.body)
  const [title, setTitle] = useState(doc.title)
  const p = L.patient(doc.patientId)
  const isDraft = doc.status === 'rascunho'
  const canEdit = isDraft && (t.can('documentos', 'update', { ownerProfessionalId: doc.createdBy }) || t.access.professionalId === doc.createdBy || t.scope('documentos', 'create') === 'all')
  const demoOnly = DEMO_ONLY_KINDS.includes(doc.kind)
  const dirty = body !== doc.body || title !== doc.title
  const filled = fillTemplate(body, vars)
  const save = (patch: Partial<ClinicDocument>, msg: string, action: string) => run(() => { documentRepo.save(t.tenantId, { ...doc, ...patch }); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action, resource: 'documents', resourceId: doc.id }) }, msg)
  const emit = async () => {
    const r = await confirm({ title: 'Emitir documento?', body: 'O conteúdo com as variáveis preenchidas é congelado. Depois disso, alterações exigem cancelamento e novo documento.', confirmLabel: 'Emitir' })
    if (r.ok) save({ body: filled, title: title.trim() || doc.title, status: 'emitido', signature: { ...doc.signature, trail: [...doc.signature.trail, { at: new Date().toISOString(), event: `Emitido por ${actor.name}` }] } }, 'Documento emitido.', 'documento.emitido')
  }
  const cancel = async () => {
    const r = await confirm({ title: 'Cancelar documento?', danger: true, requireReason: true, confirmLabel: 'Cancelar documento' })
    if (r.ok) save({ status: 'cancelado', releasedToPortal: false, signature: { ...doc.signature, trail: [...doc.signature.trail, { at: new Date().toISOString(), event: `Cancelado: ${r.reason}` }] } }, 'Documento cancelado.', 'documento.cancelado')
  }
  const release = async () => {
    const rec = portalRecipients(t.tenantId, doc.patientId)
    const r = await confirm({ title: 'Liberar ao portal?', confirmLabel: 'Liberar', body: <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}><p>O documento ficará visível no portal para quem tem permissão clínica neste paciente.</p><p className="small">Aviso enviado a: {rec.map((x) => x.name).join(', ') || 'ninguém (sem pessoa vinculada com permissão)'} — apenas link, sem conteúdo clínico.</p><SimBadge /></div> })
    if (r.ok) run(() => releaseDocument(t.tenantId, doc, t.org.slug, actor), 'Documento liberado ao portal. Aviso enfileirado (simulado).')
  }
  return (
    <Dialog open onClose={onClose} drawer size="lg" title={doc.title} description={`${DOC_KIND_LABEL[doc.kind]} · ${p?.name ?? ''}${doc.templateId ? ` · modelo ${doc.templateId} v${doc.templateVersion}` : ''}`}
      footer={<>
        {canEdit && dirty && <Button onClick={() => save({ body, title: title.trim() || doc.title }, 'Rascunho salvo.', 'documento.editado')}>Salvar rascunho</Button>}
        {canEdit && !demoOnly && <Button variant="primary" disabled={dirty} onClick={emit} title={dirty ? 'Salve antes de emitir' : undefined}>Emitir</Button>}
        {doc.status === 'emitido' && !doc.releasedToPortal && t.can('documentos', 'create') && <Button variant="primary" icon={<Send />} onClick={release}>Liberar ao portal</Button>}
        <Button icon={<Printer />} onClick={() => window.print()}>Imprimir</Button>
      </>}>
      <div className="stack">
        <div className="row">
          <Badge tone={doc.status === 'emitido' ? 'success' : doc.status === 'cancelado' ? 'neutral' : 'warning'}>{doc.status === 'emitido' ? 'Emitido' : doc.status === 'cancelado' ? 'Cancelado' : 'Rascunho'}</Badge>
          {doc.releasedToPortal ? <Badge tone="info">Liberado ao portal</Badge> : <Badge plain>Interno</Badge>}
          {doc.confidentiality === 'restrito' && <Badge tone="danger">Restrito</Badge>}
          {p && <Button size="sm" variant="link" onClick={() => nav(`${t.base}/pacientes/${p.id}`)}>Abrir paciente</Button>}
        </div>
        {demoOnly && <Alert tone="warning">{DOC_KIND_LABEL[doc.kind]}: rascunho demonstrativo. Emissão e prescrição reais dependem de integração futura.</Alert>}
        {canEdit && <>
          <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <DocumentEditor value={body} onChange={setBody} variables={DOC_VARIABLES} />
        </>}
        <DocPreview title={title} body={isDraft ? filled : doc.body} meta={doc.templateId ? `Modelo ${doc.templateId} v${doc.templateVersion}` : undefined} />
        {doc.status === 'emitido' && <SignatureSection doc={doc} />}
        <Section title="Trilha do documento"><Timeline items={[...doc.signature.trail].reverse().map((e) => ({ time: formatDateTime(e.at), title: e.event }))} /></Section>
        {doc.status !== 'cancelado' && t.can('documentos', 'create') && <div className="row end"><Button size="sm" variant="ghost" icon={<Ban />} onClick={cancel}>Cancelar documento</Button></div>}
      </div>
    </Dialog>
  )
}

function SignatureSection({ doc }: { doc: ClinicDocument }) {
  const t = useTenant()
  const L = useLookup()
  const actor = useActor()
  const run = useAction()
  const p = L.patient(doc.patientId)
  const s = doc.signature
  const [signers, setSigners] = useState<{ name: string; role: string }[]>(() => [{ name: p?.name ?? '', role: p?.kind === 'animal' ? 'Tutor' : 'Paciente/Responsável' }, { name: L.pro(t.access.professionalId)?.name ?? L.pros[0]?.name ?? '', role: 'Profissional' }])
  const [days, setDays] = useState('7')
  const [acting, setActing] = useState<number | null>(null)
  const [refuse, setRefuse] = useState('')
  const persist = (d: ClinicDocument, msg: string) => run(() => { documentRepo.save(t.tenantId, d); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'documento.assinatura', resource: 'documents', resourceId: doc.id, detail: d.signature.trail[d.signature.trail.length - 1]?.event }) }, msg)
  const open = s.status === 'pendente' || s.status === 'parcial'
  const nextOrder = s.signers.filter((x) => x.status === 'pendente').sort((a, b) => a.order - b.order)[0]?.order
  return (
    <Section title={<span className="row">Fluxo de assinatura <SimBadge>Demonstrativo</SimBadge></span>}>
      <div className="stack">
        <p className="small"><ShieldCheck size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} /> Fluxo simples demonstrativo: <strong>não equivale a ICP-Brasil; sem carimbo de tempo certificado</strong>. Não coletamos selfie nem geolocalização.</p>
        {s.status === 'nao_requerida' || s.status === 'recusado' || s.status === 'expirado' ? (
          <>
            {s.status !== 'nao_requerida' && <Alert tone="warning">Fluxo anterior {SIG_LABEL[s.status].toLowerCase()}. Você pode iniciar um novo.</Alert>}
            <fieldset><legend>Signatários (na ordem)</legend>
              <ol className="stack" style={{ paddingLeft: 18, margin: 0, '--gap': '8px' } as React.CSSProperties}>
                {signers.map((x, i) => (
                  <li key={i}><div className="row" style={{ alignItems: 'flex-end' }}>
                    <div className="grow"><Field label={`Nome do signatário ${i + 1}`}><Input value={x.name} onChange={(e) => setSigners(signers.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} /></Field></div>
                    <Field label="Papel"><Input value={x.role} onChange={(e) => setSigners(signers.map((y, j) => (j === i ? { ...y, role: e.target.value } : y)))} /></Field>
                    <Button iconOnly variant="ghost" icon={<X />} onClick={() => setSigners(signers.filter((_, j) => j !== i))} disabled={signers.length < 2}>Remover signatário</Button>
                  </div></li>
                ))}
              </ol>
              <div className="row" style={{ marginTop: 8, alignItems: 'flex-end' }}>
                <Button size="sm" icon={<UserPlus />} onClick={() => setSigners([...signers, { name: '', role: 'Testemunha' }])}>Adicionar signatário</Button>
                <Field label="Expira em (dias)"><Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} style={{ maxWidth: 120 }} /></Field>
              </div>
            </fieldset>
            <div className="form-actions"><Button variant="primary" onClick={() => { const n = Number(days); persist(requestSignatures(doc, signers, n > 0 ? zonedToInstant(addDaysCivil(todayCivil(), n), 23 * 60 + 59) : undefined), 'Assinaturas solicitadas (simulado).') }}>Solicitar assinaturas</Button></div>
          </>
        ) : null}
        {s.signers.length > 0 && (
          <ol className="signers">
            {s.signers.sort((a, b) => a.order - b.order).map((x) => (
              <li key={x.order} className="row between">
                <span><strong>{x.order}. {x.name}</strong> <span className="small muted">· {x.role}</span>{x.at && <span className="small muted"> · {formatDateTime(x.at)}</span>}</span>
                <span className="row">
                  <Badge tone={x.status === 'assinado' ? 'success' : x.status === 'recusado' ? 'danger' : 'warning'}>{x.status === 'assinado' ? 'Assinado' : x.status === 'recusado' ? 'Recusou' : x.order === nextOrder && open ? 'Vez de assinar' : 'Aguardando'}</Badge>
                  {open && x.order === nextOrder && <Button size="sm" onClick={() => { setActing(x.order); setRefuse('') }}>Simular ação</Button>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {s.expiresAt && <p className="small muted"><Timer size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} /> Expira em {formatDateTime(s.expiresAt)} · Status: {SIG_LABEL[s.status]}</p>}
        {open && <div className="row end"><Button size="sm" variant="ghost" onClick={() => persist(expireFlow(doc), 'Fluxo expirado (simulação).')}>Simular expiração</Button></div>}
        {acting !== null && (
          <Dialog open onClose={() => setActing(null)} title={`Ação do signatário ${acting}`} description="Simulação do que o signatário faria no link de assinatura.">
            <div className="stack">
              <SignaturePad signerName={s.signers.find((x) => x.order === acting)?.name ?? ''} onSign={(r) => { if (persist(signerAct(doc, acting, 'assinar', { method: r.method }), 'Assinatura registrada (demonstração).')) setActing(null) }} />
              <hr />
              <Field label="Ou recusar — motivo"><Textarea rows={2} value={refuse} onChange={(e) => setRefuse(e.target.value)} /></Field>
              <div className="row end"><Button variant="danger" disabled={!refuse.trim()} onClick={() => { if (persist(signerAct(doc, acting, 'recusar', { reason: refuse }), 'Recusa registrada.')) setActing(null) }}>Registrar recusa</Button></div>
            </div>
          </Dialog>
        )}
      </div>
    </Section>
  )
}
