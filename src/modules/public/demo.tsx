// /demonstracao — seletor de clínica fictícia → perfil → dispositivo sugerido. Sem login seguro (só seletor).
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowRight, Monitor, Tablet, Smartphone, QrCode, Tv, Globe, RotateCcw, CalendarClock, ShieldAlert } from 'lucide-react'
import { platformDb, resetDemo, useCollection, usePlatformCollection } from '@/data/store'
import { clearSeedCaches } from '@/data/platformSeed'
import { setSession } from '@/app/session'
import { createTrialOrganization, slugify, validateSlug } from '@/domain/tenancy'
import { PLATFORM_ROLE_LABEL, TENANT_ROLE_LABEL } from '@/domain/permissions'
import { SEGMENT_LABEL, type Organization, type Segment, type StaffUser, type TenantRole } from '@/domain/types'
import { demoBaseDate } from '@/lib/dates'
import { Alert, Badge, Button, Field, Input, Segmented, Select } from '@/ui/core'
import { useAction, useConfirm } from '@/ui/overlay'
import { ClinicLogo } from '@/ui/brand'
import { SiteLayout } from './site'
import { fromLocalInputValue, safeDestino, toLocalInputValue } from './lib'

type Device = 'desktop' | 'tablet' | 'celular'
const DEVICE: Record<Device, { label: string; icon: typeof Monitor }> = {
  desktop: { label: 'Computador', icon: Monitor }, tablet: { label: 'Tablet', icon: Tablet }, celular: { label: 'Celular', icon: Smartphone },
}
const ROLE_DEVICE: Record<TenantRole | 'portal' | 'platform', { d: Device[]; why: string }> = {
  clinic_owner: { d: ['desktop', 'celular'], why: 'Gestão e relatórios no computador; acompanhamento rápido pelo celular.' },
  network_manager: { d: ['desktop'], why: 'Visão de várias unidades, comparativos e relatórios.' },
  unit_manager: { d: ['desktop', 'tablet'], why: 'Agenda e operação da unidade.' },
  reception: { d: ['desktop', 'tablet'], why: 'Balcão com agenda, fila e recebimentos.' },
  professional: { d: ['tablet', 'desktop'], why: 'Prontuário e odontograma no consultório.' },
  assistant: { d: ['tablet'], why: 'Apoio ao atendimento, materiais e estoque.' },
  finance: { d: ['desktop'], why: 'Conciliação, caixa e relatórios.' },
  inventory: { d: ['tablet', 'desktop'], why: 'Conferência de lotes e movimentações no almoxarifado.' },
  portal: { d: ['celular'], why: 'Pacientes e tutores usam principalmente o celular (app instalável).' },
  platform: { d: ['desktop'], why: 'Administração da plataforma.' },
}
const ROLE_ORDER: TenantRole[] = ['clinic_owner', 'network_manager', 'unit_manager', 'reception', 'professional', 'finance', 'inventory', 'assistant']
const mainRole = (u: StaffUser) => u.memberships[0]?.role ?? 'assistant'
const REL_LABEL: Record<string, string> = { self: 'Paciente', tutor: 'Tutor(a)', responsavel_legal: 'Responsável legal', responsavel_financeiro: 'Responsável financeiro' }

type Profile = { kind: 'staff'; user: StaffUser } | { kind: 'portal'; personId: string; name: string; rel: string }

