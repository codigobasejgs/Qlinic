// Sessão DEMONSTRATIVA: seletor de perfil, sem autenticação real.
// O tenant da URL é CONTEXTO, não prova de autorização: membership é conferida aqui (e, no futuro, no servidor).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ID, Organization, PlatformRole, StaffUser, Unit, Person } from '@/domain/types'
import { can, scopeOf, allowedUnitIds, type AccessContext, type Action, type Resource } from '@/domain/permissions'
import { db, evictOtherTenants, platformDb, useCollection, usePlatformCollection } from '@/data/store'

export type DemoSession =
  | { kind: 'staff'; tenantId: ID; userId: ID; unitId: ID | null; viewAs?: { userId: ID } }
  | { kind: 'portal'; tenantId: ID; personId: ID; activePatientId?: ID }
  | { kind: 'platform'; role: PlatformRole; userId: ID }

const KEY = 'qlinic.session'
const listeners = new Set<() => void>()
let current: DemoSession | null = read()

function read(): DemoSession | null {
  try { const v = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY); return v ? (JSON.parse(v) as DemoSession) : null } catch { return null }
}

/** Limpeza ao trocar organização/sair: cache em memória, rascunhos sensíveis, seleções e caches do SW do tenant anterior. */
export function clearTenantScopedState(prevTenantId?: ID) {
  try {
    const rm: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k?.startsWith('qlinic.draft.') || k?.startsWith('qlinic.sel.')) rm.push(k) }
    rm.forEach((k) => sessionStorage.removeItem(k))
    const rmL: string[] = []
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('qlinic.draft.')) rmL.push(k) }
    rmL.forEach((k) => localStorage.removeItem(k))
  } catch { /* */ }
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_TENANT', tenantId: prevTenantId })
  window.dispatchEvent(new CustomEvent('qlinic:tenant-switch', { detail: { prevTenantId } }))
}

export function setSession(s: DemoSession | null) {
  const prevTenant = current && 'tenantId' in current ? current.tenantId : undefined
  const nextTenant = s && 'tenantId' in s ? s.tenantId : undefined
  if (prevTenant !== nextTenant || !s) clearTenantScopedState(prevTenant)
  current = s
  evictOtherTenants(nextTenant ?? null)
  try {
    if (s) { localStorage.setItem(KEY, JSON.stringify(s)); sessionStorage.setItem(KEY, JSON.stringify(s)) }
    else { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY) }
  } catch { /* */ }
  listeners.forEach((l) => l())
}
export function getSession() { return current }
export function useSession(): DemoSession | null {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => current)
}

// ---------- Tenant context ----------
interface TenantCtx {
  org: Organization
  tenantId: ID
  units: Unit[]
  /** Unidades que o usuário pode ver. */
  allowedUnits: Unit[]
  unitId: ID | null
  unit: Unit | null
  setUnitId(id: ID | null): void
  user: StaffUser | null
  /** Usuário efetivo (considera "visualizar como"). */
  effectiveUser: StaffUser | null
  access: AccessContext
  can(resource: Resource, action?: Action, opts?: { unitId?: ID; ownerProfessionalId?: ID }): boolean
  scope(resource: Resource, action?: Action): 'all' | 'own' | false
  moduleOn(m: Organization['modules'][number]): boolean
  base: string
  viewingAs: boolean
}
const Ctx = createContext<TenantCtx | null>(null)

