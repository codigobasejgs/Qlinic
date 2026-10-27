// Permissões DEMONSTRATIVAS: recurso + ação + unidade + vínculo.
// Isto organiza a UI; NÃO é controle de acesso real. Produção: autorização no servidor + RLS.
import type { ID, Membership, PlatformRole, TenantRole } from './types'

export type Resource =
  | 'agenda' | 'recepcao' | 'pacientes' | 'clinical' | 'clinical_restricted' | 'documentos' | 'arquivos'
  | 'orcamentos' | 'crm' | 'financeiro' | 'caixa' | 'comissoes' | 'estoque' | 'compras' | 'relatorios'
  | 'configuracoes' | 'equipe' | 'integracoes' | 'comunicacao' | 'automacoes' | 'ia' | 'importacao' | 'auditoria' | 'marca'
export type Action = 'read' | 'create' | 'update' | 'delete' | 'approve' | 'export'

/** 'own' = somente registros vinculados ao próprio profissional. */
type Grant = Partial<Record<Action, true | 'own'>>
type RoleMatrix = Partial<Record<Resource, Grant>>

const ALL: Grant = { read: true, create: true, update: true, delete: true, approve: true, export: true }
const RW: Grant = { read: true, create: true, update: true }
const R: Grant = { read: true }

export const TENANT_ROLE_LABEL: Record<TenantRole, string> = {
  clinic_owner: 'Proprietário da clínica', network_manager: 'Gestor da rede', unit_manager: 'Gestor da unidade',
  reception: 'Recepção', professional: 'Profissional', assistant: 'Auxiliar', finance: 'Financeiro', inventory: 'Estoque',
}
export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  platform_owner: 'Proprietário da plataforma', platform_finance: 'Operador financeiro SaaS', platform_support: 'Suporte SaaS',
}

export const MATRIX: Record<TenantRole, RoleMatrix> = {
  clinic_owner: {
    agenda: ALL, recepcao: ALL, pacientes: ALL, clinical: R, documentos: { read: true, create: true }, arquivos: R, orcamentos: ALL, crm: ALL,
    financeiro: ALL, caixa: ALL, comissoes: ALL, estoque: ALL, compras: ALL, relatorios: ALL, configuracoes: ALL, equipe: ALL,
    integracoes: ALL, comunicacao: ALL, automacoes: ALL, ia: RW, importacao: ALL, auditoria: { read: true, export: true }, marca: ALL,
  },
  network_manager: {
    agenda: ALL, recepcao: ALL, pacientes: RW, documentos: R, orcamentos: ALL, crm: ALL, financeiro: { ...RW, approve: true, export: true },
    caixa: RW, comissoes: { read: true, approve: true }, estoque: ALL, compras: ALL, relatorios: ALL, configuracoes: RW, equipe: RW,
    integracoes: R, comunicacao: RW, automacoes: RW, ia: R, importacao: RW, auditoria: R, marca: RW,
  },
  unit_manager: {
    agenda: ALL, recepcao: ALL, pacientes: RW, documentos: R, orcamentos: RW, crm: RW, financeiro: RW, caixa: RW, comissoes: R,
    estoque: RW, compras: { ...RW, approve: true }, relatorios: R, configuracoes: { read: true, update: true }, equipe: R, comunicacao: RW, ia: R, auditoria: R,
  },
  reception: {
    agenda: ALL, recepcao: ALL, pacientes: RW, documentos: { read: true }, orcamentos: { read: true, create: true }, crm: RW,
    caixa: RW, financeiro: { read: true, create: true }, comunicacao: { read: true, create: true }, ia: R,
  },
  professional: {
    agenda: { read: true, update: 'own' }, recepcao: R, pacientes: { read: true, update: true }, clinical: { read: 'own', create: true, update: 'own', approve: 'own' },
    clinical_restricted: { read: 'own', create: true, update: 'own', approve: 'own' }, documentos: { read: true, create: true, update: 'own' },
    arquivos: RW, orcamentos: RW, comissoes: { read: 'own' }, estoque: R, ia: RW, relatorios: { read: 'own' },
  },
  assistant: { agenda: R, recepcao: R, pacientes: R, clinical: R, arquivos: RW, estoque: { read: true, update: true }, documentos: R },
  finance: { financeiro: ALL, caixa: ALL, comissoes: ALL, orcamentos: R, relatorios: { read: true, export: true }, pacientes: R, compras: { read: true, approve: true }, integracoes: R },
  inventory: { estoque: ALL, compras: RW, relatorios: R },
}

export interface AccessContext {
  memberships: Membership[]
  professionalId?: ID
}

export interface Check {
  resource: Resource
  action: Action
  unitId?: ID
  /** profissional dono do registro (para regra 'own'). */
  ownerProfessionalId?: ID
}

function unitAllowed(m: Membership, unitId?: ID) {
  return !unitId || m.unitIds === 'all' || m.unitIds.includes(unitId)
}

export function can(ctx: AccessContext, c: Check): boolean {
  for (const m of ctx.memberships) {
    if (!unitAllowed(m, c.unitId)) continue
    const g = MATRIX[m.role][c.resource]?.[c.action]
    if (g === true) return true
    if (g === 'own') {
      if (c.ownerProfessionalId === undefined) return true // listagem: filtrada depois por dono
      if (ctx.professionalId && c.ownerProfessionalId === ctx.professionalId) return true
    }
  }
  return false
}

/** Retorna 'all' | 'own' | false para escopo de listagem. */
export function scopeOf(ctx: AccessContext, resource: Resource, action: Action = 'read', unitId?: ID): 'all' | 'own' | false {
  let best: 'all' | 'own' | false = false
  for (const m of ctx.memberships) {
    if (!unitAllowed(m, unitId)) continue
    const g = MATRIX[m.role][resource]?.[action]
    if (g === true) return 'all'
    if (g === 'own') best = 'own'
  }
  return best
}

export function allowedUnitIds(ctx: AccessContext, allUnitIds: ID[]): ID[] {
  if (ctx.memberships.some((m) => m.unitIds === 'all')) return allUnitIds
  const s = new Set<ID>()
  ctx.memberships.forEach((m) => m !== null && m.unitIds !== 'all' && m.unitIds.forEach((u) => s.add(u)))
  return allUnitIds.filter((u) => s.has(u))
}

/** Plataforma: suporte NUNCA recebe leitura automática de prontuário. */
export const PLATFORM_MATRIX: Record<PlatformRole, string[]> = {
  platform_owner: ['dashboard', 'contratantes', 'planos', 'testes', 'assinaturas', 'cobranca', 'integracoes', 'dominios', 'suporte', 'operacao', 'governanca', 'custos'],
  platform_finance: ['dashboard', 'contratantes', 'planos', 'assinaturas', 'cobranca', 'custos'],
  platform_support: ['dashboard', 'contratantes', 'suporte', 'integracoes', 'dominios', 'operacao'],
}
export function canPlatform(role: PlatformRole, area: string) {
  return PLATFORM_MATRIX[role].includes(area)
}
