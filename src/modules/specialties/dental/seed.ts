// Seeds determinísticos (relativos a demoBaseDate) de Odontologia (org_sorriso) e Medicina/Convênios (org_vitta).
// Demais tenants recebem coleções vazias. Odontograma do paciente 1 bate com os treatmentItems do seed núcleo (16, 26, 36).
import { registerSeed, type SeedContext } from '@/data/store'
import type { ID, StatusChange } from '@/domain/types'
import { addDaysCivil, demoBaseDate, zonedParts, zonedToInstant } from '@/lib/dates'
import { hashString, rng } from '@/lib/util'
import './types'
import type { LabOrder, LabStatus, OdontogramEntry, OrthoCase, PerioExam, PerioTooth, SterilizationCycle, SterilStatus } from './types'
import { PERMANENT_LOWER, PERMANENT_UPPER, emptyPerioTooth, isMultiRooted, planAligners, planVisits } from './odonto'
import {
  makeCardNumber, type Authorization, type ExamOrder, type FollowUp, type Guide, type GuideBatch, type GrowthMeasure, type InsuranceCard,
  type InsurancePayer, type MedSpecialty, type Referral, type SoapTemplate, type VitalSigns,
} from './medicine'

const SORRISO = 'org_sorriso'
const VITTA = 'org_vitta'
const iso = () => demoBaseDate().toISOString()
const today = () => zonedParts(demoBaseDate(), 'America/Sao_Paulo').date
const at = (d: number, min = 600) => zonedToInstant(addDaysCivil(today(), d), min)
const only = <T,>(tenant: ID, fn: (c: SeedContext) => T[]) => (c: SeedContext): T[] => (c.tenantId === tenant ? fn(c) : [])
const hist = <S extends string>(steps: [S, number, string?][], by: string): StatusChange<S>[] =>
  steps.map(([to, d, reason], i) => ({ at: at(d, 540 + i), from: i ? steps[i - 1][0] : null, to, by, reason }))

// ================= Odontologia =================
registerSeed('odontogramEntries', only(SORRISO, (c) => {
  const t = c.tenantId, p = `${t}_pat1`, pro = `${t}_pro1`, author = 'Dra. Marina Albuquerque'
  let n = 0
  const e = (tooth: number, faces: OdontogramEntry['faces'], condition: OdontogramEntry['condition'], state: OdontogramEntry['state'], d: number, extra: Partial<OdontogramEntry> = {}): OdontogramEntry => ({
    id: `${t}_odo${++n}`, tenantId: t, createdAt: at(d), patientId: p, tooth, faces, condition, state, date: addDaysCivil(today(), d), authorId: `${t}_usr_pro1`, authorName: author, professionalId: pro, ...extra,
  })
  return [
    e(18, [], 'ausente', 'existente', -400),
    e(48, [], 'ausente', 'existente', -400),
    e(46, ['O'], 'restauracao', 'existente', -400, { note: 'Restauração antiga (registro prévio, fictício).' }),
    e(11, ['M'], 'restauracao', 'existente', -400),
    e(16, ['O'], 'carie', 'existente', -20),
    e(16, ['O'], 'restauracao', 'planejado', -20, { serviceId: `${t}_svc3`, treatmentItemId: `${t}_ti1` }),
    e(26, ['O', 'D'], 'carie', 'existente', -20),
    e(26, ['O', 'D'], 'restauracao', 'planejado', -20, { serviceId: `${t}_svc3`, treatmentItemId: `${t}_ti2` }),
    e(36, [], 'endodontia', 'existente', -20, { note: 'Tratamento endodôntico prévio (fictício).' }),
    e(36, ['O', 'L'], 'fratura', 'existente', -20),
    e(36, [], 'coroa', 'planejado', -20, { serviceId: `${t}_svc6`, treatmentItemId: `${t}_ti3`, note: 'Alternativa A (grupo reab36).' }),
    e(36, [], 'implante', 'planejado', -20, { serviceId: `${t}_svc7`, treatmentItemId: `${t}_ti4`, note: 'Alternativa B (grupo reab36).' }),
    e(27, ['O'], 'selante', 'existente', -200),
  ]
}))

