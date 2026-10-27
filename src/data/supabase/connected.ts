// Ciclo de vida do modo conectado: login real (Supabase Auth) → vínculos → hidratação do tenant → mesma interface.
// Logout remove dados reais da memória e encerra a sessão no servidor.
import type { PlatformRole } from '@/domain/types'
import { setSession, getSession, type DemoSession } from '@/app/session'
import { supabase, supabaseConfigured, friendlyError } from './client'
import { enableRemoteSync, loadPlatform, loadTenant, unloadTenant } from './sync'

export interface MyContexts {
  platformRole: PlatformRole | null
  staff: { tenantId: string; staffId: string; slug: string; name: string; segment: string }[]
  portal: { tenantId: string; personId: string; slug: string; name: string }[]
}

let enabled = false
function ensureSync() { if (!enabled) { enableRemoteSync(); enabled = true } }

export async function signIn(email: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error) console.warn('[qlinic] login falhou:', error.status, error.code ?? error.name) // sem dados do usuário
  if (error?.name === 'AuthRetryableFetchError' || error?.status === 0) throw new Error('Sem conexão com o servidor de autenticação. Verifique a internet e tente novamente.')
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message === 'Email not confirmed' ? 'Confirme seu e-mail antes de entrar.' : 'Não foi possível entrar.')
}
export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase().auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { name }, emailRedirectTo: `${location.origin}/auth/verificar` } })
  if (error) throw new Error(error.message.includes('registered') ? 'Este e-mail já tem conta. Entre ou recupere a senha.' : 'Não foi possível criar a conta.')
  return { needsConfirmation: !data.session }
}
/** Mensagem neutra: não revela se o e-mail existe. */
export async function requestPasswordReset(email: string) {
  await supabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${location.origin}/auth/recuperar?nova=1` })
}
export async function updatePassword(password: string) {
  const { error } = await supabase().auth.updateUser({ password })
  if (error) throw new Error('Não foi possível alterar a senha. O link pode ter expirado.')
}

export async function myContexts(): Promise<MyContexts> {
  const sb = supabase()
  await sb.rpc('claim_invites') // vincula convites pendentes ao e-mail confirmado
  const { data, error } = await sb.rpc('my_contexts')
  if (error) throw new Error(friendlyError(error))
  return data as MyContexts
}

export async function currentUserId(): Promise<string | null> {
  if (!supabaseConfigured) return null
  const { data } = await supabase().auth.getUser()
  return data.user?.id ?? null
}

/** Entra num contexto (equipe, portal ou plataforma) carregando os dados do servidor. */
export async function enterContext(ctx: { kind: 'staff'; tenantId: string; staffId: string } | { kind: 'portal'; tenantId: string; personId: string } | { kind: 'platform'; role: PlatformRole }) {
  ensureSync()
  const uid = await currentUserId()
  if (!uid) throw new Error('Sessão expirada. Entre novamente.')
  const prev = getSession()
  if (prev?.remote && 'tenantId' in prev && (!('tenantId' in ctx) || prev.tenantId !== ctx.tenantId)) unloadTenant(prev.tenantId)
  await loadPlatform(ctx.kind === 'platform')
  let s: DemoSession
  if (ctx.kind === 'platform') s = { kind: 'platform', role: ctx.role, userId: uid, remote: true }
  else {
    await loadTenant(ctx.tenantId)
    s = ctx.kind === 'staff' ? { kind: 'staff', tenantId: ctx.tenantId, userId: ctx.staffId, unitId: null, remote: true } : { kind: 'portal', tenantId: ctx.tenantId, personId: ctx.personId, remote: true }
  }
  setSession(s)
  return s
}

/** Recarregamento de página com sessão conectada: re-hidrata antes de renderizar o ambiente. */
export async function restoreConnected(): Promise<boolean> {
  const s = getSession()
  if (!s?.remote || !supabaseConfigured) return false
  const uid = await currentUserId()
  if (!uid) { setSession(null); return false }
  ensureSync()
  await loadPlatform(s.kind === 'platform')
  if ('tenantId' in s) await loadTenant(s.tenantId)
  return true
}

export async function signOut() {
  const s = getSession()
  if (s?.remote && 'tenantId' in s) unloadTenant(s.tenantId)
  setSession(null)
  if (supabaseConfigured) await supabase().auth.signOut()
  navigator.serviceWorker?.controller?.postMessage({ type: 'LOGOUT' })
}

export async function createOrganization(name: string, segment: string, slug: string, primary: string): Promise<string> {
  const { data, error } = await supabase().rpc('create_organization', { p_name: name, p_segment: segment, p_slug: slug, p_primary: primary })
  if (error) throw new Error(friendlyError(error))
  return data as string
}
