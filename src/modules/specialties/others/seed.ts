// Seeds determinísticos (relativos a demoBaseDate) das especialidades. Só tenants demo recebem seed (política do store).
import './types'
import '@/domain/modules'
import { db, registerSeed, type SeedContext } from '@/data/store'
import type { Appointment, ID } from '@/domain/types'
import type { VaccineRecord, ExercisePlan, NutritionPlan, AestheticPackage } from '@/domain/modules'
import { addDaysCivil, demoBaseDate, zonedParts, zonedToInstant, type CivilDate } from '@/lib/dates'
import { addPrescription } from './lib'
import type { Hospitalization, Prescription } from './types'

const now = () => demoBaseDate()
const iso = (offsetMin = 0) => new Date(now().getTime() + offsetMin * 60000).toISOString()
const tzOf = (c: SeedContext) => c.get('units')[0]?.timezone ?? 'America/Sao_Paulo'
const today = (c: SeedContext) => zonedParts(now(), tzOf(c)).date
const P = (t: ID, n: number) => `${t}_pat${n}`
const PRO = (t: ID, n: number) => `${t}_pro${n}`

// ---------- Agendamentos extras de demonstração (banhos de hoje, séries de psicologia) ----------
// Inseridos de forma adiada (fora do render) e idempotente por ID determinístico.
interface Want { id: ID; seriesId?: ID; patientId: ID; serviceId: ID; resourceKind?: string; date: CivilDate; preferPros: ID[]; status: Appointment['status']; notes?: string; fixedMin?: number }
function ensureAppointments(c: SeedContext, wants: Want[]) {
  const t = c.tenantId
  const tz = tzOf(c)
  setTimeout(() => {
    try {
      const appts = [...db.list(t, 'appointments')]
      const resources = db.list(t, 'resources')
      const services = db.list(t, 'services')
      for (const w of wants) {
        if (appts.some((a) => a.id === w.id)) continue
        const svc = services.find((s) => s.id === w.serviceId)
        if (!svc) continue
        const res = w.resourceKind ? resources.filter((r) => r.kind === w.resourceKind && r.unitId === `${t}_u1`) : []
        let placed: Appointment | null = null
        const mins = w.fixedMin != null ? [w.fixedMin, ...Array.from({ length: 19 }, (_, i) => 8 * 60 + i * 30)] : Array.from({ length: 19 }, (_, i) => 8 * 60 + i * 30)
        for (const m of mins) {
          if (m + svc.durationMin > 18 * 60) continue
          const start = zonedToInstant(w.date, m, tz), end = zonedToInstant(w.date, m + svc.durationMin, tz)
          const busy = (a: Appointment) => a.status !== 'cancelada' && a.start < end && start < a.end
          const pro = w.preferPros.find((p) => !appts.some((a) => a.professionalId === p && busy(a)))
          if (!pro || appts.some((a) => a.patientId === w.patientId && busy(a))) continue
          const r = res.find((x) => !appts.some((a) => a.resourceIds.includes(x.id) && busy(a)))
          if (w.resourceKind && !r) continue
          const at = new Date(new Date(start).getTime() - 5 * 86400000).toISOString()
          const history: Appointment['history'] = [{ at, from: null, to: 'confirmada', by: 'Recepção (demo)' }]
          if (w.status === 'concluida') history.push({ at: end, from: 'em_atendimento', to: 'concluida', by: 'Profissional (demo)' })
          placed = {
            id: w.id, tenantId: t, createdAt: at, unitId: `${t}_u1`, patientId: w.patientId, professionalId: pro, serviceId: svc.id, resourceIds: r ? [r.id] : [],
            start, end, status: w.status, history, source: 'recepcao', seriesId: w.seriesId, notes: w.notes, financialStatus: w.status === 'concluida' ? 'pago' : 'nao_cobrado',
            finishedAt: w.status === 'concluida' ? end : undefined,
          }
          break
        }
        if (placed) appts.push(placed)
      }
      db.set(t, 'appointments', appts)
    } catch (e) { console.warn('[qlinic] seed de agendamentos de especialidade falhou', e) }
  }, 0)
}

