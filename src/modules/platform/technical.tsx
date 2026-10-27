// Saúde de integrações (erros sanitizados, filas e eventos simulados) e domínios/PWA por cliente.
import { useEffect, useState } from 'react'
import { usePlatformCollection } from '@/data/store'
import type { IntegrationHealth } from '@/domain/platform'
import { hasPublishedPwa } from '@/domain/tenancy'
import { Alert, Badge, Button, EmptyState, ErrorState, Field, Kpi, PageHeader, Section, Select, SimBadge, Skeleton } from '@/ui/core'
import { Dialog, useAction } from '@/ui/overlay'
import { DataTable, type Column } from '@/ui/table'
import { formatDateTime } from '@/lib/dates'
import { reprocessIntegration, simulateDuplicateEvent, recheckDomain } from './actions'
import { sanitize } from './metrics'
import { CERT_STATUS, DOMAIN_STATUS, Guard, INT_STATUS, PROVIDER_LABEL, pct, usePlatformMe } from './lib'

// ======================= Integrações =======================
export function IntegrationsHealthPage() {
  return <Guard area="integracoes" title="Integrações"><Integrations /></Guard>
}
function Integrations() {
  const list = usePlatformCollection('integrations')
  const orgs = usePlatformCollection('organizations')
  const usage = usePlatformCollection('usage')
  const me = usePlatformMe()
  const run = useAction()
  const [f, setF] = useState({ context: '', provider: '', status: '', tenant: '' })
  const [sel, setSel] = useState<string | null>(null)
  const name = (id: string | null) => (id ? orgs.find((o) => o.id === id)?.name ?? id : 'Qlinic (plataforma)')
  const rows = list.filter((i) => (!f.context || i.context === f.context) && (!f.provider || i.provider === f.provider) && (!f.status || i.status === f.status) && (!f.tenant || (f.tenant === '__plat' ? i.tenantId === null : i.tenantId === f.tenant)))
  const q = rows.reduce((a, i) => ({ pending: a.pending + i.queue.pending, failed: a.failed + i.queue.failed, retrying: a.retrying + i.queue.retrying }), { pending: 0, failed: 0, retrying: 0 })
  const lastMonth = usage.map((u) => u.month).sort().at(-1)
  const consumption = (i: IntegrationHealth) => {
    if (!i.tenantId) return '—'
    const u = usage.find((x) => x.tenantId === i.tenantId && x.month === lastMonth)
    if (!u) return '—'
    return i.provider === 'evolution' || i.provider === 'resend' ? `${u.messages.toLocaleString('pt-BR')} msgs` : i.provider === 'ia' ? `${u.aiCredits} créditos` : '—'
  }
  const cols: Column<IntegrationHealth>[] = [
    { id: 'p', header: 'Provedor', cell: (i) => PROVIDER_LABEL[i.provider], value: (i) => PROVIDER_LABEL[i.provider] },
    { id: 't', header: 'Conta', cell: (i) => name(i.tenantId), value: (i) => name(i.tenantId) },
    { id: 'c', header: 'Contexto', cell: (i) => <Badge tone={i.context === 'plataforma' ? 'brand' : 'neutral'}>{i.context === 'plataforma' ? 'A · Plataforma' : 'B · Clínica'}</Badge>, value: (i) => i.context },
    { id: 's', header: 'Status', cell: (i) => <Badge tone={INT_STATUS[i.status][1]}>{INT_STATUS[i.status][0]}</Badge>, value: (i) => i.status },
    { id: 'e', header: 'Taxa de erro', num: true, cell: (i) => <span className={i.errorRate >= 0.1 ? 'strong' : undefined}>{pct(i.errorRate)}</span>, value: (i) => i.errorRate },
    { id: 'q', header: 'Fila (pend./falha/retent.)', num: true, cell: (i) => `${i.queue.pending} / ${i.queue.failed} / ${i.queue.retrying}`, value: (i) => i.queue.failed + i.queue.retrying },
    { id: 'u', header: 'Consumo (mês)', cell: consumption, hidden: true },
    { id: 'l', header: 'Último evento', cell: (i) => (i.lastEventAt ? formatDateTime(i.lastEventAt) : '—'), value: (i) => i.lastEventAt ?? '' },
  ]
  const current = list.find((i) => i.id === sel)
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Integrações" subtitle="Saúde por provedor e conta. Erros exibidos sanitizados (sem dados pessoais). Filas e eventos simulados." actions={<SimBadge />} />
      <div className="grid grid-4">
        <Kpi label="Integrações (filtro)" value={rows.length} foot={`${rows.filter((i) => ['erro', 'degradada', 'expirada'].includes(i.status)).length} com problema`} />
        <Kpi label="Pendentes" value={q.pending} />
        <Kpi label="Falhas na fila" value={q.failed} />
        <Kpi label="Em retentativa" value={q.retrying} />
      </div>
      <div className="form-grid" role="search" aria-label="Filtros de integrações">
        <Field label="Contexto"><Select value={f.context} onChange={(e) => setF({ ...f, context: e.target.value })}><option value="">Todos</option><option value="plataforma">A · Plataforma (Qlinic recebe)</option><option value="clinica">B · Clínica (paciente paga)</option></Select></Field>
        <Field label="Provedor"><Select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}><option value="">Todos</option>{[...new Set(list.map((i) => i.provider))].map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}</Select></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Todos</option>{Object.entries(INT_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Conta"><Select value={f.tenant} onChange={(e) => setF({ ...f, tenant: e.target.value })}><option value="">Todas</option><option value="__plat">Qlinic (plataforma)</option>{[...new Set(list.map((i) => i.tenantId).filter(Boolean))].map((t) => <option key={t!} value={t!}>{name(t)}</option>)}</Select></Field>
      </div>
      <DataTable caption="Saúde das integrações" rows={rows} columns={cols} rowKey={(i) => i.id} onRowClick={(i) => setSel(i.id)} empty={<EmptyState title="Nenhuma integração com esses filtros" />}
        rowActions={(i) => i.queue.failed + i.queue.retrying > 0 ? <Button size="sm" variant="primary" data-tour="primary-action" onClick={() => run(() => reprocessIntegration(i.id, me.actor), 'Falhas reprocessadas (simulado) com idempotência.')}>Reprocessar falhas</Button> : null} />
      <Alert tone="neutral" title="Credenciais">Nenhuma chave de API é digitada ou guardada no navegador. Conexão real = configuração futura no servidor, com verificação de assinatura de webhook e deduplicação por eventId.</Alert>
      {current && (
        <Dialog open drawer size="lg" onClose={() => setSel(null)} title={`${PROVIDER_LABEL[current.provider]} — ${name(current.tenantId)}`} description={`Ambiente: ${current.environment} · Contexto ${current.context === 'plataforma' ? 'A (plataforma)' : 'B (clínica)'}`}>
          <div className="stack">
            <div className="row"><Badge tone={INT_STATUS[current.status][1]}>{INT_STATUS[current.status][0]}</Badge><SimBadge /></div>
            <div className="grid grid-3"><Kpi label="Pendentes" value={current.queue.pending} /><Kpi label="Falhas" value={current.queue.failed} /><Kpi label="Retentativa" value={current.queue.retrying} /></div>
            <div className="row">
              <Button variant="primary" disabled={current.queue.failed + current.queue.retrying === 0} onClick={() => run(() => reprocessIntegration(current.id, me.actor), 'Reprocessado (simulado).')}>Reprocessar falhas</Button>
              <Button onClick={() => run(() => simulateDuplicateEvent(current.id, me.actor), 'Webhook duplicado simulado: segundo envio ignorado.')}>Simular webhook duplicado</Button>
            </div>
            <Section title="Eventos recentes (sanitizados)">
              {current.events.length ? (
                <ul className="stack" style={{ '--gap': '8px', margin: 0, padding: 0, listStyle: 'none' } as React.CSSProperties} aria-live="polite">
                  {current.events.map((e) => <li key={e.id} className="list-card"><div className="row between"><span className="mono">{e.type}</span><Badge tone={e.result === 'ok' ? 'success' : e.result === 'erro' ? 'danger' : e.result === 'duplicado' ? 'warning' : 'neutral'}>{e.result === 'duplicado' ? 'duplicado ignorado' : e.result}</Badge></div><span className="small">{sanitize(e.detail)}</span><span className="tiny muted">{formatDateTime(e.at)}</span></li>)}
                </ul>
              ) : <p className="small muted">Sem eventos registrados.</p>}
            </Section>
          </div>
        </Dialog>
      )}
    </div>
  )
}

