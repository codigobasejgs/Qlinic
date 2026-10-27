// Casos de uso do módulo sobre o store (sem React, sem window no topo). Tudo SIMULADO.
import type { Channel, ID, NotificationEvent, OutboxMessage, TenantRole } from '@/domain/types'
import { db } from '@/data/store'
import { audit } from '@/data/repositories'
import { matchWaitlist, offerSlot } from '@/domain/waitlist'
import { addDaysCivil, addMinutes, formatDateTime, formatCivil, nowISO, zonedParts, zonedToInstant, DEFAULT_TZ } from '@/lib/dates'
import { uid } from '@/lib/util'
import { checkAutomationLimits, evalConditions, quietCheck, OP_LABEL } from './rules'
import { CONTACTS_PERSON, EVENTS, TRIGGER_LABEL, ACTION_LABEL } from './catalog'
import type { AlertKey, Automation, AutomationRun, CommConfig, RunStatus, TriggerCtx } from './types'

export const DEFAULT_COMM: Omit<CommConfig, 'id' | 'tenantId' | 'createdAt'> = { quietHours: { start: 21 * 60, end: 8 * 60 }, fallback: { whatsapp: 'email', email: 'nenhum', push: 'nenhum' }, maxAttempts: 3 }

export function tzOf(tenantId: ID): string {
  return db.list(tenantId, 'units')[0]?.timezone ?? DEFAULT_TZ
}
export function commConfig(tenantId: ID): CommConfig {
  return db.list(tenantId, 'commConfig')[0] ?? { id: 'main', tenantId, createdAt: nowISO(), ...DEFAULT_COMM }
}
export function saveCommConfig(tenantId: ID, patch: Partial<CommConfig>) {
  if (patch.quietHours && (patch.quietHours.start < 0 || patch.quietHours.end > 1440)) throw new Error('Horário silencioso inválido.')
  if (patch.maxAttempts !== undefined && (patch.maxAttempts < 1 || patch.maxAttempts > 10)) throw new Error('Tentativas: entre 1 e 10.')
  const cur = commConfig(tenantId)
  const next = { ...cur, ...patch, updatedAt: nowISO() }
  db.set(tenantId, 'commConfig', [next])
  return next
}

// ---------------- Fila de comunicação ----------------
export interface QueueInput {
  event: NotificationEvent; channel: Channel; recipientName: string; recipientRef: string; subject: string; preview: string; dedupeKey: string; link?: string
  scheduledFor?: string
  marketing?: boolean
  /** Ignora horário silencioso (alertas internos para a equipe). */
  internal?: boolean
}

function acceptLater(t: ID, id: ID, note = 'Aceito pelo provedor (simulado) — entrega não confirmada') {
  setTimeout(() => {
    try { db.update(t, 'outbox', id, (p) => (p.status === 'pendente' ? { ...p, status: 'aceito_provedor', attempts: [...p.attempts, { at: nowISO(), result: note }] } : p)) } catch { /* troca de tenant */ }
  }, 900)
}

/** Regras de envio além de dedupe: marketing/opt-in, suppression list, canal desativado, agendamento e horário silencioso. */
export function gateMessage(t: ID, m: QueueInput, now = new Date()): { status: OutboxMessage['status']; result: string; scheduledFor?: string } | null {
  const person = db.get(t, 'persons', m.recipientRef)
  if (m.marketing && !person?.communication.marketing) return { status: 'suprimido', result: 'Marketing sem opt-in do destinatário — não enviado.' }
  if (m.channel === 'email' && person?.email && db.list(t, 'suppressions').some((s) => s.address.toLowerCase() === person.email!.toLowerCase())) return { status: 'suprimido', result: 'Endereço na suppression list (bounce/complaint/opt-out).' }
  if (person && !person.communication[m.channel]) return { status: 'suprimido', result: `Destinatário desativou o canal ${m.channel}.` }
  if (m.scheduledFor && new Date(m.scheduledFor).getTime() > now.getTime()) return { status: 'pendente', result: `Agendado para ${formatDateTime(m.scheduledFor, tzOf(t))}.`, scheduledFor: m.scheduledFor }
  if (!m.internal) {
    const q = quietCheck(now, tzOf(t), person?.communication.quietHours ?? commConfig(t).quietHours)
    if (!q.allowed) return { status: 'aguardando_janela', result: 'Fora do horário permitido — aguardando janela.', scheduledFor: q.until }
  }
  return null
}

