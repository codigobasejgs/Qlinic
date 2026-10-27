// Portal: formulários, propostas, tratamento, vacinas, preferências e perfil.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Bell, BellOff, CheckCircle2, Download, FileSignature, Laptop, MessageSquare, Save, Send, Syringe } from 'lucide-react'
import { db, useCollection } from '@/data/store'
import type { ID, Person } from '@/domain/types'
import type { FormField, FormResponse } from '@/domain/modules'
import { Alert, Badge, Button, Checkbox, demoText, EmptyState, Field, Input, Select, Textarea } from '@/ui/core'
import { Dialog, useAction } from '@/ui/overlay'
import { pushState, requestPushPermission, useConfirmLeave, useNetworkStatus, type PushState } from '@/pwa/client'
import { formatCivil, formatDateTime, hhmmToMinutes, minutesToHHMM, nowISO, todayCivil } from '@/lib/dates'
import { uid } from '@/lib/util'
import { useActivePatient, RELATION_LABEL, type LinkedPatient } from './ctx'
import { cleanAnswers, isFieldVisible, validateForm } from './lib'
import { NoPermission, OFFLINE_HINT, ProposalExperience } from './shared'

function useP() {
  const ctx = useActivePatient()
  return { ...ctx, a: ctx.active as LinkedPatient, by: `${ctx.person.name} (portal)` }
}
function Title({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return <div className="page-head"><div className="ph-text"><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>{actions && <div className="ph-actions">{actions}</div>}</div>
}

// ---------- Formulários ----------
export function PortalFormsPage() {
  const { org, a } = useP()
  const responses = useCollection(org.id, 'formResponses')
  const templates = useCollection(org.id, 'formTemplates')
  const [openId, setOpenId] = useState<ID | null>(null)
  const mine = responses.filter((r) => r.patientId === a.patient.id)
  const pending = mine.filter((r) => r.status === 'pendente')
  const sent = mine.filter((r) => r.status === 'enviado').sort((x, y) => (y.submittedAt ?? '').localeCompare(x.submittedAt ?? ''))
  const name = (r: FormResponse) => templates.find((t) => t.id === r.templateId)?.name ?? 'Formulário'
  const current = mine.find((r) => r.id === openId)
  if (current) return <FormFill response={current} onClose={() => setOpenId(null)} />
  return (
    <div className="stack" data-tour="page-content">
      <Title title="Formulários" subtitle={`Pedidos da clínica para ${a.patient.name}.`} />
      <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties} aria-labelledby="f-p">
        <h2 id="f-p" style={{ fontSize: 17 }}>Para preencher</h2>
        {pending.length === 0 ? <EmptyState title="Nenhum formulário pendente">Quando a clínica pedir uma anamnese ou questionário, ele aparece aqui.</EmptyState> : (
          <ul className="pt-list">{pending.map((r) => (
            <li key={r.id} className="pt-card">
              <div className="row between"><h3>{name(r)}</h3><Badge tone="warning">{Object.keys(r.answers).length ? 'Rascunho salvo' : 'Pendente'}</Badge></div>
              <Button variant="primary" onClick={() => setOpenId(r.id)} style={{ alignSelf: 'flex-start' }} data-tour="primary-action">{Object.keys(r.answers).length ? 'Continuar' : 'Preencher'}</Button>
            </li>
          ))}</ul>
        )}
      </section>
      <section className="stack" style={{ '--gap': '8px' } as React.CSSProperties} aria-labelledby="f-s">
        <h2 id="f-s" style={{ fontSize: 17 }}>Enviados</h2>
        {sent.length === 0 ? <p className="muted small">Nenhum formulário enviado.</p> : (
          <ul className="pt-list">{sent.map((r) => <li key={r.id} className="row between pt-card"><span className="strong">{name(r)}</span><span className="small muted"><Badge tone="success">Enviado</Badge> {r.submittedAt && formatDateTime(r.submittedAt)}</span></li>)}</ul>
        )}
      </section>
    </div>
  )
}

