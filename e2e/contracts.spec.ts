// Contratação dentro de /planos (demonstração; build sem Supabase): escolha → dados → contrato ao vivo → revisão.
import { test, expect, type Page } from '@playwright/test'
import { asSession, collectErrors, noHorizontalScroll, S } from './helpers'

const section = (page: Page) => page.locator('#contratacao')
const doc = (page: Page) => section(page).locator('.ctr-paper')
/** Build com Supabase: visitante escolhe explicitamente o modo demonstração (build sem Supabase já é demo). */
async function demo(page: Page) {
  const b = section(page).getByRole('button', { name: 'Usar modo demonstração' })
  await section(page).getByText(/Preencha e revise sem precisar de conta|Modo demonstração|Seu perfil não contrata|Plano atual da clínica|Contratando por/).first().waitFor()
  if (await b.count()) await b.click()
  await expect(section(page).getByText('Modo demonstração').or(section(page).getByText(/Seu perfil não contrata|Plano atual da clínica|Contratando por/)).first()).toBeVisible()
}
async function fill(page: Page) {
  await demo(page)
  await section(page).getByRole('button', { name: 'Preencher com dados fictícios' }).click() }
async function acceptAll(page: Page, pf = false) {
  await page.getByLabel(/Li o contrato acima/).check()
  await page.getByLabel(pf ? /contrato em nome próprio/ : /Declaro possuir poderes/).check()
  await page.getByLabel(/aviso de privacidade/).check()
}

test('menu e rodapé sem “Contrato”; rotas antigas redirecionam para /planos', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Contrato' })).toHaveCount(0)
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Contrato' })).toHaveCount(0)
  await page.goto('/contrato')
  await expect(page).toHaveURL(/\/planos$/)
  await page.goto('/contratar?plano=plan_rede&cpf=000.000.001-91&nome=Fulano')
  await expect(page).toHaveURL(/\/planos\?plano=plan_rede#contratacao$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Contratar o plano Rede' })).toBeVisible()
  await page.goBack()
  expect(page.url()).not.toMatch(/contratar/)
  expect(errors).toEqual([])
})

test('cada plano e ciclo abre a seção correta na própria /planos', async ({ page }) => {
  await page.goto('/planos')
  await expect(section(page)).toHaveCount(0)
  for (const [name, id] of [['Essencial', 'plan_essencial'], ['Profissional', 'plan_pro'], ['Rede', 'plan_rede']] as const) {
    await page.getByRole('button', { name: `Assinar plano ${name}` }).first().click()
    await expect(page).toHaveURL(new RegExp(`/planos\\?plano=${id}&ciclo=mensal#contratacao$`))
    await expect(page.getByRole('heading', { level: 2, name: `Contratar o plano ${name}` })).toBeFocused()
  }
  for (const [label, key] of [['Trimestral', 'trimestral'], ['Anual', 'anual']] as const) {
    await page.getByRole('group', { name: 'Ciclo de cobrança' }).getByRole('button', { name: label }).click()
    await expect(page).toHaveURL(new RegExp(`ciclo=${key}`))
    const card = (await page.locator('.pub-plans-table tbody tr').first().locator('td').last().locator('.pub-price').innerText()).split('/')[0].trim()
    await expect(section(page).getByTestId('ctr-total')).toContainText(card)
    await expect(section(page).getByText(/Equivale a .*\/mês, apenas referência/)).toBeVisible()
  }
})

test('link direto válido abre; inválido não gera contratação', async ({ page }) => {
  await page.goto('/planos?plano=plan_essencial&ciclo=anual')
  await expect(page.getByRole('heading', { level: 2, name: 'Contratar o plano Essencial' })).toBeVisible()
  await expect(section(page).getByRole('group', { name: 'Ciclo da assinatura' }).getByRole('button', { name: 'Anual' })).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/planos?plano=plano_inexistente')
  await expect(section(page).getByText('Plano indisponível')).toBeVisible()
  await expect(section(page).locator('.ctr-paper')).toHaveCount(0)
  await expect(section(page).getByRole('button', { name: /Simular assinatura|Enviar solicitação/ })).toHaveCount(0)
})

