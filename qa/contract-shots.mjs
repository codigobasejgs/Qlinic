// Prints demonstrativos da contratação (requer build + `npx vite preview --port 4173`).
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:4173'
const out = 'qa/screenshots/contratacao'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const shot = async (name, url, { width = 1440, height = 900, dark = false, act } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light', locale: 'pt-BR' })
  const page = await ctx.newPage()
  await page.goto(base + url)
  if (act) await act(page)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false })
  await ctx.close()
}
const toData = async (p) => { await p.getByRole('button', { name: 'Continuar para dados' }).click(); await p.getByRole('button', { name: 'Preencher com dados fictícios' }).click() }
const toReview = async (p) => { await toData(p); await p.getByRole('button', { name: 'Revisar contrato' }).click() }
const toPay = async (p) => {
  await toReview(p)
  await p.getByLabel(/Li e concordo/).check(); await p.getByLabel(/Declaro possuir poderes/).check(); await p.getByLabel(/aviso de privacidade/).check()
  await p.getByRole('button', { name: 'Assinar (simulação)' }).click()
}
await shot('01-contrato-publico-desktop', '/contrato')
await shot('02-planos-cta', '/planos')
await shot('03-plano-desktop', '/contratar?plano=plan_pro')
await shot('04-dados-desktop', '/contratar?plano=plan_pro', { act: toData })
await shot('05-revisao-desktop', '/contratar?plano=plan_pro', { act: toReview })
await shot('06-pagamento-desktop', '/contratar?plano=plan_pro', { act: toPay })
await shot('07-dados-mobile-360', '/contratar?plano=plan_pro', { width: 360, height: 780, act: toData })
await shot('08-revisao-mobile-390', '/contratar?plano=plan_pro', { width: 390, height: 844, act: toReview })
await shot('09-contrato-dark', '/contrato', { dark: true })
const ctx = await browser.newContext({ locale: 'pt-BR' })
const page = await ctx.newPage()
await page.goto(base + '/contrato')
await page.waitForSelector('.ctr-print-root', { state: 'attached' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: `${out}/10-contrato-impressao.pdf`, format: 'A4', printBackground: true })
await browser.close()
console.log('prints em', out)
