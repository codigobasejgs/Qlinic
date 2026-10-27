// Servidor estático de dist/ com gzip + fallback SPA (aproxima o comportamento da Vercel para medição).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { extname, join, normalize } from 'node:path'
const root = 'dist'
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain' }
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '')
  let body, type
  try { body = await readFile(join(root, p)); type = TYPES[extname(p)] ?? 'application/octet-stream' }
  catch { body = await readFile(join(root, 'index.html')); type = TYPES['.html']; p = 'index.html' }
  const headers = { 'Content-Type': type, 'Cache-Control': p.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' }
  if (/^(text|application\/(json|manifest)|image\/svg)/.test(type) && /gzip/.test(req.headers['accept-encoding'] ?? '')) { body = gzipSync(body); headers['Content-Encoding'] = 'gzip' }
  res.writeHead(200, headers).end(body)
}).listen(4174, () => console.log('gzip server :4174'))
