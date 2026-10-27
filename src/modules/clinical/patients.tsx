// /pacientes — lista com filtros, cadastro validado (responsáveis/vínculos separados) e fila de possíveis duplicados.
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Copy, GitMerge, Plus, Trash2, UserPlus } from 'lucide-react'
import type { ID, Patient, Person } from '@/domain/types'
import { useActor, useTenant } from '@/app/session'
import { useCollection, db } from '@/data/store'
import { patientRepo, audit } from '@/data/repositories'
import {
  Alert, Badge, Button, Checkbox, Combobox, DataTable, Dialog, EmptyState, Field, Input, PageHeader, Select, Tabs, TabPanel, useAction, useConfirm, useToast, type Column,
} from '@/ui'
import { maskCPF, maskPhone, normalize, cx } from '@/lib/util'
import { formatCivil, todayCivil, ageFromBirth } from '@/lib/dates'
import { createPatient, filterReviewed, keepSeparate, mergePatients, MERGE_FIELDS, RELATION_LABEL, validatePatient, type PatientInput, type ResponsibleInput } from './lib'
import { patientSubtitle } from './shared'

const COMM_DEFAULT: Person['communication'] = { whatsapp: true, email: true, push: false, marketing: false }

export function PatientsPage() {
  const t = useTenant()
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const isVet = t.org.segment === 'veterinaria'
  const patients = useCollection(t.tenantId, 'patients')
  const links = useCollection(t.tenantId, 'links')
  const persons = useCollection(t.tenantId, 'persons')
  const [tab, setTab] = useState('lista')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'ativo' | 'inativo' | ''>('ativo')
  const [unit, setUnit] = useState<string>(t.unitId ?? '')
  const [tag, setTag] = useState('')
  const [ins, setIns] = useState('')
  const [species, setSpecies] = useState('')
  const open = sp.get('novo') === '1'
  const setOpen = (v: boolean) => { const n = new URLSearchParams(sp); if (v) n.set('novo', '1'); else n.delete('novo'); setSp(n, { replace: true }) }

  const allowed = new Set(t.allowedUnits.map((u) => u.id))
  const scoped = patients.filter((p) => allowed.has(p.unitId))
  const tutorsOf = useMemo(() => {
    const m = new Map<ID, Person[]>()
    for (const l of links) { if (l.relation === 'self') continue; const per = persons.find((x) => x.id === l.personId); if (per) m.set(l.patientId, [...(m.get(l.patientId) ?? []), per]) }
    return m
  }, [links, persons])
  const tags = Array.from(new Set(scoped.flatMap((p) => p.tags))).sort()
  const insurers = Array.from(new Set(scoped.map((p) => p.insurance?.name).filter(Boolean) as string[])).sort()
  const speciesList = Array.from(new Set(scoped.map((p) => p.species).filter(Boolean) as string[])).sort()
  const dupQueue = scoped.filter((p) => p.duplicateOf?.length && p.status === 'ativo')

  if (!t.can('pacientes')) {
    return <><PageHeader title="Pacientes" /><EmptyState title="Seu perfil não acessa cadastros de pacientes">Peça ao proprietário da clínica para revisar suas permissões em Permissões.</EmptyState></>
  }
  const nq = normalize(q)
  const digits = q.replace(/\D/g, '')
  const rows = scoped.filter((p) => {
    if (status && p.status !== status) return false
    if (unit && p.unitId !== unit) return false
    if (tag && !p.tags.includes(tag)) return false
    if (ins === '__sem' && p.insurance) return false
    if (ins && ins !== '__sem' && p.insurance?.name !== ins) return false
    if (species && p.species !== species) return false
    if (!nq) return true
    const tutors = (tutorsOf.get(p.id) ?? []).map((x) => x.name).join(' ')
    return normalize(`${p.name} ${p.socialName ?? ''} ${p.email ?? ''} ${p.microchip ?? ''} ${tutors}`).includes(nq) || (digits.length >= 3 && `${p.cpf ?? ''}${p.phone ?? ''}`.replace(/\D/g, '').includes(digits))
  })

  const cols: Column<Patient>[] = [
    { id: 'name', header: isVet ? 'Animal' : 'Paciente', value: (p) => p.name, cell: (p) => <span className="stack" style={{ '--gap': '0' } as React.CSSProperties}><span>{p.socialName ? `${p.socialName} (${p.name})` : p.name}</span>{p.duplicateOf?.length ? <Badge tone="warning">Possível duplicado</Badge> : null}</span> },
    { id: 'ident', header: isVet ? 'Espécie / idade' : 'Nascimento', value: (p) => (isVet ? p.species : p.birthDate) ?? '', cell: (p) => <span className="small">{p.kind === 'animal' ? patientSubtitle(p) : p.birthDate ? `${formatCivil(p.birthDate)} · ${ageFromBirth(p.birthDate, todayCivil())} anos` : '—'}</span> },
    { id: 'contact', header: isVet ? 'Tutor' : 'Contato', value: (p) => (isVet ? tutorsOf.get(p.id)?.[0]?.name : p.phone) ?? '', cell: (p) => isVet ? <span className="small">{(tutorsOf.get(p.id) ?? []).map((x) => x.name).join(', ') || '—'}</span> : <span className="small">{p.phone ?? (tutorsOf.get(p.id)?.[0] ? `Resp.: ${tutorsOf.get(p.id)![0].name}` : '—')}</span> },
    { id: 'unit', header: 'Unidade', value: (p) => t.units.find((u) => u.id === p.unitId)?.name ?? '', cell: (p) => <span className="small">{t.units.find((u) => u.id === p.unitId)?.name ?? '—'}</span>, hidden: t.units.length < 2 },
    { id: 'ins', header: 'Convênio', value: (p) => p.insurance?.name ?? '', cell: (p) => <span className="small">{p.insurance?.name ?? 'Particular'}</span>, hidden: isVet },
    { id: 'tags', header: 'Etiquetas', cell: (p) => <span className="row" style={{ '--gap': '4px' } as React.CSSProperties}>{p.tags.map((x) => <Badge key={x} plain>{x}</Badge>)}</span>, mobile: false },
    { id: 'status', header: 'Status', value: (p) => p.status, cell: (p) => <Badge tone={p.status === 'ativo' ? 'success' : 'neutral'}>{p.status === 'ativo' ? 'Ativo' : 'Inativo'}</Badge> },
  ]

  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title={isVet ? 'Pacientes (animais) e tutores' : 'Pacientes'} subtitle={`${scoped.filter((p) => p.status === 'ativo').length} cadastros ativos nas unidades que você acessa`}
        actions={t.can('pacientes', 'create') ? <Button variant="primary" icon={<UserPlus />} onClick={() => setOpen(true)} data-tour="primary-action">Cadastrar {isVet ? 'animal' : 'paciente'}</Button> : undefined} />
      <Tabs label="Visões de pacientes" value={tab} onChange={setTab} tabs={[{ id: 'lista', label: 'Cadastros' }, { id: 'dup', label: 'Possíveis duplicados', badge: dupQueue.length || undefined }]} />
      {tab === 'lista' ? (
        <TabPanel>
          <div className="stack">
            <div className="filters">
              <Field label="Buscar" hint={isVet ? 'Nome do animal, tutor, microchip, CPF ou telefone' : 'Nome, CPF, telefone ou e-mail'}><Input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
              <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="">Todos</option><option value="ativo">Ativos</option><option value="inativo">Inativos</option></Select></Field>
              {t.allowedUnits.length > 1 && <Field label="Unidade"><Select value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">Todas permitidas</option>{t.allowedUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>}
              <Field label="Etiqueta"><Select value={tag} onChange={(e) => setTag(e.target.value)}><option value="">Todas</option>{tags.map((x) => <option key={x}>{x}</option>)}</Select></Field>
              {isVet ? <Field label="Espécie"><Select value={species} onChange={(e) => setSpecies(e.target.value)}><option value="">Todas</option>{speciesList.map((x) => <option key={x}>{x}</option>)}</Select></Field>
                : <Field label="Convênio"><Select value={ins} onChange={(e) => setIns(e.target.value)}><option value="">Todos</option><option value="__sem">Particular</option>{insurers.map((x) => <option key={x}>{x}</option>)}</Select></Field>}
            </div>
            <DataTable caption="Lista de pacientes" rows={rows} columns={cols} rowKey={(p) => p.id} onRowClick={(p) => nav(`${t.base}/pacientes/${p.id}`)} exportName={t.can('pacientes', 'export') ? 'pacientes' : undefined}
              empty={<EmptyState title="Nenhum cadastro encontrado">Ajuste os filtros ou cadastre um novo {isVet ? 'animal' : 'paciente'}.</EmptyState>} />
          </div>
        </TabPanel>
      ) : <TabPanel><DuplicateQueue queue={dupQueue} /></TabPanel>}
      {open && <PatientFormDialog onClose={() => setOpen(false)} onCreated={(p) => { setOpen(false); nav(`${t.base}/pacientes/${p.id}`) }} />}
    </div>
  )
}

