import { defineConfig, devices } from '@playwright/test'

// E2E contra build de produção (vite preview) — SW e manifestos reais.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: 'qa/e2e-results.json' }]],
  use: { baseURL: 'http://localhost:4173', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
})
