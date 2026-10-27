import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, it, expect } from 'vitest'
import { ARTICLES, CHECKLIST, searchArticles } from './content'
import { TOURS, stepsFor } from './tours'

// Lê routes.tsx como texto; AST extrai path/index/children sem importar browser router.
const source = ts.createSourceFile('routes.tsx', readFileSync(resolve('src/app/routes.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function property(node: ts.ObjectLiteralExpression, name: string) {
  return node.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(source) === name)?.initializer
}
const routes: string[] = []
function collect(node: ts.Node, parent = '') {
  if (ts.isObjectLiteralExpression(node)) {
    const p = property(node, 'path')
    const part = p && ts.isStringLiteral(p) ? p.text : ''
    const current = part.startsWith('/') ? part : `${parent}/${part}`.replace(/\/+/g, '/').replace(/\/$/, '')
    if (part && part !== '*') routes.push(current || '/')
    const children = property(node, 'children')
    if (children && ts.isArrayLiteralExpression(children)) children.elements.forEach((c) => collect(c, current))
    return
  }
  node.forEachChild((child) => collect(child, parent))
}
collect(source)
const matches = (url: string) => routes.some((route) => new RegExp(`^${route.replace(/:[^/]+/g, '[^/]+')}/?$`).test(url))
function full(route: string, audience = 'equipe') {
  if (route.startsWith('/')) return route.replace(':slug', 'sorriso-pleno')
  return `${audience === 'portal' ? '/c/sorriso-pleno' : '/app/sorriso-pleno'}/${route}`
}

describe('Rotas de artigos, checklist e tours', () => {
  it('extrai a árvore real do roteador', () => { expect(routes.length).toBeGreaterThan(60); expect(matches('/app/sorriso-pleno/agenda')).toBe(true); expect(matches('/master/planos')).toBe(true); expect(matches('/c/vet-amigo/portal/vacinas')).toBe(true) })
  for (const a of ARTICLES) it(`artigo ${a.slug}`, () => expect(matches(full(a.route)), full(a.route)).toBe(true))
  for (const c of CHECKLIST) it(`checklist ${c.id}`, () => expect(matches(full(c.route))).toBe(true))
  for (const t of TOURS) it(`tour ${t.id}`, () => {
    for (const s of t.steps) if (s.route) expect(matches(full(s.route, t.audience)), s.route).toBe(true)
    expect(stepsFor(t, 360).length).toBeGreaterThan(0)
    expect(stepsFor(t, 1440).length).toBeGreaterThanOrEqual(stepsFor(t, 360).length)
  })
  it('busca sem acentos, por tarefa, perfil e segmento', () => {
    expect(searchArticles(ARTICLES, 'vacinas', {segment:'veterinaria'}).some(a=>a.slug==='veterinaria-vacinas-internacao')).toBe(true)
    expect(searchArticles(ARTICLES, 'sigilo', {segment:'odontologia'})).toEqual([])
    expect(searchArticles(ARTICLES, '', {profile:'inventory'}).every(a=>a.profiles.includes('inventory'))).toBe(true)
  })
})
