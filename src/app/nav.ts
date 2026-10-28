// Registro de navegação da equipe. Módulo desligado (feature flag) some do menu; permissão é checada separadamente.
import type { ModuleKey } from '@/domain/types'
import type { Resource } from '@/domain/permissions'
import {
  LayoutDashboard, CalendarDays, ConciergeBell, ListOrdered, Users, FileText, ClipboardList, Stethoscope, Smile, PawPrint, Sparkles, Brain,
  Activity, Apple, Network, ShieldCheck, Kanban, Receipt, Wallet, Percent, Calculator, Package, ShoppingCart, MessageSquare, Bot, Workflow,
  BarChart3, Upload, Settings, Palette, KeyRound, ScrollText, LifeBuoy, Rocket, FileSignature, type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  path: string // relativo a /app/:slug
  label: string
  icon: LucideIcon
  group: 'Operação' | 'Clínico' | 'Especialidade' | 'Comercial' | 'Financeiro' | 'Suprimentos' | 'Relacionamento' | 'Gestão'
  module?: ModuleKey
  resource?: Resource
  /** Prioridade no menu inferior mobile (1..4). */
  mobile?: number
  tour?: string
}

export const STAFF_NAV: NavItem[] = [
  { path: '', label: 'Início', icon: LayoutDashboard, group: 'Operação', mobile: 1 },
  { path: 'agenda', label: 'Agenda', icon: CalendarDays, group: 'Operação', module: 'agenda', resource: 'agenda', mobile: 2, tour: 'nav-agenda' },
  { path: 'recepcao', label: 'Recepção', icon: ConciergeBell, group: 'Operação', module: 'recepcao', resource: 'recepcao', mobile: 3, tour: 'nav-recepcao' },
  { path: 'lista-espera', label: 'Lista de espera', icon: ListOrdered, group: 'Operação', module: 'agenda', resource: 'agenda' },
  { path: 'pacientes', label: 'Pacientes', icon: Users, group: 'Clínico', module: 'pacientes', resource: 'pacientes', mobile: 4 },
  { path: 'documentos', label: 'Documentos', icon: FileText, group: 'Clínico', module: 'documentos', resource: 'documentos' },
  { path: 'formularios', label: 'Formulários', icon: ClipboardList, group: 'Clínico', module: 'prontuario', resource: 'clinical' },
  { path: 'odontologia', label: 'Odontologia', icon: Smile, group: 'Especialidade', module: 'odontologia', resource: 'clinical' },
  { path: 'medicina', label: 'Medicina', icon: Stethoscope, group: 'Especialidade', module: 'medicina', resource: 'clinical' },
  { path: 'convenios', label: 'Convênios', icon: ShieldCheck, group: 'Especialidade', module: 'convenios', resource: 'financeiro' },
  { path: 'veterinaria', label: 'Veterinária', icon: PawPrint, group: 'Especialidade', module: 'veterinaria', resource: 'clinical' },
  { path: 'estetica', label: 'Estética', icon: Sparkles, group: 'Especialidade', module: 'estetica', resource: 'clinical' },
  { path: 'psicologia', label: 'Psicologia', icon: Brain, group: 'Especialidade', module: 'psicologia', resource: 'clinical_restricted' },
  { path: 'fisioterapia', label: 'Fisioterapia', icon: Activity, group: 'Especialidade', module: 'fisioterapia', resource: 'clinical' },
  { path: 'nutricao', label: 'Nutrição', icon: Apple, group: 'Especialidade', module: 'nutricao', resource: 'clinical' },
  { path: 'multidisciplinar', label: 'Plano de cuidado', icon: Network, group: 'Especialidade', module: 'multidisciplinar', resource: 'clinical' },
  { path: 'crm', label: 'CRM', icon: Kanban, group: 'Comercial', module: 'crm', resource: 'crm' },
  { path: 'orcamentos', label: 'Orçamentos', icon: Receipt, group: 'Comercial', module: 'orcamentos', resource: 'orcamentos' },
  { path: 'financeiro', label: 'Financeiro', icon: Wallet, group: 'Financeiro', module: 'financeiro', resource: 'financeiro', tour: 'nav-financeiro' },
  { path: 'comissoes', label: 'Comissões e repasses', icon: Percent, group: 'Financeiro', module: 'comissoes', resource: 'comissoes' },
  { path: 'precificacao', label: 'Precificação', icon: Calculator, group: 'Financeiro', module: 'financeiro', resource: 'financeiro' },
  { path: 'estoque', label: 'Estoque', icon: Package, group: 'Suprimentos', module: 'estoque', resource: 'estoque', tour: 'nav-estoque' },
  { path: 'compras', label: 'Compras e equipamentos', icon: ShoppingCart, group: 'Suprimentos', module: 'compras', resource: 'compras' },
  { path: 'comunicacao', label: 'Comunicação', icon: MessageSquare, group: 'Relacionamento', module: 'comunicacao', resource: 'comunicacao' },
  { path: 'ia', label: 'Assistente IA', icon: Bot, group: 'Relacionamento', module: 'ia', resource: 'ia' },
  { path: 'automacoes', label: 'Automações', icon: Workflow, group: 'Relacionamento', module: 'automacoes', resource: 'automacoes' },
  { path: 'relatorios', label: 'Relatórios', icon: BarChart3, group: 'Gestão', module: 'relatorios', resource: 'relatorios' },
  { path: 'importacao', label: 'Importação', icon: Upload, group: 'Gestão', module: 'importacao', resource: 'importacao' },
  { path: 'configuracoes', label: 'Configurações', icon: Settings, group: 'Gestão', resource: 'configuracoes', tour: 'nav-config' },
  { path: 'marca', label: 'Marca e app (PWA)', icon: Palette, group: 'Gestão', resource: 'marca', tour: 'nav-marca' },
  { path: 'permissoes', label: 'Permissões', icon: KeyRound, group: 'Gestão', resource: 'equipe' },
  { path: 'auditoria', label: 'Auditoria', icon: ScrollText, group: 'Gestão', resource: 'auditoria' },
  { path: 'onboarding', label: 'Configuração inicial', icon: Rocket, group: 'Gestão', resource: 'configuracoes' },
  { path: 'meu-plano', label: 'Meu plano e contrato', icon: FileSignature, group: 'Gestão', resource: 'configuracoes' },
  { path: 'ajuda', label: 'Ajuda e treinamento', icon: LifeBuoy, group: 'Gestão' },
]

export const MASTER_NAV = [
  { path: '', label: 'Dashboard', area: 'dashboard' },
  { path: 'contratantes', label: 'Contratantes', area: 'contratantes' },
  { path: 'planos', label: 'Planos', area: 'planos' },
  { path: 'testes', label: 'Testes (trial)', area: 'testes' },
  { path: 'assinaturas', label: 'Assinaturas', area: 'assinaturas' },
  { path: 'cobranca', label: 'Cobrança SaaS', area: 'cobranca' },
  { path: 'contratos', label: 'Contratos SaaS', area: 'contratos' },
  { path: 'contratacao', label: 'Contratação', area: 'contratos' },
  { path: 'integracoes', label: 'Integrações', area: 'integracoes' },
  { path: 'dominios', label: 'Domínios e PWA', area: 'dominios' },
  { path: 'suporte', label: 'Suporte', area: 'suporte' },
  { path: 'operacao', label: 'Operação', area: 'operacao' },
  { path: 'governanca', label: 'Governança', area: 'governanca' },
  { path: 'custos', label: 'Custos e margem', area: 'custos' },
] as const
