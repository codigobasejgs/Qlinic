// Widgets compartilhados: upload, assinatura demonstrativa, comparador antes/depois, editor de documento, zoom/pan.
import { useEffect, useId, useRef, useState, type ReactNode, type PointerEvent as RPE } from 'react'
import { Upload, ZoomIn, ZoomOut, Maximize, Eraser } from 'lucide-react'
import { Button, SimBadge, Textarea } from './core'
import { cx } from '@/lib/util'

export interface UploadResult { name: string; mime: string; size: number; dataUrl: string }

/** Upload com validação de tipo/tamanho e progresso simulado (leitura local). Arquivos tratados como NÃO confiáveis. */
export function FileUpload({ accept, maxMb = 5, onFile, label = 'Selecionar arquivo', hint, multiple, simulateFailure }: {
  accept: string[]; maxMb?: number; onFile: (f: UploadResult) => void; label?: string; hint?: ReactNode; multiple?: boolean; simulateFailure?: boolean
}) {
  const id = useId()
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const handle = (files: FileList | null) => {
    if (!files?.length) return
    setError(null)
    Array.from(files).forEach((f) => {
      if (!accept.includes(f.type)) { setError(`Tipo não permitido (${f.type || 'desconhecido'}). Aceitos: ${accept.map((a) => a.split('/')[1]).join(', ')}.`); return }
      if (f.size > maxMb * 1024 * 1024) { setError(`Arquivo maior que ${maxMb} MB.`); return }
      setProgress(0)
      const reader = new FileReader()
      reader.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 90))
      reader.onerror = () => { setProgress(null); setError('Falha ao ler o arquivo. Tente novamente.') }
      reader.onload = () => {
        setTimeout(() => {
          setProgress(null)
          if (simulateFailure) { setError('Falha simulada no envio. Nada foi salvo — tente novamente.'); return }
          onFile({ name: f.name, mime: f.type, size: f.size, dataUrl: String(reader.result) })
        }, 350)
      }
      reader.readAsDataURL(f)
    })
  }
  return (
    <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}>
      <div className={cx('dropzone', over && 'over')} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files) }}>
        <Upload aria-hidden="true" />
        <label htmlFor={id} className="btn btn-secondary" style={{ cursor: 'pointer' }}>{label}</label>
        <input id={id} type="file" className="sr-only" accept={accept.join(',')} multiple={multiple} onChange={(e) => { handle(e.target.files); e.target.value = '' }} aria-describedby={`${id}-h`} />
        <span id={`${id}-h`} className="small muted">{hint ?? `Ou arraste aqui. Máx. ${maxMb} MB.`}</span>
        {progress !== null && <div style={{ width: '100%' }}><div className="progress" role="progressbar" aria-label="Progresso do envio" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${progress}%` }} /></div></div>}
      </div>
      {error && <span className="error small" role="alert" style={{ color: 'var(--q-danger)' }}>{error}</span>}
    </div>
  )
}

/** Rubrica DEMONSTRATIVA. Não é assinatura eletrônica qualificada nem ICP-Brasil. Alternativa por teclado: digitar nome. */
export function SignaturePad({ onSign, signerName }: { onSign: (r: { method: 'rubrica_demo' | 'aceite_demo'; dataUrl?: string; typedName?: string }) => void; signerName: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)
  const [typed, setTyped] = useState('')
  const [mode, setMode] = useState<'draw' | 'type'>('type')
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ratio = window.devicePixelRatio || 1
    c.width = c.offsetWidth * ratio
    c.height = c.offsetHeight * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#102A43'
  }, [mode])
  const pos = (e: RPE<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const }
  return (
    <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
      <SimBadge>Assinatura demonstrativa — sem validade jurídica</SimBadge>
      <div className="segmented" role="group" aria-label="Forma de assinatura">
        <button type="button" aria-pressed={mode === 'type'} onClick={() => setMode('type')}>Digitar nome</button>
        <button type="button" aria-pressed={mode === 'draw'} onClick={() => setMode('draw')}>Desenhar rubrica</button>
      </div>
      {mode === 'draw' ? (
        <>
          <canvas ref={ref} className="sig-pad" aria-label="Área para desenhar a rubrica" role="img"
            onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const ctx = e.currentTarget.getContext('2d')!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y) }}
            onPointerMove={(e) => { if (!drawing.current) return; const ctx = e.currentTarget.getContext('2d')!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setHasInk(true) }}
            onPointerUp={() => { drawing.current = false }} />
          <div className="row">
            <Button size="sm" icon={<Eraser />} onClick={() => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setHasInk(false) }}>Limpar</Button>
            <Button size="sm" variant="primary" disabled={!hasInk} onClick={() => onSign({ method: 'rubrica_demo', dataUrl: ref.current!.toDataURL('image/png') })}>Registrar rubrica</Button>
          </div>
        </>
      ) : (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field grow">
            <label htmlFor="sig-typed">Digite seu nome completo para aceitar</label>
            <input id="sig-typed" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="name" />
          </div>
          <Button variant="primary" disabled={typed.trim().length < 3} onClick={() => onSign({ method: 'aceite_demo', typedName: typed.trim() })}>Aceitar como {signerName.split(' ')[0]}</Button>
        </div>
      )}
    </div>
  )
}

/** Comparador antes/depois com controle por teclado (slider nativo). */
export function ImageCompare({ before, after, label, offset = { x: 0, y: 0 } }: { before: ReactNode; after: ReactNode; label: string; offset?: { x: number; y: number } }) {
  const [pos, setPos] = useState(50)
  return (
    <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
      <div className="compare" aria-hidden="true">
        <div style={{ position: 'absolute', inset: 0 }}>{before}</div>
        <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 0 0 ${pos}%)`, transform: `translate(${offset.x}px, ${offset.y}px)` }}>{after}</div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 2, background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,.3)' }} />
        <span className="badge" style={{ position: 'absolute', left: 8, top: 8 }}>Antes</span>
        <span className="badge" style={{ position: 'absolute', right: 8, top: 8 }}>Depois</span>
      </div>
      <label className="small" htmlFor={`cmp-${label}`}>Posição da divisória ({label})</label>
      <input id={`cmp-${label}`} type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} />
    </div>
  )
}

