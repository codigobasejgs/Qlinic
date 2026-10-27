// /pacientes/:patientId — ficha do paciente com abas.
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowRight, CalendarPlus, FileUp, Lock, Pencil, Plus, Trash2, Weight } from 'lucide-react'
import type { FileAsset, ID, Patient } from '@/domain/types'
import { APPOINTMENT_STATUS_LABEL, PAYMENT_METHOD_LABEL } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit, chargeBalance, patientRepo } from '@/data/repositories'
import { canSeeDocument, canSeeRecord, visibleClinicalAlerts } from '@/domain/access'
import {
  Alert, Avatar, Badge, Button, ButtonLink, Checkbox, DescList, Dialog, EmptyState, Field, FileUpload, Input, Kpi, PageHeader, Section, Select, Tabs, TabPanel, Textarea, Timeline, useAction, useConfirm, useLookup,
} from '@/ui'
import { formatBRL } from '@/lib/money'
import { formatCivil, formatDateTime, todayCivil } from '@/lib/dates'
import { uid } from '@/lib/util'
import { addFile, addResponsible, FILE_ACCEPT, FILE_CATEGORY_LABEL, RELATION_LABEL, replaceFile } from './lib'
import { RecordCard, patientAge, patientSubtitle } from './shared'
import { DOC_KIND_LABEL } from './templates'
import { PatientFormDialog, ResponsibleEditor, emptyResp, type RespDraft } from './patients'
import type { Anamnesis } from './types'

const SPECIALTY_LINKS: { module: Parameters<ReturnType<typeof useTenant>['moduleOn']>[0]; path: string; label: string }[] = [
  { module: 'odontologia', path: 'odontologia', label: 'Odontograma e plano' }, { module: 'medicina', path: 'medicina', label: 'Medicina' },
  { module: 'veterinaria', path: 'veterinaria', label: 'Veterinária (vacinas, internação)' }, { module: 'estetica', path: 'estetica', label: 'Estética (mapa, pacotes)' },
  { module: 'psicologia', path: 'psicologia', label: 'Psicologia' }, { module: 'fisioterapia', path: 'fisioterapia', label: 'Fisioterapia (exercícios)' },
  { module: 'nutricao', path: 'nutricao', label: 'Nutrição (plano alimentar)' }, { module: 'multidisciplinar', path: 'multidisciplinar', label: 'Plano de cuidado' },
  { module: 'orcamentos', path: 'orcamentos', label: 'Orçamentos' },
]