// ---------------- Cadastro ----------------
export interface RespDraft extends ResponsibleInput { key: string; mode: 'existente' | 'nova' }
export const emptyResp = (relation: RespDraft['relation']): RespDraft => ({ key: Math.random().toString(36).slice(2), mode: 'nova', relation, newPerson: { name: '' }, canSeeClinical: relation !== 'responsavel_financeiro', canSeeFinancial: true, canSchedule: relation !== 'responsavel_financeiro' })

export function PatientFormDialog({ onClose, onCreated, editing }: { onClose: () => void; onCreated?: (p: Patient) => void; editing?: Patient }) {
  const t = useTenant()
  const actor = useActor()
  const toast = useToast()
  const run = useAction()
  const nav = useNavigate()
  const persons = useCollection(t.tenantId, 'persons')
  const isVet = t.org.segment === 'veterinaria'
  const kind: Patient['kind'] = editing?.kind ?? (isVet ? 'animal' : 'human')
  const [f, setF] = useState<PatientInput>(() => editing ? {
    kind, name: editing.name, socialName: editing.socialName, birthDate: editing.birthDate, birthDateEstimated: editing.birthDateEstimated, sex: editing.sex, cpf: editing.cpf, phone: editing.phone, email: editing.email,
    species: editing.species, breed: editing.breed, coat: editing.coat, microchip: editing.microchip, insurance: editing.insurance, tags: editing.tags, unitId: editing.unitId, status: editing.status, sharing: editing.sharing,
  } : { kind, name: '', tags: [], unitId: t.unitId ?? t.allowedUnits[0]?.id ?? t.units[0].id, status: 'ativo', sharing: { portal: true, multidisciplinar: false }, sex: 'nao_informado' })
  const [tagsText, setTagsText] = useState((editing?.tags ?? []).join(', '))
  const [hasIns, setHasIns] = useState(!!editing?.insurance)
  const [comm, setComm] = useState<Person['communication']>(COMM_DEFAULT)
  const [selfPortal, setSelfPortal] = useState(kind === 'human')
  const [resps, setResps] = useState<RespDraft[]>(() => (!editing && isVet ? [emptyResp('tutor')] : []))
  const [weight, setWeight] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dups, setDups] = useState<Patient[] | null>(null)
  const set = <K extends keyof PatientInput>(k: K, v: PatientInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const today = todayCivil()
  const minor = kind === 'human' && f.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(f.birthDate) && ageFromBirth(f.birthDate, today) < 18

  const build = (): PatientInput => ({ ...f, tags: tagsText.split(',').map((x) => x.trim()).filter(Boolean), insurance: hasIns ? f.insurance ?? { name: '', cardNumber: '' } : undefined })
  const submit = (ack: boolean) => {
    const input = build()
    const e = validatePatient(input, today)
    if (kind === 'animal' && !editing && !resps.some((r) => r.relation === 'tutor')) e.resps = 'Informe ao menos um tutor.'
    resps.forEach((r, i) => { if (r.mode === 'existente' ? !r.personId : !r.newPerson?.name.trim()) e[`resp${i}`] = 'Selecione ou informe o responsável.' })
    if (weight && !(Number(weight.replace(',', '.')) > 0)) e.weight = 'Peso inválido.'
    setErrors(e)
    if (Object.keys(e).length) { toast('Revise os campos destacados.', 'error'); return }
    if (editing) {
      run(() => {
        patientRepo.update(t.tenantId, editing.id, { ...input, cpf: input.cpf || undefined, phone: input.phone || undefined, email: input.email || undefined, birthDate: input.birthDate || undefined })
        audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'paciente.atualizado', resource: 'patients', resourceId: editing.id })
        onClose()
      }, 'Cadastro atualizado.')
      return
    }
    const found = filterReviewed(t.tenantId, undefined, patientRepo.findDuplicates(t.tenantId, { name: input.name, cpf: input.cpf, phone: input.phone, birthDate: input.birthDate }))
    if (found.length && !ack) { setDups(found); return }
    run(() => {
      const p = createPatient(t.tenantId, input, { selfPortal: selfPortal && kind === 'human' && !minor, communication: comm, responsibles: resps.map((r) => ({ ...r, personId: r.mode === 'existente' ? r.personId : undefined, newPerson: r.mode === 'nova' ? r.newPerson : undefined })), duplicateOf: ack ? found.map((x) => x.id) : undefined }, actor)
      if (weight) patientRepo.update(t.tenantId, p.id, { weights: [{ date: today, kg: Number(weight.replace(',', '.')) }] })
      onCreated?.(p)
    }, ack ? 'Cadastro salvo e enviado para revisão de duplicidade.' : 'Cadastro criado.')
  }

  return (
    <Dialog open onClose={onClose} size="lg" title={editing ? 'Editar cadastro' : isVet ? 'Cadastrar animal' : 'Cadastrar paciente'} description="Dados fictícios nesta demonstração. Campos com * são obrigatórios."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => submit(false)}>{editing ? 'Salvar alterações' : 'Salvar cadastro'}</Button></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(false) }} noValidate>
        {dups && (
          <Alert tone="warning" title={`Encontramos ${dups.length} cadastro(s) parecido(s) nesta clínica`}>
            <ul className="small" style={{ margin: '4px 0', paddingLeft: 18 }}>{dups.map((d) => <li key={d.id}>{d.name} — {patientSubtitle(d) || d.phone || 'sem identificação'} <button type="button" className="btn-link" style={{ minHeight: 0 }} onClick={() => { onClose(); nav(`${t.base}/pacientes/${d.id}`) }}>abrir</button></li>)}</ul>
            <p className="small">Nada é mesclado automaticamente. Se for outra pessoa, salve: o cadastro entra na fila de revisão para decisão manual.</p>
            <div className="row" style={{ marginTop: 6 }}><Button size="sm" onClick={() => setDups(null)}>Voltar e revisar</Button><Button size="sm" variant="primary" onClick={() => submit(true)}>Salvar mesmo assim</Button></div>
          </Alert>
        )}
        <fieldset><legend>Identificação</legend>
          <div className="form-grid">
            <Field label={isVet ? 'Nome do animal' : 'Nome completo'} required error={errors.name}><Input value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" /></Field>
            {kind === 'human' && <Field label="Nome social" hint="Exibido no atendimento quando informado"><Input value={f.socialName ?? ''} onChange={(e) => set('socialName', e.target.value || undefined)} /></Field>}
            {kind === 'animal' && <>
              <Field label="Espécie" required error={errors.species}><Input value={f.species ?? ''} onChange={(e) => set('species', e.target.value)} list="clin-species" /></Field>
              <datalist id="clin-species"><option>Cão</option><option>Gato</option><option>Ave</option><option>Coelho</option><option>Réptil</option></datalist>
              <Field label="Raça"><Input value={f.breed ?? ''} onChange={(e) => set('breed', e.target.value)} /></Field>
              <Field label="Pelagem"><Input value={f.coat ?? ''} onChange={(e) => set('coat', e.target.value)} /></Field>
              <Field label="Microchip"><Input value={f.microchip ?? ''} inputMode="numeric" onChange={(e) => set('microchip', e.target.value.replace(/\D/g, '').slice(0, 15) || undefined)} /></Field>
              {!editing && <Field label="Peso atual (kg)" error={errors.weight}><Input value={weight} inputMode="decimal" onChange={(e) => setWeight(e.target.value.replace(/[^\d.,]/g, ''))} /></Field>}
            </>}
            <Field label={kind === 'animal' ? 'Data de nascimento (ou estimada)' : 'Data de nascimento'} hint="Data civil, sem fuso" error={errors.birthDate}><Input type="date" max={today} value={f.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value || undefined)} /></Field>
            <Field label="Sexo"><Select value={f.sex ?? 'nao_informado'} onChange={(e) => set('sex', e.target.value as Patient['sex'])}>{kind === 'animal' ? <><option value="M">Macho</option><option value="F">Fêmea</option><option value="nao_informado">Não informado</option></> : <><option value="F">Feminino</option><option value="M">Masculino</option><option value="I">Intersexo</option><option value="nao_informado">Prefere não informar</option></>}</Select></Field>
          </div>
          {kind === 'animal' && <Checkbox label="Data de nascimento estimada" checked={!!f.birthDateEstimated} onChange={(e) => set('birthDateEstimated', e.target.checked)} />}
        </fieldset>
        {kind === 'human' && (
          <fieldset><legend>Documento e contato</legend>
            <div className="form-grid">
              <Field label="CPF" hint="Opcional. Validado se informado." error={errors.cpf}><Input value={f.cpf ?? ''} mask={maskCPF} inputMode="numeric" onChange={(e) => set('cpf', e.target.value || undefined)} placeholder="000.000.000-00" /></Field>
              <Field label="Telefone" error={errors.phone}><Input value={f.phone ?? ''} mask={maskPhone} inputMode="tel" onChange={(e) => set('phone', e.target.value || undefined)} placeholder="(00) 00000-0000" /></Field>
              <Field label="E-mail" error={errors.email}><Input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value || undefined)} placeholder="nome@exemplo.test" /></Field>
            </div>
          </fieldset>
        )}
        <fieldset><legend>Operação</legend>
          <div className="form-grid">
            <Field label="Unidade"><Select value={f.unitId} onChange={(e) => set('unitId', e.target.value)}>{t.allowedUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
            <Field label="Status"><Select value={f.status} onChange={(e) => set('status', e.target.value as Patient['status'])}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></Select></Field>
            <Field label="Etiquetas" hint="Separadas por vírgula (administrativas, sem dado clínico)"><Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} /></Field>
          </div>
          {!isVet && <Checkbox label="Possui convênio" checked={hasIns} onChange={(e) => setHasIns(e.target.checked)} />}
          {hasIns && (
            <div className="form-grid">
              <Field label="Convênio" required error={errors.insurance}><Input value={f.insurance?.name ?? ''} onChange={(e) => set('insurance', { cardNumber: '', ...f.insurance, name: e.target.value })} /></Field>
              <Field label="Nº da carteirinha" required><Input value={f.insurance?.cardNumber ?? ''} onChange={(e) => set('insurance', { name: '', ...f.insurance, cardNumber: e.target.value })} /></Field>
              <Field label="Plano"><Input value={f.insurance?.plan ?? ''} onChange={(e) => set('insurance', { name: '', cardNumber: '', ...f.insurance, plan: e.target.value })} /></Field>
              <Field label="Validade"><Input type="date" value={f.insurance?.validUntil ?? ''} onChange={(e) => set('insurance', { name: '', cardNumber: '', ...f.insurance, validUntil: e.target.value || undefined })} /></Field>
            </div>
          )}
        </fieldset>
        <fieldset><legend>Compartilhamento</legend>
          <Checkbox label="Permitir acesso pelo portal" hint="Documentos e orientações só aparecem no portal quando liberados explicitamente." checked={f.sharing.portal} onChange={(e) => set('sharing', { ...f.sharing, portal: e.target.checked })} />
          <Checkbox label="Compartilhar com a equipe multidisciplinar" checked={f.sharing.multidisciplinar} onChange={(e) => set('sharing', { ...f.sharing, multidisciplinar: e.target.checked })} />
        </fieldset>
        {!editing && (
          <>
            <fieldset><legend>Preferências de comunicação</legend>
              <p className="small muted">Aplicadas às pessoas criadas neste cadastro (paciente adulto e responsáveis novos).</p>
              <div className="row">
                <Checkbox label="WhatsApp" checked={comm.whatsapp} onChange={(e) => setComm({ ...comm, whatsapp: e.target.checked })} />
                <Checkbox label="E-mail" checked={comm.email} onChange={(e) => setComm({ ...comm, email: e.target.checked })} />
                <Checkbox label="Notificação no app" checked={comm.push} onChange={(e) => setComm({ ...comm, push: e.target.checked })} />
                <Checkbox label="Aceita comunicações de marketing" checked={comm.marketing} onChange={(e) => setComm({ ...comm, marketing: e.target.checked })} />
              </div>
              {kind === 'human' && !minor && <Checkbox label="Criar acesso ao portal para o próprio paciente" hint="Cria a pessoa e o vínculo 'próprio paciente'." checked={selfPortal} onChange={(e) => setSelfPortal(e.target.checked)} />}
            </fieldset>
            <fieldset><legend>{isVet ? 'Tutores e responsáveis' : 'Responsáveis'}</legend>
              {minor && !resps.some((r) => r.relation === 'responsavel_legal') && <Alert tone="warning">Paciente menor de idade: informe o responsável legal.</Alert>}
              {errors.resps && <p className="error small" role="alert" style={{ color: 'var(--q-danger)' }}>{errors.resps}</p>}
              <div className="stack" style={{ '--gap': '12px' } as React.CSSProperties}>
                {resps.map((r, i) => <ResponsibleEditor key={r.key} r={r} persons={persons} error={errors[`resp${i}`]} onChange={(n) => setResps(resps.map((x) => (x.key === r.key ? n : x)))} onRemove={() => setResps(resps.filter((x) => x.key !== r.key))} />)}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {isVet && <Button size="sm" icon={<Plus />} onClick={() => setResps([...resps, emptyResp('tutor')])}>Tutor</Button>}
                <Button size="sm" icon={<Plus />} onClick={() => setResps([...resps, emptyResp('responsavel_legal')])}>Responsável legal</Button>
                <Button size="sm" icon={<Plus />} onClick={() => setResps([...resps, emptyResp('responsavel_financeiro')])}>Responsável financeiro</Button>
              </div>
            </fieldset>
          </>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

export function ResponsibleEditor({ r, persons, onChange, onRemove, error }: { r: RespDraft; persons: Person[]; onChange: (r: RespDraft) => void; onRemove: () => void; error?: string }) {
  const sel = persons.find((p) => p.id === r.personId) ?? null
  return (
    <div className="resp-card">
      <div className="row between">
        <Select aria-label="Tipo de vínculo" value={r.relation} onChange={(e) => onChange({ ...r, relation: e.target.value as RespDraft['relation'] })} style={{ maxWidth: 240 }}>
          {(['tutor', 'responsavel_legal', 'responsavel_financeiro'] as const).map((k) => <option key={k} value={k}>{RELATION_LABEL[k]}</option>)}
        </Select>
        <div className="row">
          <div className="segmented" role="group" aria-label="Origem da pessoa">
            <button type="button" aria-pressed={r.mode === 'existente'} onClick={() => onChange({ ...r, mode: 'existente' })}>Pessoa já cadastrada</button>
            <button type="button" aria-pressed={r.mode === 'nova'} onClick={() => onChange({ ...r, mode: 'nova' })}>Nova pessoa</button>
          </div>
          <Button size="sm" variant="ghost" iconOnly icon={<Trash2 />} onClick={onRemove}>Remover responsável</Button>
        </div>
      </div>
      {r.mode === 'existente'
        ? <Combobox label="Pessoa" items={persons} value={sel} onChange={(p) => onChange({ ...r, personId: p?.id })} getLabel={(p) => p.name} getSub={(p) => [p.cpf, p.phone].filter(Boolean).join(' · ')} error={error} required />
        : <div className="form-grid">
          <Field label="Nome" required error={error}><Input value={r.newPerson?.name ?? ''} onChange={(e) => onChange({ ...r, newPerson: { ...r.newPerson!, name: e.target.value } })} /></Field>
          <Field label="CPF"><Input value={r.newPerson?.cpf ?? ''} mask={maskCPF} inputMode="numeric" onChange={(e) => onChange({ ...r, newPerson: { ...r.newPerson!, cpf: e.target.value || undefined } })} /></Field>
          <Field label="Telefone"><Input value={r.newPerson?.phone ?? ''} mask={maskPhone} inputMode="tel" onChange={(e) => onChange({ ...r, newPerson: { ...r.newPerson!, phone: e.target.value || undefined } })} /></Field>
          <Field label="E-mail"><Input type="email" value={r.newPerson?.email ?? ''} onChange={(e) => onChange({ ...r, newPerson: { ...r.newPerson!, email: e.target.value || undefined } })} /></Field>
        </div>}
      <div className="row">
        <Checkbox label="Vê informações clínicas no portal" checked={r.canSeeClinical} onChange={(e) => onChange({ ...r, canSeeClinical: e.target.checked })} />
        <Checkbox label="Vê financeiro" checked={r.canSeeFinancial} onChange={(e) => onChange({ ...r, canSeeFinancial: e.target.checked })} />
        <Checkbox label="Pode agendar" checked={r.canSchedule} onChange={(e) => onChange({ ...r, canSchedule: e.target.checked })} />
      </div>
    </div>
  )
}

// ---------------- Duplicidade ----------------
function DuplicateQueue({ queue }: { queue: Patient[] }) {
  const t = useTenant()
  const patients = useCollection(t.tenantId, 'patients')
  const [review, setReview] = useState<{ dup: Patient; other: Patient } | null>(null)
  if (!queue.length) return <EmptyState title="Nenhum possível duplicado pendente" icon={<Copy aria-hidden="true" />}>Sugestões aparecem aqui quando um cadastro parecido é salvo ou importado. A decisão é sempre manual.</EmptyState>
  return (
    <div className="stack">
      <Alert tone="info">Cada clínica é isolada: o mesmo CPF em outra organização não é considerado nem pode ser mesclado. Nenhuma mesclagem é automática.</Alert>
      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, '--gap': '8px' } as React.CSSProperties}>
        {queue.flatMap((d) => (d.duplicateOf ?? []).map((oid) => {
          const o = patients.find((p) => p.id === oid)
          if (!o) return null
          return (
            <li key={`${d.id}-${oid}`} className="card tight row between">
              <div className="stack" style={{ '--gap': '2px' } as React.CSSProperties}>
                <strong>{d.name} ↔ {o.name}</strong>
                <span className="small muted">{[d.cpf && d.cpf === o.cpf ? 'mesmo CPF' : null, d.phone && d.phone === o.phone ? 'mesmo telefone' : null, d.birthDate && d.birthDate === o.birthDate ? 'mesma data de nascimento' : null].filter(Boolean).join(' · ') || 'nome semelhante'}</span>
              </div>
              <Button icon={<GitMerge />} onClick={() => setReview({ dup: d, other: o })} disabled={!t.can('pacientes', 'update')}>Revisar lado a lado</Button>
            </li>
          )
        }))}
      </ul>
      {review && <MergeDialog dup={review.dup} other={review.other} onClose={() => setReview(null)} />}
    </div>
  )
}

