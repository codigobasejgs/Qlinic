// Aplica supabase/migrations/*.sql ainda não registradas, em ordem, via Management API (cada arquivo em transação).
// Registro em supabase_migrations.schema_migrations (compatível com a Supabase CLI). Idempotente: pula versões já aplicadas.
// Uso: node scripts/ops/migrate.mjs [--dry]
import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { loadEnv, api } from './env.mjs'

const E = loadEnv()
const ref = E.SUPABASE_PROJECT_ID
const q = (query) => api(`https://api.supabase.com/v1/projects/${ref}/database/query`, { token: E.SUPABASE_ACCESS_TOKEN, method: 'POST', body: { query } })
const dry = process.argv.includes('--dry')

await q(`create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[], created_by text);`)
const applied = new Set((await q('select version from supabase_migrations.schema_migrations')).map((r) => r.version))
const files = readdirSync('supabase/migrations').filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()
// Migrações "repetíveis" (seed gerado, idempotente): reaplicadas quando o conteúdo muda (hash em statements[0]).
const REPEATABLE = new Set(['0004'])
const hashes = Object.fromEntries((await q('select version, statements[1] h from supabase_migrations.schema_migrations')).map((r) => [r.version, r.h]))
for (const f of files) {
  const [version, ...rest] = f.replace('.sql', '').split('_')
  const sql = readFileSync(`supabase/migrations/${f}`, 'utf8')
  const hash = createHash('sha256').update(sql).digest('hex').slice(0, 16)
  if (REPEATABLE.has(version) && applied.has(version) && hashes[version] !== hash) {
    if (dry) { console.log(`~ ${f} (repetível, alterada — dry-run)`); continue }
    await q(`begin;\n${sql}\nupdate supabase_migrations.schema_migrations set statements = array['${hash}'] where version = '${version}';\ncommit;`)
    console.log(`↻ ${f} reaplicada (conteúdo alterado)`)
    continue
  }
  if (applied.has(version)) { console.log(`= ${f} (já aplicada)`); continue }
  if (dry) { console.log(`~ ${f} (dry-run)`); continue }
  const name = rest.join('_').replace(/'/g, "''")
  await q(`begin;\n${sql}\ninsert into supabase_migrations.schema_migrations (version, name, statements, created_by) values ('${version}', '${name}', array['${hash}'], 'qlinic-migrate');\ncommit;`)
  console.log(`+ ${f} aplicada`)
}
