// Seed determinístico por tenant, relativo à data-base da demo.
// Cenários incluídos: atraso, pagamento parcial, cancelamento, estorno, conflito de agenda reconhecido,
// assinatura pendente, falta, multiunidade (Sorriso Pleno), tutor com dois animais, menor com responsável.
import type {
  Appointment, AppointmentStatus, Charge, ClinicDocument, ClinicalRecord, OutboxMessage, Patient, PatientLink, Person,
  Professional, Proposal, Resource, Segment, Service, StaffUser, Unit, WaitlistEntry, AuditEvent, TreatmentItem,
} from '@/domain/types'
import { addDaysCivil, civilWeekday, demoBaseDate, zonedParts, zonedToInstant, addMinutes } from '@/lib/dates'
import { fakeCPF, hashString, rng } from '@/lib/util'
import { splitInstallments } from '@/lib/money'
import { CATALOG, TUTOR_NAMES } from './segments'
import { getOrganization } from '@/data/platformSeed'

const COLORS = ['#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#0891B2']

function orgOf(tenantId: string) {
  const o = getOrganization(tenantId)
  if (!o) throw new Error(`Tenant desconhecido no seed: ${tenantId}`)
  return o
}
function baseISO() { return demoBaseDate().toISOString() }
function today(tz: string) { return zonedParts(demoBaseDate(), tz).date }

const weekHours = (start: number, end: number, sat = false) => {
  const h: Unit['hours'] = {}
  for (let d = 1; d <= 5; d++) h[d] = [{ start, end }]
  if (sat) h[6] = [{ start: 8 * 60, end: 12 * 60 }]
  h[0] = []
  if (!sat) h[6] = []
  return h
}

export function seedUnits(tenantId: string): Unit[] {
  const o = orgOf(tenantId)
  const t = today(o.timezone)
  const created = o.createdAt
  const holiday = { date: addDaysCivil(t, 12), name: 'Feriado municipal (fictício)' }
  const units: Unit[] = [{
    id: `${tenantId}_u1`, tenantId, createdAt: created, name: o.slug === 'sorriso-pleno' ? 'Unidade Centro' : 'Unidade principal',
    timezone: o.timezone, address: `Rua Exemplo, 100 — ${o.city} (endereço fictício)`, phone: '(00) 3000-0001',
    hours: weekHours(8 * 60, 19 * 60, o.segment === 'veterinaria' || o.segment === 'estetica'), holidays: [holiday],
    specialHours: [{ date: addDaysCivil(t, 5), intervals: [{ start: 8 * 60, end: 12 * 60 }], reason: 'Expediente reduzido (treinamento da equipe)' }],
  }]
  if (o.slug === 'sorriso-pleno') units.push({
    id: `${tenantId}_u2`, tenantId, createdAt: created, name: 'Unidade Cambuí', document: '00.555.666/0002-00', timezone: o.timezone,
    address: 'Av. Fictícia, 2000 — Campinas/SP (endereço fictício)', phone: '(00) 3000-0002', hours: weekHours(9 * 60, 18 * 60, true), holidays: [holiday], specialHours: [],
    overrides: { 'agenda.cancelamentoHoras': 12 },
  })
  return units
}

export function seedResources(tenantId: string, units: Unit[]): Resource[] {
  const cat = CATALOG[orgOf(tenantId).segment]
  return units.flatMap((u, ui) => cat.resources.map((r, i) => ({
    id: `${u.id}_r${i + 1}`, tenantId, createdAt: u.createdAt, unitId: u.id, kind: r.kind, name: ui > 0 ? `${r.name} (Cambuí)` : r.name, active: true,
    blocks: i === 1 && ui === 0 ? [{ start: zonedToInstant(addDaysCivil(today(u.timezone), 3), 14 * 60, u.timezone), end: zonedToInstant(addDaysCivil(today(u.timezone), 3), 18 * 60, u.timezone), reason: 'Manutenção preventiva' }] : [],
  })))
}