function perioTeeth(seed: string, improve: number): Record<string, PerioTooth> {
  const r = rng(hashString(seed))
  const out: Record<string, PerioTooth> = {}
  for (const tooth of [...PERMANENT_UPPER, ...PERMANENT_LOWER]) {
    if (tooth === 18 || tooth === 48) { out[tooth] = { ...emptyPerioTooth(), missing: true }; continue }
    const posterior = tooth % 10 >= 6
    const d = emptyPerioTooth()
    d.sites = d.sites.map((_, i) => {
      const base = 2 + r.int(0, 1) + (posterior && (i === 0 || i === 2 || i === 3 || i === 5) ? r.int(0, 3) : 0)
      const pd = Math.max(1, base - (r.next() < improve ? 1 : 0))
      return { pd, rec: r.next() < 0.2 ? r.int(1, 2) : 0, bleeding: pd >= 4 ? r.next() < 0.7 - improve / 2 : r.next() < 0.1, suppuration: pd >= 5 && r.next() < 0.15 - improve / 5 }
    })
    d.mobility = tooth === 36 ? 1 : 0
    d.furcation = isMultiRooted(tooth) ? (tooth === 36 || tooth === 16 ? 1 : 0) : null
    out[tooth] = d
  }
  return out
}
registerSeed('perioExams', only(SORRISO, (c): PerioExam[] => {
  const t = c.tenantId
  return [
    { id: `${t}_perio1`, tenantId: t, createdAt: at(-180), patientId: `${t}_pat1`, date: addDaysCivil(today(), -180), professionalId: `${t}_pro3`, authorName: 'Dra. Juliana Castro', teeth: perioTeeth(`${t}perio1`, 0), status: 'finalizado', notes: 'Exame inicial (fictício).' },
    { id: `${t}_perio2`, tenantId: t, createdAt: at(-10), patientId: `${t}_pat1`, date: addDaysCivil(today(), -10), professionalId: `${t}_pro3`, authorName: 'Dra. Juliana Castro', teeth: perioTeeth(`${t}perio1`, 0.45), status: 'finalizado', notes: 'Reavaliação após raspagem (fictício).' },
  ]
}))

registerSeed('orthoCases', only(SORRISO, (c): OrthoCase[] => {
  const t = c.tenantId, start = addDaysCivil(today(), -150)
  const visits = planVisits(start, 30, 12).map((d, i) => ({ id: `${t}_ov${i + 1}`, plannedOn: d, status: d < today() ? (i === 2 ? 'faltou' as const : 'realizada' as const) : 'prevista' as const, doneOn: d < today() && i !== 2 ? d : undefined, note: i === 2 ? 'Remarcada pelo paciente' : undefined }))
  const aStart = addDaysCivil(today(), -60)
  const stages = planAligners(aStart, 20, 14).map((s) => ({ ...s, deliveredOn: s.plannedChangeOn <= addDaysCivil(today(), 14) && s.n <= 6 ? addDaysCivil(aStart, Math.floor((s.n - 1) / 3) * 42) : undefined }))
  return [
    { id: `${t}_ortho1`, tenantId: t, createdAt: at(-150), patientId: `${t}_pat3`, professionalId: `${t}_pro2`, kind: 'aparelho', appliance: 'Aparelho fixo metálico autoligado (fictício)', startDate: start, intervalDays: 30, maintenances: visits, status: 'ativo' },
    { id: `${t}_ortho2`, tenantId: t, createdAt: at(-60), patientId: `${t}_pat4`, professionalId: `${t}_pro2`, kind: 'alinhador', appliance: 'Alinhadores transparentes — marca demonstrativa', startDate: aStart, intervalDays: 42, maintenances: planVisits(aStart, 42, 4).map((d, i) => ({ id: `${t}_ov_a${i + 1}`, plannedOn: d, status: d < today() ? 'realizada' : 'prevista', doneOn: d < today() ? d : undefined })), aligner: { total: 20, changeDays: 14, stages }, status: 'ativo' },
  ]
}))

registerSeed('labOrders', only(SORRISO, (c): LabOrder[] => {
  const t = c.tenantId, by = 'Dra. Marina Albuquerque'
  const h = (s: [LabStatus, number, string?][]) => hist(s, by)
  return [
    { id: `${t}_lab1`, tenantId: t, createdAt: at(-12), patientId: `${t}_pat1`, treatmentItemId: `${t}_ti3`, lab: 'Laboratório Dental Exemplo (fictício)', work: 'Coroa em cerâmica — prova de estrutura', tooth: 36, costCents: 48000, requestedOn: addDaysCivil(today(), -12), dueOn: addDaysCivil(today(), -3), status: 'enviado', history: h([['solicitado', -12], ['enviado', -11]]) },
    { id: `${t}_lab2`, tenantId: t, createdAt: at(-15), patientId: `${t}_pat2`, lab: 'Prótese Modelo Ltda. (fictício)', work: 'Prótese parcial removível superior', costCents: 65000, requestedOn: addDaysCivil(today(), -15), dueOn: addDaysCivil(today(), 4), status: 'recebido', history: h([['solicitado', -15], ['enviado', -14], ['recebido', -1]]) },
  ]
}))

