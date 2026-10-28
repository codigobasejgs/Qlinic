// Coleções da contratação SaaS (plataforma) + seeds demonstrativos.
// Demo: tudo fictício em localStorage. Produção: tabelas privadas com RLS (docs/contratacao/MODELO_SUPABASE.md).
import { platformDb, registerPlatformSeed } from '@/data/store'
import '@/data/platformSeed'
import { buildOffer, legalProfileFromJson, renderContract, snapshotHash, templateBodyFromMinuta, type CommercialTerms, type ContractTemplateVersion, type LegalProfile, type SaasContract, type SignatureEnvelope } from '@/domain/contracts'
import { demoBaseDate, zonedParts } from '@/lib/dates'
import { fakeCNPJ, fakeCPF } from '@/lib/util'
import dados from '../../../docs/contratacao/dados-contratada.json'
import minuta from '../../../docs/contratacao/CONTRATO_QLINIC_MINUTA.md?raw'

declare module '@/data/store' {
  interface PlatformCollections {
    legalProfile: LegalProfile[]
    commercialTerms: CommercialTerms[]
    contractTemplates: ContractTemplateVersion[]
    saasContracts: SaasContract[]
    signatureEnvelopes: SignatureEnvelope[]
  }
}

const iso = (daysAgo: number) => new Date(demoBaseDate().getTime() - daysAgo * 86400000).toISOString()
const civil = (daysAgo: number) => zonedParts(new Date(demoBaseDate().getTime() - daysAgo * 86400000)).date

export const SEED_TERMS: CommercialTerms = {
  id: 'terms_v1', version: 1, status: 'pending', trialDays: 14, setupFeeCents: 0, paymentDueDays: 3, gateway: 'asaas', signaturesIncluded: 0,
  renewal: 'Automática ao fim de cada ciclo somente se houver autorização de cobrança recorrente no meio de pagamento; sem essa autorização, a continuidade depende de nova confirmação do contratante.',
  accessStart: 'Após a assinatura de todas as partes e a confirmação do pagamento inicial; no teste gratuito, após as assinaturas.',
  billingStart: 'Na emissão da primeira cobrança, depois da assinatura do contratante; sem cobrança durante o teste gratuito.',
  trialRule: 'Ao fim do teste não há cobrança automática: a continuidade exige escolha de ciclo e nova confirmação de pagamento.',
  cancellation: 'Pelo painel ou canal contratual, com protocolo; efeito ao fim do ciclo vigente, sem multa; não há reembolso proporcional do ciclo em curso, ressalvados os direitos legais de arrependimento e restituição.',
  lateFees: 'Sem encargos por atraso nesta oferta.',
  adjustment: 'Sem reajuste durante o ciclo contratado; eventual reajuste na renovação será comunicado com 30 dias de antecedência e exigirá nova concordância.',
  loyalty: 'Sem fidelidade e sem multa rescisória.',
  support: 'Central de ajuda e chamados no painel, em dias úteis, das 9h às 18h (horário de Brasília); prazos por prioridade exibidos na central.',
  sla: 'Sem SLA de disponibilidade contratado nesta oferta; manutenções programadas comunicadas com antecedência quando previsíveis.',
  backup: 'Rotina de backup conforme o plano do provedor de infraestrutura, informada no painel; restauração sob solicitação, sem prazo garantido nesta oferta.',
  exportWindow: '30 dias após o encerramento, em CSV/JSON pelo painel ou mediante solicitação.',
  deletion: 'Dados ativos eliminados ou bloqueados após o prazo de exportação, ressalvadas obrigações legais de retenção.',
  backupExpiry: 'Cópias de backup expiram no ciclo de retenção do provedor, sem recuperação para uso comercial após o encerramento.',
}

export const SEED_TEMPLATE_BODY = templateBodyFromMinuta(minuta)
export const MINUTA_MD = minuta

registerPlatformSeed('legalProfile', () => [legalProfileFromJson(dados, iso(0))])
registerPlatformSeed('commercialTerms', () => [SEED_TERMS])
registerPlatformSeed('contractTemplates', () => [{
  id: 'tpl_saas_v1', templateId: 'tpl_saas', version: 1, title: 'Contrato de licença de uso de software e prestação de serviços SaaS', body: SEED_TEMPLATE_BODY,
  status: 'minuta', legalReviewDone: false, commercialReviewDone: false, createdAt: iso(0), createdBy: 'Importado de docs/contratacao (minuta 1.0)',
}])

