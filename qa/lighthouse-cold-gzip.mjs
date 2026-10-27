// Landing em perfil novo (sem SW/cache): visita de 1º acesso real. 3 execuções �  mediana.
import { chromium } from '@playwright/test'
import lighthouse from 'lighthouse'
import { writeFileSync } from 'node:fs'
const runs = []
for (let i = 0; i < 3; i++) {
  const port = 9340 + i
  const b = await chromium.launch({ args: [`--remote-debugging-port=${port}`] })
  const r = await lighthouse('http://localhost:4174/', { port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices'] })
  const l = r.lhr
  runs.push({ perf: Math.round(l.categories.performance.score * 100), a11y: Math.round(l.categories.accessibility.score * 100), bp: Math.round(l.categories['best-practices'].score * 100), fcp: l.audits['first-contentful-paint'].displayValue, lcp: l.audits['largest-contentful-paint'].displayValue, tbt: l.audits['total-blocking-time'].displayValue, redirects: l.audits.redirects.displayValue ?? 'none', lcpEl: l.audits['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet })
  await b.close()
}
writeFileSync('qa/lighthouse/landing-cold-gzip.json', JSON.stringify(runs, null, 1))
console.log(JSON.stringify(runs, null, 1))