registerSeed('dentalImages', () => [])

registerSeed('sterilizationCycles', only(SORRISO, (c): SterilizationCycle[] => {
  const t = c.tenantId, unit = `${t}_u1`, eq = `${t}_u1_r5`, resp = 'Auxiliar — Tânia (demo)'
  const appts = c.get('appointments').filter((a) => a.unitId === unit && a.start > iso()).slice(0, 2)
  const h = (s: [SterilStatus, number, string?][]) => hist(s, resp)
  return [
    { id: `${t}_est1`, tenantId: t, createdAt: at(-2), unitId: unit, equipmentId: eq, cycleNo: 101, date: addDaysCivil(today(), -2), temperatureC: 134, minutes: 7, responsible: resp,
      indicators: [{ kind: 'quimico', result: 'aprovado', recordedAt: at(-2, 640) }, { kind: 'biologico', result: 'aprovado', recordedAt: at(-1, 600), note: 'Leitura registrada pela auxiliar.' }],
      packages: [{ id: `${t}_pk1`, kit: 'Kit clínico básico #01', expiresOn: addDaysCivil(today(), 28), appointmentId: appts[0]?.id, serviceId: appts[0]?.serviceId }, { id: `${t}_pk2`, kit: 'Kit cirúrgico #03', expiresOn: addDaysCivil(today(), 28) }],
      status: 'liberado', history: h([['em_processo', -2], ['liberado', -1, 'Indicadores registrados como aprovados pelo responsável']]) },
    { id: `${t}_est2`, tenantId: t, createdAt: at(-40), unitId: unit, equipmentId: eq, cycleNo: 87, date: addDaysCivil(today(), -40), temperatureC: 134, minutes: 7, responsible: resp,
      indicators: [{ kind: 'quimico', result: 'aprovado', recordedAt: at(-40, 640) }, { kind: 'biologico', result: 'reprovado', recordedAt: at(-39, 600), note: 'Lote reprocessado (fictício).' }],
      packages: [{ id: `${t}_pk3`, kit: 'Kit endodontia #02', expiresOn: addDaysCivil(today(), -10) }], status: 'reprovado', history: h([['em_processo', -40], ['reprovado', -39, 'Indicador biológico reprovado']]) },
    { id: `${t}_est3`, tenantId: t, createdAt: at(0, 480), unitId: unit, equipmentId: eq, cycleNo: 102, date: today(), temperatureC: 121, minutes: 20, responsible: resp,
      indicators: [{ kind: 'quimico', result: 'aprovado', recordedAt: at(0, 520) }, { kind: 'biologico', result: 'pendente' }],
      packages: [{ id: `${t}_pk4`, kit: 'Kit clínico básico #02', expiresOn: addDaysCivil(today(), 30), appointmentId: appts[1]?.id, serviceId: appts[1]?.serviceId }], status: 'em_processo', history: h([['em_processo', 0]]) },
  ]
}))

// ================= Medicina =================
registerSeed('soapTemplates', only(VITTA, (c): SoapTemplate[] => [
  { id: `${c.tenantId}_soap1`, tenantId: c.tenantId, createdAt: iso(), name: 'SOAP padrão', version: 1, active: true, sections: [
    { key: 's', label: 'S — Subjetivo', hint: 'Queixa e história relatadas' }, { key: 'o', label: 'O — Objetivo', hint: 'Exame físico e dados medidos' },
    { key: 'a', label: 'A — Avaliação', hint: 'Avaliação registrada pelo médico' }, { key: 'p', label: 'P — Plano', hint: 'Conduta definida pelo médico' }] },
  { id: `${c.tenantId}_soap2`, tenantId: c.tenantId, createdAt: iso(), name: 'Retorno breve', version: 1, active: true, sections: [
    { key: 's', label: 'Evolução relatada' }, { key: 'o', label: 'Achados' }, { key: 'p', label: 'Conduta' }] },
]))

registerSeed('vitalSigns', only(VITTA, (c): VitalSigns[] => {
  const t = c.tenantId
  return [[-120, 132, 86, 78, 74.2], [-60, 128, 84, 74, 73.1], [-7, 124, 80, 72, 72.4]].map(([d, sys, dia, hr, w], i) => ({
    id: `${t}_vs${i + 1}`, tenantId: t, createdAt: at(d), patientId: `${t}_pat1`, at: at(d, 590), by: 'Dr. Fernando Queiroz', sys, dia, hr, rr: 16, tempC: 36.5 + i * 0.1, spo2: 98, weightKg: w, heightCm: 168,
  }))
}))

