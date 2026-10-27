// Resolução de tenant (TenantResolver) e gates por ambiente.
// Hoje: por path (/app/:slug, /c/:slug). Futuro: hostname verificado → slug (ver docs/ARQUITETURA.md).
// Tenant desconhecido → erro seguro (404), NUNCA fallback para clínica padrão.
import { Suspense, useEffect } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { StaffLayout, PageFallback } from './layouts'
import { TenantProvider, useOrgBySlug, useSession, PortalProvider, setSession } from './session'
import { useCollection } from '@/data/store'
import { useTenantBrand, useDocumentBrand, QlinicLogo } from '@/ui/brand'
import type { Organization } from '@/domain/types'
import { hasPublishedPwa } from '@/domain/tenancy'
import { ModulesReady } from '@/modules/ready'

export function resolveTenantSlugFromHost(hostname: string, platformRoot: string): string | null {
  // ponytail: resolução por hostname é só contrato; ativar quando houver domínio + mapeamento verificado no servidor.
  if (!hostname.endsWith(`.${platformRoot}`)) return null
  const sub = hostname.slice(0, -(platformRoot.length + 1))
  return /^[a-z0-9-]+$/.test(sub) ? sub : null
}

export function TenantNotFound() {
  useDocumentBrand({ title: 'Clínica não encontrada · Qlinic' })
  return (
    <main id="main" className="content stack" style={{ maxWidth: 560, marginTop: 48 }}>
      <QlinicLogo height={32} />
      <h1>Clínica não encontrada</h1>
      <p className="muted">O endereço não corresponde a nenhuma clínica ativa. Verifique o link recebido.</p>
      <Link className="btn btn-primary" to="/" style={{ alignSelf: 'flex-start' }}>Ir para o site Qlinic</Link>
    </main>
  )
}

// Resolução do tenant acontece DEPOIS de ModulesReady: na sessão conectada, organizações vêm do servidor.
export function StaffGate() {
  return <ModulesReady><StaffResolved /></ModulesReady>
}
function StaffResolved() {
  const { tenantSlug } = useParams()
  const org = useOrgBySlug(tenantSlug)
  if (!org) return <TenantNotFound />
  return <TenantProvider key={org.id} org={org}><StaffLayout /></TenantProvider>
}

/** Ambiente público da clínica (página, agendamento, totem, painel, proposta). Aplica marca da clínica. */
export function ClinicGate() {
  return <ModulesReady><ClinicResolved /></ModulesReady>
}
function ClinicResolved() {
  const { tenantSlug } = useParams()
  const org = useOrgBySlug(tenantSlug)
  const session = useSession()
  // portal conectado: org vem do servidor mesmo sem página pública habilitada
  const portalOwn = session?.kind === 'portal' && session.remote && org && session.tenantId === org.id
  if (!org || (!org.publicPage.enabled && !portalOwn) || org.status === 'cancelled') return <TenantNotFound />
  return <ClinicBrand org={org}><Suspense fallback={<PageFallback />}><Outlet context={org} /></Suspense></ClinicBrand>
}
function ClinicBrand({ org, children }: { org: Organization; children: React.ReactNode }) {
  useTenantBrand(org)
  const pwa = hasPublishedPwa(org.slug)
  useDocumentBrand({ title: org.name, themeColor: org.brand.primary, manifestHref: pwa ? `/t/${org.slug}/portal.webmanifest` : null, iconHref: pwa ? `/t/${org.slug}/icon.svg` : '/brand/pwa/favicon.svg', appleIcon: pwa ? `/t/${org.slug}/apple-touch-icon.png` : '/brand/pwa/apple-touch-icon.png' })
  return <>{children}</>
}

/** Portal paciente/tutor: exige sessão demo de portal para ESTE tenant. */
export function PortalGate({ children }: { children: React.ReactNode }) {
  const { tenantSlug } = useParams()
  const org = useOrgBySlug(tenantSlug)
  const session = useSession()
  const persons = useCollection(org?.id ?? '__none__', 'persons')
  const ok = org && session?.kind === 'portal' && session.tenantId === org.id
  const person = ok ? persons.find((p) => p.id === session.personId) : undefined
  useEffect(() => { if (session?.kind === 'portal' && org && session.tenantId !== org.id) setSession(null) }, [session, org])
  if (!org) return <TenantNotFound />
  if (!person) {
    return (
      <main id="main" className="content stack" style={{ maxWidth: 520, marginTop: 32 }}>
        <h1>Entrar no portal de {org.name}</h1>
        <p className="muted">Nesta demonstração o acesso é feito pelo seletor de perfis. Em produção haverá autenticação própria — nunca apenas CPF ou data de nascimento.</p>
        <Link className="btn btn-primary" to={`/demonstracao?clinica=${org.slug}&perfil=portal`} style={{ alignSelf: 'flex-start' }}>Escolher perfil de paciente</Link>
      </main>
    )
  }
  return <PortalProvider org={org} person={person}>{children}</PortalProvider>
}
