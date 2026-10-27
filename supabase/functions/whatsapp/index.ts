// Ponte Evolution API (WhatsApp) por tenant. A chave da Evolution fica só no servidor.
// Ações: status | connect (QR) | logout | send. Requer permissão 'comunicacao' (update para alterar/enviar).
// Envio só com opt-in do destinatário (persons.data.communication.whatsapp) e sem conteúdo clínico (responsabilidade do template).
import { handle, json, requireCan, serviceClient, HttpError } from '../_shared/auth.ts'

const BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/$/, '')
const KEY = Deno.env.get('EVOLUTION_API_KEY') ?? ''

async function evo(path: string, init: RequestInit = {}) {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { apikey: KEY, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  const text = await r.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  return { ok: r.ok, status: r.status, data: data as Record<string, unknown> | null }
}

function instanceName(tenantId: string) {
  return `qlinic-${tenantId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`
}

interface Body { tenantId: string; action: 'status' | 'connect' | 'logout' | 'send'; to?: string; text?: string; personId?: string }

Deno.serve(handle(async (req) => {
  const b = (await req.json()) as Body
  if (!b?.tenantId || !b.action) throw new HttpError(400, 'Requisição inválida.')
  if (!BASE || !KEY) throw new HttpError(503, 'WhatsApp não configurado no servidor.')
  const need = b.action === 'status' ? 'read' : 'update'
  const { sb } = await requireCan(req, b.tenantId, 'comunicacao', need)
  const inst = instanceName(b.tenantId)
  const svc = serviceClient()
  const save = (status: string) => svc.from('whatsapp_instances').upsert({ tenant_id: b.tenantId, instance: inst, status, updated_at: new Date().toISOString() })

  if (b.action === 'status') {
    const r = await evo(`/instance/connectionState/${inst}`)
    const state = r.ok ? String((r.data?.instance as Record<string, unknown> | undefined)?.state ?? 'close') : r.status === 404 ? 'nao_criada' : 'erro'
    const status = state === 'open' ? 'conectada' : state === 'connecting' ? 'configurando' : state === 'nao_criada' ? 'desconectada' : state === 'erro' ? 'erro' : 'desconectada'
    await save(status)
    return json(req, { instance: inst, status })
  }

  if (b.action === 'connect') {
    let r = await evo(`/instance/connect/${inst}`)
    if (r.status === 404) {
      const c = await evo('/instance/create', { method: 'POST', body: JSON.stringify({ instanceName: inst, integration: 'WHATSAPP-BAILEYS', qrcode: true }) })
      if (!c.ok) throw new HttpError(502, 'Não foi possível criar a instância de WhatsApp.')
      r = await evo(`/instance/connect/${inst}`)
    }
    if (!r.ok) throw new HttpError(502, 'Não foi possível gerar o QR de conexão.')
    await save('configurando')
    // base64 da imagem do QR (Evolution v2) ou código para renderizar no cliente
    return json(req, { instance: inst, status: 'configurando', qrBase64: r.data?.base64 ?? null, code: r.data?.code ?? null, pairingCode: r.data?.pairingCode ?? null })
  }

  if (b.action === 'logout') {
    await evo(`/instance/logout/${inst}`, { method: 'DELETE' })
    await save('desconectada')
    return json(req, { instance: inst, status: 'desconectada' })
  }

  if (b.action === 'send') {
    if (!b.personId || !b.text) throw new HttpError(400, 'Destinatário e texto são obrigatórios.')
    // destinatário e opt-in lidos COM a identidade do usuário (RLS): não envia para quem ele não pode ver
    const { data: person, error } = await sb.from('persons').select('data').eq('tenant_id', b.tenantId).eq('id', b.personId).maybeSingle()
    if (error || !person) throw new HttpError(404, 'Destinatário não encontrado.')
    const d = person.data as { phone?: string; communication?: { whatsapp?: boolean } }
    if (!d.communication?.whatsapp) throw new HttpError(409, 'Destinatário não autorizou WhatsApp.')
    const number = (d.phone ?? '').replace(/\D/g, '')
    if (number.length < 10) throw new HttpError(422, 'Telefone do destinatário inválido.')
    const r = await evo(`/message/sendText/${inst}`, { method: 'POST', body: JSON.stringify({ number: number.startsWith('55') ? number : `55${number}`, text: b.text.slice(0, 1000) }) })
    if (!r.ok) throw new HttpError(502, 'Provedor recusou o envio.')
    // aceite do provedor ≠ entregue ≠ lido
    return json(req, { status: 'aceito_provedor', providerId: (r.data?.key as Record<string, unknown> | undefined)?.id ?? null })
  }
  throw new HttpError(400, 'Ação desconhecida.')
}))