export function PatientDetailPage() {
  const { patientId } = useParams()
  const t = useTenant()
  const patients = useCollection(t.tenantId, 'patients')
  const p = patients.find((x) => x.id === patientId)
  const [tab, setTab] = useState('resumo')
  const [edit, setEdit] = useState(false)
  const records = useCollection(t.tenantId, 'records').filter((r) => r.patientId === patientId)
  const docs = useCollection(t.tenantId, 'documents').filter((d) => d.patientId === patientId)
  const files = useCollection(t.tenantId, 'files').filter((f) => f.patientId === patientId)
  if (!t.can('pacientes')) return <><PageHeader title="Paciente" /><EmptyState title="Seu perfil não acessa cadastros de pacientes" /></>
  if (!p || !t.allowedUnits.some((u) => u.id === p.unitId)) {
    return <><PageHeader title="Paciente não encontrado" breadcrumbs={[{ label: 'Pacientes', to: `${t.base}/pacientes` }, { label: 'Não encontrado' }]} /><EmptyState title="Cadastro inexistente ou fora das unidades que você acessa" action={<ButtonLink to={`${t.base}/pacientes`}>Voltar à lista</ButtonLink>} /></>
  }
  const clinical = t.scope('clinical') !== false || t.scope('clinical_restricted') !== false
  const visRecords = records.filter((r) => canSeeRecord(t, r))
  const alerts = visibleClinicalAlerts(t, p)
  const tabs = [
    { id: 'resumo', label: 'Resumo' },
    ...(clinical ? [{ id: 'prontuario', label: 'Prontuário', badge: visRecords.length || undefined }, { id: 'anamnese', label: 'Anamnese e alergias' }] : []),
    ...(t.can('documentos') ? [{ id: 'documentos', label: 'Documentos', badge: docs.filter((d) => canSeeDocument(t, d)).length || undefined }] : []),
    ...(t.can('arquivos') ? [{ id: 'arquivos', label: 'Arquivos', badge: files.length || undefined }] : []),
    ...(t.can('financeiro') ? [{ id: 'financeiro', label: 'Financeiro' }] : []),
    { id: 'vinculos', label: p.kind === 'animal' ? 'Tutores' : 'Vínculos' },
  ]
  const cur = tabs.some((x) => x.id === tab) ? tab : 'resumo'
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader breadcrumbs={[{ label: 'Pacientes', to: `${t.base}/pacientes` }, { label: p.name }]}
        title={<span className="row nowrap" style={{ '--gap': '12px' } as React.CSSProperties}><Avatar name={p.name} size="lg" /><span className="stack" style={{ '--gap': '2px' } as React.CSSProperties}><span>{p.socialName ?? p.name}</span><span className="small muted" style={{ fontWeight: 400 }}>{patientSubtitle(p) || 'Sem data de nascimento'}{p.socialName ? ` · Registro civil: ${p.name}` : ''}</span></span></span>}
        actions={<>
          {t.can('agenda', 'create') && <ButtonLink variant="primary" icon={<CalendarPlus />} to={`${t.base}/agenda?novo=1&paciente=${p.id}`}>Agendar</ButtonLink>}
          {t.can('pacientes', 'update') && <Button icon={<Pencil />} onClick={() => setEdit(true)} data-tour="primary-action">Editar cadastro</Button>}
        </>} />
      <div className="row">
        <Badge tone={p.status === 'ativo' ? 'success' : 'neutral'}>{p.status === 'ativo' ? 'Ativo' : 'Inativo'}</Badge>
        {p.duplicateOf?.length ? <Badge tone="warning">Possível duplicado em revisão</Badge> : null}
        {p.insurance && <Badge tone="info">{p.insurance.name}</Badge>}
        {p.tags.map((x) => <Badge key={x} plain>{x}</Badge>)}
        {p.pendingDocuments.map((d) => <Badge key={d} tone="warning">Pendente: {d}</Badge>)}
      </div>
      {alerts.length > 0 && <Alert tone="danger" title="Alergias e alertas clínicos">{alerts.join(' · ')}</Alert>}
      {!clinical && <p className="small muted"><Lock size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} /> Seu perfil não acessa conteúdo clínico (prontuário, alergias e alertas). Informações administrativas permanecem disponíveis.</p>}
      <Tabs label="Seções do paciente" value={cur} onChange={setTab} tabs={tabs} />
      <TabPanel>
        {cur === 'resumo' && <SummaryTab p={p} />}
        {cur === 'prontuario' && <RecordsTab p={p} />}
        {cur === 'anamnese' && <AnamnesisTab p={p} />}
        {cur === 'documentos' && <DocsTab p={p} />}
        {cur === 'arquivos' && <FilesTab p={p} />}
        {cur === 'financeiro' && <FinanceTab p={p} />}
        {cur === 'vinculos' && <LinksTab p={p} />}
      </TabPanel>
      {edit && <PatientFormDialog editing={p} onClose={() => setEdit(false)} />}
    </div>
  )
}

