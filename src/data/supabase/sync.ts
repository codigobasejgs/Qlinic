// Modo conectado: hidrata o store a partir do Supabase e envia cada escrita (diff) ao banco.
// Escritas são serializadas por tenant; em erro de permissão/validação o estado local é revertido para o do servidor.
import type { ID, Organization } from '@/domain/types'
import { hydrate, hydratePlatform, setPlatformRemoteSink, setRemoteSink, db, evictTenant, type TenantCollectionName } from '@/data/store'
import { COLLECTION_RESOURCES, DEDICATED, genericColumns, PLATFORM_COLLECTIONS } from './collections'
import { friendlyError, supabase } from './client'

type Doc = Record<string, unknown> & { id: string }

const remoteTenants = new Set<ID>()
const remoteOrgIds = new Set<ID>()
const queues = new Map<ID, Promise<void>>()
const errorListeners = new Set<(msg: string) => void>()
export function onSyncError(fn: (msg: string) => void) { errorListeners.add(fn); return () => errorListeners.delete(fn) }
const pending = { n: 0, listeners: new Set<() => void>() }
export function pendingWrites() { return pending.n }
export function onPendingChange(fn: () => void) { pending.listeners.add(fn); return () => pending.listeners.delete(fn) }
const bump = (d: number) => { pending.n += d; pending.listeners.forEach((l) => l()) }

function row(tenantId: ID, collection: string, d: Doc) {
  const t = DEDICATED[collection as TenantCollectionName]
  if (t) return { table: t.table, row: { tenant_id: tenantId, id: d.id, ...t.columns(d), data: d } }
  if (!(collection in COLLECTION_RESOURCES)) throw new Error(`Coleção sem destino no servidor: ${collection}`)
  return { table: 'tenant_documents', row: { tenant_id: tenantId, collection, id: d.id, ...genericColumns(d), data: d } }
}

async function pushChanges(tenantId: ID, collection: string, upserts: Doc[], deletes: ID[]) {
  const sb = supabase()
  if (upserts.length) {
    const rows = upserts.map((d) => row(tenantId, collection, d))
    const { table } = rows[0]
    const onConflict = table === 'tenant_documents' ? 'tenant_id,collection,id' : 'tenant_id,id'
    const { error } = await sb.from(table).upsert(rows.map((r) => r.row), { onConflict })
    if (error) throw error
  }
  if (deletes.length) {
    const t = DEDICATED[collection as TenantCollectionName]
    let q = sb.from(t ? t.table : 'tenant_documents').delete().eq('tenant_id', tenantId).in('id', deletes)
    if (!t) q = q.eq('collection', collection)
    const { error } = await q
    if (error) throw error
  }
}

async function fetchCollection(tenantId: ID, collection: string): Promise<Doc[]> {
  const sb = supabase()
  const t = DEDICATED[collection as TenantCollectionName]
  const all: Doc[] = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(t ? t.table : 'tenant_documents').select('data').eq('tenant_id', tenantId).range(from, from + 999)
    if (!t) q = q.eq('collection', collection)
    const { data, error } = await q
    if (error) throw error
    all.push(...(data ?? []).map((r) => r.data as Doc))
    if (!data || data.length < 1000) break
  }
  return all
}

/** Todas as coleções conhecidas (dedicadas + genéricas). */
export function allCollections(): string[] {
  return [...Object.keys(DEDICATED), ...Object.keys(COLLECTION_RESOURCES)]
}

/** Hidrata um tenant conectado (todas as coleções, em paralelo). */
export async function loadTenant(tenantId: ID) {
  remoteTenants.add(tenantId)
  const cols = allCollections()
  const results = await Promise.all(cols.map((c) => fetchCollection(tenantId, c).then((d) => [c, d] as const)))
  for (const [c, d] of results) hydrate(tenantId, c, d)
}

export function unloadTenant(tenantId: ID) {
  remoteTenants.delete(tenantId)
  evictTenant(tenantId)
}

