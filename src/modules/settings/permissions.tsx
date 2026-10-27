// Matriz visual de permissões e simulação de perfil ("Visualizar como").
// Demonstração de UI — não é controle de acesso real (produção: RLS e autorização no servidor).
import { useState } from 'react'
import { getSession, setSession, useTenant } from '@/app/session'
import { useCollection } from '@/data/store'
import {
  MATRIX,
  TENANT_ROLE_LABEL,
  type Action,
  type Resource,
} from '@/domain/permissions'
import { MODULE_LABEL, type ModuleKey, type TenantRole } from '@/domain/types'
import { Alert, Badge, Button, PageHeader, Section, Select, Tabs, TabPanel } from '@/ui'
import { planOf } from './lib'

const ACTIONS: Action[] = ['read', 'create', 'update', 'delete', 'approve', 'export']
const ACTION_LABEL: Record<Action, string> = {
  read: 'Ler',
  create: 'Criar',
  update: 'Editar',
  delete: 'Excluir',
  approve: 'Aprovar',
  export: 'Exportar',
}

const RESOURCES: { key: Resource; label: string; module?: ModuleKey }[] = [
  { key: 'agenda', label: 'Agenda', module: 'agenda' },
  { key: 'recepcao', label: 'Recepção', module: 'recepcao' },
  { key: 'pacientes', label: 'Pacientes', module: 'pacientes' },
  { key: 'clinical', label: 'Prontuário geral', module: 'prontuario' },
  { key: 'clinical_restricted', label: 'Prontuário restrito (Psico)', module: 'psicologia' },
  { key: 'documentos', label: 'Documentos', module: 'documentos' },
  { key: 'arquivos', label: 'Arquivos / Imagens', module: 'documentos' },
  { key: 'orcamentos', label: 'Orçamentos / Propostas', module: 'orcamentos' },
  { key: 'crm', label: 'CRM / Leads', module: 'crm' },
  { key: 'financeiro', label: 'Financeiro', module: 'financeiro' },
  { key: 'caixa', label: 'Caixa da recepção', module: 'financeiro' },
  { key: 'comissoes', label: 'Comissões', module: 'comissoes' },
  { key: 'estoque', label: 'Estoque', module: 'estoque' },
  { key: 'compras', label: 'Compras', module: 'compras' },
  { key: 'relatorios', label: 'Relatórios', module: 'relatorios' },
  { key: 'configuracoes', label: 'Configurações' },
  { key: 'equipe', label: 'Equipe e Usuários' },
  { key: 'comunicacao', label: 'Comunicação', module: 'comunicacao' },
  { key: 'automacoes', label: 'Automações', module: 'automacoes' },
  { key: 'ia', label: 'IA assistente', module: 'ia' },
  { key: 'importacao', label: 'Importador', module: 'importacao' },
  { key: 'auditoria', label: 'Auditoria' },
  { key: 'marca', label: 'Marca e PWA', module: 'pwa' },
]

