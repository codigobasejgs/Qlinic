import { useState } from 'react'
import { useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { QRCode } from '@/modules/scheduling/qr'
import { Alert, Badge, Button, Field, Input, Section, Select, SimBadge, Textarea, Timeline, useAction } from '@/ui'
import { formatDateTime, nowISO } from '@/lib/dates'
import { uid } from '@/lib/util'
import { createHandoff } from './engine'
import { detectInjection } from './rules'
import { IntegrationBadge } from './ui'
import { updateIntegration } from './comm-integrations'

export function WhatsAppTab() {
  const t = useTenant()
  const run = useAction()
  const integrations = useCollection(t.tenantId, 'clinicIntegrations')
  const conversations = useCollection(t.tenantId, 'waConversations')
  const staff = useCollection(t.tenantId, 'staff').filter((s) => s.active)
  const tasks = useCollection(t.tenantId, 'handoffTasks')
  const evo = integrations.find((i) => i.provider === 'evolution')
  const [id, setId] = useState(conversations[0]?.id ?? '')
  const [text, setText] = useState('')
  const [assignee, setAssignee] = useState(staff.find((s) => s.memberships.some((m) => m.role === 'reception'))?.id ?? '')
  const [qr, setQr] = useState(false)
  const c = conversations.find((x) => x.id === id)
  const edit = t.can('comunicacao', 'create')
  const connect = t.can('integracoes', 'update')
  const reply = () => run(() => {
    if (!edit || !c) throw new Error('Sem permissão ou conversa selecionada.')
    if (!text.trim()) throw new Error('Escreva uma resposta.')
    if (!evo || !['simulada', 'conectada', 'degradada'].includes(evo.status)) throw new Error('Instância desconectada. Reconecte antes de responder.')
    db.update(t.tenantId, 'waConversations', c.id, { unread: 0, messages: [...c.messages, { id: uid('wam_'), at: nowISO(), from: 'clinica', author: t.effectiveUser?.name, text: text.trim().slice(0, 2000), status: 'aceito_provedor' }] })
    setText('')
  }, 'Resposta aceita pelo adapter simulado. Entrega não confirmada.')
  const handoff = () => run(() => {
    const s = staff.find((x) => x.id === assignee)
    if (!edit || !c || !s) throw new Error('Selecione conversa e responsável.')
    const current = tasks.find((x) => x.conversationId === c.id && x.status !== 'concluida')
    const task = current ?? createHandoff(t.tenantId, { source: 'whatsapp', priority: 'normal', reason: 'Solicitação de atendimento humano.', name: c.name, personRef: c.personRef, conversationId: c.id })
    db.update(t.tenantId, 'handoffTasks', task.id, { status: 'em_andamento', assigneeId: s.id, assigneeName: s.name })
    db.update(t.tenantId, 'waConversations', c.id, { status: 'em_atendimento_humano', handoff: { toId: s.id, toName: s.name, at: nowISO(), reason: 'Transferência manual' }, messages: [...c.messages, { id: uid('wam_'), at: nowISO(), from: 'sistema', text: `Conversa transferida para ${s.name}.` }] })
  }, 'Conversa transferida; tarefa atribuída ao responsável.')
  return <div className="stack">
    <Alert title="Evolution API — transporte demonstrativo">Modo/transporte Evolution ≠ API oficial Meta. Não há garantia de transporte oficial para qualquer instalação. Nenhum WhatsApp real está conectado.</Alert>
    <SimBadge />
    <Section title="Instância por clínica" actions={evo && <IntegrationBadge status={evo.status} />}><div className="stack">
      <div className="form-grid"><Field label="URL do adapter"><Input disabled placeholder="https://evolution.exemplo.test (servidor futuro)" /></Field><Field label="Identificação da instância"><Input disabled value={evo?.instanceLabel ?? `instancia-${t.org.slug}`} /></Field><Field label="Credencial"><Input disabled placeholder="configuração futura no servidor" /></Field></div>
      {evo?.status === 'erro' && <Alert tone="danger">Sessão desconectada. Reconecte usando o QR demonstrativo.</Alert>}
      <div className="row"><Button disabled={!connect || !evo} onClick={() => run(() => { if (!evo) return; updateIntegration(t.tenantId, evo, 'configurando', 'Reconexão solicitada; QR demonstrativo gerado.'); setQr(true) }, 'QR demonstrativo gerado.')}>Reconectar</Button>{qr && <Button disabled={!connect || !evo} onClick={() => run(() => { if (!evo) return; updateIntegration(t.tenantId, evo, 'simulada', 'Leitura do QR simulada; conexão fictícia estabelecida.'); setQr(false) }, 'Instância simulada conectada.')}>Simular leitura do QR</Button>}</div>
      {qr && <div className="eng-qr"><QRCode value="QLINIC-EVOLUTION-DEMO" label="QR demonstrativo, sem conexão real com WhatsApp" size={160} /><strong>QR DEMONSTRATIVO — não conecta aparelho</strong></div>}
      {!connect && <p className="small muted">Gerenciar a conexão exige permissão de integrações.</p>}
    </div></Section>
    <div className="eng-inbox">
      <Section title="Conversas"><div className="stack">{conversations.map((x) => <Button key={x.id} className="eng-conversation" aria-pressed={x.id === id} onClick={() => { setId(x.id); setText('') }}><span>{x.name}<small>{x.phoneMasked} · {x.status.replaceAll('_', ' ')}</small></span>{x.unread > 0 && <Badge>{x.unread}</Badge>}</Button>)}</div></Section>
      <Section title={c?.name ?? 'Selecione uma conversa'}>{c ? <div className="stack">
        {c.handoff && <Alert tone="neutral">Responsável: {c.handoff.toName} · desde {formatDateTime(c.handoff.at, t.org.timezone)}</Alert>}
        <div className="eng-messages" role="log" aria-label="Histórico da conversa" aria-live="polite">{c.messages.map((m) => <article key={m.id} className={`eng-bubble ${m.from === 'clinica' ? 'out' : ''}`}><strong className="small">{m.from === 'contato' ? c.name : m.author ?? (m.from === 'sistema' ? 'Sistema' : 'Clínica')}</strong><p>{m.text}</p>{m.media && <div className="muted-surface small">Mídia fictícia: {m.media.kind} · {m.media.name}<br />Sem arquivo real; anexos são conteúdo não confiável.</div>}{detectInjection(m.text).suspicious && <Alert tone="warning">Instruções na mensagem tratadas como conteúdo, nunca executadas.</Alert>}<span className="tiny muted">{formatDateTime(m.at, t.org.timezone)}{m.status && ` · ${m.status === 'aceito_provedor' ? 'aceito pelo provedor (simulado)' : 'falhou'}`}</span></article>)}</div>
        <Field label="Resposta (somente dados fictícios)"><Textarea maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} disabled={!edit} /></Field><Button variant="primary" disabled={!edit} onClick={reply}>Responder (simulado)</Button>
        <Field label="Responsável pelo atendimento humano"><Select value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Selecione…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field><Button disabled={!edit} onClick={handoff}>Transferir para humano</Button>
      </div> : <p className="muted">Nenhuma conversa.</p>}</Section>
    </div>
    <Section title="Fila de atendimento humano"><div className="stack">{tasks.length === 0 && <p>Nenhuma tarefa.</p>}{tasks.map((h) => <div key={h.id} className="card tight row between"><div><strong>{h.name}</strong> <Badge tone={h.priority === 'urgente' ? 'danger' : 'neutral'}>{h.priority}</Badge><p className="small">{h.reason} · {h.status.replaceAll('_', ' ')}</p><p className="small muted">Responsável: {h.assigneeName ?? 'Não atribuído'}</p></div><Button disabled={!edit || h.status === 'concluida'} onClick={() => run(() => db.update(t.tenantId, 'handoffTasks', h.id, { status: h.status === 'aberta' ? 'em_andamento' : 'concluida', assigneeId: t.effectiveUser?.id, assigneeName: t.effectiveUser?.name }), 'Tarefa atualizada.')}>{h.status === 'aberta' ? 'Assumir' : 'Concluir'}</Button></div>)}</div></Section>
    {evo && <details><summary>Histórico da conexão</summary><Timeline items={[...evo.logs].reverse().map((l) => ({ time: formatDateTime(l.at, t.org.timezone), title: l.message }))} /></details>}
  </div>
}
