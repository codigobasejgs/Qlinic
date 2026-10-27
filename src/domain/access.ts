// Regras de visibilidade clínica (demonstrativas; produção = RLS + autorização no servidor).
import type { ClinicDocument, ClinicalRecord, Patient } from './types'
import type { useTenant } from '@/app/session'

type T = ReturnType<typeof useTenant>

/** Registro restrito (psicologia): só profissional autor (ou com clinical_restricted em escopo total). Recepção nunca. */
export function canSeeRecord(t: T, r: ClinicalRecord): boolean {
  if (r.confidentiality === 'restrito') return t.can('clinical_restricted', 'read', { ownerProfessionalId: r.professionalId }) && (t.scope('clinical_restricted') === 'all' || t.access.professionalId === r.professionalId)
  const s = t.scope('clinical')
  if (s === 'all') return true
  if (s === 'own') return t.access.professionalId === r.professionalId
  return false
}
export function canSeeDocument(t: T, d: ClinicDocument): boolean {
  if (d.confidentiality === 'restrito') return t.access.professionalId === d.createdBy || t.scope('clinical_restricted') === 'all'
  return t.can('documentos')
}
/** Alertas clínicos sensíveis só para quem tem leitura clínica. */
export function visibleClinicalAlerts(t: T, p: Patient): string[] {
  return t.scope('clinical') !== false ? [...p.allergies, ...p.clinicalAlerts] : []
}
