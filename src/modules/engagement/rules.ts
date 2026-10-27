// Regras PURAS do módulo (sem store, sem window): testadas em rules.test.ts.
import { zonedParts, zonedToInstant, addDaysCivil, type ISOInstant } from '@/lib/dates'
import { normalize } from '@/lib/util'
import type { AutomationCondition, AutomationLimits, AutomationRun, EmailConfig, EmailDomain } from './types'

// ---------------- Urgência ----------------
export type UrgencyCategory = 'risco_vida' | 'saude_mental' | 'animal'
interface UrgencyRule { terms: string[]; category: UrgencyCategory; label: string }
// ponytail: lista de palavras-chave (sem modelo). Falso positivo é preferível a falso negativo; protocolo real definido pela clínica.
const URGENCY: UrgencyRule[] = [
  { category: 'risco_vida', label: 'dor no peito', terms: ['dor no peito', 'dor toracica', 'aperto no peito', 'pressao no peito'] },
  { category: 'risco_vida', label: 'falta de ar', terms: ['falta de ar', 'nao consigo respirar', 'nao consegue respirar', 'dificuldade para respirar', 'sem ar'] },
  { category: 'risco_vida', label: 'sangramento intenso', terms: ['sangramento intenso', 'sangrando muito', 'hemorragia', 'sangramento que nao para', 'muito sangue'] },
  { category: 'risco_vida', label: 'desmaio', terms: ['desmaio', 'desmaiou', 'desmaiei', 'perdeu a consciencia', 'inconsciente', 'desacordado'] },
  { category: 'risco_vida', label: 'convulsão', terms: ['convulsao', 'convulsionando', 'convulsionou', 'ataque epiletico', 'crise convulsiva'] },
  { category: 'risco_vida', label: 'sinais de AVC', terms: ['avc', 'derrame', 'boca torta', 'perdeu a forca', 'fala enrolada'] },
  { category: 'risco_vida', label: 'reação alérgica grave', terms: ['anafilaxia', 'garganta fechando', 'inchaco na garganta', 'reacao alergica grave'] },
  { category: 'saude_mental', label: 'ideação suicida', terms: ['ideacao suicida', 'quero morrer', 'me matar', 'suicid', 'tirar minha vida', 'acabar com a minha vida', 'nao quero mais viver'] },
  { category: 'animal', label: 'envenenamento em animal', terms: ['envenenamento', 'envenenado', 'envenenada', 'comeu veneno', 'ingeriu veneno', 'chumbinho', 'raticida'] },
]

export interface UrgencyResult { urgent: boolean; matches: string[]; category?: UrgencyCategory; response?: string }

export function detectUrgency(text: string): UrgencyResult {
  const n = ` ${normalize(text).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `
  const hits = URGENCY.filter((r) => r.terms.some((t) => (t.length <= 3 ? n.includes(` ${t} `) : n.includes(t))))
  if (!hits.length) return { urgent: false, matches: [] }
  const category: UrgencyCategory = hits.some((h) => h.category === 'saude_mental') ? 'saude_mental' : hits.some((h) => h.category === 'animal') ? 'animal' : 'risco_vida'
  const response = category === 'saude_mental'
    ? 'Sinto muito que você esteja passando por isso. Você não está sozinho(a). Se houver risco imediato, ligue agora para o SAMU 192. Para conversar, o CVV atende 24 h pelo 188 (ligação gratuita) ou cvv.org.br. Acionei a equipe humana da clínica para falar com você.'
    : category === 'animal'
      ? 'Isto pode ser uma emergência veterinária. Procure imediatamente um atendimento veterinário de emergência e, se possível, leve a embalagem do produto. Não induza vômito sem orientação profissional. Acionei a equipe humana da clínica.'
      : 'Isto pode ser uma emergência. Procure atendimento de emergência agora ou ligue para o SAMU 192. Não aguarde agendamento. Acionei a equipe humana da clínica para retornar o contato.'
  return { urgent: true, matches: hits.map((h) => h.label), category, response }
}

