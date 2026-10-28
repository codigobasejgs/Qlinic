// Documento contratual em HTML acessível: sumário navegável, leitura fluida no celular, imprimir/PDF e baixar texto.
// Impressão usa uma cópia em portal (sem layout do app): logo, partes, quebras de página, numeração e marca d'água.
import { useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Download, Printer } from 'lucide-react'
import type { DocSection } from '@/domain/contracts'
import { sectionsToText } from '@/domain/contracts'
import { Button } from '@/ui/core'
import { QlinicLogo } from '@/ui/brand'
import { downloadText } from '@/lib/util'

export const DEMO_WATERMARK = 'DEMONSTRAÇÃO - NÃO ASSINADO'

function Body({ sections, idPrefix }: { sections: DocSection[]; idPrefix?: string }) {
  return <>{sections.map((s) => (
    <section key={s.id} id={idPrefix ? `${idPrefix}-${s.id}` : undefined} className={s.pageBreakBefore ? 'ctr-sec ctr-break' : 'ctr-sec'} aria-labelledby={idPrefix ? `${idPrefix}-${s.id}-t` : undefined}>
      <h2 id={idPrefix ? `${idPrefix}-${s.id}-t` : undefined} tabIndex={-1}>{s.title}</h2>
      {s.paras.map((p, i) => <p key={i}>{p}</p>)}
      {s.rows && <dl className="ctr-rows">{s.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
    </section>
  ))}</>
}

export function ContractDocument({ sections, title, meta, watermark = DEMO_WATERMARK, fileName, footer }: { sections: DocSection[]; title: string; meta: ReactNode; watermark?: string | null; fileName: string; footer?: ReactNode }) {
  const pid = useId().replace(/:/g, '')
  const text = () => sectionsToText(sections, `${title}\n${watermark ? `${watermark}\n` : ''}`)
  return (
    <div className="ctr-doc stack">
      <div className="row between no-print">
        <div className="row">
          <Button icon={<Printer />} onClick={() => window.print()}>Imprimir / salvar PDF</Button>
          <Button icon={<Download />} onClick={() => downloadText(`${fileName}.md`, text(), 'text/markdown;charset=utf-8')}>Baixar texto</Button>
        </div>
      </div>
      <details className="ctr-toc no-print" open>
        <summary>Sumário ({sections.length} seções)</summary>
        <nav aria-label="Sumário do contrato"><ol>{sections.map((s) => <li key={s.id}><a href={`#${pid}-${s.id}`} onClick={(e) => { e.preventDefault(); const el = document.getElementById(`${pid}-${s.id}-t`); el?.scrollIntoView({ block: 'start' }); el?.focus() }}>{s.title}</a></li>)}</ol></nav>
      </details>
      <article className="ctr-paper" aria-label={title}>
        {watermark && <div className="ctr-watermark" aria-hidden="true">{watermark}</div>}
        <header className="ctr-head"><QlinicLogo height={28} /><h1>{title}</h1><div className="small muted">{meta}</div></header>
        {watermark && <p className="ctr-stamp" role="note">{watermark}. Documento demonstrativo, com dados fictícios e sem validade jurídica.</p>}
        <Body sections={sections} idPrefix={pid} />
        {footer}
      </article>
      {createPortal(
        <div className="ctr-print-root print-area" aria-hidden="true">
          {watermark && <div className="ctr-watermark ctr-watermark-print">{watermark}</div>}
          <header className="ctr-head"><QlinicLogo height={28} tone="principal" /><h1>{title}</h1><div className="small">{meta}</div></header>
          <Body sections={sections} />
          {footer}
        </div>, document.body)}
    </div>
  )
}
