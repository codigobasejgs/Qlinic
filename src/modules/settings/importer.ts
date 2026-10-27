// Importador CSV DEMONSTRATIVO: arquivo é entrada NÃO confiável.
// Fluxo: parse → mapeamento (auto + manual) → validação por linha → duplicados (arquivo e base) → gravação em lote → desfazer.
// Proteção contra formula injection: valores de texto iniciados por = + - @ (tab/CR) são gravados como texto inerte (prefixo ').
import type { ID, Patient, Professional, Service } from '@/domain/types'
import type { Product } from '@/domain/modules'
import { db } from '@/data/store'
import { audit, patientRepo } from '@/data/repositories'
import { parseBRL } from '@/lib/money'
import { nowISO } from '@/lib/dates'
import { fakeCPF, isValidCPF, maskCPF, maskPhone, normalize, parseCSV, uid } from '@/lib/util'
import type { ImportBatch, ImportEntity } from './types'

export const MAX_ROWS = 2000

type FieldType = 'text' | 'cpf' | 'date' | 'int' | 'money' | 'phone' | 'email' | 'bool' | 'sex' | 'list'
export interface ImportField { key: string; label: string; type: FieldType; required?: boolean; aliases: string[]; example: string; example2: string }

export const ENTITY_LABEL: Record<ImportEntity, string> = { pacientes: 'Pacientes', profissionais: 'Profissionais', servicos: 'Serviços', produtos: 'Produtos' }

export const FIELDS: Record<ImportEntity, ImportField[]> = {
  pacientes: [
    { key: 'nome', label: 'Nome completo', type: 'text', required: true, aliases: ['nome', 'paciente', 'nome completo', 'name'], example: 'Ana Exemplo Souza', example2: 'Bruno Fictício Lima' },
    { key: 'cpf', label: 'CPF', type: 'cpf', aliases: ['cpf', 'documento'], example: fakeCPF(424242), example2: '' },
    { key: 'nascimento', label: 'Data de nascimento', type: 'date', aliases: ['nascimento', 'data de nascimento', 'data nascimento', 'dt nascimento', 'birth'], example: '15/03/1985', example2: '1992-07-30' },
    { key: 'sexo', label: 'Sexo (F/M/I)', type: 'sex', aliases: ['sexo', 'genero'], example: 'F', example2: 'M' },
    { key: 'telefone', label: 'Telefone', type: 'phone', aliases: ['telefone', 'celular', 'fone', 'whatsapp', 'phone'], example: '(00) 90000-1234', example2: '(00) 3000-5678' },
    { key: 'email', label: 'E-mail', type: 'email', aliases: ['email', 'e-mail'], example: 'ana@exemplo.test', example2: '' },
    { key: 'alergias', label: 'Alergias (separe por |)', type: 'list', aliases: ['alergias', 'alergia'], example: 'Dipirona (fictício)', example2: '' },
    { key: 'especie', label: 'Espécie (só animais)', type: 'text', aliases: ['especie', 'species'], example: '', example2: '' },
  ],
  profissionais: [
    { key: 'nome', label: 'Nome', type: 'text', required: true, aliases: ['nome', 'profissional', 'name'], example: 'Dra. Clara Exemplo', example2: 'Dr. Davi Fictício' },
    { key: 'conselho', label: 'Conselho/registro', type: 'text', required: true, aliases: ['conselho', 'registro', 'cro', 'crm', 'crp', 'crefito', 'crmv', 'crn'], example: 'CRO-SP 00000 (fictício)', example2: 'CRM-SP 00000 (fictício)' },
    { key: 'especialidade', label: 'Especialidade', type: 'text', required: true, aliases: ['especialidade', 'area'], example: 'Ortodontia', example2: 'Clínica geral' },
  ],
  servicos: [
    { key: 'nome', label: 'Nome do serviço', type: 'text', required: true, aliases: ['nome', 'servico', 'procedimento', 'name'], example: 'Avaliação inicial', example2: 'Retorno' },
    { key: 'categoria', label: 'Categoria', type: 'text', aliases: ['categoria', 'grupo'], example: 'Consultas', example2: 'Consultas' },
    { key: 'duracao', label: 'Duração (min)', type: 'int', required: true, aliases: ['duracao', 'duracao min', 'tempo', 'minutos'], example: '40', example2: '20' },
    { key: 'intervalo', label: 'Intervalo após (min)', type: 'int', aliases: ['intervalo', 'buffer', 'folga'], example: '10', example2: '0' },
    { key: 'preco', label: 'Preço (R$)', type: 'money', required: true, aliases: ['preco', 'valor', 'price'], example: '180,00', example2: '0' },
    { key: 'publico', label: 'Agendável publicamente (sim/não)', type: 'bool', aliases: ['publico', 'agendavel', 'online'], example: 'sim', example2: 'não' },
  ],
  produtos: [
    { key: 'nome', label: 'Nome do produto', type: 'text', required: true, aliases: ['nome', 'produto', 'item', 'name'], example: 'Luva de procedimento M', example2: 'Anestésico (exemplo)' },
    { key: 'sku', label: 'Código (SKU)', type: 'text', required: true, aliases: ['sku', 'codigo', 'cod', 'referencia'], example: 'LUV-M-001', example2: 'ANE-002' },
    { key: 'categoria', label: 'Categoria', type: 'text', aliases: ['categoria', 'grupo'], example: 'Descartáveis', example2: 'Medicamentos' },
    { key: 'unidade', label: 'Unidade de controle', type: 'text', required: true, aliases: ['unidade', 'un', 'unidade medida'], example: 'un', example2: 'ml' },
    { key: 'minimo', label: 'Estoque mínimo', type: 'int', aliases: ['minimo', 'estoque minimo', 'min'], example: '100', example2: '20' },
    { key: 'custo', label: 'Custo unitário (R$)', type: 'money', aliases: ['custo', 'custo unitario', 'valor'], example: '0,45', example2: '12,90' },
  ],
}