// ---------------- Prompt injection ----------------
const INJECTION: { re: RegExp; label: string }[] = [
  { re: /ignore?\s+(todas?\s+)?(as\s+|suas\s+)?(instruc|regras|orientac)/, label: 'pedido para ignorar instruções' },
  { re: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules)/, label: 'pedido para ignorar instruções (EN)' },
  { re: /(desconsidere|esqueca)\s+(tudo|as|suas|todas)/, label: 'pedido para desconsiderar regras' },
  { re: /(voce agora e|a partir de agora voce|aja como|finja ser|you are now|act as)/, label: 'troca de papel' },
  { re: /(system prompt|prompt do sistema|instrucoes do sistema|mostre (o|seu) prompt|revele (o|seu|suas))/, label: 'tentativa de revelar instruções' },
  { re: /(modo desenvolvedor|developer mode|jailbreak|\bdan\b|sem restric)/, label: 'tentativa de remover restrições' },
  { re: /(liste|exporte|mostre|envie)\s+(todos|todas)\s+(os|as)\s+(pacientes|prontuarios|cpfs|dados|cobrancas)/, label: 'pedido de extração em massa' },
  { re: /(<script|javascript:|\{\{.*\}\}|<\/?system>)/, label: 'marcação/código embutido' },
]
export interface InjectionResult { suspicious: boolean; matches: string[] }
export function detectInjection(text: string): InjectionResult {
  const n = normalize(text)
  const matches = INJECTION.filter((p) => p.re.test(n)).map((p) => p.label)
  return { suspicious: matches.length > 0, matches }
}
/** Conteúdo NÃO confiável (mensagem/anexo) é sempre citado como dado, nunca concatenado como instrução. */
export function quoteUntrusted(text: string, max = 500): string {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max)
  return `«${clean}»`
}

/** Pergunta clínica (diagnóstico/medicação/conduta) → assistente administrativo não responde. */
const CLINICAL_Q = ['remedio', 'medicamento', 'medicacao', 'posso tomar', 'dose', 'dosagem', 'diagnostico', 'o que eu tenho', 'e grave', 'tratamento para', 'antibiotico', 'receita de', 'qual pomada', 'sintoma']
export function isClinicalQuestion(text: string): boolean {
  const n = normalize(text)
  return CLINICAL_Q.some((w) => n.includes(w))
}

/** Logs exibidos sempre sanitizados: e-mails, telefones, documentos, tokens. */
export function sanitizeLog(s: string): string {
  return s
    .replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, '[e-mail]')
    .replace(/\b(bearer|token|key|secret|senha|apikey|api_key)\s*[:=]\s*\S+/gi, '$1: [REDACTED]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento]')
    .replace(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '[telefone]')
}

// ---------------- Janelas de horário ----------------
/** true se minuto do dia está em [start, end) — suporta janela que cruza a meia-noite. */
export function inWindow(min: number, start: number, end: number): boolean {
  if (start === end) return true
  return start < end ? min >= start && min < end : min >= start || min < end
}
/** Próximo início da janela permitida a partir de `now` (fuso da unidade). */
export function nextWindowStart(now: Date, tz: string, start: number): ISOInstant {
  const p = zonedParts(now, tz)
  const today = zonedToInstant(p.date, start, tz)
  return new Date(today).getTime() > now.getTime() ? today : zonedToInstant(addDaysCivil(p.date, 1), start, tz)
}
/** Horário silencioso {start,end} → janela permitida é o complemento [end, start). */
export function quietCheck(now: Date, tz: string, quiet: { start: number; end: number } | undefined): { allowed: boolean; until?: ISOInstant } {
  if (!quiet || quiet.start === quiet.end) return { allowed: true }
  const min = zonedParts(now, tz).minutesOfDay
  if (inWindow(min, quiet.end, quiet.start)) return { allowed: true }
  return { allowed: false, until: nextWindowStart(now, tz, quiet.end) }
}

// ---------------- Limites de automação ----------------
export type LimitResult = { ok: true } | { ok: false; status: 'limitada'; reason: string } | { ok: false; status: 'adiada'; reason: string; until: ISOInstant }
export function checkAutomationLimits(a: { now: Date; tz: string; limits: AutomationLimits; runs: Pick<AutomationRun, 'automationId' | 'personRefs' | 'status' | 'createdAt'>[]; automationId: string; personRef?: string; contactsPerson: boolean }): LimitResult {
  const { now, tz, limits } = a
  if (a.personRef && limits.maxPerPersonPerDay > 0) {
    const day = zonedParts(now, tz).date
    const used = a.runs.filter((r) => r.automationId === a.automationId && r.personRefs.includes(a.personRef!) && r.status === 'executada' && zonedParts(r.createdAt, tz).date === day).length
    if (used >= limits.maxPerPersonPerDay) return { ok: false, status: 'limitada', reason: `Limite de ${limits.maxPerPersonPerDay} execução(ões) por pessoa/dia atingido.` }
  }
  if (a.contactsPerson && !inWindow(zonedParts(now, tz).minutesOfDay, limits.windowStart, limits.windowEnd)) {
    return { ok: false, status: 'adiada', reason: 'Fora da janela permitida da automação — adiada para o próximo horário permitido.', until: nextWindowStart(now, tz, limits.windowStart) }
  }
  return { ok: true }
}

