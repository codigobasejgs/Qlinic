// Auditoria: trilha de eventos operacionais e de segurança da clínica.
// Filtros por ator, ação, recurso, unidade e período; exportação CSV segura contra formula injection.
import { useMemo, useState } from 'react'
import { useTenant } from '@/app/session'
import { useCollection } from '@/data/store'
import type { AuditEvent } from '@/domain/types'
import { Alert, Button, DataTable, Field, Input, PageHeader, Select, type Column } from '@/ui'
import { addDaysCivil, formatDateTime, todayCivil } from '@/lib/dates'
import { downloadText, toCSV } from '@/lib/util'

export function AuditPage() {
  const t = useTenant()
  const today = todayCivil(t.org.timezone)
  const allEvents = useCollection(t.tenantId, 'audit')
  const units = useCollection(t.tenantId, 'units')

  // Filtros
  const [filterActor, setFilterActor] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterResource, setFilterResource] = useState('')
  const [filterUnit, setFilterUnit] = useState<string>('')
  const [startDate, setStartDate] = useState(() => addDaysCivil(today, -30))
  const [endDate, setEndDate] = useState(today)

  // Lista de ações e recursos únicos para os selects de filtro
  const uniqueActions = useMemo(() => {
    return Array.from(new Set(allEvents.map((e) => e.action))).filter(Boolean).sort()
  }, [allEvents])

  const uniqueResources = useMemo(() => {
    return Array.from(new Set(allEvents.map((e) => e.resource))).filter(Boolean).sort()
  }, [allEvents])

  // Filtragem dos eventos respeitando unidades permitidas
  const allowedUnitIds = t.unitId ? [t.unitId] : t.allowedUnits.map((u) => u.id)

  const events = allEvents
      .filter((e) => {
        if (e.unitId && !allowedUnitIds.includes(e.unitId)) return false
        if (filterUnit && e.unitId !== filterUnit) return false
        if (filterActor && !e.actorName.toLowerCase().includes(filterActor.toLowerCase())) return false
        if (filterAction && e.action !== filterAction) return false
        if (filterResource && e.resource !== filterResource) return false
        const eventDay = e.createdAt.slice(0, 10)
        if (startDate && eventDay < startDate) return false
        if (endDate && eventDay > endDate) return false
        return true
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const exportCSV = () => {
    const data = events.map((e) => ({
      DataHora: formatDateTime(e.createdAt, t.org.timezone),
      Ator: e.actorName,
      Acao: e.action,
      Recurso: e.resource,
      ID_Recurso: e.resourceId ?? '—',
      Unidade: units.find((u) => u.id === e.unitId)?.name ?? (e.unitId ? e.unitId : 'Rede / Global'),
      Detalhes: e.detail ?? '—',
    }))
    downloadText(`auditoria_${t.org.slug}_${startDate}_${endDate}.csv`, toCSV(data), 'text/csv;charset=utf-8')
  }

  const columns: Column<AuditEvent>[] = [
    {
      id: 'at',
      header: 'Data / Hora',
      cell: (e) => (
        <span className="small" style={{ whiteSpace: 'nowrap' }}>
          {formatDateTime(e.createdAt, t.org.timezone)}
        </span>
      ),
      value: (e) => e.createdAt,
    },
    {
      id: 'actor',
      header: 'Ator',
      cell: (e) => <strong>{e.actorName}</strong>,
      value: (e) => e.actorName,
    },
    {
      id: 'action',
      header: 'Ação',
      cell: (e) => <span className="mono small">{e.action}</span>,
      value: (e) => e.action,
    },
    {
      id: 'resource',
      header: 'Recurso',
      cell: (e) => (
        <div>
          <span className="small strong">{e.resource}</span>
          {e.resourceId && <div className="tiny muted mono">{e.resourceId}</div>}
        </div>
      ),
      value: (e) => e.resource,
    },
    {
      id: 'unit',
      header: 'Unidade',
      cell: (e) => (
        <span className="small">
          {units.find((u) => u.id === e.unitId)?.name ?? (e.unitId ? e.unitId : 'Rede')}
        </span>
      ),
      value: (e) => e.unitId ?? '',
    },
    {
      id: 'detail',
      header: 'Detalhes',
      cell: (e) => <span className="small muted">{e.detail || '—'}</span>,
      value: (e) => e.detail ?? '',
    },
  ]

  return (
    <div className="stack" data-tour="page-content">
      <PageHeader
        title="Trilha de auditoria"
        subtitle={`Registro cronológico de ações operacionais e administrativas · ${t.org.name}`}
        actions={
          <Button variant="primary" onClick={exportCSV} data-tour="primary-action">
            Exportar trilha (CSV seguro)
          </Button>
        }
      />

      <Alert tone="neutral" title="Conformidade e segurança de dados">
        Todos os eventos de criação, atualização e exclusão sensíveis são catalogados com carimbo de tempo UTC e ator responsável. A exportação CSV possui proteção ativa contra injeção de fórmulas (RFC 4180 sanitizada).
      </Alert>

      {/* Barra de Filtros */}
      <div className="card tight">
        <div className="form-grid">
          <Field label="Filtrar por ator">
            <Input
              value={filterActor}
              onChange={(e) => setFilterActor(e.target.value)}
              placeholder="Nome do usuário"
            />
          </Field>
          <Field label="Ação">
            <Select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
              <option value="">Todas as ações</option>
              {uniqueActions.map((act) => (
                <option key={act} value={act}>{act}</option>
              ))}
            </Select>
          </Field>
          <Field label="Recurso">
            <Select value={filterResource} onChange={(e) => setFilterResource(e.target.value)}>
              <option value="">Todos os recursos</option>
              {uniqueResources.map((res) => (
                <option key={res} value={res}>{res}</option>
              ))}
            </Select>
          </Field>
          <Field label="Unidade">
            <Select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)}>
              <option value="">Todas as unidades permitidas</option>
              {t.allowedUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="De">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Até">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
      </div>

      <DataTable
        rows={events}
        columns={columns}
        rowKey={(e) => e.id}
        caption="Eventos de auditoria registrados"
        exportName="auditoria"
      />
    </div>
  )
}