// ---------------- utilidades ----------------
export const isFormulaLike = (v: string) => /^[=+\-@\t\r]/.test(v)
/** Neutraliza fórmulas em campos de texto: grava como texto literal com apóstrofo inicial. */
export function inertText(v: string): { value: string; neutralized: boolean } {
  return isFormulaLike(v) ? { value: `'${v}`, neutralized: true } : { value: v, neutralized: false }
}

export function parseCivilDate(v: string): string | null {
  let y: number, m: number, d: number
  let mt = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v)
  if (mt) { d = +mt[1]; m = +mt[2]; y = +mt[3] }
  else if ((mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v))) { y = +mt[1]; m = +mt[2]; d = +mt[3] }
  else return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

export function readTable(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^\uFEFF/, '')
  if (!clean.trim()) throw new Error('Arquivo vazio.')
  const all = parseCSV(clean)
  if (all.length < 2) throw new Error('O arquivo precisa de uma linha de cabeçalho e ao menos uma linha de dados.')
  if (all.length - 1 > MAX_ROWS) throw new Error(`A demonstração aceita até ${MAX_ROWS} linhas por arquivo.`)
  return { headers: all[0].map((h) => h.trim()), rows: all.slice(1) }
}

export type Mapping = Record<string, number> // fieldKey → índice da coluna (-1 = não mapeado)
export function autoMap(entity: ImportEntity, headers: string[]): Mapping {
  const hs = headers.map((h) => normalize(h).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim())
  const used = new Set<number>()
  const out: Mapping = {}
  for (const f of FIELDS[entity]) {
    const cands = [f.key, ...f.aliases].map((a) => normalize(a).replace(/[^a-z0-9 ]/g, ' ').trim())
    let idx = hs.findIndex((h, i) => !used.has(i) && cands.includes(h))
    if (idx < 0) idx = hs.findIndex((h, i) => !used.has(i) && cands.some((c) => c.length > 3 && h.includes(c)))
    if (idx >= 0) used.add(idx)
    out[f.key] = idx
  }
  return out
}

export function templateCSV(entity: ImportEntity): string {
  const fs = FIELDS[entity]
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return [fs.map((f) => f.key).join(';'), fs.map((f) => esc(f.example)).join(';'), fs.map((f) => esc(f.example2)).join(';')].join('\n')
}

// ---------------- validação ----------------
export type Parsed = string | number | boolean | string[] | undefined
export interface RowResult {
  line: number // linha no arquivo (cabeçalho = 1)
  values: Record<string, Parsed>
  errors: string[]
  warnings: string[]
  duplicate?: { where: 'arquivo' | 'base'; detail: string }
}