function FormFill({ response, onClose }: { response: FormResponse; onClose: () => void }) {
  const { org, person, a } = useP()
  const templates = useCollection(org.id, 'formTemplates')
  const tpl = templates.find((t) => t.id === response.templateId)
  const fields: FormField[] = tpl?.versions.find((v) => v.version === response.templateVersion)?.fields ?? []
  const [answers, setAnswers] = useState<Record<ID, unknown>>(response.answers)
  const [errors, setErrors] = useState<Record<ID, string>>({})
  const [dirty, setDirty] = useState(false)
  const online = useNetworkStatus()
  const act = useAction()
  useConfirmLeave(dirty)
  const set = (id: ID, v: unknown) => { setAnswers((s) => ({ ...s, [id]: v })); setDirty(true); if (errors[id]) setErrors((e) => { const n = { ...e }; delete n[id]; return n }) }
  const saveDraft = () => { if (act(() => db.update(org.id, 'formResponses', response.id, { answers }), 'Rascunho salvo.')) setDirty(false) }
  const submit = () => {
    const errs = validateForm(fields, answers)
    setErrors(errs)
    const first = Object.keys(errs)[0]
    if (first) { document.getElementById(`ff-${first}`)?.focus(); return }
    if (act(() => db.update(org.id, 'formResponses', response.id, (prev) => {
      if (prev.status === 'enviado') throw new Error('Este formulário já foi enviado.')
      return { ...prev, answers: cleanAnswers(fields, answers), status: 'enviado', submittedAt: nowISO(), submittedBy: a.relation === 'self' ? 'paciente' : 'responsavel' }
    }), 'Formulário enviado à clínica.')) { setDirty(false); onClose() }
  }
  if (!tpl || !fields.length) return <div className="stack"><Alert tone="danger">Modelo do formulário não encontrado (versão {response.templateVersion}).</Alert><Button onClick={onClose}>Voltar</Button></div>
  const errCount = Object.keys(errors).length
  return (
    <form className="stack pt-form" data-tour="page-content" onSubmit={(e) => { e.preventDefault(); submit() }} noValidate>
      <Title title={tpl.name} subtitle={`Versão ${response.templateVersion} · respondendo como ${person.name}`} />
      {errCount > 0 && <Alert tone="danger" title={`${errCount} campo(s) precisam de atenção`}>Revise os campos destacados.</Alert>}
      <div className="pt-card stack">
        {fields.filter((f) => isFieldVisible(f, answers)).map((f) => <FormInput key={f.id} f={f} value={answers[f.id]} error={errors[f.id]} onChange={(v) => set(f.id, v)} />)}
      </div>
      <div className="form-actions">
        <Button onClick={() => { if (!dirty || window.confirm('Sair sem salvar o rascunho?')) onClose() }}>Voltar</Button>
        <Button icon={<Save />} onClick={saveDraft}>Salvar rascunho</Button>
        <Button type="submit" variant="primary" icon={<Send />} disabled={!online} data-tour="primary-action">Enviar</Button>
      </div>
      {!online && <p className="small" role="status">{OFFLINE_HINT}</p>}
    </form>
  )
}