// ====================== Veterinária ======================
const VAX: Record<number, Omit<VaccineRecord, 'id' | 'tenantId' | 'createdAt' | 'patientId' | 'professionalId'>[]> = {
  1: [ // Thor (cão)
    { kind: 'vacina', product: 'Vacina polivalente canina (produto demonstrativo)', manufacturer: 'Laboratório Exemplo A (fictício)', lot: 'DEMO-PC-2318', appliedOn: '', nextDueOn: '', status: 'aplicada', notes: 'Retorno definido pela veterinária após avaliação.' },
    { kind: 'vacina', product: 'Vacina antirrábica (produto demonstrativo)', manufacturer: 'Laboratório Exemplo B (fictício)', lot: 'DEMO-AR-0771', appliedOn: '', nextDueOn: '', status: 'aplicada' },
    { kind: 'vermifugo', product: 'Vermífugo oral (produto demonstrativo)', manufacturer: 'Laboratório Exemplo C (fictício)', lot: 'DEMO-VM-5520', appliedOn: '', nextDueOn: '', status: 'aplicada' },
  ],
  2: [ // Luna (gata)
    { kind: 'vacina', product: 'Vacina polivalente felina (produto demonstrativo)', manufacturer: 'Laboratório Exemplo D (fictício)', lot: 'DEMO-PF-1044', appliedOn: '', nextDueOn: '', status: 'aplicada', notes: 'Felina indoor — intervalo decidido pela veterinária.' },
    { kind: 'antiparasitario', product: 'Antiparasitário tópico (produto demonstrativo)', manufacturer: 'Laboratório Exemplo E (fictício)', lot: 'DEMO-AT-3390', appliedOn: '', status: 'aplicada' },
  ],
  3: [{ kind: 'vacina', product: 'Vacina polivalente canina (produto demonstrativo)', manufacturer: 'Laboratório Exemplo A (fictício)', lot: 'DEMO-PC-2290', appliedOn: '', nextDueOn: '', status: 'aplicada' }],
}
const VAX_DAYS: Record<number, [number, number | null][]> = { 1: [[-200, 165], [-120, 245], [-30, 60]], 2: [[-90, 275], [-20, null]], 3: [[-340, 25]] }

registerSeed('vaccines', (c) => {
  if (c.tenantId !== 'org_vet') return []
  const t = c.tenantId, d = today(c)
  return Object.entries(VAX).flatMap(([n, list]) => list.map((v, i): VaccineRecord => {
    const [ap, next] = VAX_DAYS[Number(n)][i]
    return { ...v, id: `${t}_vax${n}_${i + 1}`, tenantId: t, createdAt: iso(ap * 1440), patientId: P(t, Number(n)), professionalId: PRO(t, Number(n) === 2 ? 3 : 1), appliedOn: addDaysCivil(d, ap), nextDueOn: next == null ? undefined : addDaysCivil(d, next) }
  }))
})