function parseField(f: ImportField, raw: string): { value?: Parsed; error?: string; warning?: string } {
  const v = raw.trim()
  if (!v) return f.required ? { error: `${f.label}: obrigatório.` } : {}
  switch (f.type) {
    case 'text': {
      const t = inertText(v)
      if (t.value.length > 160) return { error: `${f.label}: máximo de 160 caracteres.` }
      return { value: t.value, warning: t.neutralized ? `${f.label}: começa com "${v[0]}" — gravado como texto, sem executar fórmula.` : undefined }
    }
    case 'list': {
      const items = v.split('|').map((s) => s.trim()).filter(Boolean).map((s) => inertText(s))
      return { value: items.map((i) => i.value), warning: items.some((i) => i.neutralized) ? `${f.label}: item com fórmula gravado como texto.` : undefined }
    }
    case 'cpf': return isValidCPF(v) ? { value: maskCPF(v) } : { error: `${f.label}: CPF inválido (dígitos verificadores não conferem).` }
    case 'date': {
      const d = parseCivilDate(v)
      if (!d) return { error: `${f.label}: data inválida "${v}" (use dd/mm/aaaa).` }
      if (d > nowISO().slice(0, 10)) return { error: `${f.label}: data no futuro.` }
      if (d < '1900-01-01') return { error: `${f.label}: data anterior a 1900.` }
      return { value: d }
    }
    case 'int': {
      if (!/^\d{1,6}$/.test(v)) return { error: `${f.label}: informe um número inteiro maior ou igual a zero.` }
      return { value: Number(v) }
    }
    case 'money': {
      const c = parseBRL(v)
      if (c === null || c < 0) return { error: `${f.label}: valor inválido "${v}" (ex.: 180,00).` }
      return { value: c }
    }
    case 'phone': {
      if (!/^[\d\s()+-]+$/.test(v)) return { error: `${f.label}: telefone inválido.` }
      let d = v.replace(/\D/g, '')
      if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
      return d.length === 10 || d.length === 11 ? { value: maskPhone(d) } : { error: `${f.label}: use DDD + número (10 ou 11 dígitos).` }
    }
    case 'email': return /^[^\s@=+]+@[^\s@]+\.[^\s@]+$/.test(v) ? { value: v.toLowerCase() } : { error: `${f.label}: e-mail inválido.` }
    case 'bool': {
      const n = normalize(v)
      if (['sim', 's', 'true', '1', 'x'].includes(n)) return { value: true }
      if (['nao', 'n', 'false', '0'].includes(n)) return { value: false }
      return { error: `${f.label}: use sim ou não.` }
    }
    case 'sex': {
      const n = normalize(v)[0]?.toUpperCase()
      return n && ['F', 'M', 'I'].includes(n) ? { value: n } : { error: `${f.label}: use F, M ou I.` }
    }
  }
}

/** Chaves de identidade da linha: qualquer coincidência marca duplicado (CPF, ou nome + nascimento). */
function dupKeys(entity: ImportEntity, v: Record<string, Parsed>): string[] {
  const s = (k: string) => (typeof v[k] === 'string' ? normalize(v[k] as string) : '')
  if (entity === 'pacientes') return [v.cpf ? `cpf:${String(v.cpf).replace(/\D/g, '')}` : '', v.nome ? `nome:${s('nome')}|${v.nascimento ?? ''}` : ''].filter(Boolean)
  if (entity === 'produtos') return v.sku ? [`sku:${s('sku')}`] : []
  return v.nome ? [`nome:${s('nome')}`] : []
}

function baseDuplicate(tenantId: ID, entity: ImportEntity, v: Record<string, Parsed>): string | null {
  const name = typeof v.nome === 'string' ? normalize(v.nome) : ''
  if (entity === 'pacientes') {
    const d = patientRepo.findDuplicates(tenantId, { name: String(v.nome ?? ''), cpf: v.cpf as string | undefined, phone: v.telefone as string | undefined, birthDate: v.nascimento as string | undefined })
    return d.length ? `já existe: ${d[0].name}` : null
  }
  if (entity === 'profissionais') return db.list(tenantId, 'professionals').find((p) => normalize(p.name) === name) ? 'profissional com o mesmo nome já cadastrado' : null
  if (entity === 'servicos') return db.list(tenantId, 'services').find((p) => normalize(p.name) === name) ? 'serviço com o mesmo nome já cadastrado' : null
  const sku = typeof v.sku === 'string' ? normalize(v.sku) : ''
  return db.list(tenantId, 'products').find((p) => normalize(p.sku) === sku) ? 'produto com o mesmo SKU já cadastrado' : null
}

