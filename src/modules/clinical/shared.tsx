// Componentes compartilhados do módulo clínico.
import type { ReactNode } from 'react'
import type { ClinicalRecord, Patient, RecordStatus } from '@/domain/types'
import type { FormField } from '@/domain/modules'
import { Badge, Checkbox, Field, Input, Select, Textarea, type Tone } from '@/ui'
import { ageFromBirth, formatCivil, formatDateTime, todayCivil } from '@/lib/dates'
import { findTemplate, type RecordField, type RecordTemplate } from './templates'
import { visibleFields } from './forms'

export const RECORD_STATUS: Record<RecordStatus, { label: string; tone: Tone }> = {
  rascunho: { label: 'Rascunho', tone: 'warning' }, revisado: { label: 'Revisado', tone: 'info' }, finalizado: { label: 'Finalizado', tone: 'success' },
}
export function RecordStatusBadge({ status, addenda }: { status: RecordStatus; addenda?: number }) {
  return <span className="row" style={{ '--gap': '4px' } as React.CSSProperties}><Badge tone={RECORD_STATUS[status].tone}>{RECORD_STATUS[status].label}</Badge>{!!addenda && <Badge tone="neutral">{addenda} adendo{addenda > 1 ? 's' : ''}</Badge>}</span>
}

export function patientAge(p: Patient): string {
  if (!p.birthDate) return '—'
  const y = ageFromBirth(p.birthDate, todayCivil())
  const txt = y < 1 ? 'menos de 1 ano' : `${y} ano${y > 1 ? 's' : ''}`
  return `${txt}${p.birthDateEstimated ? ' (estimada)' : ''}`
}
export function patientSubtitle(p: Patient): string {
  if (p.kind === 'animal') return [p.species, p.breed, p.sex === 'F' ? 'Fêmea' : p.sex === 'M' ? 'Macho' : null, patientAge(p)].filter(Boolean).join(' · ')
  return [p.birthDate ? `Nasc. ${formatCivil(p.birthDate)} (${patientAge(p)})` : null, p.cpf ? `CPF ${p.cpf}` : null].filter(Boolean).join(' · ')
}

export function fmtValue(f: RecordField, v: unknown): string {
  if (v === undefined || v === null || String(v).trim() === '') return '—'
  return f.unit ? `${v} ${f.unit}` : String(v)
}

/** Visualização somente leitura de um registro conforme a VERSÃO do template com que foi criado. */
export function RecordContentView({ record }: { record: ClinicalRecord }) {
  const tpl = findTemplate(record.templateId, record.templateVersion)
  const entries: [string, string][] = tpl ? tpl.fields.map((f) => [f.label, fmtValue(f, record.content[f.id])]) : Object.entries(record.content).map(([k, v]) => [k, String(v ?? '—')])
  return (
    <dl className="rec-view">
      {entries.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  )
}

export function RecordCard({ record, proName, actions, compact }: { record: ClinicalRecord; proName?: string; actions?: ReactNode; compact?: boolean }) {
  return (
    <article className="card tight stack" style={{ '--gap': '10px' } as React.CSSProperties} aria-label={`${record.title} de ${formatDateTime(record.createdAt)}`}>
      <div className="row between">
        <div className="stack" style={{ '--gap': '2px' } as React.CSSProperties}>
          <strong>{record.title} <span className="tiny muted">· modelo v{record.templateVersion}</span></strong>
          <span className="small muted">{formatDateTime(record.createdAt)}{proName ? ` · ${proName}` : ''}</span>
        </div>
        <div className="row">
          {record.confidentiality === 'restrito' && <Badge tone="danger">Restrito</Badge>}
          <RecordStatusBadge status={record.status} addenda={record.addenda.length} />
          {actions}
        </div>
      </div>
      {!compact && <RecordContentView record={record} />}
      {!compact && record.portalGuidance && <div className="muted-surface small"><strong>Orientações ao paciente</strong> {record.releasedToPortal ? <Badge tone="success">Liberadas ao portal</Badge> : <Badge>Não liberadas</Badge>}<p>{record.portalGuidance}</p></div>}
      {!compact && record.addenda.length > 0 && (
        <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}>
          <strong className="small">Adendos</strong>
          {record.addenda.map((a) => <div key={a.id} className="addendum small"><div className="muted">{formatDateTime(a.at)} · {a.authorName} · Motivo: {a.reason}</div><p className="pre">{a.text}</p></div>)}
        </div>
      )}
    </article>
  )
}

