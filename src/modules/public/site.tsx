// Moldura do site comercial Qlinic: header com navegação, menu mobile acessível, footer com avisos.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { Menu, X } from 'lucide-react'
import { QlinicLogo, ThemeToggle, useDocumentBrand } from '@/ui/brand'

const NAV = [
  { to: '/#segmentos', label: 'Segmentos', match: '/segmentos' },
  { to: '/recursos', label: 'Recursos', match: '/recursos' },
  { to: '/planos', label: 'Planos', match: '/planos' },
  { to: '/ajuda', label: 'Ajuda', match: '/ajuda' },
]

export function SiteLayout({ title, children }: { title: string; children: ReactNode }) {
  useDocumentBrand({ title: `${title} · Qlinic`, themeColor: '#0D9488', manifestHref: null, iconHref: '/brand/pwa/favicon.svg', appleIcon: '/brand/pwa/apple-touch-icon.png' })
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => { setOpen(false) }, [loc.pathname, loc.hash])
  useEffect(() => {
    if (loc.hash) document.getElementById(decodeURIComponent(loc.hash.slice(1)))?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [loc.pathname, loc.hash])
  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>('a,button')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const current = (m: string) => (loc.pathname.startsWith(m) ? 'page' : undefined)
  return (
    <div className="pub">
      <a href="#main" className="skip-link">Pular para o conteúdo</a>
      <header className="site-header">
        <div className="inner">
          <Link to="/" className="pub-brand" aria-label="Qlinic — início"><QlinicLogo height={30} decorative /></Link>
          <nav className="site-nav pub-desktop" aria-label="Principal">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} aria-current={current(n.match)}>{n.label}</NavLink>)}
          </nav>
          <div className="pub-actions">
            <ThemeToggle compact />
            <Link to="/demonstracao" className="btn btn-primary pub-desktop">Ver demonstração</Link>
            <button ref={btn} type="button" className="btn btn-ghost btn-icon pub-mobile" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
              {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}<span className="sr-only">{open ? 'Fechar menu' : 'Abrir menu'}</span>
            </button>
          </div>
        </div>
        <div id={panelId} ref={panel} className="pub-mobile-panel" hidden={!open}>
          <nav aria-label="Principal (celular)" className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
            {NAV.map((n) => <Link key={n.to} to={n.to} className="btn btn-ghost pub-mlink" aria-current={current(n.match)}>{n.label}</Link>)}
            <Link to="/demonstracao" className="btn btn-primary btn-block">Ver demonstração</Link>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="pub-main">{children}</main>
      <footer className="site-footer">
        <div className="container pub-foot">
          <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
            <QlinicLogo height={24} />
            <p>Sua clínica conectada ao cuidado.</p>
          </div>
          <nav aria-label="Rodapé" className="pub-foot-links">
            <Link to="/recursos">Recursos</Link>
            <Link to="/planos">Planos</Link>
            <Link to="/ajuda">Central de ajuda</Link>
            <Link to="/demonstracao">Demonstração</Link>
            <Link to="/demonstracao/identidade">Identidade visual</Link>
            <Link to="/auth/login">Entrar (demonstrativo)</Link>
          </nav>
          <div className="small stack" style={{ '--gap': '6px' } as React.CSSProperties}>
            <p><strong>Nome e marca provisórios.</strong> A disponibilidade jurídica do nome Qlinic ainda está em análise.</p>
            <p>Demonstração com dados fictícios: nenhum paciente, contato, CPF ou CNPJ é real. Não há envio, cobrança nem autenticação reais.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export function SectionHead({ id, eyebrow, title, lead }: { id?: string; eyebrow?: string; title: string; lead?: ReactNode }) {
  return (
    <div className="pub-shead">
      {eyebrow && <p className="pub-eyebrow">{eyebrow}</p>}
      <h2 id={id}>{title}</h2>
      {lead && <p className="pub-lead">{lead}</p>}
    </div>
  )
}