export function evalConditions(conds: AutomationCondition[], fields: Record<string, string | number>): { ok: boolean; failed: string[] } {
  const failed: string[] = []
  for (const c of conds) {
    const v = fields[c.field]
    if (v === undefined) { failed.push(`${c.field} indisponível`); continue }
    const a = Number(v), b = Number(c.value)
    const numeric = !Number.isNaN(a) && !Number.isNaN(b) && c.value.trim() !== ''
    const cmp = numeric ? a - b : normalize(String(v)).localeCompare(normalize(c.value))
    const ok = c.op === 'eq' ? cmp === 0 : c.op === 'neq' ? cmp !== 0 : c.op === 'gte' ? cmp >= 0 : cmp <= 0
    if (!ok) failed.push(`${c.field} ${OP_LABEL[c.op]} ${c.value} (atual: ${v})`)
  }
  return { ok: failed.length === 0, failed }
}
export const OP_LABEL: Record<AutomationCondition['op'], string> = { eq: '=', neq: '≠', gte: '≥', lte: '≤' }

// ---------------- Remetente de e-mail ----------------
export const PLATFORM_SENDER_DOMAIN = 'envio.qlinic-plataforma.exemplo'
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i
export interface FromValidation { ok: boolean; errors: string[]; from: string; header: string }
/** Nunca falsificar From de domínio não verificado: domínio próprio só com status 'verificado'. */
export function validateFrom(cfg: Pick<EmailConfig, 'fromMode' | 'fromLocal' | 'customDomainId' | 'displayName' | 'replyTo'>, domains: Pick<EmailDomain, 'id' | 'domain' | 'status'>[], tenantSlug: string): FromValidation {
  const errors: string[] = []
  const local = cfg.fromLocal.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{0,40}$/.test(local)) errors.push('Parte local do remetente inválida (use letras, números, ponto, hífen).')
  if (/[\r\n<>"]/.test(cfg.displayName) || !cfg.displayName.trim()) errors.push('Nome exibido obrigatório e sem caracteres de controle (< > " quebras de linha).')
  if (cfg.replyTo.trim() && !EMAIL_RE.test(cfg.replyTo.trim())) errors.push('Reply-To inválido.')
  let domain = `${tenantSlug}.${PLATFORM_SENDER_DOMAIN}`
  if (cfg.fromMode === 'proprio') {
    const d = domains.find((x) => x.id === cfg.customDomainId)
    if (!d) errors.push('Selecione um domínio próprio.')
    else if (d.status !== 'verificado') errors.push(`Domínio ${d.domain} não verificado (${d.status}). Envio com From deste domínio bloqueado; use o remetente da plataforma.`)
    else domain = d.domain
  }
  const from = `${local}@${domain}`
  return { ok: errors.length === 0, errors, from, header: `${cfg.displayName.trim()} <${from}>` }
}

// ---------------- Conteúdo sensível em lembretes/push ----------------
// ponytail: lista fixa + nomes de serviços do tenant. Futuro: classificação no servidor revisada pela clínica.
const SENSITIVE = ['diagnostic', 'cid', 'hiv', 'gravidez', 'gestacao', 'aborto', 'cancer', 'tumor', 'psiquiatr', 'psicoterapia', 'depressao', 'ansiedade', 'resultado do exame', 'resultado de exame', 'laudo', 'prontuario', 'receita', 'medicamento', 'dst', 'ist', 'biopsia', 'quimioterapia', 'dependencia']
export function sensitiveTerms(text: string, extra: string[] = []): string[] {
  const n = ` ${normalize(text).replace(/[^a-z0-9{} ]+/g, ' ')} `
  const list = [...SENSITIVE, ...extra.map((e) => normalize(e)).filter((e) => e.length >= 5)]
  return Array.from(new Set(list.filter((w) => (w.length <= 3 ? n.includes(` ${w} `) : n.includes(w)))))
}
