// Prints REAIS do frontend (public/screens/*), gerados por qa/tmp/public-shots.mjs, que também escreve shots.json.
// Print ausente ou capturado de tela ainda em construção → não renderiza (sem imagem quebrada).
import SHOTS_JSON from './shots.json'

export interface ShotMeta { file: string; w: number; h: number; stub?: boolean; route: string; at: string }
export const SHOTS = SHOTS_JSON as Record<string, ShotMeta>

export function hasShot(id: string | undefined): id is string {
  return !!id && !!SHOTS[id] && !SHOTS[id].stub
}

export function Screenshot({ id, alt, caption, eager, className }: { id: string | undefined; alt: string; caption?: string; eager?: boolean; className?: string }) {
  if (!hasShot(id)) return null
  const s = SHOTS[id]
  const base = `/screens/${s.file.replace(/\.png$/, '')}`
  return (
    <figure className={`shot ${className ?? ''}`}>
      {/* WebP gerado por scripts/optimize-screens.mjs; PNG original como fallback. */}
      <picture>
        <source type="image/webp" srcSet={s.w > 720 ? `${base}-720.webp 720w, ${base}.webp ${s.w}w` : `${base}.webp`} sizes={s.w > 720 ? '(max-width: 800px) 100vw, 720px' : undefined} />
        <img src={`/screens/${s.file}`} width={s.w} height={s.h} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : undefined} />
      </picture>
      {caption && <figcaption className="small muted">{caption}</figcaption>}
    </figure>
  )
}
