// Garante que o mapa de coleções cobre todo o store e que a migração gerada está em dia com a matriz de permissões.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { COLLECTION_RESOURCES, DEDICATED } from './collections'
import { MATRIX } from '@/domain/permissions'
import { buildSeedSql } from '../../../scripts/gen-db-seed'

function declaredCollections(): string[] {
  const files: string[] = []
  const walk = (d: string) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) && files.push(join(d, e.name))))
  walk('src')
  const names = new Set<string>()
  for (const f of files) {
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const block of src.matchAll(/interface TenantCollections \{([^}]*)\}/g)) for (const m of block[1].matchAll(/(\w+):\s*\w+\[\]/g)) names.add(m[1])
  }
  return [...names]
}

describe('mapa Supabase', () => {
  it('toda coleção de tenant tem destino (tabela dedicada ou genérica com recurso)', () => {
    const missing = declaredCollections().filter((c) => !(c in DEDICATED) && !(c in COLLECTION_RESOURCES))
    expect(missing).toEqual([])
  })
  it('recursos das coleções existem na matriz de permissões', () => {
    const resources = new Set(Object.values(MATRIX).flatMap((r) => Object.keys(r)))
    resources.add('clinical_restricted')
    const bad = Object.entries(COLLECTION_RESOURCES).filter(([, v]) => !resources.has(v.resource)).map(([k]) => k)
    expect(bad).toEqual([])
  })
  it('migração 0004 gerada está atualizada', () => {
    // QLINIC_WRITE_SEED=1 npx vitest run src/data/supabase  → regenera o arquivo
    if (process.env.QLINIC_WRITE_SEED) writeFileSync('supabase/migrations/0004_permissions_seed.sql', buildSeedSql())
    expect(readFileSync('supabase/migrations/0004_permissions_seed.sql', 'utf8').replace(/\r\n/g, '\n')).toBe(buildSeedSql())
  })
})
