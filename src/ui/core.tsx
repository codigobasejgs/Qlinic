// Componentes base acessíveis. Labels sempre visíveis; erros vinculados por aria-describedby.
import { forwardRef, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, type KeyboardEvent, Children, isValidElement, cloneElement, type ReactElement } from 'react'
import { Link } from 'react-router'
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Inbox, FlaskConical } from 'lucide-react'
import { cx, normalize } from '@/lib/util'

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: 'sm' | 'md'
  icon?: ReactNode
  iconOnly?: boolean
  block?: boolean
  loading?: boolean
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', icon, iconOnly, block, loading, className, children, type = 'button', disabled, ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', iconOnly && 'btn-icon', block && 'btn-block', className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {icon}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </button>
  )
})

export function ButtonLink({ to, variant = 'secondary', size = 'md', icon, children, className, ...rest }: { to: string; variant?: BtnVariant; size?: 'sm' | 'md'; icon?: ReactNode; children: ReactNode; className?: string; target?: string; rel?: string }) {
  return <Link to={to} className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)} {...rest}>{icon}{children}</Link>
}

interface FieldProps { label: ReactNode; hint?: ReactNode; error?: string | null; required?: boolean; children: ReactElement; className?: string; id?: string }
/** Envolve um único controle e injeta id, aria-invalid e aria-describedby. */
export function Field({ label, hint, error, required, children, className, id: idProp }: FieldProps) {
  const auto = useId()
  const id = idProp ?? auto
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const child = Children.only(children)
  const described = [hintId, errId].filter(Boolean).join(' ') || undefined
  const props = isValidElement(child) ? (child.props as Record<string, unknown>) : {}
  const enhanced = isValidElement(child) ? cloneElement(child as ReactElement<Record<string, unknown>>, { id: (props.id as string) ?? id, 'aria-invalid': error ? true : undefined, 'aria-describedby': described, required: props.required ?? required }) : child
  return (
    <div className={cx('field', className)}>
      <label htmlFor={(props.id as string) ?? id}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
      {enhanced}
      {hint && <span id={hintId} className="hint">{hint}</span>}
      {error && <span id={errId} className="error" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</span>}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mask?: (v: string) => string }>(function Input({ className, mask, onChange, ...rest }, ref) {
  return <input ref={ref} className={cx('input', className)} onChange={(e) => { if (mask) e.target.value = mask(e.target.value); onChange?.(e) }} {...rest} />
})
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cx('select', className)} {...rest} />
})
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx('textarea', className)} {...rest} />
})
export function Checkbox({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" {...rest} />
      <span className="stack" style={{ '--gap': '2px' } as React.CSSProperties}><span>{label}</span>{hint && <span className="small muted">{hint}</span>}</span>
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  )
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'sim'
export function Badge({ tone = 'neutral', children, plain, title }: { tone?: Tone; children: ReactNode; plain?: boolean; title?: string }) {
  return <span className={cx('badge', tone !== 'neutral' && tone, plain && 'plain')} title={title}>{children}</span>
}
/** Selo obrigatório para fluxos externos simulados. */
export function SimBadge({ children = 'Simulado — sem envio/cobrança real' }: { children?: ReactNode }) {
  return <span className="sim-stamp"><FlaskConical size={14} aria-hidden="true" />{children}</span>
}

export function Alert({ tone = 'info', title, children, action }: { tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : tone === 'danger' ? AlertCircle : Info
  return (
    <div className={cx('alert', tone)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" />
      <div className="alert-body">{title && <strong>{title}</strong>}{children && <div>{children}</div>}</div>
      {action}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, breadcrumbs }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; breadcrumbs?: { label: string; to?: string }[] }) {
  return (
    <div className="page-head">
      <div className="ph-text">
        {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="ph-actions">{actions}</div>}
    </div>
  )
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Trilha de navegação" className="breadcrumbs">
      {items.map((it, i) => (
        <span key={i} className="row" style={{ '--gap': '6px' } as React.CSSProperties}>
          {i > 0 && <span aria-hidden="true">/</span>}
          {it.to && i < items.length - 1 ? <Link to={it.to}>{it.label}</Link> : <span aria-current={i === items.length - 1 ? 'page' : undefined}>{it.label}</span>}
        </span>
      ))}
    </nav>
  )
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return <div className="empty">{icon ?? <Inbox aria-hidden="true" />}<h3>{title}</h3>{children && <p>{children}</p>}{action}</div>
}
export function ErrorState({ title = 'Não foi possível carregar', children, onRetry }: { title?: string; children?: ReactNode; onRetry?: () => void }) {
  return <div className="empty" role="alert"><AlertCircle aria-hidden="true" /><h3>{title}</h3>{children && <p>{children}</p>}{onRetry && <Button onClick={onRetry}>Tentar novamente</Button>}</div>
}
export function Skeleton({ h = 16, w = '100%', count = 1 }: { h?: number; w?: number | string; count?: number }) {
  return <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties} aria-hidden="true">{Array.from({ length: count }, (_, i) => <div key={i} className="skeleton" style={{ height: h, width: w }} />)}</div>
}

export function Kpi({ label, value, foot, title }: { label: ReactNode; value: ReactNode; foot?: ReactNode; title?: string }) {
  return <div className="kpi" title={title}><span className="kpi-label">{label}</span><span className="kpi-value">{value}</span>{foot && <span className="kpi-foot">{foot}</span>}</div>
}

