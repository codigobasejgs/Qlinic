// Gera, por clínica seed, manifestos PWA (equipe e paciente, ids/scopes distintos) e ícones em URLs persistentes:
//   public/t/<slug>/equipe.webmanifest | portal.webmanifest | icon.svg | maskable.svg | icon-192.png | icon-512.png | maskable-512.png | apple-touch-icon.png
// Uso: node scripts/gen-tenant-pwa.mjs        → manifestos + SVG (sem dependências)
//      node scripts/gen-tenant-pwa.mjs --png  → também rasteriza PNG via Chromium do Playwright (devDependency)
// Ids são estáveis (não mudam ao trocar logo). Ícones versionados pela brand.version (?v=).
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const orgs = JSON.parse(await readFile(join(root, 'src/data/seed/orgs.json'), 'utf8')).filter((o) => o.demo)

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
function lum(h) { return hexToRgb(h).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0) }
function contrast(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const fg = (bg) => (contrast(bg, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#102A43')

/** Ícone "any": quadrado com cantos arredondados. Maskable: fundo sangrado e conteúdo dentro da zona segura (80%). */
function iconSvg(o, maskable) {
  const c = fg(o.primary)
  const size = 512
  const fs = maskable ? 168 : 210
  const bg = maskable ? `<rect width="${size}" height="${size}" fill="${o.primary}"/>` : `<rect width="${size}" height="${size}" rx="112" fill="${o.primary}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="800" font-size="${fs}" fill="${c}" letter-spacing="-6">${o.initials}</text></svg>`
}

function manifest(o, kind) {
  const isStaff = kind === 'equipe'
  const scope = isStaff ? `/app/${o.slug}/` : `/c/${o.slug}/`
  const start = isStaff ? `/app/${o.slug}/` : `/c/${o.slug}/portal/`
  const v = 1
  return {
    id: isStaff ? `/app/${o.slug}/` : `/c/${o.slug}/portal/`,
    name: isStaff ? `${o.name} — Equipe` : o.name,
    short_name: isStaff ? `${o.short} Equipe` : o.short,
    description: isStaff ? `Aplicativo da equipe de ${o.name} (demonstração Qlinic).` : `Portal do paciente de ${o.name} (demonstração Qlinic).`,
    lang: 'pt-BR', dir: 'ltr', start_url: start, scope, display: 'standalone', orientation: 'any',
    theme_color: o.primary, background_color: '#F7FAFC', categories: ['medical', 'health', 'business'],
    icons: [
      { src: `/t/${o.slug}/icon-192.png?v=${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/t/${o.slug}/icon-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/t/${o.slug}/maskable-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: `/t/${o.slug}/icon.svg?v=${v}`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}

for (const o of orgs) {
  const dir = join(root, 'public/t', o.slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'icon.svg'), iconSvg(o, false))
  await writeFile(join(dir, 'maskable.svg'), iconSvg(o, true))
  await writeFile(join(dir, 'equipe.webmanifest'), JSON.stringify(manifest(o, 'equipe'), null, 2))
  await writeFile(join(dir, 'portal.webmanifest'), JSON.stringify(manifest(o, 'portal'), null, 2))
}
console.log(`Manifestos/SVG gerados para ${orgs.length} clínicas.`)

if (process.argv.includes('--png')) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const render = async (svg, size, out) => {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`)
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  }
  for (const o of orgs) {
    const dir = join(root, 'public/t', o.slug)
    await render(iconSvg(o, false), 192, join(dir, 'icon-192.png'))
    await render(iconSvg(o, false), 512, join(dir, 'icon-512.png'))
    await render(iconSvg(o, true), 512, join(dir, 'maskable-512.png'))
    await render(iconSvg(o, true), 180, join(dir, 'apple-touch-icon.png'))
  }
  await browser.close()
  console.log('PNGs gerados.')
}
