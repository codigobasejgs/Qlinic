// SHA-256 síncrono (UTF-8 → hex). Identificador de integridade do snapshot; NÃO comprova autoria nem data.
const K: number[] = []
const H0: number[] = []
;(() => {
  const primes: number[] = []
  for (let n = 2; primes.length < 64; n++) if (primes.every((p) => n % p)) primes.push(n)
  primes.forEach((p, i) => { if (i < 8) H0.push(((Math.sqrt(p) % 1) * 2 ** 32) | 0); K.push(((Math.cbrt(p) % 1) * 2 ** 32) | 0) })
})()
const ror = (x: number, n: number) => (x >>> n) | (x << (32 - n))

export function sha256Hex(text: string): string {
  const b = new TextEncoder().encode(text)
  const l = b.length
  const total = ((l + 9 + 63) >> 6) << 4
  const w = new Array<number>(total).fill(0)
  for (let i = 0; i < l; i++) w[i >> 2] |= b[i] << (24 - (i % 4) * 8)
  w[l >> 2] |= 0x80 << (24 - (l % 4) * 8)
  w[total - 1] = l * 8
  const H = H0.slice()
  const W = new Array<number>(64)
  for (let j = 0; j < total; j += 16) {
    for (let t = 0; t < 64; t++) {
      if (t < 16) W[t] = w[j + t] | 0
      else {
        const a = W[t - 15], c = W[t - 2]
        W[t] = (W[t - 16] + (ror(a, 7) ^ ror(a, 18) ^ (a >>> 3)) + W[t - 7] + (ror(c, 17) ^ ror(c, 19) ^ (c >>> 10))) | 0
      }
    }
    let [a, bb, c, d, e, f, g, h] = H
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) | 0
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0
    }
    ;[a, bb, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) | 0 })
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('')
}
