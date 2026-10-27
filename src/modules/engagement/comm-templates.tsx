// Aba Eventos e templates: destinatário, escopo, canais, template por canal, versão, prévia com marca, transacional × marketing.
import { useMemo, useState } from 'react'
import { Save, History } from 'lucide-react'
import type { Channel } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { Alert, Badge, Button, Checkbox, DataTable, Field, Input, Section, Segmented, Select, Textarea, Timeline, fillTemplate, useAction, type Column } from '@/ui'
import { formatDateTime, formatDateLong, nowISO } from '@/lib/dates'
import { CHANNEL_LABEL, EVENTS } from './catalog'
import { sensitiveTerms, validateFrom } from './rules'
import { EmailPreview, PushPreview, WhatsAppPreview } from './preview'
import type { NotificationTemplate, Recipient } from './types'
import { cssVars } from './ui'

const RECIPIENT_LABEL: Record<Recipient, string> = { paciente_responsavel: 'Paciente/tutor/responsável', equipe: 'Equipe interna', proprietario: 'Proprietário', convidado: 'Pessoa convidada' }
const VARS = [{ key: 'nome', label: 'Nome' }, { key: 'clinica', label: 'Clínica' }, { key: 'data', label: 'Data/hora' }, { key: 'link', label: 'Link do portal' }]

const nameOf = (tp: NotificationTemplate) => tp.name ?? EVENTS[tp.event].label

export function TemplatesTab() {
  const t = useTenant()
  const tpls = useCollection(t.tenantId, 'notificationTemplates')
  const [sel, setSel] = useState<string>(tpls[0]?.id ?? '')
  const [cat, setCat] = useState<'todos' | 'transacional' | 'marketing'>('todos')
  const rows = tpls.filter((x) => cat === 'todos' || x.category === cat)
  const cur = tpls.find((x) => x.id === sel)
  const cols: Column<NotificationTemplate>[] = [
    { id: 'ev', header: 'Evento', cell: (x) => nameOf(x), value: (x) => nameOf(x) },
    { id: 'rec', header: 'Destinatário', cell: (x) => RECIPIENT_LABEL[x.recipient] },
    { id: 'ch', header: 'Canais', cell: (x) => (Object.keys(x.channels) as Channel[]).filter((c) => x.channels[c]).map((c) => CHANNEL_LABEL[c]).join(', ') || '—' },
    { id: 'cat', header: 'Tipo', cell: (x) => <Badge tone={x.category === 'marketing' ? 'warning' : 'neutral'}>{x.category === 'marketing' ? 'Marketing' : 'Transacional'}</Badge>, value: (x) => x.category },
    { id: 'v', header: 'Versão', cell: (x) => `v${x.version}${x.active ? '' : ' (inativo)'}`, value: (x) => x.version, num: true },
  ]
  return (
    <div className="stack">
      <Alert tone="info" title="Regras de conteúdo">Lembretes e push não levam diagnóstico nem nome de procedimento sensível. Documentos e resultados vão por link para o portal (com login), nunca como anexo clínico. Marketing exige opt-in e sempre oferece opt-out.</Alert>
      <div className="eng-split">
        <div className="stack" style={cssVars({ '--gap': '8px' })}>
          <Segmented label="Filtrar por tipo" value={cat} onChange={setCat} options={[{ value: 'todos', label: 'Todos' }, { value: 'transacional', label: 'Transacional' }, { value: 'marketing', label: 'Marketing' }]} />
          <DataTable caption="Eventos de comunicação" rows={rows} columns={cols} rowKey={(x) => x.id} onRowClick={(x) => { setSel(x.id); requestAnimationFrame(() => document.getElementById('eng-tpl-editor')?.scrollIntoView({ block: 'start' })) }} pageSize={25} />
        </div>
        <div id="eng-tpl-editor" style={{ scrollMarginTop: 72 }}>{cur ? <TemplateEditor key={`${cur.id}:${cur.version}`} tp={cur} /> : <p className="muted">Selecione um evento.</p>}</div>
      </div>
    </div>
  )
}

