// Configura o Supabase Auth para o deploy e cria o primeiro proprietário da plataforma (Super Admin).
// Uso: node scripts/ops/setup-auth.mjs <url-producao> [email-owner]
// - site_url = URL de produção; redirects permitidos: produção, previews *.vercel.app do projeto e localhost.
// - Owner: usa usuário existente com o e-mail ou cria convite (link de definição de senha enviado pelo Supabase).
import { createClient } from '@supabase/supabase-js'
import { loadEnv, api } from './env.mjs'

const E = loadEnv()
const site = (process.argv[2] ?? E.QLINIC_SITE_URL ?? '').replace(/\/$/, '')
const ownerEmail = (process.argv[3] ?? E.QLINIC_OWNER_EMAIL ?? 'qlinic.system@gmail.com').toLowerCase()
if (!/^https:\/\//.test(site)) { console.error('Informe a URL https de produção.'); process.exit(1) }
const ref = E.SUPABASE_PROJECT_ID

await api(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  token: E.SUPABASE_ACCESS_TOKEN, method: 'PATCH',
  body: {
    site_url: site,
    uri_allow_list: [`${site}/**`, 'https://qlinic-*-codigobasejgs-projects.vercel.app/**', 'https://qlinic-git-*-codigobasejgs-projects.vercel.app/**', 'http://localhost:5173/**', 'http://localhost:4173/**'].join(','),
    mfa_totp_enroll_enabled: true, mfa_totp_verify_enabled: true,
    password_min_length: 10, security_update_password_require_reauthentication: true,
    external_email_enabled: true, mailer_secure_email_change_enabled: true,
  },
})
console.log('auth: site_url e redirects configurados')

const admin = createClient(E.VITE_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
let user = null
for (let page = 1; page < 20 && !user; page++) {
  const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
  user = data.users.find((u) => u.email?.toLowerCase() === ownerEmail) ?? null
  if (data.users.length < 200) break
}
if (!user) {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(ownerEmail, { redirectTo: `${site}/auth/recuperar?nova=1`, data: { name: 'Proprietário Qlinic' } })
  if (error) { console.error('convite falhou:', error.message); process.exit(1) }
  user = data.user
  console.log(`convite enviado para ${ownerEmail.replace(/(.{2}).*@/, '$1***@')} (definir senha pelo link do e-mail)`)
} else console.log('usuário owner já existe')
const { error: pe } = await admin.from('platform_admins').upsert({ user_id: user.id, role: 'platform_owner' })
if (pe) { console.error('platform_admins:', pe.message); process.exit(1) }
console.log('Super Admin: platform_owner atribuído')