function FormInput({ f, value, error, onChange }: { f: FormField; value: unknown; error?: string; onChange: (v: unknown) => void }) {
  const id = `ff-${f.id}`
  if (f.type === 'section') return <h2 style={{ fontSize: 16, marginTop: 8 }}>{f.label}</h2>
  if (f.type === 'single' || f.type === 'multi' || f.type === 'boolean') {
    const opts = f.type === 'boolean' ? ['Sim', 'Não'] : f.options ?? []
    const errId = error ? `${id}-err` : undefined
    return (
      <fieldset aria-describedby={[f.help ? `${id}-h` : '', errId ?? ''].join(' ').trim() || undefined} aria-invalid={error ? true : undefined}>
        <legend>{f.label}{f.required && <span className="req" aria-hidden="true">*</span>}{f.required && <span className="sr-only"> (obrigatório)</span>}</legend>
        {f.help && <p id={`${id}-h`} className="small muted">{f.help}</p>}
        {opts.map((o, i) => {
          const checked = f.type === 'multi' ? Array.isArray(value) && value.includes(o) : f.type === 'boolean' ? value === (o === 'Sim') : value === o
          return (
            <label key={o} className="check">
              <input id={i === 0 ? id : undefined} type={f.type === 'multi' ? 'checkbox' : 'radio'} name={id} checked={checked}
                onChange={(e) => {
                  if (f.type === 'multi') { const arr = Array.isArray(value) ? (value as string[]) : []; onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o)) }
                  else onChange(f.type === 'boolean' ? o === 'Sim' : o)
                }} />
              <span>{o}</span>
            </label>
          )
        })}
        {error && <span id={errId} className="error" role="alert">{error}</span>}
      </fieldset>
    )
  }
  const common = { id, value: value == null ? '' : String(value), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(f.type === 'number' ? (e.target.value === '' ? '' : e.target.value) : e.target.value) }
  return (
    <Field label={f.label} required={f.required} hint={f.help ?? (f.type === 'number' && (f.min != null || f.max != null) ? `Entre ${f.min ?? '—'} e ${f.max ?? '—'}` : undefined)} error={error} id={id}>
      {f.type === 'textarea' ? <Textarea {...common} rows={4} /> : <Input {...common} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} min={f.min} max={f.max} />}
    </Field>
  )
}

// ---------- Propostas ----------
export function PortalProposalsPage() {
  const { org, a, person, by } = useP()
  const proposals = useCollection(org.id, 'proposals')
  const [openId, setOpenId] = useState<ID | null>(null)
  if (!a.perms.canSeeFinancial) return <><Title title="Propostas" /><NoPermission what="propostas e orçamentos" /></>
  const mine = proposals.filter((p) => p.patientId === a.patient.id && !['rascunho', 'revogada'].includes(p.status)).sort((x, y) => y.createdAt.localeCompare(x.createdAt))
  if (openId && mine.some((p) => p.id === openId)) return (
    <div className="stack">
      <Button onClick={() => setOpenId(null)} style={{ alignSelf: 'flex-start' }}>← Todas as propostas</Button>
      <ProposalExperience org={org} proposalId={openId} by={by} signerName={person.name} />
    </div>
  )
  const label: Record<string, string> = { enviada: 'Nova', visualizada: 'Visualizada', aceita: 'Aceita', aceita_parcial: 'Aceita parcialmente', recusada: 'Recusada', expirada: 'Expirada' }
  return (
    <div className="stack" data-tour="page-content">
      <Title title="Propostas" subtitle={`Orçamentos de ${a.patient.name}.`} />
      {mine.length === 0 ? <EmptyState title="Nenhuma proposta" /> : (
        <ul className="pt-list">{mine.map((p) => {
          const expired = p.validUntil < todayCivil() && !['aceita', 'aceita_parcial', 'recusada'].includes(p.status)
          return (
            <li key={p.id} className="pt-card">
              <div className="row between"><h3>Proposta {p.number} <span className="small muted">v{p.version}</span></h3><Badge tone={expired ? 'neutral' : p.status.startsWith('aceita') ? 'success' : p.status === 'recusada' ? 'danger' : 'info'}>{expired ? 'Expirada' : label[p.status] ?? p.status}</Badge></div>
              <span className="small muted">{p.items.length} item(ns) · válida até {formatCivil(p.validUntil)}</span>
              <Button variant={expired ? 'secondary' : 'primary'} icon={<FileSignature />} disabled={expired} onClick={() => setOpenId(p.id)} style={{ alignSelf: 'flex-start' }}>{expired ? 'Expirada — peça nova versão' : 'Abrir proposta'}</Button>
            </li>
          )
        })}</ul>
      )}
    </div>
  )
}

