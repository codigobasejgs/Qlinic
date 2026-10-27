// Derivação de tokens acessíveis a partir da cor de marca do cliente.
// Regras: nunca texto branco sobre cor clara; status (sucesso/erro/alerta) NÃO mudam com a marca.

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()
}
function lin(c: number) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
}
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a)!, y = hexToRgb(b)!
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t)
}

/** Escurece (ou clareia) a cor até atingir o contraste mínimo contra o fundo. */
export function ensureContrast(color: string, against: string, min = 4.5): string {
  if (contrast(color, against) >= min) return color
  const towards = luminance(against) > 0.5 ? '#000000' : '#FFFFFF'
  for (let t = 0.04; t <= 1; t += 0.04) {
    const c = mix(color, towards, t)
    if (contrast(c, against) >= min) return c
  }
  return towards
}

export interface BrandTokens {
  primary: string
  onPrimary: string
  primaryHover: string
  primarySoft: string
  primaryText: string
  focus: string
}

const LIGHT_SURFACE = '#FFFFFF'
const DARK_SURFACE = '#102632'
const NAVY = '#102A43'

/** Gera tokens acessíveis para light/dark a partir de qualquer cor informada. */
export function deriveBrandTokens(input: string, mode: 'light' | 'dark'): BrandTokens {
  const base = hexToRgb(input) ? input.toUpperCase() : '#0D9488'
  if (mode === 'light') {
    // Botão: fundo marca, texto branco ou navy — escolhe o par que atinge 4.5:1, ajustando a cor se preciso.
    let primary = base
    let onPrimary = '#FFFFFF'
    if (contrast(primary, '#FFFFFF') < 4.5) {
      if (contrast(primary, NAVY) >= 4.5) onPrimary = NAVY
      else primary = ensureContrast(primary, '#FFFFFF', 4.5)
    }
    const primaryText = ensureContrast(base, LIGHT_SURFACE, 4.5)
    return {
      primary, onPrimary,
      primaryHover: onPrimary === '#FFFFFF' ? mix(primary, '#000000', 0.15) : mix(primary, '#FFFFFF', 0.15),
      primarySoft: mix(base, '#FFFFFF', 0.9),
      primaryText,
      focus: ensureContrast(base, LIGHT_SURFACE, 3),
    }
  }
  // dark: versão clara da marca com texto navy
  let primary = base
  if (contrast(primary, DARK_SURFACE) < 4.5) primary = ensureContrast(mix(base, '#FFFFFF', 0.35), DARK_SURFACE, 4.5)
  const onPrimary = contrast(primary, NAVY) >= 4.5 ? NAVY : '#000000'
  return {
    primary, onPrimary,
    primaryHover: mix(primary, '#FFFFFF', 0.2),
    primarySoft: mix(base, DARK_SURFACE, 0.78),
    primaryText: ensureContrast(primary, DARK_SURFACE, 4.5),
    focus: ensureContrast(primary, DARK_SURFACE, 3),
  }
}

export function brandCssVars(input: string, mode: 'light' | 'dark'): Record<string, string> {
  const t = deriveBrandTokens(input, mode)
  return {
    '--q-primary': t.primary, '--q-on-primary': t.onPrimary, '--q-primary-hover': t.primaryHover,
    '--q-primary-soft': t.primarySoft, '--q-primary-text': t.primaryText, '--q-focus': t.focus,
    // texto de marca sobre o fundo suave (chips, badges, passos): ≥ 4,5:1 contra primarySoft
    '--q-on-soft': ensureContrast(t.primaryText, t.primarySoft, 4.5),
  }
}
