// E2E do modo conectado contra o Supabase REAL (usuário/clínica temporários, removidos ao final).
// Build com VITE_SUPABASE_* (servidor :4175). Fluxo: login na UI → criar clínica → cadastrar paciente → recarregar → persistiu no banco.
import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from '../scripts/ops/env.mjs'

const E = loadEnv()
const base = process.argv[2] ?? 'http://localhost:4175'
const admin = createClient(E.VITE_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const email = `e2e+${Date.now()}@qlinic.test`, password = `E2e!${crypto.randomUUID()}`
const slug = `e2e-${Date.now().toString(36)}`
const out = []
const check = (n, ok, d = '') => { out.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`) }
let userId, orgId
// Nesta máquina o proxy do sistema bloqueia o Supabase no Chromium; conexão direta reproduz o navegador do usuário final.
const browser = await chromium.launch({ args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (/\[qlinic\]/.test(m.text())) console.log('  console:', m.text()) })
page.on('requestfailed', (r) => console.log('  requestfailed:', r.url().slice(0, 90), r.failure()?.errorText))
page.on('response', (r) => { if (r.url().includes('supabase.co') && r.status() >= 400) console.log('  http', r.status(), r.url().replace(/\?.*/, '').slice(0, 90)) })
try {
  const { data: cu } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'E2E Proprietária' } })
  userId = cu.user.id
  await page.goto(`${base}/auth/login`)
  await page.getByLabel('E-mail').fill(email)
  await page.locator('#login-pw').fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByRole('heading', { name: 'Onde você quer entrar?' }).waitFor({ timeout: 20000 })
  check('login real leva à escolha de ambiente', true)
  await page.getByLabel('Nome da clínica').fill('Clínica E2E Conectada')
  await page.getByLabel('Endereço na Qlinic').fill(slug)
  await page.getByRole('button', { name: 'Criar clínica' }).click()
  await page.waitForURL(`**/app/${slug}/onboarding`, { timeout: 30000 })
  check('clínica criada no servidor e onboarding aberto', true)
  const { data: org } = await admin.from('organizations').select('id').eq('slug', slug).single()
  orgId = org?.id
  check('organização existe no banco', !!orgId)
  await page.goto(`${base}/app/${slug}/pacientes`)
  await page.getByRole('button', { name: /Cadastrar paciente/ }).click()
  await page.getByLabel('Nome completo').fill('Paciente Real Teste')
  await page.getByRole('button', { name: 'Salvar cadastro' }).click()
  await page.waitForTimeout(2500)
  const { data: pats } = await admin.from('patients').select('id,name,tenant_id').eq('tenant_id', orgId)
  check('paciente gravado no Supabase pela UI', pats?.some((p) => p.name === 'Paciente Real Teste'), `${pats?.length ?? 0} paciente(s)`)
  await page.reload()
  await page.getByText('Paciente Real Teste').first().waitFor({ timeout: 20000 })
  check('após recarregar, dado vem do servidor', true)
  const ls = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('qlinic:v1:t:org_') && !/org_(sorriso|vitta|vet|lumiere|escuta|movimento|nutri)\b/.test(k)))
  check('dados reais não ficam no localStorage', ls.length === 0, ls.join(','))
  const banner = await page.locator('.demo-banner').count()
  check('sem faixa de demonstração no ambiente conectado', banner === 0)
  check('sem erros de console', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) { check('execução', false, e.message.split('\n')[0]) }
finally {
  await page.screenshot({ path: 'qa/tmp/connected-final.png' }).catch(() => {})
  await browser.close()
  if (orgId) await admin.rpc('purge_tenant', { p_tenant: orgId })
  else { const { data } = await admin.from('organizations').select('id').eq('slug', slug); for (const o of data ?? []) await admin.rpc('purge_tenant', { p_tenant: o.id }) }
  if (userId) await admin.auth.admin.deleteUser(userId)
}
const fails = out.filter((x) => !x).length
console.log(`\n${out.length - fails}/${out.length} verificações passaram`)
process.exit(fails ? 1 : 0)