/** Histórico demonstrativo: contrato assinado (simulado) da Clínica Vitta. Dados 100% fictícios. */
registerPlatformSeed('saasContracts', () => {
  const plan = platformDb.list('plans').find((p) => p.id === 'plan_pro')
  const profile = platformDb.list('legalProfile')[0]
  const tpl = platformDb.list('contractTemplates')[0]
  if (!plan || !profile || !tpl) return []
  const offer = buildOffer(plan, SEED_TERMS, 'mensal', false, civil(300))
  const contractor = { kind: 'pj' as const, legalName: 'Vitta Medicina Ambulatorial Ltda. (fictícia)', tradeName: 'Clínica Vitta', document: fakeCNPJ(17).replace(/\D/g, ''), segment: 'medicina' as const, units: 1, address: { cep: '00000-100', street: 'Rua Exemplo', number: '100', complement: 'Sala 2', district: 'Centro Fictício', city: 'Belo Horizonte', uf: 'MG' }, email: 'contrato@clinica-vitta.exemplo.test', phone: '(00) 3000-0100' }
  const signatory = { name: 'Helena Prado Exemplo', document: fakeCPF(4021).replace(/\D/g, ''), role: 'sócia-administradora', email: 'helena@clinica-vitta.exemplo.test' }
  const sections = renderContract({ number: 'QLC-2026-0001', kind: 'contrato', templateVersion: 1, templateBody: tpl.body, offer, contractor, signatory, provider: profile })
  return [{
    id: 'ctr_vitta', number: 'QLC-2026-0001', kind: 'contrato', draftKey: 'seed', tenantId: 'org_vitta', revision: 1, templateId: 'tpl_saas', templateVersion: 1,
    offer, contractor, signatory, provider: profile, acceptances: { terms: iso(300), powers: iso(300), privacyNotice: iso(300), marketing: false },
    status: 'signed', payment: { status: 'confirmed', provider: 'asaas', amountCents: offer.totalCents, attempts: 1, idempotencyKey: 'ctr_vitta:1', providerRef: 'sim_seed_vitta', processedEvents: ['pay_seed_1'], updatedAt: iso(299) },
    saasStatus: 'active', envelopeId: 'env_vitta', snapshot: { sections, hash: snapshotHash(sections), frozenAt: iso(300) },
    createdAt: iso(301), updatedAt: iso(299), simulated: true,
    events: [
      { at: iso(301), type: 'rascunho', detail: 'Rascunho criado (simulação).', by: 'Contratante' },
      { at: iso(300), type: 'revisao', detail: 'Documento congelado para revisão.', by: 'Sistema' },
      { at: iso(300), type: 'assinatura', detail: 'Simulação concluída: contratante.', by: 'Provedor simulado' },
      { at: iso(300), type: 'assinatura', detail: 'Simulação concluída: contratada.', by: 'Provedor simulado' },
      { at: iso(299), type: 'pagamento', detail: 'Pagamento simulado confirmado.', by: 'Gateway simulado' },
      { at: iso(299), type: 'ativacao', detail: 'Acesso ativado após assinaturas e pagamento.', by: 'Sistema' },
    ],
  }]
})
registerPlatformSeed('signatureEnvelopes', () => {
  const c = platformDb.list('saasContracts').find((x) => x.id === 'ctr_vitta')
  if (!c?.snapshot) return []
  return [{
    id: 'env_vitta', contractId: c.id, provider: 'mock', status: 'completed', documentHash: c.snapshot.hash, createdAt: iso(300), expiresAt: iso(293), completedAt: iso(300), simulated: true,
    processedEvents: ['ev_seed_1', 'ev_seed_2', 'ev_seed_3'],
    signers: [
      { id: 'sg_seed_1', role: 'contratante', name: c.signatory.name, email: c.signatory.email, order: 1, status: 'signed', at: iso(300), eventId: 'ev_seed_2', method: 'Simulação concluída' },
      { id: 'sg_seed_2', role: 'contratada', name: 'Signatário autorizado (simulado)', email: 'contratos@qlinic.exemplo.test', order: 2, status: 'signed', at: iso(300), eventId: 'ev_seed_3', method: 'Simulação concluída' },
    ],
    events: [
      { id: 'ev_seed_1', at: iso(300), type: 'sent', detail: 'Envelope criado (simulação, nada enviado).', result: 'aplicado' },
      { id: 'ev_seed_2', at: iso(300), type: 'signer.signed', detail: 'Assinatura de contratante registrada.', result: 'aplicado' },
      { id: 'ev_seed_3', at: iso(300), type: 'signer.signed', detail: 'Assinatura de contratada registrada.', result: 'aplicado' },
    ],
  }]
})
