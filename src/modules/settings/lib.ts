// Regras puras do módulo de configurações (sem React, sem window): herança de políticas, perfil da clínica,
// limites do plano e verificação de marca. Testado em settings.test.ts.
import { isConnectedEnv } from '@/lib/env'
import type { ID, Organization } from '@/domain/types'
import type { PlanLimits } from '@/domain/platform'
import { getPolicies, type ClinicPolicies, type ClinicSettings } from '@/domain/settings'
import { db, platformDb } from '@/data/store'
import { audit } from '@/data/repositories'
import { contrast, deriveBrandTokens, hexToRgb } from '@/lib/color'
import { nowISO } from '@/lib/dates'
import type { ClinicProfile } from './types'

// ---------------- caminhos "a.b.c" ----------------
type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

export function getPath(o: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => (isObj(acc) ? acc[k] : undefined), o)
}
export function setPath<T extends Obj>(o: T, path: string, value: unknown): T {
  const [k, ...rest] = path.split('.')
  if (!rest.length) return { ...o, [k]: value }
  return { ...o, [k]: setPath(isObj(o[k]) ? (o[k] as Obj) : {}, rest.join('.'), value) }
}
/** Remove a chave e poda objetos que ficaram vazios. */
export function deletePath<T extends Obj>(o: T, path: string): T {
  const [k, ...rest] = path.split('.')
  if (!(k in o)) return o
  const out: Obj = { ...o }
  if (!rest.length) delete out[k]
  else if (isObj(out[k])) {
    const child = deletePath(out[k] as Obj, rest.join('.'))
    if (Object.keys(child).length) out[k] = child
    else delete out[k]
  }
  return out as T
}

// ---------------- políticas: rede → unidade ----------------
function settingsDoc(tenantId: ID, unitId: ID | null): ClinicSettings | undefined {
  return db.list(tenantId, 'settings').find((s) => s.unitId === unitId)
}

/** De onde vem o valor efetivo do campo nesta unidade (ou na rede, se unitId = null). */
export function policySource(tenantId: ID, unitId: ID | null, path: string): 'unidade' | 'rede' | 'padrao' {
  if (unitId && getPath(settingsDoc(tenantId, unitId)?.policies, path) !== undefined) return 'unidade'
  if (getPath(settingsDoc(tenantId, null)?.policies, path) !== undefined) return 'rede'
  return 'padrao'
}

/** Grava SOMENTE as chaves informadas no documento da rede (null) ou no override da unidade. */
export function savePolicies(tenantId: ID, unitId: ID | null, changes: Record<string, unknown>, actor?: { id: ID; name: string }) {
  const paths = Object.keys(changes)
  if (!paths.length) throw new Error('Nenhuma alteração para salvar.')
  const known = new Set(POLICY_GROUPS.flatMap((g) => g.fields.map((f) => f.path)))
  for (const p of paths) {
    if (!known.has(p)) throw new Error(`Campo de política desconhecido: ${p}`)
    if (p === 'privacy.showClinicalAlertsToReception') throw new Error('Alertas clínicos nunca são exibidos à recepção.')
    const v = changes[p]
    if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) throw new Error('Valores numéricos devem ser zero ou positivos.')
  }
  const doc = settingsDoc(tenantId, unitId)
  let policies = (doc?.policies ?? {}) as Obj
  for (const p of paths) policies = setPath(policies, p, changes[p])
  if (doc) db.update(tenantId, 'settings', doc.id, { policies: policies as ClinicSettings['policies'] })
  else db.insert(tenantId, 'settings', { id: `${tenantId}_set_${unitId ?? 'rede'}`, tenantId, createdAt: nowISO(), unitId, policies: policies as ClinicSettings['policies'] })
  if (actor) audit(tenantId, { actorId: actor.id, actorName: actor.name, action: unitId ? 'politica.unidade.sobrescrita' : 'politica.rede.atualizada', resource: 'settings', resourceId: unitId ?? 'rede', unitId: unitId ?? undefined, detail: paths.join(', ') })
}

/** Restaura o padrão: na unidade volta a herdar da rede; na rede volta ao padrão Qlinic. */
export function restorePolicy(tenantId: ID, unitId: ID | null, path: string, actor?: { id: ID; name: string }) {
  const doc = settingsDoc(tenantId, unitId)
  if (!doc || getPath(doc.policies, path) === undefined) return
  db.update(tenantId, 'settings', doc.id, { policies: deletePath(doc.policies as Obj, path) as ClinicSettings['policies'] })
  if (actor) audit(tenantId, { actorId: actor.id, actorName: actor.name, action: 'politica.restaurada', resource: 'settings', resourceId: unitId ?? 'rede', unitId: unitId ?? undefined, detail: path })
}