/** Enfileira respeitando dedupe (evento/destinatário/canal) e gateMessage. */
export function queueMessage(t: ID, m: QueueInput, now = new Date()): OutboxMessage {
  const base = { event: m.event, channel: m.channel, recipientName: m.recipientName, recipientRef: m.recipientRef, subject: m.subject, preview: m.preview, dedupeKey: m.dedupeKey, link: m.link }
  const mk = (status: OutboxMessage['status'], result: string, scheduledFor?: string): OutboxMessage => db.insert(t, 'outbox', { ...base, id: uid('ob_'), tenantId: t, createdAt: nowISO(), simulated: true, status, scheduledFor, attempts: [{ at: nowISO(), result }] }) as OutboxMessage
  if (db.list(t, 'outbox').some((x) => x.dedupeKey === m.dedupeKey)) return mk('duplicado', 'Mesmo evento/destinatário/canal já enfileirado — não reenviado.')
  const g = gateMessage(t, m, now)
  if (g) return mk(g.status, g.result, g.scheduledFor)
  const msg = mk('pendente', 'Enviado ao provedor (simulado).')
  acceptLater(t, msg.id)
  return msg
}

/** Libera mensagens agendadas/aguardando janela cujo horário chegou. Retorna quantas foram liberadas. */
export function processQueue(t: ID, now = new Date(), force = false): number {
  let n = 0
  for (const m of db.list(t, 'outbox')) {
    if (!(m.status === 'aguardando_janela' || (m.status === 'pendente' && m.scheduledFor))) continue
    if (!force && m.scheduledFor && new Date(m.scheduledFor).getTime() > now.getTime()) continue
    db.update(t, 'outbox', m.id, (p) => ({ ...p, status: 'pendente', scheduledFor: undefined, attempts: [...p.attempts, { at: nowISO(), result: force ? 'Liberado manualmente para envio (demonstração).' : 'Janela permitida alcançada — enviado ao provedor.' }] }))
    acceptLater(t, m.id)
    n++
  }
  return n
}

/** Retentativa manual: MESMO registro e MESMO dedupeKey (não duplica). */
export function retryMessage(t: ID, id: ID): OutboxMessage {
  const max = commConfig(t).maxAttempts
  const m = db.get(t, 'outbox', id)
  if (!m) throw new Error('Mensagem não encontrada.')
  if (m.status !== 'falhou') throw new Error('Só mensagens com status "Falhou" podem ser retentadas.')
  const tries = m.attempts.filter((a) => /falh|indispon|erro|recus/i.test(a.result)).length
  if (tries >= max) {
    return db.update(t, 'outbox', id, (p) => ({ ...p, status: 'falha_definitiva', attempts: [...p.attempts, { at: nowISO(), result: `Limite de ${max} tentativas atingido — falha definitiva.` }] })) as OutboxMessage
  }
  const r = db.update(t, 'outbox', id, (p) => ({ ...p, status: 'pendente', attempts: [...p.attempts, { at: nowISO(), result: `Retentativa manual ${tries + 1}/${max} (mesmo dedupeKey ${p.dedupeKey}).` }] })) as OutboxMessage
  acceptLater(t, id)
  return r
}

