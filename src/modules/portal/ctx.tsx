// Contexto do portal: pacientes vinculados à pessoa (via links), paciente ativo (sessão) e permissões do vínculo.
import { useCallback } from 'react'
import { usePortal, useSession, setSession } from '@/app/session'
import { useCollection } from '@/data/store'
import type { Patient, PatientLink } from '@/domain/types'
import type { PortalPerms } from './lib'

export interface LinkedPatient { patient: Patient; links: PatientLink[]; perms: PortalPerms; relation: PatientLink['relation'] }

export const RELATION_LABEL: Record<PatientLink['relation'], string> = {
  self: 'Você', tutor: 'Tutor(a)', responsavel_legal: 'Responsável legal', responsavel_financeiro: 'Responsável financeiro',
}

/** Pacientes que a pessoa logada pode acessar. Vários vínculos para o mesmo paciente somam permissões (OU). */
export function useLinkedPatients(): LinkedPatient[] {
  const { org, person } = usePortal()
  const links = useCollection(org.id, 'links')
  const patients = useCollection(org.id, 'patients')
  const out: LinkedPatient[] = []
  for (const l of links) {
    if (l.personId !== person.id) continue
    const p = patients.find((x) => x.id === l.patientId)
    if (!p || p.status !== 'ativo' || !p.sharing.portal) continue
    const cur = out.find((x) => x.patient.id === p.id)
    if (cur) {
      cur.links.push(l)
      cur.perms = { canSeeClinical: cur.perms.canSeeClinical || l.canSeeClinical, canSeeFinancial: cur.perms.canSeeFinancial || l.canSeeFinancial, canSchedule: cur.perms.canSchedule || l.canSchedule }
    } else out.push({ patient: p, links: [l], relation: l.relation, perms: { canSeeClinical: l.canSeeClinical, canSeeFinancial: l.canSeeFinancial, canSchedule: l.canSchedule } })
  }
  // Próprio paciente primeiro; demais na ordem de vínculo (estável).
  return [...out.filter((x) => x.relation === 'self'), ...out.filter((x) => x.relation !== 'self')]
}

/** Paciente/animal/dependente selecionado (guardado na sessão como activePatientId). */
export function useActivePatient() {
  const portal = usePortal()
  const session = useSession()
  const list = useLinkedPatients()
  const wanted = session?.kind === 'portal' ? session.activePatientId : undefined
  const active = list.find((x) => x.patient.id === wanted) ?? list[0] ?? null
  const setActive = useCallback((id: string) => {
    const s = session
    if (s?.kind === 'portal') setSession({ ...s, activePatientId: id })
  }, [session])
  return { ...portal, list, active, setActive }
}

export function subjectLabel(segment: string, plural = false) {
  if (segment === 'veterinaria') return plural ? 'animais' : 'animal'
  return plural ? 'pacientes' : 'paciente'
}