test('contrato ao vivo: campos aparecem sem perder foco; contratada correta; sem dados da referência', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/planos?plano=plan_pro&ciclo=mensal')
  await expect(doc(page).getByText('Informe a razão social acima').first()).toBeVisible()
  const html = await doc(page).innerText()
  expect(html).not.toMatch(/\bundefined\b|\bnull\b|NaN/)
  expect(html).toContain('59.760.458 MARCO ANTONIO BOGGIAN')
  expect(html).toContain('59.760.458/0001-91')
  expect(html).toContain('Rua Jacques Pilon, nº 189, Vila Piauí, São Paulo/SP, CEP 05109-160')
  expect(html).not.toMatch(/Qlinic Ltda|Correspond[eê]ncia/i)
  const input = page.getByLabel('Razão social')
  await input.click()
  const before = await page.evaluate(() => scrollY)
  await input.pressSequentially('Clínica Digitada Ltda.', { delay: 15 })
  await expect(input).toBeFocused()
  expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(4)
  await expect(doc(page).getByText(/CONTRATANTE: Clínica Digitada Ltda\./).first()).toBeVisible()
  await expect(doc(page).getByRole('heading', { name: /Anexo A/ })).toBeVisible()
  await expect(doc(page).getByRole('heading', { name: /Anexo B/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('trocar plano preserva cadastro, atualiza valores e invalida aceite; checkbox não assina', async ({ page }) => {
  await page.goto('/planos?plano=plan_pro&ciclo=mensal')
  await fill(page)
  const name = await page.getByLabel('Razão social').inputValue()
  await acceptAll(page)
  await expect(page.getByLabel(/Li o contrato acima/)).toBeChecked()
  await expect(page.getByText('Assinado (todas as partes)')).toHaveCount(0)
  const before = await section(page).getByTestId('ctr-total').innerText()
  await section(page).getByRole('button', { name: 'Alterar plano' }).click()
  await page.getByRole('button', { name: 'Assinar plano Rede' }).first().click()
  await expect(page.getByLabel('Razão social')).toHaveValue(name)
  await expect(section(page).getByTestId('ctr-total')).not.toHaveText(before)
  await expect(page.getByLabel(/Li o contrato acima/)).not.toBeChecked()
  await expect(doc(page).getByText(/Rede \(versão/)).toBeVisible()
})

test('jornada demo PJ: simular assinatura, pagamento, valores iguais, ativação e painel', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/planos?plano=plan_pro&ciclo=anual')
  await demo(page)
  await section(page).getByRole('button', { name: 'Simular assinatura' }).click()
  await expect(page.getByLabel('Razão social')).toBeFocused()
  await expect(page.getByLabel('Razão social')).toHaveAttribute('aria-invalid', 'true')
  await section(page).getByRole('button', { name: 'Buscar CEP' }).click()
  await expect(section(page).getByText('Consulta indisponível: preencha manualmente.')).toBeVisible()
  await fill(page)
  await page.getByLabel('Razão social').fill('Clínica com nome extremamente longo para testar quebra de linha no contrato e no resumo Ltda. (fictícia)')
  const total = (await section(page).getByTestId('ctr-total').innerText()).replace(/\s*cobrados[\s\S]*/, '').trim()
  await expect(doc(page).locator('dd', { hasText: total }).first()).toBeVisible()
  await acceptAll(page)
  await section(page).getByRole('button', { name: 'Simular assinatura' }).dblclick()
  await expect(section(page).locator('.ctr-state').getByText('Assinado parcialmente')).toBeVisible()
  await expect(section(page).getByTestId('ctr-charge')).toHaveText(total)
  await section(page).getByRole('button', { name: 'Recusado' }).click()
  await section(page).getByRole('button', { name: 'Pagar (simulação)' }).click()
  await expect(section(page).locator('.ctr-state').getByText('Falhou')).toBeVisible()
  await section(page).getByRole('button', { name: 'Aprovado' }).click()
  await section(page).getByRole('button', { name: /Tentar pagar novamente/ }).click()
  await expect(section(page).locator('.ctr-state').getByText('Confirmado')).toBeVisible()
  await expect(section(page).getByText(/aguarda a assinatura da contratada/)).toBeVisible()
  await section(page).getByRole('button', { name: 'Simular assinatura da contratada' }).click()
  await expect(section(page).locator('.ctr-state').getByText('Assinado (todas as partes)')).toBeVisible()
  expect(page.url()).not.toMatch(/cpf|cnpj|000\.|@|Cl%C3%ADnica/i)
  await section(page).getByRole('button', { name: 'Ir para a configuração inicial' }).click()
  await expect(page).toHaveURL(/\/app\/[a-z0-9-]+\/onboarding/)
  await page.goto(page.url().replace(/onboarding$/, 'meu-plano'))
  await expect(page.getByText('Assinado (todas as partes)').first()).toBeVisible()
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).map((r) => r.url)))).flat())
  expect(cached.filter((u) => /plano=|meu-plano|contrat/.test(u))).toEqual([])
  expect(errors).toEqual([])
})

