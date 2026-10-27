// Tipos privados de Odontologia + coleções (declaration merging). Medicina e convênios têm tipos próprios em seus arquivos.
import type { Entity, ID, StatusChange } from '@/domain/types'
import type { CivilDate, ISOInstant } from '@/lib/dates'
import type { Cents } from '@/lib/money'

/** Faces canônicas. 'L' = lingual (inferior) / palatina (superior); 'O' = oclusal (posterior) / incisal (anterior). */
export type Face = 'V' | 'L' | 'M' | 'D' | 'O'
export type ToothCondition = 'carie' | 'restauracao' | 'selante' | 'fratura' | 'ausente' | 'extracao' | 'endodontia' | 'coroa' | 'implante' | 'protese'
/** existente = achado/registro prévio; planejado = a executar; realizado = planejado já executado. */
export type MarkState = 'existente' | 'planejado' | 'realizado'

export interface OdontogramEntry extends Entity {
  patientId: ID
  tooth: number
  faces: Face[]
  condition?: ToothCondition
  serviceId?: ID
  state: MarkState
  date: CivilDate
  authorId: ID
  authorName: string
  professionalId?: ID
  note?: string
  treatmentItemId?: ID
  doneOn?: CivilDate
  /** Marcação nunca é apagada: anulação com motivo preserva o histórico. */
  voided?: { at: ISOInstant; by: string; reason: string }
}

export const PERIO_SITES = ['MV', 'V', 'DV', 'ML', 'L', 'DL'] as const
export type PerioSite = (typeof PERIO_SITES)[number]
export interface PerioSiteData { pd: number | null; rec: number | null; bleeding: boolean; suppuration: boolean }
export interface PerioTooth { missing?: boolean; mobility: number | null; furcation: number | null; sites: PerioSiteData[] }
export interface PerioExam extends Entity {
  patientId: ID
  date: CivilDate
  professionalId?: ID
  authorName: string
  /** chave = número FDI (string, por ser JSON). */
  teeth: Record<string, PerioTooth>
  status: 'rascunho' | 'finalizado'
  notes?: string
}

export interface OrthoVisit { id: ID; plannedOn: CivilDate; doneOn?: CivilDate; status: 'prevista' | 'realizada' | 'faltou'; note?: string }
export interface AlignerStage { n: number; plannedChangeOn: CivilDate; deliveredOn?: CivilDate }
export interface OrthoCase extends Entity {
  patientId: ID
  professionalId?: ID
  kind: 'aparelho' | 'alinhador'
  appliance: string
  startDate: CivilDate
  intervalDays: number
  maintenances: OrthoVisit[]
  aligner?: { total: number; changeDays: number; stages: AlignerStage[] }
  status: 'ativo' | 'concluido'
  notes?: string
}

export type LabStatus = 'solicitado' | 'enviado' | 'recebido' | 'ajuste' | 'entregue' | 'cancelado'
export interface LabOrder extends Entity {
  patientId: ID
  treatmentItemId?: ID
  lab: string
  work: string
  tooth?: number
  costCents: Cents
  requestedOn: CivilDate
  dueOn: CivilDate
  status: LabStatus
  history: StatusChange<LabStatus>[]
  notes?: string
}

export interface DentalImage extends Entity {
  patientId: ID
  fileId: ID
  tooth?: number
  takenOn: CivilDate
  kind: 'imagem_intraoral' | 'radiografia'
}

export interface SterilIndicator { kind: 'quimico' | 'biologico'; result: 'pendente' | 'aprovado' | 'reprovado'; recordedAt?: ISOInstant; note?: string }
export interface SterilPackage { id: ID; kit: string; expiresOn: CivilDate; appointmentId?: ID; serviceId?: ID; usedOn?: CivilDate }
export type SterilStatus = 'em_processo' | 'liberado' | 'reprovado'
export interface SterilizationCycle extends Entity {
  unitId: ID
  equipmentId: ID
  cycleNo: number
  date: CivilDate
  temperatureC?: number
  minutes?: number
  responsible: string
  indicators: SterilIndicator[]
  packages: SterilPackage[]
  status: SterilStatus
  history: StatusChange<SterilStatus>[]
}

declare module '@/data/store' {
  interface TenantCollections {
    odontogramEntries: OdontogramEntry[]
    perioExams: PerioExam[]
    orthoCases: OrthoCase[]
    labOrders: LabOrder[]
    dentalImages: DentalImage[]
    sterilizationCycles: SterilizationCycle[]
  }
}
