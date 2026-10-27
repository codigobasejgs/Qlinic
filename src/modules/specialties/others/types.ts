// Tipos PRIVADOS dos módulos de especialidade (veterinária, estética, psicologia, fisioterapia, nutrição, multidisciplinar).
// Tipos lidos pelo portal (VaccineRecord, ExercisePlan, NutritionPlan, AestheticPackage) ficam em src/domain/modules.ts.
import type { Entity, ID } from '@/domain/types'
import type { CivilDate, ISOInstant } from '@/lib/dates'

export interface Trail { at: ISOInstant; by: string; text: string }

// ---------- Veterinária: internação ----------
/** Status persistido. "atrasado" é DERIVADO (agendado + horário vencido), nunca gravado. */
export type TaskStatus = 'agendado' | 'administrado' | 'nao_administrado' | 'suspenso'
export type TaskState = TaskStatus | 'atrasado'
export interface HospTask { id: ID; prescriptionId: ID; dueAt: ISOInstant; status: TaskStatus; doneAt?: ISOInstant; by?: string; note?: string; reason?: string }
/** Prescrição registrada pelo profissional — texto livre, sem sugestão de medicamento/dose. */
export interface Prescription {
  id: ID; medication: string; dose: string; route: string; everyHours: number; firstAt: ISOInstant; durationHours: number; notes?: string
  professionalId: ID; prescribedBy: string; prescribedAt: ISOInstant; active: boolean; suspendedAt?: ISOInstant; suspendReason?: string
}
export interface Hospitalization extends Entity {
  unitId: ID; patientId: ID; boxId: ID; reason: string; professionalId: ID; tutorPersonId?: ID
  admittedAt: ISOInstant; admittedBy: string; status: 'internado' | 'alta'
  evolutions: { id: ID; at: ISOInstant; by: string; text: string }[]
  prescriptions: Prescription[]
  tasks: HospTask[]
  discharge?: { at: ISOInstant; by: string; summary: string }
}

// ---------- Veterinária: banho e tosa ----------
export interface GroomingNote extends Entity {
  appointmentId: ID
  notes: string
  /** Histórico de autorização do tutor (marcar/desmarcar fica registrado). */
  authorization: { authorized: boolean; at: ISOInstant; by: string }[]
  delivery?: { at: ISOInstant; pickedUpBy: string; registeredBy: string }
}

// ---------- Estética ----------
export type BodyView = 'face' | 'frente' | 'costas'
export interface AestheticApplication extends Entity {
  patientId: ID; sessionDate: CivilDate; view: BodyView; regionId: string; point: { x: number; y: number }
  product: string; amount: number; unit: 'U' | 'mL'; lot: string; professionalId: ID; notes?: string; by: string
}
export interface ConsentEntry { granted: boolean; at?: ISOInstant; by?: string }
export interface AestheticComparison extends Entity {
  patientId: ID; title: string; regionLabel: string; beforeOn: CivilDate; afterOn: CivilDate
  /** Ilustração fictícia (nunca foto real). */
  variant: number
  offset: { x: number; y: number }
  /** Consentimento POR FINALIDADE: uso clínico e publicitário são independentes. */
  consent: { clinical: ConsentEntry; marketing: ConsentEntry }
  marketingUse?: { at: ISOInstant; by: string }
  history: Trail[]
}

// ---------- Psicologia ----------
export interface PsychPlan extends Entity {
  patientId: ID; professionalId: ID
  objectives: { id: ID; text: string; status: 'em_andamento' | 'atingido' | 'revisto' }[]
  frequency: string; reviewOn: CivilDate; notes: string; history: Trail[]
}
export type GuardianField = 'canSeeClinical' | 'canSeeFinancial' | 'canSchedule'
export interface GuardianDecision extends Entity { patientId: ID; linkId: ID; field: GuardianField; from: boolean; to: boolean; reason: string; by: string }

// ---------- Fisioterapia ----------
export interface PhysioAssessment extends Entity {
  patientId: ID; professionalId: ID; date: CivilDate; pain: number
  rom: { joint: string; movement: string; side: 'D' | 'E' | 'bilateral'; degrees: number }[]
  strength: { muscle: string; side: 'D' | 'E' | 'bilateral'; grade: number }[]
  tests: { name: string; result: string }[]
  notes: string
}
export interface PhysioGoal extends Entity { patientId: ID; professionalId: ID; specific: string; measure: string; target: string; dueOn: CivilDate; status: 'ativa' | 'atingida' | 'revisada' | 'cancelada' }
export interface PhysioPlan extends Entity { patientId: ID; professionalId: ID; sessionsPlanned: number; startOn: CivilDate; notes: string }

// ---------- Nutrição ----------
export interface NutritionAnamnesis extends Entity {
  patientId: ID; professionalId: ID; date: CivilDate
  mealsPerDay: number; waterL: number; routine: string; preferences: string; aversions: string; intolerances: string
  supplements: string; activity: string; sleep: string; bowel: string; notes: string
}
export interface NutritionAssessment extends Entity {
  patientId: ID; professionalId: ID; date: CivilDate; weightKg: number; heightCm: number
  waistCm?: number; hipCm?: number; armCm?: number
  /** % de gordura INFORMADO (medido por método externo), não estimado pelo sistema. */
  bodyFatPct?: number; notes: string
}

// ---------- Plano de cuidado multidisciplinar ----------
export interface CareSection { id: ID; title: string; content: string; authorProId: ID; visibleTo: ID[]; releasedToPatient: boolean; updatedAt: ISOInstant; updatedBy: string }
export type ReferralStatus = 'enviado' | 'aceito' | 'recusado' | 'concluido'
export interface Referral { id: ID; fromProId: ID; toProId: ID; reason: string; status: ReferralStatus; at: ISOInstant; history: { at: ISOInstant; by: string; to: ReferralStatus; note?: string }[] }
export interface CareTask { id: ID; title: string; assigneeProId: ID; dueOn: CivilDate; done: boolean; doneAt?: ISOInstant; doneBy?: string }
export interface CarePlan extends Entity {
  patientId: ID; title: string; status: 'ativo' | 'encerrado'; createdBy: string
  /** Somente profissionais do MESMO tenant. Não une prontuários entre organizações. */
  participants: { professionalId: ID; role: string; addedAt: ISOInstant; addedBy: string }[]
  sections: CareSection[]; referrals: Referral[]; tasks: CareTask[]
}

declare module '@/data/store' {
  interface TenantCollections {
    hospitalizations: Hospitalization[]
    groomingNotes: GroomingNote[]
    aestheticApplications: AestheticApplication[]
    aestheticComparisons: AestheticComparison[]
    psychPlans: PsychPlan[]
    guardianDecisions: GuardianDecision[]
    physioAssessments: PhysioAssessment[]
    physioGoals: PhysioGoal[]
    physioPlans: PhysioPlan[]
    nutritionAnamneses: NutritionAnamnesis[]
    nutritionAssessments: NutritionAssessment[]
    carePlans: CarePlan[]
  }
}
