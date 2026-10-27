// Tipos privados do módulo de configurações (coleções próprias via declaration merging).
import type { Entity, ID } from '@/domain/types'

export type ImportEntity = 'pacientes' | 'profissionais' | 'servicos' | 'produtos'

/** Lote de importação: guarda só os IDs criados, para desfazer sem tocar em registros pré-existentes. */
export interface ImportBatch extends Entity {
  entity: ImportEntity
  fileName: string
  by: string
  byId: ID
  status: 'concluido' | 'desfeito'
  recordIds: ID[]
  counts: { rows: number; imported: number; invalid: number; duplicates: number }
  errors: { line: number; errors: string[] }[]
  undoneAt?: string
  undoneBy?: string
  /** Registros do lote mantidos no desfazer por já terem vínculos (ex.: paciente com agendamento). */
  keptIds?: ID[]
}

/** Dados complementares da organização (não cabem em Organization). Um documento por tenant. */
export interface ClinicProfile extends Entity {
  address: { cep: string; street: string; number: string; district: string; city: string; uf: string }
  whatsapp: string
  links: { site: string; instagram: string; other: string }
  technicalResponsible: { name: string; council: string }
  professionalInfo: string
  /** Logo para cabeçalho de documentos (data URL local, demonstração). */
  docLogoUrl?: string
  /** Dados bancários DEMONSTRATIVOS — nunca reais. */
  bank: { bank: string; agency: string; account: string; holder: string; pixKeyLabel: string }
  /** Remetente de e-mail: sempre um endereço de exemplo (.exemplo). */
  senderEmail: string
  notifications: Record<string, boolean>
  brandExtras: { logoBackground: string; symbolBackground: string; splashBackground: string }
  preferences: { weekStart: 0 | 1; agendaView: 'dia' | 'semana'; timeFormat: '24h'; showPricesOnAgenda: boolean; confirmBeforeLeave: boolean }
}

declare module '@/data/store' {
  interface TenantCollections {
    importBatches: ImportBatch[]
    clinicProfile: ClinicProfile[]
  }
}
