// Odontograma 2D (SVG próprio). Vista frontal do paciente: 18→11 | 21→28 em cima, 48→41 | 31→38 embaixo.
// Teclado: Tab entra no odontograma (um dente focável por vez), setas navegam, Home/End vão às pontas, Enter/Espaço seleciona.
// Faces também têm botões HTML com aria-label ("Dente 16, face oclusal") no painel do dente selecionado.
import { useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { ZoomPan } from '@/ui'
import type { Face, OdontogramEntry, ToothCondition } from './types'
import { activeEntries, conditionDef, dentitionRows, faceAt, faceLabel, moveInRows, toothName, type Dentition } from './odonto'

export const COND_COLOR: Record<ToothCondition, string> = {
  carie: '#DC2626', restauracao: '#2563EB', selante: '#059669', fratura: '#EA580C',
  ausente: '#475569', extracao: '#B91C1C', endodontia: '#7C3AED', coroa: '#A16207', implante: '#0E7490', protese: '#BE185D',
}
export const COND_CODE: Record<ToothCondition, string> = { carie: 'CA', restauracao: 'RE', selante: 'SE', fratura: 'FR', ausente: 'AU', extracao: 'EX', endodontia: 'EN', coroa: 'CO', implante: 'IM', protese: 'PR' }

const CELL = 48, T = 40, MID = 8
const REGIONS = ['top', 'bottom', 'left', 'right', 'center'] as const
const POLY: Record<(typeof REGIONS)[number], string> = {
  top: '0,0 40,0 28,12 12,12', bottom: '0,40 12,28 28,28 40,40', left: '0,0 12,12 12,28 0,40', right: '40,0 40,40 28,28 28,12', center: '12,12 28,12 28,28 12,28',
}

const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)') : null
export function useIsMobile() {
  return useSyncExternalStore((cb) => { mq?.addEventListener('change', cb); return () => mq?.removeEventListener('change', cb) }, () => !!mq?.matches, () => false)
}

function rowX(n: number, i: number, width: number) {
  const mid = width / 2
  return i < n / 2 ? mid - MID / 2 - (n / 2 - i) * CELL + (CELL - T) / 2 : mid + MID / 2 + (i - n / 2) * CELL + (CELL - T) / 2
}

