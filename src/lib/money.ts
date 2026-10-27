// Dinheiro sempre em centavos inteiros (number seguro até 2^53). Arredondamento: half-up em centavos.

export type Cents = number

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(cents: Cents): string {
  return brl.format(cents / 100)
}

/** "1.234,56" | "1234,56" | "1234.56" | "R$ 10" → centavos. Retorna null se inválido. */
export function parseBRL(input: string): Cents | null {
  const s = input.replace(/R\$\s?/g, '').trim()
  if (!s) return null
  let norm = s
  if (s.includes(',')) norm = s.replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d{0,2})?$/.test(norm)) return null
  return Math.round(Number(norm) * 100)
}

/** Percentual (ex.: 12.5 = 12,5%) aplicado em centavos, half-up. */
export function percentOf(cents: Cents, percent: number): Cents {
  return Math.round((cents * percent) / 100)
}

/** Divide total em n parcelas; diferença de centavos vai para a primeira parcela. Soma sempre = total. */
export function splitInstallments(total: Cents, n: number): Cents[] {
  if (!Number.isInteger(n) || n < 1) throw new Error('Número de parcelas inválido')
  if (!Number.isInteger(total)) throw new Error('Total deve estar em centavos inteiros')
  const base = Math.trunc(total / n)
  const rest = total - base * n
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + rest : base))
}

/** Rateio proporcional por pesos (largest remainder). Soma sempre = total. */
export function allocate(total: Cents, weights: number[]): Cents[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / sum)
  const floored = raw.map(Math.floor)
  let rest = total - floored.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (rest <= 0) break
    floored[i] += 1
    rest -= 1
  }
  return floored
}

export function sum(values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0)
}

/** Markup sobre custo vs margem sobre preço — conceitos distintos. */
export function priceFromMarkup(cost: Cents, markupPercent: number): Cents {
  return cost + percentOf(cost, markupPercent)
}
export function marginPercent(price: Cents, cost: Cents): number {
  if (price <= 0) return 0
  return ((price - cost) / price) * 100
}
export function markupPercent(price: Cents, cost: Cents): number {
  if (cost <= 0) return 0
  return ((price - cost) / cost) * 100
}