export function seedProfessionals(tenantId: string, units: Unit[]): Professional[] {
  const o = orgOf(tenantId)
  const cat = CATALOG[o.segment]
  return cat.professionals.map((p, i) => {
    const unitIds = units.length > 1 ? (i % 2 === 0 ? [units[0].id] : units.map((u) => u.id)) : [units[0].id]
    const schedule: Professional['schedule'] = []
    for (const uid of unitIds) for (let wd = 1; wd <= 5; wd++) {
      if (unitIds.length > 1 && (uid === units[1].id) !== (wd >= 4)) continue // multiunidade: seg-qua Centro, qui-sex Cambuí
      schedule.push({ unitId: uid, weekday: wd, start: 8 * 60 + (i % 2) * 60, end: 18 * 60 })
    }
    if (o.segment === 'veterinaria' || o.segment === 'estetica') schedule.push({ unitId: units[0].id, weekday: 6, start: 8 * 60, end: 12 * 60 })
    const t = today(o.timezone)
    return {
      id: `${tenantId}_pro${i + 1}`, tenantId, createdAt: o.createdAt, name: p.name, council: p.council, specialty: p.specialty, unitIds,
      color: COLORS[i % COLORS.length], userId: `${tenantId}_usr_pro${i + 1}`, schedule, active: true,
      absences: i === 2 ? [{ start: zonedToInstant(addDaysCivil(t, 7), 0, o.timezone), end: zonedToInstant(addDaysCivil(t, 9), 0, o.timezone), reason: 'Congresso (ausência programada)' }] : [],
    }
  })
}

export function seedServices(tenantId: string): Service[] {
  const o = orgOf(tenantId)
  return CATALOG[o.segment].services.map((s, i) => ({
    id: `${tenantId}_svc${i + 1}`, tenantId, createdAt: o.createdAt, name: s.name, category: s.category, durationMin: s.duration, bufferMin: s.buffer,
    priceCents: s.price, resourceKinds: s.kinds, code: s.code, publicBookable: !!s.publicBookable, depositPercent: s.deposit, active: true,
    kit: [],
  }))
}

export function seedStaff(tenantId: string, units: Unit[], pros: Professional[]): StaffUser[] {
  const o = orgOf(tenantId)
  const mk = (id: string, name: string, memberships: StaffUser['memberships'], professionalId?: string): StaffUser => ({
    id: `${tenantId}_usr_${id}`, tenantId, createdAt: o.createdAt, name, email: `${id}@${o.slug}.exemplo.test`, memberships, professionalId, active: true, mfa: id === 'owner',
  })
  const u1 = units[0].id
  const list: StaffUser[] = [
    mk('owner', 'Proprietária (demo)', [{ role: 'clinic_owner', unitIds: 'all' }]),
    mk('recepcao', 'Recepção — Carolina (demo)', [{ role: 'reception', unitIds: [u1] }]),
    mk('financeiro', 'Financeiro — Márcio (demo)', [{ role: 'finance', unitIds: 'all' }]),
    mk('estoque', 'Estoque — Denise (demo)', [{ role: 'inventory', unitIds: 'all' }]),
    mk('auxiliar', 'Auxiliar — Tânia (demo)', [{ role: 'assistant', unitIds: [u1] }]),
    ...pros.map((p, i) => mk(`pro${i + 1}`, p.name, [{ role: 'professional', unitIds: p.unitIds }], p.id)),
  ]
  if (units.length > 1) {
    list.push(mk('gestor_rede', 'Gestor da rede — Otávio (demo)', [{ role: 'network_manager', unitIds: 'all' }]))
    list.push(mk('gestor_u2', 'Gestora Cambuí — Rita (demo)', [{ role: 'unit_manager', unitIds: [units[1].id] }]))
  } else list.push(mk('gestor', 'Gestor da unidade — Otávio (demo)', [{ role: 'unit_manager', unitIds: [u1] }]))
  return list
}

