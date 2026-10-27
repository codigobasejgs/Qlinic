// Persistência DEMONSTRATIVA (somente dados fictícios).
// - Namespace por tenant: qlinic:v{SCHEMA}:t:{tenantId}:{collection}; plataforma: qlinic:v{SCHEMA}:platform:{collection}
// - Seed lazy e determinístico por coleção (registerSeed). Reset de demo apaga o prefixo inteiro.
// - Isolamento por localStorage NÃO é segurança: é apenas organização da demo. Segurança real = servidor + RLS.
// Componentes NÃO usam isto diretamente: usam repositórios (src/data/repositories.ts) ou hooks useCollection.
import { useSyncExternalStore } from 'react'
import type {
  Appointment, AuditEvent, Charge, ClinicDocument, ClinicalRecord, FileAsset, ID, OutboxMessage, Patient, PatientLink, Person,
  Professional, Proposal, Resource, Service, StaffUser, TreatmentItem, Unit, WaitlistEntry,
} from '@/domain/types'

export const SCHEMA_VERSION = 1
const PREFIX = `qlinic:v${SCHEMA_VERSION}:`

/** Coleções por tenant. Módulos podem AUMENTAR esta interface via declaration merging:
 *  declare module '@/data/store' { interface TenantCollections { minhaColecao: MeuTipo[] } } */
export interface TenantCollections {
  units: Unit[]
  resources: Resource[]
  professionals: Professional[]
  services: Service[]
  staff: StaffUser[]
  persons: Person[]
  patients: Patient[]
  links: PatientLink[]
  appointments: Appointment[]
  waitlist: WaitlistEntry[]
  records: ClinicalRecord[]
  documents: ClinicDocument[]
  files: FileAsset[]
  treatmentItems: TreatmentItem[]
  proposals: Proposal[]
  charges: Charge[]
  outbox: OutboxMessage[]
  audit: AuditEvent[]
}

/** Coleções da plataforma (Super Admin). Também aumentável por declaration merging. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PlatformCollections {}

export type TenantCollectionName = keyof TenantCollections
export type PlatformCollectionName = keyof PlatformCollections

type AnyItem = { id: ID }
export interface SeedContext {
  tenantId: ID
  get<K extends TenantCollectionName>(name: K): TenantCollections[K]
}
type TenantSeed = (ctx: SeedContext) => AnyItem[]
type PlatformSeed = () => AnyItem[]

const tenantSeeds = new Map<string, TenantSeed>()
const platformSeeds = new Map<string, PlatformSeed>()
/** Política: quais tenants recebem dados de seed (demais começam vazios). */
let seedPolicy: (tenantId: ID) => boolean = () => true
export function setSeedPolicy(fn: (tenantId: ID) => boolean) { seedPolicy = fn }

export function registerSeed<K extends TenantCollectionName>(name: K, fn: (ctx: SeedContext) => TenantCollections[K]) {
  tenantSeeds.set(name, fn as unknown as TenantSeed)
}
export function registerPlatformSeed<K extends PlatformCollectionName>(name: K, fn: () => PlatformCollections[K]) {
  platformSeeds.set(name as string, fn as unknown as PlatformSeed)
}

// ---------- cache em memória + assinantes ----------
const cache = new Map<string, AnyItem[]>()
const listeners = new Map<string, Set<() => void>>()
let globalVersion = 0
const globalListeners = new Set<() => void>()

function tKey(tenantId: ID, name: string) { return `${PREFIX}t:${tenantId}:${name}` }
function pKey(name: string) { return `${PREFIX}platform:${name}` }

function readLS(key: string): AnyItem[] | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as AnyItem[]) : null
  } catch {
    return null
  }
}
function writeLS(key: string, value: AnyItem[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    // Quota excedida: mantém em memória e avisa. Não perde a ação do usuário na sessão.
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return // testes (node)
    console.warn('[qlinic] armazenamento local cheio; dados mantidos só nesta sessão', e)
    window.dispatchEvent(new CustomEvent('qlinic:storage-full'))
  }
}

function emit(key: string) {
  globalVersion++
  listeners.get(key)?.forEach((l) => l())
  globalListeners.forEach((l) => l())
}

// ---------- Sincronização remota (modo conectado) ----------
// Quando ativo, o store é cache local de um tenant hidratado do servidor e cada escrita gera um diff enviado ao backend.
// Tenants "remotos" nunca recebem seed e nunca persistem em localStorage (dados reais não ficam no navegador).
export interface RemoteSink {
  /** O tenant é servido pelo backend? */
  owns(tenantId: ID): boolean
  /** Chamado a cada escrita com upserts/deletes da coleção. Erros são tratados pelo sink (fila + aviso). */
  write(tenantId: ID, collection: string, upserts: AnyItem[], deletes: ID[]): void
}
let remote: RemoteSink | null = null
export function setRemoteSink(r: RemoteSink | null) { remote = r }

