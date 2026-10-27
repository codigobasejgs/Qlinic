// Totem de check-in e painel de chamada (públicos, marca da clínica via contexto do ClinicGate).
// Privacidade: totem não lista pacientes; painel mostra apenas senha ou nome abreviado, sem procedimento.
import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router'
import { Delete, RotateCcw } from 'lucide-react'
import type { Organization } from '@/domain/types'
import { db, useCollection } from '@/data/store'
import { checkInWithToken } from '@/domain/appointments'
import { getPolicies } from '@/domain/settings'
import { formatTime, zonedParts } from '@/lib/dates'
import { abbreviateName } from '@/lib/util'
import { Button, ClinicLogo, SimBadge } from '@/ui'
import { useNow } from './lib'

const RESET_S = 10
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')

export function TotemPage() {
  const org = useOutletContext<Organization>()
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ ticket: string; first: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [left, setLeft] = useState(RESET_S)
  const [kb, setKb] = useState<'alfa' | 'num'>('alfa')
  const input = useRef<HTMLInputElement>(null)

  const reset = () => { setCode(''); setResult(null); setError(null); setLeft(RESET_S); input.current?.focus() }
  // Reinicia automaticamente após confirmação/erro e após inatividade com algo digitado.
  useEffect(() => {
    if (!result && !error && !code) return
    const id = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [result, error, code])
  useEffect(() => { if (left <= 0) reset() }, [left])
  useEffect(() => { input.current?.focus() }, [])

  const press = (ch: string) => { setError(null); setLeft(RESET_S); setCode((c) => (c + ch).slice(0, 16)) }
  const submit = () => {
    if (!code.trim()) return
    try {
      const r = checkInWithToken(org.id, code)
      const p = db.get(org.id, 'patients', r.appointment.patientId)
      setResult({ ticket: r.ticket, first: (p?.socialName ?? p?.name ?? '').split(/\s+/)[0] })
      setCode('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível fazer o check-in. Procure a recepção.')
    }
    setLeft(RESET_S)
  }

  return (
    <div className="kiosk">
      <header className="kiosk-head">
        <ClinicLogo org={org} height={40} />
        <SimBadge>Check-in demonstrativo</SimBadge>
      </header>
      <main id="main" className="kiosk-main">
        <div className="kiosk-card" aria-live="polite">
          {result ? (
            <div className="stack center" style={{ alignItems: 'center' }}>
              <h1>Chegada registrada{result.first ? `, ${result.first}` : ''}!</h1>
              <p className="muted">Sua senha de chamada</p>
              <div className="ticket" aria-label={`Senha ${result.ticket}`}>{result.ticket}</div>
              <p className="muted">Aguarde ser chamado(a) no painel. Esta tela será reiniciada em {left} s.</p>
              <Button variant="primary" icon={<RotateCcw />} onClick={reset}>Concluir</Button>
            </div>
          ) : (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); submit() }}>
              <h1 className="center">Faça seu check-in</h1>
              <p className="muted center">Leia o QR Code recebido ou digite o código de check-in.</p>
              <label htmlFor="totem-code" className="sr-only">Código de check-in</label>
              <input ref={input} id="totem-code" className="input" value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode={kb === 'num' ? 'numeric' : 'text'}
                onChange={(e) => { setError(null); setLeft(RESET_S); setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)) }} placeholder="CÓDIGO" aria-describedby={error ? 'totem-err' : undefined} aria-invalid={error ? true : undefined} />
              {error && <div id="totem-err" className="alert danger" role="alert"><div className="alert-body"><strong>{error}</strong></div></div>}
              <div className="segmented" role="group" aria-label="Tipo de teclado" style={{ alignSelf: 'center' }}>
                <button type="button" aria-pressed={kb === 'alfa'} onClick={() => setKb('alfa')}>ABC 123</button>
                <button type="button" aria-pressed={kb === 'num'} onClick={() => setKb('num')}>Somente números</button>
              </div>
              <div className={`keypad${kb === 'num' ? ' num' : ''}`} role="group" aria-label="Teclado">
                {(kb === 'num' ? '123456789'.split('') : ALNUM).map((k) => <button key={k} type="button" onClick={() => press(k)}>{k}</button>)}
                {kb === 'num' && <button type="button" onClick={() => press('0')}>0</button>}
                <button type="button" className="wide" onClick={() => setCode((c) => c.slice(0, -1))} aria-label="Apagar último caractere"><Delete aria-hidden="true" style={{ margin: '0 auto' }} /></button>
              </div>
              <div className="row" style={{ justifyContent: 'center' }}>
                <Button onClick={reset} icon={<RotateCcw />}>Limpar</Button>
                <Button type="submit" variant="primary" disabled={!code}>Confirmar chegada</Button>
              </div>
              {(code || error) && <p className="small muted center">Reinício automático em {left} s.</p>}
              <p className="small muted center">Por privacidade, este totem não exibe lista de pacientes. Dúvidas? Procure a recepção.</p>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}