test('PF em nome próprio e teste gratuito sem cobrança', async ({ page }) => {
  await page.goto('/planos?plano=plan_essencial&ciclo=mensal')
  await section(page).getByLabel(/Começar com teste gratuito/).check()
  await section(page).getByRole('button', { name: 'Profissional (PF)' }).click()
  await fill(page)
  await expect(section(page).getByText('Representante legal que assina')).toHaveCount(0)
  await expect(page.getByLabel('Nome comercial da clínica')).toHaveCount(0)
  await acceptAll(page, true)
  await section(page).getByRole('button', { name: 'Simular assinatura' }).click()
  await expect(section(page).getByRole('button', { name: 'Pagar (simulação)' })).toHaveCount(0)
  await section(page).getByRole('button', { name: 'Simular assinatura da contratada' }).click()
  await expect(section(page).getByText('Teste gratuito ativo.')).toBeVisible()
})

test('proprietário com plano ativo: pré-preenchido, mesmo plano bloqueado, troca vira aditivo', async ({ page }) => {
  await asSession(page, S.owner('org_vitta'))
  await page.goto('/planos?plano=plan_pro&ciclo=anual')
  await expect(section(page).getByText(/Plano atual da clínica: Profissional \(anual\)/)).toBeVisible()
  await expect(section(page).getByText('Este já é o plano e o ciclo atuais da clínica.').first()).toBeVisible()
  await expect(section(page).getByRole('button', { name: 'Simular assinatura' })).toBeDisabled()
  await expect(page.getByLabel('Nome comercial da clínica')).toHaveValue('Clínica Vitta')
  await page.getByRole('button', { name: 'Assinar plano Rede' }).first().click()
  await expect(section(page).getByText(/gera um aditivo da assinatura existente/)).toBeVisible()
  await expect(section(page).getByLabel(/teste gratuito/)).toHaveCount(0)
})

test('perfil sem permissão não recebe dados da clínica nem contrata por ela', async ({ page }) => {
  await asSession(page, S.reception('org_vitta'))
  await page.goto('/planos?plano=plan_rede&ciclo=mensal')
  await expect(section(page).getByText('Seu perfil não contrata por esta clínica')).toBeVisible()
  await expect(page.getByLabel('Razão social')).toHaveValue('')
  await expect(section(page).getByRole('button', { name: 'Simular assinatura' })).toBeDisabled()
})

test('@mobile 360/390/768 px sem rolagem horizontal; tema escuro', async ({ page }) => {
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 820 })
    await page.goto('/planos?plano=plan_pro&ciclo=anual')
    await fill(page)
    expect(await noHorizontalScroll(page)).toBe(true)
  }
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/planos?plano=plan_pro')
  const [bg, fg] = await doc(page).evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])
  expect(bg).not.toBe(fg)
})

test('impressão mostra só o contrato, com logo e anexos', async ({ page }) => {
  await page.goto('/planos?plano=plan_pro&ciclo=mensal')
  await fill(page)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('#root')).toBeHidden()
  const root = page.locator('.ctr-print-root')
  await expect(root).toBeVisible()
  await expect(root.locator('img, svg').first()).toBeVisible()
  await expect(root.getByText(/Anexo B/).first()).toBeVisible()
  await expect(root.getByText('DEMONSTRAÇÃO - NÃO ASSINADO')).toBeVisible()
})

test('Super Admin: CPF mascarado; suporte não edita modelo nem força assinatura', async ({ page }) => {
  await asSession(page, S.platform('platform_support'))
  await page.goto('/master/contratos')
  expect(await page.locator('main').innerText()).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/)
  await page.getByRole('button', { name: 'QLC-2026-0001' }).click()
  await page.getByRole('tab', { name: 'Signatários e evidências' }).click()
  await expect(page.getByRole('button', { name: 'Cancelar envelope' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.goto('/master/contratacao')
  await expect(page.getByText('Seu perfil consulta estas configurações')).toBeVisible()
})
