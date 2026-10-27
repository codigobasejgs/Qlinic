// Mapa coleção do store → armazenamento no Supabase. Fonte única para o adaptador remoto e para a migração 0004.
// table: tabela dedicada (colunas relacionais extraídas por `columns`) | genérica: public.tenant_documents.
// resource: recurso da matriz (src/domain/permissions.ts) usado pela RLS. portal: tipo de vínculo que libera leitura no portal.
import type { TenantCollectionName } from '@/data/store'

type Row = Record<string, unknown>
type Doc = Record<string, unknown> & { id: string }

export interface DedicatedTable {
  table: string
  /** colunas relacionais (além de tenant_id, id, data) derivadas do documento. */
  columns: (d: Doc) => Row
}

const s = (v: unknown) => (v == null ? null : String(v))

export const DEDICATED: Partial<Record<TenantCollectionName, DedicatedTable>> = {
  units: { table: 'units', columns: (d) => ({ name: d.name, timezone: d.timezone ?? 'America/Sao_Paulo' }) },
  resources: { table: 'resources', columns: (d) => ({ unit_id: d.unitId }) },
  professionals: { table: 'professionals', columns: (d) => ({ name: d.name, active: d.active !== false }) },
  services: { table: 'services', columns: (d) => ({ name: d.name, public_bookable: !!d.publicBookable, price_cents: d.priceCents ?? 0 }) },
  staff: { table: 'staff', columns: (d) => ({ email: s(d.email)?.toLowerCase() ?? null, professional_id: s(d.professionalId), active: d.active !== false, user_id: d.userId ?? null }) },
  persons: { table: 'persons', columns: (d) => ({ name: d.name, email: s(d.email)?.toLowerCase() ?? null }) },
  patients: { table: 'patients', columns: (d) => ({ unit_id: d.unitId, kind: d.kind, name: d.name, cpf: s(d.cpf), status: d.status ?? 'ativo' }) },
  links: {
    table: 'patient_links',
    columns: (d) => ({ patient_id: d.patientId, person_id: d.personId, relation: d.relation, can_clinical: !!d.canSeeClinical, can_financial: !!d.canSeeFinancial, can_schedule: !!d.canSchedule }),
  },
  appointments: {
    table: 'appointments',
    columns: (d) => ({
      unit_id: d.unitId, patient_id: d.patientId, professional_id: d.professionalId, service_id: d.serviceId,
      start_at: d.start, end_at: d.end, status: d.status, resource_ids: d.resourceIds ?? [], conflict_ack: !!d.conflictAcknowledged,
    }),
  },
  records: {
    table: 'clinical_records',
    columns: (d) => ({ patient_id: d.patientId, professional_id: d.professionalId, status: d.status, confidentiality: d.confidentiality ?? 'padrao', released_to_portal: !!d.releasedToPortal }),
  },
  documents: {
    table: 'documents',
    columns: (d) => ({ patient_id: d.patientId, confidentiality: d.confidentiality ?? 'padrao', released_to_portal: !!d.releasedToPortal, created_by: s(d.createdBy) }),
  },
  charges: {
    table: 'charges',
    columns: (d) => ({ unit_id: d.unitId, patient_id: d.patientId, status: d.status, due_date: d.dueDate, amount_cents: d.amountCents }),
  },
  outbox: { table: 'outbox', columns: (d) => ({ status: d.status, channel: d.channel, dedupe_key: d.dedupeKey }) },
  audit: { table: 'audit_events', columns: () => ({}) },
}