export function CallPanelPage() {
  const org = useOutletContext<Organization>()
  const live = useCollection(org.id, 'appointments')
  const units = useCollection(org.id, 'units')
  const settings = useCollection(org.id, 'settings')
  const resources = useCollection(org.id, 'resources')
  const patients = useCollection(org.id, 'patients')
  const now = useNow(3000)
  // Polling leve (3 s) além do evento storage: relê a coleção do store para outras abas/janelas.
  const [polled, setPolled] = useState(live)
  useEffect(() => { setPolled(db.list(org.id, 'appointments')) }, [now, live, org.id])
  const tz = units[0]?.timezone ?? org.timezone
  const mode = settings && getPolicies(org.id, null).privacy.callPanelMode // `settings` assinado: muda modo ao vivo
  const day = zonedParts(new Date(now), tz).date
  const called = polled.filter((a) => a.calledAt && zonedParts(a.calledAt, tz).date === day && ['chegou', 'em_atendimento'].includes(a.status)).sort((a, b) => b.calledAt!.localeCompare(a.calledAt!))
  const current = called[0]
  const label = (a: (typeof called)[number]) => {
    const p = patients.find((x) => x.id === a.patientId)
    return mode === 'nome_abreviado' && p ? abbreviateName(p.socialName ?? p.name) : a.checkIn?.ticket ?? '—'
  }
  const where = (a: (typeof called)[number]) => resources.find((r) => a.resourceIds.includes(r.id))?.name ?? 'Recepção'
  const [flashKey, setFlashKey] = useState('')
  useEffect(() => { if (current?.calledAt) setFlashKey(`${current.id}:${current.calledAt}`) }, [current?.id, current?.calledAt])

  return (
    <div className="call-panel">
      <header className="cp-head">
        <span style={{ background: '#fff', color: '#102A43', borderRadius: 12, padding: '6px 12px' }}><ClinicLogo org={org} height={36} /></span>
        <span style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} aria-label="Horário atual">{formatTime(new Date(now).toISOString(), tz)}</span>
      </header>
      <main id="main" className="cp-main">
        <section key={flashKey} className={`cp-now${flashKey ? ' flash' : ''}`} aria-live="assertive" aria-atomic="true">
          <span className="cp-label">Chamada atual</span>
          {current ? <>
            <span className="big">{label(current)}</span>
            <span className="cp-where">Dirija-se a: {where(current)}</span>
          </> : <span className="cp-where" style={{ color: '#DCE5EC' }}>Aguardando próxima chamada</span>}
        </section>
        <section aria-label="Últimas chamadas">
          <h2 className="cp-label" style={{ marginBottom: 12 }}>Últimas chamadas</h2>
          {called.length <= 1 ? <p style={{ color: '#A7BAC8' }}>Sem chamadas anteriores hoje.</p> : (
            <ul className="cp-list">{called.slice(1, 6).map((a) => <li key={a.id}><span>{label(a)}</span><span>{formatTime(a.calledAt!, tz)}</span></li>)}</ul>
          )}
        </section>
      </main>
      <footer style={{ padding: '8px 32px 16px', color: '#A7BAC8', fontSize: 13 }}>Painel demonstrativo · exibe {mode === 'nome_abreviado' ? 'nome abreviado' : 'senha'} conforme política de privacidade da clínica · atualização automática</footer>
    </div>
  )
}
