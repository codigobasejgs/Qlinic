// Criação de organização (trial) — usada pela demonstração, Super Admin e onboarding.
import type { Organization, Segment, StaffUser, Unit } from './types'
import { BASE_MODULES } from './types'
import type { Subscription } from './platform'
import { db, platformDb } from '@/data/store'
import { addDaysCivil, nowISO, todayCivil, DEFAULT_TZ } from '@/lib/dates'
import { uid } from '@/lib/util'
import { PWA_SLUGS } from '@/data/seed/orgs'

const SEG_DEFAULT_MODULES: Record<Segment, Organization['modules']> = {
  odontologia: ['odontologia'], medicina: ['medicina', 'convenios'], veterinaria: ['veterinaria', 'estoque'], estetica: ['estetica', 'estoque'],
  psicologia: ['psicologia'], fisioterapia: ['fisioterapia'], nutricao: ['nutricao'],
}

export function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}
const RESERVED = new Set(['app', 'master', 'admin', 'api', 'auth', 'c', 't', 'brand', 'assets', 'www', 'qlinic', 'demonstracao', 'ajuda'])

export function validateSlug(slug: string, ignoreOrgId?: string): string | null {
  if (!/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) return 'Use 3 a 40 letras minúsculas, números ou hífen (sem começar/terminar com hífen).'
  if (RESERVED.has(slug)) return 'Endereço reservado. Escolha outro.'
  if (platformDb.list('organizations').some((o) => o.slug === slug && o.id !== ignoreOrgId)) return 'Endereço já em uso por outra clínica.'
  return null
}

export function createTrialOrganization(input: { name: string; segment: Segment; slug?: string; primary?: string; ownerName?: string; trialDays?: number }): { org: Organization; owner: StaffUser } {
  const name = input.name.trim()
  if (name.length < 3) throw new Error('Informe o nome da clínica.')
  const slug = input.slug ?? slugify(name)
  const err = validateSlug(slug)
  if (err) throw new Error(err)
  const id = uid('org_')
  const now = nowISO()
  const org: Organization = {
    id, slug, name, legalName: `${name} (fictícia)`, document: '', segment: input.segment,
    modules: Array.from(new Set([...BASE_MODULES, ...SEG_DEFAULT_MODULES[input.segment]])),
    brand: { primary: input.primary ?? '#0D9488', initials: name.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || name.slice(0, 2).toUpperCase(), version: 1, themeMode: 'system' },
    status: 'onboarding', planId: 'plan_pro', timezone: DEFAULT_TZ, contactEmail: `contato@${slug}.exemplo.test`, contactPhone: '', city: '', demo: false, sandbox: true, createdAt: now,
    onboarding: { step: 1, completed: false, data: {} },
    publicPage: { enabled: false, headline: '', about: '', showPrices: true, showProfessionals: true },
    domain: { hostname: `${slug}.dominio-da-plataforma.exemplo`, status: 'pendente' },
  }
  platformDb.insert('organizations', org)
  const unit: Unit = { id: uid('u_'), tenantId: id, createdAt: now, name: 'Unidade principal', timezone: DEFAULT_TZ, address: '', phone: '', hours: { 0: [], 1: [{ start: 480, end: 1080 }], 2: [{ start: 480, end: 1080 }], 3: [{ start: 480, end: 1080 }], 4: [{ start: 480, end: 1080 }], 5: [{ start: 480, end: 1080 }], 6: [] }, holidays: [], specialHours: [] }
  db.set(id, 'units', [unit])
  const owner: StaffUser = { id: uid('usr_'), tenantId: id, createdAt: now, name: input.ownerName?.trim() || 'Proprietário(a) (demo)', email: `owner@${slug}.exemplo.test`, memberships: [{ role: 'clinic_owner', unitIds: 'all' }], active: true, mfa: false }
  db.set(id, 'staff', [owner])
  const t = todayCivil()
  const sub: Subscription = { id: uid('sub_'), tenantId: id, planId: 'plan_pro', cycle: 'mensal', status: 'trial', startedAt: t, currentPeriodEnd: addDaysCivil(t, input.trialDays ?? 14), trial: { start: t, end: addDaysCivil(t, input.trialDays ?? 14), extensions: [] }, history: [{ at: now, event: 'Teste iniciado pela demonstração', by: 'Visitante' }] }
  platformDb.insert('subscriptions', sub)
  return { org, owner }
}

/** Manifesto PWA publicado só para clínicas com arquivos gerados em build (limitação documentada). */
export function hasPublishedPwa(slug: string) {
  return PWA_SLUGS.includes(slug)
}
