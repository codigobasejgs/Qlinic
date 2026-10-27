// Suporte: chamados com SLA e acesso assistido (motivo, escopo, prazo, AUTORIZAÇÃO da clínica, expiração, revogação).
import { useEffect, useState } from 'react'
import { Plus, ShieldAlert } from 'lucide-react'
import { usePlatformCollection } from '@/data/store'
import type { SupportTicket } from '@/domain/platform'
import { Alert, Badge, Button, EmptyState, Field, Input, PageHeader, Section, Select, SimBadge, Textarea, Timeline } from '@/ui/core'
import { Dialog, useAction, useConfirm } from '@/ui/overlay'
import { DataTable, type Column } from '@/ui/table'
import { formatDateTime } from '@/lib/dates'
import { slaState } from './metrics'
import { addFakeAttachment, addTicketMessage, clinicDecision, createTicket, expireAssistedAccess, requestAssistedAccess, revokeAssistedAccess, setTicketAssignee, setTicketPriority, setTicketSla, setTicketStatus } from './actions'
import { DEFAULT_SLA, Guard, PRIORITY, TICKET_STATUS, formatDuration, usePlatformMe } from './lib'

type Scope = NonNullable<SupportTicket['assistedAccess']>['scope']
const SCOPE_LABEL: Record<Scope, string> = { configuracoes: 'Configurações da clínica', agenda: 'Agenda (sem prontuário)', financeiro: 'Financeiro da clínica (sem dados clínicos)' }
const AA_STATUS: Record<NonNullable<SupportTicket['assistedAccess']>['status'], [string, 'info' | 'warning' | 'success' | 'neutral' | 'danger']> = {
  solicitado: ['Aguardando autorização da clínica', 'info'], autorizado: ['Ativo', 'warning'], negado: ['Negado pela clínica', 'neutral'], expirado: ['Expirado', 'neutral'], revogado: ['Revogado', 'neutral'],
}

function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