/** Organizações e coleções de plataforma visíveis ao usuário (RLS decide). */
export async function loadPlatform(isPlatformAdmin: boolean) {
  const sb = supabase()
  const { data, error } = await sb.from('organizations').select('data, id, slug, name, segment, status, public_enabled')
  if (error) throw error
  const orgs = (data ?? []).map((r) => ({ ...(r.data as Organization), id: r.id, slug: r.slug, name: r.name, segment: r.segment, status: r.status, demo: false, sandbox: false })) as unknown as Doc[]
  remoteOrgIds.clear()
  orgs.forEach((o) => remoteOrgIds.add(o.id))
  hydratePlatform('organizations', orgs)
  const visible = isPlatformAdmin ? PLATFORM_COLLECTIONS : (['plans', 'subscriptions', 'saasInvoices', 'usage', 'domains', 'tickets'] as const)
  for (const c of visible) {
    const { data: rows, error: e2 } = await sb.from('platform_documents').select('data').eq('collection', c)
    if (e2) throw e2
    if (rows?.length) hydratePlatform(c, rows.map((r) => r.data as Doc))
  }
}

function enqueue(tenantId: ID, job: () => Promise<void>, revert: () => Promise<void>) {
  bump(1)
  const prev = queues.get(tenantId) ?? Promise.resolve()
  const next = prev.then(async () => {
    try { await job() } catch (e) {
      const msg = friendlyError(e as { code?: string; message?: string })
      errorListeners.forEach((l) => l(msg))
      try { await revert() } catch { /* offline: mantém local até nova tentativa */ }
    } finally { bump(-1) }
  })
  queues.set(tenantId, next)
}

const PLATFORM_TABLE_FIELDS = (o: Doc) => ({ slug: o.slug, name: o.name, segment: o.segment, status: o.status, plan_id: o.planId ?? 'plan_pro', public_enabled: !!(o.publicPage as { enabled?: boolean } | undefined)?.enabled })

/** Liga o store ao Supabase. */
export function enableRemoteSync() {
  setRemoteSink({
    owns: (t) => remoteTenants.has(t),
    write: (tenantId, collection, upserts, deletes) => {
      enqueue(tenantId, () => pushChanges(tenantId, collection, upserts as Doc[], deletes), async () => {
        hydrate(tenantId, collection, await fetchCollection(tenantId, collection))
      })
    },
  })
  setPlatformRemoteSink({
    isRemote: (c, x) => (c === 'organizations' ? remoteOrgIds.has(x.id) : remoteOrgIds.has(String((x as Doc).tenantId ?? '')) || c === 'plans'),
    filter: (c, upserts, deletes) => {
      const mine = (x: { id: string }) => (c === 'organizations' ? remoteOrgIds.has(x.id) : remoteOrgIds.has(String((x as Doc).tenantId ?? '')))
      return { upserts: upserts.filter(mine), deletes: c === 'organizations' ? deletes.filter((id) => remoteOrgIds.has(id)) : [] }
    },
    write: (c, upserts) => {
      enqueue('__platform', async () => {
        const sb = supabase()
        if (c === 'organizations') {
          for (const o of upserts as Doc[]) {
            const { error } = await sb.from('organizations').update({ ...PLATFORM_TABLE_FIELDS(o), data: o }).eq('id', o.id)
            if (error) throw error
          }
        } else {
          const { error } = await sb.from('platform_documents').upsert((upserts as Doc[]).map((d) => ({ collection: c, id: d.id, tenant_id: d.tenantId ?? null, data: d })), { onConflict: 'collection,id' })
          if (error) throw error
        }
      }, async () => { await loadPlatform(false) })
    },
  })
}

/** Leitura direta (ex.: verificação após escrita em testes). */
export function localList(tenantId: ID, c: TenantCollectionName) { return db.list(tenantId, c) }