/** Coleções de plataforma: registros remotos (organizações reais, assinaturas…) convivem com os demo locais. */
export interface PlatformRemoteSink {
  isRemote(collection: string, item: AnyItem): boolean
  /** Separa, das mudanças, as que pertencem ao servidor. */
  filter(collection: string, upserts: AnyItem[], deletes: ID[]): { upserts: AnyItem[]; deletes: ID[] }
  write(collection: string, upserts: AnyItem[], deletes: ID[]): void
}
let platformRemote: PlatformRemoteSink | null = null
export function setPlatformRemoteSink(r: PlatformRemoteSink | null) { platformRemote = r }
/** Mescla registros remotos na coleção de plataforma (substitui os remotos anteriores, mantém os locais). */
export function hydratePlatform(name: string, remoteItems: AnyItem[]) {
  const key = pKey(name)
  const local = (cache.get(key) ?? loadPlatform(name)).filter((x) => !platformRemote?.isRemote(name, x))
  const ids = new Set(remoteItems.map((x) => x.id))
  cache.set(key, [...local.filter((x) => !ids.has(x.id)), ...remoteItems])
  emit(key)
}
/** Carrega coleção vinda do servidor sem gerar escrita de volta. */
export function hydrate(tenantId: ID, name: string, items: AnyItem[]) {
  const key = tKey(tenantId, name)
  cache.set(key, items)
  emit(key)
}
function diff(prev: AnyItem[], next: AnyItem[]) {
  const before = new Map(prev.map((x) => [x.id, x]))
  const upserts = next.filter((x) => before.get(x.id) !== x)
  const keep = new Set(next.map((x) => x.id))
  const deletes = prev.filter((x) => !keep.has(x.id)).map((x) => x.id)
  return { upserts, deletes }
}

function loadTenant(tenantId: ID, name: string): AnyItem[] {
  const key = tKey(tenantId, name)
  const hit = cache.get(key)
  if (hit) return hit
  if (remote?.owns(tenantId)) { const empty: AnyItem[] = []; cache.set(key, empty); return empty } // aguardando hidratação
  let data = readLS(key)
  if (!data) {
    const seed = tenantSeeds.get(name)
    const ctx: SeedContext = { tenantId, get: (n) => loadTenant(tenantId, n) as never }
    data = seed && seedPolicy(tenantId) ? seed(ctx) : []
    writeLS(key, data)
  }
  cache.set(key, data)
  return data
}
function loadPlatform(name: string): AnyItem[] {
  const key = pKey(name)
  const hit = cache.get(key)
  if (hit) return hit
  let data = readLS(key)
  if (!data) {
    data = platformSeeds.get(name)?.() ?? []
    writeLS(key, data)
  }
  cache.set(key, data)
  return data
}

// ---------- API imperativa (usada pelos repositórios) ----------
export const db = {
  list<K extends TenantCollectionName>(tenantId: ID, name: K): TenantCollections[K] {
    return loadTenant(tenantId, name as string) as TenantCollections[K]
  },
  get<K extends TenantCollectionName>(tenantId: ID, name: K, id: ID): TenantCollections[K][number] | undefined {
    return (loadTenant(tenantId, name as string) as AnyItem[]).find((x) => x.id === id) as TenantCollections[K][number] | undefined
  },
  set<K extends TenantCollectionName>(tenantId: ID, name: K, items: TenantCollections[K]) {
    const key = tKey(tenantId, name as string)
    const arr = [...(items as AnyItem[])]
    if (remote?.owns(tenantId)) {
      const { upserts, deletes } = diff(cache.get(key) ?? [], arr)
      cache.set(key, arr)
      if (upserts.length || deletes.length) remote.write(tenantId, name as string, upserts, deletes)
    } else {
      cache.set(key, arr)
      writeLS(key, arr)
    }
    emit(key)
  },
  insert<K extends TenantCollectionName>(tenantId: ID, name: K, item: TenantCollections[K][number]) {
    const list = loadTenant(tenantId, name as string)
    db.set(tenantId, name, [...list, item as AnyItem] as TenantCollections[K])
    return item
  },
  update<K extends TenantCollectionName>(tenantId: ID, name: K, id: ID, patch: Partial<TenantCollections[K][number]> | ((prev: TenantCollections[K][number]) => TenantCollections[K][number])) {
    const list = loadTenant(tenantId, name as string)
    let updated: AnyItem | undefined
    const next = list.map((x) => {
      if (x.id !== id) return x
      updated = typeof patch === 'function' ? (patch as unknown as (p: AnyItem) => AnyItem)(x) : { ...x, ...(patch as object) }
      if ('updatedAt' in updated || 'createdAt' in updated) (updated as { updatedAt?: string }).updatedAt = new Date().toISOString()
      return updated
    })
    if (!updated) throw new Error(`Registro não encontrado: ${String(name)}/${id}`)
    db.set(tenantId, name, next as TenantCollections[K])
    return updated as TenantCollections[K][number]
  },
  remove<K extends TenantCollectionName>(tenantId: ID, name: K, id: ID) {
    const list = loadTenant(tenantId, name as string)
    db.set(tenantId, name, list.filter((x) => x.id !== id) as TenantCollections[K])
  },
}