export function SupportPage() {
  return <Guard area="suporte" title="Suporte"><Support /></Guard>
}
function Support() {
  const tickets = usePlatformCollection('tickets')
  const orgs = usePlatformCollection('organizations')
  const users = usePlatformCollection('platformUsers')
  const me = usePlatformMe()
  const now = useNow()
  const [f, setF] = useState({ status: 'abertos', priority: '', assignee: '' })
  const [sel, setSel] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const name = (id: string) => orgs.find((o) => o.id === id)?.name ?? id
  const rows = tickets.filter((t) => (f.status === 'abertos' ? t.status !== 'resolvido' && t.status !== 'fechado' : !f.status || t.status === f.status) && (!f.priority || t.priority === f.priority) && (!f.assignee || (f.assignee === '__none' ? !t.assigneeId : t.assigneeId === f.assignee)))
    .sort((a, b) => slaState(a, now).remainingMs - slaState(b, now).remainingMs)
  const active = tickets.filter((t) => t.assistedAccess?.status === 'autorizado')
  const cols: Column<SupportTicket>[] = [
    { id: 'n', header: 'Chamado', cell: (t) => <span className="stack" style={{ '--gap': '0' } as React.CSSProperties}><span className="strong">{t.number} — {t.subject}</span><span className="tiny muted">{name(t.tenantId)}</span></span>, value: (t) => t.number },
    { id: 'p', header: 'Prioridade', cell: (t) => <Badge tone={PRIORITY[t.priority][1]}>{PRIORITY[t.priority][0]}</Badge>, value: (t) => ['baixa', 'media', 'alta', 'critica'].indexOf(t.priority) },
    { id: 's', header: 'Status', cell: (t) => <Badge tone={TICKET_STATUS[t.status][1]}>{TICKET_STATUS[t.status][0]}</Badge>, value: (t) => t.status },
    { id: 'sla', header: 'SLA', cell: (t) => <SlaBadge t={t} now={now} />, value: (t) => slaState(t, now).remainingMs },
    { id: 'r', header: 'Responsável', cell: (t) => users.find((u) => u.id === t.assigneeId)?.name ?? '—', value: (t) => t.assigneeId ?? '' },
    { id: 'a', header: 'Acesso assistido', cell: (t) => (t.assistedAccess ? <Badge tone={AA_STATUS[t.assistedAccess.status][1]}>{AA_STATUS[t.assistedAccess.status][0]}</Badge> : '—') },
  ]
  const current = tickets.find((t) => t.id === sel)
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Suporte" subtitle="Chamados das clínicas. O suporte nunca recebe leitura automática de prontuários; acesso assistido exige autorização da clínica."
        actions={<Button variant="primary" icon={<Plus />} data-tour="primary-action" onClick={() => setCreating(true)}>Novo chamado</Button>} />
      {active.length > 0 && (
        <Alert tone="warning" title={`${active.length} acesso(s) assistido(s) ativo(s)`}>
          {active.map((t) => <span key={t.id} className="row">{t.number} · {name(t.tenantId)} · {SCOPE_LABEL[t.assistedAccess!.scope]} · expira em {formatDuration(new Date(t.assistedAccess!.expiresAt!).getTime() - now)}</span>)}
        </Alert>
      )}
      <div className="form-grid" role="search" aria-label="Filtros de chamados">
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="abertos">Em aberto</option><option value="">Todos</option>{Object.entries(TICKET_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Prioridade"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">Todas</option>{Object.entries(PRIORITY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Responsável"><Select value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}><option value="">Todos</option><option value="__none">Sem responsável</option>{users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
      </div>
      <DataTable caption="Chamados de suporte" rows={rows} columns={cols} rowKey={(t) => t.id} onRowClick={(t) => setSel(t.id)} empty={<EmptyState title="Nenhum chamado nesta visão" />} />
      {creating && <NewTicketDialog onClose={() => setCreating(false)} onCreated={(id) => setSel(id)} />}
      {current && <TicketDrawer t={current} onClose={() => setSel(null)} now={now} orgName={name(current.tenantId)} meId={me.userId} />}
    </div>
  )
}

function SlaBadge({ t, now }: { t: SupportTicket; now: number }) {
  const s = slaState(t, now)
  if (s.closed) return <span className="small muted">encerrado</span>
  if (s.breached) return <Badge tone="danger">estourado há {formatDuration(s.remainingMs)}</Badge>
  return <Badge tone={s.remainingMs < 0.25 * t.slaHours * 3600000 ? 'warning' : 'neutral'}>{formatDuration(s.remainingMs)} restantes</Badge>
}

function NewTicketDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const orgs = usePlatformCollection('organizations')
  const me = usePlatformMe()
  const run = useAction()
  const [f, setF] = useState({ tenantId: orgs[0]?.id ?? '', subject: '', description: '', priority: 'media' as SupportTicket['priority'], slaHours: String(DEFAULT_SLA.media) })
  return (
    <Dialog open onClose={onClose} title="Novo chamado" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => { let id = ''; if (run(() => { id = createTicket({ ...f, slaHours: Number(f.slaHours) }, me.actor).id }, 'Chamado aberto.')) { onClose(); onCreated(id) } }}>Abrir chamado</Button></>}>
      <div className="stack">
        <Field label="Contratante" required><Select value={f.tenantId} onChange={(e) => setF({ ...f, tenantId: e.target.value })}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label="Assunto" required><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label="Descrição" hint="Não inclua dados de pacientes."><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} /></Field>
        <div className="form-grid">
          <Field label="Prioridade"><Select value={f.priority} onChange={(e) => { const p = e.target.value as SupportTicket['priority']; setF({ ...f, priority: p, slaHours: String(DEFAULT_SLA[p]) }) }}>{Object.entries(PRIORITY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="SLA (horas)" hint="Padrão pela prioridade; editável."><Input type="number" min={1} max={720} value={f.slaHours} onChange={(e) => setF({ ...f, slaHours: e.target.value })} /></Field>
        </div>
      </div>
    </Dialog>
  )
}

function TicketDrawer({ t, onClose, now, orgName, meId }: { t: SupportTicket; onClose: () => void; now: number; orgName: string; meId: string }) {
  const users = usePlatformCollection('platformUsers')
  const me = usePlatformMe()
  const run = useAction()
  const confirm = useConfirm()
  const [msg, setMsg] = useState('')
  const [att, setAtt] = useState('')
  const [sla, setSla] = useState(String(t.slaHours))
  const [aa, setAa] = useState({ reason: '', scope: 'configuracoes' as Scope, hours: '4' })
  const access = t.assistedAccess
  const expired = access?.status === 'autorizado' && access.expiresAt && new Date(access.expiresAt).getTime() <= now
  useEffect(() => { if (expired) run(() => expireAssistedAccess(t.id, me.actor), 'Acesso assistido expirou e foi encerrado.') }, [expired, t.id, me.actor, run])
  return (
    <Dialog open drawer size="lg" onClose={onClose} title={`${t.number} — ${t.subject}`} description={`${orgName} · aberto em ${formatDateTime(t.createdAt)}`}>
      <div className="stack">
        {access?.status === 'autorizado' && (
          <div className="alert warning pl-assisted-on" role="status"><ShieldAlert aria-hidden="true" /><div className="alert-body"><strong>Acesso assistido ATIVO — {SCOPE_LABEL[access.scope]}</strong><span>Autorizado por {access.authorizedBy}. Expira em {formatDuration(new Date(access.expiresAt!).getTime() - now)} ({formatDateTime(access.expiresAt!)}). Toda ação fica registrada. Prontuários e documentos clínicos permanecem fora do escopo.</span></div></div>
        )}
        <div className="form-grid">
          <Field label="Status"><Select value={t.status} onChange={(e) => run(() => setTicketStatus(t.id, e.target.value as SupportTicket['status'], me.actor), 'Status atualizado.')}>{Object.entries(TICKET_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Prioridade"><Select value={t.priority} onChange={(e) => run(() => setTicketPriority(t.id, e.target.value as SupportTicket['priority'], me.actor), 'Prioridade atualizada.')}>{Object.entries(PRIORITY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Responsável"><Select value={t.assigneeId ?? ''} onChange={(e) => run(() => setTicketAssignee(t.id, e.target.value || undefined, me.actor), 'Responsável atualizado.')}><option value="">Sem responsável</option>{users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === meId ? ' (você)' : ''}</option>)}</Select></Field>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="SLA (horas)" className="grow"><Input type="number" min={1} max={720} value={sla} onChange={(e) => setSla(e.target.value)} /></Field>
            <Button onClick={() => run(() => setTicketSla(t.id, Number(sla), me.actor), 'SLA atualizado.')}>Salvar</Button>
          </div>
        </div>
        <p className="small">SLA: <SlaBadge t={t} now={now} /> · prazo {formatDateTime(new Date(slaState(t, now).deadline).toISOString())}</p>

        <Section title="Mensagens">
          <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties} aria-live="polite">
            {t.messages.map((m, i) => <div key={i} className={`pl-msg ${m.from}`}><div className="tiny muted">{m.author} · {formatDateTime(m.at)}</div>{m.text}</div>)}
          </div>
          <Field label="Responder" hint="Não inclua dados de pacientes."><Textarea rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => run(() => { addTicketMessage(t.id, 'cliente', msg, me.actor); setMsg('') }, 'Resposta da clínica simulada.')}>Simular resposta da clínica</Button>
            <Button variant="primary" onClick={() => run(() => { addTicketMessage(t.id, 'suporte', msg, me.actor); setMsg('') }, 'Mensagem enviada (simulado).')}>Enviar resposta</Button>
          </div>
        </Section>

        <Section title="Anexos (fictícios)">
          {t.attachments.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{t.attachments.map((a, i) => <li key={i}>{a.name} · {a.sizeKb} KB</li>)}</ul> : <p className="small muted">Sem anexos.</p>}
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Nome do anexo fictício" className="grow" hint="Nenhum arquivo é enviado; registra só o nome."><Input value={att} onChange={(e) => setAtt(e.target.value)} placeholder="captura-erro.png" /></Field>
            <Button onClick={() => run(() => { addFakeAttachment(t.id, att, me.actor); setAtt('') }, 'Anexo fictício registrado.')}>Adicionar</Button>
          </div>
        </Section>

        <Section title="Acesso assistido">
          <div className="stack">
            <p className="small">Fluxo: suporte solicita com motivo, escopo e prazo → a <strong>clínica</strong> autoriza no ambiente dela → acesso ativo com indicação visível até expirar ou ser revogado. Tudo registrado na auditoria. Sem leitura de prontuário em nenhum escopo.</p>
            {access && (
              <Timeline items={[
                { time: formatDateTime(access.requestedAt), title: `Solicitado por ${access.requestedBy}`, body: `${SCOPE_LABEL[access.scope]} — ${access.reason}` },
                ...(access.status !== 'solicitado' ? [{ time: access.expiresAt ? `até ${formatDateTime(access.expiresAt)}` : '—', title: AA_STATUS[access.status][0], body: access.authorizedBy }] : []),
              ]} />
            )}
            {(!access || ['negado', 'expirado', 'revogado'].includes(access.status)) && (
              <fieldset><legend>Solicitar acesso</legend>
                <div className="form-grid">
                  <Field label="Escopo"><Select value={aa.scope} onChange={(e) => setAa({ ...aa, scope: e.target.value as Scope })}>{Object.entries(SCOPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                  <Field label="Prazo (horas)" hint="1 a 72."><Input type="number" min={1} max={72} value={aa.hours} onChange={(e) => setAa({ ...aa, hours: e.target.value })} /></Field>
                </div>
                <Field label="Motivo" required hint="Mínimo 10 caracteres."><Textarea rows={2} value={aa.reason} onChange={(e) => setAa({ ...aa, reason: e.target.value })} /></Field>
                <div className="form-actions"><Button variant="primary" onClick={() => run(() => requestAssistedAccess(t.id, { reason: aa.reason, scope: aa.scope, hours: Number(aa.hours) }, me.actor), 'Solicitação enviada à clínica (simulado). Aguardando autorização.')}>Solicitar acesso assistido</Button></div>
              </fieldset>
            )}
            {access?.status === 'solicitado' && (
              <div className="pl-clinic-panel stack" role="region" aria-label="Painel simulado da clínica">
                <div className="row between"><strong>Painel da clínica — {orgName}</strong><SimBadge>Simulação do lado da clínica</SimBadge></div>
                <p className="small">Em produção, esta decisão é tomada pelo proprietário da clínica, autenticado no ambiente dela — nunca pelo suporte. Aqui o botão apenas demonstra o fluxo.</p>
                <p className="small"><strong>Pedido:</strong> {SCOPE_LABEL[access.scope]} · prazo até {access.expiresAt ? formatDuration(new Date(access.expiresAt).getTime() - new Date(access.requestedAt).getTime()) : '4h'} após autorizar · {access.reason}</p>
                <div className="row">
                  <Button variant="primary" onClick={() => run(() => clinicDecision(t.id, true, me.actor), 'Clínica autorizou (simulado). Acesso ativo com expiração.')}>Clínica autorizou</Button>
                  <Button onClick={() => run(() => clinicDecision(t.id, false, me.actor), 'Clínica negou (simulado).')}>Clínica negou</Button>
                </div>
              </div>
            )}
            {access?.status === 'autorizado' && <div className="row"><Button variant="danger" onClick={async () => { const r = await confirm({ title: 'Revogar acesso assistido?', body: 'O acesso é encerrado imediatamente e registrado.', danger: true, confirmLabel: 'Revogar' }); if (r.ok) run(() => revokeAssistedAccess(t.id, me.actor), 'Acesso revogado.') }}>Revogar agora</Button></div>}
          </div>
        </Section>
      </div>
    </Dialog>
  )
}
