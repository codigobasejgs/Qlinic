// Editor de marca e PWA. Lê/grava org.brand via platformDb (updateOrg), imagens como dataUrl (demo).
import { useCallback, useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { useTenant, useActor } from '@/app/session'
import { useCollection } from '@/data/store'
import { Alert, Badge, Button, Field, FileUpload, Input, PageHeader, Section, Tabs, TabPanel, useAction } from '@/ui'
import { ThemeToggle } from '@/ui/brand'
import { InstallAppButton } from '@/pwa/client'
import { hasPublishedPwa } from '@/domain/tenancy'
import { deriveBrandTokens, contrast } from '@/lib/color'
import { cx } from '@/lib/util'
import { brandReport, isHex, updateOrg, getProfile, saveProfile } from './lib'
import { ReadOnlyNote, SaveBar } from './org'

import './styles.css'

/** Validar dimensão mínima lendo a imagem em elemento <img>. */
async function checkDims(dataUrl: string, minW = 64, minH = 64): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth >= minW && img.naturalHeight >= minH ? null : `Imagem muito pequena (${img.naturalWidth}×${img.naturalHeight}px, mínimo ${minW}×${minH}px).`)
    img.onerror = () => resolve('Não foi possível ler as dimensões da imagem.')
    img.src = dataUrl
  })
}

/** Crop quadrado simples via canvas. Zoom via roda do mouse e teclado. Teclado: setas para mover, +/- zoom. */
function CropCanvas({ src, onCrop, onCancel }: { src: string; onCrop: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragging = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const SIZE = 260
  const draw = useCallback((img: HTMLImageElement, z: number, p: { x: number; y: number }) => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, SIZE, SIZE)
    const k = (SIZE / Math.min(img.naturalWidth, img.naturalHeight)) * z
    const w = img.naturalWidth * k, h = img.naturalHeight * k
    ctx.drawImage(img, SIZE / 2 - w / 2 + p.x, SIZE / 2 - h / 2 + p.y, w, h)
  }, [])
  useEffect(() => {
    const img = new Image()
    img.onload = () => { imgRef.current = img; draw(img, zoom, pos) }
    img.src = src
  }, [src]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (imgRef.current) draw(imgRef.current, zoom, pos) }, [zoom, pos, draw])
  const adjust = (dz: number) => setZoom((z) => Math.round(Math.min(4, Math.max(0.3, z + dz)) * 10) / 10)
  const crop = () => {
    const c = canvasRef.current!
    const out = document.createElement('canvas')
    out.width = 512; out.height = 512
    out.getContext('2d')!.drawImage(c, 0, 0, SIZE, SIZE, 0, 0, 512, 512)
    onCrop(out.toDataURL('image/png'))
  }
  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <p className="small muted" style={{ textAlign: 'center' }}>Arraste ou use as setas para mover; + e − (ou os botões) para zoom. O círculo tracejado marca a área segura (80%) do ícone maskable.</p>
      <div className="st-crop" style={{ width: SIZE, height: SIZE }} tabIndex={0} aria-label="Área de recorte do ícone. Use setas para mover e +/- para zoom."
        onKeyDown={(e) => {
          if (e.key === '+' || e.key === '=') { e.preventDefault(); adjust(0.1) }
          else if (e.key === '-') { e.preventDefault(); adjust(-0.1) }
          else if (e.key === 'ArrowLeft') setPos((p) => ({ ...p, x: p.x - 12 }))
          else if (e.key === 'ArrowRight') setPos((p) => ({ ...p, x: p.x + 12 }))
          else if (e.key === 'ArrowUp') setPos((p) => ({ ...p, y: p.y - 12 }))
          else if (e.key === 'ArrowDown') setPos((p) => ({ ...p, y: p.y + 12 }))
        }}
        onWheel={(e) => { e.preventDefault(); adjust(e.deltaY < 0 ? 0.1 : -0.1) }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y } }}
        onPointerMove={(e) => { if (dragging.current) setPos({ x: dragging.current.px + e.clientX - dragging.current.sx, y: dragging.current.py + e.clientY - dragging.current.sy }) }}
        onPointerUp={() => { dragging.current = null }}>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ display: 'block', width: SIZE, height: SIZE }} />
        <div className="st-safe" aria-hidden="true" />
      </div>
      <div className="row" role="group" aria-label="Zoom do recorte">
        <Button size="sm" onClick={() => adjust(-0.1)}>Diminuir zoom</Button>
        <span className="small" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <Button size="sm" onClick={() => adjust(0.1)}>Aumentar zoom</Button>
        <Button size="sm" onClick={() => { setZoom(1); setPos({ x: 0, y: 0 }) }}>Centralizar</Button>
      </div>
      <div className="row">
        <Button onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" onClick={crop}>Usar este recorte</Button>
      </div>
    </div>
  )
}