// ======================= Domínios e PWA =======================
interface Manifest { id?: string; name?: string; short_name?: string; start_url?: string; scope?: string; display?: string; theme_color?: string; background_color?: string; icons?: { src: string; sizes?: string; type?: string; purpose?: string }[] }
type Loaded = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: Manifest } | { state: 'none' }

const SAFE_SLUG = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/
/** Busca manifesto publicado; valida slug e formato (resposta tratada como não confiável). */
function useManifest(slug: string | null, kind: 'equipe' | 'portal'): Loaded {
  const [s, setS] = useState<Loaded>({ state: 'none' })
  useEffect(() => {
    if (!slug) { setS({ state: 'none' }); return }
    if (!SAFE_SLUG.test(slug) || !hasPublishedPwa(slug)) { setS({ state: 'error', message: 'Tenant sem manifesto publicado. Nenhum manifesto de outra clínica é usado como substituto.' }); return }
    let alive = true
    setS({ state: 'loading' })
    fetch(`/t/${slug}/${kind}.webmanifest`, { cache: 'no-cache' })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); const j = (await r.json()) as Manifest; if (typeof j !== 'object' || !j || !Array.isArray(j.icons)) throw new Error('formato inválido'); return j })
      .then((data) => { if (alive) setS({ state: 'ok', data }) })
      .catch((e: unknown) => { if (alive) setS({ state: 'error', message: `Não foi possível ler o manifesto (${e instanceof Error ? e.message : 'erro'}).` }) })
    return () => { alive = false }
  }, [slug, kind])
  return s
}

