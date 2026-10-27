// Diálogo, drawer, confirmação, toasts e command palette. Foco preso, Esc fecha, foco restaurado.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, CheckCircle2, AlertCircle, Search } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from './core'
import { cx, normalize } from '@/lib/util'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'Tab' && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null)
        if (!items.length) return
        const a = items[0], b = items[items.length - 1]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus() }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = overflow; prev?.focus?.() }
  }, [open, onClose])
  return ref
}

export interface DialogProps { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' | 'xl'; drawer?: boolean; dismissable?: boolean }
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', drawer, dismissable = true }: DialogProps) {
  const close = useCallback(() => { if (dismissable) onClose() }, [dismissable, onClose])
  const ref = useFocusTrap(open, close)
  const tid = useId()
  const did = useId()
  if (!open) return null
  return createPortal(
    <div className={cx('overlay', drawer && 'drawer-overlay')} onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={tid} aria-describedby={description ? did : undefined} className={cx(drawer ? 'drawer' : 'dialog', size !== 'md' && size)}>
        <div className="dialog-head">
          <div className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
            <h2 id={tid} style={{ fontSize: 18 }}>{title}</h2>
            {description && <p id={did} className="muted small">{description}</p>}
          </div>
          {dismissable && <Button variant="ghost" iconOnly icon={<X />} onClick={onClose}>Fechar</Button>}
        </div>
        <div className="dialog-body" style={drawer ? { flex: 1 } : undefined}>{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ---------- Confirmação ----------
interface ConfirmOpts { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; requireReason?: boolean; reasonLabel?: string }
type ConfirmFn = (o: ConfirmOpts) => Promise<{ ok: boolean; reason?: string }>
const ConfirmCtx = createContext<ConfirmFn | null>(null)

// ---------- Toasts ----------
interface ToastItem { id: number; text: ReactNode; tone: 'ok' | 'error' }
type ToastFn = (text: ReactNode, tone?: 'ok' | 'error') => void
const ToastCtx = createContext<ToastFn | null>(null)

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toast = useCallback<ToastFn>((text, tone = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 4500)
  }, [])
  const [pending, setPending] = useState<(ConfirmOpts & { resolve: (r: { ok: boolean; reason?: string }) => void }) | null>(null)
  const [reason, setReason] = useState('')
  const confirm = useCallback<ConfirmFn>((o) => new Promise((resolve) => { setReason(''); setPending({ ...o, resolve }) }), [])
  const done = (ok: boolean) => { pending?.resolve({ ok, reason: reason.trim() || undefined }); setPending(null) }
  const rid = useId()
  return (
    <ToastCtx.Provider value={toast}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <Dialog open={!!pending} onClose={() => done(false)} title={pending?.title} footer={<>
          <Button onClick={() => done(false)}>Voltar</Button>
          <Button variant={pending?.danger ? 'danger' : 'primary'} disabled={pending?.requireReason && !reason.trim()} onClick={() => done(true)} data-autofocus={!pending?.requireReason || undefined}>{pending?.confirmLabel ?? 'Confirmar'}</Button>
        </>}>
          <div className="stack">
            {pending?.body && <div>{pending.body}</div>}
            {pending?.requireReason && (
              <div className="field">
                <label htmlFor={rid}>{pending.reasonLabel ?? 'Motivo'}<span className="req" aria-hidden="true">*</span></label>
                <textarea id={rid} className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} required data-autofocus />
              </div>
            )}
          </div>
        </Dialog>
        <div className="toasts" aria-live="polite" aria-atomic="false">
          {toasts.map((t) => (
            <div key={t.id} className={cx('toast', t.tone === 'error' && 'error')} role={t.tone === 'error' ? 'alert' : 'status'}>
              {t.tone === 'error' ? <AlertCircle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
              <div>{t.text}</div>
            </div>
          ))}
        </div>
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const t = useContext(ToastCtx)
  if (!t) throw new Error('useToast fora de OverlayProvider')
  return t
}
export function useConfirm() {
  const c = useContext(ConfirmCtx)
  if (!c) throw new Error('useConfirm fora de OverlayProvider')
  return c
}
/** Executa ação; erro vira toast de erro (sem engolir). Retorna true se ok. */
export function useAction() {
  const toast = useToast()
  return useCallback((fn: () => unknown, okMsg?: ReactNode) => {
    try { fn(); if (okMsg) toast(okMsg); return true } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); return false }
  }, [toast])
}

// ---------- Command palette ----------
export interface Command { id: string; label: string; group: string; to?: string; run?: () => void; keywords?: string }
export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const ref = useFocusTrap(open, onClose)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const nav = useNavigate()
  const lid = useId()
  useEffect(() => { if (open) { setQ(''); setActive(0) } }, [open])
  if (!open) return null
  const list = commands.filter((c) => !q || normalize(`${c.label} ${c.group} ${c.keywords ?? ''}`).includes(normalize(q))).slice(0, 30)
  const exec = (c: Command) => { onClose(); if (c.to) nav(c.to); c.run?.() }
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Busca de comandos" className="dialog cmdk">
        <div className="row nowrap" style={{ paddingLeft: 16 }}>
          <Search size={18} aria-hidden="true" className="muted" />
          <input className="input" role="combobox" aria-expanded="true" aria-controls={lid} aria-activedescendant={list[active] ? `${lid}-${active}` : undefined} placeholder="Buscar telas, pacientes, ações…" aria-label="Buscar"
            value={q} onChange={(e) => { setQ(e.target.value); setActive(0) }} data-autofocus
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
              if (e.key === 'Enter' && list[active]) exec(list[active])
            }} />
        </div>
        <ul id={lid} role="listbox" aria-label="Resultados">
          {list.length === 0 && <li className="muted small" style={{ padding: 12 }}>Nada encontrado.</li>}
          {list.map((c, i) => (
            <li key={c.id}>
              <div role="option" id={`${lid}-${i}`} aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => exec(c)} style={{ cursor: 'pointer' }}>
                <span className="grow">{c.label}</span><span className="tiny muted">{c.group}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="small muted" style={{ padding: '8px 16px 12px' }}><span className="kbd">↑</span> <span className="kbd">↓</span> navegar · <span className="kbd">Enter</span> abrir · <span className="kbd">Esc</span> fechar</div>
      </div>
    </div>,
    document.body,
  )
}
