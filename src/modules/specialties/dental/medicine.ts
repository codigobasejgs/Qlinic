// Medicina ambulatorial + Convênios: tipos (declaration merging) e regras PURAS. Testadas em medicine.test.ts.
// Nada aqui sugere diagnóstico, medicamento ou dose. Faixas são estruturais/informativas.
import type { Entity, ID, StatusChange } from '@/domain/types'
import type { CivilDate, ISOInstant } from '@/lib/dates'
import { nowISO } from '@/lib/dates'
import type { Cents } from '@/lib/money'

// ================= Medicina =================
export interface SoapSection { key: string; label: string; hint?: string }
export interface SoapTemplate extends Entity { name: string; version: number; sections: SoapSection[]; active: boolean }
export const DEFAULT_SOAP: SoapSection[] = [
  { key: 's', label: 'S — Subjetivo', hint: 'Queixa e história relatadas' },
  { key: 'o', label: 'O — Objetivo', hint: 'Exame físico e dados medidos' },
  { key: 'a', label: 'A — Avaliação', hint: 'Avaliação registrada pelo médico' },
  { key: 'p', label: 'P — Plano', hint: 'Conduta definida pelo médico' },
]

export interface VitalSigns extends Entity {
  patientId: ID
  at: ISOInstant
  by: string
  sys?: number; dia?: number; hr?: number; rr?: number; tempC?: number; spo2?: number; weightKg?: number; heightCm?: number
}
export type ExamStatus = 'solicitado' | 'coletado' | 'recebido' | 'cancelado'
export interface ExamOrder extends Entity {
  patientId: ID
  name: string
  requestedOn: CivilDate
  requestedBy: string
  professionalId?: ID
  status: ExamStatus
  receivedOn?: CivilDate
  resultNote?: string
  fileId?: ID
  history: StatusChange<ExamStatus>[]
}
export interface MedSpecialty extends Entity { name: string; description: string; active: boolean }
export type ReferralPriority = 'rotina' | 'prioritario' | 'urgente'
export interface Referral extends Entity {
  patientId: ID
  specialtyId: ID
  reason: string
  priority: ReferralPriority
  status: 'aberto' | 'agendado' | 'concluido' | 'cancelado'
  professionalId?: ID
  by: string
}
export interface FollowUp extends Entity {
  patientId: ID
  dueOn: CivilDate
  note: string
  professionalId?: ID
  appointmentId?: ID
  status: 'lembrete' | 'agendado' | 'concluido'
  by: string
}
export interface GrowthMeasure extends Entity { patientId: ID; date: CivilDate; weightKg?: number; heightCm?: number; headCm?: number; by: string }

// ================= Convênios =================
export interface InsurancePayer extends Entity { name: string; code: string; carenciaDays: number; active: boolean; contact: string }
export interface EligibilityCheck { at: ISOInstant; result: EligibilityResult; message: string; by: string }
export interface InsuranceCard extends Entity {
  patientId: ID
  payerId: ID
  cardNumber: string
  plan: string
  startDate: CivilDate
  validUntil: CivilDate
  checks: EligibilityCheck[]
}
export type AuthStatus = 'solicitada' | 'autorizada' | 'negada'
export interface Authorization extends Entity {
  patientId: ID
  payerId: ID
  serviceId: ID
  status: AuthStatus
  number?: string
  reason?: string
  history: StatusChange<AuthStatus>[]
}
export interface Glosa { id: ID; reason: string; valueCents: Cents; at: ISOInstant; appeal?: { text: string; at: ISOInstant; status: 'enviado' | 'aceito' | 'negado'; recoveredCents: Cents } }
export type GuideStatus = 'aberta' | 'em_lote' | 'enviada' | 'processada'
export interface Guide extends Entity {
  kind: 'consulta' | 'sp_sadt'
  number: string
  appointmentId: ID
  patientId: ID
  payerId: ID
  cardId: ID
  authorizationId?: ID
  items: { serviceId: ID; code: string; description: string; qty: number; unitCents: Cents }[]
  status: GuideStatus
  batchId?: ID
  paidCents: Cents
  glosas: Glosa[]
}
export type BatchStatus = 'aberto' | 'fechado' | 'enviado' | 'processado'
export interface GuideBatch extends Entity {
  payerId: ID
  number: string
  status: BatchStatus
  guideIds: ID[]
  history: StatusChange<BatchStatus>[]
}