function checklist(m: Manifest, slug: string, kind: 'equipe' | 'portal') {
  const expectedStart = kind === 'equipe' ? `/app/${slug}/` : `/c/${slug}/portal/`
  const sizes = (m.icons ?? []).map((i) => i.sizes ?? '')
  return [
    ['Nome e nome curto', !!m.name && !!m.short_name],
    ['id estável definido', !!m.id],
    [`start_url pertence ao tenant (${expectedStart})`, m.start_url === expectedStart],
    ['start_url dentro do scope', !!m.scope && !!m.start_url && m.start_url.startsWith(m.scope)],
    ['display standalone', m.display === 'standalone'],
    ['theme_color e background_color', !!m.theme_color && !!m.background_color],
    ['Ícone 192×192', sizes.includes('192x192')],
    ['Ícone 512×512', sizes.includes('512x512')],
    ['Ícone maskable', (m.icons ?? []).some((i) => i.purpose?.includes('maskable'))],
    ['Ícones com URL persistente (sem blob:)', (m.icons ?? []).every((i) => !i.src.startsWith('blob:') && !i.src.startsWith('data:'))],
  ] as [string, boolean][]
}

function ManifestPreview({ slug, kind }: { slug: string; kind: 'equipe' | 'portal' }) {
  const s = useManifest(slug, kind)
  if (s.state === 'loading') return <Skeleton h={120} />
  if (s.state === 'error') return <ErrorState title="Manifesto indisponível">{s.message}</ErrorState>
  if (s.state !== 'ok') return null
  const m = s.data
  const icons = (m.icons ?? []).filter((i) => typeof i.src === 'string' && i.src.startsWith(`/t/${slug}/`))
  const checks = checklist(m, slug, kind)
  return (
    <div className="stack" style={{ '--gap': '12px' } as React.CSSProperties}>
      <dl className="stack" style={{ '--gap': '4px', margin: 0 } as React.CSSProperties}>
        {([['name', m.name], ['short_name', m.short_name], ['id', m.id], ['start_url', m.start_url], ['scope', m.scope], ['display', m.display], ['theme_color', m.theme_color]] as const).map(([k, v]) => <div key={k} className="row between"><dt className="mono muted">{k}</dt><dd className="mono" style={{ margin: 0, wordBreak: 'break-all' }}>{v ?? '—'}</dd></div>)}
      </dl>
      <div className="pl-manifest-icons">{icons.map((i) => <figure key={i.src}><img src={i.src} alt={`Ícone ${i.sizes} ${i.purpose ?? ''}`} loading="lazy" /><figcaption>{i.sizes} · {i.purpose ?? 'any'}</figcaption></figure>)}</div>
      <ul className="stack" style={{ '--gap': '4px', margin: 0, padding: 0, listStyle: 'none' } as React.CSSProperties} aria-label="Checklist de instalabilidade">
        {checks.map(([l, ok]) => <li key={l} className="row small"><Badge tone={ok ? 'success' : 'danger'}>{ok ? 'OK' : 'Falha'}</Badge>{l}</li>)}
      </ul>
      <a className="small" href={`/t/${slug}/${kind}.webmanifest`} target="_blank" rel="noopener">Abrir manifesto bruto</a>
    </div>
  )
}