// ---------- Tratamento ----------
export function PortalTreatmentPage() {
  const { org, a, by } = useP()
  const items = useCollection(org.id, 'treatmentItems')
  const appts = useCollection(org.id, 'appointments')
  const services = useCollection(org.id, 'services')
  const packages = useCollection(org.id, 'aestheticPackages')
  const exercises = useCollection(org.id, 'exercisePlans')
  const nutrition = useCollection(org.id, 'nutritionPlans')
  const online = useNetworkStatus()
  const act = useAction()
  if (!a.perms.canSeeClinical) return <><Title title="Tratamento" /><NoPermission what="informações de tratamento" /></>
  const pid = a.patient.id
  const plan = items.filter((t) => t.patientId === pid && ['aprovado', 'em_execucao', 'concluido'].includes(t.status))
  const sessions = appts.filter((x) => x.patientId === pid && x.status === 'concluida').sort((x, y) => y.start.localeCompare(x.start)).slice(0, 12)
  const pkgs = packages.filter((p) => p.patientId === pid && p.status !== 'cancelado')
  const ex = exercises.filter((p) => p.patientId === pid && p.releasedToPortal && p.status === 'ativo')
  const nut = nutrition.filter((p) => p.patientId === pid && p.releasedToPortal && p.status === 'liberado')
  const today = todayCivil()
  const declare = (planId: ID, exerciseId: ID, done: boolean) => act(() => db.update(org.id, 'exercisePlans', planId, (prev) => ({
    ...prev, adherence: [...prev.adherence.filter((x) => !(x.date === today && x.exerciseId === exerciseId)), { date: today, exerciseId, done, at: nowISO(), note: `Declarado no portal por ${by}` }],
  })), done ? 'Registrado: feito hoje.' : 'Registro removido.')
  const tl = [
    ...plan.map((t) => ({ at: t.updatedAt ?? t.createdAt, title: t.description, body: { aprovado: 'Aprovado', em_execucao: 'Em execução', concluido: 'Concluído' }[t.status as 'aprovado'] })),
    ...sessions.map((s) => ({ at: s.start, title: services.find((x) => x.id === s.serviceId)?.name ?? 'Atendimento', body: 'Atendimento concluído' })),
  ].sort((x, y) => y.at.localeCompare(x.at))
  const empty = !tl.length && !pkgs.length && !ex.length && !nut.length
  return (
    <div className="stack" data-tour="page-content">
      <Title title="Tratamento" subtitle={`Somente o que a clínica liberou para ${a.patient.name}.`} />
      {empty && <EmptyState title="Nada liberado ainda">Plano de tratamento, sessões, exercícios e plano alimentar aparecem aqui quando o profissional liberar.</EmptyState>}
      {pkgs.map((p) => (
        <section key={p.id} className="pt-card" aria-label={`Pacote ${p.name}`}>
          <div className="row between"><h2 style={{ fontSize: 16 }}>{p.name}</h2><Badge tone={p.status === 'ativo' ? 'info' : 'neutral'}>{p.status === 'ativo' ? 'Ativo' : p.status === 'concluido' ? 'Concluído' : 'Expirado'}</Badge></div>
          <div className="progress" role="progressbar" aria-label="Sessões realizadas" aria-valuenow={p.sessions.length} aria-valuemin={0} aria-valuemax={p.sessionsTotal}><div style={{ width: `${Math.min(100, (p.sessions.length / Math.max(1, p.sessionsTotal)) * 100)}%` }} /></div>
          <span className="small">{p.sessions.length} de {p.sessionsTotal} sessões · válido até {formatCivil(p.validUntil)}</span>
        </section>
      ))}
      {ex.map((p) => (
        <section key={p.id} className="pt-card" aria-labelledby={`ex-${p.id}`}>
          <h2 id={`ex-${p.id}`} style={{ fontSize: 16 }}>{p.title}</h2>
          <p className="small muted">Marque o que você fez hoje ({formatCivil(today)}). É uma declaração sua — ajuda o profissional a acompanhar.</p>
          <ul className="pt-list">{p.exercises.map((e) => {
            const doneToday = p.adherence.some((x) => x.date === today && x.exerciseId === e.id && x.done)
            const total = p.adherence.filter((x) => x.exerciseId === e.id && x.done).length
            return (
              <li key={e.id} className="muted-surface">
                <Checkbox checked={doneToday} disabled={!online} onChange={(ev) => declare(p.id, e.id, ev.target.checked)}
                  label={<strong>{e.name}</strong>} hint={<>{[e.sets && `${e.sets} séries`, e.reps && `${e.reps} repetições`, e.holdSec && `${e.holdSec}s`, e.frequency].filter(Boolean).join(' · ')}<br />{e.instructions}<br />Registros feitos: {total}</>} />
              </li>
            )
          })}</ul>
          {!online && <p className="small" role="status">{OFFLINE_HINT}</p>}
        </section>
      ))}
      {nut.map((p) => (
        <section key={p.id} className="pt-card" aria-labelledby={`nu-${p.id}`}>
          <h2 id={`nu-${p.id}`} style={{ fontSize: 16 }}>{p.title} <span className="small muted">v{p.version}</span></h2>
          {p.reviewedAt && <span className="small muted">Revisado pelo profissional em {formatDateTime(p.reviewedAt)}</span>}
          <ul className="pt-list">{p.meals.map((m) => <li key={m.id} className="muted-surface"><strong>{m.time} · {m.name}</strong><ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{m.items.map((i, k) => <li key={k}>{i}</li>)}</ul>{m.notes && <p className="small muted">{m.notes}</p>}</li>)}</ul>
          {p.guidance && <p className="small">{p.guidance}</p>}
        </section>
      ))}
      {tl.length > 0 && (
        <section className="pt-card" aria-labelledby="tl-h">
          <h2 id="tl-h" style={{ fontSize: 16 }}>Linha do tempo</h2>
          <ol className="timeline">{tl.slice(0, 20).map((t, i) => <li key={i}><div className="tl-time">{formatDateTime(t.at)}</div><div className="strong">{t.title}</div><div className="small muted">{t.body}</div></li>)}</ol>
        </section>
      )}
    </div>
  )
}

