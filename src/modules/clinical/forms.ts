// Regras puras do construtor de formulários: condição showIf, validação, versão imutável.
import type { FormField, FormTemplate } from '@/domain/modules'
import type { ID } from '@/domain/types'

export const FIELD_TYPE_LABEL: Record<FormField['type'], string> = {
  text: 'Texto curto', textarea: 'Texto longo', number: 'Número', date: 'Data', single: 'Opção única', multi: 'Múltipla escolha', boolean: 'Sim/Não', section: 'Seção (título)',
}

/** Valor normalizado para comparar com showIf.equals (booleano vira "sim"/"nao"; múltipla = contém). */
function matches(v: unknown, equals: string): boolean {
  if (Array.isArray(v)) return v.map(String).includes(equals)
  if (typeof v === 'boolean') return (v ? 'sim' : 'nao') === equals.toLowerCase()
  return v != null && String(v) === equals
}

/** Campos visíveis dado o conjunto de respostas. Condição encadeada: se o campo-fonte está oculto, o dependente também fica. */
export function visibleFields(fields: FormField[], answers: Record<ID, unknown>): FormField[] {
  const visible = new Set<ID>()
  for (const f of fields) {
    if (!f.showIf) { visible.add(f.id); continue }
    if (visible.has(f.showIf.fieldId) && matches(answers[f.showIf.fieldId], f.showIf.equals)) visible.add(f.id)
  }
  return fields.filter((f) => visible.has(f.id))
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

/** Valida respostas: obrigatórios (só visíveis), número com min/max, opções válidas. Campos ocultos são ignorados. */
export function validateAnswers(fields: FormField[], answers: Record<ID, unknown>): Record<ID, string> {
  const errors: Record<ID, string> = {}
  for (const f of visibleFields(fields, answers)) {
    if (f.type === 'section') continue
    const v = answers[f.id]
    if (isEmpty(v)) {
      if (f.required && f.type !== 'boolean') errors[f.id] = 'Campo obrigatório.'
      if (f.required && f.type === 'boolean' && v === undefined) errors[f.id] = 'Selecione sim ou não.'
      continue
    }
    if (f.type === 'number') {
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
      if (!Number.isFinite(n)) errors[f.id] = 'Informe um número válido.'
      else if (f.min != null && n < f.min) errors[f.id] = `O valor mínimo é ${f.min}.`
      else if (f.max != null && n > f.max) errors[f.id] = `O valor máximo é ${f.max}.`
    }
    if ((f.type === 'text' || f.type === 'textarea') && typeof v === 'string') {
      if (f.min != null && v.trim().length < f.min) errors[f.id] = `Mínimo de ${f.min} caracteres.`
      else if (f.max != null && v.length > f.max) errors[f.id] = `Máximo de ${f.max} caracteres.`
    }
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errors[f.id] = 'Data inválida.'
    if (f.type === 'single' && f.options && !f.options.includes(String(v))) errors[f.id] = 'Opção inválida.'
    if (f.type === 'multi' && Array.isArray(v)) {
      if (f.options && v.some((x) => !f.options!.includes(String(x)))) errors[f.id] = 'Opção inválida.'
      else if (f.min != null && v.length < f.min) errors[f.id] = `Selecione ao menos ${f.min}.`
      else if (f.max != null && v.length > f.max) errors[f.id] = `Selecione no máximo ${f.max}.`
    }
  }
  return errors
}

/** Remove respostas de campos ocultos (não persistir dado de condição não atendida). */
export function pruneHidden(fields: FormField[], answers: Record<ID, unknown>): Record<ID, unknown> {
  const ids = new Set(visibleFields(fields, answers).map((f) => f.id))
  return Object.fromEntries(Object.entries(answers).filter(([k]) => ids.has(k)))
}

/** Problemas estruturais do esquema antes de publicar. */
export function validateSchema(fields: FormField[]): string[] {
  const out: string[] = []
  if (!fields.some((f) => f.type !== 'section')) out.push('Adicione ao menos uma pergunta.')
  const seen = new Set<ID>()
  fields.forEach((f, i) => {
    if (!f.label.trim()) out.push(`Campo ${i + 1}: informe o rótulo.`)
    if ((f.type === 'single' || f.type === 'multi') && (!f.options || f.options.filter((o) => o.trim()).length < 2)) out.push(`"${f.label || `Campo ${i + 1}`}": informe ao menos 2 opções.`)
    if (f.min != null && f.max != null && f.min > f.max) out.push(`"${f.label}": mínimo maior que máximo.`)
    if (f.showIf) {
      if (!seen.has(f.showIf.fieldId)) out.push(`"${f.label}": a condição deve depender de um campo ANTERIOR.`)
      else if (!f.showIf.equals.trim()) out.push(`"${f.label}": informe o valor da condição.`)
    }
    seen.add(f.id)
  })
  return out
}

/** Publica nova versão IMUTÁVEL (versões anteriores preservadas, respostas antigas continuam ligadas à sua versão). */
export function publishVersion(tpl: FormTemplate, fields: FormField[], at: string): FormTemplate {
  const problems = validateSchema(fields)
  if (problems.length) throw new Error(problems[0])
  const version = Math.max(0, ...tpl.versions.map((v) => v.version)) + 1
  const frozen = JSON.parse(JSON.stringify(fields)) as FormField[]
  return { ...tpl, versions: [...tpl.versions, { version, publishedAt: at, fields: frozen }], currentVersion: version }
}

export function versionOf(tpl: FormTemplate, version: number) {
  return tpl.versions.find((v) => v.version === version)
}
