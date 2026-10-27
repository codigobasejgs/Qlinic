// Auxiliares de UI compartilhados pelas páginas de especialidade.
import { useEffect, useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { useTenant } from '@/app/session'
import { useCollection } from '@/data/store'
import type { ID, ModuleKey, Patient } from '@/domain/types'
import { MODULE_LABEL } from '@/domain/types'
import { Alert, EmptyState, PageHeader, PatientPicker, usePatientParam } from '@/ui'
import { zonedParts, zonedToInstant, hhmmToMinutes, type ISOInstant } from '@/lib/dates'

/** Relógio que avança a cada minuto (estados derivados como "atrasado"). */
export function useNow(ms = 60000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const h = setInterval(() => setNow(new Date()), ms); return () => clearInterval(h) }, [ms])
  return now
}

export function useTz() {
  const t = useTenant()
  return t.unit?.timezone ?? t.allowedUnits[0]?.timezone ?? t.org.timezone
}

/** Unidade para gravações (unidade ativa ou primeira permitida). */
export function useWriteUnit(): ID {
  const t = useTenant()
  return t.unitId ?? t.allowedUnits[0]?.id ?? t.units[0]?.id ?? ''
}

/** Profissional pode registrar conteúdo clínico (vínculo profissional + permissão). */
export function useClinicalWriter() {
  const t = useTenant()
  return { canWrite: t.can('clinical', 'create') && !!t.access.professionalId, proId: t.access.professionalId }
}

export function proNameOf(pros: { id: ID; name: string }[], id?: ID) {
  return pros.find((p) => p.id === id)?.name ?? '—'
}

/** "2,5" | "2.5" → 2.5; vazio → null; inválido → NaN. */
export function parseNum(s: string): number | null {
  const v = s.trim().replace(',', '.')
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

/** datetime-local (fuso da unidade) ↔ instante ISO UTC. */
export function localToInstant(v: string, tz: string): ISOInstant {
  const [d, hm] = v.split('T')
  if (!d || !hm) throw new Error('Data/hora inválida.')
  return zonedToInstant(d, hhmmToMinutes(hm), tz)
}
export function instantToLocal(i: ISOInstant | Date, tz: string): string {
  const p = zonedParts(i, tz)
  return `${p.date}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

export function ModuleOff({ module }: { module: ModuleKey }) {
  return <EmptyState title={`Módulo ${MODULE_LABEL[module]} não habilitado`}>Este módulo não está ativo para esta organização. A habilitação é feita em Configurações pela gestão — e habilitar módulo não concede permissão automaticamente.</EmptyState>
}

export function NoAccess({ children }: { children?: ReactNode }) {
  return <EmptyState title="Seu perfil não acessa esta área" icon={<Lock aria-hidden="true" />}>{children ?? 'Conteúdo clínico visível apenas para perfis com permissão. Solicite acesso à gestão se necessário.'}</EmptyState>
}

export function ReadOnly({ children }: { children: ReactNode }) {
  return <Alert tone="neutral" title="Somente leitura">{children}</Alert>
}

/** Cabeçalho + seletor de paciente (deep link ?paciente=). */
export function SpecShell({ title, subtitle, module, pickerLabel = 'Paciente', filter, actions, children }: {
  title: string; subtitle: ReactNode; module: ModuleKey; pickerLabel?: string; filter?: (p: Patient) => boolean; actions?: ReactNode
  children: (patient: Patient | null, setPatient: (id: ID | null) => void) => ReactNode
}) {
  const t = useTenant()
  const [pid, setPid] = usePatientParam()
  const patients = useCollection(t.tenantId, 'patients')
  const patient = patients.find((p) => p.id === pid && (!filter || filter(p))) ?? null
  if (!t.moduleOn(module)) return <><PageHeader title={title} /><ModuleOff module={module} /></>
  return (
    <div className="stack spec" data-tour="page-content">
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      <div className="card tight spec-picker">
        <PatientPicker value={pid} onChange={setPid} label={pickerLabel} filter={filter} />
      </div>
      <div key={`${t.tenantId}:${t.effectiveUser?.id}:${t.unitId}:${patient?.id ?? 'none'}`} className="stack">{children(patient, setPid)}</div>
    </div>
  )
}