function LogoUpload({ label, hint, value, onValue, onError, minW = 64, minH = 64, bg = '#FFFFFF' }: { label: string; hint?: ReactNode; value?: string; onValue: (v: string) => void; onError: (e: string) => void; minW?: number; minH?: number; bg?: string }) {
  return <div className="stack">
    {value && <div className="st-logo-box" style={{ background: bg }}><img src={value} alt={`Prévia: ${label.replace('Enviar ', '')}`} /></div>}
    <FileUpload accept={['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']} maxMb={2} label={label} hint={hint}
      onFile={async (f) => {
        if (f.mime === 'image/svg+xml') { onError('SVG requer sanitização no servidor — futuro. Envie PNG, JPEG ou WebP.'); return }
        const e = await checkDims(f.dataUrl, minW, minH)
        if (e) { onError(e); return }
        onValue(f.dataUrl)
      }} />
  </div>
}

export interface BrandDraft { name: string; primary: string; initials: string; logoUrl?: string; logoDarkUrl?: string; symbolUrl?: string; splashBg: string; logoBg: string }

function IconFace({ d, size = 56, shape, inset }: { d: BrandDraft; size?: number; shape: 'square' | 'circle' | 'squircle'; inset?: boolean }) {
  const tk = deriveBrandTokens(d.primary, 'light')
  return <span className={cx('st-icon', shape)} style={{ width: size, height: size, background: tk.primary }} aria-hidden="true">
    {d.symbolUrl ? <img src={d.symbolUrl} alt="" style={inset ? { width: '80%', height: '80%' } : undefined} /> : <span style={{ color: tk.onPrimary, fontWeight: 800, fontSize: size * 0.36 }}>{d.initials || '?'}</span>}
  </span>
}

/** Prévias desktop (claro/escuro), celular, ícones any + maskable e splash. Usa a marca em edição. */
export function BrandLivePreviews({ d }: { d: BrandDraft }) {
  const L = deriveBrandTokens(d.primary, 'light'), D = deriveBrandTokens(d.primary, 'dark')
  const splashText = contrast('#102A43', d.splashBg) >= contrast('#FFFFFF', d.splashBg) ? '#102A43' : '#FFFFFF'
  const header = (mode: 'light' | 'dark') => {
    const tk = mode === 'light' ? L : D
    const bg = mode === 'light' ? '#FFFFFF' : '#102632', fg = mode === 'light' ? '#102A43' : '#F1F5F9'
    const logo = mode === 'dark' ? d.logoDarkUrl ?? d.logoUrl : d.logoUrl
    return <div className="st-device" style={{ background: bg, color: fg }}>
      <div className="st-device-head" style={{ borderBottomColor: mode === 'light' ? '#DCE5EC' : '#294553' }}>
        {logo ? <img src={logo} alt="" style={{ height: 28, maxWidth: 140, objectFit: 'contain' }} /> : <><IconFace d={d} size={28} shape="square" /><strong className="truncate" style={{ fontSize: 14 }}>{d.name}</strong></>}
        <span className="grow" />
        <span className="st-fake-btn" style={{ background: tk.primary, color: tk.onPrimary }}>Agendar</span>
      </div>
      <div className="st-device-body">
        <span>Tema {mode === 'light' ? 'claro' : 'escuro'} · <span style={{ color: tk.primaryText, fontWeight: 600, textDecoration: 'underline' }}>link da clínica</span></span>
        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: tk.primarySoft, color: tk.primaryText, fontWeight: 600, alignSelf: 'flex-start' }}>Confirmada</span>
      </div>
    </div>
  }
  const col = { margin: 0, '--gap': '8px' } as CSSProperties
  const cell = { '--gap': '4px', alignItems: 'center' } as CSSProperties
  return <div className="st-previews" role="group" aria-label="Prévias da identidade">
    <figure className="stack" style={col}><figcaption className="small strong">Cabeçalho (desktop, claro e escuro)</figcaption>{header('light')}{header('dark')}</figure>
    <figure className="stack" style={col}><figcaption className="small strong">Celular — tela inicial e ícones</figcaption>
      <div className="st-home" aria-hidden="true">
        {['Agenda', 'Notas', 'Fotos'].map((a) => <figure key={a}><span className="st-icon squircle ghost" /><figcaption>{a}</figcaption></figure>)}
        <figure><IconFace d={d} shape="squircle" inset /><figcaption>{d.name}</figcaption></figure>
      </div>
      <div className="row" style={{ justifyContent: 'space-around' }}>
        <span className="stack" style={cell}><IconFace d={d} shape="square" /><span className="tiny muted">any</span></span>
        <span className="stack" style={cell}><IconFace d={d} shape="circle" inset /><span className="tiny muted">maskable · círculo</span></span>
        <span className="stack" style={cell}><IconFace d={d} shape="squircle" inset /><span className="tiny muted">maskable · squircle</span></span>
      </div>
    </figure>
    <figure className="stack" style={col}><figcaption className="small strong">Abertura do app (splash)</figcaption>
      <div className="st-splash" style={{ background: d.splashBg, color: splashText }} aria-hidden="true">
        <IconFace d={d} size={72} shape="squircle" inset /><strong style={{ fontSize: 13, textAlign: 'center', padding: '0 8px' }}>{d.name}</strong>
      </div>
    </figure>
  </div>
}