export const platformDb = {
  list<K extends PlatformCollectionName>(name: K): PlatformCollections[K] {
    return loadPlatform(name as string) as PlatformCollections[K]
  },
  set<K extends PlatformCollectionName>(name: K, items: PlatformCollections[K]) {
    const key = pKey(name as string)
    const arr = [...(items as unknown as AnyItem[])]
    if (platformRemote) {
      const { upserts, deletes } = diff(cache.get(key) ?? [], arr)
      const r = platformRemote.filter(name as string, upserts, deletes)
      if (r.upserts.length || r.deletes.length) platformRemote.write(name as string, r.upserts, r.deletes)
    }
    cache.set(key, arr)
    // registros vindos do servidor não vão para o localStorage
    writeLS(key, platformRemote ? arr.filter((x) => !platformRemote!.isRemote(name as string, x)) : arr)
    emit(key)
  },
  insert<K extends PlatformCollectionName>(name: K, item: PlatformCollections[K] extends (infer T)[] ? T : never) {
    platformDb.set(name, [...(loadPlatform(name as string) as AnyItem[]), item as unknown as AnyItem] as unknown as PlatformCollections[K])
    return item
  },
  update<K extends PlatformCollectionName>(name: K, id: ID, patch: object | ((prev: never) => object)) {
    const list = loadPlatform(name as string)
    let found = false
    const next = list.map((x) => {
      if (x.id !== id) return x
      found = true
      return typeof patch === 'function' ? (patch as (p: AnyItem) => AnyItem)(x) : { ...x, ...patch }
    })
    if (!found) throw new Error(`Registro não encontrado: ${String(name)}/${id}`)
    platformDb.set(name, next as unknown as PlatformCollections[K])
  },
  remove<K extends PlatformCollectionName>(name: K, id: ID) {
    platformDb.set(name, (loadPlatform(name as string) as AnyItem[]).filter((x) => x.id !== id) as unknown as PlatformCollections[K])
  },
}

// ---------- Hooks ----------
function subscribeKey(key: string) {
  return (cb: () => void) => {
    let set = listeners.get(key)
    if (!set) listeners.set(key, (set = new Set()))
    set.add(cb)
    return () => set!.delete(cb)
  }
}

export function useCollection<K extends TenantCollectionName>(tenantId: ID, name: K): TenantCollections[K] {
  const key = tKey(tenantId, name as string)
  return useSyncExternalStore(subscribeKey(key), () => db.list(tenantId, name))
}
export function usePlatformCollection<K extends PlatformCollectionName>(name: K): PlatformCollections[K] {
  const key = pKey(name as string)
  return useSyncExternalStore(subscribeKey(key), () => platformDb.list(name))
}
/** Re-render em qualquer mudança (para métricas agregadas). Use com moderação. */
export function useStoreVersion(): number {
  return useSyncExternalStore((cb) => { globalListeners.add(cb); return () => globalListeners.delete(cb) }, () => globalVersion)
}

// Sincronização entre abas (ex.: recepção e painel de chamada abertos em janelas diferentes).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key?.startsWith(PREFIX)) return
    cache.delete(e.key)
    emit(e.key)
  })
}

// ---------- Ciclo de vida ----------
/** Descarta do cache em memória tudo que não pertence ao tenant ativo (troca de organização). */
export function evictOtherTenants(activeTenantId: ID | null) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${PREFIX}t:`) && (!activeTenantId || !key.startsWith(`${PREFIX}t:${activeTenantId}:`))) cache.delete(key)
  }
}

/** Descarta do cache tudo de um tenant (logout do modo conectado: dados reais saem da memória). */
export function evictTenant(tenantId: ID) {
  for (const key of [...cache.keys()]) if (key.startsWith(`${PREFIX}t:${tenantId}:`)) { cache.delete(key); emit(key) }
}

/** Restaura TODA a demonstração (requer confirmação na UI). */
export function resetDemo() {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('qlinic')) keys.push(k)
  }
  keys.forEach((k) => localStorage.removeItem(k))
  try { sessionStorage.clear() } catch { /* */ }
  cache.clear()
  globalVersion++
  globalListeners.forEach((l) => l())
}

/** Migração de schema: versões antigas são descartadas (dados fictícios) — documentado. */
export function migrateIfNeeded() {
  try {
    const stale: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('qlinic:v') && !k.startsWith(PREFIX)) stale.push(k)
    }
    stale.forEach((k) => localStorage.removeItem(k))
  } catch { /* sem storage */ }
}
