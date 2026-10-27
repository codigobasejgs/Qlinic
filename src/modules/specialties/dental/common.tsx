// Auxiliares de UI compartilhados pelas páginas de Odontologia, Medicina e Convênios.
import type { ReactNode } from 'react'
import { Lock, UserSearch } from 'lucide-react'
import type { ID, Patient } from '@/domain/types'
import { useTenant } from '@/app/session'
import { db } from '@/data/store'
import { Alert, DescList, EmptyState, PatientPicker, useLookup } from '@/ui'
import { ageFromBirth, formatCivil, todayCivil } from '@/lib/dates'

export function patientAllowed(t: ReturnType<typeof useTenant>, p: Patient): boolean {
  return p.kind === 'human' && t.allowedUnits.some((u) => u.id === p.unitId) && (!t.unitId || p.unitId === t.unitId)
}

export function patientIdAllowed(t: ReturnType<typeof useTenant>, id: string): boolean {
  const p = db.get(t.tenantId, 'patients', id)
  return !!p && patientAllowed(t, p)
}

export function clinicalOwned(t: ReturnType<typeof useTenant>, professionalId?: string): boolean {
  return t.scope('clinical') === 'all' || (t.scope('clinical') === 'own' && !!professionalId && professionalId === t.access.professionalId)
}

/** Estado explicativo quando o perfil não tem acesso ao conteúdo (não esconde silenciosamente). */
export function NoAccess({ what, resource }: { what: string; resource: string }) {
  return (
    <div className="panel"><EmptyState title={`Seu perfil não acessa ${what}`} icon={<Lock aria-hidden="true" />}>
      Este conteúdo exige permissão de <strong>{resource}</strong>. Peça ao proprietário da clínica para revisar seu papel em Configurações › Equipe.
    </EmptyState></div>
  )
}

export function ReadOnlyNotice({ children }: { children?: ReactNode }) {
  return <Alert tone="neutral" title="Somente leitura para este perfil">{children ?? 'Você pode consultar, mas registrar/alterar dados clínicos é exclusivo de profissionais de saúde (ou auxiliares, quando indicado).'}</Alert>
}

/** Seletor de paciente + resumo (sem dados sensíveis além do necessário). */
export function PatientBar({ value, onChange, filter }: { value: ID | null; onChange: (id: ID | null) => void; filter?: Parameters<typeof PatientPicker>[0]['filter'] }) {
  const L = useLookup()
  const t = useTenant()
  const candidate = L.patient(value ?? undefined)
  const p = candidate && patientAllowed(t, candidate) ? candidate : undefined
  return (
    <div className="panel"><div className="panel-body stack" style={{ '--gap': '12px' } as React.CSSProperties}>
      <div style={{ maxWidth: 480 }}><PatientPicker value={value} onChange={onChange} filter={(x) => patientAllowed(t, x) && (!filter || filter(x))} /></div>
      {p && <DescList items={[
        ['Nascimento', p.birthDate ? `${formatCivil(p.birthDate)} (${ageFromBirth(p.birthDate, todayCivil())} anos)` : '—'],
        ['Unidade', L.unit(p.unitId)?.name ?? '—'],
        ['Convênio (cadastro)', p.insurance?.name ?? 'Particular'],
      ]} />}
    </div></div>
  )
}

export function ChoosePatient({ children = 'Escolha um paciente acima para ver e registrar dados.' }: { children?: ReactNode }) {
  return <div className="panel"><EmptyState title="Nenhum paciente selecionado" icon={<UserSearch aria-hidden="true" />}>{children}</EmptyState></div>
}

/** Permissões clínicas derivadas do perfil efetivo. */
export function useClinicalAccess() {
  const t = useTenant()
  const scope = t.scope('clinical')
  return {
    canRead: scope !== false,
    scope,
    canEdit: t.can('clinical', 'create'),
    professionalId: t.access.professionalId,
  }
}

/** "12,5" | "12.5" → número; vazio → undefined; inválido → NaN. */
export function num(s: string): number | undefined {
  const v = s.trim().replace(',', '.')
  if (!v) return undefined
  return Number(v)
}
export const nf = (v: number | undefined | null, d = 1) => (v === undefined || v === null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: d }))
export const S = (gap: number | string) => ({ '--gap': typeof gap === 'number' ? `${gap}px` : gap }) as React.CSSProperties