function TemplateEditor({ tp }: { tp: NotificationTemplate }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const services = useCollection(t.tenantId, 'services')
  const cfg = useCollection(t.tenantId, 'emailConfig')[0]
  const domains = useCollection(t.tenantId, 'emailDomains')
  const [d, setD] = useState(tp)
  const [note, setNote] = useState('')
  const [view, setView] = useState<Channel>(tp.channels.email ? 'email' : tp.channels.whatsapp ? 'whatsapp' : 'push')
  const canEdit = t.can('comunicacao', 'update')
  const meta = EVENTS[d.event]
  const vars = { nome: 'Ana', clinica: t.org.name, data: formatDateLong(nowISO(), t.unit?.timezone), link: `${location.origin}/c/${t.org.slug}/portal` }
  const svcNames = useMemo(() => services.map((s) => s.name), [services])
  const warnings = useMemo(() => {
    const w: string[] = []
    for (const c of ['whatsapp', 'push'] as const) if (d.channels[c]) { const hit = sensitiveTerms(d.bodies[c], svcNames); if (hit.length) w.push(`${CHANNEL_LABEL[c]}: contém termo sensível (${hit.join(', ')}). Remova — tela bloqueada e notificações não podem expor dados clínicos.`) }
    if (d.channels.email) { const hit = sensitiveTerms(`${d.bodies.emailSubject} ${d.bodies.email}`, svcNames); if (hit.length) w.push(`E-mail: termo sensível (${hit.join(', ')}). Use o link do portal.`) }
    if (d.category === 'marketing' && !/prefer|opt-out|deixar de receber|descadastr/i.test(d.bodies.email)) w.push('Marketing: inclua instrução de opt-out (ex.: “Para deixar de receber, ajuste suas preferências”).')
    return w
  }, [d, svcNames])
  const from = cfg ? validateFrom(cfg, domains, t.org.slug) : null
  const dirty = JSON.stringify(d) !== JSON.stringify(tp)
  const save = () => run(() => {
    if (!canEdit) throw new Error('Sem permissão para editar templates.')
    if (warnings.some((w) => w.includes('termo sensível'))) throw new Error('Corrija o conteúdo sensível antes de salvar.')
    if (d.category === 'marketing' && warnings.length) throw new Error(warnings[0])
    if (!Object.values(d.channels).some(Boolean) && d.active) throw new Error('Habilite ao menos um canal ou desative o evento.')
    const v = tp.version + 1
    db.update(t.tenantId, 'notificationTemplates', tp.id, { ...d, version: v, history: [...tp.history, { version: v, at: nowISO(), by: actor.name, note: note.trim() || undefined }] })
  }, `Template salvo como nova versão (v${tp.version + 1}).`)
  const setBody = (k: keyof NotificationTemplate['bodies'], v: string) => setD({ ...d, bodies: { ...d.bodies, [k]: v } })
  return (
    <Section title={nameOf(d)} actions={<Badge tone="brand" plain>v{tp.version}</Badge>}>
      <div className="stack">
        <p className="small muted">Destinatário: <strong>{RECIPIENT_LABEL[d.recipient]}</strong> · Escopo: {meta.scope}</p>
        <div className="form-grid">
          <Field label="Tipo de comunicação" hint={d.category === 'marketing' ? 'Enviado só a quem deu opt-in; sem opt-in ⇒ suprimido.' : 'Operacional, ligado a um atendimento/conta.'}>
            <Select value={d.category} disabled={!canEdit} onChange={(e) => setD({ ...d, category: e.target.value as NotificationTemplate['category'] })}><option value="transacional">Transacional</option><option value="marketing">Marketing</option></Select>
          </Field>
          <Checkbox label="Evento ativo" checked={d.active} disabled={!canEdit} onChange={(e) => setD({ ...d, active: e.target.checked })} />
        </div>
        <fieldset><legend>Canais habilitados</legend><div className="row">{(['whatsapp', 'email', 'push'] as Channel[]).map((c) => <Checkbox key={c} label={CHANNEL_LABEL[c]} checked={d.channels[c]} disabled={!canEdit} onChange={(e) => setD({ ...d, channels: { ...d.channels, [c]: e.target.checked } })} />)}</div></fieldset>
        <p className="small muted">Variáveis: {VARS.map((v) => <code key={v.key} className="kbd" style={{ marginRight: 4 }}>{`{{${v.key}}}`}</code>)}</p>
        {d.channels.whatsapp && <Field label="Texto do WhatsApp"><Textarea rows={3} value={d.bodies.whatsapp} disabled={!canEdit} onChange={(e) => setBody('whatsapp', e.target.value)} /></Field>}
        {d.channels.push && <Field label="Texto do push (máx. 120)" hint={`${d.bodies.push.length}/120`}><Input maxLength={120} value={d.bodies.push} disabled={!canEdit} onChange={(e) => setBody('push', e.target.value)} /></Field>}
        {d.channels.email && <>
          <Field label="Assunto do e-mail"><Input value={d.bodies.emailSubject} disabled={!canEdit} onChange={(e) => setBody('emailSubject', e.target.value)} /></Field>
          <Field label="Corpo do e-mail (texto puro)" hint="Sem HTML: a marca e o layout são aplicados pelo sistema."><Textarea rows={5} value={d.bodies.email} disabled={!canEdit} onChange={(e) => setBody('email', e.target.value)} /></Field>
        </>}
        <div aria-live="polite">{warnings.map((w) => <Alert key={w} tone="warning">{w}</Alert>)}</div>
        <div className="stack" style={cssVars({ '--gap': '8px' })}>
          <h3>Prévia com a marca da clínica</h3>
          <Segmented label="Canal da prévia" value={view} onChange={setView} options={(['email', 'whatsapp', 'push'] as Channel[]).filter((c) => d.channels[c]).map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))} />
          {view === 'email' && d.channels.email && <EmailPreview org={t.org} subject={fillTemplate(d.bodies.emailSubject, vars)} body={fillTemplate(d.bodies.email, vars)} fromHeader={from?.ok ? from.header : `${t.org.name} <remetente inválido>`} replyTo={cfg?.replyTo} marketing={d.category === 'marketing'} portalPath={`/c/${t.org.slug}/portal`} />}
          {view === 'whatsapp' && d.channels.whatsapp && <WhatsAppPreview body={fillTemplate(d.bodies.whatsapp, vars)} orgName={t.org.name} />}
          {view === 'push' && d.channels.push && <PushPreview body={fillTemplate(d.bodies.push, vars)} org={t.org} />}
        </div>
        {canEdit && <Field label="Nota da versão (opcional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: texto mais curto" /></Field>}
        <div className="form-actions"><Button variant="primary" icon={<Save />} disabled={!canEdit || !dirty} onClick={save}>Salvar nova versão</Button></div>
        {!canEdit && <Alert tone="neutral">Seu perfil pode visualizar, mas não editar templates.</Alert>}
        <details><summary><History size={16} aria-hidden="true" style={{ marginRight: 6 }} />Histórico de versões ({tp.history.length})</summary>
          <Timeline items={[...tp.history].reverse().map((h) => ({ time: formatDateTime(h.at, t.unit?.timezone), title: `v${h.version} — ${h.by}`, body: h.note }))} />
        </details>
      </div>
    </Section>
  )
}