registerSeed('examOrders', only(VITTA, (c): ExamOrder[] => {
  const t = c.tenantId, by = 'Dr. Fernando Queiroz'
  const mk = (i: number, name: string, d: number, status: ExamOrder['status'], extra: Partial<ExamOrder> = {}): ExamOrder => ({
    id: `${t}_ex${i}`, tenantId: t, createdAt: at(d), patientId: `${t}_pat1`, name, requestedOn: addDaysCivil(today(), d), requestedBy: by, professionalId: `${t}_pro1`, status,
    history: hist<ExamOrder['status']>(status === 'solicitado' ? [['solicitado', d]] : [['solicitado', d], [status, d + 5]], by), ...extra,
  })
  return [
    mk(1, 'Hemograma completo', -30, 'recebido', { receivedOn: addDaysCivil(today(), -25), resultNote: 'Resultado anexado pelo laboratório (fictício).' }),
    mk(2, 'Perfil lipídico', -30, 'recebido', { receivedOn: addDaysCivil(today(), -25) }),
    mk(3, 'Eletrocardiograma', -7, 'solicitado'),
  ]
}))

registerSeed('medSpecialties', only(VITTA, (c): MedSpecialty[] =>
  ['Cardiologia', 'Dermatologia', 'Endocrinologia', 'Ortopedia', 'Oftalmologia', 'Pediatria', 'Neurologia'].map((name, i) => ({ id: `${c.tenantId}_esp${i + 1}`, tenantId: c.tenantId, createdAt: iso(), name, description: `Diretório interno — ${name} (fictício).`, active: true }))))

registerSeed('referrals', only(VITTA, (c): Referral[] => [
  { id: `${c.tenantId}_enc1`, tenantId: c.tenantId, createdAt: at(-7), patientId: `${c.tenantId}_pat1`, specialtyId: `${c.tenantId}_esp1`, reason: 'Avaliação complementar solicitada pelo médico (fictício).', priority: 'prioritario', status: 'aberto', professionalId: `${c.tenantId}_pro1`, by: 'Dr. Fernando Queiroz' },
]))

registerSeed('followUps', only(VITTA, (c): FollowUp[] => [
  { id: `${c.tenantId}_ret1`, tenantId: c.tenantId, createdAt: at(-7), patientId: `${c.tenantId}_pat1`, dueOn: addDaysCivil(today(), 23), note: 'Retorno com resultado de ECG (data definida pelo médico).', professionalId: `${c.tenantId}_pro1`, status: 'lembrete', by: 'Dr. Fernando Queiroz' },
]))

registerSeed('growthMeasures', only(VITTA, (c): GrowthMeasure[] => {
  const t = c.tenantId
  return [[-720, 38.5, 148, 53.1], [-540, 41.2, 152, 53.4], [-360, 44.0, 156.5, 53.7], [-180, 46.3, 160, 53.9], [-14, 48.1, 162.5, 54.0]].map(([d, w, h, pc], i) => ({
    id: `${t}_gm${i + 1}`, tenantId: t, createdAt: at(d), patientId: `${t}_pat5`, date: addDaysCivil(today(), d), weightKg: w, heightCm: h, headCm: pc, by: 'Dra. Helena Bastos',
  }))
}))

// ================= Convênios =================
registerSeed('insurancePayers', only(VITTA, (c): InsurancePayer[] => [
  { id: `${c.tenantId}_op1`, tenantId: c.tenantId, createdAt: iso(), name: 'Saúde Exemplo Operadora (fictícia)', code: 'DEMO-000001', carenciaDays: 30, active: true, contact: 'credenciamento@operadora1.exemplo.test' },
  { id: `${c.tenantId}_op2`, tenantId: c.tenantId, createdAt: iso(), name: 'Plano Demonstração Mais (fictício)', code: 'DEMO-000002', carenciaDays: 180, active: true, contact: 'prestador@operadora2.exemplo.test' },
  { id: `${c.tenantId}_op3`, tenantId: c.tenantId, createdAt: iso(), name: 'Cooperativa Fictícia de Saúde', code: 'DEMO-000003', carenciaDays: 60, active: false, contact: 'contato@operadora3.exemplo.test' },
]))