registerSeed('hospitalizations', (c) => {
  if (c.tenantId !== 'org_vet') return []
  const t = c.tenantId
  const admitted = -10 * 60
  let n = 0
  const mkId = () => `${t}_hosp1_t${++n}`
  const rx = (id: string, medication: string, dose: string, route: string, everyHours: number): Prescription => ({
    id: `${t}_hosp1_${id}`, medication, dose, route, everyHours, firstAt: iso(admitted + 30), durationHours: 48, professionalId: PRO(t, 2), prescribedBy: 'Dr. Gustavo Prates', prescribedAt: iso(admitted + 20), active: true,
    notes: 'Prescrição digitada pelo profissional (demonstrativa).',
  })
  let h: Hospitalization = {
    id: `${t}_hosp1`, tenantId: t, createdAt: iso(admitted), unitId: `${t}_u1`, patientId: P(t, 4), boxId: `${t}_u1_r4`, reason: 'Observação pós-procedimento (fictício)', professionalId: PRO(t, 2),
    tutorPersonId: `${t}_per3`, admittedAt: iso(admitted), admittedBy: 'Dr. Gustavo Prates', status: 'internado',
    evolutions: [
      { id: `${t}_hosp1_e1`, at: iso(admitted + 15), by: 'Dr. Gustavo Prates', text: 'Admissão: animal alerta, parâmetros registrados (fictício).' },
      { id: `${t}_hosp1_e2`, at: iso(-4 * 60), by: 'Dra. Camila Torres', text: 'Evolução: aceitou água, segue em observação (fictício).' },
    ],
    prescriptions: [], tasks: [],
  }
  h = addPrescription(h, rx('rx1', 'Medicamento A (demonstrativo)', '1 comprimido', 'Oral', 8), mkId)
  h = addPrescription(h, rx('rx2', 'Medicamento B (demonstrativo)', '2 mL', 'Subcutânea', 6), mkId)
  const rx1 = h.prescriptions[0].id
  // A: -9h30 administrado, -1h30 sem registro (→ atrasado). B: -9h30 administrado, -3h30 não administrado.
  h.tasks = h.tasks.map((task) => {
    const mins = (new Date(task.dueAt).getTime() - now().getTime()) / 60000
    if (mins > -60 * 2) return task
    if (mins < -60 * 9) return { ...task, status: 'administrado', doneAt: new Date(new Date(task.dueAt).getTime() + 5 * 60000).toISOString(), by: 'Auxiliar — Tânia (demo)', note: task.prescriptionId === rx1 ? 'Aceitou com alimento.' : undefined }
    return { ...task, status: 'nao_administrado', doneAt: new Date(new Date(task.dueAt).getTime() + 10 * 60000).toISOString(), by: 'Auxiliar — Tânia (demo)', reason: 'Animal em jejum para exame (conduta registrada)' }
  })
  const past: Hospitalization = {
    id: `${t}_hosp0`, tenantId: t, createdAt: iso(-20 * 1440), unitId: `${t}_u1`, patientId: P(t, 1), boxId: `${t}_u1_r5`, reason: 'Observação (fictício)', professionalId: PRO(t, 1), tutorPersonId: `${t}_per1`,
    admittedAt: iso(-20 * 1440), admittedBy: 'Dra. Camila Torres', status: 'alta', evolutions: [{ id: `${t}_hosp0_e1`, at: iso(-20 * 1440 + 60), by: 'Dra. Camila Torres', text: 'Admissão para observação (fictício).' }],
    prescriptions: [], tasks: [], discharge: { at: iso(-19 * 1440), by: 'Dra. Camila Torres', summary: 'Alta com orientações ao tutor. Retorno conforme combinado (fictício).' },
  }
  return [h, past]
})

registerSeed('groomingNotes', (c) => {
  if (c.tenantId !== 'org_vet') return []
  const t = c.tenantId, d = today(c)
  ensureAppointments(c, [
    { id: `${t}_ap_banho1`, patientId: P(t, 3), serviceId: `${t}_svc5`, resourceKind: 'equipamento', date: d, preferPros: [PRO(t, 3), PRO(t, 1), PRO(t, 2)], status: 'confirmada', fixedMin: 9 * 60 },
    { id: `${t}_ap_banho2`, patientId: P(t, 1), serviceId: `${t}_svc6`, resourceKind: 'equipamento', date: d, preferPros: [PRO(t, 3), PRO(t, 1), PRO(t, 2)], status: 'confirmada', fixedMin: 14 * 60 },
  ])
  return [{ id: `${t}_gn1`, tenantId: t, createdAt: iso(-60), appointmentId: `${t}_ap_banho1`, notes: 'Pelagem com nós na região do pescoço. Tutor pediu laço (fictício).', authorization: [{ authorized: true, at: iso(-60), by: 'Recepção — Carolina (demo)' }] }]
})

// ====================== Estética ======================
registerSeed('aestheticApplications', (c) => {
  if (c.tenantId !== 'org_lumiere') return []
  const t = c.tenantId, d = today(c)
  const mk = (i: number, day: number, regionId: string, point: { x: number; y: number }, amount: number, unit: 'U' | 'mL', product: string, lot: string) => ({
    id: `${t}_apl${i}`, tenantId: t, createdAt: iso(day * 1440), patientId: P(t, 1), sessionDate: addDaysCivil(d, day), view: 'face' as const, regionId, point, product, amount, unit, lot, professionalId: PRO(t, 1), by: 'Dra. Beatriz Valente', notes: i === 2 ? 'Sem intercorrências (fictício).' : undefined,
  })
  return [
    mk(1, -45, 'glabela', { x: 150, y: 118 }, 10, 'U', 'Produto injetável A (demonstrativo)', 'DEMO-TX-118'),
    mk(2, -45, 'fronte', { x: 150, y: 80 }, 8, 'U', 'Produto injetável A (demonstrativo)', 'DEMO-TX-118'),
    mk(3, -10, 'nasolabial_d', { x: 118, y: 205 }, 0.5, 'mL', 'Preenchedor B (demonstrativo)', 'DEMO-PR-442'),
    mk(4, -10, 'nasolabial_e', { x: 182, y: 205 }, 0.5, 'mL', 'Preenchedor B (demonstrativo)', 'DEMO-PR-442'),
  ]
})