export function seedPeopleAndPatients(tenantId: string, units: Unit[]): { persons: Person[]; patients: Patient[]; links: PatientLink[] } {
  const o = orgOf(tenantId)
  const cat = CATALOG[o.segment]
  const r = rng(hashString(tenantId + 'people'))
  const t = today(o.timezone)
  const persons: Person[] = []
  const patients: Patient[] = []
  const links: PatientLink[] = []
  const comm = { whatsapp: true, email: true, push: false, marketing: false }
  const created = o.createdAt
  const seedN = hashString(tenantId) % 1000

  if (o.segment === 'veterinaria') {
    TUTOR_NAMES.forEach((name, i) => persons.push({
      id: `${tenantId}_per${i + 1}`, tenantId, createdAt: created, name, cpf: fakeCPF(seedN * 100 + i), birthDate: `19${70 + i * 2}-0${(i % 9) + 1}-1${i % 9}`,
      phone: `(00) 90000-${String(1000 + i)}`, email: `tutor${i + 1}@exemplo.test`, communication: { ...comm, push: i === 0 },
    }))
    cat.animals!.forEach((a, i) => {
      // Tutor 1 (portal demo) tem DOIS animais: Thor e Luna.
      const tutorIdx = i < 2 ? 0 : 1 + ((i - 2) % (TUTOR_NAMES.length - 1))
      const id = `${tenantId}_pat${i + 1}`
      const yearsAgo = 1 + (i % 9)
      patients.push({
        id, tenantId, createdAt: created, kind: 'animal', name: a.name, species: a.species, breed: a.breed, sex: a.sex, coat: a.coat,
        birthDate: addDaysCivil(t, -365 * yearsAgo - i * 17), birthDateEstimated: i % 3 === 0, microchip: i % 2 === 0 ? `000${String(900000000000 + i * 7919)}` : undefined,
        weights: [{ date: addDaysCivil(t, -180), kg: +(a.kg * 0.94).toFixed(1) }, { date: addDaysCivil(t, -60), kg: +(a.kg * 0.98).toFixed(1) }, { date: addDaysCivil(t, -5), kg: a.kg }],
        allergies: i === 1 ? ['Reação prévia registrada a dipirona (fictício)'] : [], clinicalAlerts: i === 3 ? ['Animal reativo — manejo com cautela'] : [],
        tags: [], unitId: units[0].id, status: 'ativo', pendingDocuments: i === 0 ? ['Termo de autorização de procedimento'] : [], sharing: { portal: true, multidisciplinar: false },
      })
      links.push({ id: `${id}_lk`, tenantId, createdAt: created, patientId: id, personId: persons[tutorIdx].id, relation: 'tutor', canSeeClinical: true, canSeeFinancial: true, canSchedule: true })
    })
    // Pagador separado para Mel
    links.push({ id: `${tenantId}_pat3_lkfin`, tenantId, createdAt: created, patientId: `${tenantId}_pat3`, personId: persons[5].id, relation: 'responsavel_financeiro', canSeeClinical: false, canSeeFinancial: true, canSchedule: false })
    return { persons, patients, links }
  }

  cat.patientNames.forEach((name, i) => {
    const id = `${tenantId}_pat${i + 1}`
    const isMinor = (o.segment === 'psicologia' || o.segment === 'medicina') && (i === 4 || i === 9)
    const birth = isMinor ? addDaysCivil(t, -365 * (13 + (i % 3)) - 40) : `19${60 + ((i * 7) % 38)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`
    const personId = `${tenantId}_per${i + 1}`
    if (!isMinor) persons.push({ id: personId, tenantId, createdAt: created, name, cpf: fakeCPF(seedN * 100 + i), birthDate: birth, phone: `(00) 90000-${String(2000 + i)}`, email: `paciente${i + 1}@exemplo.test`, communication: { ...comm, push: i === 0 } })
    patients.push({
      id, tenantId, createdAt: created, kind: 'human', name, birthDate: birth, sex: i % 2 === 0 ? 'F' : 'M', cpf: isMinor ? undefined : fakeCPF(seedN * 100 + i),
      phone: isMinor ? undefined : `(00) 90000-${String(2000 + i)}`, email: isMinor ? undefined : `paciente${i + 1}@exemplo.test`, personId: isMinor ? undefined : personId,
      insurance: o.segment === 'medicina' && i % 3 === 0 ? { name: 'Convênio Demonstração Saúde', cardNumber: `0000 ${String(1000 + i)} ${String(5000 + i * 3)}`, plan: 'Enfermaria (fictício)', validUntil: addDaysCivil(t, 200) } : undefined,
      allergies: i % 6 === 1 ? ['Penicilina (fictício)'] : [], clinicalAlerts: i % 7 === 2 ? ['Hipertensão controlada (fictício)'] : [],
      tags: i % 5 === 0 ? ['Indicação'] : [], unitId: units.length > 1 && i % 3 === 2 ? units[1].id : units[0].id, status: i === 19 ? 'inativo' : 'ativo',
      pendingDocuments: i % 4 === 0 ? ['Termo de consentimento'] : [], sharing: { portal: true, multidisciplinar: o.segment === 'fisioterapia' },
    })
    if (!isMinor) links.push({ id: `${id}_lk`, tenantId, createdAt: created, patientId: id, personId, relation: 'self', canSeeClinical: true, canSeeFinancial: true, canSchedule: true })
  })
  // Menores: responsável = paciente 1 (portal demo) para pat5; outro para pat10. Clínico psicologia NÃO compartilhado por padrão.
  for (const [minorIdx, guardianIdx] of [[4, 0], [9, 2]] as const) {
    const minor = patients[minorIdx]
    if (minor.birthDate && minor.birthDate > addDaysCivil(t, -365 * 18)) {
      const g = persons.find((p) => p.id === `${tenantId}_per${guardianIdx + 1}`)!
      links.push({ id: `${minor.id}_lkg`, tenantId, createdAt: created, patientId: minor.id, personId: g.id, relation: 'responsavel_legal', canSeeClinical: o.segment !== 'psicologia', canSeeFinancial: true, canSchedule: true })
    }
  }
  // Duplicidade sugerida (revisão manual, sem merge automático)
  if (patients.length > 12) {
    patients.push({ ...patients[11], id: `${tenantId}_pat_dup`, name: patients[11].name.toUpperCase(), phone: patients[11].phone, personId: undefined, duplicateOf: [patients[11].id], createdAt: baseISO(), tags: ['Importado'] })
  }
  void r
  return { persons, patients, links }
}