/** Fallback configurável: cria mensagem no canal alternativo com dedupeKey derivado (idempotente). */
export function fallbackMessage(t: ID, id: ID, to?: Channel): OutboxMessage {
  const m = db.get(t, 'outbox', id)
  if (!m) throw new Error('Mensagem não encontrada.')
  if (m.status !== 'falhou' && m.status !== 'falha_definitiva') throw new Error('Fallback só após falha.')
  const target = to ?? commConfig(t).fallback[m.channel]
  if (!target || target === 'nenhum' || target === m.channel) throw new Error(`Sem fallback configurado para ${m.channel}.`)
  const key = `${m.dedupeKey}:fallback:${target}`
  const r = queueMessage(t, { event: m.event, channel: target, recipientName: m.recipientName, recipientRef: m.recipientRef, subject: m.subject, preview: m.preview, dedupeKey: key, link: m.link })
  db.update(t, 'outbox', id, (p) => ({ ...p, attempts: [...p.attempts, { at: nowISO(), result: `Fallback para ${target}: ${r.status === 'duplicado' ? 'já existia (não duplicado)' : 'enfileirado'}.` }] }))
  return r
}

export type ProviderEvent = 'entregue' | 'lido' | 'falhou' | 'bounce' | 'complaint'
/** Eventos simulados do provedor. Status só avança com a evidência correspondente. */
export function simulateProviderEvent(t: ID, id: ID, ev: ProviderEvent): OutboxMessage {
  const m = db.get(t, 'outbox', id)
  if (!m) throw new Error('Mensagem não encontrada.')
  const push = (status: OutboxMessage['status'], result: string) => db.update(t, 'outbox', id, (p) => ({ ...p, status, attempts: [...p.attempts, { at: nowISO(), result }] })) as OutboxMessage
  if (ev === 'entregue') {
    if (m.status !== 'aceito_provedor') throw new Error('Entrega só pode ser registrada após aceite pelo provedor.')
    return push('entregue', 'Evidência de entrega recebida (simulado).')
  }
  if (ev === 'lido') {
    if (m.channel === 'push') throw new Error('Push não fornece confirmação de leitura confiável.')
    if (m.status !== 'entregue') throw new Error('Leitura só após evidência de entrega.')
    return push('lido', m.channel === 'email' ? 'Abertura registrada (simulado) — indicativo, pode ser bloqueado pelo cliente de e-mail.' : 'Confirmação de leitura recebida (simulado).')
  }
  if (ev === 'falhou') {
    if (!['pendente', 'aceito_provedor'].includes(m.status)) throw new Error('Falha só se aplica a mensagem pendente ou aceita.')
    const r = push('falhou', 'Falha reportada pelo provedor (simulado).')
    const fb = commConfig(t).fallback[m.channel]
    if (fb && fb !== 'nenhum') fallbackMessage(t, id, fb)
    return db.get(t, 'outbox', id) ?? r
  }
  if (m.channel !== 'email') throw new Error('Bounce/complaint são eventos de e-mail.')
  const person = db.get(t, 'persons', m.recipientRef)
  const address = person?.email ?? `${m.recipientRef}@destinatario.exemplo.test`
  if (!db.list(t, 'suppressions').some((s) => s.address === address)) db.insert(t, 'suppressions', { id: uid('sup_'), tenantId: t, createdAt: nowISO(), address, reason: ev, note: `Automático: ${ev} na mensagem ${m.subject}` })
  if (ev === 'bounce') {
    if (!['aceito_provedor', 'pendente', 'entregue'].includes(m.status)) throw new Error('Bounce só após envio.')
    return push('falha_definitiva', 'Bounce permanente (simulado) — endereço adicionado à suppression list.')
  }
  return push(m.status, 'Complaint (marcado como spam) (simulado) — endereço adicionado à suppression list; envios futuros suprimidos.')
}

// ---------------- Alertas internos ----------------
const ROLE_OF = (t: ID, staffId: ID): TenantRole[] => db.get(t, 'staff', staffId)?.memberships.map((m) => m.role) ?? []
/** Destinatários internos conforme preferências por perfil. */
export function staffFor(t: ID, alert: AlertKey) {
  const prefs = db.list(t, 'staffAlertPrefs')
  return db.list(t, 'staff').filter((s) => s.active && ROLE_OF(t, s.id).some((r) => prefs.find((p) => p.role === r)?.alerts[alert]))
}
export function alertStaff(t: ID, alert: AlertKey, event: NotificationEvent, subject: string, preview: string, key: string): OutboxMessage[] {
  const day = zonedParts(new Date(), tzOf(t)).date
  return staffFor(t, alert).map((s) => queueMessage(t, { event, channel: 'email', recipientName: s.name, recipientRef: s.id, subject, preview, dedupeKey: `${event}:${key}:${s.id}:${day}`, internal: true }))
}

