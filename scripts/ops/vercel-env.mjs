// Define as variáveis PÚBLICAS do frontend no projeto Vercel e dispara novo deploy de produção.
// Requer acesso à API da Vercel (nesta máquina o endpoint está bloqueado pela rede; rode de outra máquina ou use o painel).
// Uso: node scripts/ops/vercel-env.mjs
import { loadEnv, api } from './env.mjs'
const E = loadEnv()
const P = E.VERCEL_PROJECT_ID
const vars = [
  ['VITE_SUPABASE_URL', E.VITE_SUPABASE_URL],
  ['VITE_SUPABASE_ANON_KEY', E.VITE_SUPABASE_ANON_KEY], // chave publicável: pública por design; segurança = RLS
  ['VITE_APP_ENV', 'production'],
]
for (const [key, value] of vars) {
  await api(`https://api.vercel.com/v10/projects/${P}/env?upsert=true`, { token: E.VERCEL_TOKEN, method: 'POST', body: { key, value, type: 'plain', target: ['production', 'preview', 'development'] } })
  console.log(`env ${key} definido`)
}
const p = await api(`https://api.vercel.com/v9/projects/${P}`, { token: E.VERCEL_TOKEN })
if (p.link?.repoId) {
  const d = await api('https://api.vercel.com/v13/deployments', { token: E.VERCEL_TOKEN, method: 'POST', body: { name: p.name, project: P, target: 'production', gitSource: { type: 'github', repoId: p.link.repoId, ref: p.link.productionBranch ?? 'main' } } })
  console.log('deploy iniciado:', d.url)
}