const PAST_DONE: AppointmentStatus[] = ['concluida', 'concluida', 'concluida', 'concluida', 'faltou', 'cancelada']
const FUTURE: AppointmentStatus[] = ['confirmada', 'confirmada', 'aguardando_confirmacao', 'solicitada', 'confirmada']

export function seedAppointments(tenantId: string, units: Unit[], pros: Professional[], services: Service[], patients: Patient[], resources: Resource[]): Appointment[] {
  const o = orgOf(tenantId)
  const r = rng(hashString(tenantId + 'appts'))
  const tz = o.timezone
  const t = today(tz)
  const nowMs = demoBaseDate().getTime()
  const out: Appointment[] = []
  const active = patients.filter((p) => p.status === 'ativo' && !p.duplicateOf)
  let n = 0
  for (let d = -21; d <= 21; d++) {
    const date = addDaysCivil(t, d)
    const wd = civilWeekday(date)
    for (const pro of pros) {
      for (const sch of pro.schedule.filter((s) => s.weekday === wd)) {
        const unit = units.find((u) => u.id === sch.unitId)!
        if (unit.holidays.some((h) => h.date === date)) continue
        let cursor = sch.start + r.int(0, 2) * 30
        const perDay = d === 0 ? 6 : r.int(2, 5)
        for (let k = 0; k < perDay && cursor < sch.end - 30; k++) {
          const svc = r.pick(services.filter((s) => s.priceCents > 0 || r.next() > 0.6))
          const dur = svc.durationMin
          if (cursor + dur > sch.end) break
          const start = zonedToInstant(date, cursor, tz)
          const end = zonedToInstant(date, cursor + dur, tz)
          const startMs = new Date(start).getTime()
          const pat = active[(n * 7 + pros.indexOf(pro) * 3) % active.length]
          // recurso livre do tipo exigido
          const resIds: string[] = []
          for (const kind of svc.resourceKinds) {
            const cand = resources.filter((x) => x.unitId === unit.id && x.kind === kind)
            const free = cand.find((x) => !out.some((a) => a.status !== 'cancelada' && a.resourceIds.includes(x.id) && a.start < end && start < a.end))
            if (free) resIds.push(free.id)
          }
          if (svc.resourceKinds.length && resIds.length < svc.resourceKinds.length) { cursor += 30; continue }
          let status: AppointmentStatus
          if (startMs + dur * 60000 < nowMs - 3600000) status = r.pick(PAST_DONE)
          else if (d === 0) {
            const diffMin = (startMs - nowMs) / 60000
            status = diffMin < -dur ? 'concluida' : diffMin < 0 ? 'em_atendimento' : diffMin < 45 ? 'chegou' : 'confirmada'
          } else status = r.pick(FUTURE)
          const id = `${tenantId}_ap${++n}`
          const createdAt = new Date(startMs - 6 * 86400000).toISOString()
          const history: Appointment['history'] = [{ at: createdAt, from: null, to: 'solicitada', by: 'Recepção (demo)' }]
          if (status !== 'solicitada') history.push({ at: addMinutes(createdAt, 60), from: 'solicitada', to: status === 'aguardando_confirmacao' ? 'aguardando_confirmacao' : 'confirmada', by: 'Recepção (demo)' })
          if (['chegou', 'em_atendimento', 'concluida'].includes(status)) history.push({ at: addMinutes(start, -10), from: 'confirmada', to: 'chegou', by: 'Recepção (demo)' })
          if (['em_atendimento', 'concluida'].includes(status)) history.push({ at: start, from: 'chegou', to: 'em_atendimento', by: pro.name })
          if (status === 'concluida') history.push({ at: end, from: 'em_atendimento', to: 'concluida', by: pro.name })
          if (status === 'faltou') history.push({ at: addMinutes(start, 30), from: 'confirmada', to: 'faltou', by: 'Recepção (demo)' })
          if (status === 'cancelada') history.push({ at: addMinutes(start, -1440), from: 'confirmada', to: 'cancelada', by: 'Paciente (portal)', reason: 'Imprevisto pessoal' })
          out.push({
            id, tenantId, createdAt, unitId: unit.id, patientId: pat.id, professionalId: pro.id, serviceId: svc.id, resourceIds: resIds, start, end, status, history,
            source: r.pick(['recepcao', 'recepcao', 'publico', 'portal'] as const), financialStatus: status === 'concluida' ? (r.next() > 0.3 ? 'pago' : 'cobrado') : 'nao_cobrado',
            arrivedAt: ['chegou', 'em_atendimento', 'concluida'].includes(status) ? addMinutes(start, -10) : undefined,
            startedAt: ['em_atendimento', 'concluida'].includes(status) ? start : undefined, finishedAt: status === 'concluida' ? end : undefined,
            stockConsumedAt: status === 'concluida' ? end : undefined,
          })
          cursor += dur + svc.bufferMin + r.int(0, 2) * 15
        }
      }
    }
  }
  // Conflito de agenda reconhecido (encaixe): mesmo profissional sobreposto amanhã
  const tomorrow = out.find((a) => a.start.slice(0, 10) >= addDaysCivil(t, 1) && a.status === 'confirmada')
  if (tomorrow) out.push({ ...tomorrow, id: `${tenantId}_ap_conf`, patientId: active[1].id, resourceIds: [], start: addMinutes(tomorrow.start, 10), end: addMinutes(tomorrow.end, -5), status: 'aguardando_confirmacao', notes: 'Encaixe autorizado pela gestão (conflito reconhecido)', conflictAcknowledged: true, history: [{ at: baseISO(), from: null, to: 'aguardando_confirmacao', by: 'Gestor (demo)', reason: 'Encaixe com conflito reconhecido' }] })
  // Garante próxima consulta do paciente/tutor do portal (paciente 1)
  const portalPat = patients[0]
  const next = out.find((a) => new Date(a.start).getTime() > nowMs + 86400000 && a.status !== 'cancelada')
  if (next) next.patientId = portalPat.id
  return out
}

