// Ambiente real sem provedor de assinatura: envia SOLICITAÇÃO de contratação (não assina).
// O servidor recalcula preço/limites do catálogo, confere permissão na clínica e garante idempotência.
import type { ContractorParty, ContractorSignatory } from '@/domain/contracts'
import type { BillingCycle } from '@/domain/platform'
import { sha256Hex } from '@/lib/sha256'

export interface RequestInput {
  planId: string; cycle: BillingCycle; trial: boolean; tenantId: string | null
  contractor: ContractorParty; signatory: ContractorSignatory
  templateVersion: number; documentHash: string; clientTotalCents: number
  acceptances: { terms: boolean; powers: boolean; privacyNotice: boolean; marketing: boolean }
}
export interface RequestResult { id: string; protocol: string; status: string; total_cents: number; existing: boolean; kind?: 'nova' | 'alteracao' }

/** Chave idempotente = hash do conteúdo revisado: duplo clique/voltar reenvia a mesma solicitação. */
export const requestKey = (i: RequestInput) => sha256Hex(JSON.stringify([i.planId, i.cycle, i.trial, i.tenantId, i.documentHash]))

export async function submitContractRequest(i: RequestInput): Promise<RequestResult> {
  const { supabase, friendlyError } = await import('@/data/supabase/client')
  const { data: sess } = await supabase().auth.getSession()
  if (!sess.session) throw new Error('Sua sessão expirou. Entre novamente para enviar; os dados preenchidos continuam nesta página.')
  const { data, error } = await supabase().rpc('request_saas_contract', {
    p_plan: i.planId, p_cycle: i.cycle, p_trial: i.trial, p_tenant: i.tenantId,
    p_contractor: i.contractor, p_signatory: i.signatory, p_template_version: i.templateVersion, p_document_hash: i.documentHash,
    p_acceptances: i.acceptances, p_client_total_cents: i.clientTotalCents, p_idempotency_key: requestKey(i),
  })
  if (error) throw new Error(error.code === 'P0001' || error.code === '42501' ? error.message : friendlyError(error))
  return data as RequestResult
}
