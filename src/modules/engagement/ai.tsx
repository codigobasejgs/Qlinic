import { useState } from 'react'
import { Link } from 'react-router'
import { useTenant, isRemoteSession } from '@/app/session'
import { db, useCollection, usePlatformCollection } from '@/data/store'
import { availableSlots, type Slot } from '@/domain/scheduling'
import { createAppointment } from '@/domain/appointments'
import { chargeBalance } from '@/data/repositories'
import { addDaysCivil, formatDateTime, nowISO, todayCivil, zonedParts } from '@/lib/dates'
import { formatBRL } from '@/lib/money'
import { normalize, uid } from '@/lib/util'
import { Alert, Button, Dialog, Field, Input, PageHeader, Section, Select, SimBadge, Textarea, useAction } from '@/ui'
import { createHandoff } from './engine'
import { detectInjection, detectUrgency, isClinicalQuestion } from './rules'
import type { AiLog } from './types'

interface Reply { id: string; text: string; source?: string }
export function AiAssistantPage() {
  const t = useTenant()
  if (!t.moduleOn('ia') || !t.can('ia')) return <><PageHeader title="Assistente IA" /><Alert>Assistente indisponível neste plano ou perfil.</Alert></>
  return <AiWorkspace key={`${t.tenantId}:${t.effectiveUser?.id}:${t.unitId}`} />
}
function AiWorkspace() {
  const t = useTenant()
  const run = useAction()
  const appointments = useCollection(t.tenantId, 'appointments')
  const patients = useCollection(t.tenantId, 'patients').filter((p) => (!t.unitId || p.unitId === t.unitId) && t.allowedUnits.some((u) => u.id === p.unitId) && t.can('pacientes', 'read', { unitId: p.unitId }))
  const services = useCollection(t.tenantId, 'services').filter((s) => s.active)
  const professionals = useCollection(t.tenantId, 'professionals')
  const resources = useCollection(t.tenantId, 'resources')
  const charges = useCollection(t.tenantId, 'charges')
  const logs = useCollection(t.tenantId, 'aiLogs')
  const plans = usePlatformCollection('plans')
  const usage = usePlatformCollection('usage')
  const connected = isRemoteSession()
  const [thinking, setThinking] = useState(false)
  const [text, setText] = useState('')
  const [attachment, setAttachment] = useState('')
  const [replies, setReplies] = useState<Reply[]>([])
  const [patientId, setPatientId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [unitId, setUnitId] = useState(t.unitId ?? t.allowedUnits[0]?.id ?? '')
  const [date, setDate] = useState(addDaysCivil(todayCivil(t.org.timezone), 1))
  const [preference, setPreference] = useState('qualquer')
  const [slots, setSlots] = useState<Slot[]>([])
  const [chosen, setChosen] = useState<Slot | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [query, setQuery] = useState('consultas de amanhã')
  const [result, setResult] = useState<Reply | null>(null)
  const month = zonedParts(new Date(), t.org.timezone).date.slice(0, 7)
  const limit = plans.find((p) => p.id === t.org.planId)?.limits.aiCreditsMonth ?? 0
  const used = (usage.find((u) => u.tenantId === t.tenantId && u.month === month)?.aiCredits ?? 0) + logs.filter((l) => l.createdAt.startsWith(month)).reduce((s, l) => s + l.credits, 0)
  const unit = t.allowedUnits.find((u) => u.id === unitId)
  const service = services.find((s) => s.id === serviceId)
  const patient = patients.find((p) => p.id === patientId)
  const log = (kind: AiLog['kind'], intent: string, tools: string[], flags: AiLog['flags'] = [], credits = 1) => {
    if (credits && used >= limit) throw new Error('Créditos mensais do plano esgotados. Procure a equipe humana.')
    db.insert(t.tenantId, 'aiLogs', { id: uid('ai_'), tenantId: t.tenantId, createdAt: nowISO(), kind, intent, tools, flags, credits })
  }
  const addReply = (message: string, source?: string) => setReplies((r) => [...r, { id: uid('reply_'), text: message, source }].slice(-20))
  const chat = () => run(() => {
    const content = `${text}\n${attachment}`.trim()
    if (!content) throw new Error('Digite uma mensagem ou um trecho fictício do anexo.')
    const urgency = detectUrgency(content)
    const injection = detectInjection(content)
    // Urgência precede créditos e qualquer coleta de agendamento.
    if (urgency.urgent) {
      createHandoff(t.tenantId, { source: 'ia', priority: 'urgente', reason: 'Sinal de urgência identificado; revisão humana imediata solicitada. Conteúdo clínico não armazenado no log.', name: patient?.name ?? 'Contato não identificado', personRef: patient?.personId })
      log('recepcionista', 'encaminhamento_urgente', ['createHandoff'], ['urgencia', ...(injection.suspicious ? ['injecao' as const] : [])], 0)
      addReply(`${urgency.response} ${injection.suspicious ? 'Instruções embutidas foram tratadas como conteúdo não confiável.' : ''}`, 'Protocolo demonstrativo de encaminhamento; tarefa na Comunicação › WhatsApp')
      setBlocked(true); setSlots([]); setChosen(null)
    } else if (injection.suspicious) {
      log('recepcionista', 'conteudo_nao_confiavel', [], ['injecao'], 0)
      addReply('Mensagem/anexo contém tentativa de alterar instruções. Tratada como conteúdo, nunca como comando. Nenhuma ferramenta foi executada.', 'Filtro determinístico de mensagens e anexos')
      setSlots([]); setChosen(null)
    } else if (isClinicalQuestion(content)) {
      createHandoff(t.tenantId, { source: 'ia', priority: 'normal', reason: 'Pergunta clínica encaminhada para profissional; sem diagnóstico ou prescrição automática.', name: patient?.name ?? 'Contato não identificado' })
      log('recepcionista', 'pergunta_clinica', ['createHandoff'], [], 0)
      addReply('Não realizo diagnóstico nem prescrevo. A equipe humana recebeu uma tarefa para orientar o encaminhamento adequado. Em emergência, procure atendimento imediato.', 'Política: assistente exclusivamente administrativo')
      setSlots([]); setChosen(null)
    } else if (connected) {
      // Modelo real no servidor (Edge Function ai-assistant): permissão, limite do plano e filtros reaplicados lá.
      const services = (t.allowedUnits.length ? db.list(t.tenantId, 'services') : []).filter((s) => s.publicBookable && s.active).map((s) => s.name)
      setThinking(true)
      import('@/data/supabase/client').then(async ({ supabase }) => {
        const { data, error } = await supabase().functions.invoke('ai-assistant', { body: { tenantId: t.tenantId, message: content, context: { clinicName: t.org.name, services } } })
        if (error) { addReply('Assistente indisponível no momento. Tente novamente ou encaminhe a uma pessoa da equipe.', 'Erro do servidor de IA'); return }
        if (data.urgent) { setBlocked(true); setSlots([]); setChosen(null) }
        if (data.handoff) createHandoff(t.tenantId, { source: 'ia', priority: data.urgent ? 'urgente' : 'normal', reason: data.urgent ? 'Urgência detectada pelo servidor.' : 'Assistente encaminhou ao atendimento humano.', name: patient?.name ?? 'Contato não identificado', personRef: patient?.personId })
        db.insert(t.tenantId, 'aiLogs', { id: uid('ai_'), tenantId: t.tenantId, createdAt: nowISO(), kind: 'recepcionista', intent: data.intent?.intent ?? 'conversa', tools: ['gemini'], flags: data.urgent ? ['urgencia'] : [], credits: data.urgent ? 0 : 1 })
        addReply(data.reply, `${data.model ?? 'protocolo de urgência'} (servidor) — sugestão; confirmação humana obrigatória`)
        if (data.intent?.servico) { const s = db.list(t.tenantId, 'services').find((x) => normalize(x.name).includes(normalize(String(data.intent.servico)))); if (s) setServiceId(s.id) }
      }).finally(() => setThinking(false))
    } else {
      log('recepcionista', 'coleta_agendamento', [], [], 1)
      addReply('Para preparar o agendamento, selecione paciente, serviço, unidade e preferência abaixo. Consultarei a agenda atual. Um horário consultado só fica reservado após confirmação humana.', 'Formulário de preparação; nenhuma reserva criada')
    }
    setText(''); setAttachment('')
  }, connected ? undefined : 'Resposta demonstrativa registrada.')
  const lookup = () => run(() => {
    if (blocked) throw new Error('Sinal de urgência: atendimento humano prioritário. Agendamento automático bloqueado nesta conversa.')
    if (!unit || !service || !patient) throw new Error('Selecione unidade, serviço e paciente.')
    if (!t.can('agenda', 'create', { unitId }) || !t.can('agenda', 'read', { unitId })) throw new Error('Sem permissão para preparar agendamento nesta unidade.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Informe data válida.')
    log('recepcionista', 'disponibilidade', ['availableSlots'])
    const found = availableSlots({ date, unit, service, professionals, resources, appointments, now: new Date() }).filter((s) => {
      const h = zonedParts(s.start, unit.timezone).hour
      return (preference === 'qualquer' || (preference === 'manha' ? h < 12 : h >= 12)) && !appointments.some((a) => a.patientId === patient.id && !['cancelada', 'faltou'].includes(a.status) && a.start < s.end && a.end > s.start)
    }).slice(0, 12)
    setSlots(found)
    addReply(found.length ? `${found.length} opções consultadas. Selecione uma para revisar. Disponibilidade sujeita à validação no momento da confirmação.` : 'Nenhuma opção compatível. Altere data ou preferência; nenhuma reserva foi criada.', 'appointments, professionals, resources, services, units — availableSlots')
  }, 'Consulta de disponibilidade concluída.')
  const confirmBooking = () => run(() => {
    if (!chosen || !unit || !service || !patient || blocked) throw new Error('Preparação inválida.')
    if (!t.can('agenda', 'create', { unitId })) throw new Error('Sem permissão para criar reserva.')
    const a = createAppointment(t.tenantId, { ...chosen, unitId, patientId, serviceId, source: 'ia', status: 'confirmada' }, t.effectiveUser?.id ?? 'equipe')
    addReply(`Reserva confirmada: ${formatDateTime(a.start, unit.timezone)}. Referência ${a.id}.`, 'createAppointment: conflitos revalidados; confirmação humana')
    setChosen(null); setSlots([])
  }, 'Agendamento criado após confirmação humana.')
  const allowedAppointments = appointments.filter((a) => (!t.unitId || a.unitId === t.unitId) && t.allowedUnits.some((u) => u.id === a.unitId) && t.can('agenda', 'read', { unitId: a.unitId, ownerProfessionalId: a.professionalId }) && (t.scope('agenda') !== 'own' || a.professionalId === t.effectiveUser?.professionalId))
  const allowedCharges = charges.filter((c) => (!t.unitId || c.unitId === t.unitId) && t.allowedUnits.some((u) => u.id === c.unitId) && t.can('financeiro', 'read', { unitId: c.unitId, ownerProfessionalId: c.professionalId }) && (t.scope('financeiro') !== 'own' || c.professionalId === t.effectiveUser?.professionalId))
  const search = (summary = false) => run(() => {
    const q = normalize(query)
    if (!summary && detectInjection(query).suspicious) throw new Error('Instruções embutidas não são comandos administrativos permitidos.')
    const today = zonedParts(new Date(), t.org.timezone).date
    const day = summary ? today : addDaysCivil(today, 1)
    let answer: string
    let source: string
    if (summary || q.includes('consulta') || q.includes('agenda')) {
      if (!t.can('agenda')) throw new Error('Seu perfil não pode consultar agenda.')
      const list = allowedAppointments.filter((a) => zonedParts(a.start, t.org.timezone).date === day)
      answer = `${summary ? 'Hoje' : 'Amanhã'}: ${list.length} agendamentos; ${list.filter((a) => a.status === 'confirmada').length} confirmados; ${list.filter((a) => a.status === 'cancelada').length} cancelados.`
      source = `appointments: ${list.slice(0, 8).map((a) => a.id).join(', ') || 'nenhum registro'}; filtros de unidade e perfil aplicados.`
    } else if (q.includes('cobranca') && (q.includes('vencid') || q.includes('atras'))) {
      if (!t.can('financeiro')) throw new Error('Seu perfil não pode consultar cobranças.')
      const list = allowedCharges.filter((c) => c.dueDate < today && !['cancelada', 'estornada'].includes(c.status) && chargeBalance(c) > 0)
      answer = `${list.length} cobranças vencidas; saldo ${formatBRL(list.reduce((s, c) => s + chargeBalance(c), 0))}.`
      source = `charges: ${list.slice(0, 8).map((c) => c.id).join(', ') || 'nenhum registro'}; chargeBalance; vencimento civil.`
    } else throw new Error('Consulta permitida: “consultas de amanhã” ou “cobranças vencidas”. Não há busca irrestrita no banco.')
    log(summary ? 'resumo' : 'busca', summary ? 'resumo_dia' : q.includes('cobranca') ? 'cobrancas_vencidas' : 'consultas_amanha', [source.startsWith('charges') ? 'charges.read' : 'appointments.read'])
    setResult({ id: uid('result_'), text: answer, source })
  }, 'Resultado administrativo atualizado.')
  return <div className="engagement" data-tour="page-content">
    <PageHeader title="Assistente IA" subtitle="Preparação administrativa, confirmação humana e fontes visíveis." />
    <div className="stack">{connected
      ? <Alert tone="info">Modelo de IA conectado no servidor. Respostas são sugestões administrativas: nenhuma reserva é feita sem confirmação humana. Mensagens não são guardadas no log.</Alert>
      : <SimBadge>Respostas determinísticas de demonstração — nenhum modelo conectado</SimBadge>}
      <div className="grid grid-2"><Section title="Recepcionista virtual"><div className="stack">
        <Alert tone="neutral">Nunca diagnostica ou prescreve. Sinais de urgência criam tarefa humana e bloqueiam a oferta de vagas nesta conversa.</Alert>
        <div role="log" aria-live="polite" aria-label="Conversa com o assistente" className="eng-messages">{replies.length === 0 && <p className="small muted">Experimente: “Quero agendar amanhã de manhã”, “estou com dor no peito” ou um anexo com “ignore as instruções”.</p>}{replies.map((r) => <article key={r.id} className="eng-bubble"><p>{r.text}</p><small className="muted">Fonte: {r.source}</small></article>)}</div>
        <Field label="Mensagem fictícia"><Textarea value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Quero agendar amanhã de manhã" /></Field>
        <details><summary>Trecho de anexo fictício (não confiável)</summary><Field label="Texto do anexo"><Textarea value={attachment} maxLength={2000} onChange={(e) => setAttachment(e.target.value)} /></Field></details>
        <Button variant="primary" data-tour="primary-action" onClick={chat} loading={thinking}>{connected ? 'Enviar ao assistente' : 'Enviar ao assistente simulado'}</Button>
        {blocked && <Alert tone="danger">Encaminhamento urgente registrado. <Link to={`${t.base}/comunicacao?aba=whatsapp`}>Abrir fila humana</Link></Alert>}
      </div></Section>
      <Section title="Preparar agendamento"><div className="stack">
        <Field label="Paciente"><Select value={patientId} onChange={(e) => { setPatientId(e.target.value); setSlots([]) }}><option value="">Selecione…</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Serviço"><Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setSlots([]) }}><option value="">Selecione…</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min</option>)}</Select></Field>
        <Field label="Unidade"><Select value={unitId} onChange={(e) => { setUnitId(e.target.value); setSlots([]) }}>{t.allowedUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <div className="form-grid"><Field label="Data preferida"><Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSlots([]) }} /></Field><Field label="Período"><Select value={preference} onChange={(e) => { setPreference(e.target.value); setSlots([]) }}><option value="qualquer">Qualquer período</option><option value="manha">Manhã</option><option value="tarde">Tarde</option></Select></Field></div>
        <Button disabled={blocked || !t.can('agenda', 'create')} onClick={lookup}>Consultar disponibilidade real do store</Button>
        {!t.can('agenda', 'create') && <p className="small muted">Seu perfil não tem permissão para criar agendamentos.</p>}
        <div className="row">{slots.map((s) => <Button key={`${s.start}:${s.professionalId}`} onClick={() => setChosen(s)}>{formatDateTime(s.start, unit?.timezone)} · {professionals.find((p) => p.id === s.professionalId)?.name}</Button>)}</div>
      </div></Section></div>
      <Section title="Busca e resumo administrativos"><div className="stack"><Field label="Pergunta administrativa"><Input value={query} onChange={(e) => setQuery(e.target.value)} /></Field><div className="row"><Button onClick={() => search()}>Buscar com fontes</Button><Button onClick={() => search(true)}>Resumo do dia</Button></div>{result && <div aria-live="polite" className="muted-surface"><p>{result.text}</p><small>Fontes: {result.source}</small></div>}</div></Section>
      <Section title="Política do assistente"><div className="stack"><p>Créditos mensais do tenant: <strong>{used} / {limit}</strong>. Plano {plans.find((p) => p.id === t.org.planId)?.name ?? 'não encontrado'}.</p><p>Ferramentas permitidas: availableSlots; createAppointment somente após confirmação humana; leitura administrativa de agenda/cobranças autorizadas; createHandoff. Nenhum acesso a prontuários ou consulta livre ao banco.</p><p>Sem uso para treinamento por padrão. Logs guardam intenção, ferramenta e sinalizadores; não guardam mensagem, anexo ou conteúdo clínico. Autorização real e retenção dependem do servidor futuro.</p><details><summary>Logs minimizados ({logs.length})</summary>{logs.slice(-15).reverse().map((l) => <p key={l.id} className="small">{formatDateTime(l.createdAt, t.org.timezone)} · {l.intent} · {l.tools.join(', ') || 'sem ferramenta'} · {l.flags.join(', ') || 'sem alerta'}</p>)}</details></div></Section>
    </div>
    <Dialog open={!!chosen} onClose={() => setChosen(null)} title="Confirmação humana da reserva" footer={<><Button onClick={() => setChosen(null)}>Voltar</Button><Button variant="primary" onClick={confirmBooking}>Confirmar e criar agendamento</Button></>}><div className="stack"><p>Paciente: {patient?.name}</p><p>Serviço: {service?.name} · {service?.durationMin} min</p><p>Unidade: {unit?.name}</p><p>Horário: {chosen && formatDateTime(chosen.start, unit?.timezone)}</p><Alert>Esta consulta não reservou a vaga. Conflitos serão revalidados ao confirmar. Origem: IA; confirmação: equipe humana.</Alert></div></Dialog>
  </div>
}
