// Inspeção somente leitura: projeto Vercel (config, env, deploys, domínios) e Supabase (tabelas, auth, buckets).
import { loadEnv, api } from './env.mjs'
const E = loadEnv()
const out = {}

try {
  const p = await api(`https://api.vercel.com/v9/projects/${E.VERCEL_PROJECT_ID}`, { token: E.VERCEL_TOKEN })
  out.vercel = {
    name: p.name, framework: p.framework, buildCommand: p.buildCommand, outputDirectory: p.outputDirectory, nodeVersion: p.nodeVersion, teamId: p.accountId,
    link: p.link ? { type: p.link.type, repo: `${p.link.org}/${p.link.repo}`, branch: p.link.productionBranch } : null,
    envKeys: (p.env ?? []).map((e) => `${e.key} [${e.target?.join(',')}] ${e.type}`),
    protection: p.ssoProtection ?? p.passwordProtection ?? null,
  }
  const d = await api(`https://api.vercel.com/v6/deployments?projectId=${E.VERCEL_PROJECT_ID}&limit=5`, { token: E.VERCEL_TOKEN })
  out.vercel.deployments = d.deployments.map((x) => ({ url: x.url, state: x.state ?? x.readyState, target: x.target, created: new Date(x.created).toISOString(), sha: x.meta?.githubCommitSha?.slice(0, 7) }))
  const dom = await api(`https://api.vercel.com/v9/projects/${E.VERCEL_PROJECT_ID}/domains`, { token: E.VERCEL_TOKEN })
  out.vercel.domains = dom.domains.map((x) => `${x.name} verified=${x.verified}`)
} catch (e) { out.vercelError = e.message }

try {
  const ref = E.SUPABASE_PROJECT_ID
  const q = (sql) => api(`https://api.supabase.com/v1/projects/${ref}/database/query`, { token: E.SUPABASE_ACCESS_TOKEN, method: 'POST', body: { query: sql } })
  const proj = await api(`https://api.supabase.com/v1/projects/${ref}`, { token: E.SUPABASE_ACCESS_TOKEN })
  out.supabase = { name: proj.name, region: proj.region, status: proj.status, pg: proj.database?.version }
  out.supabase.tables = (await q(`select table_schema||'.'||table_name t from information_schema.tables where table_schema not in ('pg_catalog','information_schema','auth','storage','realtime','extensions','graphql','graphql_public','vault','pgsodium','pgsodium_masks','supabase_functions','supabase_migrations','net','cron','pgbouncer') order by 1`)).map((r) => r.t)
  out.supabase.migrations = await q(`select version, name from supabase_migrations.schema_migrations order by version`).catch(() => 'sem tabela de migrações')
  out.supabase.authUsers = (await q(`select count(*)::int n from auth.users`))[0].n
  out.supabase.buckets = (await q(`select id, public from storage.buckets`))
  out.supabase.extensions = (await q(`select extname from pg_extension order by 1`)).map((r) => r.extname)
  const auth = await api(`https://api.supabase.com/v1/projects/${ref}/config/auth`, { token: E.SUPABASE_ACCESS_TOKEN })
  out.supabase.auth = { site_url: auth.site_url, uri_allow_list: auth.uri_allow_list, mailer_autoconfirm: auth.mailer_autoconfirm, mfa_totp: auth.mfa_totp_enroll_enabled, disable_signup: auth.disable_signup, smtp: !!auth.smtp_host }
} catch (e) { out.supabaseError = e.message }

console.log(JSON.stringify(out, null, 1))
