// Marca Qlinic (SVGs oficiais de /public/brand — nunca recriados com fonte) e marca da clínica (white-label).
import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import type { Organization } from '@/domain/types'
import { brandCssVars } from '@/lib/color'

// ---------- Tema ----------
export type ThemePref = 'light' | 'dark' | 'system'
const TKEY = 'qlinic.theme'
const tl = new Set<() => void>()
function readPref(): ThemePref { try { return (localStorage.getItem(TKEY) as ThemePref) || 'system' } catch { return 'system' } }
let pref: ThemePref = readPref()
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
function resolved(): 'light' | 'dark' { return pref === 'system' ? (mq?.matches ? 'dark' : 'light') : pref }
function apply() { document.documentElement.dataset.theme = resolved(); tl.forEach((l) => l()) }
mq?.addEventListener('change', () => pref === 'system' && apply())
export function setThemePref(p: ThemePref) { pref = p; try { localStorage.setItem(TKEY, p) } catch { /* */ } apply() }
export function useTheme(): { pref: ThemePref; mode: 'light' | 'dark' } {
  const mode = useSyncExternalStore((cb) => { tl.add(cb); return () => tl.delete(cb) }, resolved)
  return { pref, mode }
}

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const { pref: p } = useTheme()
  const next: ThemePref = p === 'light' ? 'dark' : p === 'dark' ? 'system' : 'light'
  const Icon = p === 'light' ? Sun : p === 'dark' ? Moon : Monitor
  const label = { light: 'Tema claro', dark: 'Tema escuro', system: 'Tema do sistema' }[p]
  return (
    <button type="button" className={compact ? 'btn btn-ghost btn-icon' : 'btn btn-ghost'} onClick={() => setThemePref(next)} title={`${label} (clique para alternar)`} aria-label={`${label}. Alternar tema`}>
      <Icon size={18} aria-hidden="true" />{!compact && <span>{label}</span>}
    </button>
  )
}

// ---------- Logo Qlinic ----------
type QVariant = 'horizontal' | 'vertical' | 'simbolo'
type QTone = 'auto' | 'principal' | 'reverso' | 'branco' | 'monocromatico'
const DIMS: Record<QVariant, [number, number]> = { horizontal: [374, 105], vertical: [241, 215], simbolo: [100, 100] }

export interface QlinicLogoProps {
  variant?: QVariant
  /** 'auto' = principal no light, reverso no dark. */
  tone?: QTone
  /** Altura em px; largura proporcional. */
  height?: number
  /** Quando há texto adjacente equivalente ("Qlinic"), use decorative para alt="" e evitar repetição. */
  decorative?: boolean
  className?: string
  style?: CSSProperties
  /** Força fundo escuro (ex.: sidebar navy). */
  onDark?: boolean
}
export function QlinicLogo({ variant = 'horizontal', tone = 'auto', height = 32, decorative, className, style, onDark }: QlinicLogoProps) {
  const { mode } = useTheme()
  const dark = onDark ?? mode === 'dark'
  const t = tone === 'auto' ? (dark ? 'reverso' : 'principal') : tone
  let file: string
  if (variant === 'simbolo') file = `qlinic-simbolo-${t}.svg`
  else if (variant === 'vertical') file = t === 'reverso' ? 'qlinic-logo-vertical-reverso.svg' : 'qlinic-logo-vertical.svg'
  else file = `qlinic-logo-${t}.svg`
  const [w, h] = DIMS[variant]
  const width = Math.round((height * w) / h)
  return <img src={`/brand/svg/${file}`} width={width} height={height} alt={decorative ? '' : 'Qlinic'} className={className} style={style} decoding="async" />
}

// ---------- Marca da clínica ----------
export function ClinicLogo({ org, height = 32, symbol, decorative }: { org: Organization; height?: number; symbol?: boolean; decorative?: boolean }) {
  const { mode } = useTheme()
  const src = symbol ? org.brand.symbolUrl : (mode === 'dark' && org.brand.logoDarkUrl) || org.brand.logoUrl
  if (src) return <img src={src} alt={decorative ? '' : org.name} style={{ height, width: 'auto', maxWidth: symbol ? height : height * 5, objectFit: 'contain' }} />
  // Fallback: iniciais sobre a cor da clínica (tokens acessíveis derivados) + nome em texto.
  const vars = brandCssVars(org.brand.primary, mode)
  const badge = (
    <span aria-hidden="true" style={{ width: height, height, borderRadius: height * 0.28, background: vars['--q-primary'], color: vars['--q-on-primary'], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: height * 0.42, flex: 'none', letterSpacing: '-0.02em' }}>
      {org.brand.initials}
    </span>
  )
  if (symbol) return <span role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : org.name}>{badge}</span>
  return (
    <span className="row nowrap" style={{ '--gap': '10px' } as CSSProperties}>
      {badge}
      <span className="strong truncate" style={{ fontSize: Math.max(14, height * 0.48) }} aria-hidden={decorative || undefined}>{org.name}</span>
    </span>
  )
}

/** Aplica tokens da clínica no <html> enquanto montado; restaura Qlinic ao desmontar. */
export function useTenantBrand(org: Organization | null) {
  const { mode } = useTheme()
  useLayoutEffect(() => {
    if (!org) return
    const root = document.documentElement
    const vars = brandCssVars(org.brand.primary, mode)
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v as string))
    root.style.setProperty('--q-brand-accent', vars['--q-primary'])
    return () => { Object.keys(vars).forEach((k) => root.style.removeProperty(k)); root.style.removeProperty('--q-brand-accent') }
  }, [org, org?.brand.primary, mode])
}

/** Atualiza <meta theme-color>, título e favicon conforme contexto. */
export function useDocumentBrand(opts: { title: string; themeColor?: string; iconHref?: string; manifestHref?: string | null; appleIcon?: string }) {
  const { title, themeColor, iconHref, manifestHref, appleIcon } = opts
  useEffect(() => {
    document.title = title
    const set = (sel: string, make: () => HTMLElement, attr: string, val?: string | null) => {
      let el = document.head.querySelector<HTMLElement>(sel)
      if (val === null) { el?.remove(); return }
      if (!val) return
      if (!el) { el = make(); document.head.appendChild(el) }
      el.setAttribute(attr, val)
    }
    set('meta[name="theme-color"]', () => Object.assign(document.createElement('meta'), { name: 'theme-color' }), 'content', themeColor)
    set('link[rel="icon"][type="image/svg+xml"]', () => Object.assign(document.createElement('link'), { rel: 'icon', type: 'image/svg+xml' }), 'href', iconHref)
    set('link[rel="apple-touch-icon"]', () => Object.assign(document.createElement('link'), { rel: 'apple-touch-icon' }), 'href', appleIcon)
    set('link[rel="manifest"]', () => Object.assign(document.createElement('link'), { rel: 'manifest' }), 'href', manifestHref)
  }, [title, themeColor, iconHref, manifestHref, appleIcon])
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => { const mm = window.matchMedia(q); const h = () => setM(mm.matches); mm.addEventListener('change', h); return () => mm.removeEventListener('change', h) }, [q])
  return m
}
