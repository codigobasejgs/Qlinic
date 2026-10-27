// Cliente Supabase do navegador. Só usa a chave PUBLICÁVEL (segurança vem da RLS). service_role nunca chega aqui.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = !!(url && key)

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  if (!supabaseConfigured) throw new Error('Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  return (client ??= createClient(url!, key!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'qlinic.auth' },
  }))
}

/** Converte erro do PostgREST/Postgres em mensagem para o usuário (sem detalhes internos). */
export function friendlyError(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return 'Erro desconhecido.'
  if (e.code === 'P0001') return e.message ?? 'Operação recusada.'
  if (e.code === '23P01') return 'Horário ou recurso já ocupado por outro atendimento.'
  if (e.code === '42501' || /row-level security/i.test(e.message ?? '')) return 'Seu perfil não tem permissão para esta ação.'
  if (e.code === '23505') return 'Registro duplicado.'
  if (e.code === '23503') return 'Referência inválida (registro relacionado não existe).'
  if (/fetch|network/i.test(e.message ?? '')) return 'Sem conexão com o servidor. Tente novamente.'
  return 'Não foi possível salvar no servidor.'
}
