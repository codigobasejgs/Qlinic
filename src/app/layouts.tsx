// Layouts: banner de demonstração, shell da equipe (sidebar/topbar/bottom-nav), shell do Super Admin.
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Menu, Search, PanelLeftClose, PanelLeftOpen, LogOut, Eye, X, MoreHorizontal, Building2, Bell, HelpCircle } from 'lucide-react'
import { STAFF_NAV, MASTER_NAV } from './nav'
import { useTenant, setSession, useSession, getSession } from './session'
import { resetDemo, useCollection, usePlatformCollection } from '@/data/store'
import { clearSeedCaches } from '@/data/platformSeed'
import { Button, Badge, Skeleton } from '@/ui/core'
import { CommandPalette, Dialog, useConfirm, type Command } from '@/ui/overlay'
import { ClinicLogo, QlinicLogo, ThemeToggle, useTenantBrand, useDocumentBrand } from '@/ui/brand'
import { TENANT_ROLE_LABEL, PLATFORM_ROLE_LABEL, canPlatform } from '@/domain/permissions'
import { InstallAppButton, UpdateBanner, NetworkStatus } from '@/pwa/client'
import { TourRunner } from '@/modules/help/tour'
import { cx } from '@/lib/util'
import { hasPublishedPwa } from '@/domain/tenancy'

export function PageFallback() {
  return <div className="content" aria-busy="true" aria-label="Carregando"><Skeleton h={28} w="40%" /><div style={{ height: 16 }} /><Skeleton h={120} count={2} /></div>
}

export function DemoBanner() {
  const confirm = useConfirm()
  const onReset = async () => {
    const r = await confirm({ title: 'Restaurar dados de demonstração?', body: 'Todas as alterações feitas nesta demonstração, em todas as clínicas fictícias, serão apagadas deste navegador. Esta ação não pode ser desfeita.', confirmLabel: 'Restaurar dados', danger: true })
    if (r.ok) { resetDemo(); clearSeedCaches(); setSession(null); location.assign('/demonstracao') }
  }
  return (
    <div className="demo-banner" role="region" aria-label="Aviso de demonstração">
      <span>Ambiente de demonstração · dados fictícios · sem envio, cobrança ou autenticação reais</span>
      <button type="button" onClick={onReset}>Restaurar dados</button>
      <Link to="/demonstracao">Trocar perfil</Link>
    </div>
  )
}

function useNavForTenant() {
  const t = useTenant()
  return STAFF_NAV.filter((n) => (!n.module || t.moduleOn(n.module)) && (!n.resource || t.can(n.resource, 'read', { unitId: undefined }) || t.scope(n.resource) !== false))
}

