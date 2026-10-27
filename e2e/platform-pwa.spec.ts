// Cenários 13, 16, 17 + resolução segura de tenant.
import { test, expect } from '@playwright/test'
import { asSession, collectErrors, S } from './helpers'

test.describe('PWA por clínica (16)', () => {
  for (const [slug, kind] of [['sorriso-pleno', 'equipe'], ['vet-amigo', 'portal'], ['clinica-vitta', 'equipe']] as const) {
    test(`manifesto ${kind} de ${slug} é coerente`, async ({ request }) => {
      const r = await request.get(`/t/${slug}/${kind}.webmanifest`)
      expect(r.ok()).toBeTruthy()
      const m = await r.json()
      const prefix = kind === 'equipe' ? `/app/${slug}/` : `/c/${slug}/`
      expect(m.id.startsWith(prefix)).toBeTruthy()
      expect(m.start_url.startsWith(m.scope)).toBeTruthy()
      expect(m.scope.startsWith(prefix)).toBeTruthy()
      expect(m.display).toBe('standalone')
      const sizes = m.icons.map((i: { sizes: string }) => i.sizes)
      expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
      expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBeTruthy()
      for (const i of m.icons) expect((await request.get(i.src)).ok()).toBeTruthy()
    })
  }
  test('página da equipe aponta para o manifesto do próprio tenant', async ({ page }) => {
    await asSession(page, S.owner('org_vet'))
    await page.goto('/app/vet-amigo')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/t/vet-amigo/equipe.webmanifest')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#EA580C')
  })
  test('portal aponta para manifesto do portal da clínica', async ({ page }) => {
    await asSession(page, S.portal('org_sorriso'))
    await page.goto('/c/sorriso-pleno/portal')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/t/sorriso-pleno/portal.webmanifest')
  })
})

test.describe('Deep link, offline, tenant (13, 17)', () => {
  test('recarregar deep link profundo funciona', async ({ page }) => {
    const errors = collectErrors(page)
    await asSession(page, S.owner('org_sorriso'))
    await page.goto('/app/sorriso-pleno/financeiro')
    await page.reload()
    await expect(page.locator('main#main')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    expect(errors).toEqual([])
  })
  test('tenant desconhecido → erro seguro, nunca fallback', async ({ page }) => {
    await page.goto('/app/nao-existe/agenda')
    await expect(page.getByRole('heading', { name: 'Clínica não encontrada' })).toBeVisible()
    await page.goto('/c/nao-existe')
    await expect(page.getByRole('heading', { name: 'Clínica não encontrada' })).toBeVisible()
  })
  test('URL de outro tenant não concede acesso', async ({ page }) => {
    await asSession(page, S.owner('org_vet'))
    await page.goto('/app/sorriso-pleno')
    await expect(page.getByRole('heading', { name: 'Acesso não autorizado' })).toBeVisible()
  })
  test('troca A→B→A não mistura marca nem rascunho', async ({ page }) => {
    await asSession(page, S.owner('org_sorriso'))
    await page.goto('/app/sorriso-pleno')
    await expect(page.locator('main#main h1').first()).toBeVisible()
    await page.evaluate(() => sessionStorage.setItem('qlinic.draft.org_sorriso:org_sorriso_usr_owner.teste', '"rascunho A"'))
    const primaryA = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--q-primary').trim())
    expect(primaryA.toUpperCase()).toBe('#2563EB')
    await page.evaluate(() => { const s = { kind: 'staff', tenantId: 'org_vet', userId: 'org_vet_usr_owner', unitId: null }; localStorage.setItem('qlinic.session', JSON.stringify(s)); sessionStorage.setItem('qlinic.session', JSON.stringify(s)) })
    await page.goto('/demonstracao')
    await page.goto('/app/vet-amigo')
    await expect(page.locator('main#main h1').first()).toBeVisible()
    const primaryB = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--q-primary').trim())
    expect(primaryB).not.toBe(primaryA)
    // rascunho do tenant A não é lido no contexto B (namespace por tenant+usuário)
    const leaked = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('qlinic.draft.org_vet') && sessionStorage.getItem(k)?.includes('rascunho A')))
    expect(leaked).toEqual([])
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/t/vet-amigo/equipe.webmanifest')
  })
  test('offline com SW: shell abre e avisa; nada confirmado', async ({ page, context }) => {
    await asSession(page, S.portal('org_vet'))
    await page.goto('/c/vet-amigo/portal')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    // SW sem controle na 1ª visita: nova navegação já é controlada (e pré-cacheia assets)
    await page.goto('/c/vet-amigo/portal')
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await expect(page.locator('main#main').first()).toBeVisible()
    await context.setOffline(true)
    await page.goto('/c/vet-amigo/portal/pagamentos')
    await expect(page.locator('body')).toContainText(/sem conexão/i, { timeout: 20_000 })
    await context.setOffline(false)
  })
})

test('Super Admin exige perfil da plataforma', async ({ page }) => {
  await page.goto('/master')
  await expect(page.getByRole('heading', { name: 'Acesso restrito à plataforma' })).toBeVisible()
})
