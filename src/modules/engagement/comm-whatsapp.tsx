import { useEffect, useState } from 'react'
import { useTenant, isRemoteSession } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { QRCode } from '@/modules/scheduling/qr'
import { Alert, Badge, Button, Field, Input, Section, Select, SimBadge, Textarea, Timeline, useAction } from '@/ui'
import { formatDateTime, nowISO } from '@/lib/dates'
import { uid } from '@/lib/util'
import { createHandoff } from './engine'
import { detectInjection } from './rules'
import { IntegrationBadge } from './ui'
import { updateIntegration } from './comm-integrations'

/** Ambiente conectado: instância real da Evolution por clínica, operada pelo servidor (a chave nunca chega ao navegador). */
function WhatsAppConnected({ canManage }: { canManage: boolean }) {
  const t = useTenant()
  const [state, setState] = useState<{ status: string; instance?: string; qrBase64?: string | null; code?: string | null; pairingCode?: string | null } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const call = async (action: 'status' | 'connect' | 'logout') => {
    setBusy(action); setErr(null)
    try {
      const { supabase } = await import('@/data/supabase/client')
      const { data, error } = await supabase().functions.invoke('whatsapp', { body: { tenantId: t.tenantId, action } })
      if (error) {
        const ctx = (error as { context?: Response }).context
        const msg = ctx ? ((await ctx.json().catch(() => null)) as { error?: string } | null)?.error : null
        throw new Error(msg ?? 'Falha ao falar com o servidor de WhatsApp.')
      }
      setState(data)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erro') } finally { setBusy(null) }
  }
  useEffect(() => { void call('status') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const label: Record<string, string> = { conectada: 'Conectada', configurando: 'Aguardando leitura do QR', desconectada: 'Desconectada', erro: 'Erro' }
  return <div className="stack">
    <Alert title="WhatsApp via Evolution API">Transporte não oficial (Evolution/Baileys), diferente da API oficial da Meta: status de leitura e entrega podem não estar disponíveis. Mensagens só são enviadas para quem autorizou WhatsApp, sem conteúdo clínico.</Alert>
    <Section title="Instância desta clínica" actions={state && <Badge tone={state.status === 'conectada' ? 'success' : state.status === 'erro' ? 'danger' : 'warning'}>{label[state.status] ?? state.status}</Badge>}>
      <div className="stack" aria-busy={!!busy}>
        {err && <Alert tone="danger">{err}</Alert>}
        <p className="small muted">Instância: <span className="mono">{state?.instance ?? '…'}</span>. A chave de acesso fica apenas no servidor.</p>
        <div className="row">
          <Button onClick={() => call('status')} loading={busy === 'status'}>Atualizar status</Button>
          {canManage && state?.status !== 'conectada' && <Button variant="primary" onClick={() => call('connect')} loading={busy === 'connect'}>Conectar aparelho</Button>}
          {canManage && state?.status === 'conectada' && <Button variant="danger" onClick={() => call('logout')} loading={busy === 'logout'}>Desconectar</Button>}
        </div>
        {state?.status === 'configurando' && (state.qrBase64 || state.code) && (
          <div className="eng-qr">
            {state.qrBase64 ? <img src={state.qrBase64.startsWith('data:') ? state.qrBase64 : `data:image/png;base64,${state.qrBase64}`} width={220} height={220} alt="QR Code para conectar o WhatsApp da clínica" /> : <QRCode value={state.code!} size={220} label="QR Code para conectar o WhatsApp da clínica" />}
            <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
              <li>No celular da clínica, abra o WhatsApp → Aparelhos conectados.</li>
              <li>Toque em Conectar um aparelho e leia este código.</li>
              <li>Depois, clique em Atualizar status.</li>
            </ol>
            {state.pairingCode && <p className="small">Código de pareamento: <strong className="mono">{state.pairingCode}</strong></p>}
          </div>
        )}
        {!canManage && <p className="small muted">Gerenciar a conexão exige permissão de integrações.</p>}
      </div>
    </Section>
  </div>
}

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
  if (isRemoteSession()) return <WhatsAppConnected canManage={connect} />
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
