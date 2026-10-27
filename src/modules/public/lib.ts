// Lógica pura do site público/autenticação demonstrativa (testável em node, sem window no topo).
import { hashString, rng } from '@/lib/util'
import { contrast } from '@/lib/color'
import { CYCLE_MONTHS, type BillingCycle, type Plan } from '@/domain/platform'
import TOKENS from '../../../design-system/tokens.json'
import CONTRAST from '../../../docs/contraste.json'

// ---------- Planos ----------
export function monthlyEquivalent(p: Plan, c: BillingCycle) { return Math.round(p.prices[c] / CYCLE_MONTHS[c]) }
/** Economia % do ciclo frente a pagar mensal pelo mesmo período (arredondada para baixo). */
export function cycleSavingPercent(p: Plan, c: BillingCycle) {
  const full = p.prices.mensal * CYCLE_MONTHS[c]
  return full > 0 ? Math.max(0, Math.floor(((full - p.prices[c]) / full) * 100)) : 0
}

// ---------- Tokens / contraste ----------
export type Mode = 'light' | 'dark'
export const THEMES = TOKENS.themes as Record<Mode, Record<string, string>>
export const BRAND = TOKENS.brand as Record<string, string>
export const FONT = TOKENS.font
const PAIRS = CONTRAST as [Mode, string, string, number][]
/** Recalcula cada par registrado com os tokens atuais. Diferença > 0,05 indica token alterado sem novo teste. */
export function contrastRows(mode: Mode) {
  return PAIRS.filter((p) => p[0] === mode).map(([m, fg, bg, recorded]) => {
    const live = contrast(THEMES[m][fg], THEMES[m][bg])
    return { fg, bg, recorded, live: Math.round(live * 100) / 100, aa: live >= 4.5, drift: Math.abs(live - recorded) > 0.05 }
  })
}

// ---------- Coleções locais da plataforma (demonstração) ----------
export interface ContactRequest { id: string; at: string; name: string; email: string; clinic: string; segment: string; message: string }
export interface AuthEvent { id: string; at: string; kind: 'recuperacao' | 'convite_aceito' | 'verificacao_reenviada' | 'email_verificado' | 'mfa_ativado'; detail: string }
declare module '@/data/store' {
  interface PlatformCollections {
    contactRequests: ContactRequest[]
    authEvents: AuthEvent[]
  }
}

// ---------- E-mail ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export function isValidEmail(v: string) { return EMAIL_RE.test(v.trim()) }
/** "maria@exemplo.test" → "m***@exemplo.test" (registro local sem expor o endereço). */
export function maskEmail(v: string) {
  const [u, d] = v.trim().split('@')
  return d ? `${u.slice(0, 1)}***@${d}` : '***'
}

// ---------- Senha ----------
const COMMON = ['123456', 'senha', 'password', 'qwerty', 'abcdef', 'qlinic', 'admin']
export interface PwCheck { id: string; label: string; ok: boolean }
export function passwordChecks(pw: string, email = ''): PwCheck[] {
  const local = (email.split('@')[0] ?? '').toLowerCase()
  const low = pw.toLowerCase()
  return [
    { id: 'len', label: 'Pelo menos 12 caracteres', ok: pw.length >= 12 },
    { id: 'lower', label: 'Uma letra minúscula', ok: /[a-z]/.test(pw) },
    { id: 'upper', label: 'Uma letra maiúscula', ok: /[A-Z]/.test(pw) },
    { id: 'digit', label: 'Um número', ok: /\d/.test(pw) },
    { id: 'symbol', label: 'Um símbolo (ex.: ! @ # ?)', ok: /[^A-Za-z0-9]/.test(pw) },
    { id: 'email', label: 'Não contém o nome do seu e-mail', ok: local.length < 3 || !low.includes(local) },
    { id: 'common', label: 'Não contém sequências comuns (123456, senha…)', ok: !COMMON.some((c) => low.includes(c)) },
  ]
}
export function passwordStrength(pw: string, email = ''): { score: 0 | 1 | 2 | 3 | 4; label: string; ok: boolean } {
  const checks = passwordChecks(pw, email)
  const passed = checks.filter((c) => c.ok).length
  const ok = checks.every((c) => c.ok)
  const score = (!pw ? 0 : ok ? (pw.length >= 16 ? 4 : 3) : passed >= 5 ? 2 : 1) as 0 | 1 | 2 | 3 | 4
  return { score, label: ['Vazia', 'Fraca', 'Média', 'Boa', 'Forte'][score], ok }
}

// ---------- Códigos ----------
export function isSixDigits(v: string) { return /^\d{6}$/.test(v) }
/** Demonstração: o único código aceito é 000000. Produção: validação no servidor (TOTP/e-mail). */
export function isDemoCode(v: string) { return v === '000000' }
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** Códigos de recuperação FICTÍCIOS e determinísticos (demo). Produção: gerados e guardados com hash no servidor. */
export function recoveryCodes(seed: string, n = 8): string[] {
  const r = rng(hashString(seed))
  return Array.from({ length: n }, () => {
    const part = () => Array.from({ length: 4 }, () => ALPHA[r.int(0, ALPHA.length - 1)]).join('')
    return `${part()}-${part()}`
  })
}
export const INVITE_TOKEN_DEMO = 'convite-demo-7F3K'
export function isDemoInviteToken(t: string) { return /^convite-demo-[A-Za-z0-9]{4,}$/.test(t) }

// ---------- Navegação da demonstração ----------
/** Destino relativo seguro (sem protocolo, sem //, sem ..). Evita redirecionamento aberto via ?destino=. */
export function safeDestino(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.replace(/^\/+/, '')
  return /^[a-z0-9][a-z0-9\-/]*$/.test(s) && !s.includes('//') ? s.replace(/\/$/, '') : null
}

// ---------- Data-base ----------
const pad = (n: number) => String(n).padStart(2, '0')
/** Date → valor de <input type="datetime-local"> (horário local do navegador). */
export function toLocalInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function fromLocalInputValue(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
