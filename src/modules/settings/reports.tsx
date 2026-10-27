// Relatórios operacionais e financeiros da clínica calculados do store local.
// Respeita unidades permitidas e restrição 'own' (se o usuário for profissional restrito).
import { useMemo, useState } from 'react'
import { useTenant } from '@/app/session'
import { useCollection } from '@/data/store'
import type { StockMovement } from '@/domain/modules'
import { chargeNet } from '@/data/repositories'
import { Alert, Badge, Button, DataTable, Field, Input, Kpi, PageHeader, Section, Select, Tabs, TabPanel } from '@/ui'
import { formatBRL } from '@/lib/money'
import { addDaysCivil, civilWeekday, formatCivil, todayCivil } from '@/lib/dates'
import { downloadText, toCSV } from '@/lib/util'

type PeriodPreset = 'hoje' | '7dias' | '30dias' | 'mes_atual' | 'mes_anterior' | 'custom'

export function ReportsPage() {
  const t = useTenant()
  const today = todayCivil(t.org.timezone)
  const [preset, setPreset] = useState<PeriodPreset>('30dias')
  const [customStart, setCustomStart] = useState(() => addDaysCivil(today, -30))
  const [customEnd, setCustomEnd] = useState(today)
  const [tab, setTab] = useState<'operacional' | 'financeiro' | 'comercial' | 'estoque'>('operacional')

  // Intervalo de datas civis [start, end]
  const { start, end } = useMemo(() => {
    if (preset === 'hoje') return { start: today, end: today }
    if (preset === '7dias') return { start: addDaysCivil(today, -7), end: today }
    if (preset === '30dias') return { start: addDaysCivil(today, -30), end: today }
    if (preset === 'mes_atual') {
      const ym = today.slice(0, 7)
      return { start: `${ym}-01`, end: today }
    }
    if (preset === 'mes_anterior') {
      const [y, m] = today.split('-').map(Number)
      const prevM = m === 1 ? 12 : m - 1
      const prevY = m === 1 ? y - 1 : y
      const pStr = `${prevY}-${String(prevM).padStart(2, '0')}`
      return { start: `${pStr}-01`, end: `${pStr}-28` }
    }
    return { start: customStart, end: customEnd }
  }, [preset, today, customStart, customEnd])

  // Coleções do tenant
  const allAppts = useCollection(t.tenantId, 'appointments')
  const allCharges = useCollection(t.tenantId, 'charges')
  const allProposals = useCollection(t.tenantId, 'proposals')
  const pros = useCollection(t.tenantId, 'professionals')
  const services = useCollection(t.tenantId, 'services')

  // Filtro de unidade e permissão 'own'
  const allowedUnits = t.unitId ? [t.unitId] : t.allowedUnits.map((u) => u.id)
  const isOwn = t.scope('relatorios') === 'own' && t.access.professionalId

  // Agendamentos filtrados
  const appts = allAppts.filter((a) => {
      if (!allowedUnits.includes(a.unitId)) return false
      if (isOwn && a.professionalId !== t.access.professionalId) return false
      const day = a.start.slice(0, 10)
      return day >= start && day <= end
    })

  // Cobranças filtradas (por data de competência)
  const charges = allCharges.filter((c) => {
      if (!allowedUnits.includes(c.unitId)) return false
      if (isOwn && c.professionalId && c.professionalId !== t.access.professionalId) return false
      return c.competenceDate >= start && c.competenceDate <= end
    })

  // Propostas filtradas
  const proposals = allProposals.filter((p) => {
      if (!allowedUnits.includes(p.unitId)) return false
      if (isOwn && p.professionalId && p.professionalId !== t.access.professionalId) return false
      const day = p.createdAt.slice(0, 10)
      return day >= start && day <= end
    })

  // Métricas Operacionais
  const totalAgendados = appts.length
  const concluidos = appts.filter((a) => a.status === 'concluida').length
  const faltas = appts.filter((a) => a.status === 'faltou').length
  const cancelados = appts.filter((a) => a.status === 'cancelada').length
  const taxaAbsenteismo = totalAgendados > 0 ? Math.round(((faltas + cancelados) / totalAgendados) * 100) : 0

  // Ocupação: minutos agendados ÷ minutos de jornada ofertados no período (feriados excluídos)
  const unitsById = new Map(t.units.map((u) => [u.id, u]))
  let minutosOfertados = 0
  for (let d = start; d <= end; d = addDaysCivil(d, 1)) {
    const wd = civilWeekday(d)
    for (const p of pros) {
      if (!p.active || (isOwn && p.id !== t.access.professionalId)) continue
      for (const sc of p.schedule) {
        if (sc.weekday !== wd || !allowedUnits.includes(sc.unitId)) continue
        if (unitsById.get(sc.unitId)?.holidays.some((h) => h.date === d)) continue
        minutosOfertados += sc.end - sc.start
      }
    }
  }
  const minutosAgendados = appts
    .filter((a) => !['cancelada', 'faltou'].includes(a.status))
    .reduce((acc, a) => {
      const dur = (new Date(a.end).getTime() - new Date(a.start).getTime()) / 60000
      return acc + (dur > 0 ? dur : 30)
    }, 0)

  const ocupacao = minutosOfertados > 0 ? Math.round((minutosAgendados / minutosOfertados) * 100) : 0

  // Atendimentos por profissional
  const porProfissional = useMemo(() => {
    const map = new Map<string, { name: string; total: number; concluidos: number; faltas: number }>()
    for (const a of appts) {
      const pro = pros.find((p) => p.id === a.professionalId)
      const name = pro?.name ?? 'Não identificado'
      const cur = map.get(a.professionalId) ?? { name, total: 0, concluidos: 0, faltas: 0 }
      cur.total++
      if (a.status === 'concluida') cur.concluidos++
      if (a.status === 'faltou') cur.faltas++
      map.set(a.professionalId, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [appts, pros])

  // Atendimentos por serviço
  const porServico = useMemo(() => {
    const map = new Map<string, { name: string; total: number; receitaCents: number }>()
    for (const a of appts) {
      const svc = services.find((s) => s.id === a.serviceId)
      const name = svc?.name ?? 'Serviço avulso'
      const cur = map.get(a.serviceId) ?? { name, total: 0, receitaCents: 0 }
      cur.total++
      if (a.status === 'concluida') cur.receitaCents += svc?.priceCents ?? 0
      map.set(a.serviceId, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [appts, services])

  // Métricas Financeiras (Contexto B: Pacientes)
  const receitaCompetenciaCents = charges.reduce((acc, c) => acc + c.amountCents, 0)
  const totalRecebidoCents = charges.reduce((acc, c) => acc + chargeNet(c), 0)
  // Disponível: pagamentos confirmados cuja data de disponibilidade já chegou (ex.: cartão D+30 ainda não disponível)
  const disponivelCents = charges.reduce((acc, c) => acc + c.payments.filter((p) => p.status === 'confirmado' && (p.availableOn ?? p.at.slice(0, 10)) <= today).reduce((a, p) => a + p.amountCents, 0) - c.refunds.reduce((a, r) => a + r.amountCents, 0), 0)
  const valorVencidoCents = charges.filter((c) => c.status === 'vencida').reduce((acc, c) => acc + c.amountCents, 0)
  const taxaInadimplencia = receitaCompetenciaCents > 0 ? Math.round((valorVencidoCents / receitaCompetenciaCents) * 100) : 0
  const ticketMedioCents = concluidos > 0 ? Math.round(receitaCompetenciaCents / concluidos) : 0

  // Métricas Comerciais (Propostas / Orçamentos)
  const totalPropostas = proposals.length
  const propostasAceitas = proposals.filter((p) => p.status === 'aceita' || p.status === 'aceita_parcial').length
  const propostasRecusadas = proposals.filter((p) => p.status === 'recusada').length
  const taxaConversaoPropostas = totalPropostas > 0 ? Math.round((propostasAceitas / totalPropostas) * 100) : 0

  // Exportação CSV segura
  const exportarRelatorioGeral = () => {
    const rows = [
      { Metrica: 'Período Inicial', Valor: formatCivil(start) },
      { Metrica: 'Período Final', Valor: formatCivil(end) },
      { Metrica: 'Unidade(s)', Valor: t.unit ? t.unit.name : 'Todas as unidades permitidas' },
      { Metrica: 'Total de Agendamentos', Valor: totalAgendados },
      { Metrica: 'Consultas Concluídas', Valor: concluidos },
      { Metrica: 'Faltas', Valor: faltas },
      { Metrica: 'Cancelamentos', Valor: cancelados },
      { Metrica: 'Taxa de Absenteísmo', Valor: `${taxaAbsenteismo}%` },
      { Metrica: 'Receita por Competência', Valor: formatBRL(receitaCompetenciaCents) },
      { Metrica: 'Total Recebido (Líquido)', Valor: formatBRL(totalRecebidoCents) },
      { Metrica: 'Ocupação da agenda', Valor: `${ocupacao}%` },
      { Metrica: 'Disponível', Valor: formatBRL(disponivelCents) },
      { Metrica: 'Inadimplência (Vencido)', Valor: formatBRL(valorVencidoCents) },
      { Metrica: 'Taxa de Inadimplência', Valor: `${taxaInadimplencia}%` },
      { Metrica: 'Ticket Médio por Consulta', Valor: formatBRL(ticketMedioCents) },
      { Metrica: 'Total de Propostas Criadas', Valor: totalPropostas },
      { Metrica: 'Propostas Aceitas', Valor: propostasAceitas },
      { Metrica: 'Taxa de Conversão de Propostas', Valor: `${taxaConversaoPropostas}%` },
    ]
    downloadText(`relatorio_${t.org.slug}_${start}_${end}.csv`, toCSV(rows), 'text/csv;charset=utf-8')
  }

  return (
    <div className="stack" data-tour="page-content">
      <PageHeader
        title="Relatórios operacionais e financeiros"
        subtitle={`Demonstrativos de ocupação, absenteísmo, faturamento e conversão · ${t.org.name}`}
        actions={
          <Button variant="primary" onClick={exportarRelatorioGeral} data-tour="primary-action">
            Exportar resumo CSV
          </Button>
        }
      />

      {isOwn && (
        <Alert tone="info" title="Visão restrita ao profissional">
          Seu perfil tem escopo restrito a atendimentos próprios. Os números exibidos refletem apenas a sua produção.
        </Alert>
      )}

      {/* Barra de Filtro de Período */}
      <div className="card tight">
        <div className="form-grid" style={{ alignItems: 'end' }}>
          <Field label="Período do relatório">
            <Select value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)}>
              <option value="hoje">Hoje</option>
              <option value="7dias">Últimos 7 dias</option>
              <option value="30dias">Últimos 30 dias</option>
              <option value="mes_atual">Mês atual</option>
              <option value="mes_anterior">Mês anterior</option>
              <option value="custom">Personalizado</option>
            </Select>
          </Field>
          {preset === 'custom' && (
            <>
              <Field label="Data inicial">
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </Field>
              <Field label="Data final">
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </Field>
            </>
          )}
          <div className="row" style={{ paddingBottom: 6 }}>
            <span className="small muted">
              Intervalo de análise: <strong>{formatCivil(start)}</strong> a <strong>{formatCivil(end)}</strong>
            </span>
          </div>
        </div>
      </div>

      <Tabs
        label="Áreas de relatório"
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: 'operacional', label: 'Operacional & Agenda' },
          { id: 'financeiro', label: 'Financeiro (Contexto B)' },
          { id: 'comercial', label: 'Comercial & Propostas' },
          { id: 'estoque', label: 'Estoque & Movimentos' },
        ]}
      />

      {/* ABA OPERACIONAL */}
      {tab === 'operacional' && (
        <TabPanel>
          <div className="stack" style={{ gap: 20 }}>
            <div className="grid grid-4">
              <Kpi label="Agendamentos" value={totalAgendados} foot={`${concluidos} concluídos no período`} />
              <Kpi label="Ocupação da agenda" value={`${ocupacao}%`} foot={`${(minutosAgendados / 60).toFixed(1)}h agendadas de ${(minutosOfertados / 60).toFixed(0)}h de jornada`} />
              <Kpi label="Faltas / Cancelamentos" value={`${faltas} / ${cancelados}`} foot={`Taxa absenteísmo: ${taxaAbsenteismo}%`} />
              <Kpi label="Ticket médio" value={formatBRL(ticketMedioCents)} foot="Por atendimento concluído" />
            </div>

            <div className="grid grid-2">
              <Section title="Atendimentos por profissional">
                <div className="stack" style={{ gap: 8 }}>
                  {porProfissional.map((p, i) => {
                    const pct = totalAgendados > 0 ? Math.round((p.total / totalAgendados) * 100) : 0
                    return (
                      <div key={i} className="st-bar-row">
                        <span className="truncate" title={p.name}>{p.name}</span>
                        <div className="st-bar"><span style={{ width: `${pct}%` }} /></div>
                        <span className="small muted">{p.total} ({p.concluidos} conc.)</span>
                      </div>
                    )
                  })}
                  {!porProfissional.length && <p className="small muted">Nenhum atendimento no período.</p>}
                </div>
              </Section>

              <Section title="Procedimentos mais procurados">
                <div className="stack" style={{ gap: 8 }}>
                  {porServico.slice(0, 6).map((s, i) => {
                    const max = porServico[0]?.total ?? 1
                    const pct = Math.round((s.total / max) * 100)
                    return (
                      <div key={i} className="st-bar-row">
                        <span className="truncate" title={s.name}>{s.name}</span>
                        <div className="st-bar"><span className="alt" style={{ width: `${pct}%` }} /></div>
                        <span className="small muted">{s.total} ({formatBRL(s.receitaCents)})</span>
                      </div>
                    )
                  })}
                  {!porServico.length && <p className="small muted">Nenhum serviço realizado no período.</p>}
                </div>
              </Section>
            </div>
          </div>
        </TabPanel>
      )}

      {/* ABA FINANCEIRO */}
      {tab === 'financeiro' && (
        <TabPanel>
          <div className="stack" style={{ gap: 20 }}>
            <Alert tone="neutral" title="Contexto B — Financeiro de Pacientes">
              Demonstrativo de receitas de consultas, procedimentos e orçamentos pagos pelos pacientes. Não confundir com a assinatura SaaS da clínica (Contexto A).
            </Alert>
            <div className="grid grid-4">
              <Kpi label="Receita por competência" value={formatBRL(receitaCompetenciaCents)} foot="Faturado no período" />
              <Kpi label="Recebido líquido" value={formatBRL(totalRecebidoCents)} foot="Pagamentos confirmados − estornos" />
              <Kpi label="Inadimplência vencida" value={formatBRL(valorVencidoCents)} foot={`Taxa de inadimplência: ${taxaInadimplencia}%`} />
              <Kpi label="Disponível" value={formatBRL(disponivelCents)} foot="Recebido com data de disponibilidade já atingida" />
            </div>

            <Section title="Demonstrativo de cobranças recentes no período">
              <DataTable
                rows={charges.slice(0, 50)}
                columns={[
                  { id: 'desc', header: 'Descrição', cell: (c) => c.description, value: (c) => c.description },
                  { id: 'comp', header: 'Competência', cell: (c) => formatCivil(c.competenceDate), value: (c) => c.competenceDate },
                  { id: 'venc', header: 'Vencimento', cell: (c) => formatCivil(c.dueDate), value: (c) => c.dueDate },
                  { id: 'valor', header: 'Valor', cell: (c) => formatBRL(c.amountCents), value: (c) => c.amountCents, num: true },
                  {
                    id: 'status',
                    header: 'Status',
                    cell: (c) => (
                      <Badge
                        tone={
                          c.status === 'paga'
                            ? 'success'
                            : c.status === 'vencida'
                            ? 'danger'
                            : c.status === 'parcial'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {c.status}
                      </Badge>
                    ),
                  },
                ]}
                rowKey={(c) => c.id}
                caption="Extrato de cobranças financeiras"
                exportName="relatorio_financeiro"
              />
            </Section>
          </div>
        </TabPanel>
      )}

      {/* ABA COMERCIAL */}
      {tab === 'comercial' && (
        <TabPanel>
          <div className="stack" style={{ gap: 20 }}>
            <div className="grid grid-3">
              <Kpi label="Propostas emitidas" value={totalPropostas} foot="Planos de tratamento / orçamentos" />
              <Kpi label="Propostas aceitas" value={propostasAceitas} foot={`Taxa de conversão: ${taxaConversaoPropostas}%`} />
              <Kpi label="Propostas recusadas" value={propostasRecusadas} foot="Desistência ou revisão" />
            </div>

            <Section title="Propostas no período">
              <DataTable
                rows={proposals}
                columns={[
                  { id: 'num', header: 'Número', cell: (p) => p.number, value: (p) => p.number },
                  { id: 'valid', header: 'Validade', cell: (p) => formatCivil(p.validUntil), value: (p) => p.validUntil },
                  { id: 'itens', header: 'Itens', cell: (p) => p.items.length },
                  {
                    id: 'status',
                    header: 'Status',
                    cell: (p) => (
                      <Badge tone={p.status === 'aceita' || p.status === 'aceita_parcial' ? 'success' : p.status === 'recusada' ? 'danger' : 'brand'}>
                        {p.status}
                      </Badge>
                    ),
                  },
                ]}
                rowKey={(p) => p.id}
                caption="Orçamentos e propostas comerciais"
                exportName="relatorio_propostas"
              />
            </Section>
          </div>
        </TabPanel>
      )}

      {/* ABA ESTOQUE */}
      {tab === 'estoque' && (
        <TabPanel>
          <StockReportSection tenantId={t.tenantId} start={start} end={end} />
        </TabPanel>
      )}
    </div>
  )
}

function StockReportSection({ tenantId, start, end }: { tenantId: string; start: string; end: string }) {
  const movements: StockMovement[] = useCollection(tenantId, 'stockMovements')
  const products = useCollection(tenantId, 'products')
  const filtered = movements.filter((m) => m.createdAt.slice(0, 10) >= start && m.createdAt.slice(0, 10) <= end)
  const consumo = filtered.filter((m) => m.kind === 'consumo_procedimento' || m.kind === 'saida' || m.kind === 'perda').reduce((a, m) => a + Math.abs(m.qty * (products.find((p) => p.id === m.productId)?.costCents ?? 0)), 0)
  const entradas = filtered.filter((m) => m.kind === 'entrada').reduce((a, m) => a + m.qty * (products.find((p) => p.id === m.productId)?.costCents ?? 0), 0)

  if (!filtered.length) {
    return (
      <div className="card">
        <p className="muted small">Nenhuma movimentação de estoque registrada no período selecionado.</p>
      </div>
    )
  }

  return (
    <div className="stack">
    <div className="grid grid-3"><Kpi label="Custo consumido" value={formatBRL(Math.round(consumo))} foot="Consumo, saídas e perdas × custo unitário" /><Kpi label="Entradas (compras)" value={formatBRL(Math.round(entradas))} foot="Entradas de estoque × custo unitário" /><Kpi label="Movimentações" value={filtered.length} /></div>
    <Section title="Consumo de insumos e movimentações no período">
      <DataTable
        rows={filtered}
        columns={[
          {
            id: 'prod',
            header: 'Produto',
            cell: (m) => products.find((p) => p.id === m.productId)?.name ?? m.productId,
          },
          { id: 'tipo', header: 'Tipo', cell: (m) => <Badge tone={m.qty < 0 ? 'warning' : 'success'}>{m.kind}</Badge> },
          { id: 'qtd', header: 'Qtd', cell: (m) => m.qty, num: true },
          { id: 'motivo', header: 'Motivo / Origem', cell: (m) => m.reason || 'Procedimento clínico' },
          { id: 'data', header: 'Data', cell: (m) => formatCivil(m.createdAt.slice(0, 10)) },
        ]}
        rowKey={(m) => m.id}
        caption="Movimentações de estoque"
        exportName="relatorio_estoque"
      />
    </Section>
    </div>
  )
}
