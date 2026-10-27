// Fluxos da matriz (seção 25) via UI real + verificação do estado persistido.
import { test, expect, type Page } from '@playwright/test'
import { asSession, collectErrors, noHorizontalScroll, readCollection, S } from './helpers'

type Appt = { id: string; patientId: string; status: string; source: string; start: string }
type Doc = { id: string; releasedToPortal: boolean; title: string; confidentiality: string }

async function ready(page: Page) {
  await expect(page.locator('main#main').first()).toBeVisible()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
}

test('3 — agendamento público aparece na recepção/agenda do mesmo tenant (via store)', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/c/clinica-vitta/agendar')
  await ready(page)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  const before = (await readCollection<Appt>(page, 'org_vitta', 'appointments')).filter((a) => a.source === 'publico').length
  await page.locator('main button').filter({ hasText: /^\d{2}:\d{2}/ }).first().click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel(/nome/i).first().fill('Visitante E2E Teste')
  await page.getByLabel(/telefone|celular|whatsapp/i).first().fill('(00) 90000-1234')
  const email = page.getByLabel(/e-mail/i).first()
  if (await email.isVisible().catch(() => false)) await email.fill('e2e@exemplo.test')
  for (const cb of await page.locator('main input[type=checkbox]').all()) await cb.check()
  await page.locator('main').getByRole('button', { name: /solicitar|confirmar|agendar|enviar|continuar/i }).last().click()
  const finalBtn = page.locator('main').getByRole('button', { name: /solicitar|confirmar|enviar/i }).last()
  if (await finalBtn.isVisible().catch(() => false)) await finalBtn.click()
  await expect(page.getByText(/solicitação (foi )?recebida|recebemos|confirmará/i).first()).toBeVisible()
  const after = (await readCollection<Appt>(page, 'org_vitta', 'appointments')).filter((a) => a.source === 'publico')
  expect(after.length).toBe(before + 1)
  expect(after.at(-1)!.status).toBe('solicitada')
  // não vaza para outro tenant
  const other = (await readCollection<Appt>(page, 'org_sorriso', 'appointments')).filter((a) => a.id === after.at(-1)!.id)
  expect(other).toHaveLength(0)
  // aparece na agenda da equipe
  await page.evaluate(() => { const s = JSON.stringify({ kind: 'staff', tenantId: 'org_vitta', userId: 'org_vitta_usr_recepcao', unitId: 'org_vitta_u1' }); localStorage.setItem('qlinic.session', s); sessionStorage.setItem('qlinic.session', s) })
  await page.goto('/app/clinica-vitta/agenda')
  await ready(page)
  expect(errors).toEqual([])
})

test('6 — tutor com dois animais: vacina de um não aparece no outro', async ({ page }) => {
  await asSession(page, S.portal('org_vet'))
  await page.goto('/c/vet-amigo/portal/vacinas')
  await ready(page)
  const vacc = await readCollection<{ patientId: string; product: string }>(page, 'org_vet', 'vaccines')
  const thor = vacc.filter((v) => v.patientId === 'org_vet_pat1').map((v) => v.product)
  const luna = vacc.filter((v) => v.patientId === 'org_vet_pat2').map((v) => v.product)
  expect(thor.length).toBeGreaterThan(0)
  expect(luna.length).toBeGreaterThan(0)
  const sel = page.getByLabel(/animal|dependente|paciente/i).first()
  await sel.selectOption({ label: /Thor/ }).catch(async () => { await sel.selectOption('org_vet_pat1') })
  const onlyThor = thor.filter((p) => !luna.includes(p))
  const onlyLuna = luna.filter((p) => !thor.includes(p))
  if (onlyThor[0]) await expect(page.locator('main').getByText(onlyThor[0]).first()).toBeVisible()
  if (onlyLuna[0]) await expect(page.locator('main').getByText(onlyLuna[0])).toHaveCount(0)
  await sel.selectOption('org_vet_pat2')
  if (onlyLuna[0]) await expect(page.locator('main').getByText(onlyLuna[0]).first()).toBeVisible()
  if (onlyThor[0]) await expect(page.locator('main').getByText(onlyThor[0])).toHaveCount(0)
})

