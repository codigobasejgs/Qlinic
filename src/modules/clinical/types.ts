// Tipos PRIVADOS do módulo clínico + coleções extras (declaration merging no store).
import type { Entity, ID, Patient } from '@/domain/types'
import type { CivilDate, ISOInstant } from '@/lib/dates'

/** Anamnese estruturada (problemas, medicamentos, antecedentes). Alergias/alertas ficam no Patient (lidos por outros módulos). */
export interface Anamnesis extends Entity {
  patientId: ID
  problems: { id: ID; description: string; status: 'ativo' | 'resolvido'; since?: CivilDate }[]
  medications: string[]
  history: string
  habits: string
  updatedBy?: string
}

/** Ditado/transcrição SIMULADO. Nenhum áudio real é capturado; metadados demonstram consentimento, retenção e exclusão. */
export interface Dictation extends Entity {
  appointmentId: ID
  patientId: ID
  consent: { at: ISOInstant; by: string; statement: string }
  origin: 'microfone_consultorio' | 'dispositivo_profissional' | 'teleconsulta'
  retention: 'apos_revisao' | '7_dias' | '30_dias'
  status: 'gravando' | 'pausado' | 'encerrado'
  startedAt: ISOInstant
  /** Segundos acumulados até a última pausa. */
  elapsedSec: number
  /** Presente enquanto grava (para somar o trecho atual). */
  resumedAt?: ISOInstant
  audio?: { durationSec: number; sizeKb: number; deleteAfter?: ISOInstant }
  audioDeletedAt?: ISOInstant
  audioDeletedBy?: string
  segments: { id: ID; field: string; text: string; status: 'pendente' | 'aceito' | 'descartado'; decidedAt?: ISOInstant; decidedBy?: string }[]
}

/** Assinatura DEMONSTRATIVA do registro clínico (sem validade jurídica). */
export interface RecordSignature extends Entity {
  recordId: ID
  signerName: string
  method: 'rubrica_demo' | 'aceite_demo'
  typedName?: string
  dataUrl?: string
  by: ID
}

/** Trilha de revisão de duplicidade (mesclagem manual ou "manter separados"). */
export interface PatientMerge extends Entity {
  kind: 'mesclado' | 'separados'
  keepId: ID
  dupId: ID
  by: string
  reason?: string
  /** Campos cujo valor veio do cadastro duplicado. */
  fieldsFromDup: (keyof Patient)[]
}

declare module '@/data/store' {
  interface TenantCollections {
    anamneses: Anamnesis[]
    dictations: Dictation[]
    recordSignatures: RecordSignature[]
    patientMerges: PatientMerge[]
  }
}
