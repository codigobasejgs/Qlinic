// Utilidades de UI do Super Admin: guarda de área, rótulos, cartão de métrica com definição/período.
import { useState, type ReactNode } from 'react'
import { ShieldOff } from 'lucide-react'
import { useSession } from '@/app/session'
import { usePlatformCollection } from '@/data/store'
import { canPlatform, PLATFORM_ROLE_LABEL } from '@/domain/permissions'
import type { PlatformRole, TenantStatus } from '@/domain/types'
import type { BillingCycle, DataRequest, DomainConfig, Incident, IntegrationHealth, IntegrationProviderKey, SaasInvoice, SubscriptionStatus, SupportTicket } from '@/domain/platform'
import { EmptyState, PageHeader, type Tone } from '@/ui/core'
import { parseBRL } from '@/lib/money'

export type Area = 'dashboard' | 'contratantes' | 'planos' | 'testes' | 'assinaturas' | 'cobranca' | 'integracoes' | 'dominios' | 'suporte' | 'operacao' | 'governanca' | 'custos'
export const AREA_LABEL: Record<Area, string> = {
  dashboard: 'Dashboard', contratantes: 'Contratantes', planos: 'Planos', testes: 'Testes (trial)', assinaturas: 'Assinaturas', cobranca: 'Cobrança SaaS',
  integracoes: 'Integrações', dominios: 'Domínios e PWA', suporte: 'Suporte', operacao: 'Operação', governanca: 'Governança', custos: 'Custos e margem',
}

/** Usuário da plataforma da sessão atual. MasterLayout já garante kind 'platform'. */
export function usePlatformMe() {
  const s = useSession()
  const users = usePlatformCollection('platformUsers')
  const role: PlatformRole = s?.kind === 'platform' ? s.role : 'platform_support'
  const userId = s?.kind === 'platform' ? s.userId : ''
  const user = users.find((u) => u.id === userId)
  const name = user?.name ?? PLATFORM_ROLE_LABEL[role]
  return { role, userId, name, actor: { id: userId, name }, can: (a: Area) => s?.kind === 'platform' && !!user?.active && user.role === role && canPlatform(role, a) }
}

/** Estado explicativo quando o papel não acessa a área (não esconde silenciosamente). */
export function Guard({ area, title, children }: { area: Area; title: string; children: ReactNode }) {
  const me = usePlatformMe()
  if (me.can(area)) return <>{children}</>
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={<ShieldOff aria-hidden="true" />} title="Seu perfil não acessa esta área">
        {PLATFORM_ROLE_LABEL[me.role]} não tem permissão para “{AREA_LABEL[area]}” na matriz da plataforma. Peça ao proprietário da plataforma, se necessário. Suporte nunca recebe leitura de prontuário.
      </EmptyState>
    </>
  )
}

/** Explica por que uma ação está indisponível para o papel. */
export function NoPermNote({ area }: { area: Area }) {
  const me = usePlatformMe()
  if (me.can(area)) return null
  return <p className="small muted" role="note">Ações desta seção exigem acesso a “{AREA_LABEL[area]}” — indisponível para {PLATFORM_ROLE_LABEL[me.role]}.</p>
}

/** Métrica com definição e período sempre acessíveis (disclosure por teclado). */
export function MetricCard({ label, value, foot, definition, period }: { label: string; value: ReactNode; foot?: ReactNode; definition: ReactNode; period: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="kpi pl-metric">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {foot && <span className="kpi-foot">{foot}</span>}
      <button type="button" className="pl-def-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? 'Ocultar definição' : 'Definição e período'}</button>
      {open && <div className="pl-def small"><p><strong>Definição:</strong> {definition}</p><p><strong>Período:</strong> {period}</p></div>}
    </div>
  )
}

export const pct = (r: number | null, digits = 1) => (r == null ? '—' : `${(r * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })}%`)

