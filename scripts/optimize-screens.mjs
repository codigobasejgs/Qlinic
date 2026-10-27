// Gera versões WebP (largura total e 720 px) dos prints em public/screens usando o Chromium do Playwright (sem dependência nova).
// Uso: node scripts/optimize-screens.mjs
import { chromium } from '@playwright/test'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'public/screens'
const browser = await chromium.launch()
const page = await browser.newPage()
for (const f of readdirSync(dir).filter((x) => x.endsWith('.png'))) {
  const b64 = readFileSync(join(dir, f)).toString('base64')
  for (const [suffix, width] of [['', 0], ['-720', 720]]) {
    const data = await page.evaluate(async ({ b64, width }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const w = width && img.naturalWidth > width ? width : img.naturalWidth
      const h = Math.round((img.naturalHeight * w) / img.naturalWidth)
      const c = document.createElement('canvas'); c.width = w; c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      return { url: c.toDataURL('image/webp', 0.82), w, h }
    }, { b64, width })
    const out = join(dir, f.replace('.png', `${suffix}.webp`))
    writeFileSync(out, Buffer.from(data.url.split(',')[1], 'base64'))
  }
}
await browser.close()
console.log('ok')
