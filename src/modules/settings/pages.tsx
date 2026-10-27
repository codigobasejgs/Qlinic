// Módulo de configurações: exports fixos importados por src/app/routes.tsx.
import { useSearchParams } from 'react-router'
import { useTenant } from '@/app/session'
import { usePlatformCollection, useCollection } from '@/data/store'
import { Alert, ButtonLink, EmptyState, PageHeader, Progress, Section, Tabs, TabPanel } from '@/ui'
import { LIMIT_LABEL, planOf, planUsage } from './lib'
import { BankDemoForm, DocLogoForm, OrgInfoForm, PreferencesForm, SegmentModulesForm } from './org'
import { ServicesEditor, TeamEditor, UnitsEditor } from './catalog'
import { PoliciesEditor } from './policies'
import { MODULE_LABEL } from '@/domain/types'
import './types'
import './styles.css'

export { ReportsPage } from './reports'
export { ImportPage } from './import'
export { BrandPwaPage } from './brand'
export { PermissionsPage } from './permissions'
export { AuditPage } from './audit'
export { OnboardingPage } from './onboarding'

const TABS = [
  { id: 'organizacao', label: 'Organização' },
  { id: 'unidades', label: 'Unidades' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'equipe', label: 'Equipe' },
  { id: 'politicas', label: 'Políticas' },
  { id: 'templates', label: 'Templates' },
  { id: 'limites', label: 'Limites do plano' },
  { id: 'preferencias', label: 'Preferências' },
]

export function SettingsPage() {
  const t = useTenant()
  const [sp, setSp] = useSearchParams()
  const tab = TABS.some((x) => x.id === sp.get('aba')) ? sp.get('aba')! : 'organizacao'
  const setTab = (id: string) => { const n = new URLSearchParams(sp); n.set('aba', id); setSp(n, { replace: true }) }
  if (!t.can('configuracoes', 'read')) return <div className="stack"><PageHeader title="Configurações" /><EmptyState title="Sem acesso às configurações">Seu perfil não possui permissão para consultar as configurações da clínica.</EmptyState></div>
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Configurações" subtitle={`${t.org.name} · regras da rede com sobrescritas por unidade`} />
      <Tabs label="Seções de configuração" value={tab} onChange={setTab} tabs={TABS} />
      <TabPanel>
        {tab === 'organizacao' && <div className="stack">
          <Section title="Informações comerciais, profissionais e contatos"><OrgInfoForm /></Section>
          <Section title="Segmento e módulos"><SegmentModulesForm /></Section>
          <Section title="Logo de documentos"><DocLogoForm /></Section>
          <Section title="Dados bancários demonstrativos"><BankDemoForm /></Section>
        </div>}
        {tab === 'unidades' && <UnitsEditor />}
        {tab === 'servicos' && <ServicesEditor />}
        {tab === 'equipe' && <TeamEditor />}
        {tab === 'politicas' && <PoliciesEditor />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'limites' && <LimitsTab />}
        {tab === 'preferencias' && <Section title="Preferências da clínica"><PreferencesForm /></Section>}
      </TabPanel>
    </div>
  )
}

function TemplatesTab() {
  const t = useTenant()
  return <div className="grid grid-2">
    <Section title="Mensagens (e-mail, WhatsApp, push)"><p className="small muted">Modelos de confirmação, lembrete, cobrança e demais eventos são editados no módulo de Comunicação.</p><ButtonLink to={`${t.base}/comunicacao`}>Abrir Comunicação</ButtonLink></Section>
    <Section title="Documentos clínicos"><p className="small muted">Receitas, atestados, termos e contratos usam templates versionados no módulo de Documentos. O logo de documentos fica na aba Organização.</p><ButtonLink to={`${t.base}/documentos`}>Abrir Documentos</ButtonLink></Section>
  </div>
}

function LimitsTab() {
  const t = useTenant()
  usePlatformCollection('plans'); usePlatformCollection('usage')
  useCollection(t.tenantId, 'staff'); useCollection(t.tenantId, 'professionals'); useCollection(t.tenantId, 'units')
  const plan = planOf(t.org)
  const rows = planUsage(t.org)
  return <div className="stack">
    <Alert tone="info" title="Três camadas independentes">Limite do plano (cota contratada) ≠ módulo habilitado (feature flag da clínica) ≠ permissão do usuário (papel). Alterações de plano são feitas pela equipe Qlinic.</Alert>
    <Section title={`Plano ${plan?.name ?? 'não encontrado'}`}>
      <div className="stack">
        {rows.map((r) => {
          const pct = r.limit ? (r.used / r.limit) * 100 : 0
          return <div key={r.key} className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
            <div className="row between"><span className="strong small">{LIMIT_LABEL[r.key]}</span><span className="small">{r.used.toLocaleString('pt-BR')} / {r.limit?.toLocaleString('pt-BR') ?? '—'}</span></div>
            <Progress value={r.used} max={r.limit ?? 1} label={`${r.label}: ${Math.round(pct)}%`} tone={pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : undefined} />
            <span className="tiny muted">Fonte: {r.source}{pct >= 100 ? ' · limite atingido: novos cadastros bloqueados' : ''}</span>
          </div>
        })}
      </div>
    </Section>
    {plan && <Section title="Módulos incluídos no plano × habilitados na clínica">
      <ul className="st-checklist">{plan.modules.map((m) => <li key={m}><span className="grow">{MODULE_LABEL[m]}</span><span className="small">{t.moduleOn(m) ? 'habilitado' : 'incluído, desligado'}</span></li>)}</ul>
    </Section>}
  </div>
}