declare module '@/data/store' {
  interface TenantCollections {
    soapTemplates: SoapTemplate[]
    vitalSigns: VitalSigns[]
    examOrders: ExamOrder[]
    medSpecialties: MedSpecialty[]
    referrals: Referral[]
    followUps: FollowUp[]
    growthMeasures: GrowthMeasure[]
    insurancePayers: InsurancePayer[]
    insuranceCards: InsuranceCard[]
    authorizations: Authorization[]
    guides: Guide[]
    guideBatches: GuideBatch[]
  }
}

// ---------------- Sinais vitais ----------------
type VitalKey = 'sys' | 'dia' | 'hr' | 'rr' | 'tempC' | 'spo2' | 'weightKg' | 'heightCm'
/** Faixas de PLAUSIBILIDADE (erro de digitação), não de normalidade clínica. */
export const VITAL_LIMITS: Record<VitalKey, { label: string; unit: string; min: number; max: number; decimals: number }> = {
  sys: { label: 'PA sistólica', unit: 'mmHg', min: 50, max: 300, decimals: 0 },
  dia: { label: 'PA diastólica', unit: 'mmHg', min: 20, max: 200, decimals: 0 },
  hr: { label: 'FC', unit: 'bpm', min: 20, max: 250, decimals: 0 },
  rr: { label: 'FR', unit: 'irpm', min: 4, max: 80, decimals: 0 },
  tempC: { label: 'Temperatura', unit: '°C', min: 30, max: 45, decimals: 1 },
  spo2: { label: 'SpO₂', unit: '%', min: 50, max: 100, decimals: 0 },
  weightKg: { label: 'Peso', unit: 'kg', min: 0.3, max: 400, decimals: 2 },
  heightCm: { label: 'Altura', unit: 'cm', min: 20, max: 250, decimals: 1 },
}
export type VitalInput = Partial<Record<VitalKey, number>>
export function validateVitals(v: VitalInput): Partial<Record<VitalKey | 'form', string>> {
  const errs: Partial<Record<VitalKey | 'form', string>> = {}
  for (const k of Object.keys(VITAL_LIMITS) as VitalKey[]) {
    const x = v[k]
    if (x === undefined) continue
    const L = VITAL_LIMITS[k]
    if (!Number.isFinite(x)) errs[k] = `${L.label}: valor inválido.`
    else if (x < L.min || x > L.max) errs[k] = `${L.label}: fora da faixa plausível (${L.min}–${L.max} ${L.unit}). Confira a digitação.`
  }
  if ((v.sys === undefined) !== (v.dia === undefined)) errs.form = 'Informe sistólica e diastólica juntas.'
  else if (v.sys !== undefined && v.dia !== undefined && v.dia >= v.sys) errs.dia = 'PA diastólica deve ser menor que a sistólica.'
  if (Object.values(v).every((x) => x === undefined)) errs.form = 'Informe ao menos um sinal vital.'
  return errs
}
/** IMC = kg / m². Retorna null se faltar dado. Arredondado a 1 casa. */
export function bmi(weightKg?: number, heightCm?: number): number | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return null
  const m = heightCm / 100
  return Math.round((weightKg / (m * m)) * 10) / 10
}
/** Faixas de IMC para ADULTOS (referência populacional usual), apenas informativas — não é diagnóstico. */
export function bmiBand(v: number | null): string | null {
  if (v === null) return null
  if (v < 18.5) return 'abaixo de 18,5'
  if (v < 25) return '18,5 a 24,9'
  if (v < 30) return '25 a 29,9'
  if (v < 35) return '30 a 34,9'
  if (v < 40) return '35 a 39,9'
  return '40 ou mais'
}

export function validateGrowth(m: { weightKg?: number; heightCm?: number; headCm?: number }): string[] {
  const e: string[] = []
  if (m.weightKg === undefined && m.heightCm === undefined && m.headCm === undefined) e.push('Informe ao menos uma medida.')
  if (m.weightKg !== undefined && (m.weightKg < 0.3 || m.weightKg > 200)) e.push('Peso fora da faixa plausível (0,3–200 kg).')
  if (m.heightCm !== undefined && (m.heightCm < 20 || m.heightCm > 220)) e.push('Estatura fora da faixa plausível (20–220 cm).')
  if (m.headCm !== undefined && (m.headCm < 20 || m.headCm > 70)) e.push('Perímetro cefálico fora da faixa plausível (20–70 cm).')
  return e
}