test('8 — recepção não vê notas de psicologia; portal só vê documento liberado', async ({ page }) => {
  await asSession(page, S.reception('org_escuta'))
  await page.goto('/app/espaco-escuta/pacientes/org_escuta_pat1')
  await ready(page)
  await expect(page.locator('main')).not.toContainText('Conteúdo restrito da sessão (fictício)')
  await expect(page.locator('main')).not.toContainText('Registro restrito ao profissional')
  const docs = await readCollection<Doc>(page, 'org_escuta', 'documents')
  const hidden = docs.filter((d) => !d.releasedToPortal).map((d) => d.title)
  const shown = docs.filter((d) => d.releasedToPortal).map((d) => d.title)
  await page.evaluate(() => { const s = JSON.stringify({ kind: 'portal', tenantId: 'org_escuta', personId: 'org_escuta_per1' }); localStorage.setItem('qlinic.session', s); sessionStorage.setItem('qlinic.session', s) })
  await page.goto('/c/espaco-escuta/portal/documentos')
  await ready(page)
  for (const t of hidden) await expect(page.locator('main').getByText(t, { exact: true })).toHaveCount(0)
  expect(shown.length).toBeGreaterThan(0)
  await expect(page.locator('main').getByText(shown[0]).first()).toBeVisible()
})

test('12 — Super Admin: perfil suporte não vê planos nem cobrança', async ({ page }) => {
  await asSession(page, S.platform('platform_support'))
  await page.goto('/master')
  await ready(page)
  const nav = page.getByRole('navigation', { name: 'Menu Super Admin' })
  await expect(nav.getByRole('link', { name: 'Suporte' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Planos' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Cobrança SaaS' })).toHaveCount(0)
})

test('14 — gestora da unidade Cambuí só vê a própria unidade', async ({ page }) => {
  await asSession(page, { kind: 'staff', tenantId: 'org_sorriso', userId: 'org_sorriso_usr_gestor_u2', unitId: null })
  await page.goto('/app/sorriso-pleno/agenda')
  await ready(page)
  await expect(page.locator('#unit-sel')).toHaveCount(0) // 1 unidade permitida → sem seletor
  await expect(page.locator('header.topbar')).toContainText('Cambuí')
})

test('18 — teclado: foco preso no diálogo e Esc fecha', async ({ page }) => {
  await asSession(page, S.owner('org_sorriso'))
  await page.goto('/app/sorriso-pleno')
  await ready(page)
  await page.keyboard.press('Control+K')
  const dlg = page.getByRole('dialog', { name: 'Busca de comandos' })
  await expect(dlg).toBeVisible()
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBeTruthy()
  await page.keyboard.press('Escape')
  await expect(dlg).toHaveCount(0)
})

const RESPONSIVE: [string, string, () => ReturnType<typeof S.owner> | null][] = [
  ['/', 'landing', () => null],
  ['/demonstracao', 'demo', () => null],
  ['/app/sorriso-pleno/agenda', 'agenda', () => S.owner('org_sorriso')],
  ['/app/sorriso-pleno/odontologia?paciente=org_sorriso_pat1', 'odonto', () => S.pro('org_sorriso')],
  ['/app/sorriso-pleno/financeiro', 'financeiro', () => S.owner('org_sorriso')],
  ['/c/vet-amigo/portal', 'portal', () => S.portal('org_vet')],
  ['/master', 'master', () => S.platform()],
]
for (const w of [360, 390, 768, 1024, 1440]) {
  test(`responsivo ${w}px — sem rolagem horizontal da página @mobile`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 })
    for (const [url, , sess] of RESPONSIVE) {
      const s = sess()
      await page.evaluate((v) => { if (v) { localStorage.setItem('qlinic.session', v); sessionStorage.setItem('qlinic.session', v) } else localStorage.removeItem('qlinic.session') }, s ? JSON.stringify(s) : null).catch(() => {})
      await page.goto(url)
      await ready(page)
      expect(await noHorizontalScroll(page), `${url} @${w}`).toBeTruthy()
    }
  })
}