registerSeed('aestheticPackages', (c) => {
  if (c.tenantId !== 'org_lumiere') return []
  const t = c.tenantId, d = today(c)
  const sessions = (days: number[]) => days.map((x) => ({ date: addDaysCivil(d, x), professionalId: PRO(t, 2), note: 'Sessão realizada (fictício).' }))
  const pk: AestheticPackage[] = [
    { id: `${t}_pkg1`, tenantId: t, createdAt: iso(-70 * 1440), patientId: P(t, 1), serviceId: `${t}_svc5`, name: 'Drenagem linfática — 10 sessões', sessionsTotal: 10, sessions: sessions([-63, -56, -49, -42, -35, -21]), validUntil: addDaysCivil(d, 20), priceCents: 150000, status: 'ativo' },
    { id: `${t}_pkg2`, tenantId: t, createdAt: iso(-120 * 1440), patientId: P(t, 1), serviceId: `${t}_svc4`, name: 'Limpeza de pele — 4 sessões', sessionsTotal: 4, sessions: sessions([-110, -80, -50, -20]), validUntil: addDaysCivil(d, 60), priceCents: 76000, status: 'concluido' },
    { id: `${t}_pkg3`, tenantId: t, createdAt: iso(-200 * 1440), patientId: P(t, 2), serviceId: `${t}_svc6`, name: 'Radiofrequência — 8 sessões', sessionsTotal: 8, sessions: sessions([-190, -175, -160]), validUntil: addDaysCivil(d, -5), priceCents: 180000, status: 'ativo' },
  ]
  return pk
})

registerSeed('aestheticComparisons', (c) => {
  if (c.tenantId !== 'org_lumiere') return []
  const t = c.tenantId, d = today(c)
  return [{
    id: `${t}_cmp1`, tenantId: t, createdAt: iso(-10 * 1440), patientId: P(t, 1), title: 'Sulco nasolabial — acompanhamento', regionLabel: 'Face (ilustração)', beforeOn: addDaysCivil(d, -45), afterOn: addDaysCivil(d, -10), variant: 1,
    offset: { x: 0, y: 0 }, consent: { clinical: { granted: true, at: iso(-45 * 1440), by: 'Paciente (termo demonstrativo)' }, marketing: { granted: false } },
    history: [{ at: iso(-45 * 1440), by: 'Dra. Beatriz Valente', text: 'Consentimento para uso clínico registrado. Uso publicitário NÃO autorizado.' }],
  }]
})

// ====================== Psicologia ======================
registerSeed('psychPlans', (c) => {
  if (c.tenantId !== 'org_escuta') return []
  const t = c.tenantId, d = today(c)
  ensureAppointments(c, [
    ...[-14, -7, 0, 7, 14, 21].map((x, k): Want => ({ id: `${t}_ser1_${k + 1}`, seriesId: `${t}_ser1`, patientId: P(t, 1), serviceId: `${t}_svc2`, resourceKind: 'consultorio', date: addDaysCivil(d, x), preferPros: [PRO(t, 1)], status: x < 0 ? 'concluida' : 'confirmada', fixedMin: 17 * 60 })),
    ...[2, 9, 16, 23].map((x, k): Want => ({ id: `${t}_ser2_${k + 1}`, seriesId: `${t}_ser2`, patientId: P(t, 5), serviceId: `${t}_svc2`, resourceKind: 'consultorio', date: addDaysCivil(d, x), preferPros: [PRO(t, 2)], status: 'confirmada', fixedMin: 16 * 60 })),
  ])
  return [
    { id: `${t}_pp1`, tenantId: t, createdAt: iso(-30 * 1440), patientId: P(t, 1), professionalId: PRO(t, 1), frequency: 'Semanal, 50 min', reviewOn: addDaysCivil(d, 30), notes: 'Plano definido com a paciente (fictício).',
      objectives: [{ id: 'o1', text: 'Ampliar repertório de manejo de ansiedade (fictício)', status: 'em_andamento' }, { id: 'o2', text: 'Organizar rotina de sono (fictício)', status: 'atingido' }],
      history: [{ at: iso(-30 * 1440), by: 'Ma. Letícia Furtado', text: 'Plano criado.' }] },
    { id: `${t}_pp5`, tenantId: t, createdAt: iso(-15 * 1440), patientId: P(t, 5), professionalId: PRO(t, 2), frequency: 'Semanal; sessão com responsáveis mensal', reviewOn: addDaysCivil(d, 45), notes: 'Atendimento de adolescente; combinados de sigilo explicados (fictício).',
      objectives: [{ id: 'o1', text: 'Fortalecer vínculo terapêutico (fictício)', status: 'em_andamento' }],
      history: [{ at: iso(-15 * 1440), by: 'Me. Rodrigo Saldanha', text: 'Plano criado.' }] },
  ]
})

