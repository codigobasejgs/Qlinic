// Links do site público para telas reais da demonstração (sem sessão → passam pelo seletor de perfil).
import type { Segment } from '@/domain/types'

const SEG_DEMO: Record<Segment, string> = {
  odontologia: 'sorriso-pleno', medicina: 'clinica-vitta', veterinaria: 'vet-amigo', estetica: 'lumiere-estetica',
  psicologia: 'espaco-escuta', fisioterapia: 'movimento-fisio', nutricao: 'nutri-equilibrio',
}
const ROUTE_DEMO: Record<string, string> = {
  odontologia: 'sorriso-pleno', medicina: 'clinica-vitta', convenios: 'clinica-vitta', veterinaria: 'vet-amigo', estetica: 'lumiere-estetica',
  psicologia: 'espaco-escuta', fisioterapia: 'movimento-fisio', multidisciplinar: 'movimento-fisio', nutricao: 'nutri-equilibrio',
}
export function demoSlugFor(seg: Segment) { return SEG_DEMO[seg] }

/**
 * 'agenda' (relativa) = tela da equipe → seletor com clínica + destino.
 * ':slug' é substituído pela clínica. '/c/<slug>/portal…' → seletor com perfil portal. '/master…' → seletor da plataforma. Outras absolutas: diretas (totem, painel, página pública).
 */
export function demoLink(rawRoute: string, slug?: string): string {
  const s = slug || ROUTE_DEMO[rawRoute.split('/')[0]] || 'sorriso-pleno'
  const route = rawRoute.replace(':slug', s)
  const portal = /^\/c\/([^/]+)\/portal/.exec(route)
  if (portal) return `/demonstracao?clinica=${portal[1]}&perfil=portal`
  if (route.startsWith('/master')) return `/demonstracao?perfil=plataforma${route === '/master' ? '' : `&destino=${encodeURIComponent(route.slice('/master/'.length))}`}`
  if (route.startsWith('/')) return route
  return `/demonstracao?clinica=${s}&destino=${encodeURIComponent(route)}`
}