export function seedWaitlist(tenantId: string, patients: Patient[], services: Service[], units: Unit[]): WaitlistEntry[] {
  orgOf(tenantId)
  return [3, 7, 12].filter((i) => patients[i]).map((i, k): WaitlistEntry => ({
    id: `${tenantId}_wl${k + 1}`, tenantId, createdAt: baseISO(), unitId: units[0].id, patientId: patients[i].id, serviceId: services[k % services.length].id,
    durationMin: services[k % services.length].durationMin, availability: [{ weekday: 1 + k, start: 8 * 60, end: 12 * 60 }, { weekday: 3 + (k % 2), start: 13 * 60, end: 18 * 60 }],
    priority: k === 0 ? 'alta' : 'normal', notes: k === 0 ? 'Prefere primeiro horário (prioridade operacional)' : undefined, status: 'aguardando',
  }))
}

export function seedClinical(tenantId: string, appts: Appointment[], pros: Professional[], patients: Patient[]): { records: ClinicalRecord[]; documents: ClinicDocument[] } {
  const o = orgOf(tenantId)
  const seg = o.segment
  const done = appts.filter((a) => a.status === 'concluida').slice(0, 40)
  const restricted = seg === 'psicologia'
  const templ: Record<Segment, { id: string; title: string; content: (i: number) => Record<string, unknown> }> = {
    odontologia: { id: 'odonto_evolucao', title: 'Evolução odontológica', content: (i) => ({ queixa: 'Sensibilidade ao frio (fictício)', procedimento: i % 2 ? 'Restauração em resina no 16 (oclusal)' : 'Profilaxia e orientação de higiene', observacoes: 'Paciente orientado. Dados fictícios.' }) },
    medicina: { id: 'soap', title: 'Evolução SOAP', content: (i) => ({ s: 'Refere cefaleia ocasional há 2 semanas (fictício).', o: `PA 12x8 mmHg; FC ${70 + (i % 10)} bpm (fictício).`, a: 'Hipótese registrada pelo profissional (fictício).', p: 'Orientações gerais e retorno conforme decisão do médico.' }) },
    veterinaria: { id: 'vet_consulta', title: 'Consulta veterinária', content: () => ({ anamnese: 'Tutor relata apetite normal (fictício).', exame: 'Mucosas normocoradas, TPC < 2s (fictício).', conduta: 'Conduta definida pelo veterinário (fictício).' }) },
    estetica: { id: 'estetica_sessao', title: 'Registro de sessão estética', content: () => ({ regiao: 'Glabela', produto: 'Produto demonstrativo', observacoes: 'Sem intercorrências (fictício).' }) },
    psicologia: { id: 'psico_sessao', title: 'Registro de sessão', content: () => ({ tema: 'Conteúdo restrito da sessão (fictício).', evolucao: 'Registro restrito ao profissional (fictício).' }) },
    fisioterapia: { id: 'fisio_evolucao', title: 'Evolução fisioterapêutica', content: (i) => ({ dor: 6 - (i % 5), conduta: 'Cinesioterapia e mobilização (fictício).', resposta: 'Boa tolerância (fictício).' }) },
    nutricao: { id: 'nutri_consulta', title: 'Consulta nutricional', content: (i) => ({ peso: 78 - i * 0.3, objetivo: 'Definido em conjunto com o profissional (fictício).', orientacoes: 'Plano revisado pelo nutricionista (fictício).' }) },
  }
  const tp = templ[seg]
  const records: ClinicalRecord[] = done.map((a, i) => ({
    id: `${tenantId}_rec${i + 1}`, tenantId, createdAt: a.end, patientId: a.patientId, appointmentId: a.id, professionalId: a.professionalId, specialty: seg,
    templateId: tp.id, templateVersion: 1, title: tp.title, content: tp.content(i), status: i % 9 === 4 ? 'rascunho' : 'finalizado', addenda: [],
    confidentiality: restricted ? 'restrito' : 'padrao', releasedToPortal: !restricted && i % 2 === 0,
    portalGuidance: !restricted && i % 2 === 0 ? 'Orientações pós-atendimento (exemplo): manter acompanhamento conforme combinado com o profissional.' : undefined,
    finalizedAt: i % 9 === 4 ? undefined : a.end, history: [{ at: a.end, from: null, to: 'rascunho', by: pros.find((p) => p.id === a.professionalId)?.name ?? '' }, ...(i % 9 === 4 ? [] : [{ at: a.end, from: 'rascunho' as const, to: 'finalizado' as const, by: pros.find((p) => p.id === a.professionalId)?.name ?? '' }])],
  }))
  const p0 = patients[0]
  const sig = (status: ClinicDocument['signature']['status']): ClinicDocument['signature'] => ({ status, provider: 'demonstracao', signers: status === 'nao_requerida' ? [] : [{ name: p0.name, role: 'Paciente/Responsável', order: 1, status: status === 'assinado' ? 'assinado' : 'pendente', at: status === 'assinado' ? baseISO() : undefined, method: status === 'assinado' ? 'aceite_demo' : undefined }], trail: [{ at: baseISO(), event: 'Documento criado (demonstração)' }] })
  const documents: ClinicDocument[] = [
    { id: `${tenantId}_doc1`, tenantId, createdAt: baseISO(), patientId: p0.id, kind: 'orientacao', title: 'Orientações gerais (exemplo)', body: 'Documento de exemplo com orientações gerais. Sem validade clínica.', status: 'emitido', releasedToPortal: true, confidentiality: 'padrao', signature: sig('nao_requerida'), createdBy: pros[0].id, demoWatermark: true },
    { id: `${tenantId}_doc2`, tenantId, createdAt: baseISO(), patientId: p0.id, kind: 'termo', title: 'Termo de consentimento (exemplo)', body: 'Termo demonstrativo. Assinatura simulada não possui validade jurídica.', status: 'emitido', releasedToPortal: true, confidentiality: 'padrao', signature: sig('pendente'), createdBy: pros[0].id, demoWatermark: true },
    { id: `${tenantId}_doc3`, tenantId, createdAt: baseISO(), patientId: p0.id, kind: 'relatorio', title: restricted ? 'Relatório psicológico (NÃO liberado)' : 'Relatório interno (não liberado)', body: 'Conteúdo interno não liberado ao portal.', status: 'emitido', releasedToPortal: false, confidentiality: restricted ? 'restrito' : 'padrao', signature: sig('nao_requerida'), createdBy: pros[0].id, demoWatermark: true },
    { id: `${tenantId}_doc4`, tenantId, createdAt: baseISO(), patientId: p0.id, kind: 'recibo', title: 'Recibo de pagamento (demonstrativo)', body: 'Recibo demonstrativo sem validade fiscal.', status: 'emitido', releasedToPortal: true, confidentiality: 'padrao', signature: sig('nao_requerida'), createdBy: `${tenantId}_usr_financeiro`, demoWatermark: true },
  ]
  if (restricted) documents.push({ id: `${tenantId}_doc5`, tenantId, createdAt: baseISO(), patientId: p0.id, kind: 'declaracao', title: 'Declaração de comparecimento (liberada)', body: 'Declaração demonstrativa de comparecimento à sessão. Sem conteúdo clínico.', status: 'emitido', releasedToPortal: true, confidentiality: 'padrao', signature: sig('nao_requerida'), createdBy: pros[0].id, demoWatermark: true })
  return { records, documents }
}