/** Editor de documento simples (texto + variáveis). Sem HTML arbitrário: renderiza texto puro com quebras. */
export function DocumentEditor({ value, onChange, variables, label = 'Conteúdo do documento' }: { value: string; onChange: (v: string) => void; variables?: { key: string; label: string }[]; label?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const insert = (k: string) => {
    const el = ref.current
    if (!el) return onChange(value + `{{${k}}}`)
    const s = el.selectionStart, e = el.selectionEnd
    const next = value.slice(0, s) + `{{${k}}}` + value.slice(e)
    onChange(next)
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + k.length + 4 })
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {variables && <div className="row" role="group" aria-label="Inserir variável">{variables.map((v) => <button key={v.key} type="button" className="chip" onClick={() => insert(v.key)}>+ {v.label}</button>)}</div>}
      <Textarea ref={ref} id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={10} />
    </div>
  )
}
export function fillTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `[${k}]`)
}

/** Container com zoom e pan internos (nunca causa rolagem horizontal da página). Teclado: +/- e setas. */
export function ZoomPan({ children, height = 360, label }: { children: ReactNode; height?: number; label: string }) {
  const [z, setZ] = useState(1)
  const [p, setP] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  return (
    <div className="zoom-pan" style={{ height }} role="group" aria-label={`${label} (use + e − para zoom, setas para mover)`} tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === '+' || e.key === '=') setZ((v) => Math.min(3, v + 0.2))
        else if (e.key === '-') setZ((v) => Math.max(0.6, v - 0.2))
        else if (e.key.startsWith('Arrow') && e.target === e.currentTarget) {
          e.preventDefault()
          const d = 30
          setP((v) => ({ x: v.x + (e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0), y: v.y + (e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0) }))
        }
      }}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button,[role=button],input')) return; drag.current = { x: e.clientX, y: e.clientY, px: p.x, py: p.y } }}
      onPointerMove={(e) => { if (drag.current) setP({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }) }}
      onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}>
      <div className="zoom-pan-controls">
        <Button size="sm" iconOnly icon={<ZoomIn />} onClick={() => setZ((v) => Math.min(3, v + 0.2))}>Aumentar zoom</Button>
        <Button size="sm" iconOnly icon={<ZoomOut />} onClick={() => setZ((v) => Math.max(0.6, v - 0.2))}>Diminuir zoom</Button>
        <Button size="sm" iconOnly icon={<Maximize />} onClick={() => { setZ(1); setP({ x: 0, y: 0 }) }}>Restaurar visualização</Button>
      </div>
      <div style={{ transform: `translate(${p.x}px, ${p.y}px) scale(${z})`, transformOrigin: 'center top', transition: drag.current ? 'none' : 'transform 120ms', width: '100%', height: '100%' }}>{children}</div>
    </div>
  )
}

/** Marca d'água para documentos de exemplo. */
export function DemoPaper({ children, watermark = 'DEMONSTRAÇÃO — SEM VALIDADE' }: { children: ReactNode; watermark?: string }) {
  return <div className="doc-paper print-area"><div className="watermark" aria-hidden="true">{watermark}</div><div style={{ position: 'relative' }}>{children}</div></div>
}