export function validateRows(tenantId: ID, entity: ImportEntity, rows: string[][], mapping: Mapping): RowResult[] {
  const fields = FIELDS[entity]
  const missing = fields.filter((f) => f.required && (mapping[f.key] ?? -1) < 0)
  if (missing.length) throw new Error(`Mapeie as colunas obrigatórias: ${missing.map((f) => f.label).join(', ')}.`)
  const seen = new Map<string, number>()
  return rows.map((r, i) => {
    const res: RowResult = { line: i + 2, values: {}, errors: [], warnings: [] }
    for (const f of fields) {
      const idx = mapping[f.key] ?? -1
      const p = parseField(f, idx >= 0 ? r[idx] ?? '' : '')
      if (p.error) res.errors.push(p.error)
      if (p.warning) res.warnings.push(p.warning)
      if (p.value !== undefined) res.values[f.key] = p.value
    }
    if (!res.errors.length) {
      const keys = dupKeys(entity, res.values)
      const hit = keys.find((k) => seen.has(k))
      if (hit) res.duplicate = { where: 'arquivo', detail: `repete a linha ${seen.get(hit)}` }
      else {
        keys.forEach((k) => seen.set(k, res.line))
        const b = baseDuplicate(tenantId, entity, res.values)
        if (b) res.duplicate = { where: 'base', detail: b }
      }
    }
    return res
  })
}

export function summarize(results: RowResult[]) {
  const invalid = results.filter((r) => r.errors.length).length
  const duplicates = results.filter((r) => !r.errors.length && r.duplicate).length
  return { rows: results.length, invalid, duplicates, importable: results.length - invalid - duplicates, warnings: results.filter((r) => r.warnings.length).length }
}

/** Relatório por linha (para exportar com toCSV — que também protege contra fórmulas). */
export function errorReport(results: RowResult[]) {
  return results.filter((r) => r.errors.length || r.duplicate || r.warnings.length).map((r) => ({
    linha: r.line,
    situacao: r.errors.length ? 'inválida' : r.duplicate ? `duplicada (${r.duplicate.where})` : 'importada com aviso',
    detalhes: [...r.errors, ...(r.duplicate ? [`Duplicado: ${r.duplicate.detail}`] : []), ...r.warnings].join(' | '),
  }))
}

