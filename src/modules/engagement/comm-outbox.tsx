// Aba Fila/Outbox: estados distintos, tentativas, retentativa sem duplicar, fallback, eventos simulados do provedor.
import { useMemo, useState } from 'react'
import { Send, RotateCcw, ArrowRightLeft, PlayCircle, Clock } from 'lucide-react'
import type { Channel, NotificationEvent, OutboxMessage } from '@/domain/types'
import { useTenant } from '@/app/session'
import { useCollection } from '@/data/store'
import { Alert, Button, DataTable, Dialog, Field, Select, SimBadge, Timeline, useAction, useToast, DescList, type Column } from '@/ui'
import { formatDateTime, zonedParts } from '@/lib/dates'
import { CHANNEL_LABEL, EVENTS, EVENT_KEYS, OUTBOX_STATUS } from './catalog'
import { commConfig, fallbackMessage, processQueue, queueMessage, releaseNow, retryMessage, simulateProviderEvent, tzOf, type ProviderEvent } from './engine'
import { OutboxBadge, cssVars } from './ui'

const STATUSES = Object.keys(OUTBOX_STATUS) as OutboxMessage['status'][]

export function OutboxTab() {
  const t = useTenant()
  const outbox = useCollection(t.tenantId, 'outbox')
  const run = useAction()
  const toast = useToast()
  const [ch, setCh] = useState<'' | Channel>('')
  const [st, setSt] = useState<'' | OutboxMessage['status']>('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [composer, setComposer] = useState(false)
  const canSend = t.can('comunicacao', 'create')
  const rows = useMemo(() => [...outbox].filter((m) => (!ch || m.channel === ch) && (!st || m.status === st)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [outbox, ch, st])
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, outbox.filter((m) => m.status === s).length])), [outbox])
  const open = outbox.find((m) => m.id === openId) ?? null
  const tz = tzOf(t.tenantId)
  const waiting = outbox.filter((m) => m.status === 'aguardando_janela' || (m.status === 'pendente' && m.scheduledFor)).length

  const cols: Column<OutboxMessage>[] = [
    { id: 'rec', header: 'Destinatário / assunto', cell: (m) => <span className="stack" style={cssVars({ '--gap': '0' })}><span className="strong">{m.recipientName}</span><span className="small muted">{m.subject}</span></span>, value: (m) => m.recipientName },
    { id: 'ev', header: 'Evento', cell: (m) => EVENTS[m.event]?.label ?? m.event, value: (m) => m.event },
    { id: 'ch', header: 'Canal', cell: (m) => CHANNEL_LABEL[m.channel], value: (m) => m.channel },
    { id: 'st', header: 'Status', cell: (m) => <OutboxBadge status={m.status} />, value: (m) => m.status },
    { id: 'tries', header: 'Registros', cell: (m) => m.attempts.length, value: (m) => m.attempts.length, num: true },
    { id: 'at', header: 'Criada em', cell: (m) => formatDateTime(m.createdAt, tz), value: (m) => m.createdAt },
    { id: 'dk', header: 'Chave de deduplicação', cell: (m) => <span className="mono">{m.dedupeKey}</span>, hidden: true, value: (m) => m.dedupeKey },
  ]

  return (
    <div className="stack">
      <Alert tone="info" title="Aceito pelo provedor ≠ entregue ≠ lido">
        Só marcamos “entregue” ou “lido” quando há evidência correspondente do provedor. Mensagens repetidas (mesmo evento + destinatário + canal) viram “duplicado” e não são reenviadas.
      </Alert>
      <div className="row between">
        <SimBadge />
        <div className="row">
          <Button icon={<Clock />} disabled={!canSend || waiting === 0} onClick={() => run(() => { const n = processQueue(t.tenantId); if (!n) throw new Error('Nenhuma mensagem com horário permitido alcançado. Use “Liberar agora” no detalhe para forçar.'); toast(`${n} mensagem(ns) liberada(s) para o provedor (simulado).`) })}>Processar fila ({waiting})</Button>
          <Button variant="primary" icon={<Send />} data-tour="primary-action" disabled={!canSend} onClick={() => setComposer(true)}>Enviar mensagem de teste</Button>
        </div>
      </div>
      {!canSend && <Alert tone="neutral">Seu perfil pode consultar a fila, mas não enviar ou retentar mensagens.</Alert>}
      <div className="legend" aria-label="Legenda de status">
        {STATUSES.map((s) => <button key={s} type="button" className="chip" aria-pressed={st === s} onClick={() => setSt(st === s ? '' : s)} title={OUTBOX_STATUS[s].help}>{OUTBOX_STATUS[s].label} <span className="muted">({counts[s]})</span></button>)}
      </div>
      <div className="form-grid">
        <Field label="Canal"><Select value={ch} onChange={(e) => setCh(e.target.value as Channel | '')}><option value="">Todos</option>{(['whatsapp', 'email', 'push'] as Channel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</Select></Field>
        <Field label="Status"><Select value={st} onChange={(e) => setSt(e.target.value as OutboxMessage['status'] | '')}><option value="">Todos</option>{STATUSES.map((s) => <option key={s} value={s}>{OUTBOX_STATUS[s].label}</option>)}</Select></Field>
      </div>
      <DataTable caption="Fila de comunicação" rows={rows} columns={cols} rowKey={(m) => m.id} onRowClick={(m) => setOpenId(m.id)} exportName="fila-comunicacao" pageSize={15} />
      {open && <MessageDrawer m={open} onClose={() => setOpenId(null)} canSend={canSend} />}
      {composer && <Composer onClose={() => setComposer(false)} />}
    </div>
  )
}

function MessageDrawer({ m, onClose, canSend }: { m: OutboxMessage; onClose: () => void; canSend: boolean }) {
  const t = useTenant()
  const run = useAction()
  const tz = tzOf(t.tenantId)
  const fb = commConfig(t.tenantId).fallback[m.channel]
  const sim = (ev: ProviderEvent, label: string) => run(() => simulateProviderEvent(t.tenantId, m.id, ev), `${label} registrado (simulado).`)
  return (
    <Dialog open drawer onClose={onClose} title={m.subject} description={`${m.recipientName} · ${CHANNEL_LABEL[m.channel]} · ${EVENTS[m.event]?.label ?? m.event}`}>
      <div className="stack">
        <div className="row"><OutboxBadge status={m.status} /><SimBadge /></div>
        <p className="small muted">{OUTBOX_STATUS[m.status].help}</p>
        <DescList items={[['Chave de deduplicação', <span className="mono" key="k">{m.dedupeKey}</span>], ['Agendada para', m.scheduledFor ? formatDateTime(m.scheduledFor, tz) : '—'], ['Fallback configurado', fb && fb !== 'nenhum' ? CHANNEL_LABEL[fb] : 'Nenhum']]} />
        <div className="muted-surface small"><strong>Prévia:</strong> {m.preview}</div>
        <section className="stack" style={cssVars({ '--gap': '8px' })} aria-label="Ações">
          <h3>Ações</h3>
          <div className="row">
            <Button size="sm" icon={<RotateCcw />} disabled={!canSend || m.status !== 'falhou'} onClick={() => run(() => retryMessage(t.tenantId, m.id), 'Retentativa registrada no mesmo envio (sem duplicar).')}>Retentar</Button>
            <Button size="sm" icon={<ArrowRightLeft />} disabled={!canSend || !(m.status === 'falhou' || m.status === 'falha_definitiva') || !fb || fb === 'nenhum'} onClick={() => run(() => fallbackMessage(t.tenantId, m.id), 'Fallback enfileirado.')}>Fallback{fb && fb !== 'nenhum' ? ` → ${CHANNEL_LABEL[fb]}` : ''}</Button>
            <Button size="sm" icon={<PlayCircle />} disabled={!canSend || !(m.status === 'aguardando_janela' || (m.status === 'pendente' && !!m.scheduledFor))} onClick={() => run(() => releaseNow(t.tenantId, m.id), 'Mensagem liberada para o provedor (simulado).')}>Liberar agora</Button>
          </div>
          <h3>Simular eventos do provedor</h3>
          <p className="small muted">Use para demonstrar a progressão por evidência. Cada evento só é aceito no estado adequado.</p>
          <div className="row">
            <Button size="sm" disabled={!canSend} onClick={() => sim('entregue', 'Entrega')}>Entregue</Button>
            <Button size="sm" disabled={!canSend} onClick={() => sim('lido', 'Leitura')}>Lido</Button>
            <Button size="sm" disabled={!canSend} onClick={() => sim('falhou', 'Falha')}>Falha</Button>
            <Button size="sm" disabled={!canSend || m.channel !== 'email'} onClick={() => sim('bounce', 'Bounce')}>Bounce</Button>
            <Button size="sm" disabled={!canSend || m.channel !== 'email'} onClick={() => sim('complaint', 'Complaint')}>Complaint</Button>
          </div>
        </section>
        <section aria-label="Histórico de tentativas" className="stack" style={cssVars({ '--gap': '8px' })}>
          <h3>Tentativas e eventos</h3>
          <div aria-live="polite"><Timeline items={[...m.attempts].reverse().map((a) => ({ time: a.at ? formatDateTime(a.at, tz) : '—', title: a.result }))} /></div>
        </section>
      </div>
    </Dialog>
  )
}

function Composer({ onClose }: { onClose: () => void }) {
  const t = useTenant()
  const persons = useCollection(t.tenantId, 'persons')
  const run = useAction()
  const [personId, setPersonId] = useState(persons[0]?.id ?? '')
  const [event, setEvent] = useState<NotificationEvent>('lembrete')
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const p = persons.find((x) => x.id === personId)
  const day = zonedParts(new Date(), tzOf(t.tenantId)).date
  const send = () => run(() => {
    if (!p) throw new Error('Selecione o destinatário.')
    const r = queueMessage(t.tenantId, { event, channel, recipientName: p.name, recipientRef: p.id, subject: EVENTS[event].label, preview: `${EVENTS[event].label} — detalhes no portal (mensagem de teste).`, dedupeKey: `${event}:${p.id}:${channel}:teste:${day}`, link: '/portal' })
    onClose()
    return r
  }, 'Mensagem enfileirada. Envie de novo para ver a deduplicação.')
  return (
    <Dialog open onClose={onClose} title="Enviar mensagem de teste" description="Simulado — nada é enviado. A chave de deduplicação inclui evento, destinatário, canal e dia." footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" icon={<Send />} onClick={send}>Enfileirar</Button></>}>
      <div className="stack">
        <Field label="Destinatário (pessoa fictícia)" required><Select value={personId} onChange={(e) => setPersonId(e.target.value)}>{persons.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="Evento"><Select value={event} onChange={(e) => setEvent(e.target.value as NotificationEvent)}>{EVENT_KEYS.map((k) => <option key={k} value={k}>{EVENTS[k].label}</option>)}</Select></Field>
        <Field label="Canal"><Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>{(['whatsapp', 'email', 'push'] as Channel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</Select></Field>
        {p && <p className="small muted">Preferências de {p.name}: WhatsApp {p.communication.whatsapp ? 'sim' : 'não'} · e-mail {p.communication.email ? 'sim' : 'não'} · push {p.communication.push ? 'sim' : 'não'}. Canal desativado ⇒ “suprimido”.</p>}
      </div>
    </Dialog>
  )
}