// ---------------- Resumo / linha do tempo ----------------
function SummaryTab({ p }: { p: Patient }) {
  const t = useTenant()
  const L = useLookup()
  const appts = useCollection(t.tenantId, 'appointments').filter((a) => a.patientId === p.id)
  const records = useCollection(t.tenantId, 'records').filter((r) => r.patientId === p.id && canSeeRecord(t, r))
  const docs = useCollection(t.tenantId, 'documents').filter((d) => d.patientId === p.id && canSeeDocument(t, d))
  const charges = useCollection(t.tenantId, 'charges').filter((c) => c.patientId === p.id)
  const proposals = useCollection(t.tenantId, 'proposals').filter((x) => x.patientId === p.id)
  const tz = t.unit?.timezone
  const now = Date.now()
  const next = appts.filter((a) => new Date(a.start).getTime() > now && !['cancelada', 'faltou', 'concluida'].includes(a.status)).sort((a, b) => a.start.localeCompare(b.start))[0]
  const active = appts.find((a) => a.status === 'chegou' || a.status === 'em_atendimento')
  type Ev = { at: string; title: React.ReactNode; body?: React.ReactNode }
  const ev: Ev[] = [
    ...appts.map((a) => ({ at: a.start, title: <>Agendamento · {APPOINTMENT_STATUS_LABEL[a.status]}</>, body: `${L.service(a.serviceId)?.name ?? ''} com ${L.pro(a.professionalId)?.name ?? ''}` })),
    ...records.map((r) => ({ at: r.createdAt, title: <>Registro clínico · {r.title}</>, body: r.status === 'finalizado' ? 'Finalizado' : r.status === 'revisado' ? 'Revisado' : 'Rascunho' })),
    ...docs.map((d) => ({ at: d.createdAt, title: <>Documento · {d.title}</>, body: d.releasedToPortal ? 'Liberado ao portal' : 'Interno' })),
    ...(t.can('financeiro') || t.can('caixa') ? charges.map((c) => ({ at: c.createdAt, title: <>Cobrança · {c.description}</>, body: `${formatBRL(c.amountCents)} · ${c.status}` })) : []),
    ...(t.can('orcamentos') ? proposals.map((x) => ({ at: x.createdAt, title: <>Proposta {x.number} v{x.version}</>, body: x.status })) : []),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25)
  const lastW = p.weights?.[p.weights.length - 1]
  return (
    <div className="detail-grid">
      <div className="stack">
        {active && (t.scope('clinical', 'create') !== false || t.scope('clinical_restricted', 'create') !== false) && (
          <Alert tone="success" title={`Paciente ${active.status === 'chegou' ? 'aguardando atendimento' : 'em atendimento'}`} action={<ButtonLink variant="primary" size="sm" to={`${t.base}/atendimento/${active.id}`} icon={<ArrowRight />}>Abrir modo consulta</ButtonLink>}>{formatDateTime(active.start, tz)} · {L.pro(active.professionalId)?.name}</Alert>
        )}
        <Section title="Identificação">
          <DescList items={p.kind === 'animal' ? [
            ['Espécie', p.species], ['Raça', p.breed], ['Sexo', p.sex === 'F' ? 'Fêmea' : p.sex === 'M' ? 'Macho' : 'Não informado'], ['Idade', patientAge(p)],
            ['Nascimento', `${formatCivil(p.birthDate)}${p.birthDateEstimated ? ' (estimada)' : ''}`], ['Pelagem', p.coat], ['Microchip', p.microchip ?? 'Não informado'], ['Peso atual', lastW ? `${lastW.kg} kg (${formatCivil(lastW.date)})` : '—'],
          ] : [
            ['Nascimento', p.birthDate ? `${formatCivil(p.birthDate)} (${patientAge(p)})` : '—'], ['CPF', p.cpf ?? 'Não informado'], ['Telefone', p.phone], ['E-mail', p.email],
            ['Convênio', p.insurance ? `${p.insurance.name} · ${p.insurance.cardNumber}${p.insurance.plan ? ` · ${p.insurance.plan}` : ''}` : 'Particular'],
            ['Unidade', t.units.find((u) => u.id === p.unitId)?.name], ['Portal', p.sharing.portal ? 'Permitido' : 'Desativado'], ['Equipe multidisciplinar', p.sharing.multidisciplinar ? 'Compartilhado' : 'Não compartilhado'],
          ]} />
        </Section>
        {p.kind === 'animal' && <WeightPanel p={p} />}
        <Section title="Linha do tempo"><Timeline items={ev.map((e) => ({ time: formatDateTime(e.at, tz), title: e.title, body: e.body }))} /></Section>
      </div>
      <div className="stack">
        <Section title="Próximo agendamento">{next ? <p><strong>{formatDateTime(next.start, tz)}</strong><br /><span className="small muted">{L.service(next.serviceId)?.name} · {L.pro(next.professionalId)?.name} · {APPOINTMENT_STATUS_LABEL[next.status]}</span></p> : <p className="muted small">Nenhum agendamento futuro.</p>}</Section>
        <SpecialtyShortcuts p={p} />
      </div>
    </div>
  )
}

function SpecialtyShortcuts({ p }: { p: Patient }) {
  const t = useTenant()
  const clinical = t.scope('clinical') !== false || t.scope('clinical_restricted') !== false
  const links = SPECIALTY_LINKS.filter((s) => t.moduleOn(s.module) && (s.module === 'orcamentos' ? t.can('orcamentos') : clinical))
  if (!links.length) return null
  return (
    <Section title="Atalhos de especialidade">
      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, '--gap': '4px' } as React.CSSProperties}>
        {links.map((s) => <li key={s.path}><Link className="shortcut" to={`${t.base}/${s.path}?paciente=${p.id}`}>{s.label}<ArrowRight size={16} aria-hidden="true" /></Link></li>)}
      </ul>
    </Section>
  )
}

