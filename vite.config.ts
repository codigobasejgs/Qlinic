import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Pós-build: versiona o service worker e gera lista de assets para precache. */
function swVersion(): Plugin {
  let outDir = 'dist'
  return {
    name: 'qlinic-sw-version',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir },
    writeBundle(_, bundle) {
      const build = Date.now().toString(36)
      const sw = join(outDir, 'sw.js')
      writeFileSync(sw, readFileSync(sw, 'utf8').replace('__BUILD__', build))
      const assets = Object.keys(bundle).filter((f) => f.startsWith('assets/') && /\.(js|css|woff2?)$/.test(f)).map((f) => `/${f}`)
      writeFileSync(join(outDir, 'asset-manifest.json'), JSON.stringify(assets))
    },
  }
}

export default defineConfig({
  plugins: [react(), swVersion()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Evita cascata de dezenas de micro-chunks (um por ícone/helper), cara em rede móvel.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'router', test: /node_modules[\\/]react-router/ },
            { name: 'icons', test: /node_modules[\\/]lucide-react/ },
            { name: 'foundation', test: /src[\\/](lib|domain[\\/](types|permissions|tenancy)|data[\\/]store|ui[\\/](core|brand))/ },
          ],
        },
      },
    },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
