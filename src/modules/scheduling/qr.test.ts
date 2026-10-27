import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encodeQR, maxBytes, rsRemainder } from './qrcode'

const finderAt = (m: boolean[][], x0: number, y0: number) => {
  for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
    const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3))
    if (m[y0 + dy][x0 + dx] !== (d !== 2)) return false
  }
  return true
}

describe('QR Code (byte, ECC M, v1–6)', () => {
  it('escolhe a menor versão e o tamanho correto da matriz', () => {
    expect(encodeQR('A1B2C3D4E5').version).toBe(1)
    expect(encodeQR('A1B2C3D4E5').size).toBe(21)
    expect(encodeQR('x'.repeat(maxBytes(1) + 1)).size).toBe(25)
    expect(encodeQR('x'.repeat(maxBytes(6))).size).toBe(41)
    expect(maxBytes(1)).toBe(14)
    expect(maxBytes(6)).toBe(106)
    expect(() => encodeQR('x'.repeat(107))).toThrow()
  })

  it('tem os três padrões de localização, timing e módulo escuro', () => {
    for (const text of ['CK12AB34CD', 'https://exemplo.test/c/sorriso-pleno/totem?t=ABCDEFGHIJ', 'y'.repeat(100)]) {
      const { modules: m, size } = encodeQR(text)
      expect(finderAt(m, 0, 0)).toBe(true)
      expect(finderAt(m, size - 7, 0)).toBe(true)
      expect(finderAt(m, 0, size - 7)).toBe(true)
      for (let i = 8; i < size - 8; i++) { expect(m[6][i]).toBe(i % 2 === 0); expect(m[i][6]).toBe(i % 2 === 0) }
      expect(m[size - 8][8]).toBe(true)
    }
  })

  it('Reed–Solomon: vetor conhecido (ISO 18004 anexo I, "01234567" v1-M)', () => {
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11]
    // gerador grau 10, calculado independentemente do módulo
    const mul = (x: number, y: number) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x } return z & 0xff }
    const gen = new Array<number>(10).fill(0)
    gen[9] = 1
    let root = 1
    for (let i = 0; i < 10; i++) { for (let j = 0; j < 10; j++) { gen[j] = mul(gen[j], root); if (j + 1 < 10) gen[j] ^= gen[j + 1] } root = mul(root, 2) }
    expect(rsRemainder(data, gen)).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55])
  })

  it('decodifica com OpenCV quando disponível (python + cv2)', () => {
    const py = spawnSync('python', ['-P', '-c', 'import cv2, numpy'], { encoding: 'utf8' })
    if (py.status !== 0) { console.warn('OpenCV indisponível: decodificação real não verificada neste ambiente.'); return }
    const samples = ['CK7Q2ZP4XA', 'Qlinic check-in demo 123', 'z'.repeat(60), 'Ação ç ü — UTF-8', 'w'.repeat(106)]
    const dir = mkdtempSync(join(tmpdir(), 'qr-'))
    const file = join(dir, 'm.json')
    writeFileSync(file, JSON.stringify(samples.map((s) => encodeQR(s).modules.map((r) => r.map(Number)))))
    const script = [
      'import sys, json, cv2, numpy as np',
      'out=[]',
      'for m in json.load(open(sys.argv[1])):',
      '  a=np.array(m,dtype=np.uint8); a=np.pad(a,4); img=((1-a)*255).astype(np.uint8)',
      '  img=cv2.resize(img,(a.shape[0]*10,)*2,interpolation=cv2.INTER_NEAREST)',
      '  t,_,_=cv2.QRCodeDetector().detectAndDecode(img); out.append(t)',
      'sys.stdout.buffer.write(json.dumps(out).encode("utf-8"))',
    ].join('\n')
    // -P: não adiciona cwd ao sys.path (evita módulos plantados); site-packages do usuário (cv2) continua visível.
    const r = spawnSync('python', ['-P', '-c', script, file], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual(samples)
  })
})