export type PolicyFieldKind = 'number' | 'bool' | 'text' | 'select' | 'methods' | 'hours' | 'minutes' | 'cents'
export interface PolicyField { path: string; label: string; kind: PolicyFieldKind; hint?: string; suffix?: string; options?: { value: string; label: string }[]; min?: number; max?: number; readonly?: boolean }
export const POLICY_GROUPS: { id: keyof ClinicPolicies; title: string; fields: PolicyField[] }[] = [
  { id: 'booking', title: 'Agendamento, sinal e cancelamento', fields: [
    { path: 'booking.publicBookingEnabled', label: 'Agendamento público habilitado', kind: 'bool' },
    { path: 'booking.minAdvanceHours', label: 'Antecedência mínima', kind: 'number', suffix: 'horas', min: 0, max: 720 },
    { path: 'booking.maxAdvanceDays', label: 'Antecedência máxima', kind: 'number', suffix: 'dias', min: 1, max: 365 },
    { path: 'booking.slotStepMin', label: 'Intervalo entre horários ofertados', kind: 'number', suffix: 'min', min: 5, max: 120 },
    { path: 'booking.cancelWindowHours', label: 'Cancelamento sem custo até', kind: 'number', suffix: 'horas antes', min: 0, max: 168 },
    { path: 'booking.rescheduleWindowHours', label: 'Reagendamento até', kind: 'number', suffix: 'horas antes', min: 0, max: 168 },
    { path: 'booking.requireConfirmation', label: 'Exigir confirmação do paciente', kind: 'bool' },
    { path: 'booking.confirmationLeadHours', label: 'Pedir confirmação com antecedência de', kind: 'number', suffix: 'horas', min: 1, max: 168 },
    { path: 'booking.depositPercent', label: 'Sinal (percentual do serviço)', kind: 'number', suffix: '%', min: 0, max: 100, hint: '0 = sem sinal. Cobrança simulada.' },
    { path: 'booking.depositRequiredAbove', label: 'Exigir sinal a partir de', kind: 'cents', hint: 'Deixe vazio para aplicar a todos os serviços.' },
  ] },
  { id: 'communication', title: 'Comunicação', fields: [
    { path: 'communication.senderName', label: 'Nome exibido do remetente', kind: 'text' },
    { path: 'communication.replyTo', label: 'Responder para (Reply-To)', kind: 'text', hint: 'Use um endereço de exemplo (.exemplo.test).' },
    { path: 'communication.emailEnabled', label: 'E-mail habilitado', kind: 'bool' },
    { path: 'communication.whatsappEnabled', label: 'WhatsApp habilitado', kind: 'bool' },
    { path: 'communication.pushEnabled', label: 'Push habilitado (requer backend futuro)', kind: 'bool' },
    { path: 'communication.fallbackToEmail', label: 'Se o WhatsApp falhar, tentar e-mail', kind: 'bool' },
    { path: 'communication.reminderHoursBefore', label: 'Lembretes (horas antes, separados por vírgula)', kind: 'hours' },
    { path: 'communication.quietHours.start', label: 'Silêncio a partir de', kind: 'minutes' },
    { path: 'communication.quietHours.end', label: 'Silêncio até', kind: 'minutes' },
  ] },
  { id: 'payments', title: 'Pagamentos da clínica', fields: [
    { path: 'payments.allowedMethods', label: 'Meios de pagamento permitidos', kind: 'methods' },
    { path: 'payments.receivingAccountLabel', label: 'Conta recebedora (demonstrativa)', kind: 'text', hint: 'Somente texto de exemplo. Nunca informe dados bancários reais.' },
    { path: 'payments.maxInstallments', label: 'Parcelas máximas', kind: 'number', min: 1, max: 24 },
    { path: 'payments.lateFeePercent', label: 'Multa por atraso', kind: 'number', suffix: '%', min: 0, max: 2, hint: 'Valor de exemplo; regras legais devem ser validadas.' },
    { path: 'payments.monthlyInterestPercent', label: 'Juros ao mês', kind: 'number', suffix: '%', min: 0, max: 10 },
    { path: 'payments.earlyDiscountPercent', label: 'Desconto por antecipação', kind: 'number', suffix: '%', min: 0, max: 50 },
    { path: 'payments.allowNegativeStock', label: 'Permitir estoque negativo', kind: 'bool' },
  ] },
  { id: 'privacy', title: 'Privacidade e painel de chamada', fields: [
    { path: 'privacy.callPanelMode', label: 'Painel de chamada exibe', kind: 'select', options: [{ value: 'senha', label: 'Somente senha' }, { value: 'nome_abreviado', label: 'Nome abreviado (ex.: Maria S.)' }] },
    { path: 'privacy.showClinicalAlertsToReception', label: 'Alertas clínicos para a recepção', kind: 'bool', readonly: true, hint: 'Sempre desativado: alertas clínicos só aparecem para quem tem permissão clínica.' },
  ] },
]