registerSeed('guardianDecisions', (c) => {
  if (c.tenantId !== 'org_escuta') return []
  const t = c.tenantId
  return [{ id: `${t}_gd1`, tenantId: t, createdAt: iso(-15 * 1440), patientId: P(t, 5), linkId: `${t}_pat5_lkg`, field: 'canSeeClinical', from: false, to: false, reason: 'Padrão mantido: conteúdo de sessão não compartilhado com o responsável. Agenda e financeiro liberados.', by: 'Me. Rodrigo Saldanha' }]
})

// ====================== Fisioterapia ======================
registerSeed('physioAssessments', (c) => {
  if (c.tenantId !== 'org_movimento') return []
  const t = c.tenantId, d = today(c)
  return [
    { id: `${t}_pa1`, tenantId: t, createdAt: iso(-40 * 1440), patientId: P(t, 1), professionalId: PRO(t, 1), date: addDaysCivil(d, -40), pain: 7,
      rom: [{ joint: 'Joelho', movement: 'Flexão', side: 'D', degrees: 95 }, { joint: 'Joelho', movement: 'Extensão', side: 'D', degrees: -5 }],
      strength: [{ muscle: 'Quadríceps', side: 'D', grade: 3 }, { muscle: 'Isquiotibiais', side: 'D', grade: 4 }],
      tests: [{ name: 'Sentar e levantar (5x)', result: '16 s (fictício)' }], notes: 'Avaliação inicial (fictício).' },
    { id: `${t}_pa2`, tenantId: t, createdAt: iso(-5 * 1440), patientId: P(t, 1), professionalId: PRO(t, 1), date: addDaysCivil(d, -5), pain: 3,
      rom: [{ joint: 'Joelho', movement: 'Flexão', side: 'D', degrees: 120 }, { joint: 'Joelho', movement: 'Extensão', side: 'D', degrees: 0 }],
      strength: [{ muscle: 'Quadríceps', side: 'D', grade: 4 }, { muscle: 'Isquiotibiais', side: 'D', grade: 4 }],
      tests: [{ name: 'Sentar e levantar (5x)', result: '11 s (fictício)' }], notes: 'Reavaliação (fictício).' },
  ]
})
registerSeed('physioGoals', (c) => {
  if (c.tenantId !== 'org_movimento') return []
  const t = c.tenantId, d = today(c)
  const g = (i: number, specific: string, measure: string, target: string, due: number, status: 'ativa' | 'atingida') => ({ id: `${t}_pg${i}`, tenantId: t, createdAt: iso(-40 * 1440), patientId: P(t, 1), professionalId: PRO(t, 1), specific, measure, target, dueOn: addDaysCivil(d, due), status })
  return [
    g(1, 'Reduzir dor ao subir escadas', 'Escala de dor 0–10', '≤ 2', 20, 'ativa'),
    g(2, 'Ganhar flexão do joelho direito', 'Goniometria (graus)', '≥ 120°', -3, 'atingida'),
    g(3, 'Retornar à caminhada contínua', 'Minutos sem dor', '30 min', 35, 'ativa'),
  ]
})
registerSeed('physioPlans', (c) => c.tenantId !== 'org_movimento' ? [] : [{ id: `${c.tenantId}_ppl1`, tenantId: c.tenantId, createdAt: iso(-40 * 1440), patientId: P(c.tenantId, 1), professionalId: PRO(c.tenantId, 1), sessionsPlanned: 12, startOn: addDaysCivil(today(c), -40), notes: '2x por semana (fictício).' }])
registerSeed('exercisePlans', (c) => {
  if (c.tenantId !== 'org_movimento') return []
  const t = c.tenantId, d = today(c)
  const plan: ExercisePlan = {
    id: `${t}_ex1`, tenantId: t, createdAt: iso(-20 * 1440), patientId: P(t, 1), professionalId: PRO(t, 1), title: 'Fortalecimento de joelho — fase 2', releasedToPortal: true, status: 'ativo',
    exercises: [
      { id: 'e1', name: 'Agachamento parcial apoiado', sets: 3, reps: 12, frequency: '3x por semana', instructions: 'Movimento lento, sem dor acima de 3/10. Interromper se houver dor aguda.', mediaLabel: 'Ilustração demonstrativa — agachamento' },
      { id: 'e2', name: 'Ponte de glúteos', sets: 3, reps: 15, frequency: 'Diário', instructions: 'Manter 2 s no topo.', mediaLabel: 'Ilustração demonstrativa — ponte' },
      { id: 'e3', name: 'Prancha isométrica', sets: 3, holdSec: 30, frequency: '3x por semana', instructions: 'Coluna neutra; respiração contínua.', mediaLabel: 'Ilustração demonstrativa — prancha' },
    ],
    adherence: [
      { date: addDaysCivil(d, -3), exerciseId: 'e1', done: true, at: iso(-3 * 1440), note: 'Sem dor.' },
      { date: addDaysCivil(d, -3), exerciseId: 'e2', done: true, at: iso(-3 * 1440) },
      { date: addDaysCivil(d, -2), exerciseId: 'e2', done: false, at: iso(-2 * 1440), note: 'Não consegui por falta de tempo.' },
      { date: addDaysCivil(d, -1), exerciseId: 'e3', done: true, at: iso(-1 * 1440) },
    ],
  }
  return [plan]
})