// ---------- Vacinas (veterinária) ----------
export function PortalVaccinesPage() {
  const { org, a, base } = useP()
  const vaccines = useCollection(org.id, 'vaccines')
  const pros = useCollection(org.id, 'professionals')
  if (org.segment !== 'veterinaria') return <><Title title="Vacinas" /><EmptyState title="Carteira de vacinação não se aplica" action={<Link to={base}>Voltar ao início</Link>}>A carteira de vacinação está disponível apenas no portal de clínicas veterinárias.</EmptyState></>
  if (!a.perms.canSeeClinical) return <><Title title="Vacinas" /><NoPermission what="carteira de vacinação" /></>
  // Filtro estrito pelo animal selecionado (vacina de outro animal nunca aparece).
  const mine = vaccines.filter((v) => v.patientId === a.patient.id && v.status !== 'cancelada').sort((x, y) => y.appliedOn.localeCompare(x.appliedOn))
  const KIND = { vacina: 'Vacina', vermifugo: 'Vermífugo', antiparasitario: 'Antiparasitário' }
  const today = todayCivil()
  return (
    <div className="stack" data-tour="page-content">
      <Title title={`Carteira de ${a.patient.name}`} subtitle={`${a.patient.species ?? ''}${a.patient.breed ? ` · ${a.patient.breed}` : ''}`} />
      <Alert tone="info">Próximas doses são definidas pelo veterinário para cada animal. Em caso de dúvida, fale com a clínica.</Alert>
      {mine.length === 0 ? <EmptyState icon={<Syringe aria-hidden="true" />} title="Nenhum registro">Ainda não há vacinas registradas para {a.patient.name}.</EmptyState> : (
        <ul className="pt-list">{mine.map((v) => (
          <li key={v.id} className="pt-card">
            <div className="row between"><h3>{v.product}</h3><span className="row"><Badge plain>{KIND[v.kind]}</Badge><Badge tone={v.status === 'aplicada' ? 'success' : 'info'}>{v.status === 'aplicada' ? 'Aplicada' : 'Agendada'}</Badge></span></div>
            <div className="pt-meta">
              <span>Aplicação: {formatCivil(v.appliedOn)}</span><span>Lote: {v.lot}</span>{v.manufacturer && <span>{v.manufacturer}</span>}
              <span>{pros.find((p) => p.id === v.professionalId)?.name}</span>
            </div>
            {v.nextDueOn && <p className="small">Próxima dose definida pelo veterinário: <strong>{formatCivil(v.nextDueOn)}</strong> {v.nextDueOn < today && <Badge tone="danger">Atrasada</Badge>}</p>}
          </li>
        ))}</ul>
      )}
    </div>
  )
}