/** Coleções de módulo (tabela genérica). memberReadable: qualquer membro lê (configuração/catálogo do tenant). */
export const COLLECTION_RESOURCES: Record<string, { resource: string; memberReadable?: boolean; portal?: 'clinical' | 'financial' | 'schedule' | 'any' }> = {
  // núcleo sem tabela dedicada
  waitlist: { resource: 'agenda' }, files: { resource: 'arquivos', portal: 'clinical' }, treatmentItems: { resource: 'orcamentos', portal: 'financial' },
  proposals: { resource: 'orcamentos', portal: 'financial' }, settings: { resource: 'configuracoes', memberReadable: true }, freedSlots: { resource: 'agenda' },
  // domain/modules
  vaccines: { resource: 'clinical', portal: 'clinical' }, exercisePlans: { resource: 'clinical', portal: 'clinical' }, nutritionPlans: { resource: 'clinical', portal: 'clinical' },
  aestheticPackages: { resource: 'clinical', portal: 'clinical' }, formTemplates: { resource: 'clinical', memberReadable: true, portal: 'any' }, formResponses: { resource: 'clinical', portal: 'any' },
  products: { resource: 'estoque', memberReadable: true }, lots: { resource: 'estoque' }, stockMovements: { resource: 'estoque', memberReadable: true },
  cashSessions: { resource: 'caixa' }, leads: { resource: 'crm' }, portalRequests: { resource: 'recepcao', portal: 'any' },
  // clinical
  anamneses: { resource: 'clinical' }, dictations: { resource: 'clinical' }, recordSignatures: { resource: 'clinical' }, patientMerges: { resource: 'pacientes' },
  // commercial
  crmStages: { resource: 'crm', memberReadable: true }, relationshipMessages: { resource: 'crm' }, suppliers: { resource: 'compras' }, financeCategories: { resource: 'financeiro', memberReadable: true },
  costCenters: { resource: 'financeiro', memberReadable: true }, payables: { resource: 'financeiro' }, chargeAdjustments: { resource: 'financeiro' }, agreements: { resource: 'financeiro' },
  pixReviews: { resource: 'financeiro' }, commissionRules: { resource: 'comissoes' }, commissionClosings: { resource: 'comissoes' }, pricingScenarios: { resource: 'financeiro' },
  serviceKits: { resource: 'estoque', memberReadable: true }, purchaseOrders: { resource: 'compras' }, equipment: { resource: 'compras', memberReadable: true },
  // engagement
  notificationTemplates: { resource: 'comunicacao', memberReadable: true }, automations: { resource: 'automacoes', memberReadable: true }, automationRuns: { resource: 'automacoes', memberReadable: true },
  waConversations: { resource: 'comunicacao' }, clinicIntegrations: { resource: 'integracoes' }, emailDomains: { resource: 'comunicacao' }, emailConfig: { resource: 'comunicacao', memberReadable: true },
  suppressions: { resource: 'comunicacao', memberReadable: true }, staffAlertPrefs: { resource: 'comunicacao', memberReadable: true }, handoffTasks: { resource: 'comunicacao' },
  aiLogs: { resource: 'ia' }, commConfig: { resource: 'comunicacao', memberReadable: true },
  // settings
  importBatches: { resource: 'importacao' }, clinicProfile: { resource: 'configuracoes', memberReadable: true },
  // specialties/others
  hospitalizations: { resource: 'clinical' }, groomingNotes: { resource: 'agenda' }, aestheticApplications: { resource: 'clinical' }, aestheticComparisons: { resource: 'clinical' },
  psychPlans: { resource: 'clinical_restricted' }, guardianDecisions: { resource: 'clinical_restricted' }, physioAssessments: { resource: 'clinical' }, physioGoals: { resource: 'clinical' },
  physioPlans: { resource: 'clinical' }, nutritionAnamneses: { resource: 'clinical' }, nutritionAssessments: { resource: 'clinical' }, carePlans: { resource: 'clinical' },
  // specialties/dental + medicine
  odontogramEntries: { resource: 'clinical' }, perioExams: { resource: 'clinical' }, orthoCases: { resource: 'clinical' }, labOrders: { resource: 'clinical' },
  dentalImages: { resource: 'arquivos' }, sterilizationCycles: { resource: 'estoque', memberReadable: true }, soapTemplates: { resource: 'clinical', memberReadable: true },
  vitalSigns: { resource: 'clinical' }, examOrders: { resource: 'clinical' }, medSpecialties: { resource: 'clinical', memberReadable: true }, referrals: { resource: 'clinical' },
  followUps: { resource: 'clinical' }, growthMeasures: { resource: 'clinical' }, insurancePayers: { resource: 'financeiro', memberReadable: true }, insuranceCards: { resource: 'pacientes' },
  authorizations: { resource: 'financeiro' }, guides: { resource: 'financeiro' }, guideBatches: { resource: 'financeiro' },
}

/** Colunas indexáveis extraídas para a tabela genérica (RLS por unidade/paciente/profissional). */
export function genericColumns(d: Doc): Row {
  return { unit_id: s(d.unitId), patient_id: s(d.patientId), professional_id: s(d.professionalId) }
}

/** Coleções de plataforma persistidas em public.platform_documents (contexto A). */
export const PLATFORM_COLLECTIONS = ['plans', 'subscriptions', 'saasInvoices', 'coupons', 'usage', 'integrations', 'domains', 'tickets', 'flags', 'incidents', 'announcements', 'changelog', 'platformAudit', 'dataRequests', 'platformUsers'] as const
