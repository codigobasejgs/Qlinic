// QR Code (ISO/IEC 18004) em TypeScript puro: modo byte, correção M, versões 1–6.
// ponytail: versões 1–6 cobrem até 106 bytes (tokens curtos de check-in). Para conteúdo maior, adicionar tabelas v7+ (exige bloco de versão).
// Sem dependências; pensado para o token opaco do check-in (nunca dados clínicos).

/** Total de codewords, EC por bloco e nº de blocos (nível M). Todos os blocos têm o mesmo tamanho em v1–6/M. */
const EC_M: Record<number, { total: number; ec: number; blocks: number }> = {
  1: { total: 26, ec: 10, blocks: 1 },
  2: { total: 44, ec: 16, blocks: 1 },
  3: { total: 70, ec: 26, blocks: 1 },
  4: { total: 100, ec: 18, blocks: 2 },
  5: { total: 134, ec: 24, blocks: 2 },
  6: { total: 172, ec: 16, blocks: 4 },
}
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] }
/** Bits de formato do nível M = 00. */
const ECL_M_BITS = 0

export interface QrMatrix { version: number; size: number; mask: number; modules: boolean[][] }

export function maxBytes(version: number): number {
  const c = EC_M[version]
  return Math.floor(((c.total - c.ec * c.blocks) * 8 - 12) / 8)
}

// ---------- GF(256) / Reed–Solomon (polinômio 0x11D) ----------
function gfMul(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}
function rsDivisor(degree: number): number[] {
  const r = new Array<number>(degree).fill(0)
  r[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], root)
      if (j + 1 < r.length) r[j] ^= r[j + 1]
    }
    root = gfMul(root, 0x02)
  }
  return r
}
export function rsRemainder(data: number[], divisor: number[]): number[] {
  const r = divisor.map(() => 0)
  for (const b of data) {
    const factor = b ^ (r.shift() as number)
    r.push(0)
    divisor.forEach((coef, i) => { r[i] ^= gfMul(coef, factor) })
  }
  return r
}

// ---------- Codificação ----------
function dataCodewords(bytes: number[], version: number): number[] {
  const { total, ec, blocks } = EC_M[version]
  const cap = total - ec * blocks
  const bits: number[] = []
  const push = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
  push(0b0100, 4) // modo byte
  push(bytes.length, 8) // contador (v1–9)
  bytes.forEach((b) => push(b, 8))
  push(0, Math.min(4, cap * 8 - bits.length)) // terminador
  while (bits.length % 8) bits.push(0)
  const out: number[] = []
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
  for (let pad = 0xec; out.length < cap; pad ^= 0xec ^ 0x11) out.push(pad)
  return out
}

function interleave(data: number[], version: number): number[] {
  const { ec, blocks } = EC_M[version]
  const per = data.length / blocks
  const div = rsDivisor(ec)
  const dB: number[][] = [], eB: number[][] = []
  for (let b = 0; b < blocks; b++) {
    const d = data.slice(b * per, (b + 1) * per)
    dB.push(d)
    eB.push(rsRemainder(d, div))
  }
  const out: number[] = []
  for (let i = 0; i < per; i++) dB.forEach((d) => out.push(d[i]))
  for (let i = 0; i < ec; i++) eB.forEach((e) => out.push(e[i]))
  return out
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

/** Codifica texto (UTF-8) em matriz QR. Lança erro se não couber em v6/M. */
export function encodeQR(text: string, forceMask?: number): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text))
  const version = [1, 2, 3, 4, 5, 6].find((v) => bytes.length <= maxBytes(v))
  if (!version) throw new Error(`Conteúdo longo demais para QR v1–6 (máx. ${maxBytes(6)} bytes).`)
  const size = 17 + 4 * version
  const m = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, dark: boolean) => { m[y][x] = dark; fn[y][x] = true }

  // Timing, finders (+ separadores), alinhamento
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy
      if (x < 0 || y < 0 || x >= size || y >= size) continue
      const d = Math.max(Math.abs(dx), Math.abs(dy))
      set(x, y, d !== 2 && d !== 4)
    }
  }
  const pos = ALIGN[version]
  const last = pos.length - 1
  pos.forEach((ay, i) => pos.forEach((ax, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }))

  const drawFormat = (mask: number) => {
    const data = (ECL_M_BITS << 3) | mask
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((data << 10) | rem) ^ 0x5412
    const bit = (i: number) => ((bits >>> i) & 1) === 1
    for (let i = 0; i <= 5; i++) set(8, i, bit(i))
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
    set(8, size - 8, true) // módulo escuro fixo
  }
  drawFormat(0) // reserva as áreas de formato

  // Codewords em zigue-zague
  const cw = interleave(dataCodewords(bytes, version), version)
  let k = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    const upward = ((right + 1) & 2) === 0
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = upward ? size - 1 - v : v
      if (!fn[y][x] && k < cw.length * 8) { m[y][x] = ((cw[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++ }
    }
  }

  const applyMask = (mask: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x]
  }
  let mask = forceMask ?? -1
  if (mask < 0) {
    let best = Infinity
    for (let i = 0; i < 8; i++) {
      applyMask(i); drawFormat(i)
      const p = penalty(m)
      if (p < best) { best = p; mask = i }
      applyMask(i) // desfaz (XOR)
    }
  }
  applyMask(mask)
  drawFormat(mask)
  return { version, size, mask, modules: m }
}

/** Penalidade padrão (regras N1–N4). Afeta só a escolha da máscara, não a decodificação. */
function penalty(m: boolean[][]): number {
  const n = m.length
  let p = 0
  const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
  const scan = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < n; i++) {
      let run = 1
      for (let j = 1; j <= n; j++) {
        if (j < n && get(i, j) === get(i, j - 1)) run++
        else { if (run >= 5) p += run - 2; run = 1 }
      }
      for (let j = 0; j + 10 < n; j++) {
        if (A.every((v, q) => (v === 1) === get(i, j + q)) || B.every((v, q) => (v === 1) === get(i, j + q))) p += 40
      }
    }
  }
  scan((i, j) => m[i][j])
  scan((i, j) => m[j][i])
  let dark = 0
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (m[y][x]) dark++
    if (x < n - 1 && y < n - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3
  }
  p += 10 * Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5)
  return p
}
