// Importador CSV demonstrativo para clínicas.
// Aceita CSV; se o usuário tentar XLSX, avisa educadamente que a demonstração processa CSV e sugere salvar como CSV.
// Templates próprios, mapeamento flexível, validação rigorosa, detecção de duplicados e opção de desfazer lote.
import { useState } from 'react'
import { useActor, useTenant } from '@/app/session'
import { useCollection } from '@/data/store'
import { Alert, Badge, Button, DataTable, Field, FileUpload, PageHeader, Select, useAction, useConfirm, type Column } from '@/ui'
import { downloadText, toCSV } from '@/lib/util'
import { formatDateTime } from '@/lib/dates'
import {
  autoMap,
  commitImport,
  ENTITY_LABEL,
  errorReport,
  FIELDS,
  readTable,
  summarize,
  templateCSV,
  undoImport,
  validateRows,
  type Mapping,
  type RowResult,
} from './importer'
import type { ImportBatch, ImportEntity } from './types'

export function ImportPage() {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const confirm = useConfirm()
  const batches = useCollection(t.tenantId, 'importBatches')
  const editable = t.can('importacao', 'create')

  const [entity, setEntity] = useState<ImportEntity>('pacientes')
  const [selectedUnit, setSelectedUnit] = useState<string>(t.unitId ?? t.allowedUnits[0]?.id ?? '')

  // Estado do fluxo de importação
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Mapping>({})
  const [results, setResults] = useState<RowResult[] | null>(null)
  const [xlsxNotice, setXlsxNotice] = useState(false)

  // Download do template oficial
  const handleDownloadTemplate = () => {
    const csv = templateCSV(entity)
    downloadText(`modelo_importacao_${entity}.csv`, csv)
  }

  // Ao receber arquivo
  const handleFile = (f: { name: string; mime: string; dataUrl: string }) => {
    setXlsxNotice(false)
    if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) {
      setXlsxNotice(true)
      return
    }

    try {
      // Decode dataUrl (base64)
      const base64 = f.dataUrl.split(',')[1]
      const text = atob(base64)
      // Decode UTF-8 correctly
      const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0))
      const decoded = new TextDecoder('utf-8').decode(bytes)

      const table = readTable(decoded)
      setFileContent(decoded)
      setFileName(f.name)
      setHeaders(table.headers)
      setRawRows(table.rows)

      const auto = autoMap(entity, table.headers)
      setMapping(auto)

      const evaluated = validateRows(t.tenantId, entity, table.rows, auto)
      setResults(evaluated)
    } catch (e) {
      run(() => {
        throw new Error(e instanceof Error ? e.message : 'Falha ao processar arquivo CSV.')
      })
    }
  }

  // Atualizar mapeamento manual
  const handleMapChange = (fieldKey: string, colIdx: number) => {
    const next = { ...mapping, [fieldKey]: colIdx }
    setMapping(next)
    if (rawRows.length) {
      try {
        const evaluated = validateRows(t.tenantId, entity, rawRows, next)
        setResults(evaluated)
      } catch {
        // Obrigatórios pendentes
      }
    }
  }

  // Confirmar e gravar importação
  const handleCommit = () => {
    if (!results) return
    const unitId = selectedUnit || t.units[0]?.id
    if (!unitId) {
      run(() => {
        throw new Error('Selecione a unidade para vincular os registros.')
      })
      return
    }

    run(() => {
      commitImport(t.tenantId, entity, results, {
        unitId,
        fileName,
        actor,
        segmentIsVet: t.org.segment === 'veterinaria',
      })
      // Resetar tela de importação
      setFileContent(null)
      setFileName('')
      setResults(null)
      setHeaders([])
      setRawRows([])
    }, 'Importação concluída com sucesso.')
  }

  // Desfazer lote
  const handleUndo = async (b: ImportBatch) => {
    const r = await confirm({
      title: `Desfazer importação de ${b.fileName}?`,
      body: `Esta ação removerá até ${b.recordIds.length} registros criados por este lote. Registros que já possuírem vínculos (como agendamentos) serão preservados.`,
      danger: true,
      confirmLabel: 'Desfazer lote',
    })
    if (!r.ok) return

    run(() => {
      undoImport(t.tenantId, b.id, actor)
    }, 'Importação desfeita com sucesso.')
  }

  const exportErrorReport = () => {
    if (!results) return
    const report = errorReport(results)
    downloadText(`erros_importacao_${fileName}.csv`, toCSV(report))
  }

  const summary = results ? summarize(results) : null

  const batchColumns: Column<ImportBatch>[] = [
    {
      id: 'at',
      header: 'Data / Hora',
      cell: (b) => formatDateTime(b.createdAt, t.org.timezone),
      value: (b) => b.createdAt,
    },
    { id: 'ent', header: 'Entidade', cell: (b) => ENTITY_LABEL[b.entity], value: (b) => b.entity },
    { id: 'file', header: 'Arquivo', cell: (b) => <strong>{b.fileName}</strong>, value: (b) => b.fileName },
    { id: 'counts', header: 'Importados', cell: (b) => `${b.counts.imported} de ${b.counts.rows} linhas` },
    {
      id: 'status',
      header: 'Status',
      cell: (b) => (
        <Badge tone={b.status === 'concluido' ? 'success' : 'neutral'}>
          {b.status === 'concluido' ? 'Concluído' : 'Desfeito'}
        </Badge>
      ),
    },
    { id: 'by', header: 'Usuário', cell: (b) => b.by },
  ]

  return (
    <div className="stack" data-tour="page-content">
      <PageHeader
        title="Importação de dados"
        subtitle={`Migração e carga de cadastros via planilha CSV · ${t.org.name}`}
        actions={
          <Button variant="secondary" onClick={handleDownloadTemplate} data-tour="primary-action">
            Baixar modelo CSV ({ENTITY_LABEL[entity]})
          </Button>
        }
      />

      <Alert tone="neutral" title="Importação demonstrativa segura">
        O importador processa arquivos CSV estruturados. Fórmulas de planilha potencialmente perigosas (iniciadas por =, +, -, @) são neutralizadas automaticamente para proteger a visualização. Não alegamos migração automática em minutos de sistemas de terceiros: a consistência dos dados requer validação humana.
      </Alert>

      {xlsxNotice && (
        <Alert tone="warning" title="Arquivo Excel (.xlsx) detectado">
          A demonstração processa diretamente arquivos de texto <strong>.CSV</strong> com codificação UTF-8. Para continuar, abra sua planilha no Excel ou Calc, escolha <strong>Salvar como &gt; CSV (separado por vírgulas ou ponto-e-vírgula)</strong> e envie o novo arquivo gerado.
        </Alert>
      )}

      {/* ETAPA 1: ESCOLHA DA ENTIDADE E UPLOAD */}
      {!fileContent && (
        <div className="card">
          <div className="stack" style={{ gap: 16 }}>
            <div className="form-grid">
              <Field label="Entidade a importar">
                <Select value={entity} onChange={(e) => setEntity(e.target.value as ImportEntity)}>
                  <option value="pacientes">Pacientes</option>
                  <option value="profissionais">Profissionais</option>
                  <option value="servicos">Serviços</option>
                  <option value="produtos">Produtos / Insumos</option>
                </Select>
              </Field>
              <Field label="Vincular à unidade principal">
                <Select value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)}>
                  {t.allowedUnits.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </Field>
            </div>

            {editable ? (
              <FileUpload
                accept={['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']}
                label={`Selecionar arquivo CSV de ${ENTITY_LABEL[entity]}`}
                hint="Envie arquivo CSV (delimitado por vírgula ou ponto-e-vírgula) até 2 MB."
                onFile={handleFile}
              />
            ) : (
              <Alert tone="neutral">Seu perfil não tem permissão para realizar importações de dados.</Alert>
            )}
          </div>
        </div>
      )}

      {/* ETAPA 2: MAPEAMENTO DE COLUNAS E VALIDAÇÃO */}
      {fileContent && results && summary && (
        <div className="stack" style={{ gap: 20 }}>
          <div className="card">
            <div className="row between" style={{ marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 18 }}>Arquivo: {fileName}</h3>
                <p className="small muted">
                  Total de linhas detectadas: {summary.rows} · Entidade: {ENTITY_LABEL[entity]}
                </p>
              </div>
              <Button size="sm" onClick={() => setFileContent(null)}>
                Trocar arquivo
              </Button>
            </div>

            <fieldset className="stack" style={{ gap: 12 }}>
              <legend>Mapeamento de colunas da planilha</legend>
              <p className="tiny muted">
                Identificamos as colunas automaticamente. Caso alguma esteja incorreta, ajuste abaixo antes de validar:
              </p>
              <div className="form-grid">
                {FIELDS[entity].map((f) => (
                  <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`}>
                    <Select
                      value={String(mapping[f.key] ?? -1)}
                      onChange={(e) => handleMapChange(f.key, Number(e.target.value))}
                    >
                      <option value="-1">-- Não importar esta coluna --</option>
                      {headers.map((h, idx) => (
                        <option key={idx} value={idx}>
                          Coluna {idx + 1}: {h}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </div>
            </fieldset>

            {/* Quadro de Resumo de Validação */}
            <div className="card tight" style={{ marginTop: 16, background: 'var(--q-surface-muted)' }}>
              <div className="grid grid-4">
                <div>
                  <div className="small muted">Linhas aptas</div>
                  <strong style={{ fontSize: 20, color: 'var(--q-success)' }}>
                    {summary.importable}
                  </strong>
                </div>
                <div>
                  <div className="small muted">Linhas com erro</div>
                  <strong style={{ fontSize: 20, color: summary.invalid > 0 ? 'var(--q-danger)' : 'inherit' }}>
                    {summary.invalid}
                  </strong>
                </div>
                <div>
                  <div className="small muted">Duplicados</div>
                  <strong style={{ fontSize: 20, color: summary.duplicates > 0 ? 'var(--q-warning)' : 'inherit' }}>
                    {summary.duplicates}
                  </strong>
                </div>
                <div>
                  <div className="small muted">Avisos sanitização</div>
                  <strong style={{ fontSize: 20 }}>{summary.warnings}</strong>
                </div>
              </div>

              {(summary.invalid > 0 || summary.duplicates > 0) && (
                <div className="row" style={{ marginTop: 12 }}>
                  <Button size="sm" onClick={exportErrorReport}>
                    Baixar relatório de erros por linha (CSV)
                  </Button>
                </div>
              )}
            </div>

            {/* Ações Finais */}
            <div className="row end" style={{ marginTop: 16 }}>
              <Button onClick={() => setFileContent(null)}>Cancelar</Button>
              <Button
                variant="primary"
                disabled={summary.importable === 0}
                onClick={handleCommit}
              >
                Importar {summary.importable} registros válidos
              </Button>
            </div>
          </div>

          {/* Prévia das primeiras 10 linhas validadas */}
          <div className="card flush">
            <div className="panel-head">
              <strong>Prévia dos dados processados (primeiras 10 linhas)</strong>
            </div>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Prévia das linhas importadas</caption>
                <thead>
                  <tr>
                    <th scope="col">Linha</th>
                    <th scope="col">Status</th>
                    <th scope="col">Resumo do registro</th>
                    <th scope="col">Diagnóstico</th>
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 10).map((r) => {
                    const hasErr = r.errors.length > 0
                    const isDup = !hasErr && !!r.duplicate
                    return (
                      <tr key={r.line}>
                        <td className="num">{r.line}</td>
                        <td>
                          {hasErr ? (
                            <Badge tone="danger">Inválido</Badge>
                          ) : isDup ? (
                            <Badge tone="warning">Duplicado</Badge>
                          ) : (
                            <Badge tone="success">Válido</Badge>
                          )}
                        </td>
                        <td className="small">
                          {Object.entries(r.values)
                            .map(([k, v]) => `${k}: ${v}`)
                            .slice(0, 3)
                            .join(' · ')}
                        </td>
                        <td className="small muted">
                          {hasErr && <span className="st-row-err">{r.errors.join('; ')}</span>}
                          {isDup && <span>Duplicado: {r.duplicate?.detail}</span>}
                          {!hasErr && !isDup && r.warnings.length > 0 && <span>{r.warnings.join('; ')}</span>}
                          {!hasErr && !isDup && !r.warnings.length && <span>Pronto para gravação</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* HISTÓRICO DE LOTES IMPORTADOS */}
      <div className="stack" style={{ gap: 12, marginTop: 16 }}>
        <h3 style={{ fontSize: 18 }}>Lotes de importação anteriores</h3>
        <DataTable
          rows={batches}
          columns={batchColumns}
          rowKey={(b) => b.id}
          caption="Histórico de lotes importados"
          empty={<p className="muted small">Nenhum lote importado até o momento.</p>}
          rowActions={editable ? (b) => (
            b.status === 'concluido' ? (
              <Button size="sm" variant="danger" onClick={() => handleUndo(b)}>
                Desfazer lote
              </Button>
            ) : undefined
          ) : undefined}
        />
      </div>
    </div>
  )
}