export function seedFinance(tenantId: string, appts: Appointment[], services: Service[], patients: Patient[], units: Unit[], pros: Professional[]): { charges: Charge[]; proposals: Proposal[]; treatmentItems: TreatmentItem[] } {
  const o = orgOf(tenantId)
  const t = today(o.timezone)
  const charges: Charge[] = []
  const svcById = new Map(services.map((s) => [s.id, s]))
  let n = 0
  for (const a of appts.filter((x) => x.status === 'concluida')) {
    const svc = svcById.get(a.serviceId)!
    if (svc.priceCents <= 0) continue
    const id = `${tenantId}_ch${++n}`
    const day = a.start.slice(0, 10)
    const paid = a.financialStatus === 'pago'
    charges.push({
      id, tenantId, createdAt: a.end, unitId: a.unitId, patientId: a.patientId, origin: { kind: 'consulta', refId: a.id }, description: svc.name,
      competenceDate: day, dueDate: day, amountCents: svc.priceCents, adjustmentsCents: 0, installment: { n: 1, of: 1, groupId: id }, status: paid ? 'paga' : 'aberta',
      payments: paid ? [{ id: `${id}_p1`, at: a.end, amountCents: svc.priceCents, method: n % 3 === 0 ? 'cartao_credito' : n % 3 === 1 ? 'pix' : 'dinheiro', provider: 'manual', status: 'confirmado', simulated: true, receivedBy: `${tenantId}_usr_recepcao`, availableOn: n % 3 === 0 ? addDaysCivil(day, 30) : day }] : [],
      refunds: [], professionalId: a.professionalId, serviceId: svc.id, category: 'Atendimentos', costCenter: units.find((u) => u.id === a.unitId)?.name,
    })
  }
  // Cenários: parcial, vencida (atraso), estorno, parcelado
  const p = patients[0], p2 = patients[1] ?? patients[0]
  const big = [...services].sort((a, b) => b.priceCents - a.priceCents)[0]
  const groupId = `${tenantId}_grp1`
  splitInstallments(big.priceCents, 3).forEach((amt, i) => charges.push({
    id: `${groupId}_${i + 1}`, tenantId, createdAt: baseISO(), unitId: units[0].id, patientId: p.id, origin: { kind: 'manual' }, description: `${big.name} — parcela ${i + 1}/3`,
    competenceDate: addDaysCivil(t, -40), dueDate: addDaysCivil(t, -40 + i * 30), amountCents: amt, adjustmentsCents: 0, installment: { n: i + 1, of: 3, groupId },
    status: i === 0 ? 'paga' : i === 1 ? 'parcial' : 'aberta', professionalId: pros[0].id, serviceId: big.id, category: 'Tratamentos',
    payments: i === 0 ? [{ id: `${groupId}_${i + 1}_p`, at: zonedToInstant(addDaysCivil(t, -40), 600, o.timezone), amountCents: amt, method: 'pix', provider: 'manual', status: 'confirmado', simulated: true, receivedBy: `${tenantId}_usr_recepcao`, availableOn: addDaysCivil(t, -40) }]
      : i === 1 ? [{ id: `${groupId}_${i + 1}_p`, at: zonedToInstant(addDaysCivil(t, -10), 600, o.timezone), amountCents: Math.round(amt / 2), method: 'dinheiro', provider: 'manual', status: 'confirmado', simulated: true, receivedBy: `${tenantId}_usr_recepcao`, availableOn: addDaysCivil(t, -10) }] : [],
    refunds: [],
  }))
  charges.push({ id: `${tenantId}_ch_venc`, tenantId, createdAt: baseISO(), unitId: units[0].id, patientId: p2.id, origin: { kind: 'manual' }, description: `${services[0].name} (em atraso)`, competenceDate: addDaysCivil(t, -25), dueDate: addDaysCivil(t, -15), amountCents: services[0].priceCents || 15000, adjustmentsCents: 0, installment: { n: 1, of: 1, groupId: `${tenantId}_ch_venc` }, status: 'vencida', payments: [], refunds: [], category: 'Atendimentos' })
  const refundAmt = services[1]?.priceCents || 20000
  charges.push({ id: `${tenantId}_ch_est`, tenantId, createdAt: baseISO(), unitId: units[0].id, patientId: p2.id, origin: { kind: 'manual' }, description: `${services[1]?.name ?? 'Serviço'} (estornado)`, competenceDate: addDaysCivil(t, -8), dueDate: addDaysCivil(t, -8), amountCents: refundAmt, adjustmentsCents: 0, installment: { n: 1, of: 1, groupId: `${tenantId}_ch_est` }, status: 'estornada', payments: [{ id: `${tenantId}_ch_est_p`, at: zonedToInstant(addDaysCivil(t, -8), 640, o.timezone), amountCents: refundAmt, method: 'cartao_credito', provider: 'manual', status: 'estornado', simulated: true, receivedBy: `${tenantId}_usr_recepcao` }], refunds: [{ id: `${tenantId}_ch_est_r`, at: zonedToInstant(addDaysCivil(t, -6), 700, o.timezone), amountCents: refundAmt, reason: 'Atendimento cancelado pela clínica', paymentId: `${tenantId}_ch_est_p`, kind: 'estorno' }], category: 'Atendimentos' })

  // Orçamento/proposta com alternativas
  const s = services
  const treatmentItems: TreatmentItem[] = []
  const items = (o.segment === 'odontologia'
    ? [{ svc: s[2], desc: 'Restauração em resina — dente 16 (O)', tooth: 16 }, { svc: s[2], desc: 'Restauração em resina — dente 26 (OD)', tooth: 26 }, { svc: s[5], desc: 'Coroa em cerâmica — dente 36', group: 'reab36', tooth: 36 }, { svc: s[6], desc: 'Implante unitário — dente 36 (alternativa)', group: 'reab36', tooth: 36 }, { svc: s[8], desc: 'Clareamento em consultório', optional: true }]
    : s.slice(0, Math.min(3, s.length)).map((svc, i) => ({ svc, desc: `${svc.name}${i === 2 ? ' (opcional)' : ''}`, optional: i === 2 }))) as { svc: Service; desc: string; group?: string; optional?: boolean; tooth?: number }[]
  items.forEach((it, i) => treatmentItems.push({ id: `${tenantId}_ti${i + 1}`, tenantId, createdAt: baseISO(), patientId: p.id, professionalId: pros[0].id, serviceId: it.svc.id, description: it.desc, origin: it.tooth ? { kind: 'odontograma', tooth: it.tooth, faces: ['O'] } : { kind: 'manual' }, priceCents: it.svc.priceCents || 10000, status: 'orcado', proposalId: `${tenantId}_prop1` }))
  const proposals: Proposal[] = [{
    id: `${tenantId}_prop1`, tenantId, createdAt: baseISO(), unitId: units[0].id, patientId: p.id, professionalId: pros[0].id, number: 'ORC-0001', version: 1,
    token: `demo-${hashString(tenantId + 'tok').toString(36)}${hashString(tenantId + 'x').toString(36)}`,
    items: items.map((it, i) => ({ id: `${tenantId}_pi${i + 1}`, treatmentItemId: `${tenantId}_ti${i + 1}`, serviceId: it.svc.id, description: it.desc, qty: 1, unitCents: it.svc.priceCents || 10000, discountCents: i === 0 ? 2000 : 0, optionGroup: it.group, optional: it.optional, explanation: it.group ? 'Duas alternativas para o mesmo dente: escolha uma, após conversar com o profissional.' : undefined })),
    validUntil: addDaysCivil(t, 15), maxInstallments: 6, conditions: 'Valores demonstrativos. Parcelamento sujeito à política da clínica. Pagamento simulado — sem cobrança real.', maxDiscountPercent: 10,
    financialResponsibleId: p.personId, status: 'enviada', acceptedItemIds: [], questions: [], history: [{ at: baseISO(), from: null, to: 'rascunho', by: pros[0].name }, { at: baseISO(), from: 'rascunho', to: 'enviada', by: pros[0].name }], chargeIds: [],
    estimatedCostCents: 45000,
  }]
  return { charges, proposals, treatmentItems }
}