// ---------------- gravação em lote / desfazer ----------------
export function commitImport(tenantId: ID, entity: ImportEntity, results: RowResult[], opts: { unitId: ID; fileName: string; actor: { id: ID; name: string }; segmentIsVet?: boolean }): ImportBatch {
  const ok = results.filter((r) => !r.errors.length && !r.duplicate)
  if (!ok.length) throw new Error('Nenhuma linha válida para importar.')
  const batchId = uid('imp_')
  const at = nowISO()
  const base = { tenantId, createdAt: at }
  const s = (v: Parsed) => (typeof v === 'string' ? v : undefined)
  const ids: ID[] = []
  if (entity === 'pacientes') {
    const recs: Patient[] = ok.map((r) => {
      const v = r.values
      const animal = !!v.especie || !!opts.segmentIsVet
      const id = uid('pat_'); ids.push(id)
      return { ...base, id, kind: animal ? 'animal' : 'human', name: s(v.nome)!, cpf: s(v.cpf), birthDate: s(v.nascimento), sex: (s(v.sexo) as Patient['sex']) ?? 'nao_informado', phone: s(v.telefone), email: s(v.email), species: s(v.especie), allergies: (v.alergias as string[]) ?? [], clinicalAlerts: [], tags: ['Importado'], unitId: opts.unitId, status: 'ativo', pendingDocuments: [], sharing: { portal: false, multidisciplinar: false } }
    })
    db.set(tenantId, 'patients', [...db.list(tenantId, 'patients'), ...recs])
  } else if (entity === 'profissionais') {
    const recs: Professional[] = ok.map((r, i) => {
      const id = uid('pro_'); ids.push(id)
      return { ...base, id, name: s(r.values.nome)!, council: s(r.values.conselho)!, specialty: s(r.values.especialidade)!, unitIds: [opts.unitId], color: ['#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#059669'][i % 5], schedule: [], absences: [], active: true }
    })
    db.set(tenantId, 'professionals', [...db.list(tenantId, 'professionals'), ...recs])
  } else if (entity === 'servicos') {
    const recs: Service[] = ok.map((r) => {
      const id = uid('svc_'); ids.push(id)
      return { ...base, id, name: s(r.values.nome)!, category: s(r.values.categoria) ?? 'Importados', durationMin: Math.max(5, Number(r.values.duracao)), bufferMin: Number(r.values.intervalo ?? 0), priceCents: Number(r.values.preco), resourceKinds: [], publicBookable: r.values.publico === true, active: true, kit: [] }
    })
    db.set(tenantId, 'services', [...db.list(tenantId, 'services'), ...recs])
  } else {
    const recs: Product[] = ok.map((r) => {
      const id = uid('prd_'); ids.push(id)
      return { ...base, id, name: s(r.values.nome)!, sku: s(r.values.sku)!, category: s(r.values.categoria) ?? 'Importados', baseUnit: s(r.values.unidade)!, conversions: [], minQty: Number(r.values.minimo ?? 0), decimals: 0, allowNegative: false, costCents: Number(r.values.custo ?? 0), active: true }
    })
    db.set(tenantId, 'products', [...db.list(tenantId, 'products'), ...recs])
  }
  const sum = summarize(results)
  const batch: ImportBatch = {
    ...base, id: batchId, entity, fileName: opts.fileName.slice(0, 120), by: opts.actor.name, byId: opts.actor.id, status: 'concluido', recordIds: ids,
    counts: { rows: sum.rows, imported: ids.length, invalid: sum.invalid, duplicates: sum.duplicates },
    errors: results.filter((r) => r.errors.length).slice(0, 500).map((r) => ({ line: r.line, errors: r.errors })),
  }
  db.insert(tenantId, 'importBatches', batch)
  audit(tenantId, { actorId: opts.actor.id, actorName: opts.actor.name, action: 'importacao.concluida', resource: 'importBatches', resourceId: batchId, unitId: opts.unitId, detail: `${ENTITY_LABEL[entity]}: ${ids.length} importados, ${sum.invalid} inválidos, ${sum.duplicates} duplicados` })
  return batch
}

/** Desfaz: remove SOMENTE os registros criados pelo lote; mantém os que já ganharam vínculos (ex.: agendamento). */
export function undoImport(tenantId: ID, batchId: ID, actor: { id: ID; name: string }): { removed: number; kept: number } {
  const b = db.get(tenantId, 'importBatches', batchId)
  if (!b) throw new Error('Lote não encontrado.')
  if (b.status === 'desfeito') throw new Error('Este lote já foi desfeito.')
  const ids = new Set(b.recordIds)
  const appts = db.list(tenantId, 'appointments')
  const linked = new Set<ID>()
  if (b.entity === 'pacientes') appts.forEach((a) => ids.has(a.patientId) && linked.add(a.patientId))
  if (b.entity === 'profissionais') appts.forEach((a) => ids.has(a.professionalId) && linked.add(a.professionalId))
  if (b.entity === 'servicos') appts.forEach((a) => ids.has(a.serviceId) && linked.add(a.serviceId))
  if (b.entity === 'produtos') db.list(tenantId, 'stockMovements').forEach((m) => ids.has(m.productId) && linked.add(m.productId))
  const drop = (x: { id: ID }) => !(ids.has(x.id) && !linked.has(x.id))
  const before = { pacientes: 'patients', profissionais: 'professionals', servicos: 'services', produtos: 'products' } as const
  const col = before[b.entity]
  const list = db.list(tenantId, col) as { id: ID }[]
  const next = list.filter(drop)
  db.set(tenantId, col, next as never)
  const removed = list.length - next.length
  db.update(tenantId, 'importBatches', batchId, { status: 'desfeito', undoneAt: nowISO(), undoneBy: actor.name, keptIds: [...linked] })
  audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'importacao.desfeita', resource: 'importBatches', resourceId: batchId, detail: `${removed} removidos${linked.size ? `, ${linked.size} mantidos por vínculos` : ''}` })
  return { removed, kept: linked.size }
}
