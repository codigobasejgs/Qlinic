// Exportação das páginas do módulo com os nomes FIXOS esperados pelas rotas.
import './styles.css'
import { useSearchParams } from 'react-router'
import { useTenant } from '@/app/session'
import { Alert, PageHeader, TabPanel, Tabs } from '@/ui'
import { OutboxTab } from './comm-outbox'
import { TemplatesTab } from './comm-templates'
import { EmailTab } from './comm-email'
import { WhatsAppTab } from './comm-whatsapp'
import { PreferencesTab } from './comm-preferences'
import { IntegrationsTab } from './comm-integrations'

export { AiAssistantPage } from './ai'
export { AutomationsPage } from './automations'

type CommTabId = 'fila' | 'templates' | 'email' | 'whatsapp' | 'preferencias' | 'integracoes'

const TABS: { id: CommTabId; label: string }[] = [
  { id: 'fila', label: 'Fila / Outbox' },
  { id: 'templates', label: 'Eventos e templates' },
  { id: 'email', label: 'E-mail (Resend)' },
  { id: 'whatsapp', label: 'WhatsApp (Evolution)' },
  { id: 'preferencias', label: 'Preferências da equipe' },
  { id: 'integracoes', label: 'Integrações da clínica' },
]

export function CommunicationPage() {
  const t = useTenant()
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('aba') as CommTabId) || 'fila'
  const setTab = (id: string) => setSp((prev) => { const n = new URLSearchParams(prev); n.set('aba', id); return n }, { replace: true })
  const canRead = t.can('comunicacao')

  if (!t.moduleOn('comunicacao') || !canRead) {
    return (
      <div className="engagement">
        <PageHeader title="Comunicação" />
        <Alert>Comunicação indisponível neste plano ou perfil.</Alert>
      </div>
    )
  }

  return (
    <div className="engagement" data-tour="page-content">
      <PageHeader
        title="Comunicação e integrações"
        subtitle="Fila de envios, modelos de notificação, canais externos e conexões da clínica (Contexto B)."
      />
      <div className="stack">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Navegação da comunicação" />
        <TabPanel>
          {tab === 'fila' && <OutboxTab />}
          {tab === 'templates' && <TemplatesTab />}
          {tab === 'email' && <EmailTab />}
          {tab === 'whatsapp' && <WhatsAppTab />}
          {tab === 'preferencias' && <PreferencesTab />}
          {tab === 'integracoes' && <IntegrationsTab />}
        </TabPanel>
      </div>
    </div>
  )
}
