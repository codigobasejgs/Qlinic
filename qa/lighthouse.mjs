// Lighthouse 12.8.2 contra build de produção (vite preview :4173) usando o Chromium do Playwright.
// Perfil: mobile padrão do Lighthouse (throttling simulado). Portal: sessão demo injetada no perfil do Chrome via CDP antes da auditoria.
import { chromium } from '@playwright/test'
import lighthouse from 'lighthouse'
import { writeFileSync, mkdirSync } from 'node:fs'

const base = process.env.LH_BASE ?? 'http://localhost:4173'
const portalSession = JSON.stringify({ kind: 'portal', tenantId: 'org_vet', personId: 'org_vet_per1' })
const routes = [
  ['landing', '/', null],
  ['planos', '/planos', null],
  ['demonstracao', '/demonstracao', null],
  ['ajuda', '/ajuda', null],
  ['clinica-publica', '/c/vet-amigo', null],
  ['agendamento-publico', '/c/vet-amigo/agendar', null],
  ['portal-inicio', '/c/vet-amigo/portal', portalSession],
  ['portal-vacinas', '/c/vet-amigo/portal/vacinas', portalSession],
]
mkdirSync('qa/lighthouse', { recursive: true })
const port = 9333
const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] })
const ctx = browser.contexts()[0] ?? await browser.newContext()
const results = []
// Aquecimento: 1ª requisição ao vite preview é fria (compila/abre arquivos); não representa o servidor de produção.
{ const w = await ctx.newPage(); for (const [, p] of routes) await w.goto(base + p).catch(() => {}); await w.close() }
for (const [id, path, session] of routes) {
  const setup = await ctx.newPage()
  await setup.goto(base + '/robots.txt')
  await setup.evaluate((s) => { localStorage.clear(); if (s) { localStorage.setItem('qlinic.session', s) } }, session)
  await setup.close()
  try {
    const r = await lighthouse(base + path, { port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices'], disableStorageReset: true })
    const lhr = r.lhr
    writeFileSync(`qa/lighthouse/${id}.json`, r.report)
    const s = (k) => Math.round((lhr.categories[k]?.score ?? 0) * 100)
    const a11yIds = lhr.categories.accessibility.auditRefs.map((x) => x.id)
    results.push({
      id, path, performance: s('performance'), accessibility: s('accessibility'), bestPractices: s('best-practices'),
      fcp: lhr.audits['first-contentful-paint']?.displayValue, lcp: lhr.audits['largest-contentful-paint']?.displayValue, tbt: lhr.audits['total-blocking-time']?.displayValue, cls: lhr.audits['cumulative-layout-shift']?.displayValue,
      a11yFails: a11yIds.filter((k) => lhr.audits[k]?.score === 0).map((k) => `${k}: ${(lhr.audits[k].details?.items ?? []).slice(0, 3).map((i) => i.node?.snippet ?? '').join(' | ')}`),
      perfOpp: Object.values(lhr.audits).filter((a) => a.details?.type === 'opportunity' && (a.numericValue ?? 0) > 150).map((a) => `${a.id} ${a.displayValue ?? ''}`),
    })
  } catch (e) { results.push({ id, error: String(e.message).slice(0, 300) }) }
}
await browser.close()
writeFileSync('qa/lighthouse/summary.json', JSON.stringify({ at: new Date().toISOString(), lighthouse: '12.8.2', profile: 'mobile padrão (throttling simulado)', host: 'Windows 10, vite preview local', results }, null, 2))
console.log(JSON.stringify(results, null, 1))

