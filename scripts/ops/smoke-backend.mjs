// Smoke de ponta a ponta contra o Supabase real, com usuário temporário (criado e REMOVIDO ao final):
// signup → criar clínica (RPC) → ler/escrever com RLS → página pública anônima → agendamento público → IA (Gemini) → WhatsApp status.
import { createClient } from '@supabase/supabase-js'
import { loadEnv, api } from './env.mjs'

const E = loadEnv()
const URL = E.VITE_SUPABASE_URL
const admin = createClient(URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = createClient(URL, E.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`) }
const email = `smoke+${Date.now()}@qlinic.test`
const password = `Smk!${crypto.randomUUID()}`
const slug = `smoke-${Date.now().toString(36)}`
let userId, orgId

try {
  const { data: cu, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Smoke Teste' } })
  if (ce) throw ce
  userId = cu.user.id
  const user = createClient(URL, E.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error: le } = await user.auth.signInWithPassword({ email, password })
  check('login com Supabase Auth', !le, le?.message)

  const { data: prof } = await user.from('profiles').select('id,email').single()
  check('perfil criado por trigger', prof?.email === email)

  const { data: oid, error: oe } = await user.rpc('create_organization', { p_name: 'Clínica Smoke', p_segment: 'odontologia', p_slug: slug, p_primary: '#2563EB' })
  orgId = oid
  check('create_organization (RPC transacional)', !oe && !!oid, oe?.message)

  const { data: ctx } = await user.rpc('my_contexts')
  check('my_contexts traz a equipe da clínica', ctx?.staff?.some((s) => s.tenantId === oid))

  const { data: units } = await user.from('units').select('id').eq('tenant_id', oid)
  const unitId = units?.[0]?.id
  check('proprietário lê unidade (RLS)', !!unitId)

  const now = new Date().toISOString()
  const pro = { id: 'pro_smoke', tenantId: oid, createdAt: now, name: 'Dra. Smoke', council: 'CRO (teste)', specialty: 'Clínica geral', unitIds: [unitId], color: '#2563EB', schedule: [1, 2, 3, 4, 5].map((w) => ({ unitId, weekday: w, start: 0, end: 1439 })), absences: [], active: true }
  const svc = { id: 'svc_smoke', tenantId: oid, createdAt: now, name: 'Avaliação', category: 'Consulta', durationMin: 30, bufferMin: 0, priceCents: 15000, resourceKinds: [], publicBookable: true, active: true, kit: [] }
  const e1 = (await user.from('professionals').insert({ tenant_id: oid, id: pro.id, name: pro.name, data: pro })).error
  const e2 = (await user.from('services').insert({ tenant_id: oid, id: svc.id, name: svc.name, public_bookable: true, price_cents: 15000, data: svc })).error
  check('proprietário cadastra profissional e serviço', !e1 && !e2, (e1 ?? e2)?.message)

  // outro usuário (sem vínculo) não vê nada da clínica
  const { data: cu2 } = await admin.auth.admin.createUser({ email: `smoke2+${Date.now()}@qlinic.test`, password, email_confirm: true })
  const intruder = createClient(URL, E.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  await intruder.auth.signInWithPassword({ email: cu2.user.email, password })
  const { data: seen } = await intruder.from('services').select('id').eq('tenant_id', oid)
  check('usuário sem vínculo não lê dados da clínica', (seen ?? []).length === 0)
  const { error: ie } = await intruder.from('services').insert({ tenant_id: oid, id: 'x', name: 'x', data: {} })
  check('usuário sem vínculo não grava na clínica', !!ie)
  await admin.auth.admin.deleteUser(cu2.user.id)

  // página pública + agendamento anônimo
  await user.from('organizations').update({ public_enabled: true }).eq('id', oid)
  const { data: pub } = await anon.rpc('public_clinic', { p_slug: slug })
  check('página pública (anônimo) com serviço agendável', pub?.services?.length === 1)
  const start = new Date(Date.now() + 3 * 86400000); start.setUTCHours(13, 0, 0, 0)
  const { data: bk, error: be } = await anon.rpc('public_book', { p_slug: slug, p_service: 'svc_smoke', p_professional: 'pro_smoke', p_unit: unitId, p_start: start.toISOString(), p_name: 'Paciente Smoke', p_phone: '(00) 90000-0000', p_email: '', p_consent: true })
  check('agendamento público cria solicitação', !be && !!bk?.appointmentId, be?.message)
  const { error: be2 } = await anon.rpc('public_book', { p_slug: slug, p_service: 'svc_smoke', p_professional: 'pro_smoke', p_unit: unitId, p_start: start.toISOString(), p_name: 'Outra Pessoa', p_phone: '(00) 90000-1111', p_email: '', p_consent: true })
  check('mesmo horário recusado (constraint de exclusão)', !!be2 && /ocupado/.test(be2.message), be2?.message)
  const { data: appts } = await user.from('appointments').select('id,status').eq('tenant_id', oid)
  check('solicitação aparece para a equipe', appts?.length === 1 && appts[0].status === 'solicitada')
  const { data: anonPat } = await anon.from('patients').select('id')
  check('anônimo não lê pacientes', (anonPat ?? []).length === 0)

  // IA (Gemini via Edge Function)
  const ai = await user.functions.invoke('ai-assistant', { body: { tenantId: oid, message: 'Quais serviços vocês têm e como agendo?', context: { clinicName: 'Clínica Smoke', services: ['Avaliação'] } } })
  check('IA responde via servidor (Gemini)', !ai.error && typeof ai.data?.reply === 'string' && ai.data.reply.length > 5, ai.error?.message ?? ai.data?.model)
  const urg = await user.functions.invoke('ai-assistant', { body: { tenantId: oid, message: 'estou com dor no peito forte agora' } })
  check('IA: urgência encaminhada sem modelo', urg.data?.urgent === true && urg.data?.model === null)
  const noauth = await anon.functions.invoke('ai-assistant', { body: { tenantId: oid, message: 'oi' } })
  check('IA exige login', !!noauth.error)

  // WhatsApp (Evolution via Edge Function)
  const wa = await user.functions.invoke('whatsapp', { body: { tenantId: oid, action: 'status' } })
  check('WhatsApp status via servidor (Evolution)', !wa.error && typeof wa.data?.status === 'string', wa.error?.message ?? wa.data?.status)
} catch (e) {
  check('execução', false, e.message)
} finally {
  if (orgId) { const r = await admin.rpc('purge_tenant', { p_tenant: orgId }); if (r.error) console.log('purge erro:', r.error.message) }
  if (userId) await admin.auth.admin.deleteUser(userId)
  const left = await api(`https://api.supabase.com/v1/projects/${E.SUPABASE_PROJECT_ID}/database/query`, { token: E.SUPABASE_ACCESS_TOKEN, method: 'POST', body: { query: "select (select count(*) from public.organizations where slug like 'smoke-%') orgs, (select count(*) from auth.users where email like '%@qlinic.test') users" } })
  console.log('resíduos:', JSON.stringify(left[0]))
}
const fail = results.filter((r) => !r.ok).length
console.log(`\n${results.length - fail}/${results.length} verificações passaram`)
process.exit(fail ? 1 : 0)
