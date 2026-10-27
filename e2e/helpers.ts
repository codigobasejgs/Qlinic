import type { Page } from '@playwright/test'

export type Sess =
  | { kind: 'staff'; tenantId: string; userId: string; unitId: string | null }
  | { kind: 'portal'; tenantId: string; personId: string }
  | { kind: 'platform'; role: 'platform_owner' | 'platform_finance' | 'platform_support'; userId: string }

export const S = {
  owner: (t: string): Sess => ({ kind: 'staff', tenantId: t, userId: `${t}_usr_owner`, unitId: null }),
  reception: (t: string): Sess => ({ kind: 'staff', tenantId: t, userId: `${t}_usr_recepcao`, unitId: `${t}_u1` }),
  pro: (t: string, n = 1): Sess => ({ kind: 'staff', tenantId: t, userId: `${t}_usr_pro${n}`, unitId: null }),
  portal: (t: string, n = 1): Sess => ({ kind: 'portal', tenantId: t, personId: `${t}_per${n}` }),
  platform: (role: 'platform_owner' | 'platform_finance' | 'platform_support' = 'platform_owner'): Sess => ({ kind: 'platform', role, userId: role === 'platform_owner' ? 'pu_owner' : role === 'platform_finance' ? 'pu_finance' : 'pu_support' }),
}

/** Define sessão demo ANTES do carregamento (uma vez por página). */
export async function asSession(page: Page, s: Sess) {
  await page.addInitScript((v) => {
    if (!sessionStorage.getItem('__e2e_init')) { localStorage.setItem('qlinic.session', v); sessionStorage.setItem('qlinic.session', v); sessionStorage.setItem('__e2e_init', '1') }
  }, JSON.stringify(s))
}

export function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource: net::ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(`console: ${m.text()}`) })
  page.on('requestfailed', (r) => { if (!/probe=|sw\.js/.test(r.url())) errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`) })
  return errors
}

/** Lê coleção do store direto do localStorage (verificação de estado). */
export async function readCollection<T = Record<string, unknown>>(page: Page, tenantId: string, name: string): Promise<T[]> {
  return page.evaluate(([t, n]) => JSON.parse(localStorage.getItem(`qlinic:v1:t:${t}:${n}`) ?? '[]'), [tenantId, name] as const)
}

export async function noHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}
