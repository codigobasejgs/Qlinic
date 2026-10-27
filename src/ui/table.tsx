// Tabela responsiva: desktop = tabela ordenável com seleção de colunas; celular (<768px) = lista de cartões.
import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Columns3, Download } from 'lucide-react'
import { Button, Pagination, EmptyState, Checkbox } from './core'
import { Dialog } from './overlay'
import { downloadText, toCSV } from '@/lib/util'

export interface Column<T> {
  id: string
  header: string
  cell: (row: T) => ReactNode
  /** Valor para ordenação/exportação. */
  value?: (row: T) => string | number | null | undefined
  num?: boolean
  /** Oculta por padrão (seleção de colunas). */
  hidden?: boolean
  /** Exibe no cartão mobile. Primeira coluna é sempre o título. */
  mobile?: boolean
}

export function DataTable<T>({ rows, columns, rowKey, onRowClick, pageSize = 25, empty, exportName, caption, actions, rowActions }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; pageSize?: number; empty?: ReactNode
  exportName?: string; caption: string; actions?: ReactNode; rowActions?: (r: T) => ReactNode
}) {
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 } | null>(null)
  const [page, setPage] = useState(1)
  const [visible, setVisible] = useState(() => new Set(columns.filter((c) => !c.hidden).map((c) => c.id)))
  const [colsOpen, setColsOpen] = useState(false)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.id === sort.id)
    if (!col?.value) return rows
    return [...rows].sort((a, b) => {
      const va = col.value!(a) ?? '', vb = col.value!(b) ?? ''
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')) * sort.dir
    })
  }, [rows, sort, columns])
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const cur = Math.min(page, pages)
  const slice = sorted.slice((cur - 1) * pageSize, cur * pageSize)
  const cols = columns.filter((c) => visible.has(c.id))
  const exportCsv = () => {
    const data = sorted.map((r) => Object.fromEntries(columns.filter((c) => c.value).map((c) => [c.header, c.value!(r)])))
    downloadText(`${exportName}.csv`, toCSV(data), 'text/csv;charset=utf-8')
  }
  return (
    <div className="stack responsive-table" style={{ '--gap': '8px' } as React.CSSProperties}>
      {(actions || exportName || columns.length > 4) && (
        <div className="row between">
          <span className="small muted" aria-live="polite">{rows.length} {rows.length === 1 ? 'registro' : 'registros'}</span>
          <div className="row">
            {actions}
            {columns.length > 4 && <Button size="sm" icon={<Columns3 />} onClick={() => setColsOpen(true)} className="hide-mobile">Colunas</Button>}
            {exportName && <Button size="sm" icon={<Download />} onClick={exportCsv}>Exportar CSV</Button>}
          </div>
        </div>
      )}
      {rows.length === 0 ? (empty ?? <EmptyState title="Nada por aqui ainda" />) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.id} className={c.num ? 'num' : undefined} aria-sort={sort?.id === c.id ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined} scope="col">
                      {c.value ? <button onClick={() => setSort((s) => (s?.id === c.id ? { id: c.id, dir: (s.dir * -1) as 1 | -1 } : { id: c.id, dir: 1 }))}>{c.header}{sort?.id === c.id && (sort.dir === 1 ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />)}</button> : c.header}
                    </th>
                  ))}
                  {rowActions && <th scope="col"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => (
                  <tr key={rowKey(r)} className={onRowClick ? 'clickable' : undefined} onClick={onRowClick ? (e) => { if (!(e.target as HTMLElement).closest('button,a,input,select')) onRowClick(r) } : undefined}>
                    {cols.map((c, i) => <td key={c.id} className={c.num ? 'num' : undefined}>{i === 0 && onRowClick ? <button className="btn-link" style={{ minHeight: 0, padding: 0, textAlign: 'left' }} onClick={() => onRowClick(r)}>{c.cell(r)}</button> : c.cell(r)}</td>)}
                    {rowActions && <td className="right"><div className="row end nowrap">{rowActions(r)}</div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mobile-list" aria-label={caption} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {slice.map((r) => {
              const [first, ...rest] = columns
              const extra = rest.filter((c) => c.mobile !== false && (c.mobile || !c.hidden)).slice(0, 4)
              return (
                <li key={rowKey(r)} className="list-card">
                  {onRowClick ? <button className="btn-link" style={{ minHeight: 32, padding: 0, textAlign: 'left', textDecoration: 'none' }} onClick={() => onRowClick(r)}><strong>{first.cell(r)}</strong></button> : <strong>{first.cell(r)}</strong>}
                  {extra.map((c) => <div key={c.id} className="lc-row"><span>{c.header}</span><span className={c.num ? 'num' : undefined}>{c.cell(r)}</span></div>)}
                  {rowActions && <div className="row">{rowActions(r)}</div>}
                </li>
              )
            })}
          </ul>
          <Pagination page={cur} pages={pages} onPage={setPage} />
        </>
      )}
      <Dialog open={colsOpen} onClose={() => setColsOpen(false)} title="Colunas visíveis" footer={<Button variant="primary" onClick={() => setColsOpen(false)}>Concluir</Button>}>
        {columns.map((c, i) => (
          <Checkbox key={c.id} label={c.header} checked={visible.has(c.id)} disabled={i === 0} onChange={(e) => setVisible((v) => { const n = new Set(v); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n })} />
        ))}
      </Dialog>
    </div>
  )
}
