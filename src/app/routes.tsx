// Mapa de rotas. Páginas carregadas sob demanda (lazy) por módulo.
import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Link, Navigate, Outlet, useRouteError, isRouteErrorResponse, useSearchParams } from 'react-router'
// Ambientes autenticados (layouts, gates, seeds de tenant) ficam fora do bundle do site comercial.
const appShell = () => import('./shells')
const StaffGate = lazy(() => appShell().then((m) => ({ default: m.StaffGate })))
const ClinicGate = lazy(() => appShell().then((m) => ({ default: m.ClinicGate })))
const PortalGate = lazy(() => appShell().then((m) => ({ default: m.PortalGate })))
const MasterShell = lazy(() => appShell().then((m) => ({ default: m.MasterShell })))

export function PageFallback() {
  return <div className="content" aria-busy="true" aria-label="Carregando"><div className="skeleton" style={{ height: 28, width: '40%' }} /></div>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function L<M extends Record<string, any>>(load: () => Promise<M>, name: keyof M & string) {
  const C = lazy(() => load().then((m) => ({ default: m[name] as ComponentType })))
  return <Suspense fallback={<PageFallback />}><C /></Suspense>
}

const pub = () => import('@/modules/public/pages')
const auth = () => import('@/modules/public/auth')
const help = () => import('@/modules/help/pages')
const master = () => import('@/modules/platform/pages')
const sched = () => import('@/modules/scheduling/pages')
const clin = () => import('@/modules/clinical/pages')
const spec = () => import('@/modules/specialties/pages')
const com = () => import('@/modules/commercial/pages')
const eng = () => import('@/modules/engagement/pages')
const portal = () => import('@/modules/portal/pages')
const clinicPub = () => import('@/modules/portal/public')
const settings = () => import('@/modules/settings/pages')
const ctr = () => import('@/modules/contracts/pages')

/** /contratar?plano=X → /planos?plano=X&ciclo=Y#contratacao. Demais parâmetros são descartados (nunca PII). */
function LegacyCheckoutRedirect() {
  const [sp] = useSearchParams()
  const n = new URLSearchParams()
  const plano = sp.get('plano'), ciclo = sp.get('ciclo')
  if (plano && /^[a-z0-9_-]{1,60}$/i.test(plano)) n.set('plano', plano)
  if (ciclo && ['mensal', 'trimestral', 'anual'].includes(ciclo)) n.set('ciclo', ciclo)
  const q = n.toString()
  return <Navigate to={`/planos${q ? `?${q}#contratacao` : ''}`} replace />
}

export function NotFound() {
  return (
    <main id="main" className="content stack" style={{ maxWidth: 560, marginTop: 32 }}>
      <h1>Página não encontrada</h1>
      <p className="muted">O endereço não existe ou foi movido.</p>
      <Link to="/" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Voltar ao início</Link>
    </main>
  )
}
function RouteError() {
  const err = useRouteError()
  const msg = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : 'Erro inesperado'
  const chunk = /dynamically imported module|Failed to fetch/i.test(msg)
  return (
    <main id="main" className="content stack" style={{ maxWidth: 640, marginTop: 32 }} role="alert">
      <h1>{chunk ? 'Não foi possível carregar esta tela' : 'Algo deu errado'}</h1>
      <p className="muted">{chunk ? 'Pode ser falta de conexão ou uma nova versão publicada. Verifique a internet e recarregue.' : 'O erro foi registrado localmente (sem dados pessoais).'}</p>
      <div className="row"><button className="btn btn-primary" onClick={() => location.reload()}>Recarregar</button><Link className="btn btn-secondary" to="/">Início</Link></div>
    </main>
  )
}

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    element: <Outlet />,
    children: [
      { path: '/', element: L(pub, 'LandingPage') },
      { path: '/segmentos/:segmento', element: L(pub, 'SegmentPage') },
      { path: '/planos', element: L(pub, 'PlansPage') },
      { path: '/recursos', element: L(pub, 'FeaturesPage') },
      // rotas antigas da contratação → /planos (só parâmetros comerciais; nenhum callback/token usa estas rotas)
      { path: '/contrato', element: <Navigate to="/planos" replace /> },
      { path: '/contratar', element: <LegacyCheckoutRedirect /> },
      { path: '/ajuda', element: L(help, 'PublicHelpCenter') },
      { path: '/ajuda/:artigo', element: L(help, 'PublicHelpArticle') },
      { path: '/demonstracao', element: L(pub, 'DemoPickerPage') },
      { path: '/demonstracao/identidade', element: L(pub, 'BrandShowcasePage') },
      { path: '/auth/login', element: L(auth, 'LoginPage') },
      { path: '/auth/recuperar', element: L(auth, 'RecoverPage') },
      { path: '/auth/convite', element: L(auth, 'InvitePage') },
      { path: '/auth/verificar', element: L(auth, 'VerifyPage') },
      { path: '/auth/mfa', element: L(auth, 'MfaPage') },
      {
        path: '/master', element: <Suspense fallback={<PageFallback />}><MasterShell /></Suspense>, children: [
          { index: true, element: L(master, 'MasterDashboard') },
          { path: 'contratantes', element: L(master, 'TenantsPage') },
          { path: 'contratantes/:tenantId', element: L(master, 'TenantDetailPage') },
          { path: 'planos', element: L(master, 'PlansAdminPage') },
          { path: 'testes', element: L(master, 'TrialsPage') },
          { path: 'assinaturas', element: L(master, 'SubscriptionsPage') },
          { path: 'cobranca', element: L(master, 'SaasBillingPage') },
          { path: 'contratos', element: L(ctr, 'SaasContractsPage') },
          { path: 'contratacao', element: L(ctr, 'ContractSettingsPage') },
          { path: 'integracoes', element: L(master, 'IntegrationsHealthPage') },
          { path: 'dominios', element: L(master, 'DomainsPwaPage') },
          { path: 'suporte', element: L(master, 'SupportPage') },
          { path: 'operacao', element: L(master, 'OperationsPage') },
          { path: 'governanca', element: L(master, 'GovernancePage') },
          { path: 'custos', element: L(master, 'CostsPage') },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        path: '/app/:tenantSlug', element: <Suspense fallback={<PageFallback />}><StaffGate /></Suspense>, children: [
          { index: true, element: L(sched, 'StaffHomePage') },
          { path: 'agenda', element: L(sched, 'AgendaPage') },
          { path: 'recepcao', element: L(sched, 'ReceptionPage') },
          { path: 'lista-espera', element: L(sched, 'WaitlistPage') },
          { path: 'pacientes', element: L(clin, 'PatientsPage') },
          { path: 'pacientes/:patientId', element: L(clin, 'PatientDetailPage') },
          { path: 'atendimento/:appointmentId', element: L(clin, 'ConsultPage') },
          { path: 'documentos', element: L(clin, 'DocumentsPage') },
          { path: 'formularios', element: L(clin, 'FormsPage') },
          { path: 'odontologia', element: L(spec, 'OdontologyPage') },
          { path: 'medicina', element: L(spec, 'MedicinePage') },
          { path: 'convenios', element: L(spec, 'InsurancePage') },
          { path: 'veterinaria', element: L(spec, 'VeterinaryPage') },
          { path: 'estetica', element: L(spec, 'AestheticsPage') },
          { path: 'psicologia', element: L(spec, 'PsychologyPage') },
          { path: 'fisioterapia', element: L(spec, 'PhysioPage') },
          { path: 'nutricao', element: L(spec, 'NutritionPage') },
          { path: 'multidisciplinar', element: L(spec, 'CarePlanPage') },
          { path: 'crm', element: L(com, 'CrmPage') },
          { path: 'orcamentos', element: L(com, 'ProposalsPage') },
          { path: 'orcamentos/:proposalId', element: L(com, 'ProposalEditorPage') },
          { path: 'financeiro', element: L(com, 'FinancePage') },
          { path: 'comissoes', element: L(com, 'CommissionsPage') },
          { path: 'precificacao', element: L(com, 'PricingSimulatorPage') },
          { path: 'estoque', element: L(com, 'InventoryPage') },
          { path: 'compras', element: L(com, 'PurchasingPage') },
          { path: 'comunicacao', element: L(eng, 'CommunicationPage') },
          { path: 'ia', element: L(eng, 'AiAssistantPage') },
          { path: 'automacoes', element: L(eng, 'AutomationsPage') },
          { path: 'relatorios', element: L(settings, 'ReportsPage') },
          { path: 'importacao', element: L(settings, 'ImportPage') },
          { path: 'configuracoes', element: L(settings, 'SettingsPage') },
          { path: 'marca', element: L(settings, 'BrandPwaPage') },
          { path: 'permissoes', element: L(settings, 'PermissionsPage') },
          { path: 'auditoria', element: L(settings, 'AuditPage') },
          { path: 'onboarding', element: L(settings, 'OnboardingPage') },
          { path: 'meu-plano', element: L(ctr, 'MyPlanContractPage') },
          { path: 'ajuda', element: L(help, 'StaffHelpPage') },
          { path: 'ajuda/:artigo', element: L(help, 'StaffHelpArticle') },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        path: '/c/:tenantSlug', element: <Suspense fallback={<PageFallback />}><ClinicGate /></Suspense>, children: [
          { index: true, element: L(clinicPub, 'ClinicPublicPage') },
          { path: 'agendar', element: L(clinicPub, 'PublicBookingPage') },
          { path: 'totem', element: L(sched, 'TotemPage') },
          { path: 'painel', element: L(sched, 'CallPanelPage') },
          { path: 'proposta/:token', element: L(clinicPub, 'ProposalLinkPage') },
          {
            path: 'portal', element: <Suspense fallback={<PageFallback />}><PortalGate>{L(portal, 'PortalLayout')}</PortalGate></Suspense>, children: [
              { index: true, element: L(portal, 'PortalHomePage') },
              { path: 'agendar', element: L(portal, 'PortalBookingPage') },
              { path: 'consultas', element: L(portal, 'PortalAppointmentsPage') },
              { path: 'documentos', element: L(portal, 'PortalDocumentsPage') },
              { path: 'pagamentos', element: L(portal, 'PortalPaymentsPage') },
              { path: 'formularios', element: L(portal, 'PortalFormsPage') },
              { path: 'propostas', element: L(portal, 'PortalProposalsPage') },
              { path: 'tratamento', element: L(portal, 'PortalTreatmentPage') },
              { path: 'vacinas', element: L(portal, 'PortalVaccinesPage') },
              { path: 'preferencias', element: L(portal, 'PortalPreferencesPage') },
              { path: 'perfil', element: L(portal, 'PortalProfilePage') },
              { path: '*', element: <NotFound /> },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])