export const EXAM_TRANSITIONS: Record<ExamStatus, ExamStatus[]> = { solicitado: ['coletado', 'recebido', 'cancelado'], coletado: ['recebido', 'cancelado'], recebido: [], cancelado: [] }
export function transitionExam(o: ExamOrder, to: ExamStatus, by: string, patch: Partial<ExamOrder> = {}): ExamOrder {
  if (!EXAM_TRANSITIONS[o.status].includes(to)) throw new Error(`Transição inválida do exame: ${o.status} → ${to}.`)
  return { ...o, ...patch, status: to, history: [...o.history, { at: nowISO(), from: o.status, to, by }] }
}

// ---------------- Convênios ----------------
export type EligibilityResult = 'elegivel' | 'carencia' | 'carteira_invalida' | 'vencida'
export const ELIGIBILITY_LABEL: Record<EligibilityResult, string> = { elegivel: 'Elegível', carencia: 'Em carência', carteira_invalida: 'Carteira inválida', vencida: 'Carteira vencida' }
/** Carteirinha demo: 4 grupos de 4 dígitos; último dígito = soma dos 15 anteriores mod 10. */
export function cardChecksumOk(cardNumber: string): boolean {
  const d = cardNumber.replace(/\D/g, '')
  if (d.length !== 16) return false
  const s = d.slice(0, 15).split('').reduce((a, c) => a + Number(c), 0)
  return s % 10 === Number(d[15])
}
export function makeCardNumber(prefix15: string): string {
  const d = prefix15.replace(/\D/g, '').padStart(15, '0').slice(-15)
  const full = d + String(d.split('').reduce((a, c) => a + Number(c), 0) % 10)
  return full.replace(/(\d{4})(?=\d)/g, '$1 ')
}
/** Elegibilidade SIMULADA e determinística (sem consulta à operadora). */
export function simulateEligibility(card: Pick<InsuranceCard, 'cardNumber' | 'startDate' | 'validUntil'>, payer: Pick<InsurancePayer, 'carenciaDays' | 'active'>, today: CivilDate): { result: EligibilityResult; message: string } {
  if (!payer.active || !cardChecksumOk(card.cardNumber)) return { result: 'carteira_invalida', message: 'Número da carteirinha não confere (dígito verificador demonstrativo) ou operadora inativa.' }
  if (card.validUntil < today) return { result: 'vencida', message: 'Validade da carteirinha expirada.' }
  const [y, m, d] = card.startDate.split('-').map(Number)
  const end = new Date(Date.UTC(y, m - 1, d + payer.carenciaDays)).toISOString().slice(0, 10)
  if (end > today) return { result: 'carencia', message: `Carência até ${end.split('-').reverse().join('/')} (regra demonstrativa).` }
  return { result: 'elegivel', message: 'Beneficiário elegível (simulado).' }
}