export function TenantProvider({ org, children }: { org: Organization; children: ReactNode }) {
  const session = useSession()
  const units = useCollection(org.id, 'units')
  const staff = useCollection(org.id, 'staff')
  const s = session?.kind === 'staff' && session.tenantId === org.id ? session : null
  const user = s ? staff.find((u) => u.id === s.userId) ?? null : null
  const effectiveUser = s?.viewAs ? staff.find((u) => u.id === s.viewAs!.userId) ?? user : user
  const access = useMemo<AccessContext>(() => ({ memberships: effectiveUser?.memberships ?? [], professionalId: effectiveUser?.professionalId }), [effectiveUser])
  const allowedIds = allowedUnitIds(access, units.map((u) => u.id))
  const allowedUnits = units.filter((u) => allowedIds.includes(u.id))
  const unitId = s?.unitId && allowedIds.includes(s.unitId) ? s.unitId : allowedUnits.length === 1 ? allowedUnits[0].id : s?.unitId === null ? null : allowedUnits[0]?.id ?? null
  const setUnitId = useCallback((id: ID | null) => { if (s) setSession({ ...s, unitId: id }) }, [s])
  const value: TenantCtx = {
    org, tenantId: org.id, units, allowedUnits, unitId, unit: units.find((u) => u.id === unitId) ?? null, setUnitId, user, effectiveUser, access,
    can: (resource, action = 'read', opts) => can(access, { resource, action, unitId: opts?.unitId ?? unitId ?? undefined, ownerProfessionalId: opts?.ownerProfessionalId }),
    scope: (resource, action = 'read') => scopeOf(access, resource, action, unitId ?? undefined),
    moduleOn: (m) => org.modules.includes(m),
    base: `/app/${org.slug}`,
    viewingAs: !!s?.viewAs && s.viewAs.userId !== s.userId,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTenant(): TenantCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTenant fora de TenantProvider')
  return v
}
export function useOptionalTenant(): TenantCtx | null {
  return useContext(Ctx)
}

/** Resolve organização pela URL (futuro: hostname verificado). Tenant desconhecido → null (erro seguro, nunca fallback). */
export function useOrgBySlug(slug: string | undefined): Organization | null {
  const orgs = usePlatformCollection('organizations')
  return orgs.find((o) => o.slug === slug) ?? null
}

// ---------- Portal ----------
interface PortalCtx { org: Organization; person: Person; base: string }
const PCtx = createContext<PortalCtx | null>(null)
export function PortalProvider({ org, person, children }: { org: Organization; person: Person; children: ReactNode }) {
  return <PCtx.Provider value={{ org, person, base: `/c/${org.slug}/portal` }}>{children}</PCtx.Provider>
}
export function usePortal() {
  const v = useContext(PCtx)
  if (!v) throw new Error('usePortal fora de PortalProvider')
  return v
}

/** Escuta troca de tenant para limpar estado local de componentes (drafts). */
export function useOnTenantSwitch(fn: () => void) {
  useEffect(() => {
    const h = () => fn()
    window.addEventListener('qlinic:tenant-switch', h)
    return () => window.removeEventListener('qlinic:tenant-switch', h)
  }, [fn])
}

/** Draft persistido por tenant+usuário (sessionStorage), limpo na troca de tenant. */
export function useDraft<T>(key: string, initial: T): [T, (v: T) => void, () => void] {
  const sess = useSession()
  const scope = sess && 'tenantId' in sess ? `${sess.tenantId}:${sess.kind === 'staff' ? sess.userId : sess.kind === 'portal' ? sess.personId : ''}` : 'anon'
  const full = `qlinic.draft.${scope}.${key}`
  const [v, setV] = useState<T>(() => {
    try { const s = sessionStorage.getItem(full); return s ? (JSON.parse(s) as T) : initial } catch { return initial }
  })
  const set = useCallback((nv: T) => { setV(nv); try { sessionStorage.setItem(full, JSON.stringify(nv)) } catch { /* */ } }, [full])
  const clear = useCallback(() => { setV(initial); try { sessionStorage.removeItem(full) } catch { /* */ } }, [full, initial])
  return [v, set, clear]
}

/** Ator atual para trilhas/auditoria ("by"). */
export function useActor(): { id: ID; name: string } {
  const t = useOptionalTenant()
  const s = useSession()
  if (t?.user) return { id: t.user.id, name: t.viewingAs ? `${t.user.name} (como ${t.effectiveUser?.name})` : t.user.name }
  if (s?.kind === 'portal') return { id: s.personId, name: 'Paciente/Responsável (portal)' }
  if (s?.kind === 'platform') return { id: s.userId, name: 'Equipe Qlinic' }
  return { id: 'anon', name: 'Visitante' }
}

export function platformRoleFromSession(s: DemoSession | null): PlatformRole | null {
  return s?.kind === 'platform' ? s.role : null
}

export function firstStaffUser(tenantId: ID, idSuffix: string) {
  return db.list(tenantId, 'staff').find((u) => u.id.endsWith(idSuffix))
}
export function listOrgs() { return platformDb.list('organizations') }
