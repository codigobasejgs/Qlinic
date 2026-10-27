// Wizard de Onboarding de 10 Etapas com Salvamento e Retomada.
// Persistência em organization.onboarding {step, completed, data}.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useActor, useTenant } from '@/app/session'
import { useCollection } from '@/data/store'
import { Alert, Badge, Button, PageHeader } from '@/ui'
import { cx } from '@/lib/util'
import { updateOrg } from './lib'
import { OrgInfoForm, SegmentModulesForm, PublicPageForm, CommunicationProfileForm, BankDemoForm } from './org'
import { UnitsEditor, ServicesEditor, TeamEditor } from './catalog'
import { BrandEditor, BrandPreviews } from './brand'
import { PoliciesEditor } from './policies'

const STEPS = [
  { id: 1, title: 'Organização', desc: 'Dados e contato' },
  { id: 2, title: 'Segmento', desc: 'Módulos' },
  { id: 3, title: 'Unidades', desc: 'Horários e salas' },
  { id: 4, title: 'Marca', desc: 'Logo e cores' },
  { id: 5, title: 'Equipe & Serviços', desc: 'Profissionais' },
  { id: 6, title: 'Agendamento', desc: 'Políticas' },
  { id: 7, title: 'Página Pública', desc: 'Domínio' },
  { id: 8, title: 'Comunicação', desc: 'E-mail e Whats' },
  { id: 9, title: 'Pagamentos', desc: 'Recebimento' },
  { id: 10, title: 'Revisão', desc: 'Checklist' },
]