export const CYCLE_LABEL: Record<BillingCycle, string> = { mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' }
export const SUB_STATUS: Record<SubscriptionStatus, [string, Tone]> = {
  trial: ['Em teste', 'info'], ativa: ['Ativa', 'success'], inadimplente: ['Inadimplente', 'danger'], pausada: ['Pausada', 'warning'], cancelada: ['Cancelada', 'neutral'], expirada: ['Expirada', 'neutral'],
}
export const ORG_STATUS: Record<TenantStatus, [string, Tone]> = {
  trial: ['Em teste', 'info'], active: ['Ativa', 'success'], past_due: ['Inadimplente', 'danger'], suspended: ['Suspensa', 'warning'], cancelled: ['Cancelada', 'neutral'], onboarding: ['Em configuração', 'info'],
}
export const INVOICE_STATUS: Record<SaasInvoice['status'], [string, Tone]> = {
  aberta: ['Aberta', 'info'], paga: ['Paga', 'success'], vencida: ['Vencida', 'danger'], estornada: ['Estornada', 'warning'], cancelada: ['Cancelada', 'neutral'],
}
export const PROVIDER_LABEL: Record<IntegrationProviderKey, string> = {
  infinitepay: 'InfinitePay', asaas: 'Asaas', mercadopago: 'Mercado Pago', resend: 'Resend (e-mail)', evolution: 'Evolution API (WhatsApp)', pix_manual: 'Pix manual',
  assinatura: 'Assinatura eletrônica', ia: 'IA', teleatendimento: 'Teleatendimento', prescricao: 'Prescrição', nfse: 'NFS-e',
}
export const INT_STATUS: Record<IntegrationHealth['status'], [string, Tone]> = {
  desconectada: ['Desconectada', 'neutral'], configurando: ['Configurando', 'info'], conectada: ['Conectada', 'success'], degradada: ['Degradada', 'warning'],
  expirada: ['Expirada', 'warning'], erro: ['Erro', 'danger'], simulada: ['Simulada', 'sim'],
}
export const DOMAIN_STATUS: Record<DomainConfig['status'], [string, Tone]> = {
  pendente: ['Pendente', 'neutral'], verificando: ['Verificando', 'info'], verificado: ['Verificado', 'success'], erro: ['Erro', 'danger'], removido: ['Removido', 'neutral'],
}
export const CERT_STATUS: Record<DomainConfig['certificate'], [string, Tone]> = {
  nao_emitido: ['Não emitido', 'neutral'], pendente: ['Pendente', 'info'], ativo: ['Ativo', 'success'], expirando: ['Expirando', 'warning'], erro: ['Erro', 'danger'],
}
export const TICKET_STATUS: Record<SupportTicket['status'], [string, Tone]> = {
  aberto: ['Aberto', 'info'], em_andamento: ['Em andamento', 'brand'], aguardando_cliente: ['Aguardando cliente', 'warning'], resolvido: ['Resolvido', 'success'], fechado: ['Fechado', 'neutral'],
}
export const PRIORITY: Record<SupportTicket['priority'], [string, Tone]> = { baixa: ['Baixa', 'neutral'], media: ['Média', 'info'], alta: ['Alta', 'warning'], critica: ['Crítica', 'danger'] }
export const DEFAULT_SLA: Record<SupportTicket['priority'], number> = { critica: 4, alta: 8, media: 24, baixa: 72 }
export const INC_SEV: Record<Incident['severity'], [string, Tone]> = { menor: ['Menor', 'info'], maior: ['Maior', 'warning'], critico: ['Crítico', 'danger'] }
export const INC_STATUS: Record<Incident['status'], string> = { investigando: 'Investigando', identificado: 'Identificado', monitorando: 'Monitorando', resolvido: 'Resolvido' }
export const DR_STATUS: Record<DataRequest['status'], [string, Tone]> = { recebida: ['Recebida', 'info'], em_analise: ['Em análise', 'brand'], aprovada: ['Aprovada', 'warning'], concluida: ['Concluída', 'success'], recusada: ['Recusada', 'neutral'] }
export const DR_KIND: Record<DataRequest['kind'], string> = { exportacao: 'Exportação de dados', encerramento: 'Encerramento de conta' }

export function centsToInput(c: number) { return (c / 100).toFixed(2).replace('.', ',') }
/** Converte campo de moeda; lança erro legível. */
export function requireBRL(v: string, label: string) {
  const c = parseBRL(v)
  if (c == null || c < 0) throw new Error(`${label}: valor inválido.`)
  return c
}
export function requireInt(v: string, label: string, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label}: informe um inteiro entre ${min} e ${max}.`)
  return n
}

export const HOUR = 3600000
export function formatDuration(ms: number) {
  const abs = Math.abs(ms)
  const h = Math.floor(abs / HOUR), m = Math.floor((abs % HOUR) / 60000)
  const d = Math.floor(h / 24)
  return d >= 1 ? `${d}d ${h % 24}h` : `${h}h ${String(m).padStart(2, '0')}min`
}
