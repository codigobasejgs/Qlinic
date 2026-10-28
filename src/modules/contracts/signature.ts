// SignatureProviderAdapter: contrato estável entre o Qlinic e o provedor de assinatura eletrônica.
// mock = simulação local (nunca produz prova); future = esqueleto do provedor real, executado SÓ no servidor.
import type { EnvelopeEvent, EnvelopeSigner, SignatureEnvelope } from '@/domain/contracts'
import type { ID } from '@/domain/types'
import { nowISO } from '@/lib/dates'
import { uid } from '@/lib/util'

export interface CreateEnvelopeInput {
  contractId: ID
  documentHash: string
  /** Ordem: contratante (1) → contratada (2). Autenticação: e-mail + código (definir com o provedor). */
  signers: Omit<EnvelopeSigner, 'id' | 'status' | 'at' | 'eventId'>[]
  expiresInDays: number
  /** Retry com a mesma chave não cria segundo envelope. */
  idempotencyKey: string
}
export interface SignatureProviderAdapter {
  key: 'mock' | 'future'
  label: string
  real: boolean
  createEnvelope(i: CreateEnvelopeInput): SignatureEnvelope
  /** Eventos que o provedor devolveria via webhook (assinado e verificado no servidor). */
  signEvent(env: SignatureEnvelope, role: EnvelopeSigner['role']): EnvelopeEvent
  declineEvent(env: SignatureEnvelope, role: EnvelopeSigner['role'], reason: string): EnvelopeEvent
  cancelEvent(env: SignatureEnvelope, reason: string): EnvelopeEvent
  expireEvent(env: SignatureEnvelope): EnvelopeEvent
}

const ev = (env: SignatureEnvelope, type: EnvelopeEvent['type'], extra: Partial<EnvelopeEvent> = {}): EnvelopeEvent => ({ eventId: uid('evt_'), envelopeId: env.id, contractId: env.contractId, type, occurredAt: nowISO(), ...extra })

export const mockSignatureProvider: SignatureProviderAdapter = {
  key: 'mock', label: 'Simulação local', real: false,
  createEnvelope(i) {
    const at = nowISO()
    return {
      id: `env_${i.idempotencyKey.replace(/[^a-z0-9]/gi, '_')}`, contractId: i.contractId, provider: 'mock', status: 'created', documentHash: i.documentHash,
      signers: i.signers.map((s) => ({ ...s, id: uid('sg_'), status: 'pending' as const, method: 'Simulação (sem identificação real)' })),
      createdAt: at, expiresAt: new Date(Date.parse(at) + i.expiresInDays * 86400000).toISOString(), processedEvents: [], events: [], simulated: true,
    }
  },
  signEvent: (env, role) => ev(env, 'signer.signed', { signerRole: role }),
  declineEvent: (env, role, reason) => ev(env, 'signer.declined', { signerRole: role, reason }),
  cancelEvent: (env, reason) => ev(env, 'canceled', { reason }),
  expireEvent: (env) => ev(env, 'expired'),
}

const notAvailable = () => { throw new Error('Provedor de assinatura real ainda não contratado/homologado. A integração roda no servidor (Edge Function) com credenciais próprias — nunca no navegador.') }
/** Esqueleto do provedor real. Servidor: gera PDF + hash, cria envelope, recebe webhook assinado, guarda arquivo final e dossiê em storage privado. */
export const futureSignatureProvider: SignatureProviderAdapter = {
  key: 'future', label: 'Provedor real (a contratar)', real: true,
  createEnvelope: notAvailable, signEvent: notAvailable, declineEvent: notAvailable, cancelEvent: notAvailable, expireEvent: notAvailable,
}

export function signatureProvider(key: 'mock' | 'future'): SignatureProviderAdapter {
  return key === 'future' ? futureSignatureProvider : mockSignatureProvider
}