// ====================== Nutrição ======================
registerSeed('nutritionAnamneses', (c) => c.tenantId !== 'org_nutri' ? [] : [{
  id: `${c.tenantId}_na1`, tenantId: c.tenantId, createdAt: iso(-60 * 1440), patientId: P(c.tenantId, 1), professionalId: PRO(c.tenantId, 1), date: addDaysCivil(today(c), -60),
  mealsPerDay: 4, waterL: 1.5, routine: 'Trabalho em escritório; almoço fora de casa (fictício).', preferences: 'Frutas, arroz e feijão.', aversions: 'Fígado.', intolerances: 'Nenhuma relatada.',
  supplements: 'Nenhum.', activity: 'Caminhada 2x/semana.', sleep: '6–7 h.', bowel: 'Regular.', notes: 'Dados fictícios.',
}])
registerSeed('nutritionAssessments', (c) => {
  if (c.tenantId !== 'org_nutri') return []
  const t = c.tenantId, d = today(c)
  return [
    { id: `${t}_nm1`, tenantId: t, createdAt: iso(-60 * 1440), patientId: P(t, 1), professionalId: PRO(t, 1), date: addDaysCivil(d, -60), weightKg: 78.4, heightCm: 165, waistCm: 92, hipCm: 104, armCm: 31, bodyFatPct: 34, notes: '% gordura informado por bioimpedância (fictício).' },
    { id: `${t}_nm2`, tenantId: t, createdAt: iso(-5 * 1440), patientId: P(t, 1), professionalId: PRO(t, 1), date: addDaysCivil(d, -5), weightKg: 75.1, heightCm: 165, waistCm: 88, hipCm: 102, armCm: 30.5, bodyFatPct: 32, notes: '% gordura informado por bioimpedância (fictício).' },
  ]
})
registerSeed('nutritionPlans', (c) => {
  if (c.tenantId !== 'org_nutri') return []
  const t = c.tenantId
  const meals = (v: number): NutritionPlan['meals'] => [
    { id: 'm1', name: 'Café da manhã', time: '07:00', items: ['Pão integral (2 fatias)', 'Ovo mexido (1 unidade)', v > 1 ? 'Mamão (1 fatia)' : 'Banana (1 unidade)'] },
    { id: 'm2', name: 'Almoço', time: '12:30', items: ['Arroz (4 colheres)', 'Feijão (1 concha)', 'Salada à vontade', 'Frango grelhado (1 filé)'], notes: 'Exemplo editado pelo profissional.' },
    { id: 'm3', name: 'Lanche', time: '16:00', items: ['Iogurte natural (1 pote)', 'Castanhas (1 punhado)'] },
    { id: 'm4', name: 'Jantar', time: '19:30', items: ['Sopa de legumes (1 prato)', 'Queijo branco (1 fatia)'] },
  ]
  return [
    { id: `${t}_np1`, tenantId: t, createdAt: iso(-60 * 1440), patientId: P(t, 1), professionalId: PRO(t, 1), version: 1, title: 'Plano alimentar', meals: meals(1), guidance: 'Hidratação ao longo do dia (exemplo).', reviewedAt: iso(-60 * 1440), releasedToPortal: false, status: 'substituido' },
    { id: `${t}_np2`, tenantId: t, createdAt: iso(-5 * 1440), patientId: P(t, 1), professionalId: PRO(t, 1), version: 2, title: 'Plano alimentar', meals: meals(2), guidance: 'Hidratação ao longo do dia; ajustes combinados na consulta (exemplo).', reviewedAt: iso(-5 * 1440), releasedToPortal: true, status: 'liberado' },
  ]
})

