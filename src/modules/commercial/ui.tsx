// Auxiliares de UI do módulo comercial.
import { useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { EmptyState, Input, Badge, type Tone } from '@/ui'
import { formatBRL, parseBRL, type Cents } from '@/lib/money'
import type { ChargeStatus, ProposalStatus } from '@/domain/types'
import './styles.css'

/** Campo monetário em R$ (texto pt-BR → centavos). Repassa null se inválido. */
export function MoneyInput({ value, onChange, id, ...rest }: { value: Cents | null; onChange: (c: Cents | null) => void; id?: string; required?: boolean; 'aria-describedby'?: string; 'aria-invalid'?: boolean; disabled?: boolean }) {
  const [text, setText] = useState(value == null ? '' : (value / 100).toFixed(2).replace('.', ','))
  const [last, setLast] = useState(value)
  if (value !== last) { setLast(value); setText(value == null ? '' : (value / 100).toFixed(2).replace('.', ',')) }
  return <Input id={id} inputMode="decimal" placeholder="0,00" value={text} {...rest} onChange={(e) => { setText(e.target.value); const c = parseBRL(e.target.value); setLast(c); onChange(c) }} />
}

export function NoAccess({ what }: { what: string }) {
  return <EmptyState icon={<Lock aria-hidden="true" />} title="Sem permissão para esta área">Seu perfil não pode acessar {what}. Peça ao proprietário ou gestor para ajustar a permissão em Equipe e permissões.</EmptyState>
}
export function ModuleOff({ name }: { name: string }) {
  return <EmptyState title={`Módulo ${name} desabilitado`}>Este módulo não está habilitado no plano desta clínica. O proprietário pode ativá-lo em Configurações.</EmptyState>
}

export const CHARGE_STATUS: Record<ChargeStatus, { label: string; tone: Tone }> = {
  aberta: { label: 'Aberta', tone: 'info' }, parcial: { label: 'Parcial', tone: 'warning' }, paga: { label: 'Paga', tone: 'success' }, vencida: { label: 'Vencida', tone: 'danger' }, cancelada: { label: 'Cancelada', tone: 'neutral' }, estornada: { label: 'Estornada', tone: 'neutral' },
}
export const PROPOSAL_STATUS: Record<ProposalStatus, { label: string; tone: Tone }> = {
  rascunho: { label: 'Rascunho', tone: 'neutral' }, enviada: { label: 'Enviada', tone: 'info' }, visualizada: { label: 'Visualizada', tone: 'info' }, aceita: { label: 'Aceita', tone: 'success' },
  aceita_parcial: { label: 'Aceita parcial', tone: 'success' }, recusada: { label: 'Recusada', tone: 'danger' }, expirada: { label: 'Expirada', tone: 'warning' }, revogada: { label: 'Revogada', tone: 'neutral' },
}
export function StatusBadge<K extends string>({ map, value }: { map: Record<K, { label: string; tone: Tone }>; value: K }) {
  const s = map[value]
  return <Badge tone={s?.tone ?? 'neutral'}>{s?.label ?? value}</Badge>
}

export function Money({ cents, tone }: { cents: Cents; tone?: 'neg' | 'pos' }) {
  return <span className={`num${tone === 'neg' ? ' com-neg' : tone === 'pos' ? ' com-pos' : ''}`}>{formatBRL(cents)}</span>
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="com-toolbar">{children}</div>
}

export const pct = (n: number, d = 1) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 })}%`
export const qtyFmt = (n: number, decimals: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: decimals })