export function OnboardingPage() {
  const t = useTenant()
  const actor = useActor()
  const nav = useNavigate()
  const units = useCollection(t.tenantId, 'units')
  const services = useCollection(t.tenantId, 'services')
  const pros = useCollection(t.tenantId, 'professionals')

  const ob = t.org.onboarding ?? { step: 1, completed: false, data: {} }
  const [currentStep, setCurrentStep] = useState<number>(ob.step || 1)
  const [publicEnabled, setPublicEnabled] = useState<boolean>(typeof ob.data?.publicEnabled === 'boolean' ? (ob.data.publicEnabled as boolean) : t.org.publicPage.enabled)
  const staff = useCollection(t.tenantId, 'staff')
  const resources = useCollection(t.tenantId, 'resources')
  if (!t.can('configuracoes', 'update')) return <div className="stack"><PageHeader title="Configuração inicial" /><Alert tone="neutral" title="Sem permissão">Somente proprietário ou gestor com permissão de editar configurações conduz a configuração inicial.</Alert></div>

  const saved = (ob.data?.saved as number[] | undefined) ?? []
  const goToStep = (stepId: number, markSaved?: number) => {
    setCurrentStep(stepId)
    const nextSaved = markSaved && !saved.includes(markSaved) ? [...saved, markSaved] : saved
    updateOrg(t.org, { onboarding: { ...ob, step: stepId, data: { ...ob.data, saved: nextSaved, publicEnabled } } })
    window.scrollTo({ top: 0 })
  }

  const nextStep = () => {
    if (currentStep < 10) goToStep(currentStep + 1, currentStep)
  }

  const prevStep = () => {
    if (currentStep > 1) goToStep(currentStep - 1)
  }

  const completeOnboarding = () => {
    updateOrg(
      t.org,
      {
        onboarding: { step: 10, completed: true, data: { ...ob.data, saved: [...new Set([...saved, 10])], completedAt: new Date().toISOString() } },
        publicPage: { ...t.org.publicPage, enabled: publicEnabled },
        status: t.org.status === 'onboarding' ? 'trial' : t.org.status,
      },
      actor,
      'Onboarding concluído com sucesso'
    )
    nav(t.base)
  }

  const checklist = [
    { label: 'Organização: nome, CNPJ fictício e contato', done: t.org.name.length > 2 && t.org.document.replace(/\D/g, '').length === 14 && !!t.org.contactEmail, step: 1 },
    { label: 'Segmento e módulos revisados', done: saved.includes(2), step: 2 },
    { label: 'Unidade com horário de funcionamento', done: units.some((u) => Object.values(u.hours).some((h) => h.length)), step: 3 },
    { label: 'Salas, cadeiras ou equipamentos cadastrados', done: resources.length > 0, step: 3 },
    { label: 'Marca revisada (cor, logo ou iniciais)', done: t.org.brand.version > 1 || saved.includes(4), step: 4 },
    { label: 'Equipe além do proprietário', done: staff.length > 1, step: 5 },
    { label: 'Profissional com jornada', done: pros.some((p) => p.active && p.schedule.length > 0), step: 5 },
    { label: 'Serviço ativo', done: services.some((s) => s.active), step: 5 },
    { label: 'Serviço agendável publicamente', done: services.some((s) => s.active && s.publicBookable), step: 5 },
    { label: 'Política de agendamento revisada', done: saved.includes(6), step: 6 },
    { label: 'Página pública com chamada', done: t.org.publicPage.headline.trim().length >= 5 || !publicEnabled, step: 7 },
    { label: 'Comunicação revisada', done: saved.includes(8), step: 8 },
    { label: 'Pagamentos revisados', done: saved.includes(9), step: 9 },
  ]
  const pending = checklist.filter((c) => !c.done).length

  return (
    <div className="stack" data-tour="page-content">
      <PageHeader
        title="Configuração inicial da clínica"
        subtitle={`${t.org.name} · Etapa ${currentStep} de 10 · ${STEPS[currentStep - 1].title}. O progresso é salvo automaticamente e pode ser retomado depois.`}
      />

      {t.org.onboarding?.completed && (
        <Alert tone="success" title="Configuração inicial concluída">
          Sua clínica já está configurada e ativa. Você pode revisar as etapas a qualquer momento abaixo.
        </Alert>
      )}

      {t.org.sandbox && !t.org.onboarding?.completed && <Alert tone="info" title="Clínica criada na demonstração">Os cadastros começam vazios. Preencha as etapas na ordem que preferir; o checklist final indica o que falta.</Alert>}
      <nav aria-label="Progresso da configuração inicial">
        <ol className="steps">
          {STEPS.map((s) => {
            const isDone = saved.includes(s.id) || !!t.org.onboarding?.completed
            const isCurrent = s.id === currentStep
            return (
              <li key={s.id} className={cx(isDone && 'done', isCurrent && 'current')}>
                <button
                  type="button"
                  onClick={() => goToStep(s.id)}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`Etapa ${s.id}: ${s.title}${isDone ? ' (concluída)' : ''}`}
                >
                  <strong>{s.id}. <span className="hide-mobile">{s.title}</span></strong>
                  <span className="tiny hide-mobile">{s.desc}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="card">
        {currentStep === 1 && <OrgInfoForm onSaved={nextStep} saveLabel="Salvar e continuar" />}
        {currentStep === 2 && <SegmentModulesForm onSaved={nextStep} />}
        {currentStep === 3 && (
          <div className="stack">
            <UnitsEditor />
            <div className="row end"><Button variant="primary" onClick={nextStep}>Próxima etapa</Button></div>
          </div>
        )}
        {currentStep === 4 && (
          <div className="stack">
            <BrandEditor onSaved={nextStep} />
          </div>
        )}
        {currentStep === 5 && (
          <div className="stack">
            <ServicesEditor />
            <TeamEditor />
            <div className="row end"><Button variant="primary" onClick={nextStep}>Próxima etapa</Button></div>
          </div>
        )}
        {currentStep === 6 && (
          <div className="stack">
            <PoliciesEditor groups={['booking', 'privacy']} />
            <div className="row end"><Button variant="primary" onClick={nextStep}>Próxima etapa</Button></div>
          </div>
        )}
        {currentStep === 7 && (
          <PublicPageForm
            deferEnable={{ value: publicEnabled, set: setPublicEnabled }}
            onSaved={nextStep}
          />
        )}
        {currentStep === 8 && (
          <div className="stack">
            <CommunicationProfileForm />
            <PoliciesEditor groups={['communication']} />
            <div className="row end"><Button variant="primary" onClick={nextStep}>Próxima etapa</Button></div>
          </div>
        )}
        {currentStep === 9 && (
          <div className="stack">
            <BankDemoForm />
            <PoliciesEditor groups={['payments']} />
            <div className="row end"><Button variant="primary" onClick={nextStep}>Próxima etapa</Button></div>
          </div>
        )}
        {currentStep === 10 && (
          <div className="stack" style={{ gap: 20 }}>
            <h2 style={{ fontSize: 18 }}>Prévia desktop, celular e PWA</h2>
            <BrandPreviews />
            <h2 style={{ fontSize: 18 }}>Checklist de configuração</h2>
            <p className="small muted" aria-live="polite">{pending ? `${pending} item(ns) pendente(s). Você pode concluir mesmo assim e completar depois em Configurações.` : 'Tudo pronto.'}</p>
            <ul className="st-checklist">
              {checklist.map((c, i) => (
                <li key={i}>
                  {c.done ? <Badge tone="success">Concluído</Badge> : <Badge tone="warning">Pendente</Badge>}
                  <span className="grow">{c.label}</span>
                  {!c.done && (
                    <Button size="sm" onClick={() => goToStep(c.step)}>
                      Ir para etapa {c.step}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <div className="row between" style={{ marginTop: 16 }}>
              <Button onClick={prevStep}>Voltar</Button>
              <Button variant="primary" onClick={completeOnboarding} data-tour="primary-action">
                {t.org.onboarding?.completed ? 'Salvar e voltar ao início' : 'Concluir configuração inicial'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {currentStep > 1 && currentStep < 10 && (
        <div className="row start">
          <Button onClick={prevStep}>Voltar para etapa anterior</Button>
        </div>
      )}
    </div>
  )
}
