// Tours guiados: retomáveis, puláveis, reiniciáveis, resistentes a elementos ausentes/invisíveis.
// Convenção de alvos: [data-tour="nav-agenda"] (menu), [data-tour="primary-action"] (ação principal da página),
// [data-tour="page-content"] (conteúdo). Se o alvo não existir, estiver invisível ou fora da tela, o passo aparece centralizado.
// Passos com minWidth são omitidos em telas menores (ver stepsFor).
import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { X } from 'lucide-react'
import { Button } from '@/ui/core'
import { TOURS, stepsFor, type Tour } from './tours'
import { getSession } from '@/app/session'

interface TourState { tourId: string; step: number }
const KEY = () => {
  const s = getSession()
  const scope = s && 'tenantId' in s ? `${s.tenantId}:${s.kind === 'staff' ? s.userId : s.kind === 'portal' ? s.personId : ''}` : s?.kind === 'platform' ? `platform:${s.userId}` : 'anon'
  return `qlinic.tour.${scope}`
}
const listeners = new Set<() => void>()
let active: TourState | null = null
let lastKey = ''
let version = 0

function load(): TourState | null {
  try { const v = localStorage.getItem(`${KEY()}.active`); return v ? JSON.parse(v) : null } catch { return null }
}
function persist() {
  try { if (active) localStorage.setItem(`${KEY()}.active`, JSON.stringify(active)); else localStorage.removeItem(`${KEY()}.active`) } catch { /* */ }
  version++
  listeners.forEach((l) => l())
}
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb) } }
export function tourProgress(): Record<string, 'concluido' | 'pulado' | number> {
  try { return JSON.parse(localStorage.getItem(`${KEY()}.progress`) ?? '{}') } catch { return {} }
}
function setProgress(id: string, v: 'concluido' | 'pulado' | number) {
  try { localStorage.setItem(`${KEY()}.progress`, JSON.stringify({ ...tourProgress(), [id]: v })) } catch { /* */ }
}
export function startTour(id: string, fromStep = 0) { active = { tourId: id, step: fromStep }; persist() }
export function stopTour(reason: 'concluido' | 'pulado' | 'pausado') {
  if (active) setProgress(active.tourId, reason === 'pausado' ? active.step : reason)
  active = null
  persist()
}
function useActive() {
  return useSyncExternalStore(subscribe, () => {
    const k = KEY()
    if (k !== lastKey) { lastKey = k; active = load() }
    return active
  })
}
/** Re-render quando tours iniciam/param (para listas de progresso). Retorna o tour ativo. */
export function useTourState(): { activeId: string | null; activeStep: number; version: number } {
  const a = useActive()
  const v = useSyncExternalStore(subscribe, () => version)
  return { activeId: a?.tourId ?? null, activeStep: a?.step ?? 0, version: v }
}

function visible(el: Element | null): el is HTMLElement {
  if (!el) return false
  const r = (el as HTMLElement).getBoundingClientRect()
  const st = getComputedStyle(el as HTMLElement)
  // Fora da área visível horizontalmente (ex.: sidebar recolhida em gaveta no celular) conta como invisível.
  return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && r.right > 0 && r.left < window.innerWidth
}

export function TourRunner() {
  const a = useActive()
  const nav = useNavigate()
  const loc = useLocation()
  const [width, setWidth] = useState(() => window.innerWidth)
  const tour: Tour | undefined = a ? TOURS.find((t) => t.id === a.tourId) : undefined
  const steps = tour ? stepsFor(tour, width) : []
  const idx = a ? Math.min(a.step, Math.max(0, steps.length - 1)) : 0
  const step = steps[idx]
  const [rect, setRect] = useState<DOMRect | null>(null)
  const base = loc.pathname.match(/^\/(app|c)\/[^/]+/)?.[0] ?? ''

  useEffect(() => { if (a && !tour) { active = null; persist() } }, [a, tour])
  useEffect(() => {
    if (!step?.route) return
    const target = step.route.startsWith('/') ? step.route : `${base}/${step.route}`.replace(/\/$/, '') || '/'
    if (loc.pathname !== target) nav(target)
  }, [step, base, loc.pathname, nav])

  const locate = useCallback(() => {
    setWidth(window.innerWidth)
    document.querySelectorAll('.tour-highlight').forEach((x) => x.classList.remove('tour-highlight'))
    if (!step?.target) { setRect(null); return }
    const el = document.querySelector(`[data-tour="${step.target}"]`)
    if (visible(el)) {
      el.classList.add('tour-highlight')
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' })
      setRect(el.getBoundingClientRect())
    } else setRect(null)
  }, [step])
  useLayoutEffect(() => {
    const t = setTimeout(locate, 250)
    window.addEventListener('resize', locate)
    return () => { clearTimeout(t); window.removeEventListener('resize', locate); document.querySelectorAll('.tour-highlight').forEach((x) => x.classList.remove('tour-highlight')) }
  }, [locate, loc.pathname])

  if (!a || !tour || !step) return null
  const last = idx === steps.length - 1
  const go = (n: number) => { active = { tourId: tour.id, step: n }; persist() }
  const pos: React.CSSProperties = rect
    ? { top: Math.max(8, Math.min(window.innerHeight - 240, rect.bottom + 12)), left: Math.max(16, Math.min(window.innerWidth - 376, rect.left)) }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  return (
    <div className="tour-pop" style={pos} role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-live="polite">
      <div className="row between nowrap">
        <span className="tiny muted">{tour.title} · passo {idx + 1} de {steps.length}</span>
        <Button size="sm" variant="ghost" iconOnly icon={<X />} onClick={() => stopTour('pausado')}>Pausar tour</Button>
      </div>
      <h2 id="tour-title" style={{ fontSize: 16, margin: '6px 0' }}>{step.title}</h2>
      <p className="small">{step.body}</p>
      {step.target && !rect && <p className="tiny muted" style={{ marginTop: 6 }}>O elemento deste passo não está visível nesta tela ou para este perfil.</p>}
      <div className="row between" style={{ marginTop: 12 }}>
        <Button size="sm" variant="link" onClick={() => stopTour('pulado')}>Pular tour</Button>
        <div className="row">
          {idx > 0 && <Button size="sm" onClick={() => go(idx - 1)}>Voltar</Button>}
          <Button size="sm" variant="primary" onClick={() => { if (last) stopTour('concluido'); else go(idx + 1) }}>{last ? 'Concluir' : 'Próximo'}</Button>
        </div>
      </div>
    </div>
  )
}
