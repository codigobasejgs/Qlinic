// Seletores de domínio reutilizáveis (paciente, profissional, serviço) + hook de ?paciente= na URL.
import { useSearchParams } from 'react-router'
import type { ID, Patient } from '@/domain/types'
import { useTenant } from '@/app/session'
import { useCollection } from '@/data/store'
import { Combobox } from './core'
import { formatCivil } from '@/lib/dates'

export function PatientPicker({ value, onChange, label = 'Paciente', required, error, filter, id }: { value: ID | null; onChange: (id: ID | null) => void; label?: string; required?: boolean; error?: string | null; filter?: (p: Patient) => boolean; id?: string }) {
  const t = useTenant()
  const patients = useCollection(t.tenantId, 'patients').filter((p) => p.status === 'ativo' && !p.duplicateOf && (!filter || filter(p)))
  const sel = patients.find((p) => p.id === value) ?? null
  return (
    <Combobox id={id} label={label} required={required} error={error} items={patients} value={sel} onChange={(p) => onChange(p?.id ?? null)}
      getLabel={(p) => p.name} getSub={(p) => p.kind === 'animal' ? `${p.species} · ${p.breed}` : p.birthDate ? `Nasc. ${formatCivil(p.birthDate)}` : ''} placeholder="Digite o nome" />
  )
}

/** Lê/atualiza ?paciente= (deep link vindo da ficha do paciente). */
export function usePatientParam(): [ID | null, (id: ID | null) => void] {
  const [sp, setSp] = useSearchParams()
  const v = sp.get('paciente')
  return [v, (id) => { const n = new URLSearchParams(sp); if (id) n.set('paciente', id); else n.delete('paciente'); setSp(n, { replace: true }) }]
}

export function useLookup() {
  const t = useTenant()
  const patients = useCollection(t.tenantId, 'patients')
  const pros = useCollection(t.tenantId, 'professionals')
  const services = useCollection(t.tenantId, 'services')
  const resources = useCollection(t.tenantId, 'resources')
  const units = useCollection(t.tenantId, 'units')
  return {
    patient: (id?: ID) => patients.find((p) => p.id === id),
    pro: (id?: ID) => pros.find((p) => p.id === id),
    service: (id?: ID) => services.find((s) => s.id === id),
    resource: (id?: ID) => resources.find((r) => r.id === id),
    unit: (id?: ID) => units.find((u) => u.id === id),
    patients, pros, services, resources, units,
  }
}
