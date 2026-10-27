// Utilitários das Edge Functions: CORS restrito, cliente com JWT do chamador (RLS aplicada) e verificação de vínculo.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3'

const ALLOWED = (Deno.env.get('QLINIC_ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const ok = ALLOWED.includes(origin) || /^https:\/\/qlinic[a-z0-9-]*\.vercel\.app$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin)
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8' } })
}

/** Cliente que age COMO o usuário (RLS vale). Nunca usa service_role para ler dados do tenant. */
export function userClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
}

/** Cliente privilegiado — só para gravar registros de serviço (logs, webhooks), nunca para responder leituras do usuário. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
}

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg) } }

/** Exige usuário autenticado com permissão (via app.can) no tenant informado. */
export async function requireCan(req: Request, tenantId: string, resource: string, action = 'read') {
  const sb = userClient(req)
  const { data: u } = await sb.auth.getUser()
  if (!u.user) throw new HttpError(401, 'Sessão inválida.')
  const { data, error } = await sb.rpc('can_current', { p_tenant: tenantId, p_resource: resource, p_action: action })
  if (error || !data) throw new HttpError(403, 'Seu perfil não tem permissão para esta ação.')
  return { sb, user: u.user }
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
    if (req.method !== 'POST') return json(req, { error: 'Método não permitido.' }, 405)
    try { return await fn(req) } catch (e) {
      if (e instanceof HttpError) return json(req, { error: e.message }, e.status)
      console.error('[fn] erro', e instanceof Error ? e.message : 'desconhecido') // sem payload/PII no log
      return json(req, { error: 'Erro interno.' }, 500)
    }
  }
}
