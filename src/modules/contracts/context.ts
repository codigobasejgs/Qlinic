// Quem está contratando e por qual organização. Estados explícitos (nunca “em preparação” genérico):
// demo (simulação local, explícita) · visitante · conectado sem clínica · proprietário autorizado · sem permissão.
import { useEffect, useState } from 'react'
import { useSession } from '@/app/session'
import { db, platformDb, usePlatformCollection } from '@/data/store'
import { can } from '@/domain/permissions'
import { emptyContractor, emptySignatory, type ContractorParty, type ContractorSignatory } from '@/domain/contracts'
import type { Organization, StaffUser } from '@/domain/types'
import { loadModules } from '@/modules/ready'

export type Who =
  | { kind: 'loading' }
  | { kind: 'demo'; org: Organization | null; user: StaffUser | null; authorized: boolean }
  | { kind: 'visitor' }
  | { kind: 'user'; userId: string; reason: 'sem_clinica' | 'sem_permissao'; orgName?: string }
  | { kind: 'owner'; userId: string; org: Organization; user: StaffUser }

// sem import estático do cliente Supabase: /planos não carrega supabase-js para quem só olha os planos
const supabaseConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
const DEMO_FLAG = 'qlinic.contract.demo'
export function setExplicitDemo(on: boolean) { try { if (on) sessionStorage.setItem(DEMO_FLAG, '1'); else sessionStorage.removeItem(DEMO_FLAG) } catch { /* */ } }
const explicitDemo = () => { try { return sessionStorage.getItem(DEMO_FLAG) === '1' } catch { return false } }

/** Contratar pela clínica = aprovar configurações (proprietário). Mesma regra da RPC request_saas_contract. */
export const canContractFor = (u: StaffUser | undefined | null) => !!u?.active && can({ memberships: u.memberships }, { resource: 'configuracoes', action: 'approve' })

export function useWho(demoToggle: number): Who {
  const s = useSession()
  usePlatformCollection('organizations')
  const [who, setWho] = useState<Who>({ kind: 'loading' })
  useEffect(() => {
    let alive = true
    const done = (w: Who) => { if (alive) setWho(w) }
    ;(async () => {
      // demonstração: Supabase ausente, sessão demo ou escolha explícita — nunca com sessão conectada
      if (!s?.remote && (!supabaseConfigured || s || explicitDemo())) {
        if (s?.kind === 'staff') {
          await loadModules()
          const org = platformDb.list('organizations').find((o) => o.id === s.tenantId) ?? null
          const user = org ? db.list(org.id, 'staff').find((u) => u.id === s.userId) ?? null : null
          return done({ kind: 'demo', org, user, authorized: canContractFor(user) })
        }
        return done({ kind: 'demo', org: null, user: null, authorized: false })
      }
      const { supabase } = await import('@/data/supabase/client')
      const { data } = await supabase().auth.getSession()
      const uid = data.session?.user.id
      if (!uid) return done({ kind: 'visitor' })
      if (s?.remote && s.kind === 'staff') {
        await loadModules() // restaura e hidrata o tenant do servidor (RLS)
        const org = platformDb.list('organizations').find((o) => o.id === s.tenantId)
        const user = org ? db.list(org.id, 'staff').find((u) => u.id === s.userId) : undefined
        if (org && user && canContractFor(user)) return done({ kind: 'owner', userId: uid, org, user })
        return done({ kind: 'user', userId: uid, reason: 'sem_permissao', orgName: org?.name })
      }
      return done({ kind: 'user', userId: uid, reason: 'sem_clinica' })
    })().catch(() => done({ kind: 'visitor' }))
    return () => { alive = false }
  }, [s, demoToggle])
  return who
}

/** Pré-preenche só com dados da organização em que o usuário está autorizado. Nunca de outro tenant. */
export function prefillFrom(org: Organization, user: StaffUser): { party: ContractorParty; sig: ContractorSignatory } {
  const [city, uf] = org.city.split('/')
  const profile = db.list(org.id, 'clinicProfile')[0]
  const a = profile?.address
  const doc = org.document.replace(/\D/g, '')
  return {
    party: { ...emptyContractor(), kind: 'pj', legalName: org.legalName ?? '', tradeName: org.name, document: doc.length === 14 ? doc : '', segment: org.segment, email: org.contactEmail ?? '', phone: org.contactPhone ?? '',
      address: { cep: a?.cep ?? '', street: a?.street ?? '', number: a?.number ?? '', complement: '', district: a?.district ?? '', city: a?.city || (city ?? ''), uf: (a?.uf || uf || '').toUpperCase() } },
    sig: { ...emptySignatory(), name: user.name, email: user.email },
  }
}