export function PermissionsPage() {
  const t = useTenant()
  const staff = useCollection(t.tenantId, 'staff')
  const plan = planOf(t.org)
  const [tab, setTab] = useState<'matriz' | 'usuarios' | 'camadas'>('matriz')
  const [selectedRole, setSelectedRole] = useState<TenantRole>('clinic_owner')

  const roles = Object.keys(TENANT_ROLE_LABEL) as TenantRole[]

  const canViewAs = t.can('equipe', 'update') && !t.viewingAs
  const handleSimulate = (userId: string) => {
    if (!canViewAs) return
    const s = getSession()
    if (s?.kind === 'staff') {
      setSession({ ...s, viewAs: { userId } })
    }
  }

  const handleClearSimulation = () => {
    const s = getSession()
    if (s?.kind === 'staff') {
      setSession({ ...s, viewAs: undefined })
    }
  }

  return (
    <div className="stack" data-tour="page-content">
      <PageHeader
        title="Matriz de permissões e controle de acesso"
        subtitle={`Regras operacionais demonstrativas · ${t.org.name}`}
      />

      <Alert tone="neutral" title="Demonstração de interface de segurança">
        Esta matriz organiza a interface e simula os papéis clínicos da equipe. No navegador, isto demonstra como a navegação e ações se adaptam a cada perfil. Segurança real contra invasão requer autorização rigorosa no backend e políticas RLS no banco de dados.
      </Alert>

      <div className="grid grid-4">
        {[['Recurso', 'O que é acessado: agenda, prontuário, financeiro…'], ['Ação', 'Ler, criar, editar, excluir, aprovar ou exportar.'], ['Unidade', 'Vínculo vale para todas as unidades ou só para as listadas.'], ['Vínculo', '“Próprio” limita a registros do profissional vinculado ao usuário.']].map(([k, v]) => (
          <div key={k} className="card tight"><strong>{k}</strong><p className="small muted">{v}</p></div>
        ))}
      </div>

      {t.viewingAs && (
        <Alert tone="warning" title={`Simulação ativa: ${t.effectiveUser?.name}`}>
          <span>Você está visualizando a interface com os privilégios deste perfil.</span>
          <div style={{ marginTop: 8 }}>
            <Button size="sm" onClick={handleClearSimulation}>
              Encerrar simulação
            </Button>
          </div>
        </Alert>
      )}

      <Tabs
        label="Navegação de permissões"
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: 'matriz', label: 'Matriz por papel' },
          { id: 'usuarios', label: 'Usuários & Simulação ("Visualizar como")' },
          { id: 'camadas', label: 'Feature Flag × Plano × Permissão' },
        ]}
      />

      {/* ABA MATRIZ */}
      {tab === 'matriz' && (
        <TabPanel>
          <div className="stack" style={{ gap: 16 }}>
            <div className="row between">
              <div className="row">
                <label htmlFor="role-select" className="strong small">Filtrar papel:</label>
                <Select id="role-select" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as TenantRole)}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {TENANT_ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="legend">
                <span><span className="st-grant all">Sim</span> Permitido em todas as unidades com acesso</span>
                <span><span className="st-grant own">Próprio</span> Somente registros vinculados ao profissional</span>
                <span><span className="st-grant none">—</span> Sem acesso</span>
              </div>
            </div>

            <div className="scroll-x" tabIndex={0} role="region" aria-label="Matriz de permissões (role horizontalmente no celular)">
              <table className="table st-matrix">
                <caption className="sr-only">Matriz de autorizações do papel {TENANT_ROLE_LABEL[selectedRole]} por recurso e ação</caption>
                <thead>
                  <tr>
                    <th scope="col">Recurso do sistema</th>
                    {ACTIONS.map((a) => (
                      <th key={a} scope="col">{ACTION_LABEL[a]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RESOURCES.map((res) => {
                    const roleGrants = MATRIX[selectedRole]?.[res.key]
                    return (
                      <tr key={res.key}>
                        <td>
                          <strong>{res.label}</strong>
                          {res.module && !t.moduleOn(res.module) && (
                            <> <Badge tone="neutral">módulo inativo</Badge></>
                          )}
                        </td>
                        {ACTIONS.map((a) => {
                          const g = roleGrants?.[a]
                          if (g === true) return <td key={a}><span className="st-grant all">Sim</span></td>
                          if (g === 'own') return <td key={a}><span className="st-grant own">Próprio</span></td>
                          return <td key={a}><span className="st-grant none">—</span></td>
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabPanel>
      )}

      {/* ABA USUARIOS & SIMULAÇÃO */}
      {tab === 'usuarios' && (
        <TabPanel>
          <div className="stack" style={{ gap: 16 }}>
            <Section title="Usuários por papel">
              <ul className="st-checklist">
                {roles.map((r) => {
                  const us = staff.filter((u) => u.active && u.memberships.some((m) => m.role === r))
                  return <li key={r}><strong style={{ minWidth: 180 }}>{TENANT_ROLE_LABEL[r]}</strong><span className="small grow">{us.length ? us.map((u) => u.name).join(', ') : <span className="muted">Nenhum usuário</span>}</span><Badge>{us.length}</Badge></li>
                })}
              </ul>
            </Section>
            <Section title="Membros da equipe e vínculos operacionais">
              <p className="small muted">
                Teste como outro colaborador enxerga o sistema. Clique em &ldquo;Visualizar como&rdquo; para simular o papel daquele usuário em tempo real.
              </p>
              <div className="scroll-x" style={{ marginTop: 12 }}>
                <table className="table">
                  <caption className="sr-only">Usuários cadastrados e botão de simulação</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nome</th>
                      <th scope="col">E-mail</th>
                      <th scope="col">Papéis atribuídos</th>
                      <th scope="col">Unidades</th>
                      <th scope="col" className="right">Simulação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((u) => {
                      const isCurrent = t.effectiveUser?.id === u.id
                      return (
                        <tr key={u.id}>
                          <td><strong>{u.name}</strong></td>
                          <td className="small muted">{u.email}</td>
                          <td>
                            <div className="row" style={{ gap: 4 }}>
                              {u.memberships.map((m, i) => (
                                <Badge key={i} tone="brand">{TENANT_ROLE_LABEL[m.role]}</Badge>
                              ))}
                            </div>
                          </td>
                          <td className="small">
                            {u.memberships.map((m) => m.unitIds === 'all' ? 'Todas as unidades' : m.unitIds.map((uid) => t.units.find((unit) => unit.id === uid)?.name ?? uid).join(', ')).join(' · ')}{u.professionalId && <div className="tiny muted">Vínculo profissional: registros próprios</div>}
                          </td>
                          <td className="right">
                            {isCurrent ? (
                              <Badge tone="success">Ativo agora</Badge>
                            ) : !canViewAs ? (
                              <span className="tiny muted">Requer permissão de editar equipe</span>
                            ) : (
                              <Button size="sm" onClick={() => handleSimulate(u.id)}>
                                Visualizar como
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        </TabPanel>
      )}

      {/* ABA CAMADAS: Feature Flag vs Plano vs Permissão */}
      {tab === 'camadas' && (
        <TabPanel>
          <div className="stack" style={{ gap: 16 }}>
            <Alert tone="info" title="Separar: Módulo (Org) × Limite (Plano) × Permissão (Usuário)">
              No Qlinic, um recurso só é plenamente utilizável quando as três camadas concordam:
              <ol style={{ paddingLeft: 20, margin: '8px 0 0' }}>
                <li><strong>Feature Flag (Módulo)</strong>: a clínica habilitou o módulo em suas configurações;</li>
                <li><strong>Limite do Plano</strong>: o plano contratado cobre o módulo ou a cota de uso (ex.: cota de profissionais);</li>
                <li><strong>Permissão do Usuário</strong>: o papel do colaborador autoriza aquela ação na unidade correspondente.</li>
              </ol>
            </Alert>

            <Section title={`Diagnóstico de camadas para ${t.org.name} (Plano: ${plan?.name ?? 'Personalizado'})`}>
              <div className="scroll-x">
                <table className="table">
                  <caption className="sr-only">Camadas de acesso por módulo</caption>
                  <thead>
                    <tr>
                      <th scope="col">Módulo / Recurso</th>
                      <th scope="col">Habilitado na clínica?</th>
                      <th scope="col">Incluso no plano {plan?.name}?</th>
                      <th scope="col">Papéis com leitura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(MODULE_LABEL) as ModuleKey[]).map((m) => {
                      const enabledInOrg = t.moduleOn(m)
                      const includedInPlan = !plan || plan.modules.includes(m)
                      return (
                        <tr key={m}>
                          <td><strong>{MODULE_LABEL[m]}</strong></td>
                          <td>
                            {enabledInOrg ? (
                              <Badge tone="success">Habilitado</Badge>
                            ) : (
                              <Badge tone="neutral">Desativado</Badge>
                            )}
                          </td>
                          <td>
                            {includedInPlan ? (
                              <span className="small">Incluso</span>
                            ) : (
                              <Badge tone="warning">Requer Upgrade</Badge>
                            )}
                          </td>
                          <td className="small">
                            {(() => {
                              const res = RESOURCES.find((r) => r.module === m)
                              if (!res) return <span className="muted">Coberto pelo recurso do módulo-base</span>
                              const rs = roles.filter((r) => MATRIX[r][res.key]?.read)
                              return rs.length ? rs.map((r) => TENANT_ROLE_LABEL[r]).join(', ') : <span className="muted">Nenhum papel</span>
                            })()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        </TabPanel>
      )}
    </div>
  )
}