export function Timeline({ items }: { items: { time: ReactNode; title: ReactNode; body?: ReactNode }[] }) {
  if (!items.length) return <p className="muted small">Sem eventos.</p>
  return <ol className="timeline">{items.map((it, i) => <li key={i}><div className="tl-time">{it.time}</div><div className="strong">{it.title}</div>{it.body && <div className="small muted">{it.body}</div>}</li>)}</ol>
}

/** Abas acessíveis (WAI-ARIA tabs, setas para navegar). */
export function Tabs({ tabs, value, onChange, label }: { tabs: { id: string; label: ReactNode; badge?: ReactNode }[]; value: string; onChange: (id: string) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const base = useId()
  const onKey = (e: KeyboardEvent, i: number) => {
    let n = -1
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length
    if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length
    if (e.key === 'Home') n = 0
    if (e.key === 'End') n = tabs.length - 1
    if (n >= 0) { e.preventDefault(); onChange(tabs[n].id); refs.current[n]?.focus() }
  }
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[i] = el }} role="tab" id={`${base}-${t.id}`} aria-selected={value === t.id} aria-controls={`${base}-${t.id}-panel`} tabIndex={value === t.id ? 0 : -1} onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>
          {t.label}{t.badge != null && <> <span className="badge plain" style={{ marginLeft: 4 }}>{t.badge}</span></>}
        </button>
      ))}
    </div>
  )
}
export function TabPanel({ children }: { children: ReactNode }) {
  return <div role="tabpanel" className="tab-panel" tabIndex={0}>{children}</div>
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <nav className="row end" aria-label="Paginação">
      <Button size="sm" iconOnly icon={<ChevronLeft />} disabled={page <= 1} onClick={() => onPage(page - 1)}>Página anterior</Button>
      <span className="small" aria-live="polite">Página {page} de {pages}</span>
      <Button size="sm" iconOnly icon={<ChevronRight />} disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima página</Button>
    </nav>
  )
}

/** Combobox acessível (padrão ARIA 1.2, lista filtrável). */
export function Combobox<T>({ label, items, getLabel, getSub, value, onChange, placeholder, required, error, hint, id: idProp, emptyText = 'Nenhum resultado' }: {
  label: string; items: T[]; getLabel: (t: T) => string; getSub?: (t: T) => string; value: T | null; onChange: (t: T | null) => void
  placeholder?: string; required?: boolean; error?: string | null; hint?: string; id?: string; emptyText?: string
}) {
  const auto = useId()
  const id = idProp ?? auto
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const filtered = (q ? items.filter((i) => normalize(getLabel(i) + ' ' + (getSub?.(i) ?? '')).includes(normalize(q))) : items).slice(0, 50)
  const listId = `${id}-list`
  const choose = (t: T) => { onChange(t); setQ(''); setOpen(false) }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && open && filtered[active]) { e.preventDefault(); choose(filtered[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }
  const display = open ? q : value ? getLabel(value) : q
  return (
    <div className="field combo">
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
      <input id={id} className="input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        aria-activedescendant={open && filtered[active] ? `${id}-opt-${active}` : undefined} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        value={display} placeholder={placeholder} required={required}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); if (!e.target.value) onChange(null) }}
        onFocus={() => { setOpen(true); setQ('') }} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
      {open && (
        <ul id={listId} role="listbox" className="combo-list" aria-label={label}>
          {filtered.length === 0 && <li role="option" aria-selected={false} aria-disabled="true" className="muted">{emptyText}</li>}
          {filtered.map((it, i) => (
            <li key={i} id={`${id}-opt-${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); choose(it) }} onMouseEnter={() => setActive(i)}>
              <span>{getLabel(it)}</span>{getSub && <span className="small muted">{getSub(it)}</span>}
            </li>
          ))}
        </ul>
      )}
      {hint && !error && <span id={`${id}-hint`} className="hint">{hint}</span>}
      {error && <span id={`${id}-err`} className="error" role="alert">{error}</span>}
    </div>
  )
}

export function Progress({ value, max = 100, label, tone }: { value: number; max?: number; label: string; tone?: 'warn' | 'danger' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return <div className={cx('progress', tone)} role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
}

export function Section({ title, actions, children, id }: { title: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="panel" id={id} aria-labelledby={id ? `${id}-t` : undefined}>
      <div className="panel-head"><h2 id={id ? `${id}-t` : undefined} style={{ fontSize: 16 }}>{title}</h2>{actions && <div className="row">{actions}</div>}</div>
      <div className="panel-body">{children}</div>
    </section>
  )
}

export function Avatar({ name, src, size }: { name: string; src?: string; size?: 'lg' }) {
  const ini = name.split(/\s+/).filter((p) => p.length > 2).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || name[0]
  return <span className={cx('avatar', size)} aria-hidden="true">{src ? <img src={src} alt="" /> : ini}</span>
}

export function DescList({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-3" style={{ margin: 0, '--gap': '12px' } as React.CSSProperties}>
      {items.map(([k, v], i) => <div key={i} className="stack" style={{ '--gap': '2px' } as React.CSSProperties}><dt className="small muted">{k}</dt><dd style={{ margin: 0 }} className="strong">{v ?? '—'}</dd></div>)}
    </dl>
  )
}
