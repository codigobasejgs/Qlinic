// Gera supabase/migrations/0004_permissions_seed.sql a partir de src/domain/permissions.ts e do mapa de coleções.
// Uso: QLINIC_WRITE_SEED=1 npx vitest run src/data/supabase  (o teste falha se o arquivo estiver desatualizado)
import { MATRIX } from '../src/domain/permissions'
import { COLLECTION_RESOURCES } from '../src/data/supabase/collections'

export function buildSeedSql(): string {
  const rows: string[] = []
  for (const [role, res] of Object.entries(MATRIX)) {
    for (const [resource, grants] of Object.entries(res)) {
      for (const [action, g] of Object.entries(grants ?? {})) rows.push(`('${role}','${resource}','${action}','${g === 'own' ? 'own' : 'all'}')`)
    }
  }
  const cols = Object.entries(COLLECTION_RESOURCES).map(([c, v]) => `('${c}','${v.resource}',${v.memberReadable ? 'true' : 'false'},${v.portal ? `'${v.portal}'` : 'null'})`)
  return `-- GERADO por scripts/gen-db-seed.ts — não editar à mão.
-- Matriz de permissões (src/domain/permissions.ts) e coleções de módulo → recurso.
truncate app.role_permissions;
insert into app.role_permissions (role, resource, action, scope) values
${rows.join(',\n')};

insert into app.collection_resources (collection, resource, member_readable, portal_kind) values
${cols.join(',\n')}
on conflict (collection) do update set resource = excluded.resource, member_readable = excluded.member_readable, portal_kind = excluded.portal_kind;
`
}
