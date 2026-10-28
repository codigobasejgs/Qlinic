// Prints da contratação em /planos (dados fictícios). Requer build + `npx vite preview --port 4173`.
// Uso: node qa/contract-shots.mjs [baseURL]
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:4173'
const out = 'qa/screenshots/contratacao-planos'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const demo = async (p) => { const b = p.locator('#contratacao').getByRole('button', { name: 'Usar modo demonstração' }); await p.locator('#ctr-h').waitFor(); await p.locator('#contratacao .alert').first().waitFor(); if (await b.count()) await b.click() }
const fill = async (p) => { await demo(p); await p.locator('#contratacao').getByRole('button', { name: 'Preencher com dados fictícios' }).click() }
const at = (sel) => async (p) => { await p.locator(sel).first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 76)) }
const shot = async (name, url, { width = 1440, height = 900, dark = false, act, full = false } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light', locale: 'pt-BR' })
  const page = await ctx.newPage()
  await page.goto(base + url)
  if (act) for (const a of [act].flat()) await a(page)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full })
  await ctx.close()
}
await shot('01-planos-sem-escolha', '/planos')
await shot('02-plano-escolhido-bloco1', '/planos?plano=plan_pro&ciclo=anual', { act: [demo, at('#b1-t')] })
await shot('03-contrato-vazio-com-indicacoes', '/planos?plano=plan_pro&ciclo=anual', { act: [demo, at('.ctr-paper .ctr-sec h2')] })
await shot('04-dados-preenchidos', '/planos?plano=plan_pro&ciclo=anual', { act: [fill, at('#b2-t')] })
await shot('05-contrato-preenchido', '/planos?plano=plan_pro&ciclo=anual', { act: [fill, at('.ctr-paper .ctr-sec h2')] })
await shot('06-revisao-continuidade', '/planos?plano=plan_pro&ciclo=anual', { act: [fill, at('#b4-t')] })
await shot('07-pagina-inteira-desktop', '/planos?plano=plan_pro&ciclo=anual', { act: fill, full: true })
await shot('08-mobile-360-dados', '/planos?plano=plan_pro&ciclo=mensal', { width: 360, height: 780, act: [fill, at('#b2-t')] })
await shot('09-mobile-390-contrato', '/planos?plano=plan_pro&ciclo=mensal', { width: 390, height: 844, act: [fill, at('.ctr-paper .ctr-sec h2')] })
await shot('10-tablet-768', '/planos?plano=plan_rede&ciclo=trimestral', { width: 768, height: 1024, act: [fill, at('#b1-t')] })
await shot('11-escuro-contrato', '/planos?plano=plan_pro&ciclo=anual', { dark: true, act: [fill, at('.ctr-paper .ctr-sec h2')] })
await shot('12-plano-invalido', '/planos?plano=nao-existe', { act: at('#contratacao') })
const ctx = await browser.newContext({ locale: 'pt-BR' })
const page = await ctx.newPage()
await page.goto(base + '/planos?plano=plan_pro&ciclo=anual')
await fill(page)
await page.waitForSelector('.ctr-print-root', { state: 'attached' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: `${out}/13-contrato-impressao.pdf`, format: 'A4', printBackground: true })
await browser.close()
console.log('prints em', out)