export const guideTotal = (g: Pick<Guide, 'items'>): Cents => g.items.reduce((a, i) => a + i.qty * i.unitCents, 0)
export const guideGlosado = (g: Pick<Guide, 'glosas'>): Cents => g.glosas.reduce((a, x) => a + x.valueCents - (x.appeal?.status === 'aceito' ? x.appeal.recoveredCents : 0), 0)
export function addGlosa(g: Guide, reason: string, valueCents: Cents, id: ID): Guide {
  if (!reason.trim()) throw new Error('Informe o motivo da glosa.')
  if (!Number.isInteger(valueCents) || valueCents <= 0) throw new Error('Valor da glosa deve ser maior que zero.')
  const already = g.glosas.reduce((a, x) => a + x.valueCents, 0)
  if (already + valueCents > guideTotal(g)) throw new Error('Glosa total não pode exceder o valor faturado da guia.')
  if (g.status !== 'enviada' && g.status !== 'processada') throw new Error('Glosa só se aplica a guia enviada.')
  return { ...g, glosas: [...g.glosas, { id, reason: reason.trim(), valueCents, at: nowISO() }] }
}
export function appealGlosa(g: Guide, glosaId: ID, text: string): Guide {
  if (!text.trim()) throw new Error('Descreva a justificativa do recurso.')
  return { ...g, glosas: g.glosas.map((x) => {
    if (x.id !== glosaId) return x
    if (x.appeal) throw new Error('Esta glosa já possui recurso.')
    return { ...x, appeal: { text: text.trim(), at: nowISO(), status: 'enviado', recoveredCents: 0 } }
  }) }
}
export function resolveAppeal(g: Guide, glosaId: ID, accepted: boolean, recoveredCents: Cents): Guide {
  return { ...g, glosas: g.glosas.map((x) => {
    if (x.id !== glosaId) return x
    if (!x.appeal || x.appeal.status !== 'enviado') throw new Error('Recurso não está aguardando resposta.')
    if (accepted && (!Number.isInteger(recoveredCents) || recoveredCents <= 0 || recoveredCents > x.valueCents)) throw new Error('Valor recuperado deve ser de 1 centavo até o valor glosado.')
    return { ...x, appeal: { ...x.appeal, status: accepted ? 'aceito' : 'negado', recoveredCents: accepted ? recoveredCents : 0 } }
  }) }
}
/** Pagamento informado da guia: não pode exceder faturado − glosado. */
export function registerGuidePayment(g: Guide, paidCents: Cents): Guide {
  if (!Number.isInteger(paidCents) || paidCents < 0) throw new Error('Valor pago inválido.')
  if (paidCents > guideTotal(g) - guideGlosado(g)) throw new Error('Pago maior que faturado menos glosado.')
  return { ...g, paidCents, status: 'processada' }
}
export function reconcile(guides: Guide[]) {
  const billed = guides.reduce((a, g) => a + guideTotal(g), 0)
  const paid = guides.reduce((a, g) => a + g.paidCents, 0)
  const glosado = guides.reduce((a, g) => a + guideGlosado(g), 0)
  return { billed, paid, glosado, pending: Math.max(0, billed - paid - glosado) }
}
export const BATCH_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = { aberto: ['fechado'], fechado: ['aberto', 'enviado'], enviado: ['processado'], processado: [] }
export function transitionBatch(b: GuideBatch, to: BatchStatus, by: string): GuideBatch {
  if (!BATCH_TRANSITIONS[b.status].includes(to)) throw new Error(`Transição de lote inválida: ${b.status} → ${to}.`)
  if (to === 'fechado' && b.guideIds.length === 0) throw new Error('Lote vazio não pode ser fechado.')
  return { ...b, status: to, history: [...b.history, { at: nowISO(), from: b.status, to, by }] }
}

/** Artefato demonstrativo (NÃO é TISS homologado). Estrutura simplificada, versionada como "demo". */
export const TISS_MARK = 'DEMONSTRATIVO — NÃO HOMOLOGADO'
export function buildTissArtifact(batch: GuideBatch, guides: Guide[], payer: InsurancePayer, clinicName: string, format: 'json' | 'xml'): { filename: string; content: string; mime: string } {
  const safe = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!))
  const data = {
    aviso: `${TISS_MARK}. Arquivo de exemplo gerado pelo protótipo Qlinic. Não segue nem substitui o padrão TISS/TUSS oficial; não enviar a operadoras.`,
    versaoArtefato: 'qlinic-demo-0',
    prestador: clinicName, operadora: `${payer.name} (${payer.code})`, lote: batch.number, status: batch.status,
    guias: guides.map((g) => ({ numero: g.number, tipo: g.kind, itens: g.items.map((i) => ({ codigoDemonstrativo: i.code, descricao: i.description, quantidade: i.qty, valorCentavos: i.unitCents })), totalCentavos: guideTotal(g) })),
  }
  const base = `ARTEFATO-TISS-DEMONSTRATIVO-NAO-HOMOLOGADO_${batch.number}`
  if (format === 'json') return { filename: `${base}.json`, content: JSON.stringify(data, null, 2), mime: 'application/json;charset=utf-8' }
  const items = data.guias.map((g) => `    <guia numero="${safe(g.numero)}" tipo="${g.tipo}" totalCentavos="${g.totalCentavos}">\n${g.itens.map((i) => `      <item codigoDemonstrativo="${safe(i.codigoDemonstrativo)}" quantidade="${i.quantidade}" valorCentavos="${i.valorCentavos}">${safe(i.descricao)}</item>`).join('\n')}\n    </guia>`).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${TISS_MARK} -->\n<artefatoDemonstrativo versao="${data.versaoArtefato}" homologado="false">\n  <aviso>${safe(data.aviso)}</aviso>\n  <prestador>${safe(data.prestador)}</prestador>\n  <operadora>${safe(data.operadora)}</operadora>\n  <lote numero="${safe(batch.number)}" status="${batch.status}">\n${items}\n  </lote>\n</artefatoDemonstrativo>\n`
  return { filename: `${base}.xml`, content: xml, mime: 'application/xml;charset=utf-8' }
}
