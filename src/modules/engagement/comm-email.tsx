// Aba E-mail (Resend, simulado): remetente da plataforma, nome exibido, Reply-To, domínio próprio com SPF/DKIM/DMARC demonstrativo,
// logs, bounce/complaint e suppression list. Sem chave de API no navegador.
import { useState } from 'react'
import { Plus, RefreshCw, Trash2, Save } from 'lucide-react'
import { useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { Alert, Badge, Button, DataTable, Field, Input, Section, Select, SimBadge, useAction, useConfirm, type Column, type Tone } from '@/ui'
import { formatDateTime, nowISO } from '@/lib/dates'
import { uid } from '@/lib/util'
import { audit } from '@/data/repositories'
import { useActor } from '@/app/session'
import { PLATFORM_SENDER_DOMAIN, validateFrom } from './rules'
import { OutboxBadge, cssVars } from './ui'
import type { EmailDomain, Suppression } from './types'

const DOM_STATUS: Record<EmailDomain['status'], { label: string; tone: Tone }> = { nao_verificado: { label: 'Não verificado', tone: 'neutral' }, pendente: { label: 'Pendente', tone: 'warning' }, verificado: { label: 'Verificado', tone: 'success' }, falhou: { label: 'Falhou', tone: 'danger' } }
const SUP_REASON: Record<Suppression['reason'], string> = { bounce: 'Bounce', complaint: 'Complaint (spam)', manual: 'Manual', opt_out: 'Opt-out' }
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/i
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i

export function EmailTab() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const cfg = useCollection(t.tenantId, 'emailConfig')[0]
  const domains = useCollection(t.tenantId, 'emailDomains')
  const sups = useCollection(t.tenantId, 'suppressions')
  const outbox = useCollection(t.tenantId, 'outbox').filter((m) => m.channel === 'email')
  const canEdit = t.can('comunicacao', 'update')
  const canIntegrate = t.can('integracoes', 'update')
  const [d, setD] = useState(cfg ?? { id: 'main', tenantId: t.tenantId, createdAt: nowISO(), fromMode: 'plataforma' as const, fromLocal: 'contato', displayName: t.org.name, replyTo: t.org.contactEmail })
  const [newDomain, setNewDomain] = useState('')
  const [supAddr, setSupAddr] = useState('')
  const v = validateFrom(d, domains, t.org.slug)
  const tz = t.unit?.timezone

  const save = () => run(() => {
    if (!canEdit) throw new Error('Sem permissão.')
    if (!v.ok) throw new Error(v.errors[0])
    db.set(t.tenantId, 'emailConfig', [{ ...d, fromLocal: d.fromLocal.trim().toLowerCase(), updatedAt: nowISO() }])
    audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'email.remetente', resource: 'emailConfig', detail: v.header })
  }, 'Remetente salvo.')
  const addDomain = () => run(() => {
    const dn = newDomain.trim().toLowerCase()
    if (!DOMAIN_RE.test(dn)) throw new Error('Domínio inválido (ex.: suaclinica.com.br).')
    if (domains.some((x) => x.domain === dn)) throw new Error('Domínio já cadastrado.')
    db.insert(t.tenantId, 'emailDomains', { id: uid('dom_'), tenantId: t.tenantId, createdAt: nowISO(), domain: dn, status: 'nao_verificado', records: [{ kind: 'SPF', status: 'nao_verificado' }, { kind: 'DKIM', status: 'nao_verificado' }, { kind: 'DMARC', status: 'nao_verificado' }] })
    setNewDomain('')
  }, 'Domínio adicionado como “não verificado”.')
  /** Verificação demonstrativa: avança um passo por clique. Nunca gera valores DNS. */
  const check = (dm: EmailDomain) => run(() => {
    const next: EmailDomain['status'] = dm.status === 'nao_verificado' || dm.status === 'falhou' ? 'pendente' : dm.status === 'pendente' ? 'verificado' : 'verificado'
    db.update(t.tenantId, 'emailDomains', dm.id, { status: next, lastCheckAt: nowISO(), records: dm.records.map((r) => ({ ...r, status: next === 'verificado' ? 'verificado' : r.kind === 'SPF' ? 'verificado' : 'pendente' })) })
  }, 'Verificação simulada registrada.')
  const fail = (dm: EmailDomain) => run(() => {
    db.update(t.tenantId, 'emailDomains', dm.id, { status: 'falhou', lastCheckAt: nowISO(), records: dm.records.map((r) => ({ ...r, status: 'falhou' })) })
    if (d.fromMode === 'proprio' && d.customDomainId === dm.id) {
      const fallback = { ...d, fromMode: 'plataforma' as const, customDomainId: undefined }
      setD(fallback)
      db.set(t.tenantId, 'emailConfig', [fallback])
    }
  }, 'Falha de verificação simulada. Envios voltam ao remetente da plataforma.')
  const removeDomain = async (dm: EmailDomain) => {
    const r = await confirm({ title: `Remover ${dm.domain}?`, body: 'Se estiver em uso, o remetente volta para o domínio da plataforma.', danger: true, confirmLabel: 'Remover' })
    if (!r.ok) return
    run(() => {
      db.remove(t.tenantId, 'emailDomains', dm.id)
      if (d.customDomainId === dm.id) { const n = { ...d, fromMode: 'plataforma' as const, customDomainId: undefined }; setD(n); db.set(t.tenantId, 'emailConfig', [n]) }
    }, 'Domínio removido.')
  }
  const addSup = () => run(() => {
    const a = supAddr.trim().toLowerCase()
    if (!EMAIL_RE.test(a)) throw new Error('E-mail inválido.')
    if (sups.some((s) => s.address === a)) throw new Error('Endereço já suprimido.')
    db.insert(t.tenantId, 'suppressions', { id: uid('sup_'), tenantId: t.tenantId, createdAt: nowISO(), address: a, reason: 'manual', note: `Adicionado por ${actor.name}` })
    setSupAddr('')
  }, 'Endereço adicionado à suppression list.')
  const removeSup = async (s: Suppression) => {
    const r = await confirm({ title: `Remover ${s.address} da supressão?`, body: s.reason === 'complaint' ? 'Este endereço marcou mensagens como spam. Remova apenas com autorização expressa do titular.' : 'Envios voltarão a ser tentados para este endereço.', requireReason: true, danger: s.reason === 'complaint' })
    if (!r.ok) return
    run(() => { db.remove(t.tenantId, 'suppressions', s.id); audit(t.tenantId, { actorId: actor.id, actorName: actor.name, action: 'email.supressao.removida', resource: 'suppressions', detail: `${s.reason}: ${r.reason}` }) }, 'Endereço removido da supressão.')
  }

  const supCols: Column<Suppression>[] = [
    { id: 'a', header: 'Endereço', cell: (s) => s.address, value: (s) => s.address },
    { id: 'r', header: 'Motivo', cell: (s) => <Badge tone={s.reason === 'complaint' ? 'danger' : s.reason === 'bounce' ? 'warning' : 'neutral'}>{SUP_REASON[s.reason]}</Badge>, value: (s) => s.reason },
    { id: 'at', header: 'Desde', cell: (s) => formatDateTime(s.createdAt, tz), value: (s) => s.createdAt },
    { id: 'n', header: 'Observação', cell: (s) => s.note ?? '—' },
  ]

  return (
    <div className="stack">
      <div className="row"><SimBadge /><span className="small muted">Provedor: Resend (interface preparada; envio real somente no servidor futuro).</span></div>
      <div className="grid grid-2">
        <Section title="Remetente">
          <div className="stack">
            <Field label="Origem do remetente"><Select value={d.fromMode} disabled={!canEdit} onChange={(e) => setD({ ...d, fromMode: e.target.value as 'plataforma' | 'proprio' })}><option value="plataforma">Subdomínio verificado da plataforma (padrão)</option><option value="proprio">Domínio próprio da clínica</option></Select></Field>
            {d.fromMode === 'proprio' && <Field label="Domínio próprio" hint="Só domínios verificados podem ser usados no From."><Select value={d.customDomainId ?? ''} disabled={!canEdit} onChange={(e) => setD({ ...d, customDomainId: e.target.value || undefined })}><option value="">Selecione…</option>{domains.map((x) => <option key={x.id} value={x.id}>{x.domain} — {DOM_STATUS[x.status].label}</option>)}</Select></Field>}
            <div className="form-grid">
              <Field label="Parte local" hint={`@${d.fromMode === 'plataforma' ? `${t.org.slug}.${PLATFORM_SENDER_DOMAIN}` : domains.find((x) => x.id === d.customDomainId)?.domain ?? '…'}`}><Input value={d.fromLocal} disabled={!canEdit} onChange={(e) => setD({ ...d, fromLocal: e.target.value })} /></Field>
              <Field label="Nome exibido"><Input value={d.displayName} disabled={!canEdit} onChange={(e) => setD({ ...d, displayName: e.target.value })} /></Field>
            </div>
            <Field label="Reply-To (contato da clínica)" hint="Respostas do paciente vão para este endereço."><Input type="email" value={d.replyTo} disabled={!canEdit} onChange={(e) => setD({ ...d, replyTo: e.target.value })} /></Field>
            <div aria-live="polite">{v.ok ? <Alert tone="success" title="Cabeçalho From resultante"><span className="mono">{v.header}</span></Alert> : <Alert tone="danger" title="Envio bloqueado">{v.errors.map((e) => <div key={e}>{e}</div>)}</Alert>}</div>
            <Field label="Chave de API do Resend" hint="Configuração futura no servidor — segredos nunca ficam no navegador."><Input disabled placeholder="re_•••• (configuração futura no servidor)" /></Field>
            <div className="form-actions"><Button variant="primary" icon={<Save />} disabled={!canEdit || !v.ok} onClick={save}>Salvar remetente</Button></div>
          </div>
        </Section>
        <Section title="Domínio próprio (opcional)">
          <div className="stack">
            <Alert tone="info">Os registros SPF, DKIM e DMARC reais são retornados pelo provedor no momento da configuração. Esta tela mostra apenas estados demonstrativos — nenhum valor DNS é gerado aqui.</Alert>
            {domains.length === 0 && <p className="small muted">Nenhum domínio próprio. O envio usa o subdomínio verificado da plataforma.</p>}
            {domains.map((dm) => (
              <div key={dm.id} className="card tight stack" style={cssVars({ '--gap': '8px' })}>
                <div className="row between"><strong className="truncate">{dm.domain}</strong><Badge tone={DOM_STATUS[dm.status].tone}>{DOM_STATUS[dm.status].label}</Badge></div>
                <div className="table-wrap"><table className="table"><caption className="sr-only">Registros DNS de {dm.domain}</caption><thead><tr><th scope="col">Registro</th><th scope="col">Valor</th><th scope="col">Status</th></tr></thead>
                  <tbody>{dm.records.map((r) => <tr key={r.kind}><td className="strong">{r.kind}</td><td className="small muted">Informado pelo provedor na configuração</td><td><Badge tone={DOM_STATUS[r.status].tone}>{DOM_STATUS[r.status].label}</Badge></td></tr>)}</tbody></table></div>
                <span className="tiny muted">Última verificação: {dm.lastCheckAt ? formatDateTime(dm.lastCheckAt, tz) : 'nunca'}</span>
                <div className="row">
                  <Button size="sm" icon={<RefreshCw />} disabled={!canIntegrate || dm.status === 'verificado'} onClick={() => check(dm)}>Verificar (simulado)</Button>
                  <Button size="sm" disabled={!canIntegrate} onClick={() => fail(dm)}>Simular falha</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 />} disabled={!canIntegrate} onClick={() => removeDomain(dm)}>Remover</Button>
                </div>
              </div>
            ))}
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="grow"><Field label="Adicionar domínio"><Input value={newDomain} disabled={!canIntegrate} onChange={(e) => setNewDomain(e.target.value)} placeholder="suaclinica.exemplo" /></Field></div>
              <Button icon={<Plus />} disabled={!canIntegrate} onClick={addDomain}>Adicionar</Button>
            </div>
            {!canIntegrate && <p className="small muted">Gerenciar domínios exige permissão de integrações.</p>}
          </div>
        </Section>
      </div>
      <Section title="Suppression list (não enviar)">
        <div className="stack">
          <p className="small muted">Bounces permanentes e complaints entram automaticamente. Envios para estes endereços ficam “suprimidos”.</p>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="grow"><Field label="Suprimir endereço"><Input type="email" value={supAddr} disabled={!canEdit} onChange={(e) => setSupAddr(e.target.value)} placeholder="pessoa@exemplo.test" /></Field></div>
            <Button icon={<Plus />} disabled={!canEdit} onClick={addSup}>Adicionar</Button>
          </div>
          <DataTable caption="Endereços suprimidos" rows={sups} columns={supCols} rowKey={(s) => s.id} rowActions={(s) => <Button size="sm" variant="ghost" icon={<Trash2 />} disabled={!canEdit} onClick={() => removeSup(s)}>Remover</Button>} />
        </div>
      </Section>
      <Section title="Logs de envio de e-mail">
        <DataTable caption="Logs de envio de e-mail" rows={[...outbox].sort((a, b) => b.createdAt.localeCompare(a.createdAt))} rowKey={(m) => m.id} pageSize={10} columns={[
          { id: 's', header: 'Assunto', cell: (m) => m.subject, value: (m) => m.subject },
          { id: 'r', header: 'Destinatário', cell: (m) => m.recipientName },
          { id: 'st', header: 'Status', cell: (m) => <OutboxBadge status={m.status} />, value: (m) => m.status },
          { id: 'l', header: 'Último registro', cell: (m) => <span className="small">{m.attempts[m.attempts.length - 1]?.result ?? '—'}</span> },
          { id: 'at', header: 'Data', cell: (m) => formatDateTime(m.createdAt, tz), value: (m) => m.createdAt },
        ]} />
      </Section>
    </div>
  )
}
