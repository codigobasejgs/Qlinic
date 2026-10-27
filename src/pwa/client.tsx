// Cliente PWA: registro do SW, aviso de atualização seguro, instalação (Chromium/iOS), status de rede real, push preparado.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, RefreshCw, WifiOff, Smartphone, Share } from 'lucide-react'
import type { Organization } from '@/domain/types'
import { Button } from '@/ui/core'
import { Dialog, useConfirm } from '@/ui/overlay'

// ---------- Registro / atualização ----------
let waiting: ServiceWorker | null = null
const ul = new Set<() => void>()
const notify = () => ul.forEach((l) => l())

let updateAccepted = false
let reloaded = false

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const track = (w: ServiceWorker | null) => {
        if (!w) return
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { waiting = w; notify() } })
      }
      if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; notify() }
      reg.addEventListener('updatefound', () => track(reg.installing))
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000)
      // Recarrega só quando o usuário aceitou a atualização. Na 1ª instalação o clients.claim() também dispara
      // controllerchange — recarregar ali fazia o visitante novo baixar a página duas vezes.
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateAccepted && !reloaded) { reloaded = true; location.reload() } })
    } catch (e) { console.warn('[qlinic] SW não registrado', e) }
  })
}
/** Há rascunho não salvo? Módulos marcam via data-unsaved no body. */
function hasUnsaved() {
  return document.querySelector('[data-unsaved="true"]') !== null
}

export function UpdateBanner() {
  const w = useSyncExternalStore((cb) => { ul.add(cb); return () => ul.delete(cb) }, () => waiting)
  const confirm = useConfirm()
  if (!w) return null
  const apply = async () => {
    if (hasUnsaved()) {
      const r = await confirm({ title: 'Há alterações não salvas', body: 'Atualizar agora recarrega a página e descarta o que não foi salvo. Salve antes ou confirme para atualizar mesmo assim.', confirmLabel: 'Atualizar mesmo assim', danger: true })
      if (!r.ok) return
    }
    updateAccepted = true
    w.postMessage({ type: 'SKIP_WAITING' })
  }
  return (
    <div className="alert info" style={{ borderRadius: 0 }} role="status">
      <RefreshCw aria-hidden="true" />
      <div className="alert-body"><strong>Nova versão disponível</strong><span className="small">Atualize quando terminar o que está fazendo.</span></div>
      <Button size="sm" variant="primary" onClick={apply}>Atualizar</Button>
      <Button size="sm" onClick={() => { waiting = null; notify() }}>Depois</Button>
    </div>
  )
}

// ---------- Rede ----------
/** navigator.onLine não basta: confirma com requisição real (sem cache) quando há suspeita. */
export function useNetworkStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    let alive = true
    const probe = async () => {
      try {
        const ctl = new AbortController()
        const t = setTimeout(() => ctl.abort(), 4000)
        await fetch(`/robots.txt?probe=${Date.now()}`, { cache: 'no-store', signal: ctl.signal })
        clearTimeout(t)
        if (alive) setOnline(true)
      } catch { if (alive) setOnline(false) }
    }
    const off = () => setOnline(false)
    const on = () => probe()
    window.addEventListener('offline', off)
    window.addEventListener('online', on)
    window.addEventListener('qlinic:network-error', probe)
    const iv = setInterval(() => { if (!navigator.onLine || !online) probe() }, 15000)
    return () => { alive = false; window.removeEventListener('offline', off); window.removeEventListener('online', on); window.removeEventListener('qlinic:network-error', probe); clearInterval(iv) }
  }, [online])
  return online
}

export function NetworkStatus() {
  const online = useNetworkStatus()
  if (online) return null
  return <span className="badge danger" role="status"><WifiOff size={14} aria-hidden="true" />Sem conexão</span>
}
export function OfflineNotice() {
  const online = useNetworkStatus()
  if (online) return null
  return <div className="alert warning" role="status"><WifiOff aria-hidden="true" /><div className="alert-body"><strong>Você está sem conexão</strong><span>Nada é confirmado offline: horários, pagamentos e assinaturas exigem conexão. Reconecte-se e tente novamente.</span></div></div>
}

// ---------- Instalação ----------
interface BIPEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: BIPEvent | null = null
const il = new Set<() => void>()
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIPEvent; il.forEach((l) => l()) })
window.addEventListener('appinstalled', () => { deferred = null; il.forEach((l) => l()) })

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}
export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function InstallAppButton({ kind, org, compact }: { kind: 'equipe' | 'portal'; org: Organization; compact?: boolean }) {
  const prompt = useSyncExternalStore((cb) => { il.add(cb); return () => il.delete(cb) }, () => deferred)
  const [help, setHelp] = useState(false)
  if (isStandalone()) return compact ? null : <span className="badge success">App instalado</span>
  const label = kind === 'equipe' ? `Instalar app da equipe` : `Instalar app ${org.name}`
  const click = async () => {
    if (prompt) { await prompt.prompt(); const r = await prompt.userChoice; if (r.outcome === 'accepted') deferred = null; il.forEach((l) => l()) }
    else setHelp(true)
  }
  return (
    <>
      {compact ? <Button variant="ghost" iconOnly icon={<Download />} onClick={click} className="hide-mobile">{label}</Button> : <Button icon={<Smartphone />} onClick={click}>{label}</Button>}
      <Dialog open={help} onClose={() => setHelp(false)} title="Como instalar" footer={<Button variant="primary" onClick={() => setHelp(false)}>Entendi</Button>}>
        <div className="stack">
          {isIOS() ? (
            <ol className="stack" style={{ paddingLeft: 20, margin: 0 }}>
              <li>Abra esta página no <strong>Safari</strong>.</li>
              <li>Toque em <Share size={16} style={{ display: 'inline', verticalAlign: 'middle' }} aria-label="Compartilhar" /> <strong>Compartilhar</strong>.</li>
              <li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme.</li>
            </ol>
          ) : (
            <p>Seu navegador não ofereceu instalação automática agora. Em navegadores compatíveis (Chrome, Edge), use o ícone de instalação na barra de endereço ou o menu <strong>Instalar aplicativo</strong>. Em outros navegadores, continue usando normalmente pelo navegador.</p>
          )}
          <p className="small muted">A instalação depende do navegador e do sistema. Nome e ícone de um app já instalado podem demorar a atualizar ou exigir reinstalação.</p>
        </div>
      </Dialog>
    </>
  )
}

// ---------- Push (preparado) ----------
export type PushState = 'nao_suportado' | 'padrao' | 'negado' | 'concedido'
export function pushState(): PushState {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'nao_suportado'
  return Notification.permission === 'granted' ? 'concedido' : Notification.permission === 'denied' ? 'negado' : 'padrao'
}
/** Pede permissão APENAS por ação do usuário. Assinatura remota exige chave VAPID + backend (futuro). */
export async function requestPushPermission(): Promise<PushState> {
  if (pushState() === 'nao_suportado') return 'nao_suportado'
  const r = await Notification.requestPermission()
  return r === 'granted' ? 'concedido' : r === 'denied' ? 'negado' : 'padrao'
}

export function useConfirmLeave(dirty: boolean) {
  useEffect(() => {
    document.body.dataset.unsaved = dirty ? 'true' : 'false'
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => { window.removeEventListener('beforeunload', h); document.body.dataset.unsaved = 'false' }
  }, [dirty])
}