// ---------- Preferências ----------
const PUSH_LABEL: Record<PushState, [string, 'success' | 'warning' | 'danger' | 'neutral']> = { nao_suportado: ['Não suportado neste navegador', 'neutral'], padrao: ['Permissão pendente', 'warning'], negado: ['Bloqueado no navegador', 'danger'], concedido: ['Permitido neste dispositivo', 'success'] }

export function PortalPreferencesPage() {
  const { org, person } = useP()
  const act = useAction()
  const [c, setC] = useState<Person['communication']>(person.communication)
  const [quietOn, setQuietOn] = useState(!!person.communication.quietHours)
  const [qs, setQs] = useState(minutesToHHMM(person.communication.quietHours?.start ?? 21 * 60))
  const [qe, setQe] = useState(minutesToHHMM(person.communication.quietHours?.end ?? 8 * 60))
  const [push, setPush] = useState<PushState>(() => pushState())
  const [asking, setAsking] = useState(false)
  useEffect(() => { setC(person.communication) }, [person.communication])
  const save = () => act(() => db.update(org.id, 'persons', person.id, { communication: { ...c, quietHours: quietOn ? { start: hhmmToMinutes(qs), end: hhmmToMinutes(qe) } : undefined } }), 'Preferências salvas.')
  const ask = async () => { setAsking(true); try { setPush(await requestPushPermission()) } finally { setAsking(false) } }
  const ch: { k: keyof Omit<Person['communication'], 'quietHours'>; label: string; hint: string }[] = [
    { k: 'whatsapp', label: 'WhatsApp', hint: 'Confirmações, lembretes e avisos da clínica.' },
    { k: 'email', label: 'E-mail', hint: 'Avisos com link para o portal (sem anexos clínicos).' },
    { k: 'push', label: 'Notificações no dispositivo (push)', hint: 'Requer permissão do navegador e assinatura no servidor (futuro).' },
    { k: 'marketing', label: 'Novidades e campanhas', hint: 'Opcional. Você pode sair a qualquer momento.' },
  ]
  return (
    <div className="stack" data-tour="page-content">
      <Title title="Notificações" subtitle="Escolha como a clínica fala com você." />
      <Alert tone="info">As notificações não incluem dados clínicos, diagnósticos ou nomes de procedimentos — apenas data, horário e um link para o portal.</Alert>
      <section className="pt-card">
        <h2 style={{ fontSize: 16 }}>Canais</h2>
        {ch.map((x) => <Checkbox key={x.k} label={x.label} hint={x.hint} checked={c[x.k]} onChange={(e) => setC({ ...c, [x.k]: e.target.checked })} />)}
      </section>
      <section className="pt-card">
        <h2 style={{ fontSize: 16 }}>Horário de silêncio</h2>
        <Checkbox label="Não enviar mensagens neste intervalo" checked={quietOn} onChange={(e) => setQuietOn(e.target.checked)} />
        {quietOn && <div className="form-grid"><Field label="Início"><Input type="time" value={qs} onChange={(e) => setQs(e.target.value)} /></Field><Field label="Fim"><Input type="time" value={qe} onChange={(e) => setQe(e.target.value)} /></Field></div>}
      </section>
      <Button variant="primary" icon={<Save />} onClick={save} style={{ alignSelf: 'flex-start' }} data-tour="primary-action">Salvar preferências</Button>
      <section className="pt-card" aria-labelledby="push-h">
        <div className="row between"><h2 id="push-h" style={{ fontSize: 16 }}>Push neste dispositivo</h2><Badge tone={PUSH_LABEL[push][1]}>{PUSH_LABEL[push][0]}</Badge></div>
        <p className="small muted">A permissão só é pedida quando você clicar. A entrega real de push depende de assinatura no servidor da clínica (etapa futura) e das regras do seu sistema; {demoText('nada é enviado nesta demonstração.', 'por enquanto nenhuma notificação é enviada.')}</p>
        {push === 'padrao' && <Button icon={<Bell />} loading={asking} onClick={ask} style={{ alignSelf: 'flex-start' }}>Permitir notificações</Button>}
        {push === 'negado' && <p className="small"><BellOff size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} /> Para reativar, libere as notificações deste site nas configurações do navegador.</p>}
        {push === 'concedido' && <p className="small"><CheckCircle2 size={16} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} /> Permissão concedida. Assinatura remota: pendente de backend.</p>}
      </section>
    </div>
  )
}