/** Pacientes com atendimentos concluídos (para guias coerentes). */
function insuredPatients(c: SeedContext) {
  const done = c.get('appointments').filter((a) => a.status === 'concluida' && a.end < iso())
  const ids: ID[] = [`${c.tenantId}_pat1`]
  for (const a of done) if (!ids.includes(a.patientId) && ids.length < 3) ids.push(a.patientId)
  return { ids, done }
}
registerSeed('insuranceCards', only(VITTA, (c): InsuranceCard[] => {
  const t = c.tenantId
  const { ids } = insuredPatients(c)
  const mk = (i: number, patientId: ID, payerId: ID, number: string, startD: number, plan: string): InsuranceCard => ({
    id: `${t}_cart${i}`, tenantId: t, createdAt: iso(), patientId, payerId, cardNumber: number, plan, startDate: addDaysCivil(today(), startD), validUntil: addDaysCivil(today(), 300), checks: [],
  })
  return [
    mk(1, ids[0], `${t}_op1`, makeCardNumber('000012340000001'), -400, 'Enfermaria (fictício)'),
    mk(2, ids[1] ?? ids[0], `${t}_op1`, makeCardNumber('000012340000002'), -300, 'Apartamento (fictício)'),
    mk(3, ids[2] ?? ids[0], `${t}_op2`, makeCardNumber('000056780000003'), -20, 'Básico (fictício)'),
    mk(4, `${t}_pat4`, `${t}_op1`, '0000 1234 0000 0049', -200, 'Enfermaria (fictício)'), // dígito verificador incorreto (demonstra carteira inválida)
  ]
}))

registerSeed('authorizations', only(VITTA, (c): Authorization[] => {
  const t = c.tenantId, by = 'Recepção — Carolina (demo)'
  const { ids } = insuredPatients(c)
  return [
    { id: `${t}_aut1`, tenantId: t, createdAt: at(-20), patientId: ids[0], payerId: `${t}_op1`, serviceId: `${t}_svc7`, status: 'autorizada', number: 'AUT-DEMO-0001', history: hist([['solicitada', -20], ['autorizada', -18]], by) },
    { id: `${t}_aut2`, tenantId: t, createdAt: at(-2), patientId: ids[0], payerId: `${t}_op1`, serviceId: `${t}_svc4`, status: 'solicitada', history: hist([['solicitada', -2]], by) },
    { id: `${t}_aut3`, tenantId: t, createdAt: at(-15), patientId: ids[1] ?? ids[0], payerId: `${t}_op1`, serviceId: `${t}_svc7`, status: 'negada', reason: 'Procedimento sem cobertura no plano (simulado).', history: hist([['solicitada', -15], ['negada', -14, 'Sem cobertura (simulado)']], by) },
  ]
}))

function guidesOf(c: SeedContext): Guide[] {
  const t = c.tenantId
  const { ids, done } = insuredPatients(c)
  const services = c.get('services')
  const cardOf: Record<ID, ID> = { [ids[0]]: `${t}_cart1`, ...(ids[1] ? { [ids[1]]: `${t}_cart2` } : {}) }
  const appts = done.filter((a) => cardOf[a.patientId]).slice(0, 4)
  return appts.map((a, i) => {
    const svc = services.find((s) => s.id === a.serviceId)!
    const price = svc.priceCents || 15000
    const inBatch = i < 3
    return {
      id: `${t}_guia${i + 1}`, tenantId: t, createdAt: a.end, kind: svc.category === 'Consulta' ? 'consulta' : 'sp_sadt', number: `G-DEMO-${String(i + 1).padStart(5, '0')}`,
      appointmentId: a.id, patientId: a.patientId, payerId: `${t}_op1`, cardId: cardOf[a.patientId], items: [{ serviceId: svc.id, code: svc.code ?? `DEMO-${svc.id.split('svc')[1].padStart(4, '0')}`, description: svc.name, qty: 1, unitCents: price }],
      status: inBatch ? 'processada' : 'aberta', batchId: inBatch ? `${t}_lote1` : undefined,
      paidCents: inBatch ? (i === 0 ? price - Math.round(price * 0.3) : price) : 0,
      glosas: inBatch && i === 0 ? [{ id: `${t}_glosa1`, reason: 'Divergência de código do procedimento (simulado)', valueCents: Math.round(price * 0.3), at: at(-3) }] : [],
    }
  })
}
registerSeed('guides', only(VITTA, guidesOf))
registerSeed('guideBatches', only(VITTA, (c): GuideBatch[] => {
  const t = c.tenantId
  const ids = guidesOf(c).filter((g) => g.batchId).map((g) => g.id)
  return [{ id: `${t}_lote1`, tenantId: t, createdAt: at(-10), payerId: `${t}_op1`, number: 'LOTE-DEMO-0001', status: 'processado', guideIds: ids, history: hist([['aberto', -10], ['fechado', -9], ['enviado', -9], ['processado', -3]], 'Financeiro — Márcio (demo)') }]
}))
