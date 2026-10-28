// E2E conectado (Supabase REAL) da contratação em /planos: usuário logado não vê “em preparação”,
// proprietário pré-preenchido, solicitação gravada com preço do servidor, nada assinado; recepção bloqueada. Limpa ao final.
// Uso: build com VITE_SUPABASE_* servida em :4175 → node qa/connected-plans-e2e.mjs
import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from '../scripts/ops/env.mjs'

const E = loadEnv()
const base = process.argv[2] ?? 'http://localhost:4175'
const admin = createClient(E.VITE_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const stamp = Date.now()
const owner = { email: `e2e-plans+${stamp}@qlinic.test`, password: `E2e!${crypto.randomUUID()}` }
const slug = `e2e-planos-${stamp.toString(36)}`
const out = []
const check = (n, ok, d = '') => { out.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`) }
let ownerId, orgId, recepId
const browser = await chromium.launch({ args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
const sec = () => page.locator('#contratacao')
try {
  ownerId = (await admin.auth.admin.createUser({ email: owner.email, password: owner.password, email_confirm: true, user_metadata: { name: 'E2E Dona' } })).data.user.id
  // visitante: prévia pública sem conta
  await page.goto(`${base}/planos?plano=plan_pro&ciclo=anual`)
  await sec().getByText('Preencha e revise sem precisar de conta').waitFor({ timeout: 20000 })
  check('visitante vê a contratação (sem “em preparação”)', (await page.getByText('em preparação').count()) === 0)
  check('visitante não envia sem conta', await sec().getByRole('button', { name: /Enviar solicitação|Continuar para assinatura/ }).isDisabled())

  // login real → cria clínica → volta a /planos na mesma aba
  await page.goto(`${base}/auth/login`)
  await page.getByLabel('E-mail').fill(owner.email)
  await page.locator('#login-pw').fill(owner.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByRole('heading', { name: 'Onde você quer entrar?' }).waitFor({ timeout: 20000 })
  await page.getByLabel('Nome da clínica').fill('Clínica E2E Planos')
  await page.getByLabel('Endereço na Qlinic').fill(slug)
  await page.getByRole('button', { name: 'Criar clínica' }).click()
  await page.waitForURL(`**/app/${slug}/onboarding`, { timeout: 30000 })
  orgId = (await admin.from('organizations').select('id').eq('slug', slug).single()).data?.id
  await page.goto(`${base}/planos?plano=plan_rede&ciclo=mensal`)
  await sec().getByText(/Contratando por Clínica E2E Planos/).waitFor({ timeout: 20000 })
  check('proprietário conectado contrata sem janela anônima', true)
  check('sem “em preparação” para sessão conectada', (await page.getByText('em preparação').count()) === 0)
  check('pré-preenchido com a própria clínica', (await sec().locator('#f-tradeName').inputValue()) === 'Clínica E2E Planos')
  // dados reais permitidos no ambiente real (valores de teste com dígitos válidos; nenhum envio externo)
  await sec().locator('#f-legalName').fill('Clínica E2E Planos Ltda.')
  await sec().locator('#f-document').fill('11222333000181')
  await sec().locator('#f-segment').selectOption('odontologia')
  await sec().locator('#f-email').fill('contrato@e2e.qlinic.test')
  await sec().locator('#f-phone').fill('11999990000')
  await sec().locator('#f-cep').fill('01001000')
  await sec().locator('#f-street').fill('Praça da Sé')
  await sec().locator('#f-number').fill('100')
  await sec().locator('#f-district').fill('Sé')
  await sec().locator('#f-city').fill('São Paulo')
  await sec().locator('#f-uf').selectOption('SP')
  await sec().locator('#f-sigName').fill('Dona Teste E2E')
  await sec().locator('#f-sigDocument').fill('52998224725')
  await sec().locator('#f-sigRole').fill('sócia-administradora')
  await sec().locator('#f-sigEmail').fill('dona@e2e.qlinic.test')
  await page.getByLabel(/Li o contrato acima/).check()
  await page.getByLabel(/Declaro possuir poderes/).check()
  await page.getByLabel(/aviso de privacidade/).check()
  const btn = sec().getByRole('button', { name: 'Enviar solicitação de contratação' })
  await btn.dblclick()
  await sec().getByText(/Solicitação QLS-.* registrada/).waitFor({ timeout: 20000 })
  await page.waitForTimeout(1200)
  const { data: reqs } = await admin.from('saas_contract_requests').select('protocol,status,offer,client_total_cents,tenant_id').eq('user_id', ownerId)
  check('solicitação gravada uma única vez (duplo clique)', reqs?.length === 1, `${reqs?.length}`)
  check('status é “solicitado”, nunca assinado', reqs?.[0]?.status === 'solicitado')
  check('preço vem do catálogo no servidor', reqs?.[0]?.offer?.totalCents === reqs?.[0]?.client_total_cents && reqs?.[0]?.offer?.planId === 'plan_rede')
  check('vinculada à clínica do proprietário', reqs?.[0]?.tenant_id === orgId)
  check('aviso de que não há contrato assinado', await sec().getByText('Ainda não há contrato assinado.').isVisible())
  check('sem CPF/CNPJ na URL', !/52998224725|11222333000181|529\.982/.test(page.url()))
  const ls = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
  check('CPF/CNPJ reais não ficam no navegador', !/52998224725|529\.982\.247-25|11222333000181|11\.222\.333/.test(ls))
  // recepção da mesma clínica (convite por e-mail): não recebe dados nem contrata pela clínica
  const recep = { email: `e2e-recep+${stamp}@qlinic.test`, password: `E2e!${crypto.randomUUID()}` }
  recepId = (await admin.auth.admin.createUser({ email: recep.email, password: recep.password, email_confirm: true })).data.user.id
  await admin.from('staff').insert({ tenant_id: orgId, id: `st_recep_${stamp}`, email: recep.email, data: { id: `st_recep_${stamp}`, tenantId: orgId, name: 'Recepção E2E', email: recep.email, active: true, mfa: false, createdAt: new Date().toISOString(), memberships: [{ role: 'reception', unitIds: 'all' }] } })
  await page.goto(`${base}/auth/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.context().clearCookies()
  await page.goto(`${base}/auth/login`)
  await page.getByLabel('E-mail').fill(recep.email)
  await page.locator('#login-pw').fill(recep.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByRole('heading', { name: 'Onde você quer entrar?' }).waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: /Clínica E2E Planos/ }).first().click()
  await page.waitForURL(`**/app/${slug}**`, { timeout: 30000 })
  await page.goto(`${base}/planos?plano=plan_essencial&ciclo=mensal`)
  await sec().getByText('Seu perfil não pode contratar por esta clínica').waitFor({ timeout: 20000 })
  check('recepção conectada: explicação específica (sem “em preparação”)', (await page.getByText('em preparação').count()) === 0)
  check('recepção não recebe dados da clínica', (await sec().locator('#f-tradeName').inputValue()) === '')
  check('recepção não consegue enviar pela clínica', await sec().getByRole('button', { name: /Enviar solicitação|Continuar para assinatura/ }).isDisabled())
  // servidor também recusa (RLS/RPC), independente da UI
  const rc = createClient(E.VITE_SUPABASE_URL, E.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  await rc.auth.signInWithPassword(recep)
  const { error: re } = await rc.rpc('request_saas_contract', { p_plan: 'plan_essencial', p_cycle: 'mensal', p_trial: false, p_tenant: orgId, p_contractor: {}, p_signatory: {}, p_template_version: 1, p_document_hash: 'x', p_acceptances: {}, p_client_total_cents: 1, p_idempotency_key: 'recep-e2e-key-000001' })
  check('servidor recusa recepção contratando pela clínica', re?.code === '42501', re?.code)
  const { data: seen } = await rc.from('saas_contract_requests').select('id')
  check('recepção não lê a solicitação da clínica', (seen ?? []).length === 0)
  check('sem erros de console', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (e) { check('execução', false, e.message.split('\n')[0]) }
finally {
  await page.screenshot({ path: 'qa/tmp/connected-plans-final.png', fullPage: false }).catch(() => {})
  await browser.close()
  if (ownerId) await admin.from('saas_contract_requests').delete().eq('user_id', ownerId)
  if (orgId) await admin.rpc('purge_tenant', { p_tenant: orgId })
  if (ownerId) await admin.auth.admin.deleteUser(ownerId)
  if (recepId) await admin.auth.admin.deleteUser(recepId)
}
const fails = out.filter((x) => !x).length
console.log(`\n${out.length - fails}/${out.length} verificações passaram`)
process.exit(fails ? 1 : 0)