// ---------- Perfil ----------
export function PortalProfilePage() {
  const { org, person, list } = useP()
  const requests = useCollection(org.id, 'portalRequests')
  const online = useNetworkStatus()
  const act = useAction()
  const [dlg, setDlg] = useState<null | 'atendimento' | 'exportacao'>(null)
  const [msg, setMsg] = useState('')
  const [about, setAbout] = useState<ID>('')
  const mine = useMemo(() => requests.filter((r) => r.personId === person.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt)), [requests, person.id])
  const exportOpen = mine.some((r) => r.kind === 'exportacao' && r.status !== 'concluida')
  const send = () => {
    if (!dlg) return
    const text = dlg === 'exportacao' ? `Solicitação de exportação dos meus dados (LGPD).${msg.trim() ? ` Observação: ${msg.trim()}` : ''}` : msg.trim()
    if (dlg === 'atendimento' && text.length < 5) return
    if (act(() => db.insert(org.id, 'portalRequests', { id: uid('preq_'), tenantId: org.id, createdAt: nowISO(), personId: person.id, patientId: about || undefined, kind: dlg, message: text, status: 'aberta' }), dlg === 'exportacao' ? 'Pedido de exportação registrado. A clínica responderá pelo canal cadastrado.' : 'Pedido enviado. Uma pessoa da equipe vai responder.')) { setDlg(null); setMsg(''); setAbout('') }
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const KIND = { atendimento: 'Atendimento humano', exportacao: 'Exportação de dados', reagendamento: 'Contato sobre consulta', documento: 'Documento', outro: 'Outro' }
  const ST = { aberta: ['Aberta', 'warning'], em_andamento: ['Em andamento', 'info'], concluida: ['Concluída', 'success'] } as const
  return (
    <div className="stack" data-tour="page-content">
      <Title title="Perfil" subtitle={org.name} />
      <section className="pt-card">
        <h2 style={{ fontSize: 16 }}>Seus dados</h2>
        <dl className="grid grid-3" style={{ margin: 0, '--gap': '12px' } as React.CSSProperties}>
          {([['Nome', person.name], [demoText('CPF (fictício)', 'CPF'), person.cpf], ['Nascimento', formatCivil(person.birthDate)], ['Telefone', person.phone], ['E-mail', person.email]] as const).map(([k, v]) => <div key={k}><dt className="small muted">{k}</dt><dd style={{ margin: 0 }} className="strong">{v ?? '—'}</dd></div>)}
        </dl>
        <p className="small muted">Para corrigir dados cadastrais, solicite atendimento: a recepção confere e atualiza.</p>
      </section>
      <section className="pt-card">
        <h2 style={{ fontSize: 16 }}>{org.segment === 'veterinaria' ? 'Animais vinculados' : 'Pacientes vinculados'}</h2>
        <ul className="pt-list">{list.map((x) => (
          <li key={x.patient.id} className="muted-surface">
            <div className="row between"><strong>{x.patient.name}</strong><Badge plain>{x.links.map((l) => RELATION_LABEL[l.relation]).join(' · ')}</Badge></div>
            <div className="row small" style={{ marginTop: 4 }}>
              <Badge tone={x.perms.canSeeClinical ? 'success' : 'neutral'}>{x.perms.canSeeClinical ? 'Vê informações clínicas liberadas' : 'Sem acesso clínico'}</Badge>
              <Badge tone={x.perms.canSeeFinancial ? 'success' : 'neutral'}>{x.perms.canSeeFinancial ? 'Vê financeiro' : 'Sem acesso financeiro'}</Badge>
              <Badge tone={x.perms.canSchedule ? 'success' : 'neutral'}>{x.perms.canSchedule ? 'Pode agendar' : 'Não agenda'}</Badge>
            </div>
          </li>
        ))}</ul>
      </section>
      <section className="pt-card">
        <h2 style={{ fontSize: 16 }}>Sessões e dispositivos</h2>
        <div className="row"><Laptop aria-hidden="true" /><span className="grow"><strong>{browser} — este navegador</strong><br /><span className="small muted">{demoText('Sessão de demonstração ativa agora', 'Sessão ativa agora')}</span></span><Badge tone="success">Atual</Badge></div>
        <p className="small muted">Lista de dispositivos e encerramento remoto de sessões dependem da autenticação no servidor (etapa futura). Para sair deste navegador, use “Sair”.</p>
      </section>
      <section className="pt-card">
        <h2 style={{ fontSize: 16 }}>Solicitações</h2>
        <div className="row">
          <Button variant="primary" icon={<MessageSquare />} disabled={!online} onClick={() => setDlg('atendimento')} data-tour="primary-action">Falar com a equipe</Button>
          <Button icon={<Download />} disabled={!online || exportOpen} onClick={() => setDlg('exportacao')}>{exportOpen ? 'Exportação já solicitada' : 'Solicitar exportação dos meus dados'}</Button>
        </div>
        {!online && <p className="small" role="status">{OFFLINE_HINT}</p>}
        {mine.length === 0 ? <p className="small muted">Nenhuma solicitação.</p> : (
          <ul className="pt-list" aria-live="polite">{mine.map((r) => <li key={r.id} className="muted-surface small"><div className="row between"><strong>{KIND[r.kind]}</strong><Badge tone={ST[r.status][1]}>{ST[r.status][0]}</Badge></div><span className="muted">{formatDateTime(r.createdAt)}</span><p>{r.message}</p></li>)}</ul>
        )}
      </section>
      <Dialog open={!!dlg} onClose={() => setDlg(null)} title={dlg === 'exportacao' ? 'Solicitar exportação de dados' : 'Falar com a equipe'}
        footer={<><Button onClick={() => setDlg(null)}>Voltar</Button><Button variant="primary" icon={<Send />} disabled={!online || (dlg === 'atendimento' && msg.trim().length < 5)} onClick={send}>Enviar</Button></>}>
        <div className="stack">
          {dlg === 'exportacao' ? <p className="small">A clínica prepara a exportação e responde pelo canal cadastrado após confirmar sua identidade. Alguns registros de saúde têm prazos legais de guarda e não são apagados automaticamente.</p> : <p className="small">Uma pessoa da equipe responde. Em caso de urgência ou emergência, procure atendimento presencial ou ligue para a clínica.</p>}
          {list.length > 1 && <Field label="Sobre"><Select value={about} onChange={(e) => setAbout(e.target.value)}><option value="">Geral</option>{list.map((x) => <option key={x.patient.id} value={x.patient.id}>{x.patient.name}</option>)}</Select></Field>}
          <Field label={dlg === 'exportacao' ? 'Observação (opcional)' : 'Mensagem'} required={dlg === 'atendimento'}><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} maxLength={800} /></Field>
        </div>
      </Dialog>
    </div>
  )
}
