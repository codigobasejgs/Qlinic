// Smoke: carrega app, força seed de todos os tenants demo via módulo store e reporta contagens/erros.
import { chromium } from '@playwright/test'
const base = process.argv[2] ?? 'http://localhost:5173'
const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(base + '/')
await page.waitForTimeout(1500)
const out = await page.evaluate(async () => {
  const s = await import('/src/data/store.ts')
  await import('/src/modules/register.ts')
  const orgs = s.platformDb.list('organizations')
  const res = {}
  for (const o of orgs.filter((x) => x.demo)) {
    const t0 = performance.now()
    const c = {}
    for (const n of ['units', 'resources', 'professionals', 'services', 'staff', 'persons', 'patients', 'links', 'appointments', 'waitlist', 'records', 'documents', 'charges', 'proposals', 'treatmentItems', 'outbox']) c[n] = s.db.list(o.id, n).length
    c.ms = Math.round(performance.now() - t0)
    res[o.slug] = c
  }
  return { orgs: orgs.length, res, lsKB: Math.round(JSON.stringify(localStorage).length / 1024) }
})
console.log(JSON.stringify(out, null, 1))
console.log('ERRORS:', errors)
await browser.close()