function WeightPanel({ p }: { p: Patient }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const [kg, setKg] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const ws = [...(p.weights ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const max = Math.max(1, ...ws.map((w) => w.kg))
  const add = () => {
    const v = Number(kg.replace(',', '.'))
    if (!(v > 0 && v < 1000)) { setErr('Informe um peso válido em kg.'); return }
    setErr(null)
    if (run(() => { patientRepo.update(t.tenantId, p.id, { weights: [...ws.filter((w) => w.date !== todayCivil()), { date: todayCivil(), kg: v }] }); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'paciente.peso', resource: 'patients', resourceId: p.id, detail: `${v} kg` }) }, 'Peso registrado.')) setKg('')
  }
  return (
    <Section title="Histórico de peso">
      {ws.length ? (
        <ol className="weights" aria-label="Pesos registrados">
          {ws.map((w) => <li key={w.date}><span className="small muted">{formatCivil(w.date)}</span><span className="wbar" aria-hidden="true"><span style={{ width: `${(w.kg / max) * 100}%` }} /></span><strong className="num">{w.kg} kg</strong></li>)}
        </ol>
      ) : <p className="muted small">Sem pesagens registradas.</p>}
      {t.can('pacientes', 'update') && (
        <div className="row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
          <Field label="Novo peso (kg)" error={err}><Input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value.replace(/[^\d.,]/g, ''))} style={{ maxWidth: 160 }} /></Field>
          <Button icon={<Weight />} onClick={add}>Registrar peso de hoje</Button>
        </div>
      )}
    </Section>
  )
}