export function DomainsPwaPage() {
  return <Guard area="dominios" title="Domínios e PWA"><Domains /></Guard>
}
function Domains() {
  const domains = usePlatformCollection('domains')
  const orgs = usePlatformCollection('organizations')
  const me = usePlatformMe()
  const run = useAction()
  const [tenant, setTenant] = useState(domains[0]?.tenantId ?? '')
  const org = orgs.find((o) => o.id === tenant)
  const d = domains.find((x) => x.tenantId === tenant)
  const pwa = org ? hasPublishedPwa(org.slug) : false
  return (
    <div className="stack" data-tour="page-content">
      <PageHeader title="Domínios e PWA" subtitle="Hostname por cliente, verificação, certificado, identidade e manifesto instalável." actions={<SimBadge>Diagnóstico demonstrativo</SimBadge>} />
      <Alert tone="info" title="Nomes de domínio são exemplos">Nenhum domínio comercial está adquirido. Registros de verificação (CNAME/TXT) não são inventados aqui: os valores reais são informados pelo provedor de hospedagem/DNS no momento da configuração.</Alert>
      <DataTable caption="Domínios por contratante" rows={domains} rowKey={(x) => x.id} onRowClick={(x) => setTenant(x.tenantId)} columns={[
        { id: 't', header: 'Contratante', cell: (x) => orgs.find((o) => o.id === x.tenantId)?.name ?? x.tenantId, value: (x) => x.tenantId },
        { id: 'h', header: 'Hostname (exemplo)', cell: (x) => <span className="mono">{x.hostname}</span>, value: (x) => x.hostname },
        { id: 'k', header: 'Tipo', cell: (x) => (x.kind === 'proprio' ? 'Domínio próprio' : 'Subdomínio'), value: (x) => x.kind },
        { id: 's', header: 'Verificação', cell: (x) => <Badge tone={DOMAIN_STATUS[x.status][1]}>{DOMAIN_STATUS[x.status][0]}</Badge>, value: (x) => x.status },
        { id: 'c', header: 'Certificado', cell: (x) => <Badge tone={CERT_STATUS[x.certificate][1]}>{CERT_STATUS[x.certificate][0]}</Badge>, value: (x) => x.certificate },
        { id: 'v', header: 'Identidade', num: true, cell: (x) => `v${orgs.find((o) => o.id === x.tenantId)?.brand.version ?? x.brandVersion}` },
      ]} rowActions={(x) => <Button size="sm" data-tour="primary-action" onClick={() => run(() => recheckDomain(x.id, me.actor), 'Verificação simulada executada.')}>Verificar agora</Button>} />
      <Field label="Contratante em detalhe"><Select value={tenant} onChange={(e) => setTenant(e.target.value)}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
      {!org ? <ErrorState title="Contratante desconhecido">Nenhum tenant corresponde à seleção. Nenhuma clínica padrão é usada como substituta.</ErrorState> : (
        <div className="stack">
          <Section title={`Diagnóstico — ${org.name}`}>
            {d ? (
              <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
                <p className="mono">{d.hostname}</p>
                <div className="row"><Badge tone={DOMAIN_STATUS[d.status][1]}>{DOMAIN_STATUS[d.status][0]}</Badge><Badge tone={CERT_STATUS[d.certificate][1]}>Certificado: {CERT_STATUS[d.certificate][0]}</Badge><Badge plain>Identidade v{org.brand.version}</Badge></div>
                <p className="small muted">Última verificação: {d.lastCheckAt ? formatDateTime(d.lastCheckAt) : '—'}</p>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }} aria-live="polite">{d.diagnostics.map((t, i) => <li key={i}>{t}</li>)}</ul>
                <Button onClick={() => run(() => recheckDomain(d.id, me.actor), 'Verificação simulada executada.')}>Verificar agora (simulado)</Button>
              </div>
            ) : <EmptyState title="Sem domínio configurado">Acesso por caminho: /app/{org.slug} e /c/{org.slug}. Exemplo de subdomínio futuro: {org.slug}.dominio-da-plataforma.exemplo</EmptyState>}
            <p className="small muted" style={{ marginTop: 12 }}>Tenant desconhecido por hostname deve retornar erro seguro, nunca a clínica padrão. Sessões host-only por domínio (desenho futuro).</p>
          </Section>
          <Section title="Manifesto PWA publicado">
            {pwa ? (
              <div className="grid grid-2">
                <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}><h3>App da equipe</h3><ManifestPreview key={`${org.slug}-e`} slug={org.slug} kind="equipe" /></div>
                <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}><h3>Portal do paciente</h3><ManifestPreview key={`${org.slug}-p`} slug={org.slug} kind="portal" /></div>
              </div>
            ) : <Alert tone="warning" title="Sem PWA publicado">Manifestos e ícones são gerados em build apenas para as clínicas de demonstração. Para este contratante não há manifesto — e nenhum manifesto de outra clínica é reaproveitado.</Alert>}
          </Section>
        </div>
      )}
    </div>
  )
}
