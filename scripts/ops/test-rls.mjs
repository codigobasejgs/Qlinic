// Executa supabase/tests/rls.sql no projeto (transação com ROLLBACK) e falha se alguma asserção não passar.
import { readFileSync } from 'node:fs'
import { loadEnv, api } from './env.mjs'
const E = loadEnv()
const sql = readFileSync('supabase/tests/rls.sql', 'utf8')
// A Management API devolve o resultado do último SELECT: transformamos o ROLLBACK final em retorno antes do rollback.
const body = sql.replace(/select name, ok, detail from _results order by n;\s*rollback;\s*$/, `create temp table _out on commit drop as select name, ok, detail from _results order by n;
select json_agg(_out) r from _out;`)
const rows = await api(`https://api.supabase.com/v1/projects/${E.SUPABASE_PROJECT_ID}/database/query`, { token: E.SUPABASE_ACCESS_TOKEN, method: 'POST', body: { query: body + '\n' } }).catch((e) => { console.error(e.message); process.exit(2) })
// rollback explícito (a transação ainda está aberta na sessão da API; a API encerra a conexão e descarta)
const res = rows?.[0]?.r ?? []
let fail = 0
for (const r of res) { console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`); if (!r.ok) fail++ }
console.log(`\n${res.length - fail}/${res.length} asserções RLS passaram`)
const leftovers = await api(`https://api.supabase.com/v1/projects/${E.SUPABASE_PROJECT_ID}/database/query`, { token: E.SUPABASE_ACCESS_TOKEN, method: 'POST', body: { query: "select (select count(*) from public.organizations where id like 'rls_%') orgs, (select count(*) from auth.users where email like '%@rls.test') users" } })
console.log('resíduos após teste:', JSON.stringify(leftovers[0]))
process.exit(fail || res.length === 0 ? 1 : 0)