function countRefs(tenantId: ID, pid: ID) {
  return { agendamentos: db.list(tenantId, 'appointments').filter((x) => x.patientId === pid).length, registros: db.list(tenantId, 'records').filter((x) => x.patientId === pid).length, documentos: db.list(tenantId, 'documents').filter((x) => x.patientId === pid).length, cobranças: db.list(tenantId, 'charges').filter((x) => x.patientId === pid).length }
}

function MergeDialog({ dup, other, onClose }: { dup: Patient; other: Patient; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const [keepId, setKeepId] = useState<ID>(other.id)
  const keep = keepId === other.id ? other : dup
  const drop = keepId === other.id ? dup : other
  const [pick, setPick] = useState<Record<string, 'keep' | 'drop'>>({})
  const fields = MERGE_FIELDS.filter((m) => (m.key !== 'species' && m.key !== 'breed' && m.key !== 'microchip') || keep.kind === 'animal')
  const show = (p: Patient, k: keyof Patient) => {
    const v = p[k]
    if (k === 'unitId') return t.units.find((u) => u.id === v)?.name ?? '—'
    if (k === 'birthDate') return formatCivil(v as string)
    return v == null || v === '' ? '—' : String(v)
  }
  const rk = countRefs(t.tenantId, keep.id), rd = countRefs(t.tenantId, drop.id)
  const doMerge = async () => {
    const fromDup = fields.filter((m) => pick[m.key] === 'drop').map((m) => m.key)
    const r = await confirm({ title: 'Confirmar mesclagem manual', danger: true, requireReason: true, reasonLabel: 'Motivo (registrado na auditoria)', confirmLabel: 'Mesclar cadastros', body: <p>O cadastro <strong>{drop.name}</strong> será inativado (não apagado) e seus agendamentos, registros, documentos e cobranças passarão para <strong>{keep.name}</strong>. Alergias e alertas são unidos. {fromDup.length} campo(s) virão do cadastro inativado.</p> })
    if (!r.ok) return
    if (run(() => mergePatients(t.tenantId, keep.id, drop.id, fromDup, actor, r.reason), 'Cadastros mesclados. Ação registrada na auditoria.')) onClose()
  }
  const doSeparate = async () => {
    const r = await confirm({ title: 'Manter cadastros separados?', body: 'A sugestão sai da fila e este par não volta a ser sugerido.', confirmLabel: 'Manter separados' })
    if (!r.ok) return
    if (run(() => keepSeparate(t.tenantId, dup.id, other.id, actor, r.reason), 'Mantidos separados. Decisão registrada.')) onClose()
  }
  return (
    <Dialog open onClose={onClose} size="xl" title="Revisar possível duplicidade" description="Escolha, campo a campo, qual valor permanece. Nada é aplicado sem sua confirmação."
      footer={<><Button onClick={onClose}>Fechar</Button><Button onClick={doSeparate}>Manter separados</Button><Button variant="danger" icon={<GitMerge />} onClick={doMerge}>Mesclar…</Button></>}>
      <div className="stack">
        <div className="row"><span className="small strong">Cadastro mantido:</span>
          <div className="segmented" role="group" aria-label="Cadastro mantido">
            {[other, dup].map((p) => <button key={p.id} type="button" aria-pressed={keepId === p.id} onClick={() => { setKeepId(p.id); setPick({}) }}>{p.name}{p.duplicateOf ? ' (sugerido como duplicado)' : ''}</button>)}
          </div>
        </div>
        <div className="scroll-x">
          <table className="table merge-table">
            <caption className="sr-only">Comparação dos cadastros</caption>
            <thead><tr><th scope="col">Campo</th><th scope="col">Mantido: {keep.name}</th><th scope="col">Inativado: {drop.name}</th></tr></thead>
            <tbody>
              {fields.map((m) => {
                const a = show(keep, m.key), b = show(drop, m.key)
                const same = a === b
                return (
                  <tr key={m.key} className={cx(!same && 'diff')}>
                    <th scope="row">{m.label}</th>
                    <td><label className="check"><input type="radio" name={`m-${m.key}`} checked={pick[m.key] !== 'drop'} onChange={() => setPick({ ...pick, [m.key]: 'keep' })} disabled={same} />{a}</label></td>
                    <td><label className="check"><input type="radio" name={`m-${m.key}`} checked={pick[m.key] === 'drop'} onChange={() => setPick({ ...pick, [m.key]: 'drop' })} disabled={same} />{b}</label></td>
                  </tr>
                )
              })}
              <tr><th scope="row">Vínculos</th><td className="small">{Object.entries(rk).map(([k, v]) => `${v} ${k}`).join(' · ')}</td><td className="small">{Object.entries(rd).map(([k, v]) => `${v} ${k}`).join(' · ')} (serão transferidos)</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  )
}