// ====================== Plano de cuidado multidisciplinar ======================
registerSeed('carePlans', (c) => {
  if (c.tenantId !== 'org_vitta' && c.tenantId !== 'org_movimento') return []
  const t = c.tenantId, d = today(c)
  const pros = c.get('professionals')
  const [p1, p2, p3] = [pros[0], pros[1], pros[2]]
  if (!p1 || !p2 || !p3) return []
  const vitta = t === 'org_vitta'
  return [{
    id: `${t}_cp1`, tenantId: t, createdAt: iso(-20 * 1440), patientId: P(t, 1), title: vitta ? 'Cuidado integrado — acompanhamento clínico e cardiológico' : 'Reabilitação integrada — joelho', status: 'ativo', createdBy: p1.name,
    participants: [p1, p2, p3].map((p, i) => ({ professionalId: p.id, role: i === 0 ? 'Coordenação do plano' : p.specialty, addedAt: iso(-20 * 1440), addedBy: p1.name })),
    sections: [
      { id: 's1', title: 'Objetivos compartilhados', content: 'Objetivos combinados entre a equipe e o paciente (fictício).', authorProId: p1.id, visibleTo: [p1.id, p2.id, p3.id], releasedToPatient: true, updatedAt: iso(-20 * 1440), updatedBy: p1.name },
      { id: 's2', title: vitta ? 'Notas da clínica médica' : 'Notas de ortopedia', content: 'Conteúdo visível apenas para a coordenação e um participante (fictício).', authorProId: p1.id, visibleTo: [p1.id, p2.id], releasedToPatient: false, updatedAt: iso(-10 * 1440), updatedBy: p1.name },
      { id: 's3', title: 'Orientações ao paciente', content: 'Manter acompanhamento conforme combinado (exemplo).', authorProId: p2.id, visibleTo: [p1.id, p2.id, p3.id], releasedToPatient: true, updatedAt: iso(-5 * 1440), updatedBy: p2.name },
    ],
    referrals: [
      { id: 'r1', fromProId: p1.id, toProId: p3.id, reason: vitta ? 'Avaliação cardiológica complementar (fictício)' : 'Avaliação para pilates clínico (fictício)', status: 'aceito', at: iso(-15 * 1440), history: [{ at: iso(-15 * 1440), by: p1.name, to: 'enviado' }, { at: iso(-14 * 1440), by: p3.name, to: 'aceito' }] },
      { id: 'r2', fromProId: p2.id, toProId: p1.id, reason: 'Reavaliação de conduta (fictício)', status: 'enviado', at: iso(-2 * 1440), history: [{ at: iso(-2 * 1440), by: p2.name, to: 'enviado' }] },
    ],
    tasks: [
      { id: 'k1', title: 'Revisar exames trazidos pelo paciente', assigneeProId: p1.id, dueOn: addDaysCivil(d, -1), done: false },
      { id: 'k2', title: 'Agendar reavaliação conjunta', assigneeProId: p2.id, dueOn: addDaysCivil(d, 7), done: false },
      { id: 'k3', title: 'Enviar orientações liberadas', assigneeProId: p3.id, dueOn: addDaysCivil(d, -6), done: true, doneAt: iso(-6 * 1440), doneBy: p3.name },
    ],
  }]
})
