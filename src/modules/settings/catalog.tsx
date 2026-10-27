// Editores de catálogo e estrutura: Unidades (+ Recursos), Serviços e Equipe (+ Profissionais).
// Reutilizados no Onboarding (etapas 3 e 5) e na SettingsPage (abas Unidades, Serviços e Equipe).
import { useState } from 'react'
import { useActor, useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { audit } from '@/data/repositories'
import type { ID, Professional, Resource, ResourceKind, Service, StaffUser, TenantRole, Unit } from '@/domain/types'
import { TENANT_ROLE_LABEL } from '@/domain/permissions'
import { Badge, Button, Checkbox, DataTable, Dialog, Field, Input, Select, useAction, useConfirm, type Column } from '@/ui'
import { formatBRL, parseBRL } from '@/lib/money'
import { hhmmToMinutes, minutesToHHMM, nowISO } from '@/lib/dates'
import { maskPhone, uid } from '@/lib/util'
import { assertWithinLimit, validateDemoEmail, validateHours, WEEKDAYS, TIMEZONES } from './lib'

const RESOURCE_KINDS: { value: ResourceKind; label: string }[] = [
  { value: 'consultorio', label: 'Consultório' },
  { value: 'sala', label: 'Sala' },
  { value: 'cadeira', label: 'Cadeira' },
  { value: 'box', label: 'Box' },
  { value: 'equipamento', label: 'Equipamento' },
]

// ---------------- UNIDADES & RECURSOS ----------------
export function UnitsEditor() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const units = useCollection(t.tenantId, 'units')
  const resources = useCollection(t.tenantId, 'resources')
  const editable = t.can('configuracoes', 'update')
  const [unitModal, setUnitModal] = useState<Unit | null | 'new'>(null)
  const [resModal, setResModal] = useState<{ unitId: ID; res: Resource | 'new' } | null>(null)

  const removeUnit = async (u: Unit) => {
    if (units.length <= 1) { run(() => { throw new Error('A organização precisa ter ao menos uma unidade.') }); return }
    const hasAppts = db.list(t.tenantId, 'appointments').some((a) => a.unitId === u.id)
    if (hasAppts) { run(() => { throw new Error('Esta unidade já possui agendamentos registrados e não pode ser removida.') }); return }
    const r = await confirm({ title: `Remover unidade ${u.name}?`, body: 'Todos os recursos associados a esta unidade serão removidos.', danger: true, confirmLabel: 'Remover unidade' })
    if (!r.ok) return
    run(() => {
      db.remove(t.tenantId, 'units', u.id)
      resources.filter((res) => res.unitId === u.id).forEach((res) => db.remove(t.tenantId, 'resources', res.id))
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'unidade.removida', resource: 'units', resourceId: u.id, detail: u.name })
    }, 'Unidade removida.')
  }

  return (
    <div className="stack">
      <div className="row between">
        <p className="small muted">Cada unidade possui fuso IANA, horários semanais, feriados e recursos alocáveis.</p>
        {editable && <Button variant="primary" onClick={() => run(() => { assertWithinLimit(t.org, 'units'); setUnitModal('new') })}>Nova unidade</Button>}
      </div>
      <div className="stack" style={{ gap: 16 }}>
        {units.map((u) => {
          const uRes = resources.filter((r) => r.unitId === u.id)
          return (
            <div key={u.id} className="card">
              <div className="row between" style={{ marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 17 }}>{u.name}</h3>
                  <p className="small muted">{u.address || 'Sem endereço'} · {u.phone || 'Sem telefone'} · {u.timezone}</p>
                </div>
                {editable && (
                  <div className="row">
                    <Button size="sm" onClick={() => setUnitModal(u)}>Editar unidade</Button>
                    {units.length > 1 && <Button size="sm" variant="danger" onClick={() => removeUnit(u)}>Remover</Button>}
                  </div>
                )}
              </div>
              <div className="divider-list" style={{ borderTop: '1px solid var(--q-border)', paddingTop: 10 }}>
                <div className="row between" style={{ padding: '6px 0' }}>
                  <strong>Recursos da unidade ({uRes.length})</strong>
                  {editable && <Button size="sm" onClick={() => setResModal({ unitId: u.id, res: 'new' })}>Adicionar recurso</Button>}
                </div>
                <div className="grid grid-3" style={{ gap: 8 }}>
                  {uRes.map((r) => (
                    <div key={r.id} className="panel" style={{ padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div className="strong" style={{ fontSize: 13 }}>{r.name}</div>
                        <div className="tiny muted">{RESOURCE_KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}</div>
                      </div>
                      {editable && (
                        <div className="row">
                          <button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={() => setResModal({ unitId: u.id, res: r })}>Editar</button>
                          <button type="button" className="btn-link" style={{ fontSize: 12, color: 'var(--q-danger)' }} onClick={() => run(() => {
                            const inUse = db.list(t.tenantId, 'appointments').some((a) => a.resourceIds.includes(r.id) && !['cancelada', 'faltou'].includes(a.status))
                            if (inUse) throw new Error('Recurso em uso por agendamento ativo. Não pode ser removido.')
                            db.remove(t.tenantId, 'resources', r.id)
                          }, 'Recurso removido.')}>Excluir</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!uRes.length && <p className="small muted">Nenhum recurso cadastrado nesta unidade.</p>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {unitModal && <UnitDialog target={unitModal} onClose={() => setUnitModal(null)} />}
      {resModal && <ResourceDialog unitId={resModal.unitId} target={resModal.res} onClose={() => setResModal(null)} />}
    </div>
  )
}

function UnitDialog({ target, onClose }: { target: Unit | 'new'; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const isNew = target === 'new'
  const [f, setF] = useState<Omit<Unit, 'id' | 'tenantId' | 'createdAt'>>(() => {
    if (target !== 'new') return { name: target.name, timezone: target.timezone, address: target.address, phone: target.phone, hours: target.hours, holidays: target.holidays ?? [], specialHours: target.specialHours ?? [] }
    return {
      name: '', timezone: t.org.timezone, address: '', phone: '',
      hours: { 0: [], 1: [{ start: 480, end: 1080 }], 2: [{ start: 480, end: 1080 }], 3: [{ start: 480, end: 1080 }], 4: [{ start: 480, end: 1080 }], 5: [{ start: 480, end: 1080 }], 6: [] },
      holidays: [], specialHours: [],
    }
  })

  const save = () => run(() => {
    if (f.name.trim().length < 2) throw new Error('Informe o nome da unidade.')
    const errH = validateHours(f.hours)
    if (errH) throw new Error(errH)
    if (isNew) {
      assertWithinLimit(t.org, 'units')
      const id = uid('u_')
      db.insert(t.tenantId, 'units', { id, tenantId: t.tenantId, createdAt: nowISO(), ...f })
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'unidade.criada', resource: 'units', resourceId: id, detail: f.name })
    } else {
      db.update(t.tenantId, 'units', target.id, f)
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'unidade.atualizada', resource: 'units', resourceId: target.id, detail: f.name })
    }
    onClose()
  }, isNew ? 'Unidade criada.' : 'Unidade atualizada.')

  const setHourDay = (d: number, active: boolean, start = 480, end = 1080) => {
    setF({ ...f, hours: { ...f.hours, [d]: active ? [{ start, end }] : [] } })
  }

  return (
    <Dialog open onClose={onClose} size="lg" title={isNew ? 'Nova unidade' : `Editar ${target.name}`} footer={<>
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="primary" onClick={save}>Salvar unidade</Button>
    </>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Nome da unidade" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Fuso horário"><Select value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}</Select></Field>
          <Field label="Endereço"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="Telefone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} mask={maskPhone} /></Field>
        </div>
        <fieldset className="stack">
          <legend>Horários de funcionamento por dia</legend>
          <div className="st-hours">
            {WEEKDAYS.map((name, d) => {
              const active = (f.hours[d] ?? []).length > 0
              const int = f.hours[d]?.[0] ?? { start: 480, end: 1080 }
              return (
                <div key={d} className="st-day">
                  <Checkbox label={name} checked={active} onChange={(e) => setHourDay(d, e.target.checked, int.start, int.end)} />
                  {active && (
                    <div className="st-int">
                      <Input type="time" value={minutesToHHMM(int.start)} onChange={(e) => setF({ ...f, hours: { ...f.hours, [d]: [{ start: hhmmToMinutes(e.target.value), end: int.end }] } })} />
                      <span>até</span>
                      <Input type="time" value={minutesToHHMM(int.end)} onChange={(e) => setF({ ...f, hours: { ...f.hours, [d]: [{ start: int.start, end: hhmmToMinutes(e.target.value) }] } })} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </fieldset>
      </div>
    </Dialog>
  )
}

function ResourceDialog({ unitId, target, onClose }: { unitId: ID; target: Resource | 'new'; onClose: () => void }) {
  const t = useTenant()
  const run = useAction()
  const isNew = target === 'new'
  const [name, setName] = useState(target === 'new' ? '' : target.name)
  const [kind, setKind] = useState<ResourceKind>(target === 'new' ? 'consultorio' : target.kind)

  const save = () => run(() => {
    if (name.trim().length < 2) throw new Error('Informe o nome do recurso.')
    if (isNew) {
      db.insert(t.tenantId, 'resources', { id: uid('r_'), tenantId: t.tenantId, createdAt: nowISO(), unitId, name: name.trim(), kind, active: true, blocks: [] })
    } else {
      db.update(t.tenantId, 'resources', target.id, { name: name.trim(), kind })
    }
    onClose()
  }, isNew ? 'Recurso adicionado.' : 'Recurso atualizado.')

  return (
    <Dialog open onClose={onClose} title={isNew ? 'Novo recurso' : 'Editar recurso'} footer={<>
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="primary" onClick={save}>Salvar</Button>
    </>}>
      <div className="form-grid">
        <Field label="Nome do recurso" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Consultório 1, Cadeira A" /></Field>
        <Field label="Tipo"><Select value={kind} onChange={(e) => setKind(e.target.value as ResourceKind)}>{RESOURCE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
      </div>
    </Dialog>
  )
}

// ---------------- SERVIÇOS ----------------
export function ServicesEditor() {
  const t = useTenant()
  const run = useAction()
  const services = useCollection(t.tenantId, 'services')
  const editable = t.can('configuracoes', 'update')
  const [modal, setModal] = useState<Service | null | 'new'>(null)

  const toggleActive = (s: Service) => run(() => {
    db.update(t.tenantId, 'services', s.id, { active: !s.active })
  }, s.active ? 'Serviço inativado.' : 'Serviço reativado.')

  const cols: Column<Service>[] = [
    { id: 'name', header: 'Serviço', cell: (s) => <div><strong>{s.name}</strong><div className="tiny muted">{s.category} {s.code && `· ${s.code}`}</div></div>, value: (s) => s.name },
    { id: 'duration', header: 'Duração', cell: (s) => `${s.durationMin} min${s.bufferMin ? ` (+${s.bufferMin}m)` : ''}`, value: (s) => s.durationMin },
    { id: 'price', header: 'Preço', cell: (s) => formatBRL(s.priceCents), value: (s) => s.priceCents, num: true },
    { id: 'public', header: 'Público', cell: (s) => s.publicBookable ? <Badge tone="brand">Agendável</Badge> : <span className="tiny muted">Interno</span> },
    { id: 'status', header: 'Status', cell: (s) => s.active ? <Badge tone="success">Ativo</Badge> : <Badge tone="neutral">Inativo</Badge> },
  ]

  return (
    <div className="stack">
      <div className="row between">
        <p className="small muted">Serviços ofertados com duração, buffer de transição, preço e recursos exigidos.</p>
        {editable && <Button variant="primary" onClick={() => setModal('new')}>Novo serviço</Button>}
      </div>
      <DataTable rows={services} columns={cols} rowKey={(s) => s.id} caption="Lista de serviços da clínica" exportName="servicos"
        rowActions={editable ? (s) => (
          <>
            <Button size="sm" onClick={() => setModal(s)}>Editar</Button>
            <Button size="sm" onClick={() => toggleActive(s)}>{s.active ? 'Inativar' : 'Reativar'}</Button>
          </>
        ) : undefined} />
      {modal && <ServiceDialog target={modal} onClose={() => setModal(null)} />}
    </div>
  )
}

function ServiceDialog({ target, onClose }: { target: Service | 'new'; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const isNew = target === 'new'
  const [name, setName] = useState(target === 'new' ? '' : target.name)
  const [cat, setCat] = useState(target === 'new' ? 'Consultas' : target.category)
  const [code, setCode] = useState(target === 'new' ? '' : target.code ?? '')
  const [dur, setDur] = useState(target === 'new' ? '30' : String(target.durationMin))
  const [buf, setBuf] = useState(target === 'new' ? '0' : String(target.bufferMin))
  const [price, setPrice] = useState(target === 'new' ? '150,00' : (target.priceCents / 100).toFixed(2).replace('.', ','))
  const [pub, setPub] = useState(target === 'new' ? true : target.publicBookable)
  const [kinds, setKinds] = useState<Set<ResourceKind>>(new Set(target === 'new' ? [] : target.resourceKinds))

  const save = () => run(() => {
    if (name.trim().length < 2) throw new Error('Informe o nome do serviço.')
    const durationMin = Number(dur)
    if (!Number.isInteger(durationMin) || durationMin < 5) throw new Error('Duração mínima: 5 minutos.')
    const bufferMin = Number(buf)
    if (!Number.isInteger(bufferMin) || bufferMin < 0) throw new Error('Intervalo inválido.')
    const cents = parseBRL(price)
    if (cents === null || cents < 0) throw new Error('Preço inválido.')
    const payload = {
      name: name.trim(), category: cat.trim() || 'Geral', code: code.trim() || undefined,
      durationMin, bufferMin, priceCents: cents, publicBookable: pub, resourceKinds: Array.from(kinds), active: true, kit: [],
    }
    if (isNew) {
      const id = uid('svc_')
      db.insert(t.tenantId, 'services', { id, tenantId: t.tenantId, createdAt: nowISO(), ...payload })
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'servico.criado', resource: 'services', resourceId: id, detail: payload.name })
    } else {
      db.update(t.tenantId, 'services', target.id, payload)
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'servico.atualizado', resource: 'services', resourceId: target.id, detail: payload.name })
    }
    onClose()
  }, isNew ? 'Serviço criado.' : 'Serviço salvo.')

  return (
    <Dialog open onClose={onClose} size="lg" title={isNew ? 'Novo serviço' : `Editar ${target.name}`} footer={<>
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="primary" onClick={save}>Salvar serviço</Button>
    </>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Nome do serviço" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Categoria"><Input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Consultas, Exames, Procedimentos" /></Field>
          <Field label="Código TUSS / Interno"><Input value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          <Field label="Preço (R$)" required><Input value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          <Field label="Duração (minutos)" required><Input type="number" min={5} step={5} value={dur} onChange={(e) => setDur(e.target.value)} /></Field>
          <Field label="Intervalo após o atendimento (buffer min)"><Input type="number" min={0} step={5} value={buf} onChange={(e) => setBuf(e.target.value)} /></Field>
        </div>
        <Checkbox label="Permitir agendamento pelo paciente no site/portal público" checked={pub} onChange={(e) => setPub(e.target.checked)} />
        <fieldset>
          <legend>Recursos exigidos para este serviço</legend>
          <div className="grid grid-3" style={{ gap: 8 }}>
            {RESOURCE_KINDS.map((k) => (
              <Checkbox key={k.value} label={k.label} checked={kinds.has(k.value)} onChange={(e) => {
                const n = new Set(kinds)
                if (e.target.checked) n.add(k.value); else n.delete(k.value)
                setKinds(n)
              }} />
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  )
}

// ---------------- EQUIPE & PROFISSIONAIS ----------------
export function TeamEditor() {
  const t = useTenant()
  const staff = useCollection(t.tenantId, 'staff')
  const pros = useCollection(t.tenantId, 'professionals')
  const editable = t.can('equipe', 'update')
  const [staffModal, setStaffModal] = useState<StaffUser | null | 'new'>(null)
  const [proModal, setProModal] = useState<Professional | null | 'new'>(null)

  const staffCols: Column<StaffUser>[] = [
    { id: 'name', header: 'Usuário', cell: (u) => <div><strong>{u.name}</strong><div className="tiny muted">{u.email}</div></div>, value: (u) => u.name },
    { id: 'roles', header: 'Papéis', cell: (u) => u.memberships.map((m, i) => <Badge key={i} tone="brand">{TENANT_ROLE_LABEL[m.role]}</Badge>) },
    { id: 'pro', header: 'Vínculo profissional', cell: (u) => { const p = pros.find((x) => x.id === u.professionalId || x.userId === u.id); return p ? <span className="small">{p.name}</span> : <span className="tiny muted">—</span> } },
    { id: 'status', header: 'Status', cell: (u) => u.active ? <Badge tone="success">Ativo</Badge> : <Badge tone="neutral">Inativo</Badge> },
  ]

  const proCols: Column<Professional>[] = [
    { id: 'name', header: 'Profissional', cell: (p) => <div className="row nowrap"><span className="swatch" style={{ background: p.color, width: 14, height: 14 }} /><strong>{p.name}</strong><span className="tiny muted">({p.council})</span></div>, value: (p) => p.name },
    { id: 'spec', header: 'Especialidade', cell: (p) => p.specialty, value: (p) => p.specialty },
    { id: 'units', header: 'Unidades', cell: (p) => p.unitIds.map((uid) => t.units.find((u) => u.id === uid)?.name ?? uid).join(', ') },
    { id: 'status', header: 'Status', cell: (p) => p.active ? <Badge tone="success">Ativo</Badge> : <Badge tone="neutral">Inativo</Badge> },
  ]

  return (
    <div className="stack" style={{ gap: 24 }}>
      <Section title="Usuários da clínica (acesso ao sistema)" actions={editable && <Button variant="primary" onClick={() => { assertWithinLimit(t.org, 'users'); setStaffModal('new') }}>Novo usuário</Button>}>
        <DataTable rows={staff} columns={staffCols} rowKey={(u) => u.id} caption="Usuários da equipe da clínica" exportName="equipe_usuarios"
          rowActions={editable ? (u) => <Button size="sm" onClick={() => setStaffModal(u)}>Editar</Button> : undefined} />
      </Section>

      <Section title="Profissionais de saúde (atendimento na agenda)" actions={editable && <Button variant="primary" onClick={() => { assertWithinLimit(t.org, 'professionals'); setProModal('new') }}>Novo profissional</Button>}>
        <DataTable rows={pros} columns={proCols} rowKey={(p) => p.id} caption="Profissionais clínicos cadastrados" exportName="profissionais"
          rowActions={editable ? (p) => <Button size="sm" onClick={() => setProModal(p)}>Editar jornada</Button> : undefined} />
      </Section>

      {staffModal && <StaffDialog target={staffModal} onClose={() => setStaffModal(null)} />}
      {proModal && <ProfessionalDialog target={proModal} onClose={() => setProModal(null)} />}
    </div>
  )
}

function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card flush">
      <div className="panel-head"><strong>{title}</strong>{actions}</div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

function StaffDialog({ target, onClose }: { target: StaffUser | 'new'; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const isNew = target === 'new'
  const pros = useCollection(t.tenantId, 'professionals')
  const [name, setName] = useState(target === 'new' ? '' : target.name)
  const [email, setEmail] = useState(target === 'new' ? '' : target.email)
  const [role, setRole] = useState<TenantRole>(target === 'new' ? 'reception' : target.memberships[0]?.role ?? 'reception')
  const [allUnits, setAllUnits] = useState(target === 'new' ? true : target.memberships[0]?.unitIds === 'all')
  const [selUnits, setSelUnits] = useState<Set<ID>>(new Set(target !== 'new' && Array.isArray(target.memberships[0]?.unitIds) ? target.memberships[0]!.unitIds : []))
  const [proId, setProId] = useState<ID>(target === 'new' ? '' : target.professionalId ?? '')
  const [active, setActive] = useState(target === 'new' ? true : target.active)

  const save = () => run(() => {
    if (name.trim().length < 2) throw new Error('Informe o nome.')
    const errMail = validateDemoEmail(email)
    if (errMail) throw new Error(errMail)
    const unitIds: ID[] | 'all' = allUnits ? 'all' : Array.from(selUnits)
    if (unitIds !== 'all' && !unitIds.length) throw new Error('Selecione ao menos uma unidade para o usuário.')
    const memberships = [{ role, unitIds }]
    const payload = { name: name.trim(), email: email.trim().toLowerCase(), memberships, professionalId: proId || undefined, active, mfa: false }
    if (isNew) {
      assertWithinLimit(t.org, 'users')
      const id = uid('usr_')
      db.insert(t.tenantId, 'staff', { id, tenantId: t.tenantId, createdAt: nowISO(), ...payload })
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'usuario.criado', resource: 'staff', resourceId: id, detail: `${payload.name} (${role})` })
    } else {
      db.update(t.tenantId, 'staff', target.id, payload)
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'usuario.atualizado', resource: 'staff', resourceId: target.id, detail: payload.name })
    }
    onClose()
  }, isNew ? 'Usuário criado.' : 'Usuário atualizado.')

  return (
    <Dialog open onClose={onClose} size="lg" title={isNew ? 'Novo usuário da clínica' : `Editar ${target.name}`} footer={<>
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="primary" onClick={save}>Salvar usuário</Button>
    </>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Nome completo" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="E-mail (demo .exemplo.test)" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Papel principal"><Select value={role} onChange={(e) => setRole(e.target.value as TenantRole)}>{(Object.keys(TENANT_ROLE_LABEL) as TenantRole[]).map((r) => <option key={r} value={r}>{TENANT_ROLE_LABEL[r]}</option>)}</Select></Field>
          <Field label="Vínculo profissional (se atender)"><Select value={proId} onChange={(e) => setProId(e.target.value)}><option value="">Nenhum (não atende na agenda)</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        </div>
        <fieldset>
          <legend>Unidades com acesso</legend>
          <Checkbox label="Todas as unidades da organização" checked={allUnits} onChange={(e) => setAllUnits(e.target.checked)} />
          {!allUnits && (
            <div className="grid grid-2" style={{ marginTop: 8 }}>
              {t.units.map((u) => (
                <Checkbox key={u.id} label={u.name} checked={selUnits.has(u.id)} onChange={(e) => {
                  const n = new Set(selUnits)
                  if (e.target.checked) n.add(u.id); else n.delete(u.id)
                  setSelUnits(n)
                }} />
              ))}
            </div>
          )}
        </fieldset>
        {!isNew && <Checkbox label="Usuário ativo" checked={active} onChange={(e) => setActive(e.target.checked)} />}
      </div>
    </Dialog>
  )
}

function ProfessionalDialog({ target, onClose }: { target: Professional | 'new'; onClose: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const isNew = target === 'new'
  const [name, setName] = useState(target === 'new' ? '' : target.name)
  const [council, setCouncil] = useState(target === 'new' ? '' : target.council)
  const [spec, setSpec] = useState(target === 'new' ? '' : target.specialty)
  const [color, setColor] = useState(target === 'new' ? '#2563EB' : target.color)
  const [unitIds, setUnitIds] = useState<Set<ID>>(new Set(target === 'new' ? t.units.map((u) => u.id) : target.unitIds))
  const [sch, setSch] = useState<Professional['schedule']>(target === 'new' ? [] : target.schedule)

  const save = () => run(() => {
    if (name.trim().length < 2) throw new Error('Informe o nome do profissional.')
    if (!unitIds.size) throw new Error('Selecione ao menos uma unidade.')
    const payload = {
      name: name.trim(), council: council.trim() || 'Sem registro', specialty: spec.trim() || 'Geral', color, unitIds: Array.from(unitIds), schedule: sch, absences: target === 'new' ? [] : target.absences, active: true,
    }
    if (isNew) {
      assertWithinLimit(t.org, 'professionals')
      const id = uid('pro_')
      db.insert(t.tenantId, 'professionals', { id, tenantId: t.tenantId, createdAt: nowISO(), ...payload })
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'profissional.criado', resource: 'professionals', resourceId: id, detail: payload.name })
    } else {
      db.update(t.tenantId, 'professionals', target.id, payload)
      audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'profissional.atualizado', resource: 'professionals', resourceId: target.id, detail: payload.name })
    }
    onClose()
  }, isNew ? 'Profissional criado.' : 'Profissional atualizado.')

  const addScheduleDay = (uid: ID, wd: number) => {
    setSch([...sch, { unitId: uid, weekday: wd, start: 480, end: 1080 }])
  }
  const removeSch = (idx: number) => setSch(sch.filter((_, i) => i !== idx))

  return (
    <Dialog open onClose={onClose} size="lg" title={isNew ? 'Novo profissional' : `Editar ${target.name}`} footer={<>
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="primary" onClick={save}>Salvar profissional</Button>
    </>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Nome do profissional" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Conselho / Registro (fictício)" required><Input value={council} onChange={(e) => setCouncil(e.target.value)} placeholder="CRO-SP 00000 (fictício)" /></Field>
          <Field label="Especialidade" required><Input value={spec} onChange={(e) => setSpec(e.target.value)} /></Field>
          <Field label="Cor na agenda"><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 60, padding: 2 }} /></Field>
        </div>
        <fieldset>
          <legend>Unidades de atuação</legend>
          <div className="grid grid-2">
            {t.units.map((u) => (
              <Checkbox key={u.id} label={u.name} checked={unitIds.has(u.id)} onChange={(e) => {
                const n = new Set(unitIds)
                if (e.target.checked) n.add(u.id); else n.delete(u.id)
                setUnitIds(n)
              }} />
            ))}
          </div>
        </fieldset>
        <fieldset className="stack">
          <legend>Jornada semanal de atendimento</legend>
          <div className="row" style={{ gap: 8 }}>
            {Array.from(unitIds).map((uid) => {
              const u = t.units.find((x) => x.id === uid)
              return WEEKDAYS.slice(1, 6).map((dayName, wdIdx) => {
                const wd = wdIdx + 1
                const exists = sch.some((s) => s.unitId === uid && s.weekday === wd)
                if (exists) return null
                return <Button key={`${uid}_${wd}`} size="sm" onClick={() => addScheduleDay(uid, wd)}>+ {u?.name?.slice(0, 10)} {dayName.slice(0, 3)}</Button>
              })
            })}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            {sch.map((s, idx) => (
              <div key={idx} className="row between panel" style={{ padding: '6px 12px' }}>
                <span><strong>{t.units.find((u) => u.id === s.unitId)?.name}</strong> · {WEEKDAYS[s.weekday]}</span>
                <div className="row">
                  <Input type="time" value={minutesToHHMM(s.start)} onChange={(e) => {
                    const next = [...sch]
                    next[idx] = { ...s, start: hhmmToMinutes(e.target.value) }
                    setSch(next)
                  }} />
                  <span>até</span>
                  <Input type="time" value={minutesToHHMM(s.end)} onChange={(e) => {
                    const next = [...sch]
                    next[idx] = { ...s, end: hhmmToMinutes(e.target.value) }
                    setSch(next)
                  }} />
                  <Button size="sm" variant="danger" onClick={() => removeSch(idx)}>Remover</Button>
                </div>
              </div>
            ))}
            {!sch.length && <p className="small muted">Nenhuma jornada cadastrada. O profissional não terá horários livres na agenda.</p>}
          </div>
        </fieldset>
      </div>
    </Dialog>
  )
}
