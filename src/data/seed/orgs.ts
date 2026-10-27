// Organizações fictícias (fonte única: orgs.json, também usada pelo gerador de PWA por tenant).
// Nenhum CNPJ/CPF/contato real; telefones com DDD 00 (inexistente) e e-mails em .test.
import type { ModuleKey, Organization, Segment } from '@/domain/types'
import { BASE_MODULES } from '@/domain/types'
import SPECS_JSON from './orgs.json'

interface OrgSpec { id: string; slug: string; name: string; short: string; legal: string; segment: Segment; primary: string; city: string; status: Organization['status']; planId: string; demo: boolean; headline: string; createdDaysAgo: number; initials: string }
const SPECS = SPECS_JSON as OrgSpec[]

const SEG_MODULES: Record<Segment, ModuleKey[]> = {
  odontologia: ['odontologia', 'crm', 'comissoes', 'estoque', 'compras', 'automacoes', 'ia', 'convenios'],
  medicina: ['medicina', 'convenios', 'crm', 'comissoes', 'estoque', 'ia', 'automacoes', 'multidisciplinar'],
  veterinaria: ['veterinaria', 'estoque', 'compras', 'crm', 'automacoes', 'ia'],
  estetica: ['estetica', 'crm', 'comissoes', 'estoque', 'automacoes', 'ia'],
  psicologia: ['psicologia', 'automacoes'],
  fisioterapia: ['fisioterapia', 'multidisciplinar', 'estoque', 'convenios'],
  nutricao: ['nutricao', 'crm', 'automacoes', 'ia'],
}

function fakeCNPJ(i: number) {
  return `00.${String(100 + i).padStart(3, '0')}.${String(200 + i * 7).padStart(3, '0')}/0001-${String(10 + i).padStart(2, '0')}`
}

export function buildOrganizations(base: Date): Organization[] {
  return SPECS.map((s, i) => ({
    id: s.id, slug: s.slug, name: s.name, legalName: s.legal, document: fakeCNPJ(i), segment: s.segment,
    modules: Array.from(new Set([...BASE_MODULES, ...SEG_MODULES[s.segment]])),
    brand: { primary: s.primary, initials: s.initials, version: 1, themeMode: 'system' },
    status: s.status, planId: s.planId, timezone: s.city.endsWith('PE') ? 'America/Recife' : s.city.endsWith('BA') ? 'America/Bahia' : 'America/Sao_Paulo',
    contactEmail: `contato@${s.slug}.exemplo.test`, contactPhone: `(00) 3000-${String(1000 + i).slice(-4)}`, city: s.city, demo: s.demo,
    createdAt: new Date(base.getTime() - s.createdDaysAgo * 86400000).toISOString(),
    onboarding: { step: 10, completed: true },
    publicPage: { enabled: s.demo, headline: s.headline, about: `${s.name} é uma clínica fictícia usada para demonstrar o Qlinic. Endereço, profissionais e contatos não são reais.`, showPrices: s.segment !== 'psicologia', showProfessionals: true },
    domain: { hostname: `${s.slug}.dominio-da-plataforma.exemplo`, status: s.demo ? 'verificado' : 'nenhum' },
  }))
}

/** Slugs com manifesto/ícones PWA gerados em build (public/t/<slug>/). */
export const PWA_SLUGS = SPECS.filter((s) => s.demo).map((s) => s.slug)