/** Tabela de contraste light/dark (pares derivados por deriveBrandTokens). */
function ContrastTable({ input }: { input: string }) {
  const { rows } = brandReport(input)
  return <div className="scroll-x">
    <table className="table">
      <caption className="sr-only">Contraste dos pares de cores derivados da marca</caption>
      <thead><tr><th scope="col">Tema</th><th scope="col">Uso</th><th scope="col">Amostra</th><th scope="col" className="num">Contraste</th><th scope="col">Situação</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>
        <td>{r.mode}</td><td>{r.pair}</td>
        <td><span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 6, background: r.bg, color: r.fg, border: '1px solid var(--q-border)', fontWeight: 700 }}>Aa</span> <span className="tiny muted mono">{r.fg}/{r.bg}</span></td>
        <td className="num">{r.ratio.toFixed(2)}:1 <span className="tiny muted">(mín. {r.min}:1)</span></td>
        <td>{r.ratio >= r.min ? <Badge tone="success">Atende AA</Badge> : <Badge tone="danger">Abaixo do mínimo</Badge>}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

/** Editor de marca reutilizável (Onboarding step 4 e BrandPwaPage). */
export function BrandEditor({ onSaved }: { onSaved?: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  useCollection(t.tenantId, 'clinicProfile')
  const editable = t.can('marca', 'update')
  const prof = getProfile(t.org)
  const brand = t.org.brand
  const [color, setColor] = useState(brand.primary)
  const [colorInput, setColorInput] = useState(brand.primary)
  const [initials, setInitials] = useState(brand.initials)
  const [logoUrl, setLogoUrl] = useState<string | undefined>(brand.logoUrl)
  const [logoDarkUrl, setLogoDarkUrl] = useState<string | undefined>(brand.logoDarkUrl)
  const [symbolUrl, setSymbolUrl] = useState<string | undefined>(brand.symbolUrl)
  const [logoBg, setLogoBg] = useState(prof.brandExtras.logoBackground ?? '#FFFFFF')
  const [splashBg, setSplashBg] = useState(prof.brandExtras.splashBackground ?? '#F7FAFC')
  const [cropSrc, setCropSrc] = useState<string | undefined>()
  const [cropTarget, setCropTarget] = useState<'logo' | 'logoDark' | 'symbol'>('symbol')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const setError = (k: string, v: string | null) => setErrors((e) => v ? { ...e, [k]: v } : Object.fromEntries(Object.entries(e).filter(([ek]) => ek !== k)))
  const hexOk = isHex(color)
  const report = hexOk ? brandReport(color) : null
  const lightAdj = report?.lightAdjusted
  const darkAdj = report?.darkAdjusted
  const navyText = report?.navyText
  const draft: BrandDraft = { name: t.org.name, primary: hexOk ? color : brand.primary, initials: initials.trim().toUpperCase(), logoUrl, logoDarkUrl, symbolUrl, splashBg, logoBg }
  const save = () => run(() => {
    if (!hexOk) throw new Error('Cor da marca inválida. Use um código hexadecimal de 6 dígitos (ex.: #0D9488).')
    if (Object.keys(errors).length) throw new Error('Corrija os erros antes de salvar.')
    if (initials.trim().length < 1 || initials.trim().length > 3) throw new Error('Use 1 a 3 iniciais.')
    updateOrg(t.org, { brand: { ...brand, primary: color, initials: initials.trim().toUpperCase(), logoUrl, logoDarkUrl, symbolUrl, version: brand.version + 1 } }, actor, 'marca atualizada')
    saveProfile(t.org, { brandExtras: { logoBackground: logoBg, symbolBackground: color, splashBackground: splashBg } })
    onSaved?.()
  }, `Marca salva. Versão ${brand.version + 1} aplicada à interface.`)
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
      {!editable && <ReadOnlyNote what="a marca" />}
      {cropSrc && <Section title={`Recortar: ${cropTarget === 'logoDark' ? 'logo versão escura' : cropTarget === 'symbol' ? 'símbolo' : 'logo'}`}>
        <CropCanvas src={cropSrc} onCrop={(d) => { if (cropTarget === 'symbol') setSymbolUrl(d); else if (cropTarget === 'logoDark') setLogoDarkUrl(d); else setLogoUrl(d); setCropSrc(undefined) }} onCancel={() => setCropSrc(undefined)} />
      </Section>}
      <fieldset disabled={!editable} className="stack" style={{ border: 0, padding: 0 }}>
        <Section title="Cor da marca">
          <div className="form-grid">
            <Field label="Cor principal (hexadecimal)" hint="Ex.: #0D9488. Textos e variantes são derivados para manter contraste AA." error={errors.color}>
              <Input value={colorInput} onChange={(e) => { setColorInput(e.target.value); if (isHex(e.target.value)) { setColor(e.target.value.toUpperCase()); setError('color', null) } else setError('color', 'Use 6 dígitos hexadecimais, ex.: #0D9488.') }} maxLength={7} spellCheck={false} />
            </Field>
            <div className="field"><label htmlFor="brand-color-picker">Seletor visual</label>
              <input id="brand-color-picker" type="color" value={hexOk ? color : '#000000'} onChange={(e) => { setColor(e.target.value.toUpperCase()); setColorInput(e.target.value.toUpperCase()); setError('color', null) }} style={{ width: 64, height: 44, padding: 2, border: '1px solid var(--q-input-border)', borderRadius: 10, cursor: 'pointer', background: 'var(--q-surface)' }} />
            </div>
            <div className="field"><span className="label">Sugestões</span><div className="row">{['#0D9488', '#2563EB', '#7C3AED', '#BE185D', '#EA580C', '#FDE047'].map((c) => <button key={c} type="button" className="swatch" style={{ background: c, width: 44, height: 44, cursor: 'pointer' }} aria-label={`Usar cor ${c}`} aria-pressed={color === c} onClick={() => { setColor(c); setColorInput(c); setError('color', null) }} />)}</div></div>
          </div>
          {lightAdj && <Alert tone="warning" title="Cor ajustada no modo claro">A cor informada não atinge contraste mínimo com fundo branco ({report.whiteContrast.toFixed(2)}:1 &lt; 4.5:1). O sistema escureceu-a automaticamente para uso em botões. Considere uma tonalidade mais escura para evitar o ajuste.</Alert>}
          {navyText && <Alert tone="info" title="Não usamos texto branco sobre cor clara">Branco sobre esta cor teria contraste {report.whiteContrast.toFixed(2)}:1. Os botões usarão texto navy (#102A43).</Alert>}
          {darkAdj && <Alert tone="info" title="Variante para o tema escuro">No tema escuro usamos uma versão clarificada da cor ({report.dark.primary}) com texto navy, para manter contraste sobre o fundo escuro. O logo enviado não é alterado.</Alert>}
          {report && <ContrastTable input={color} />}
        </Section>
        <Section title="Iniciais (fallback sem logo)">
          <Field label="Iniciais exibidas quando não há logo" hint="1 a 3 letras maiúsculas. Usadas no símbolo do app e como fallback.">
            <Input value={initials} onChange={(e) => setInitials(e.target.value.replace(/[^\p{L}\d]/gu, '').slice(0, 3))} maxLength={3} style={{ width: 100, textTransform: 'uppercase' }} />
          </Field>
          <div className="row" style={{ gap: 16 }}>
            {(['any', 'circle', 'squircle'] as const).map((shape) => <div key={shape} className="stack" style={{ '--gap': '4px', alignItems: 'center' } as CSSProperties}>
              <span className={cx('st-icon', shape === 'any' ? 'square' : shape)} style={{ width: 60, height: 60, fontSize: 22, fontWeight: 900, background: deriveBrandTokens(draft.primary, 'light').primary, color: deriveBrandTokens(draft.primary, 'light').onPrimary }} aria-hidden="true">{initials.slice(0, 3).toUpperCase() || '?'}</span>
              <span className="tiny muted">{shape === 'any' ? 'quadrado' : shape === 'circle' ? 'círculo' : 'squircle'}</span>
            </div>)}
          </div>
        </Section>
        <Section title="Logo (modo claro)">
          <Alert tone="info">PNG, JPEG ou WebP. SVG exige sanitização no servidor (futuro). O logo completo pode não funcionar bem como ícone — use o campo Símbolo para o ícone.</Alert>
          <LogoUpload label="Enviar logo (modo claro)" hint="Mínimo 128×32 px. Fundo transparente ou branco." value={logoUrl} bg={logoBg} onValue={(d) => { setLogoUrl(d); setError('logo', null) }} onError={(e) => setError('logo', e)} minW={128} minH={32} />
          {errors.logo && <span className="error small" role="alert">{errors.logo}</span>}
          {logoUrl && <div className="row">
            <Button size="sm" onClick={() => { setCropTarget('symbol'); setCropSrc(logoUrl) }}>Usar recorte do logo como símbolo</Button>
            <Button size="sm" onClick={() => setLogoUrl(undefined)}>Remover</Button>
          </div>}
          <Field label="Cor de fundo da prévia" hint="Para logos com fundo transparente."><input type="color" value={logoBg} aria-label="Fundo do logo" onChange={(e) => setLogoBg(e.target.value)} style={{ width: 44, height: 44, padding: 2, border: '1px solid var(--q-border)', borderRadius: 8, cursor: 'pointer' }} /></Field>
        </Section>
        <Section title="Logo (versão escura)">
          <p className="small muted">Opcional. Se não enviada, o logo claro é usado em fundo escuro. Use uma versão com texto/elementos claros.</p>
          <LogoUpload label="Enviar logo (modo escuro)" hint="Fundo escuro ou transparente. Mínimo 128×32 px." value={logoDarkUrl} bg="#102632" onValue={(d) => { setLogoDarkUrl(d); setError('logoDark', null) }} onError={(e) => setError('logoDark', e)} minW={128} minH={32} />
          {errors.logoDark && <span className="error small" role="alert">{errors.logoDark}</span>}
          {logoDarkUrl && <div className="row"><Button size="sm" onClick={() => { setCropTarget('logoDark'); setCropSrc(logoDarkUrl) }}>Recortar</Button><Button size="sm" onClick={() => setLogoDarkUrl(undefined)}>Remover</Button></div>}
        </Section>
        <Section title="Símbolo do app (ícone)">
          <Alert tone="info">Quadrado. O símbolo deve funcionar em 56×56 px (tela inicial). A área segura é 80% do tamanho para não ser cortada em círculo/squircle.</Alert>
          <LogoUpload label="Enviar símbolo" hint="Mínimo 192×192 px. Quadrado. PNG/JPEG/WebP." value={symbolUrl} onValue={(d) => { setSymbolUrl(d); setCropTarget('symbol'); setCropSrc(d); setError('symbol', null) }} onError={(e) => setError('symbol', e)} minW={192} minH={192} />
          {errors.symbol && <span className="error small" role="alert">{errors.symbol}</span>}
          {symbolUrl && <div className="row"><Button size="sm" onClick={() => { setCropTarget('symbol'); setCropSrc(symbolUrl) }}>Recortar</Button><Button size="sm" onClick={() => setSymbolUrl(undefined)}>Remover símbolo</Button></div>}
          <Field label="Cor de fundo do splash"><input type="color" value={splashBg} aria-label="Fundo do splash" onChange={(e) => setSplashBg(e.target.value)} style={{ width: 44, height: 44, padding: 2, border: '1px solid var(--q-border)', borderRadius: 8, cursor: 'pointer' }} /></Field>
        </Section>
      </fieldset>
      <Section title="Prévia antes de salvar"><BrandLivePreviews d={draft} /></Section>
      {editable && <SaveBar note="Salvar atualiza a interface imediatamente. Publicar ícones versionados e manifesto por HTTPS exige backend — o app já instalado pode demorar a atualizar."><Button type="submit" variant="primary" data-tour="primary-action">Salvar identidade visual</Button></SaveBar>}
    </form>
  )
}

/** Prévias da marca SALVA + manifesto PWA efetivo. */
export function BrandPreviews() {
  const t = useTenant()
  useCollection(t.tenantId, 'clinicProfile')
  const b = t.org.brand
  const extras = getProfile(t.org).brandExtras
  const pwa = hasPublishedPwa(t.org.slug)
  const [manifests, setManifests] = useState<{ equipe?: Record<string, unknown>; portal?: Record<string, unknown>; error?: string } | null>(null)
  useEffect(() => {
    if (!pwa) return
    let alive = true
    Promise.all(['equipe', 'portal'].map((k) => fetch(`/t/${t.org.slug}/${k}.webmanifest`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))))
      .then(([equipe, portal]) => { if (alive) setManifests({ equipe, portal }) })
      .catch((e: Error) => { if (alive) setManifests({ error: `Não foi possível ler os manifestos publicados (${e.message}).` }) })
    return () => { alive = false }
  }, [pwa, t.org.slug])
  return (
    <div className="stack">
      <BrandLivePreviews d={{ name: t.org.name, primary: b.primary, initials: b.initials, logoUrl: b.logoUrl, logoDarkUrl: b.logoDarkUrl, symbolUrl: b.symbolUrl, splashBg: extras.splashBackground, logoBg: extras.logoBackground }} />
      <Section title="Manifesto PWA efetivo">
        {pwa ? <div className="stack">
          <p className="small muted">Arquivos publicados em build para esta clínica de demonstração. O <strong>id</strong> é estável e não muda quando o logo muda; equipe e portal têm escopos distintos.</p>
          <div className="row">
            <img src={`/t/${t.org.slug}/icon-192.png?v=1`} alt="Ícone publicado (any, 192 px)" width={56} height={56} style={{ borderRadius: 12 }} />
            <img src={`/t/${t.org.slug}/maskable-512.png?v=1`} alt="Ícone maskable publicado, recortado em círculo" width={56} height={56} style={{ borderRadius: '50%' }} />
            <img src={`/t/${t.org.slug}/maskable-512.png?v=1`} alt="Ícone maskable publicado, recortado em squircle" width={56} height={56} style={{ borderRadius: '28%' }} />
          </div>
          {manifests?.error && <Alert tone="danger">{manifests.error}</Alert>}
          {!manifests && <p className="small muted" aria-live="polite">Carregando manifestos…</p>}
          {manifests && !manifests.error && <div className="grid grid-2">
            {manifests.equipe && <ManifestCard title="App da equipe" url={`/t/${t.org.slug}/equipe.webmanifest`} data={manifests.equipe} kind="equipe" />}
            {manifests.portal && <ManifestCard title="App do paciente (portal)" url={`/t/${t.org.slug}/portal.webmanifest`} data={manifests.portal} kind="portal" />}
          </div>}
          {b.version > 1 && <Alert tone="warning" title="Identidade local mais nova que a publicada">Você salvou a versão {b.version} da marca neste navegador; os manifestos publicados continuam com os ícones da versão 1. A prévia local usa a imagem enviada; publicar ícones versionados e manifesto por HTTPS exige backend — não alteramos o app já instalado instantaneamente.</Alert>}
        </div> : <Alert tone="warning" title="Sem manifesto publicado para esta clínica">Esta clínica não tem ícones nem manifesto gerados em build; por isso não é instalável com a própria marca nesta demonstração. A prévia local usa a imagem enviada; publicar ícones versionados e manifesto por HTTPS exige backend — não alteramos o app já instalado instantaneamente. Nunca usamos blob URL em manifesto.</Alert>}
      </Section>
    </div>
  )
}

function ManifestCard({ title, url, data, kind }: { title: string; url: string; data: Record<string, unknown>; kind: 'equipe' | 'portal' }) {
  const t = useTenant()
  const icons = Array.isArray(data.icons) ? (data.icons as { src: string; sizes: string; purpose?: string }[]) : []
  const fields: [string, unknown][] = [['id', data.id], ['name', data.name], ['short_name', data.short_name], ['start_url', data.start_url], ['scope', data.scope], ['display', data.display], ['theme_color', data.theme_color], ['background_color', data.background_color]]
  return <div className="card tight stack" style={{ '--gap': '10px' } as CSSProperties}>
    <div className="row between"><strong>{title}</strong><a href={url} target="_blank" rel="noreferrer" className="small">Abrir arquivo</a></div>
    <dl className="stack" style={{ margin: 0, '--gap': '4px' } as CSSProperties}>
      {fields.map(([k, v]) => <div key={k} className="row nowrap" style={{ '--gap': '8px', alignItems: 'flex-start' } as CSSProperties}><dt className="small muted mono" style={{ minWidth: 110 }}>{k}</dt><dd className="small mono" style={{ margin: 0, overflowWrap: 'anywhere', minWidth: 0 }}>{String(v ?? '—')}</dd></div>)}
    </dl>
    <div className="scroll-x"><table className="table"><caption className="sr-only">Ícones do manifesto: {title}</caption><thead><tr><th scope="col">Tamanho</th><th scope="col">Finalidade</th><th scope="col">Arquivo</th></tr></thead>
      <tbody>{icons.map((ic, i) => <tr key={i}><td>{ic.sizes}</td><td>{ic.purpose ?? 'any'}</td><td className="mono small" style={{ overflowWrap: 'anywhere' }}>{ic.src}</td></tr>)}</tbody></table></div>
    {kind === 'equipe' ? <InstallAppButton kind="equipe" org={t.org} /> : <div className="stack" style={{ '--gap': '6px' } as CSSProperties}>
      <p className="small muted">O app do paciente só é instalável dentro do escopo do portal; nesta tela (escopo da equipe) o navegador instalaria o app da equipe.</p>
      <a className="btn btn-secondary" href={String(data.start_url ?? `/c/${t.org.slug}/portal/`)} target="_blank" rel="noreferrer">Abrir portal para instalar</a>
    </div>}
  </div>
}

/** Seção "Marca Qlinic × marca da clínica". */
function BrandPhilosophyNote() {
  return <Alert tone="neutral" title="Marca Qlinic × marca da clínica">
    A identidade visual enviada aqui prevalece nos ambientes da clínica (sidebar, documentos, portal e app instalável). O logo Qlinic não é recolorido pela cor da clínica — ele aparece somente no rodapé da plataforma e em materiais da Qlinic.
  </Alert>
}

/** BrandPwaPage: /marca */
export function BrandPwaPage() {
  const t = useTenant()
  const [tab, setTab] = useState('editor')
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Marca e app (PWA)" subtitle={`${t.org.name} · versão ${t.org.brand.version}`} breadcrumbs={[{ label: 'Configurações', to: `${t.base}/configuracoes` }, { label: 'Marca e app' }]} actions={<ThemeToggle />} />
      <BrandPhilosophyNote />
      <Tabs label="Marca e PWA" value={tab} onChange={setTab} tabs={[{ id: 'editor', label: 'Editor de marca' }, { id: 'preview', label: 'Prévias e PWA' }]} />
      {tab === 'editor' && <TabPanel><BrandEditor /></TabPanel>}
      {tab === 'preview' && <TabPanel><BrandPreviews /></TabPanel>}
    </div>
  )
}
