/* Qlinic service worker (demonstração).
 * Estratégia:
 *  - Precache do shell (index.html + offline.html) e assets versionados (/assets/*, hash no nome) → cache-first.
 *  - Marca pública (/brand/*, /t/<slug>/*.png|svg) → stale-while-revalidate, cache por tenant: qlinic-brand-<slug>-<versão>.
 *  - Navegação: network-first; offline → shell em cache (SPA mostra aviso de indisponibilidade).
 *  - NUNCA cacheia: /api/*, /auth/*, requisições não-GET, respostas com Cache-Control no-store/private, cross-origin,
 *    manifests (no-cache, por tenant), URLs com token/proposta (dados sensíveis futuros).
 *  - Dados da demo vivem em localStorage (não passam pelo SW).
 *  - Atualização: novo SW fica "waiting" até o usuário aceitar (mensagem SKIP_WAITING) → sem recarregar formulário sem aviso.
 *  - Limpeza: caches com versão diferente são removidos no activate; CLEAR_TENANT remove caches do tenant anterior.
 */
const VERSION = 'v1-__BUILD__'
const SHELL = `qlinic-shell-${VERSION}`
const ASSETS = `qlinic-assets-${VERSION}`
const BRAND = (slug) => `qlinic-brand-${slug || 'qlinic'}-${VERSION}`

const NEVER = [/^\/api\//, /^\/auth\//, /\/proposta\//, /token=/i, /\.webmanifest$/]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL)
    await shell.addAll(['/', '/offline.html', '/brand/svg/qlinic-simbolo-principal.svg'])
    try {
      const res = await fetch('/asset-manifest.json', { cache: 'no-store' })
      if (res.ok) {
        const list = await res.json()
        const assets = await caches.open(ASSETS)
        await assets.addAll(list.filter((u) => u.startsWith('/assets/') && !u.endsWith('.map')).slice(0, 80))
      }
    } catch { /* sem manifest em dev */ }
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k.startsWith('qlinic-') && !k.endsWith(VERSION)).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  const d = event.data || {}
  if (d.type === 'SKIP_WAITING') self.skipWaiting()
  if (d.type === 'CLEAR_TENANT' || d.type === 'LOGOUT') {
    event.waitUntil((async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('qlinic-brand-') && !k.startsWith('qlinic-brand-qlinic')).map((k) => caches.delete(k)))
    })())
  }
  if (d.type === 'GET_VERSION') event.ports[0]?.postMessage(VERSION)
})

function sensitive(req, url) {
  if (req.method !== 'GET') return true
  if (url.origin !== self.location.origin) return true
  return NEVER.some((r) => r.test(url.pathname + url.search))
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (sensitive(req, url)) return // passa direto para a rede, sem cache

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (res.ok && !/no-store|private/.test(res.headers.get('cache-control') || '')) {
          const c = await caches.open(SHELL)
          c.put('/', res.clone())
        }
        return res
      } catch {
        const c = await caches.open(SHELL)
        return (await c.match('/')) || (await c.match('/offline.html')) || new Response('Sem conexão', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
    })())
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const c = await caches.open(ASSETS)
      const hit = await c.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) c.put(req, res.clone())
      return res
    })())
    return
  }

  const m = url.pathname.match(/^\/t\/([a-z0-9-]+)\//)
  if (url.pathname.startsWith('/brand/') || m) {
    event.respondWith((async () => {
      const c = await caches.open(BRAND(m && m[1]))
      const hit = await c.match(req)
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res }).catch(() => hit)
      return hit || net
    })())
  }
})

// Push (preparado; entrega real exige backend + VAPID). Conteúdo sem dados clínicos.
self.addEventListener('push', (event) => {
  let data = { title: 'Qlinic', body: 'Você tem uma nova notificação.', url: '/' }
  try { data = { ...data, ...event.data.json() } } catch { /* */ }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: data.icon || '/brand/pwa/icon-192.png', data: { url: data.url }, tag: data.tag }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    const same = list.find((c) => new URL(c.url).pathname.startsWith(new URL(target, self.location.origin).pathname))
    return same ? same.focus() : self.clients.openWindow(target)
  }))
})
