// QR Code real (SVG) a partir do encoder puro em ./qrcode. Conteúdo: apenas o token opaco de check-in.
import { useMemo } from 'react'
import { encodeQR } from './qrcode'

const QUIET = 4

export function QRCode({ value, size = 160, label }: { value: string; size?: number; label: string }) {
  const qr = useMemo(() => encodeQR(value), [value])
  const d = useMemo(() => {
    let s = ''
    qr.modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) s += `M${x + QUIET} ${y + QUIET}h1v1h-1z` }))
    return s
  }, [qr])
  const dim = qr.size + QUIET * 2
  // Cores fixas preto/branco: leitores de QR exigem alto contraste independente do tema (ilustração).
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${dim} ${dim}`} shapeRendering="crispEdges" style={{ background: '#fff', borderRadius: 8 }}>
      <rect width={dim} height={dim} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}
