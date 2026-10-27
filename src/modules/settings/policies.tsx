import { useState } from 'react'
import { useActor, useTenant } from '@/app/session'
import { useCollection } from '@/data/store'
import { getPolicies, overriddenPaths, type ClinicPolicies } from '@/domain/settings'
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/domain/types'
import { Alert, Badge, Button, Checkbox, Field, Input, Section, Select, SimBadge, useAction } from '@/ui'
import { hhmmToMinutes, minutesToHHMM } from '@/lib/dates'
import { parseBRL } from '@/lib/money'
import { getPath, POLICY_GROUPS, restorePolicy, savePolicies, validateDemoEmail, type PolicyField } from './lib'

export function PoliciesEditor({ groups }: { groups?: (keyof ClinicPolicies)[] }) {
  const t = useTenant()
  const network = t.access.memberships.some((m) => m.unitIds === 'all' && ['clinic_owner', 'network_manager'].includes(m.role))
  const [unit, setUnit] = useState<string>(network ? '' : t.unitId ?? t.allowedUnits[0]?.id ?? '')
  const id = network || t.allowedUnits.some((u) => u.id === unit) ? unit : t.allowedUnits[0]?.id ?? ''
  return <div className="stack">
    <Field label="Aplicar políticas em"><Select value={id} onChange={(e) => setUnit(e.target.value)}>
      {network && <option value="">Rede (padrão)</option>}
      {t.allowedUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </Select></Field>
    <Alert tone="neutral">{id ? 'Campos sem override herdam da rede. Salvar um campo grava apenas essa chave; restaurar padrão remove a sobrescrita.' : 'Regra padrão para toda a rede. Unidades podem sobrescrever campos individualmente.'}</Alert>
    <PolicyFields key={id} unitId={id || null} groups={groups} />
  </div>
}

function PolicyFields({ unitId, groups }: { unitId: string | null; groups?: (keyof ClinicPolicies)[] }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  useCollection(t.tenantId, 'settings')
  const effective = getPolicies(t.tenantId, unitId)
  const paths = unitId ? overriddenPaths(t.tenantId, unitId) : []
  const network = t.access.memberships.some((m) => m.unitIds === 'all' && ['clinic_owner', 'network_manager'].includes(m.role))
  const editable = t.can('configuracoes', 'update', { unitId: unitId ?? undefined }) && (!!unitId || network)
  return <div className="stack">
    {!editable && <Alert tone="neutral">Seu perfil pode consultar, mas não editar estas políticas.</Alert>}
    <SimBadge />
    {POLICY_GROUPS.filter((g) => !groups || groups.includes(g.id)).map((g) => <Section key={g.id} title={g.title}>
      {g.fields.map((f) => <PolicyRow key={`${f.path}:${JSON.stringify(getPath(effective, f.path))}:${paths.includes(f.path)}`} field={f} value={getPath(effective, f.path)} unitId={unitId} overridden={paths.includes(f.path)} editable={editable} save={(v) => run(() => savePolicies(t.tenantId, unitId, { [f.path]: v }, actor), 'Política salva.')} restore={() => run(() => restorePolicy(t.tenantId, unitId, f.path, actor), 'Padrão da rede restaurado.')} />)}
    </Section>)}
  </div>
}

function PolicyRow({ field: f, value, unitId, overridden, editable, save, restore }: { field: PolicyField; value: unknown; unitId: string | null; overridden: boolean; editable: boolean; save: (v: unknown) => boolean; restore: () => void }) {
  const [draft, setDraft] = useState<unknown>(f.kind === 'cents' ? value === undefined ? '' : (Number(value) / 100).toFixed(2).replace('.', ',') : f.kind === 'hours' ? (value as number[]).join(', ') : value)
  const [error, setError] = useState<string | null>(null)
  const disabled = !editable || f.readonly
  const submit = () => {
    let v = draft
    let err: string | null = null
    if (f.kind === 'number') {
      v = Number(draft)
      if (String(draft).trim() === '' || !Number.isFinite(v) || Number(v) < (f.min ?? 0) || Number(v) > (f.max ?? Number.MAX_SAFE_INTEGER)) err = `Informe um número entre ${f.min ?? 0} e ${f.max ?? 'o limite permitido'}.`
    }
    if (f.kind === 'cents') {
      v = String(draft).trim() ? parseBRL(String(draft)) : undefined
      if (v === null || (typeof v === 'number' && (!Number.isSafeInteger(v) || v < 0))) err = 'Informe um valor monetário válido.'
    }
    if (f.kind === 'hours') {
      v = String(draft).split(',').map((x) => Number(x.trim()))
      if (!String(draft).trim() || (v as number[]).some((n) => !Number.isInteger(n) || n < 1 || n > 720)) err = 'Use horas inteiras entre 1 e 720, separadas por vírgula.'
    }
    if (f.path === 'communication.replyTo') err = validateDemoEmail(String(draft))
    if (f.kind === 'methods' && !(draft as string[]).length) err = 'Selecione ao menos um meio de pagamento.'
    setError(err)
    if (!err) save(v)
  }
  let control
  if (f.kind === 'bool') control = <Checkbox label={f.label} checked={!!draft} disabled={disabled} onChange={(e) => setDraft(e.target.checked)} />
  else if (f.kind === 'select') control = <Select value={String(draft)} disabled={disabled} onChange={(e) => setDraft(e.target.value)}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
  else if (f.kind === 'methods') control = <fieldset disabled={disabled}><legend>{f.label}</legend><div className="grid grid-2">{(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => <Checkbox key={m} label={PAYMENT_METHOD_LABEL[m]} checked={(draft as string[]).includes(m)} onChange={(e) => setDraft(e.target.checked ? [...draft as string[], m] : (draft as string[]).filter((x) => x !== m))} />)}</div></fieldset>
  else control = <Input type={f.kind === 'minutes' ? 'time' : f.kind === 'number' ? 'number' : 'text'} value={f.kind === 'minutes' ? minutesToHHMM(Number(draft)) : String(draft ?? '')} min={f.min} max={f.max} step={f.kind === 'number' ? 'any' : undefined} disabled={disabled} onChange={(e) => setDraft(f.kind === 'minutes' ? hhmmToMinutes(e.target.value) : e.target.value)} />
  return <div className="st-policy-row">
    <div className="stack" style={{ gap: 6 }}>
      {f.kind === 'bool' || f.kind === 'methods' ? control : <Field label={`${f.label}${f.suffix ? ` (${f.suffix})` : ''}`} hint={f.hint} error={error}>{control}</Field>}
      {(f.kind === 'bool' || f.kind === 'methods') && f.hint && <p className="small muted">{f.hint}</p>}
      {(f.kind === 'bool' || f.kind === 'methods') && error && <p role="alert">{error}</p>}
      {unitId && <span className="st-src"><Badge tone={overridden ? 'warning' : 'neutral'}>{overridden ? 'sobrescrito' : 'herdado da rede'}</Badge></span>}
    </div>
    {!f.readonly && <div className="row"><Button disabled={disabled} aria-label={`Salvar ${f.label}`} onClick={submit}>Salvar campo</Button>{unitId && overridden && <Button disabled={disabled} onClick={restore} aria-label={`Restaurar padrão: ${f.label}`}>Restaurar padrão</Button>}</div>}
  </div>
}
