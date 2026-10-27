/** ID aleatório (demo). Produção: gerado no servidor. */
export function uid(prefix = ''): string {
  const r = crypto.getRandomValues(new Uint32Array(2))
  return `${prefix}${r[0].toString(36)}${r[1].toString(36)}`
}

/** PRNG determinístico (mulberry32) para seed reprodutível. */
export function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
  }
}

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export function initials(name: string): string {
  return name.split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]/.test(p)).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

/** "Maria Souza Lima" → "Maria S." (painel de chamada / privacidade). */
export function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ')
}

export function groupBy<T, K extends string | number>(arr: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>
  for (const item of arr) (out[key(item)] ??= []).push(item)
  return out
}

/** CSV seguro contra formula injection (=,+,-,@,tab,CR prefixados com '). */
export function toCSV(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  const esc = (v: unknown) => {
    let s = v == null ? '' : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[;"\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n')
}

/** Parser CSV simples (vírgula ou ponto e vírgula, aspas). Entrada não confiável. */
export function parseCSV(text: string): string[][] {
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) >= (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

export function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob(['﻿' + content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** CPF fictício com dígitos verificadores válidos, prefixo 000 para nunca coincidir com real conhecido. */
export function fakeCPF(n: number): string {
  const base = ('000' + String(100000 + (n % 900000))).slice(-9).split('').map(Number)
  const dv = (arr: number[]) => {
    const s = arr.reduce((acc, d, i) => acc + d * (arr.length + 1 - i), 0)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dv(base)
  const d2 = dv([...base, d1])
  const all = [...base, d1, d2].join('')
  return `${all.slice(0, 3)}.${all.slice(3, 6)}.${all.slice(6, 9)}-${all.slice(9)}`
}

export function maskCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}
export function maskCNPJ(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}
export function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}
export function maskCEP(v: string): string {
  return v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')
}
export function isValidCPF(v: string): boolean {
  const d = v.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const calc = (len: number) => {
    let s = 0
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}