// ---------------- Prontuário ----------------
function RecordsTab({ p }: { p: Patient }) {
  const t = useTenant()
  const L = useLookup()
  const all = useCollection(t.tenantId, 'records').filter((r) => r.patientId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const vis = all.filter((r) => canSeeRecord(t, r))
  const hidden = all.length - vis.length
  const appts = useCollection(t.tenantId, 'appointments')
  const [open, setOpen] = useState<ID | null>(null)
  return (
    <div className="stack">
      {hidden > 0 && <Alert tone="neutral" title={`${hidden} registro${hidden > 1 ? 's' : ''} restrito${hidden > 1 ? 's' : ''} oculto${hidden > 1 ? 's' : ''} para seu perfil`}>Registros de outros profissionais ou sigilosos (ex.: sessões de psicologia) só são visíveis ao autor ou a perfis autorizados.</Alert>}
      {vis.length === 0 ? <EmptyState title="Nenhum registro visível">Os registros são criados no modo consulta, a partir de um atendimento.</EmptyState> : vis.map((r) => {
        const ap = appts.find((a) => a.id === r.appointmentId)
        const canEdit = r.status !== 'finalizado' && t.can(r.confidentiality === 'restrito' ? 'clinical_restricted' : 'clinical', 'update', { ownerProfessionalId: r.professionalId }) && (t.scope(r.confidentiality === 'restrito' ? 'clinical_restricted' : 'clinical', 'update') === 'all' || t.access.professionalId === r.professionalId)
        return (
          <RecordCard key={r.id} record={r} proName={L.pro(r.professionalId)?.name} compact={open !== r.id}
            actions={<>
              <Button size="sm" variant="ghost" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>{open === r.id ? 'Recolher' : 'Ver conteúdo'}</Button>
              {ap && (canEdit || r.status === 'finalizado') && t.access.professionalId === r.professionalId && <ButtonLink size="sm" to={`${t.base}/atendimento/${ap.id}`}>{r.status === 'finalizado' ? 'Adendo' : 'Continuar'}</ButtonLink>}
            </>} />
        )
      })}
    </div>
  )
}

// ---------------- Anamnese / problemas / alergias ----------------
function AnamnesisTab({ p }: { p: Patient }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const list = useCollection(t.tenantId, 'anamneses')
  const an = list.find((a) => a.patientId === p.id)
  const canEdit = t.scope('clinical', 'update') !== false
  const [allergy, setAllergy] = useState('')
  const [alert, setAlert] = useState('')
  const [problem, setProblem] = useState('')
  const [med, setMed] = useState('')
  const [hist, setHist] = useState<string | null>(null)
  const [habits, setHabits] = useState<string | null>(null)
  if (t.scope('clinical') === false) return <EmptyState title="Sem acesso a dados clínicos">Alergias e alertas são exibidos somente a perfis com leitura clínica.</EmptyState>
  const upsert = (patch: Partial<Anamnesis>) => {
    if (an) db.update(t.tenantId, 'anamneses', an.id, { ...patch, updatedBy: actor.name })
    else db.insert(t.tenantId, 'anamneses', { id: uid('an_'), tenantId: t.tenantId, createdAt: new Date().toISOString(), patientId: p.id, problems: [], medications: [], history: '', habits: '', ...patch, updatedBy: actor.name })
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'anamnese.atualizada', resource: 'anamneses', resourceId: p.id })
  }
  const addTo = (k: 'allergies' | 'clinicalAlerts', v: string, reset: () => void) => {
    if (!v.trim()) return
    if (run(() => { if (p[k].includes(v.trim())) throw new Error('Já registrado.'); patientRepo.update(t.tenantId, p.id, { [k]: [...p[k], v.trim()] }); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: `paciente.${k}`, resource: 'patients', resourceId: p.id }) }, 'Registrado.')) reset()
  }
  const rm = (k: 'allergies' | 'clinicalAlerts', v: string) => run(() => patientRepo.update(t.tenantId, p.id, { [k]: p[k].filter((x) => x !== v) }), 'Removido.')
  return (
    <div className="grid grid-2">
      <Section title="Alergias">
        <ChipList items={p.allergies} tone="danger" onRemove={canEdit ? (v) => rm('allergies', v) : undefined} empty="Nenhuma alergia registrada (ausência ≠ confirmação negativa)." />
        {canEdit && <AddInline label="Nova alergia" value={allergy} onChange={setAllergy} onAdd={() => addTo('allergies', allergy, () => setAllergy(''))} />}
      </Section>
      <Section title="Alertas clínicos">
        <ChipList items={p.clinicalAlerts} tone="warning" onRemove={canEdit ? (v) => rm('clinicalAlerts', v) : undefined} empty="Nenhum alerta." />
        {canEdit && <AddInline label="Novo alerta" value={alert} onChange={setAlert} onAdd={() => addTo('clinicalAlerts', alert, () => setAlert(''))} />}
      </Section>
      <Section title="Problemas">
        {an?.problems.length ? (
          <ul className="divider-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {an.problems.map((pr) => (
              <li key={pr.id} className="row between" style={{ padding: '8px 0' }}>
                <span>{pr.description}{pr.since && <span className="small muted"> · desde {formatCivil(pr.since.slice(0, 10))}</span>}</span>
                <span className="row"><Badge tone={pr.status === 'ativo' ? 'warning' : 'neutral'}>{pr.status === 'ativo' ? 'Ativo' : 'Resolvido'}</Badge>
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => run(() => upsert({ problems: an.problems.map((x) => x.id === pr.id ? { ...x, status: x.status === 'ativo' ? 'resolvido' : 'ativo' } : x) }), 'Problema atualizado.')}>{pr.status === 'ativo' ? 'Marcar resolvido' : 'Reativar'}</Button>}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted small">Nenhum problema registrado.</p>}
        {canEdit && <AddInline label="Novo problema" value={problem} onChange={setProblem} onAdd={() => { if (problem.trim() && run(() => upsert({ problems: [...(an?.problems ?? []), { id: uid('pb_'), description: problem.trim(), status: 'ativo', since: todayCivil() }] }), 'Problema registrado.')) setProblem('') }} />}
      </Section>
      <Section title="Medicamentos em uso">
        <ChipList items={an?.medications ?? []} onRemove={canEdit ? (v) => run(() => upsert({ medications: (an?.medications ?? []).filter((x) => x !== v) }), 'Removido.') : undefined} empty="Nenhum medicamento informado." />
        {canEdit && <AddInline label="Novo medicamento" value={med} onChange={setMed} onAdd={() => { if (med.trim() && run(() => upsert({ medications: [...(an?.medications ?? []), med.trim()] }), 'Registrado.')) setMed('') }} />}
      </Section>
      <Section title="Antecedentes e hábitos">
        <div className="stack">
          <Field label="Antecedentes"><Textarea value={hist ?? an?.history ?? ''} onChange={(e) => setHist(e.target.value)} disabled={!canEdit} rows={3} /></Field>
          <Field label="Hábitos"><Textarea value={habits ?? an?.habits ?? ''} onChange={(e) => setHabits(e.target.value)} disabled={!canEdit} rows={2} /></Field>
          {canEdit && <div className="form-actions"><Button variant="primary" disabled={hist === null && habits === null} onClick={() => { if (run(() => upsert({ history: hist ?? an?.history ?? '', habits: habits ?? an?.habits ?? '' }), 'Anamnese salva.')) { setHist(null); setHabits(null) } }}>Salvar anamnese</Button></div>}
          {an?.updatedBy && <p className="tiny muted">Última atualização por {an.updatedBy}{an.updatedAt ? ` em ${formatDateTime(an.updatedAt)}` : ''}</p>}
        </div>
      </Section>
    </div>
  )
}
function ChipList({ items, onRemove, empty, tone }: { items: string[]; onRemove?: (v: string) => void; empty: string; tone?: 'danger' | 'warning' }) {
  if (!items.length) return <p className="muted small">{empty}</p>
  return <ul className="row" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{items.map((v) => <li key={v}><span className={`badge ${tone ?? ''}`}>{v}{onRemove && <button type="button" className="chip-x" onClick={() => onRemove(v)} aria-label={`Remover ${v}`}>×</button>}</span></li>)}</ul>
}
function AddInline({ label, value, onChange, onAdd }: { label: string; value: string; onChange: (v: string) => void; onAdd: () => void }) {
  return (
    <form className="row" style={{ alignItems: 'flex-end', marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); onAdd() }}>
      <div className="grow"><Field label={label}><Input value={value} onChange={(e) => onChange(e.target.value)} /></Field></div>
      <Button type="submit" icon={<Plus />} disabled={!value.trim()}>Adicionar</Button>
    </form>
  )
}