export function Odontogram({ entries, dentition, selected, selectedFaces, onSelect, onFace }: {
  entries: OdontogramEntry[]; dentition: Dentition; selected: number | null; selectedFaces: Face[]
  onSelect: (tooth: number) => void; onFace: (tooth: number, face: Face) => void
}) {
  const rows = dentitionRows(dentition)
  const mobile = useIsMobile()
  const [focusTooth, setFocusTooth] = useState<number>(selected ?? rows[0][0])
  const refs = useRef(new Map<number, SVGGElement>())
  const width = 16 * CELL + MID + 8
  const ROW_H = 76
  const TOP_PAD = 14
  const upperCount = rows.length / 2
  const height = rows.length * ROW_H + 14 + TOP_PAD
  const current = rows.some((r) => r.includes(focusTooth)) ? focusTooth : rows[0][0]

  const onKey = (e: KeyboardEvent, tooth: number) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(tooth); return }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    e.stopPropagation()
    const next = moveInRows(rows, tooth, e.key as Parameters<typeof moveInRows>[2])
    setFocusTooth(next)
    refs.current.get(next)?.focus()
  }

  const svg = (
    <svg viewBox={`0 0 ${width} ${height}`} className="odo-svg" role="group" aria-label={`Odontograma — dentição ${dentition}. Use as setas para navegar entre dentes e Enter para selecionar.`}>
      <defs>
        {(Object.keys(COND_COLOR) as ToothCondition[]).map((k) => (
          <g key={k}>
            <pattern id={`odo-h-${k}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" className="odo-face-bg" /><line x1="0" y1="0" x2="0" y2="6" stroke={COND_COLOR[k]} strokeWidth="3" /></pattern>
            <pattern id={`odo-d-${k}`} width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill={COND_COLOR[k]} /><circle cx="3" cy="3" r="1.3" fill="#fff" /></pattern>
          </g>
        ))}
      </defs>
      <line x1={width / 2} y1={4} x2={width / 2} y2={height - 4} className="odo-midline" />
      <line x1={8} y1={TOP_PAD + upperCount * ROW_H + 7} x2={width - 8} y2={TOP_PAD + upperCount * ROW_H + 7} className="odo-midline" />
      <text x={10} y={11} className="odo-side">Direito do paciente</text>
      <text x={width - 10} y={11} className="odo-side" textAnchor="end">Esquerdo do paciente</text>
      {rows.map((row, ri) => {
        const upper = ri < upperCount
        const y0 = TOP_PAD + ri * ROW_H + (upper ? 0 : 14)
        const toothY = upper ? y0 + 18 : y0 + 4
        return row.map((tooth, i) => {
          const x = rowX(row.length, i, width)
          const list = activeEntries(entries, tooth)
          const toothLevel = list.filter((e) => conditionDef(e.condition)?.scope === 'dente')
          const absent = toothLevel.some((e) => (e.condition === 'ausente') || (e.condition === 'extracao' && e.state === 'realizado'))
          const plannedExtraction = toothLevel.some((e) => e.condition === 'extracao' && e.state === 'planejado')
          const isSel = selected === tooth
          const codes = toothLevel.filter((e) => e.condition !== 'ausente').slice(-3)
          const label = `Dente ${tooth}, ${toothName(tooth)}. ${list.length ? `${list.length} marcação(ões)` : 'Sem marcações'}${isSel ? '. Selecionado' : ''}`
          return (
            <g key={tooth} ref={(el) => { if (el) refs.current.set(tooth, el); else refs.current.delete(tooth) }}
              className={`odo-tooth${isSel ? ' sel' : ''}${absent ? ' absent' : ''}`} transform={`translate(${x}, 0)`}
              role="button" tabIndex={tooth === current ? 0 : -1} aria-label={label} aria-pressed={isSel}
              onKeyDown={(e) => onKey(e, tooth)} onFocus={() => setFocusTooth(tooth)}>
              <text x={T / 2} y={upper ? y0 + 13 : toothY + T + 22} textAnchor="middle" className="odo-num" onClick={() => onSelect(tooth)}>{tooth}</text>
              <g transform={`translate(0, ${toothY})`}>
                <rect x={-3} y={-3} width={T + 6} height={T + 6} rx={6} className="odo-ring" />
                {REGIONS.map((reg) => {
                  const face = faceAt(tooth, reg)
                  const onFaceEntries = list.filter((e) => e.faces.includes(face) && conditionDef(e.condition)?.scope !== 'dente')
                  const solid = [...onFaceEntries].reverse().find((e) => e.state !== 'planejado')
                  const planned = [...onFaceEntries].reverse().find((e) => e.state === 'planejado')
                  const fSel = isSel && selectedFaces.includes(face)
                  return (
                    <g key={reg} onClick={() => onFace(tooth, face)} className="odo-face-g">
                      <title>{`Dente ${tooth}, face ${faceLabel(tooth, face)}`}</title>
                      <polygon points={POLY[reg]} className="odo-face" style={solid?.condition ? { fill: solid.state === 'realizado' ? `url(#odo-d-${solid.condition})` : COND_COLOR[solid.condition] } : undefined} />
                      {planned?.condition && <polygon points={POLY[reg]} className="odo-face-over" style={{ fill: `url(#odo-h-${planned.condition})`, opacity: solid ? 0.85 : 1 }} />}
                      {fSel && <polygon points={POLY[reg]} className="odo-face-sel" />}
                    </g>
                  )
                })}
                {absent && <g className="odo-x"><line x1="2" y1="2" x2="38" y2="38" /><line x1="38" y1="2" x2="2" y2="38" /></g>}
                {plannedExtraction && !absent && <line x1="38" y1="2" x2="2" y2="38" className="odo-ext" />}
              </g>
              <g transform={`translate(0, ${upper ? toothY + T + 3 : y0 - 10})`}>
                {codes.slice(0, 2).map((e, k) => {
                  const c = COND_COLOR[e.condition!]
                  return (
                    <g key={e.id} transform={`translate(${k * 21 - 1}, 0)`}>
                      <rect width={19} height={11} rx={3} fill={e.state === 'planejado' ? 'none' : c} stroke={c} strokeWidth={1.2} strokeDasharray={e.state === 'planejado' ? '2 1.5' : undefined} className={e.state === 'planejado' ? 'odo-code-planned' : undefined} />
                      <text x={9.5} y={8.6} textAnchor="middle" className="odo-code" style={{ fill: e.state === 'planejado' ? c : '#fff' }}>{COND_CODE[e.condition!]}{e.state === 'realizado' ? '✓' : ''}</text>
                    </g>
                  )
                })}
                {codes.length > 2 && <text x={T + 4} y={9} className="odo-code-more">+{codes.length - 2}</text>}
              </g>
            </g>
          )
        })
      })}
    </svg>
  )
  return mobile
    ? <ZoomPan label="Odontograma (arraste para mover)" height={rows.length > 2 ? 300 : 200}>{svg}</ZoomPan>
    : <div className="odo-wrap">{svg}</div>
}

export function OdontogramLegend() {
  const conds = Object.keys(COND_COLOR) as ToothCondition[]
  return (
    <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
      <div className="legend" aria-label="Legenda de estados">
        <span><svg width="18" height="18" aria-hidden="true"><rect width="18" height="18" rx="3" fill="#2563EB" /></svg>Existente (preenchido)</span>
        <span><svg width="18" height="18" aria-hidden="true"><defs><pattern id="lg-h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#2563EB" strokeWidth="2.5" /></pattern></defs><rect width="18" height="18" rx="3" fill="url(#lg-h)" stroke="#2563EB" strokeDasharray="3 2" /></svg>Planejado (hachurado / contorno tracejado)</span>
        <span><svg width="18" height="18" aria-hidden="true"><defs><pattern id="lg-d" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#2563EB" /><circle cx="3" cy="3" r="1.3" fill="#fff" /></pattern></defs><rect width="18" height="18" rx="3" fill="url(#lg-d)" /></svg>Realizado (pontilhado / ✓)</span>
        <span><svg width="18" height="18" aria-hidden="true"><rect width="18" height="18" rx="3" fill="none" stroke="#475569" /><line x1="2" y1="2" x2="16" y2="16" stroke="#475569" strokeWidth="2" /><line x1="16" y1="2" x2="2" y2="16" stroke="#475569" strokeWidth="2" /></svg>Ausente (X)</span>
      </div>
      <div className="legend" aria-label="Legenda de condições">
        {conds.map((k) => <span key={k}><span className="odo-chip" style={{ background: COND_COLOR[k] }} aria-hidden="true">{COND_CODE[k]}</span>{conditionDef(k)?.label}</span>)}
      </div>
    </div>
  )
}