export function StaffLayout() {
  const t = useTenant()
  const nav = useNavForTenant()
  const loc = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('qlinic.sidebar') === '1' } catch { return false } })
  const [open, setOpen] = useState(false)
  const [cmd, setCmd] = useState(false)
  const [more, setMore] = useState(false)
  const [viewAsOpen, setViewAsOpen] = useState(false)
  const patients = useCollection(t.tenantId, 'patients')
  const staff = useCollection(t.tenantId, 'staff')
  useTenantBrand(t.org)
  const pwa = hasPublishedPwa(t.org.slug)
  useDocumentBrand({ title: `${t.org.name} · Equipe`, themeColor: t.org.brand.primary, manifestHref: pwa ? `/t/${t.org.slug}/equipe.webmanifest` : null, iconHref: pwa ? `/t/${t.org.slug}/icon.svg` : '/brand/pwa/favicon.svg', appleIcon: pwa ? `/t/${t.org.slug}/apple-touch-icon.png` : '/brand/pwa/apple-touch-icon.png' })

  useEffect(() => { setOpen(false) }, [loc.pathname])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd(true) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const commands = useMemo<Command[]>(() => [
    ...nav.map((n) => ({ id: `nav-${n.path}`, label: n.label, group: 'Ir para', to: `${t.base}/${n.path}` })),
    ...(t.can('pacientes') ? patients.filter((p) => !p.duplicateOf).slice(0, 200).map((p) => ({ id: `p-${p.id}`, label: p.name, group: 'Paciente', to: `${t.base}/pacientes/${p.id}`, keywords: `${p.cpf ?? ''} ${p.species ?? ''}` })) : []),
    { id: 'new-appt', label: 'Novo agendamento', group: 'Ação', to: `${t.base}/agenda?novo=1` },
    { id: 'new-patient', label: 'Cadastrar paciente', group: 'Ação', to: `${t.base}/pacientes?novo=1` },
  ], [nav, patients, t])

  if (!t.user) {
    return (
      <div className="content stack" style={{ maxWidth: 560 }}>
        <h1>Acesso não autorizado</h1>
        <p className="muted">Você não tem um vínculo ativo com {t.org.name} nesta demonstração. O endereço da clínica é apenas contexto e não concede acesso.</p>
        <Link className="btn btn-primary" to="/demonstracao">Escolher perfil de demonstração</Link>
      </div>
    )
  }

  const groups = Array.from(new Set(nav.map((n) => n.group)))
  const mobileNav = nav.filter((n) => n.mobile).sort((a, b) => a.mobile! - b.mobile!)
  const roles = t.effectiveUser?.memberships.map((m) => TENANT_ROLE_LABEL[m.role]).join(', ')
  const isActive = (p: string) => (p === '' ? loc.pathname === t.base || loc.pathname === `${t.base}/` : loc.pathname.startsWith(`${t.base}/${p}`))
  const sidebarNav = (
    <nav aria-label="Menu principal">
      {groups.map((g) => (
        <div key={g}>
          <div className="sb-group">{g}</div>
          {nav.filter((n) => n.group === g).map((n) => (
            <NavLink key={n.path} to={`${t.base}/${n.path}`} end={n.path === ''} className="sb-link" aria-current={isActive(n.path) ? 'page' : undefined} title={collapsed ? n.label : undefined} data-tour={n.tour}>
              <n.icon aria-hidden="true" /><span>{n.label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
  const exit = () => { setSession(null); navigate('/demonstracao') }

  return (
    <>
      <a href="#main" className="skip-link">Pular para o conteúdo</a>
      <DemoBanner />
      <UpdateBanner />
      {t.viewingAs && (
        <div className="alert warning" style={{ borderRadius: 0 }} role="status">
          <Eye aria-hidden="true" />
          <div className="alert-body"><strong>Visualizando como: {t.effectiveUser?.name}</strong><span className="small">Simulação de perfil para conferir permissões. Ações usam as permissões deste perfil.</span></div>
          <Button size="sm" onClick={() => { const s = getSession(); if (s?.kind === 'staff') setSession({ ...s, viewAs: undefined }) }}>Sair da simulação</Button>
        </div>
      )}
      <div className="shell">
        <aside className={cx('sidebar', collapsed && 'collapsed', open && 'open')} aria-label="Navegação da clínica">
          <div className="sb-head">
            <Link to={t.base} style={{ color: 'inherit', textDecoration: 'none', minWidth: 0 }} className="row nowrap">
              <ClinicLogo org={t.org} height={30} symbol={collapsed} />
            </Link>
            {open && <button className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto', color: 'inherit', flex: 'none' }} onClick={() => setOpen(false)} aria-label="Fechar menu"><X /></button>}
          </div>
          {sidebarNav}
          <div className="sb-foot stack" style={{ '--gap': '4px' } as React.CSSProperties}>
            <button type="button" className="btn btn-ghost hide-mobile" style={{ color: 'inherit', justifyContent: collapsed ? 'center' : 'flex-start' }} onClick={() => { setCollapsed(!collapsed); try { localStorage.setItem('qlinic.sidebar', collapsed ? '0' : '1') } catch { /* */ } }} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}{!collapsed && <span>Recolher</span>}
            </button>
            {!collapsed && <div className="tiny" style={{ color: 'var(--q-sidebar-muted)', padding: '4px 12px' }}>Plataforma <QlinicLogo height={14} onDark decorative style={{ display: 'inline', verticalAlign: 'middle' }} /> <span className="sr-only">Qlinic</span></div>}
          </div>
        </aside>
        {open && <div className="overlay" style={{ zIndex: 49 }} onClick={() => setOpen(false)} aria-hidden="true" />}
        <div className="main-col">
          <header className="topbar">
            <Button variant="ghost" iconOnly icon={<Menu />} className="only-mobile-tablet" onClick={() => setOpen(true)} aria-expanded={open}>Abrir menu</Button>
            <style>{`@media (min-width:1024px){.only-mobile-tablet{display:none!important}}`}</style>
            <UnitSelector />
            <div className="grow" />
            <Button variant="ghost" icon={<Search />} onClick={() => setCmd(true)} className="hide-mobile" aria-keyshortcuts="Control+K">Buscar <span className="kbd">Ctrl K</span></Button>
            <Button variant="ghost" iconOnly icon={<Search />} onClick={() => setCmd(true)} className="only-mobile">Buscar</Button>
            <NetworkStatus />
            <InstallAppButton kind="equipe" org={t.org} compact />
            <NotificationsBell />
            <span className="hide-mobile"><ThemeToggle compact /></span>
            <Link to={`${t.base}/ajuda`} className="btn btn-ghost btn-icon hide-mobile" aria-label="Ajuda"><HelpCircle size={18} /></Link>
            <UserMenu name={t.user.name} roles={roles ?? ''} onExit={exit} onViewAs={() => setViewAsOpen(true)} canViewAs={t.can('equipe', 'update')} />
          </header>
          <main id="main" className="content" tabIndex={-1}>
            <Suspense fallback={<Skeleton h={120} count={3} />}><Outlet /></Suspense>
          </main>
        </div>
      </div>
      <nav className="bottom-nav" aria-label="Navegação rápida">
        {mobileNav.map((n) => <NavLink key={n.path} to={`${t.base}/${n.path}`} end={n.path === ''} aria-current={isActive(n.path) ? 'page' : undefined}><n.icon aria-hidden="true" />{n.label}</NavLink>)}
        <button type="button" onClick={() => setMore(true)}><MoreHorizontal aria-hidden="true" />Mais</button>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title="Todas as áreas" drawer>
        <div className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
          {groups.map((g) => (
            <div key={g} className="stack" style={{ '--gap': '2px' } as React.CSSProperties}>
              <div className="tiny muted strong" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 8 }}>{g}</div>
              {nav.filter((n) => n.group === g).map((n) => <Link key={n.path} to={`${t.base}/${n.path}`} className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setMore(false)}><n.icon size={18} aria-hidden="true" />{n.label}</Link>)}
            </div>
          ))}
        </div>
      </Dialog>
      <CommandPalette open={cmd} onClose={() => setCmd(false)} commands={commands} />
      <Dialog open={viewAsOpen} onClose={() => setViewAsOpen(false)} title="Visualizar como perfil" description="Simula a interface com as permissões de outro usuário desta clínica. Demonstração de UI — não é controle de acesso real.">
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, '--gap': '6px' } as React.CSSProperties}>
          {staff.filter((u) => u.active).map((u) => (
            <li key={u.id}>
              <button type="button" className="btn btn-secondary btn-block" style={{ justifyContent: 'space-between' }} onClick={() => { const s = getSession(); if (s?.kind === 'staff') setSession({ ...s, viewAs: { userId: u.id } }); setViewAsOpen(false) }}>
                <span>{u.name}</span><span className="small muted">{u.memberships.map((m) => TENANT_ROLE_LABEL[m.role]).join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
      <TourRunner />
    </>
  )
}

function UnitSelector() {
  const t = useTenant()
  if (t.allowedUnits.length <= 1) return <span className="tb-title truncate hide-mobile">{t.unit?.name ?? t.allowedUnits[0]?.name}</span>
  return (
    <div className="row nowrap" style={{ '--gap': '6px', minWidth: 0, flex: '0 1 auto' } as React.CSSProperties}>
      <Building2 size={18} aria-hidden="true" className="muted hide-mobile" />
      <label htmlFor="unit-sel" className="sr-only">Unidade</label>
      <select id="unit-sel" className="select" style={{ minWidth: 0, width: 'clamp(120px, 30vw, 240px)' }} value={t.unitId ?? ''} onChange={(e) => t.setUnitId(e.target.value || null)} data-tour="unit-selector">
        {t.allowedUnits.length > 1 && <option value="">Todas as unidades permitidas</option>}
        {t.allowedUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
    </div>
  )
}

function NotificationsBell() {
  const t = useTenant()
  const outbox = useCollection(t.tenantId, 'outbox')
  const failed = outbox.filter((o) => o.status === 'falhou' || o.status === 'falha_definitiva').length
  return (
    <Link to={`${t.base}/comunicacao`} className="btn btn-ghost btn-icon" aria-label={`Comunicação${failed ? ` — ${failed} falha(s)` : ''}`} style={{ position: 'relative' }}>
      <Bell size={18} aria-hidden="true" />
      {failed > 0 && <span aria-hidden="true" style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, background: 'var(--q-danger)' }} />}
    </Link>
  )
}

function UserMenu({ name, roles, onExit, onViewAs, canViewAs }: { name: string; roles: string; onExit: () => void; onViewAs: () => void; canViewAs: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="avatar" aria-hidden="true">{name.split(/\s+/).filter((p) => p.length > 2).slice(0, 2).map((p) => p[0]).join('')}</span>
        <span className="hide-mobile truncate" style={{ maxWidth: 160 }}>{name}</span>
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={name} description={roles} footer={<Button variant="danger" icon={<LogOut />} onClick={() => { setOpen(false); onExit() }}>Sair</Button>}>
        <div className="stack">
          <p className="small muted">Sessão demonstrativa por seletor de perfil — não há autenticação real.</p>
          {canViewAs && <Button icon={<Eye />} onClick={() => { setOpen(false); onViewAs() }}>Visualizar como outro perfil</Button>}
          <ThemeToggle />
        </div>
      </Dialog>
    </>
  )
}

// ---------- Super Admin ----------
export function MasterLayout({ children }: { children?: ReactNode }) {
  const session = useSession()
  const loc = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const users = usePlatformCollection('platformUsers')
  useDocumentBrand({ title: 'Qlinic · Super Admin', themeColor: '#0D9488', manifestHref: null, iconHref: '/brand/pwa/favicon.svg', appleIcon: '/brand/pwa/apple-touch-icon.png' })
  useEffect(() => { setOpen(false) }, [loc.pathname])
  if (session?.kind !== 'platform') {
    return <div className="content stack" style={{ maxWidth: 560 }}><h1>Acesso restrito à plataforma</h1><p className="muted">Escolha um perfil da equipe Qlinic na demonstração.</p><Link className="btn btn-primary" to="/demonstracao">Ir para demonstração</Link></div>
  }
  const me = users.find((u) => u.id === session.userId)
  const items = MASTER_NAV.filter((n) => canPlatform(session.role, n.area))
  const isActive = (p: string) => (p === '' ? loc.pathname === '/master' || loc.pathname === '/master/' : loc.pathname.startsWith(`/master/${p}`))
  return (
    <>
      <a href="#main" className="skip-link">Pular para o conteúdo</a>
      <DemoBanner />
      <div className="shell">
        <aside className={cx('sidebar', open && 'open')} aria-label="Navegação Super Admin">
          <div className="sb-head"><Link to="/master" aria-label="Qlinic Super Admin"><QlinicLogo height={26} onDark /></Link><Badge tone="brand">Admin</Badge></div>
          <nav aria-label="Menu Super Admin">
            <div className="sb-group">Plataforma</div>
            {items.map((n) => <NavLink key={n.path} to={`/master/${n.path}`} end={n.path === ''} className="sb-link" aria-current={isActive(n.path) ? 'page' : undefined}><span>{n.label}</span></NavLink>)}
          </nav>
          <div className="sb-foot tiny" style={{ color: 'var(--q-sidebar-muted)', padding: 12 }}>{me?.name}<br />{PLATFORM_ROLE_LABEL[session.role]}</div>
        </aside>
        {open && <div className="overlay" style={{ zIndex: 49 }} onClick={() => setOpen(false)} aria-hidden="true" />}
        <div className="main-col">
          <header className="topbar">
            <Button variant="ghost" iconOnly icon={<Menu />} className="only-mobile-tablet" onClick={() => setOpen(true)}>Abrir menu</Button>
            <style>{`@media (min-width:1024px){.only-mobile-tablet{display:none!important}}`}</style>
            <span className="tb-title">Super Admin</span>
            <div className="grow" />
            <ThemeToggle compact />
            <Button variant="ghost" icon={<LogOut />} onClick={() => { setSession(null); navigate('/demonstracao') }}>Sair</Button>
          </header>
          <main id="main" className="content" tabIndex={-1}><Suspense fallback={<PageFallback />}>{children ?? <Outlet />}</Suspense></main>
        </div>
      </div>
      <TourRunner />
    </>
  )
}