export function DemoPickerPage() {
  const [params] = useSearchParams()
  const orgs = usePlatformCollection('organizations')
  const demoOrgs = orgs.filter((o) => o.demo)
  const sandbox = orgs.filter((o) => o.sandbox)
  const qClinic = params.get('clinica')
  const qPerfil = params.get('perfil')
  const destino = safeDestino(params.get('destino'))
  const initialOrg = orgs.find((o) => o.slug === qClinic && (o.demo || o.sandbox))
  const [mode, setMode] = useState<'clinica' | 'plataforma'>(qPerfil === 'plataforma' ? 'plataforma' : 'clinica')
  const [slug, setSlug] = useState<string>(initialOrg?.slug ?? demoOrgs[0]?.slug ?? '')
  const org = orgs.find((o) => o.slug === slug)

  return (
    <SiteLayout title="Demonstração">
      <div className="container pub-demo stack" style={{ '--gap': '24px' } as React.CSSProperties}>
        <div className="stack" style={{ '--gap': '8px', paddingTop: 32 } as React.CSSProperties}>
          <h1>Escolha como entrar na demonstração</h1>
          <p className="lead muted">Selecione uma clínica fictícia, o perfil de acesso e veja o dispositivo sugerido para esse uso.</p>
        </div>
        <Alert tone="warning" title="Acesso por seletor, sem login seguro">
          Qualquer pessoa pode escolher qualquer perfil aqui. Os dados são fictícios e ficam só neste navegador. Em produção, o acesso usará autenticação real com sessão por clínica.
        </Alert>
        {qClinic && !initialOrg && <Alert tone="danger" title="Clínica não encontrada">O endereço indicou “{qClinic}”, que não é uma clínica de demonstração. Escolha uma das opções abaixo.</Alert>}
        {destino && <Alert tone="info">Depois de escolher o perfil você irá direto para a tela <strong>{destino}</strong>.</Alert>}

        <Segmented label="Tipo de acesso" value={mode} onChange={setMode} options={[{ value: 'clinica', label: 'Clínicas fictícias' }, { value: 'plataforma', label: 'Equipe Qlinic (Super Admin)' }]} />

        {mode === 'clinica' ? (
          <>
            <fieldset className="pub-fs">
              <legend><span className="pub-step">1</span> Clínica</legend>
              <div className="pub-org-grid" role="radiogroup" aria-label="Clínica fictícia">
                {[...demoOrgs, ...sandbox].map((o) => (
                  <label key={o.id} className="pub-pick">
                    <input type="radio" name="org" value={o.slug} checked={slug === o.slug} onChange={() => setSlug(o.slug)} />
                    <span className="pub-pick-body">
                      <ClinicLogo org={o} height={28} decorative />
                      <span className="small muted">{SEGMENT_LABEL[o.segment]}{o.city ? ` · ${o.city}` : ''}{o.sandbox ? ' · criada por você' : ''}</span>
                    </span>
                    <span className="sr-only">{o.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {org && <ProfileStep key={org.id} org={org} preferPortal={qPerfil === 'portal' && org.slug === qClinic} destino={destino} />}
            {org && <DirectLinks org={org} />}
            <CreateClinic />
          </>
        ) : <PlatformStep destino={destino} />}

        <DemoDataTools />
      </div>
    </SiteLayout>
  )
}

function ProfileStep({ org, preferPortal, destino }: { org: Organization; preferPortal: boolean; destino: string | null }) {
  const nav = useNavigate()
  const staff = useCollection(org.id, 'staff')
  const persons = useCollection(org.id, 'persons')
  const links = useCollection(org.id, 'links')
  const units = useCollection(org.id, 'units')
  const staffSorted = useMemo(() => staff.filter((u) => u.active).sort((a, b) => ROLE_ORDER.indexOf(mainRole(a)) - ROLE_ORDER.indexOf(mainRole(b))), [staff])
  // Um perfil de portal por combinação de vínculos (paciente, tutor, responsável…), pessoa 1 primeiro.
  const portalPeople = useMemo(() => {
    const byRel = new Map<string, { kind: 'portal'; personId: string; name: string; rel: string }>()
    for (const p of persons) {
      const rels = Array.from(new Set(links.filter((x) => x.personId === p.id).map((x) => REL_LABEL[x.relation] ?? x.relation)))
      if (!rels.length) continue
      const rel = rels.join(' e ')
      if (!byRel.has(rel)) byRel.set(rel, { kind: 'portal', personId: p.id, name: p.name, rel })
    }
    return [...byRel.values()].slice(0, 4)
  }, [links, persons])
  const profiles: Profile[] = [...staffSorted.map((user) => ({ kind: 'staff' as const, user })), ...portalPeople]
  const keyOf = (p: Profile) => (p.kind === 'staff' ? p.user.id : p.personId)
  const [sel, setSel] = useState<string>(() => (preferPortal ? portalPeople[0]?.personId : undefined) ?? staffSorted[0]?.id ?? '')
  const chosen = profiles.find((p) => keyOf(p) === sel) ?? profiles[0]
  if (!profiles.length) return <Alert tone="neutral" title="Sem perfis">Esta clínica ainda não tem usuários. Use “Criar clínica fictícia” para começar uma nova.</Alert>
  const unitName = (u: StaffUser) => {
    const m = u.memberships[0]
    if (!m || m.unitIds === 'all') return units.length > 1 ? 'Todas as unidades' : null
    return m.unitIds.map((id) => units.find((x) => x.id === id)?.name).filter(Boolean).join(', ')
  }
  const enter = () => {
    if (!chosen) return
    if (chosen.kind === 'staff') {
      setSession({ kind: 'staff', tenantId: org.id, userId: chosen.user.id, unitId: null })
      nav(`/app/${org.slug}${destino ? `/${destino}` : ''}`)
    } else {
      setSession({ kind: 'portal', tenantId: org.id, personId: chosen.personId })
      nav(`/c/${org.slug}/portal`)
    }
  }
  const dev = chosen ? ROLE_DEVICE[chosen.kind === 'staff' ? mainRole(chosen.user) : 'portal'] : null
  return (
    <>
      <fieldset className="pub-fs">
        <legend><span className="pub-step">2</span> Perfil em {org.name}</legend>
        <div className="pub-prof-grid" role="radiogroup" aria-label="Perfil de acesso">
          {profiles.map((p) => {
            const k = keyOf(p)
            const title = p.kind === 'staff' ? p.user.name : p.name
            const sub = p.kind === 'staff' ? [p.user.memberships.map((m) => TENANT_ROLE_LABEL[m.role]).join(', '), unitName(p.user)].filter(Boolean).join(' · ') : `Portal · ${p.rel}`
            return (
              <label key={k} className="pub-pick">
                <input type="radio" name="perfil" value={k} checked={sel === k} onChange={() => setSel(k)} />
                <span className="pub-pick-body"><span className="strong">{title}</span><span className="small muted">{sub}</span></span>
              </label>
            )
          })}
        </div>
      </fieldset>
      {dev && (
        <section className="pub-fs pub-enter" aria-labelledby="dev-t">
          <h2 id="dev-t" className="pub-legend"><span className="pub-step">3</span> Dispositivo sugerido</h2>
          <div className="row" style={{ '--gap': '12px' } as React.CSSProperties}>
            {dev.d.map((d) => { const D = DEVICE[d]; return <span key={d} className="chip"><D.icon size={16} aria-hidden="true" />{D.label}</span> })}
          </div>
          <p className="small muted">{dev.why} É apenas uma sugestão: todas as telas funcionam de 360 px a desktop.</p>
          <div className="row">
            <Button variant="primary" onClick={enter} icon={<ArrowRight />}>Entrar como {chosen.kind === 'staff' ? chosen.user.name : chosen.name}</Button>
          </div>
        </section>
      )}
    </>
  )
}

function PlatformStep({ destino }: { destino: string | null }) {
  const nav = useNavigate()
  const users = usePlatformCollection('platformUsers').filter((u) => u.active)
  const [sel, setSel] = useState(users[0]?.id ?? '')
  const u = users.find((x) => x.id === sel) ?? users[0]
  return (
    <>
      <fieldset className="pub-fs">
        <legend><span className="pub-step">1</span> Perfil da equipe Qlinic</legend>
        <div className="pub-prof-grid" role="radiogroup" aria-label="Perfil da plataforma">
          {users.map((x) => (
            <label key={x.id} className="pub-pick">
              <input type="radio" name="plat" value={x.id} checked={sel === x.id} onChange={() => setSel(x.id)} />
              <span className="pub-pick-body"><span className="strong">{x.name}</span><span className="small muted">{PLATFORM_ROLE_LABEL[x.role]}{x.role === 'platform_support' ? ' · sem acesso a prontuários' : ''}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      {u && (
        <section className="pub-fs pub-enter" aria-labelledby="pdev-t">
          <h2 id="pdev-t" className="pub-legend"><span className="pub-step">2</span> Dispositivo sugerido</h2>
          <div className="row"><span className="chip"><Monitor size={16} aria-hidden="true" />Computador</span></div>
          <p className="small muted">{ROLE_DEVICE.platform.why}</p>
          <div className="row"><Button variant="primary" icon={<ArrowRight />} onClick={() => { setSession({ kind: 'platform', role: u.role, userId: u.id }); nav(`/master${destino ? `/${destino}` : ''}`) }}>Entrar no Super Admin</Button></div>
        </section>
      )}
    </>
  )
}

function DirectLinks({ org }: { org: Organization }) {
  if (!org.publicPage.enabled) return null
  const items = [
    { to: `/c/${org.slug}`, icon: Globe, label: 'Página pública', sub: 'Apresentação e agendamento online' },
    { to: `/c/${org.slug}/totem`, icon: QrCode, label: 'Totem de check-in', sub: 'Tablet na recepção; reinicia a cada pessoa' },
    { to: `/c/${org.slug}/painel`, icon: Tv, label: 'Painel de chamada', sub: 'TV da sala de espera; nome abreviado' },
  ]
  return (
    <section className="stack" style={{ '--gap': '12px' } as React.CSSProperties} aria-labelledby="dl-t">
      <h2 id="dl-t" style={{ fontSize: 18 }}>Telas sem perfil de {org.name}</h2>
      <ul className="grid grid-3" role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((i) => (
          <li key={i.to}><Link to={i.to} className="pub-seg pub-seg-row"><i.icon aria-hidden="true" /><span className="stack" style={{ '--gap': '2px' } as React.CSSProperties}><span className="strong">{i.label}</span><span className="small muted">{i.sub}</span></span></Link></li>
        ))}
      </ul>
    </section>
  )
}

const COLORS = ['#0D9488', '#2563EB', '#7C3AED', '#BE185D', '#EA580C', '#4D7C0F', '#0E7490']
function CreateClinic() {
  const nav = useNavigate()
  const run = useAction()
  const [name, setName] = useState('')
  const [segment, setSegment] = useState<Segment>('odontologia')
  const [color, setColor] = useState(COLORS[0])
  const [err, setErr] = useState<string | null>(null)
  const slug = slugify(name)
  const slugErr = name.trim().length >= 3 ? validateSlug(slug) : null
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 3) { setErr('Informe o nome da clínica (mínimo 3 letras).'); return }
    if (slugErr) { setErr(slugErr); return }
    setErr(null)
    run(() => {
      const { org, owner } = createTrialOrganization({ name, segment, primary: color })
      setSession({ kind: 'staff', tenantId: org.id, userId: owner.id, unitId: null })
      nav(`/app/${org.slug}/onboarding`)
    }, 'Clínica fictícia criada. Vamos à configuração inicial.')
  }
  return (
    <section className="card stack" aria-labelledby="cc-t">
      <div className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
        <h2 id="cc-t" style={{ fontSize: 18 }}>Criar clínica fictícia</h2>
        <p className="small muted">Cria uma organização vazia em período de teste, neste navegador, e entra como proprietário na configuração inicial.</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="Nome da clínica" required error={err} hint={name.trim().length >= 3 && !slugErr ? `Endereço: /app/${slug}` : undefined}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" />
          </Field>
          <Field label="Segmento" required>
            <Select value={segment} onChange={(e) => setSegment(e.target.value as Segment)}>
              {(Object.keys(SEGMENT_LABEL) as Segment[]).map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend>Cor da marca</legend>
          <div className="row" role="radiogroup" aria-label="Cor da marca">
            {COLORS.map((c) => (
              <label key={c} className="pub-color" title={c}>
                <input type="radio" name="cor" value={c} checked={color === c} onChange={() => setColor(c)} />
                <span className="swatch" style={{ background: c }} aria-hidden="true" /><span className="sr-only">{c}</span>
              </label>
            ))}
            <label className="pub-color">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} aria-label="Outra cor" />
            </label>
            <span className="mono">{color}</span>
          </div>
          <p className="small muted">Os tons de botão e texto são ajustados automaticamente para manter o contraste.</p>
        </fieldset>
        <div className="form-actions"><Button type="submit" variant="primary">Criar e configurar</Button></div>
      </form>
    </section>
  )
}

const BASE_KEY = 'qlinic.demoBase'
function DemoDataTools() {
  const confirm = useConfirm()
  const hasOverride = (() => { try { return !!localStorage.getItem(BASE_KEY) } catch { return false } })()
  const [value, setValue] = useState(() => toLocalInputValue(demoBaseDate()))
  const [err, setErr] = useState<string | null>(null)
  const restart = () => { clearSeedCaches(); location.assign('/demonstracao') }
  const applyBase = async (auto: boolean) => {
    const d = auto ? null : fromLocalInputValue(value)
    if (!auto && !d) { setErr('Informe data e hora válidas.'); return }
    setErr(null)
    const r = await confirm({ title: 'Mudar a data-base e restaurar dados?', body: 'Os dados fictícios são gerados a partir da data-base. Para mudar, todas as alterações feitas na demonstração, em todas as clínicas, serão apagadas deste navegador.', confirmLabel: 'Mudar e restaurar', danger: true })
    if (!r.ok) return
    resetDemo()
    try { if (d) localStorage.setItem(BASE_KEY, d.toISOString()) } catch { /* sem storage */ }
    setSession(null)
    restart()
  }
  const onReset = async () => {
    const r = await confirm({ title: 'Restaurar dados de demonstração?', body: 'Todas as alterações feitas nesta demonstração, em todas as clínicas fictícias e no Super Admin, serão apagadas deste navegador. Esta ação não pode ser desfeita.', confirmLabel: 'Restaurar dados', danger: true })
    if (!r.ok) return
    const keep = (() => { try { return localStorage.getItem(BASE_KEY) } catch { return null } })()
    resetDemo()
    try { if (keep) localStorage.setItem(BASE_KEY, keep) } catch { /* */ }
    setSession(null)
    restart()
  }
  const contacts = platformDb.list('contactRequests').length
  return (
    <section className="card stack" aria-labelledby="dd-t">
      <h2 id="dd-t" style={{ fontSize: 18 }}>Dados da demonstração</h2>
      <div className="grid grid-2">
        <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <div className="row"><CalendarClock size={18} aria-hidden="true" /><h3>Data-base</h3>{hasOverride ? <Badge tone="info">Personalizada</Badge> : <Badge>Automática (agora)</Badge>}</div>
          <p className="small muted">Agenda, vencimentos e históricos são gerados relativos a esta data. Assim a demonstração não envelhece.</p>
          <Field label="Data e hora de referência" error={err} hint="Mudar a data-base restaura todos os dados fictícios.">
            <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <div className="row">
            <Button onClick={() => applyBase(false)}>Aplicar data-base</Button>
            <Button variant="ghost" onClick={() => { setValue(toLocalInputValue(new Date())); void applyBase(true) }}>Usar agora</Button>
          </div>
        </div>
        <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <div className="row"><RotateCcw size={18} aria-hidden="true" /><h3>Restaurar dados</h3></div>
          <p className="small muted">Apaga agendamentos, pagamentos, clínicas criadas e demais alterações feitas neste navegador e volta ao estado inicial.{contacts ? ` Inclui ${contacts} contato(s) registrado(s).` : ''}</p>
          <div className="row"><Button variant="danger" onClick={onReset}>Restaurar dados</Button></div>
          <p className="small muted row nowrap" style={{ alignItems: 'flex-start' }}><ShieldAlert size={16} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />Os dados ficam em armazenamento local do navegador. Isso organiza a demonstração, mas não é segurança.</p>
        </div>
      </div>
    </section>
  )
}