export function effectivePolicy(tenantId: ID, unitId: ID | null, path: string): unknown {
  return getPath(getPolicies(tenantId, unitId), path)
}

// ---------------- perfil complementar da clínica ----------------
export function defaultProfile(org: Organization): ClinicProfile {
  return {
    id: `${org.id}_profile`, tenantId: org.id, createdAt: org.createdAt,
    address: { cep: '', street: '', number: '', district: '', city: org.city.split('/')[0] ?? '', uf: org.city.split('/')[1] ?? '' },
    whatsapp: '', links: { site: '', instagram: '', other: '' }, technicalResponsible: { name: '', council: '' }, professionalInfo: '',
    bank: { bank: 'Banco 000 (demonstrativo)', agency: '0000', account: '00000-0', holder: `${org.name} (fictícia)`, pixKeyLabel: 'Chave de exemplo — não real' },
    senderEmail: `nao-responda@${org.slug}.exemplo.test`,
    notifications: { confirmacao: true, lembrete: true, cancelamento: true, documento_disponivel: true, proposta_disponivel: true, cobranca_proxima: true, pagamento_confirmado: true, estoque_baixo: true },
    brandExtras: { logoBackground: '#FFFFFF', symbolBackground: org.brand.primary, splashBackground: '#F7FAFC' },
    preferences: { weekStart: 1, agendaView: 'dia', timeFormat: '24h', showPricesOnAgenda: true, confirmBeforeLeave: true },
  }
}
export function getProfile(org: Organization): ClinicProfile {
  const p = db.list(org.id, 'clinicProfile')[0]
  const d = defaultProfile(org)
  return p ? { ...d, ...p, address: { ...d.address, ...p.address }, links: { ...d.links, ...p.links }, bank: { ...d.bank, ...p.bank }, brandExtras: { ...d.brandExtras, ...p.brandExtras }, preferences: { ...d.preferences, ...p.preferences }, notifications: { ...d.notifications, ...p.notifications }, technicalResponsible: { ...d.technicalResponsible, ...p.technicalResponsible } } : d
}
export function saveProfile(org: Organization, patch: Partial<ClinicProfile>) {
  const cur = getProfile(org)
  const next = { ...cur, ...patch, id: cur.id, tenantId: org.id }
  if (db.list(org.id, 'clinicProfile').some((x) => x.id === cur.id)) db.update(org.id, 'clinicProfile', cur.id, next)
  else db.insert(org.id, 'clinicProfile', next)
  return next
}

/** Regra da demonstração: contatos só em domínios de exemplo (nunca acionáveis). */
export function validateDemoEmail(email: string): string | null {
  const e = email.trim().toLowerCase()
  if (!e) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'E-mail inválido.'
  // conectado aceita e-mail real; demonstração exige domínio de exemplo (evita contato acionável)
  if (!isConnectedEnv() && !/\.(test|exemplo)$/.test(e)) return 'Na demonstração use um domínio de exemplo terminado em .exemplo.test.'
  return null
}

export function updateOrg(org: Organization, patch: Partial<Organization>, actor?: { id: ID; name: string }, detail?: string) {
  platformDb.update('organizations', org.id, patch)
  if (actor) audit(org.id, { actorId: actor.id, actorName: actor.name, action: 'organizacao.atualizada', resource: 'organization', resourceId: org.id, detail: detail ?? Object.keys(patch).join(', ') })
}

export const TIMEZONES = ['America/Sao_Paulo', 'America/Bahia', 'America/Recife', 'America/Fortaleza', 'America/Maceio', 'America/Belem', 'America/Araguaina', 'America/Santarem', 'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco', 'America/Noronha'] as const

// ---------------- horários ----------------
type Interval = { start: number; end: number }
/** Intervalos válidos: início < fim, sem sobreposição no mesmo dia. Retorna mensagem ou null. */
export function validateIntervals(list: Interval[], label = ''): string | null {
  const s = [...list].sort((a, b) => a.start - b.start)
  for (let i = 0; i < s.length; i++) {
    if (!(s[i].start < s[i].end)) return `${label}horário de início deve ser antes do fim.`
    if (i > 0 && s[i].start < s[i - 1].end) return `${label}intervalos sobrepostos.`
  }
  return null
}
export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export function validateHours(h: Record<number, Interval[]>): string | null {
  for (let d = 0; d < 7; d++) {
    const e = validateIntervals(h[d] ?? [], `${WEEKDAYS[d]}: `)
    if (e) return e
  }
  return null
}

