// Publica as Edge Functions (supabase/functions/<nome>/index.ts + _shared) e define os segredos do servidor.
// Segredos lidos de .env.local; nunca impressos. Uso: node scripts/ops/deploy-functions.mjs [--secrets-only]
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv, api } from './env.mjs'

const E = loadEnv()
const ref = E.SUPABASE_PROJECT_ID
const token = E.SUPABASE_ACCESS_TOKEN

const secrets = [
  ['GEMINI_API_KEY', E.GEMINI_API_KEY], ['GEMINI_MODEL', E.GEMINI_MODEL ?? 'gemini-2.5-flash'],
  ['EVOLUTION_API_URL', E.EVOLUTION_API_URL], ['EVOLUTION_API_KEY', E.EVOLUTION_API_KEY],
  ['QLINIC_ALLOWED_ORIGINS', E.QLINIC_ALLOWED_ORIGINS ?? ''], ['QLINIC_AI_MONTHLY_LIMIT', E.QLINIC_AI_MONTHLY_LIMIT ?? '1500'],
].filter(([, v]) => v !== undefined && v !== '')
await api(`https://api.supabase.com/v1/projects/${ref}/secrets`, { token, method: 'POST', body: secrets.map(([name, value]) => ({ name, value })) })
console.log(`segredos definidos: ${secrets.map(([n]) => n).join(', ')}`)
if (process.argv.includes('--secrets-only')) process.exit(0)

const shared = readdirSync('supabase/functions/_shared').map((f) => [`_shared/${f}`, readFileSync(join('supabase/functions/_shared', f), 'utf8')])
const fns = readdirSync('supabase/functions').filter((d) => d !== '_shared' && statSync(join('supabase/functions', d)).isDirectory())
for (const name of fns) {
  const fd = new FormData()
  fd.append('metadata', JSON.stringify({ name, entrypoint_path: `${name}/index.ts`, verify_jwt: true }))
  fd.append('file', new Blob([readFileSync(join('supabase/functions', name, 'index.ts'), 'utf8')], { type: 'application/typescript' }), `${name}/index.ts`)
  for (const [p, src] of shared) fd.append('file', new Blob([src], { type: 'application/typescript' }), p)
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${name}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
  const t = await r.text()
  if (!r.ok) { console.error(`✗ ${name}: ${r.status} ${t.slice(0, 300)}`); process.exitCode = 1; continue }
  console.log(`✓ ${name} v${JSON.parse(t).version}`)
}
// remove função de teste de conectividade criada na inspeção
await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/qlinic-ping`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