/** Campo de template clínico estruturado. */
export function RecordFieldInput({ f, value, onChange, error, disabled }: { f: RecordField; value: unknown; onChange: (v: unknown) => void; error?: string; disabled?: boolean }) {
  const label = f.unit ? `${f.label} (${f.unit})` : f.label
  if (f.kind === 'textarea') return <Field label={label} hint={f.hint} error={error} required={f.required}><Textarea value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} rows={3} disabled={disabled} /></Field>
  if (f.kind === 'number') return <Field label={label} hint={f.min != null ? `Entre ${f.min} e ${f.max}` : undefined} error={error} required={f.required}><Input inputMode="decimal" value={String(value ?? '')} onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ''))} disabled={disabled} /></Field>
  if (f.kind === 'select') return <Field label={label} error={error} required={f.required}><Select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} disabled={disabled}><option value="">Selecione</option>{f.options?.map((o) => <option key={o}>{o}</option>)}</Select></Field>
  return <Field label={label} hint={f.hint} error={error} required={f.required}><Input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} disabled={disabled} /></Field>
}
export function RecordForm({ tpl, content, onChange, errors, disabled }: { tpl: RecordTemplate; content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; errors: Record<string, string>; disabled?: boolean }) {
  return <div className="stack" style={{ '--gap': '12px' } as React.CSSProperties}>{tpl.fields.map((f) => <RecordFieldInput key={f.id} f={f} value={content[f.id]} error={errors[f.id]} disabled={disabled} onChange={(v) => onChange({ ...content, [f.id]: v })} />)}</div>
}

/** Renderiza formulário (prévia interativa ou leitura de resposta). Campos ocultos por showIf não aparecem. */
export function FormRenderer({ fields, answers, onChange, errors = {}, readOnly }: { fields: FormField[]; answers: Record<string, unknown>; onChange?: (a: Record<string, unknown>) => void; errors?: Record<string, string>; readOnly?: boolean }) {
  const set = (id: string, v: unknown) => onChange?.({ ...answers, [id]: v })
  const vis = visibleFields(fields, answers)
  if (readOnly) {
    return (
      <dl className="rec-view">
        {vis.map((f) => f.type === 'section' ? <h3 key={f.id} className="form-section">{f.label}</h3> : <div key={f.id}><dt>{f.label}</dt><dd>{fmtAnswer(f, answers[f.id])}</dd></div>)}
      </dl>
    )
  }
  return (
    <div className="stack" style={{ '--gap': '14px' } as React.CSSProperties} aria-live="polite">
      {vis.map((f) => {
        const err = errors[f.id]
        const v = answers[f.id]
        if (f.type === 'section') return <h3 key={f.id} className="form-section">{f.label}</h3>
        if (f.type === 'textarea') return <Field key={f.id} label={f.label} hint={f.help} error={err} required={f.required}><Textarea value={String(v ?? '')} onChange={(e) => set(f.id, e.target.value)} rows={3} /></Field>
        if (f.type === 'text') return <Field key={f.id} label={f.label} hint={f.help} error={err} required={f.required}><Input value={String(v ?? '')} onChange={(e) => set(f.id, e.target.value)} /></Field>
        if (f.type === 'number') return <Field key={f.id} label={f.label} hint={f.help ?? (f.min != null || f.max != null ? `Entre ${f.min ?? '—'} e ${f.max ?? '—'}` : undefined)} error={err} required={f.required}><Input type="number" inputMode="decimal" value={v == null ? '' : String(v)} min={f.min} max={f.max} onChange={(e) => set(f.id, e.target.value === '' ? undefined : Number(e.target.value))} /></Field>
        if (f.type === 'date') return <Field key={f.id} label={f.label} hint={f.help} error={err} required={f.required}><Input type="date" value={String(v ?? '')} onChange={(e) => set(f.id, e.target.value || undefined)} /></Field>
        if (f.type === 'boolean' || f.type === 'single') {
          const opts = f.type === 'boolean' ? [{ v: true, l: 'Sim' }, { v: false, l: 'Não' }] : (f.options ?? []).map((o) => ({ v: o as unknown, l: o }))
          return (
            <fieldset key={f.id} aria-invalid={err ? true : undefined} aria-describedby={err ? `${f.id}-err` : undefined}>
              <legend>{f.label}{f.required && <span className="req" aria-hidden="true">*</span>}</legend>
              {f.help && <p className="small muted">{f.help}</p>}
              <div className="row">{opts.map((o) => <label key={String(o.l)} className="check" style={{ paddingRight: 12 }}><input type="radio" name={`ff-${f.id}`} checked={v === o.v} onChange={() => set(f.id, o.v)} />{o.l}</label>)}</div>
              {err && <span id={`${f.id}-err`} className="error small" role="alert" style={{ color: 'var(--q-danger)' }}>{err}</span>}
            </fieldset>
          )
        }
        const arr = Array.isArray(v) ? (v as string[]) : []
        return (
          <fieldset key={f.id} aria-invalid={err ? true : undefined}>
            <legend>{f.label}{f.required && <span className="req" aria-hidden="true">*</span>}</legend>
            {f.help && <p className="small muted">{f.help}</p>}
            <div className="row">{(f.options ?? []).map((o) => <Checkbox key={o} label={o} checked={arr.includes(o)} onChange={(e) => set(f.id, e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} />)}</div>
            {err && <span className="error small" role="alert" style={{ color: 'var(--q-danger)' }}>{err}</span>}
          </fieldset>
        )
      })}
    </div>
  )
}
export function fmtAnswer(f: FormField, v: unknown): string {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (Array.isArray(v)) return v.join(', ')
  if (f.type === 'date') return formatCivil(String(v))
  return String(v)
}