// ---------------- limites do plano ----------------
export type LimitKey = keyof PlanLimits
export const LIMIT_LABEL: Record<LimitKey, string> = { users: 'Usuários ativos', professionals: 'Profissionais ativos', units: 'Unidades', storageGb: 'Armazenamento (GB)', messagesMonth: 'Mensagens no mês', aiCreditsMonth: 'Créditos de IA no mês' }

export function planOf(org: Organization) {
  return platformDb.list('plans').find((p) => p.id === org.planId)
}
export function planUsage(org: Organization): { key: LimitKey; label: string; used: number; limit: number | null; source: string }[] {
  const plan = planOf(org)
  const usage = platformDb.list('usage').filter((u) => u.tenantId === org.id).sort((a, b) => b.month.localeCompare(a.month))[0]
  const used: Record<LimitKey, [number, string]> = {
    users: [db.list(org.id, 'staff').filter((u) => u.active).length, 'Cadastro da equipe'],
    professionals: [db.list(org.id, 'professionals').filter((p) => p.active).length, 'Cadastro de profissionais'],
    units: [db.list(org.id, 'units').length, 'Cadastro de unidades'],
    storageGb: [usage?.storageGb ?? 0, usage ? `Medição ${usage.month} (simulada)` : 'Sem medição'],
    messagesMonth: [usage?.messages ?? db.list(org.id, 'outbox').length, usage ? `Medição ${usage.month} (simulada)` : 'Fila de comunicação local'],
    aiCreditsMonth: [usage?.aiCredits ?? 0, usage ? `Medição ${usage.month} (simulada)` : 'Sem medição'],
  }
  return (Object.keys(LIMIT_LABEL) as LimitKey[]).map((k) => ({ key: k, label: LIMIT_LABEL[k], used: used[k][0], limit: plan ? plan.limits[k] : null, source: used[k][1] }))
}
/** Bloqueia criação além do limite do plano (feature flag ≠ limite ≠ permissão). */
export function assertWithinLimit(org: Organization, key: 'users' | 'professionals' | 'units') {
  const row = planUsage(org).find((r) => r.key === key)!
  if (row.limit !== null && row.used >= row.limit) throw new Error(`Limite do plano atingido: ${row.label} (${row.used}/${row.limit}). Ajuste o plano com a equipe Qlinic.`)
}

// ---------------- marca ----------------
export const isHex = (v: string) => !!hexToRgb(v) && /^#([0-9a-f]{6})$/i.test(v.trim())

export interface ContrastRow { mode: 'Claro' | 'Escuro'; pair: string; fg: string; bg: string; ratio: number; min: number }
export function brandReport(input: string) {
  const base = input.toUpperCase()
  const L = deriveBrandTokens(base, 'light')
  const D = deriveBrandTokens(base, 'dark')
  const rows: ContrastRow[] = [
    { mode: 'Claro', pair: 'Texto do botão sobre a cor', fg: L.onPrimary, bg: L.primary, ratio: contrast(L.onPrimary, L.primary), min: 4.5 },
    { mode: 'Claro', pair: 'Links e textos da marca', fg: L.primaryText, bg: '#FFFFFF', ratio: contrast(L.primaryText, '#FFFFFF'), min: 4.5 },
    { mode: 'Claro', pair: 'Indicador de foco', fg: L.focus, bg: '#FFFFFF', ratio: contrast(L.focus, '#FFFFFF'), min: 3 },
    { mode: 'Escuro', pair: 'Texto do botão sobre a cor', fg: D.onPrimary, bg: D.primary, ratio: contrast(D.onPrimary, D.primary), min: 4.5 },
    { mode: 'Escuro', pair: 'Links e textos da marca', fg: D.primaryText, bg: '#102632', ratio: contrast(D.primaryText, '#102632'), min: 4.5 },
    { mode: 'Escuro', pair: 'Indicador de foco', fg: D.focus, bg: '#102632', ratio: contrast(D.focus, '#102632'), min: 3 },
  ]
  return {
    light: L, dark: D, rows,
    /** A cor informada precisou de ajuste para manter contraste AA. */
    lightAdjusted: L.primary !== base,
    navyText: L.onPrimary !== '#FFFFFF',
    darkAdjusted: D.primary !== base,
    whiteContrast: contrast(base, '#FFFFFF'),
  }
}