// ---------------- Automações ----------------
export interface Outcome { ctx: TriggerCtx; status: RunStatus; detail: string; actions: string[]; personRefs: string[]; deferredUntil?: string }

function personOfPatient(t: ID, patientId: ID) {
  const p = db.get(t, 'patients', patientId)
  const ref = p?.personId ?? db.list(t, 'links').find((l) => l.patientId === patientId && (l.canSchedule || l.relation !== 'self'))?.personId
  return { patient: p, personRef: ref, person: ref ? db.get(t, 'persons', ref) : undefined }
}

/** Contextos que uma automação encontraria AGORA (varredura/simulação). */
export function collectContexts(t: ID, a: Automation, now = new Date()): TriggerCtx[] {
  const tz = tzOf(t)
  const today = zonedParts(now, tz).date
  const days = a.params.days ?? 0
  switch (a.trigger) {
    case 'appointment.cancelled':
      return db.list(t, 'appointments').filter((x) => x.status === 'cancelada' && new Date(x.start).getTime() > now.getTime()).map((x) => cancelCtx(t, x.id, now)).filter((c): c is TriggerCtx => !!c)
    case 'proposal.pending':
      return db.list(t, 'proposals').filter((p) => p.status === 'enviada' || p.status === 'visualizada').map((p) => {
        const since = [...p.history].reverse().find((h) => h.to === 'enviada')?.at ?? p.createdAt
        const pending = Math.floor((now.getTime() - new Date(since).getTime()) / 86400000)
        const { patient, personRef } = personOfPatient(t, p.patientId)
        const total = p.items.reduce((s, i) => s + i.qty * i.unitCents - i.discountCents, 0)
        return { key: `proposal:${p.id}:v${p.version}`, subject: `Proposta ${p.number} — ${patient?.name ?? 'paciente'}`, personRef, personName: patient?.name, patientId: p.patientId, refId: p.id, fields: { dias_pendente: pending, valor_reais: Math.round(total / 100) } }
      }) // limiar avaliado em evaluate() para a simulação explicar o motivo
    case 'lot.expiring':
      return db.list(t, 'lots').filter((l) => l.expiresOn && l.qty > 0).map((l) => {
        const left = Math.round((new Date(`${l.expiresOn}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000)
        const prod = db.get(t, 'products', l.productId)
        return { key: `lot:${l.id}:${l.expiresOn}`, subject: `${prod?.name ?? 'Material'} — lote ${l.code} vence em ${formatCivil(l.expiresOn)}`, refId: l.id, dueOn: l.expiresOn, fields: { dias_para_vencer: left, quantidade: l.qty } }
      }).filter((c) => Number(c.fields.dias_para_vencer) <= days && Number(c.fields.dias_para_vencer) >= 0)
    case 'record.finalized':
      return db.list(t, 'records').filter((r) => r.status === 'finalizado').map((r) => recordCtx(t, r.id, now)).filter((c): c is TriggerCtx => !!c && Number(c.fields.dias_para_retorno) >= 0 && Number(c.fields.dias_para_retorno) <= Math.max(days, 0) + 365)
    case 'vaccine.due':
      return db.list(t, 'vaccines').filter((v) => v.status === 'aplicada' && v.nextDueOn && v.nextDueOn >= today).map((v) => {
        const { patient, personRef } = personOfPatient(t, v.patientId)
        const left = Math.round((new Date(`${v.nextDueOn}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000)
        return { key: `vaccine:${v.id}:${v.nextDueOn}`, subject: `Aplicação programada — ${patient?.name ?? ''}`, personRef, personName: patient?.name, patientId: v.patientId, refId: v.id, dueOn: v.nextDueOn, fields: { dias_para_aplicacao: left } }
      }).filter((c) => Number(c.fields.dias_para_aplicacao) <= days)
    case 'payment.confirmed':
    case 'proposal.accepted':
      return [] // somente por evento
  }
}

export function cancelCtx(t: ID, appointmentId: ID, now = new Date()): TriggerCtx | null {
  const ap = db.get(t, 'appointments', appointmentId)
  if (!ap) return null
  const unit = db.get(t, 'units', ap.unitId)
  return {
    key: `cancel:${ap.id}:${ap.start}`, subject: `Vaga liberada ${formatDateTime(ap.start, unit?.timezone)}`, refId: ap.id,
    slot: { start: ap.start, end: ap.end, professionalId: ap.professionalId, unitId: ap.unitId, serviceId: ap.serviceId, resourceIds: ap.resourceIds },
    fields: { antecedencia_horas: Math.round((new Date(ap.start).getTime() - now.getTime()) / 3600000), duracao_min: Math.round((new Date(ap.end).getTime() - new Date(ap.start).getTime()) / 60000), unidade: unit?.name ?? '' },
  }
}

/** Data de retorno DEFINIDA PELO PROFISSIONAL no registro (campos aceitos: retornoEm, retorno_em, returnOn). Sem regra universal. */
export function recordReturnDate(content: Record<string, unknown>): string | undefined {
  for (const k of ['retornoEm', 'retorno_em', 'returnOn', 'retorno']) {
    const v = content[k]
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  }
  return undefined
}
export function recordCtx(t: ID, recordId: ID, now = new Date()): TriggerCtx | null {
  const r = db.get(t, 'records', recordId)
  if (!r) return null
  const due = recordReturnDate(r.content)
  const { patient, personRef } = personOfPatient(t, r.patientId)
  const today = zonedParts(now, tzOf(t)).date
  const left = due ? Math.round((new Date(`${due}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000) : -1
  if (!due) return { key: `record:${r.id}`, subject: `Registro de ${patient?.name ?? 'paciente'} sem retorno definido`, personRef, personName: patient?.name, patientId: r.patientId, refId: r.id, fields: { dias_para_retorno: -1 } }
  return { key: `record:${r.id}:${due}`, subject: `Retorno de ${patient?.name ?? 'paciente'} em ${formatCivil(due)}`, personRef, personName: patient?.name, patientId: r.patientId, refId: r.id, dueOn: due, fields: { dias_para_retorno: left } }
}

/** Avalia (e, se !dryRun, executa) uma automação para um contexto. */
export function evaluate(t: ID, a: Automation, ctx: TriggerCtx, opts: { dryRun: boolean; now?: Date; ignoreWait?: boolean }): Outcome {
  const now = opts.now ?? new Date()
  const tz = tzOf(t)
  const runs = db.list(t, 'automationRuns')
  const out = (status: RunStatus, detail: string, actions: string[] = [], personRefs: string[] = [], deferredUntil?: string): Outcome => ({ ctx, status, detail, actions, personRefs, deferredUntil })
  if (runs.some((r) => r.automationId === a.id && r.ctxKey === ctx.key && r.status === 'executada')) return out('ignorada', 'Já executada para este fato (idempotência).')
  const cond = evalConditions(a.conditions, ctx.fields)
  if (!cond.ok) return out('ignorada', `Condições não atendidas: ${cond.failed.join('; ')}.`)
  if (a.trigger === 'record.finalized' && !ctx.dueOn) return out('ignorada', 'Profissional não definiu retorno neste registro — nenhuma periodicidade é presumida.')
  if (a.trigger === 'proposal.pending' && Number(ctx.fields.dias_pendente) < (a.params.days ?? 0)) return out('ignorada', `Pendente há ${ctx.fields.dias_pendente} dia(s); limiar configurado: ${a.params.days} dia(s).`)
  if (!opts.ignoreWait && a.waitMinutes > 0) return out('adiada', `Espera configurada de ${a.waitMinutes} min antes da ação.`, [], [], addMinutes(now.toISOString(), a.waitMinutes))
  const contacts = CONTACTS_PERSON[a.action]
  // Janela/horário permitido (limite da automação) — não depende da pessoa.
  const w = checkAutomationLimits({ now, tz, limits: a.limits, runs, automationId: a.id, contactsPerson: contacts })
  if (!w.ok && w.status === 'adiada') return out('adiada', w.reason, [], [], w.until)
  const limitFor = (personRef?: string) => checkAutomationLimits({ now, tz, limits: { ...a.limits, windowStart: 0, windowEnd: 0 }, runs, automationId: a.id, personRef, contactsPerson: false })

  switch (a.action) {
    case 'offer_waitlist': {
      if (!ctx.slot) return out('ignorada', 'Sem vaga associada.')
      const matches = matchWaitlist(t, ctx.slot)
      if (!matches.length) return out('ignorada', 'Nenhuma pessoa compatível na lista de espera.')
      const allowed = matches.filter((w2) => limitFor(personOfPatient(t, w2.patientId).personRef).ok).slice(0, Math.max(1, a.params.maxOffers ?? 1))
      if (!allowed.length) return out('limitada', 'Pessoas compatíveis já atingiram o limite diário desta automação.')
      const names = allowed.map((w2) => db.get(t, 'patients', w2.patientId)?.name ?? w2.patientId)
      const refs = allowed.map((w2) => personOfPatient(t, w2.patientId).personRef).filter((x): x is string => !!x)
      if (!opts.dryRun) offerSlot(t, allowed.map((w2) => w2.id), ctx.slot, `Automação: ${a.name}`)
      return out('executada', `Oferta temporária para ${names.join(', ')} (primeira confirmação válida vence; não é reserva).`, allowed.map((_, i) => `Ofertar vaga a ${names[i]} (WhatsApp)`), refs)
    }
    case 'crm_task': {
      if (!ctx.patientId) return out('ignorada', 'Sem paciente associado.')
      const lim = limitFor(ctx.personRef)
      if (!lim.ok) return out('limitada', lim.reason)
      const dueOn = addDaysCivil(zonedParts(now, tz).date, 1)
      const title = a.trigger === 'proposal.pending' ? `Contato sobre proposta pendente (${ctx.fields.dias_pendente} dias)` : a.trigger === 'proposal.accepted' ? 'Agendar execução do plano aceito' : `Contato para retorno (${ctx.dueOn ? formatCivil(ctx.dueOn) : ''})`
      const leads = db.list(t, 'leads')
      const existing = leads.find((l) => l.patientId === ctx.patientId && l.stage !== 'perdido')
      if (!opts.dryRun) {
        const task = { id: uid('tk_'), title, dueOn, done: false }
        if (existing) {
          if (existing.tasks.some((x) => x.title === title && !x.done)) return out('ignorada', 'Tarefa equivalente já aberta no CRM.')
          db.update(t, 'leads', existing.id, (l) => ({ ...l, tasks: [...l.tasks, task], history: [...l.history, { at: nowISO(), by: `Automação: ${a.name}`, text: title }] }))
        } else {
          db.insert(t, 'leads', { id: uid('lead_'), tenantId: t, createdAt: nowISO(), name: ctx.personName ?? 'Paciente', source: 'outro', stage: 'proposta', interest: 'Acompanhamento de proposta (administrativo)', patientId: ctx.patientId, proposalId: ctx.refId, tasks: [task], history: [{ at: nowISO(), by: `Automação: ${a.name}`, text: 'Oportunidade criada a partir de proposta pendente' }], optOut: false })
        }
      }
      return out('executada', `${existing ? 'Tarefa adicionada à oportunidade existente' : 'Oportunidade + tarefa criadas'} no CRM para ${ctx.personName ?? 'paciente'}.`, [`CRM: "${title}" (vence ${formatCivil(dueOn)})`], ctx.personRef ? [ctx.personRef] : [])
    }
    case 'stock_alert': {
      const recips = staffFor(t, 'estoque_baixo')
      if (!recips.length) return out('ignorada', 'Nenhum perfil recebe alertas de estoque (ver Preferências da equipe).')
      if (!opts.dryRun) alertStaff(t, 'estoque_baixo', 'estoque_baixo', 'Material próximo do vencimento', ctx.subject, ctx.key)
      return out('executada', `Alerta interno para ${recips.length} pessoa(s) da equipe.`, recips.map((r) => `Alerta (e-mail interno) para ${r.name}`))
    }
    case 'send_reminder':
    case 'notify_patient': {
      if (!ctx.personRef) return out('ignorada', 'Sem pessoa de contato (responsável) cadastrada.')
      const lim = limitFor(ctx.personRef)
      if (!lim.ok) return out('limitada', lim.reason)
      const event: NotificationEvent = a.trigger === 'vaccine.due' ? 'vacina' : a.trigger === 'payment.confirmed' ? 'pagamento_confirmado' : a.trigger === 'proposal.accepted' ? 'aceite' : 'retorno'
      const tpl = db.list(t, 'notificationTemplates').find((x) => x.event === event)
      const channel: Channel = tpl?.channels.whatsapp ? 'whatsapp' : 'email'
      // Lembrete: X dias (definido pelo usuário) ANTES da data definida pelo profissional; nunca "a cada N meses".
      const sendOn = ctx.dueOn ? addDaysCivil(ctx.dueOn, -(a.params.days ?? 0)) : undefined
      const scheduledFor = sendOn && sendOn > zonedParts(now, tz).date ? zonedToInstant(sendOn, a.limits.windowStart, tz) : undefined
      const org = db.list(t, 'units')[0]?.name ?? 'a clínica'
      const preview = (tpl?.bodies[channel === 'whatsapp' ? 'whatsapp' : 'email'] ?? EVENTS[event].text).replace(/\{\{nome\}\}/g, ctx.personName?.split(' ')[0] ?? '').replace(/\{\{clinica\}\}/g, org).replace(/\{\{data\}\}/g, ctx.dueOn ? formatCivil(ctx.dueOn) : formatDateTime(now.toISOString(), tz)).replace(/\{\{link\}\}/g, '[link do portal]')
      if (!opts.dryRun) queueMessage(t, { event, channel, recipientName: ctx.personName ?? 'Paciente', recipientRef: ctx.personRef, subject: EVENTS[event].label, preview, dedupeKey: `auto:${a.id}:${ctx.key}:${channel}`, scheduledFor, link: '/portal' }, now)
      return out('executada', `${EVENTS[event].label} para ${ctx.personName ?? 'responsável'}${scheduledFor ? ` agendado para ${formatCivil(sendOn!)}` : ''}.`, [`${channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'}: ${EVENTS[event].label}${scheduledFor ? ` em ${formatCivil(sendOn!)}` : ' agora'}`], [ctx.personRef])
    }
  }
}

function record(t: ID, a: Automation, o: Outcome, source: AutomationRun['source']): AutomationRun {
  return db.insert(t, 'automationRuns', {
    id: uid('run_'), tenantId: t, createdAt: nowISO(), automationId: a.id, automationName: a.name, trigger: TRIGGER_LABEL[a.trigger], status: o.status,
    personRefs: o.personRefs, ctxKey: o.ctx.key, subject: o.ctx.subject, detail: o.detail, actions: o.actions, source,
    deferredUntil: o.deferredUntil, deferredCtx: o.status === 'adiada' ? o.ctx : undefined,
  }) as AutomationRun
}

/** Executa automação real (efeitos) e registra no histórico. */
export function execute(t: ID, a: Automation, ctx: TriggerCtx, source: AutomationRun['source'], now = new Date(), ignoreWait = false): AutomationRun {
  if (!a.active) throw new Error('Automação inativa.')
  try {
    const o = evaluate(t, a, ctx, { dryRun: false, now, ignoreWait })
    return record(t, a, o, source)
  } catch (e) {
    return record(t, a, { ctx, status: 'falhou', detail: e instanceof Error ? e.message : String(e), actions: [], personRefs: [] }, source)
  }
}

/** Simulação contra dados atuais: SEM efeitos. */
export function simulate(t: ID, a: Automation, now = new Date()): Outcome[] {
  return collectContexts(t, a, now).slice(0, 50).map((ctx) => evaluate(t, a, ctx, { dryRun: true, now, ignoreWait: true }))
}

/** Libera UMA mensagem aguardando janela/agendada (ação manual da equipe). */
export function releaseNow(t: ID, id: ID) {
  const m = db.get(t, 'outbox', id)
  if (!m || !(m.status === 'aguardando_janela' || (m.status === 'pendente' && m.scheduledFor))) throw new Error('Mensagem não está aguardando janela.')
  db.update(t, 'outbox', id, (p) => ({ ...p, status: 'pendente', scheduledFor: undefined, attempts: [...p.attempts, { at: nowISO(), result: 'Liberada manualmente pela equipe antes da janela (demonstração).' }] }))
  acceptLater(t, id)
}

/** Reprocessa adiadas vencidas e (scan=true) executa ativas sobre fatos atuais (varredura). */
export function sweep(t: ID, now = new Date(), scan = true): { executed: number; deferred: number } {
  let executed = 0, deferred = 0
  for (const run of db.list(t, 'automationRuns').filter((r) => r.status === 'adiada' && !r.processedAt && r.deferredUntil && new Date(r.deferredUntil).getTime() <= now.getTime())) {
    const a = db.get(t, 'automations', run.automationId)
    db.update(t, 'automationRuns', run.id, { processedAt: nowISO() })
    if (!a?.active || !run.deferredCtx) continue
    const r = execute(t, a, run.deferredCtx, 'adiada', now, true)
    if (r.status === 'executada') executed++
  }
  if (!scan) return { executed, deferred }
  for (const a of db.list(t, 'automations').filter((x) => x.active && ['proposal.pending', 'lot.expiring', 'vaccine.due'].includes(x.trigger))) {
    const pendingKeys = new Set(db.list(t, 'automationRuns').filter((r) => r.automationId === a.id && (r.status === 'executada' || (r.status === 'adiada' && !r.processedAt) || r.status === 'limitada')).map((r) => r.ctxKey))
    for (const ctx of collectContexts(t, a, now)) {
      if (pendingKeys.has(ctx.key)) continue
      const o = evaluate(t, a, ctx, { dryRun: true, now })
      if (o.status === 'ignorada') continue
      const r = execute(t, a, ctx, 'varredura', now)
      if (r.status === 'executada') executed++
      if (r.status === 'adiada') deferred++
    }
  }
  return { executed, deferred }
}

/** Gatilho por evento de domínio → automações ativas com esse gatilho. */
export function onTrigger(t: ID, trigger: Automation['trigger'], ctx: TriggerCtx | null) {
  if (!ctx) return []
  return db.list(t, 'automations').filter((a) => a.active && a.trigger === trigger).map((a) => execute(t, a, ctx, 'evento'))
}

export function describeAutomation(a: Automation): string {
  const conds = a.conditions.length ? ` se ${a.conditions.map((c) => `${c.field} ${OP_LABEL[c.op]} ${c.value}`).join(' e ')}` : ''
  return `Quando "${TRIGGER_LABEL[a.trigger]}"${conds} → ${ACTION_LABEL[a.action]}${a.waitMinutes ? ` após ${a.waitMinutes} min` : ''}`
}

// ---------------- Atendimento humano (handoff) ----------------
export function createHandoff(t: ID, h: { source: 'ia' | 'whatsapp' | 'automacao'; priority: 'urgente' | 'normal'; reason: string; name: string; personRef?: ID; conversationId?: ID }) {
  // ponytail: sem NotificationEvent de "atendimento humano" na fundação — a tarefa aparece na fila de atendimento (Comunicação). Upgrade: novo evento no tipo.
  const task = db.insert(t, 'handoffTasks', { id: uid('ho_'), tenantId: t, createdAt: nowISO(), status: 'aberta', ...h })
  audit(t, { actorId: h.source, actorName: h.source === 'ia' ? 'Recepcionista virtual (simulada)' : 'WhatsApp', action: 'atendimento.handoff', resource: 'handoffTasks', resourceId: task.id, detail: `${h.priority} — ${h.reason}` })
  return task
}