// ---------------- Documentos ----------------
function DocsTab({ p }: { p: Patient }) {
  const t = useTenant()
  const docs = useCollection(t.tenantId, 'documents').filter((d) => d.patientId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const vis = docs.filter((d) => canSeeDocument(t, d))
  const hidden = docs.length - vis.length
  return (
    <div className="stack">
      <div className="row between"><span className="small muted">{vis.length} documento(s)</span>{t.can('documentos', 'create') && <ButtonLink icon={<Plus />} to={`${t.base}/documentos?novo=1&paciente=${p.id}`}>Novo documento</ButtonLink>}</div>
      {hidden > 0 && <Alert tone="neutral">{hidden} documento(s) restrito(s) oculto(s) para seu perfil.</Alert>}
      {vis.length === 0 ? <EmptyState title="Nenhum documento" /> : (
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, '--gap': '8px' } as React.CSSProperties}>
          {vis.map((d) => (
            <li key={d.id} className="card tight row between">
              <div className="stack" style={{ '--gap': '2px' } as React.CSSProperties}><strong>{d.title}</strong><span className="small muted">{DOC_KIND_LABEL[d.kind]} · {formatDateTime(d.createdAt)}</span></div>
              <div className="row">
                <Badge tone={d.status === 'emitido' ? 'success' : d.status === 'cancelado' ? 'neutral' : 'warning'}>{d.status === 'emitido' ? 'Emitido' : d.status === 'cancelado' ? 'Cancelado' : 'Rascunho'}</Badge>
                {d.releasedToPortal ? <Badge tone="info">No portal</Badge> : <Badge plain>Interno</Badge>}
                <ButtonLink size="sm" to={`${t.base}/documentos?doc=${d.id}`}>Abrir</ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------- Arquivos ----------------
function FilesTab({ p }: { p: Patient }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const files = useCollection(t.tenantId, 'files').filter((f) => f.patientId === p.id && (!f.restricted || t.scope('clinical') !== false))
  const [cat, setCat] = useState<FileAsset['category']>(t.org.segment === 'odontologia' ? 'radiografia' : 'exame')
  const [restricted, setRestricted] = useState(false)
  const [fail, setFail] = useState(false)
  const [filter, setFilter] = useState<FileAsset['category'] | ''>('')
  const [view, setView] = useState<FileAsset | null>(null)
  const canUp = t.can('arquivos', 'create')
  const shown = files.filter((f) => !filter || f.category === filter).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <div className="stack">
      <Alert tone="info">Originais são guardados como enviados, sem recompressão. Miniaturas seriam derivadas separadas (futuro: storage privado com links temporários). <strong>DICOM diagnóstico exige visualizador específico — integração futura.</strong></Alert>
      {canUp && (
        <Section title="Enviar arquivo">
          <div className="form-grid">
            <Field label="Categoria"><Select value={cat} onChange={(e) => setCat(e.target.value as FileAsset['category'])}>{Object.entries(FILE_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          </div>
          <div className="row"><Checkbox label="Acesso restrito à equipe clínica" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} /><Checkbox label="Simular falha no envio" hint="Demonstração de erro" checked={fail} onChange={(e) => setFail(e.target.checked)} /></div>
          <FileUpload accept={FILE_ACCEPT} maxMb={4} simulateFailure={fail} label="Selecionar arquivo" hint="PNG, JPEG, WebP ou PDF. Máx. 4 MB. Arquivos fictícios apenas." onFile={(f) => run(() => addFile(t.tenantId, p.id, f, cat, restricted, actor), `Arquivo "${f.name}" enviado.`)} />
        </Section>
      )}
      <div className="row between">
        <Field label="Filtrar categoria"><Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="">Todas</option>{Object.entries(FILE_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <span className="small muted" aria-live="polite">{shown.length} arquivo(s)</span>
      </div>
      {shown.length === 0 ? <EmptyState title="Nenhum arquivo" icon={<FileUp aria-hidden="true" />}>Envie exames, imagens ou documentos (fictícios).</EmptyState> : (
        <ul className="gallery">
          {shown.map((f) => (
            <li key={f.id}>
              <button type="button" className="gallery-item" onClick={() => setView(f)}>
                {f.thumbnailUrl ? <img src={f.thumbnailUrl} alt="" loading="lazy" /> : <span className="gallery-pdf" aria-hidden="true">PDF</span>}
                <span className="small strong truncate">{f.name}</span>
                <span className="tiny muted">{FILE_CATEGORY_LABEL[f.category]} · v{f.versions.length}{f.restricted ? ' · restrito' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {view && <FileViewer file={files.find((x) => x.id === view.id) ?? view} onClose={() => setView(null)} canReplace={t.can('arquivos', 'update')} onReplace={(f, note) => run(() => replaceFile(t.tenantId, view.id, f, note, actor), 'Nova versão salva. Versões anteriores preservadas.')} />}
    </div>
  )
}
function FileViewer({ file, onClose, canReplace, onReplace }: { file: FileAsset; onClose: () => void; canReplace: boolean; onReplace: (f: { name: string; mime: string; size: number; dataUrl: string }, note: string) => void }) {
  const [ver, setVer] = useState(file.versions.length)
  const [note, setNote] = useState('')
  const v = file.versions.find((x) => x.version === ver) ?? file.versions[file.versions.length - 1]
  return (
    <Dialog open onClose={onClose} size="lg" title={file.name} description={`${FILE_CATEGORY_LABEL[file.category]} · ${(file.sizeBytes / 1024).toFixed(0)} KB · ${file.mime}`}>
      <div className="stack">
        <Field label="Versão"><Select value={ver} onChange={(e) => setVer(Number(e.target.value))}>{[...file.versions].reverse().map((x) => <option key={x.version} value={x.version}>v{x.version} · {formatDateTime(x.at)} · {x.by}{x.note ? ` · ${x.note}` : ''}</option>)}</Select></Field>
        {v?.dataUrl && file.mime.startsWith('image/') && v.dataUrl.startsWith('data:image/') ? <img src={v.dataUrl} alt={`${file.name}, versão ${v.version}`} className="file-preview" /> : <p className="muted small">Pré-visualização de PDF não incorporada nesta demonstração (o arquivo original está preservado localmente).</p>}
        {canReplace && (
          <fieldset><legend>Substituir (cria nova versão)</legend>
            <Field label="Motivo da substituição" required><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div style={{ marginTop: 8 }}><FileUpload accept={FILE_ACCEPT} maxMb={4} label="Selecionar nova versão" onFile={(f) => { onReplace(f, note); setVer(file.versions.length + 1) }} /></div>
            {!note.trim() && <p className="small muted">Informe o motivo antes de enviar.</p>}
          </fieldset>
        )}
      </div>
    </Dialog>
  )
}

// ---------------- Financeiro (somente leitura) ----------------
function FinanceTab({ p }: { p: Patient }) {
  const t = useTenant()
  const charges = useCollection(t.tenantId, 'charges').filter((c) => c.patientId === p.id).sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  const open = charges.filter((c) => !['cancelada', 'estornada'].includes(c.status)).reduce((a, c) => a + chargeBalance(c), 0)
  const paid = charges.reduce((a, c) => a + c.payments.filter((x) => x.status === 'confirmado').reduce((s, x) => s + x.amountCents, 0), 0)
  const overdue = charges.filter((c) => c.status === 'vencida').length
  return (
    <div className="stack">
      <p className="small muted">Visão somente leitura. Recebimentos e estornos são feitos em Financeiro.</p>
      <div className="grid grid-3"><Kpi label="Saldo em aberto" value={formatBRL(open)} /><Kpi label="Recebido" value={formatBRL(paid)} /><Kpi label="Cobranças vencidas" value={overdue} /></div>
      {charges.length === 0 ? <EmptyState title="Sem cobranças" /> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Cobranças do paciente</caption>
            <thead><tr><th scope="col">Descrição</th><th scope="col">Vencimento</th><th scope="col" className="num">Valor</th><th scope="col" className="num">Saldo</th><th scope="col">Status</th><th scope="col" className="hide-mobile">Pagamentos</th></tr></thead>
            <tbody>{charges.map((c) => <tr key={c.id}><td>{c.description}</td><td>{formatCivil(c.dueDate)}</td><td className="num">{formatBRL(c.amountCents)}</td><td className="num">{formatBRL(chargeBalance(c))}</td><td><Badge tone={c.status === 'paga' ? 'success' : c.status === 'vencida' ? 'danger' : c.status === 'parcial' ? 'warning' : 'neutral'}>{c.status}</Badge></td><td className="small hide-mobile">{c.payments.map((x) => `${PAYMENT_METHOD_LABEL[x.method]} ${formatBRL(x.amountCents)}`).join(', ') || '—'}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {t.moduleOn('financeiro') && <ButtonLink to={`${t.base}/financeiro?paciente=${p.id}`} icon={<ArrowRight />}>Abrir no Financeiro</ButtonLink>}
    </div>
  )
}

// ---------------- Vínculos ----------------
function LinksTab({ p }: { p: Patient }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const links = useCollection(t.tenantId, 'links').filter((l) => l.patientId === p.id)
  const persons = useCollection(t.tenantId, 'persons')
  const others = useCollection(t.tenantId, 'links')
  const patients = useCollection(t.tenantId, 'patients')
  const [adding, setAdding] = useState<RespDraft | null>(null)
  const canEdit = t.can('pacientes', 'update')
  const toggle = (id: ID, k: 'canSeeClinical' | 'canSeeFinancial' | 'canSchedule', v: boolean) => run(() => { db.update(t.tenantId, 'links', id, { [k]: v }); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'vinculo.permissao', resource: 'links', resourceId: id, detail: `${k}=${v}` }) }, 'Permissão atualizada.')
  const remove = async (id: ID) => {
    const r = await confirm({ title: 'Remover vínculo?', body: 'A pessoa perde acesso a este paciente no portal. O cadastro da pessoa é mantido.', danger: true, confirmLabel: 'Remover' })
    if (r.ok) run(() => { db.remove(t.tenantId, 'links', id); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'vinculo.removido', resource: 'links', resourceId: id }) }, 'Vínculo removido.')
  }
  return (
    <div className="stack">
      <p className="small muted">Pessoa (usuário do portal), paciente e responsáveis são cadastros separados. Permissões clínicas e financeiras são independentes por vínculo.</p>
      {links.length === 0 && <EmptyState title="Sem vínculos">Adicione o tutor ou responsável.</EmptyState>}
      {links.map((l) => {
        const per = persons.find((x) => x.id === l.personId)
        const also = others.filter((o) => o.personId === l.personId && o.patientId !== p.id).map((o) => patients.find((x) => x.id === o.patientId)?.name).filter(Boolean)
        return (
          <div key={l.id} className="card tight stack" style={{ '--gap': '6px' } as React.CSSProperties}>
            <div className="row between">
              <div className="stack" style={{ '--gap': '2px' } as React.CSSProperties}><strong>{per?.name ?? 'Pessoa removida'}</strong><span className="small muted">{RELATION_LABEL[l.relation]}{per?.phone ? ` · ${per.phone}` : ''}{per?.email ? ` · ${per.email}` : ''}</span>{also.length > 0 && <span className="tiny muted">Também vinculada a: {also.join(', ')}</span>}</div>
              {canEdit && l.relation !== 'self' && <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => remove(l.id)}>Remover</Button>}
            </div>
            <div className="row">
              <Checkbox label="Vê clínico no portal" checked={l.canSeeClinical} disabled={!canEdit} onChange={(e) => toggle(l.id, 'canSeeClinical', e.target.checked)} />
              <Checkbox label="Vê financeiro" checked={l.canSeeFinancial} disabled={!canEdit} onChange={(e) => toggle(l.id, 'canSeeFinancial', e.target.checked)} />
              <Checkbox label="Pode agendar" checked={l.canSchedule} disabled={!canEdit} onChange={(e) => toggle(l.id, 'canSchedule', e.target.checked)} />
            </div>
            {per && <p className="tiny muted">Comunicação: {[per.communication.whatsapp && 'WhatsApp', per.communication.email && 'e-mail', per.communication.push && 'app'].filter(Boolean).join(', ') || 'nenhum canal'}{per.communication.marketing ? ' · aceita marketing' : ' · sem marketing'}</p>}
          </div>
        )
      })}
      {canEdit && (adding ? (
        <div className="stack">
          <ResponsibleEditor r={adding} persons={persons} onChange={setAdding} onRemove={() => setAdding(null)} />
          <div className="form-actions"><Button onClick={() => setAdding(null)}>Cancelar</Button><Button variant="primary" onClick={() => { if (run(() => { addResponsible(t.tenantId, p.id, { ...adding, personId: adding.mode === 'existente' ? adding.personId : undefined, newPerson: adding.mode === 'nova' ? adding.newPerson : undefined }, { whatsapp: true, email: true, push: false, marketing: false }); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'vinculo.criado', resource: 'links', resourceId: p.id }) }, 'Vínculo criado.')) setAdding(null) }}>Salvar vínculo</Button></div>
        </div>
      ) : <Button icon={<Plus />} onClick={() => setAdding(emptyResp(p.kind === 'animal' ? 'tutor' : 'responsavel_legal'))}>Adicionar {p.kind === 'animal' ? 'tutor/responsável' : 'responsável'}</Button>)}
    </div>
  )
}