export function seedOutbox(tenantId: string, patients: Patient[]): OutboxMessage[] {
  const p = patients[0]
  const mk = (i: number, event: OutboxMessage['event'], channel: OutboxMessage['channel'], status: OutboxMessage['status'], subject: string): OutboxMessage => ({
    id: `${tenantId}_ob${i}`, tenantId, createdAt: baseISO(), event, channel, recipientName: p.name, recipientRef: p.personId ?? p.id, subject, preview: `${subject} — abra o portal para detalhes.`,
    dedupeKey: `${event}:${p.id}:${channel}:${i}`, status, attempts: [{ at: baseISO(), result: status === 'falhou' ? 'Provedor indisponível (simulado)' : 'Aceito pelo provedor (simulado)' }], simulated: true,
  })
  return [
    mk(1, 'confirmacao', 'whatsapp', 'entregue', 'Consulta confirmada'), mk(2, 'lembrete', 'email', 'aceito_provedor', 'Lembrete de consulta'),
    mk(3, 'proposta_disponivel', 'email', 'lido', 'Sua proposta está disponível'), mk(4, 'cobranca_proxima', 'whatsapp', 'falhou', 'Cobrança próxima do vencimento'),
  ]
}

export function seedAudit(tenantId: string): AuditEvent[] {
  return [{ id: `${tenantId}_au1`, tenantId, createdAt: baseISO(), actorId: `${tenantId}_usr_owner`, actorName: 'Proprietária (demo)', action: 'seed', resource: 'demo', detail: 'Dados de demonstração gerados' }]
}
