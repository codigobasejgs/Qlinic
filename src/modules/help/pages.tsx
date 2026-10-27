// Central de ajuda pública (/ajuda) e da equipe (/app/:slug/ajuda), com tours e checklist por usuário/tenant.
import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowRight, BookOpen, CheckCircle2, Circle, Play, RotateCcw, SkipForward, Search, ExternalLink } from 'lucide-react'
import { useTenant } from '@/app/session'
import { SEGMENT_LABEL, type Segment } from '@/domain/types'
import { Alert, Badge, Button, Checkbox, EmptyState, Field, Input, PageHeader, Progress, Select } from '@/ui/core'
import { useMediaQuery } from '@/ui/brand'
import { SiteLayout } from '@/modules/public/site'
import { Screenshot } from '@/modules/public/shot'
import { demoLink } from '@/modules/public/links'
import '@/modules/public/styles.css'
import './styles.css'
import { ARTICLES, CHECKLIST, GLOSSARY, HELP_FAQ, PROFILE_LABEL, TASK_LABEL, articleBySlug, articleHref, searchArticles, type HelpArticle, type HelpProfile, type HelpTask } from './content'
import { TOURS, stepsFor, type Tour } from './tours'
import { startTour, tourProgress, useTourState } from './tour'

type Ctx = { base: string; slug: string } | null

// ---------- Busca/lista ----------
function ArticleBrowser({ ctx, articles, defaultProfile, defaultSegment }: { ctx: Ctx; articles: HelpArticle[]; defaultProfile?: HelpProfile | ''; defaultSegment?: Segment | '' }) {
  const [q, setQ] = useState('')
  const [profile, setProfile] = useState<HelpProfile | ''>(defaultProfile ?? '')
  const [segment, setSegment] = useState<Segment | ''>(defaultSegment ?? '')
  const [task, setTask] = useState<HelpTask | ''>('')
  const list = searchArticles(articles, q, { profile, segment, task })
  const base = ctx ? `${ctx.base}/ajuda` : '/ajuda'
  return (
    <section className="stack" aria-labelledby="hb-t">
      <h2 id="hb-t" className="sr-only">Artigos</h2>
      <div className="help-filters">
        <Field label="Buscar por tarefa ou palavra"><Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: estorno, vacina, conflito" /></Field>
        <Field label="Perfil"><Select value={profile} onChange={(e) => setProfile(e.target.value as HelpProfile | '')}><option value="">Todos</option>{(Object.keys(PROFILE_LABEL) as HelpProfile[]).map((p) => <option key={p} value={p}>{PROFILE_LABEL[p]}</option>)}</Select></Field>
        <Field label="Segmento"><Select value={segment} onChange={(e) => setSegment(e.target.value as Segment | '')}><option value="">Todos</option>{(Object.keys(SEGMENT_LABEL) as Segment[]).map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}</Select></Field>
        <Field label="Tarefa"><Select value={task} onChange={(e) => setTask(e.target.value as HelpTask | '')}><option value="">Todas</option>{(Object.keys(TASK_LABEL) as HelpTask[]).map((t) => <option key={t} value={t}>{TASK_LABEL[t]}</option>)}</Select></Field>
      </div>
      <p className="small muted" aria-live="polite">{list.length} artigo(s) encontrado(s).</p>
      {list.length ? (
        <ul className="help-list" role="list">
          {list.map((a) => (
            <li key={a.slug}>
              <Link to={`${base}/${a.slug}`} className="help-item">
                <span className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
                  <span className="strong">{a.title}</span>
                  <span className="small muted">{a.summary}</span>
                  <span className="row" style={{ '--gap': '6px' } as React.CSSProperties}>
                    <Badge plain>{TASK_LABEL[a.task]}</Badge>
                    {a.segments.map((s) => <Badge key={s} tone="brand" plain>{SEGMENT_LABEL[s]}</Badge>)}
                  </span>
                </span>
                <ArrowRight aria-hidden="true" className="help-arrow" />
              </Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="Nenhum artigo encontrado" icon={<Search aria-hidden="true" />}>Tente outra palavra ou limpe os filtros.</EmptyState>}
    </section>
  )
}

function Glossary() {
  return (
    <section className="stack" aria-labelledby="gl-t">
      <h2 id="gl-t">Glossário</h2>
      <dl className="help-gloss">{GLOSSARY.map((g) => <div key={g.term}><dt className="strong">{g.term}</dt><dd className="small muted">{g.def}</dd></div>)}</dl>
    </section>
  )
}
function FaqBlock({ items, title = 'Perguntas frequentes' }: { items: { q: string; a: string }[]; title?: string }) {
  if (!items.length) return null
  return (
    <section className="stack" aria-label={title}>
      <h2>{title}</h2>
      <div className="pub-faq">{items.map((f) => <details key={f.q}><summary>{f.q}</summary><p className="muted">{f.a}</p></details>)}</div>
    </section>
  )
}

// ---------- Artigo ----------
function ArticleView({ a, ctx, canTour }: { a: HelpArticle; ctx: Ctx; canTour?: (t: Tour) => boolean }) {
  const href = articleHref(a, ctx, demoLink)
  const external = /^\/c\//.test(href) || (!ctx && !href.startsWith('/demonstracao'))
  const tour = a.tourId ? TOURS.find((t) => t.id === a.tourId) : undefined
  const tourOk = ctx && tour && tour.audience === 'equipe' && (!canTour || canTour(tour))
  return (
    <article className="stack help-article" style={{ '--gap': '24px' } as React.CSSProperties} aria-labelledby="art-t">
      <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
        <nav aria-label="Trilha de navegação" className="breadcrumbs"><Link to={ctx ? `${ctx.base}/ajuda` : '/ajuda'}>Central de ajuda</Link><span aria-hidden="true">/</span><span aria-current="page">{a.title}</span></nav>
        <h1 id="art-t">{a.title}</h1>
        <p className="muted">{a.summary}</p>
        <div className="row" style={{ '--gap': '6px' } as React.CSSProperties}>
          <Badge plain>{TASK_LABEL[a.task]}</Badge>
          {a.profiles.map((p) => <Badge key={p} plain>{PROFILE_LABEL[p]}</Badge>)}
          {a.segments.map((s) => <Badge key={s} tone="brand" plain>{SEGMENT_LABEL[s]}</Badge>)}
        </div>
        <div className="row">
          <Link to={href} className="btn btn-primary">Abrir esta tela {external ? <ExternalLink aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}</Link>
          {tourOk && <Button icon={<Play />} onClick={() => startTour(tour.id)}>Iniciar tour guiado</Button>}
        </div>
      </div>
      <section aria-labelledby="art-pre" className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
        <h2 id="art-pre">Pré-requisitos</h2>
        <ul className="help-ul">{a.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul>
      </section>
      <section aria-labelledby="art-steps" className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
        <h2 id="art-steps">Passo a passo</h2>
        <ol className="help-steps">{a.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      </section>
      <Screenshot id={a.shot} alt={`Captura real da tela relacionada: ${a.title}`} caption="Captura da demonstração, com dados fictícios." />
      <section aria-labelledby="art-exp" className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
        <h2 id="art-exp">Resultado esperado</h2>
        <Alert tone="success">{a.expected}</Alert>
      </section>
      <section aria-labelledby="art-err" className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
        <h2 id="art-err">Erros comuns</h2>
        <dl className="help-errs">{a.errors.map((e) => <div key={e.problem}><dt className="strong">{e.problem}</dt><dd className="small">{e.fix}</dd></div>)}</dl>
      </section>
      {a.faq && <FaqBlock items={a.faq} title="Dúvidas sobre este tema" />}
    </article>
  )
}

// ---------- Público ----------
export function PublicHelpCenter() {
  return (
    <SiteLayout title="Central de ajuda">
      <div className="container stack" style={{ '--gap': '32px', paddingTop: 32, paddingBottom: 64 } as React.CSSProperties}>
        <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <h1>Central de ajuda</h1>
          <p className="lead muted">Guias curtos por tarefa, perfil e segmento, com capturas reais da demonstração e link direto para cada tela.</p>
        </div>
        <Alert tone="info" title="Tours guiados">Dentro da área da equipe, a ajuda oferece tours passo a passo. <Link to="/demonstracao">Entre na demonstração</Link> e abra “Ajuda e treinamento”.</Alert>
        <ArticleBrowser ctx={null} articles={ARTICLES} />
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <FaqBlock items={HELP_FAQ} />
          <Glossary />
        </div>
      </div>
    </SiteLayout>
  )
}

export function PublicHelpArticle() {
  const { artigo } = useParams()
  const a = articleBySlug(artigo)
  return (
    <SiteLayout title={a?.title ?? 'Artigo não encontrado'}>
      <div className="container help-wrap" style={{ paddingTop: 32, paddingBottom: 64 }}>
        {a ? <ArticleView a={a} ctx={null} /> : <NotFoundArticle base="/ajuda" />}
      </div>
    </SiteLayout>
  )
}

function NotFoundArticle({ base }: { base: string }) {
  return <EmptyState title="Artigo não encontrado" icon={<BookOpen aria-hidden="true" />} action={<Link className="btn btn-primary" to={base}>Ver todos os artigos</Link>}>O endereço pode ter mudado.</EmptyState>
}

// ---------- Equipe ----------
function useTourAccess() {
  const t = useTenant()
  return (tour: Tour) => tour.audience === 'equipe' && (!tour.module || t.moduleOn(tour.module)) && (!tour.resource || t.can(tour.resource, 'read') || t.scope(tour.resource) !== false)
}

function roleProfile(roles: string[]): HelpProfile | '' {
  return (roles[0] as HelpProfile | undefined) ?? ''
}

export function StaffHelpPage() {
  const t = useTenant()
  const canTour = useTourAccess()
  const profile = roleProfile(t.effectiveUser?.memberships.map((m) => m.role) ?? [])
  const visibleArticles = ARTICLES.filter((a) => !a.segments.length || a.segments.some((s) => t.moduleOn(s)))
  return (
    <div className="stack" style={{ '--gap': '32px' } as React.CSSProperties} data-tour="page-content">
      <PageHeader title="Ajuda e treinamento" subtitle={`Guias, tours e checklist para ${t.org.name}.`} />
      <Checklist />
      <ToursPanel canTour={canTour} />
      <ArticleBrowser ctx={{ base: t.base, slug: t.org.slug }} articles={visibleArticles} defaultProfile={profile} />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <FaqBlock items={HELP_FAQ} />
        <Glossary />
      </div>
      <p className="small muted">Treinamento em vídeo: produção audiovisual futura. Por enquanto, use os guias com capturas e os tours.</p>
    </div>
  )
}

export function StaffHelpArticle() {
  const t = useTenant()
  const canTour = useTourAccess()
  const { artigo } = useParams()
  const a = articleBySlug(artigo)
  return <div className="help-wrap" data-tour="page-content">{a ? <ArticleView a={a} ctx={{ base: t.base, slug: t.org.slug }} canTour={canTour} /> : <NotFoundArticle base={`${t.base}/ajuda`} />}</div>
}

// Checklist persistido por usuário/tenant (localStorage, chave com tenantId + userId).
const ckListeners = new Set<() => void>()
function ckKey(tenantId: string, userId: string) { return `qlinic.help.checklist.${tenantId}:${userId}` }
function readCk(key: string): string { try { return localStorage.getItem(key) ?? '[]' } catch { return '[]' } }
function Checklist() {
  const t = useTenant()
  const key = ckKey(t.tenantId, t.user?.id ?? 'anon')
  const raw = useSyncExternalStore((cb) => { ckListeners.add(cb); return () => { ckListeners.delete(cb) } }, () => readCk(key))
  const done = useMemo(() => new Set<string>(JSON.parse(raw) as string[]), [raw])
  const toggle = (id: string) => {
    const next = new Set(done)
    if (next.has(id)) next.delete(id); else next.add(id)
    try { localStorage.setItem(key, JSON.stringify([...next])) } catch { /* sem storage */ }
    ckListeners.forEach((l) => l())
  }
  const canConfig = t.can('configuracoes', 'read')
  return (
    <section className="card stack" aria-labelledby="ck-t">
      <div className="row between">
        <h2 id="ck-t" style={{ fontSize: 18 }}>Checklist inicial</h2>
        <span className="small muted" aria-live="polite">{done.size} de {CHECKLIST.length} concluídos</span>
      </div>
      <Progress value={done.size} max={CHECKLIST.length} label="Progresso do checklist inicial" />
      {!canConfig && <p className="small muted">Alguns itens dependem de um perfil de gestão. Você pode marcá-los para acompanhar o andamento da clínica.</p>}
      <ul className="help-ck" role="list">
        {CHECKLIST.map((c) => (
          <li key={c.id}>
            <Checkbox label={c.label} checked={done.has(c.id)} onChange={() => toggle(c.id)} />
            <Link to={`${t.base}/${c.route}`} className="small">Abrir</Link>
          </li>
        ))}
      </ul>
      <p className="tiny muted">Salvo para o seu usuário nesta clínica, neste navegador.</p>
    </section>
  )
}

function ToursPanel({ canTour }: { canTour: (t: Tour) => boolean }) {
  useTourState() // re-render quando um tour inicia/para
  const narrow = !useMediaQuery('(min-width: 1024px)')
  const width = narrow ? 390 : 1440
  const prog = tourProgress()
  const list = TOURS.filter((x) => x.audience === 'equipe')
  const allowed = list.filter(canTour)
  const hidden = list.length - allowed.length
  return (
    <section className="stack" aria-labelledby="tours-t">
      <div className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
        <h2 id="tours-t">Tours guiados</h2>
        <p className="small muted">Retome de onde parou, pule ou reinicie quando quiser. Os tours não bloqueiam o trabalho.{narrow ? ' Em telas pequenas, passos do menu lateral são omitidos.' : ''}</p>
      </div>
      <ul className="help-tours" role="list">
        {allowed.map((tour) => {
          const n = stepsFor(tour, width).length
          const p = prog[tour.id]
          const status = p === 'concluido' ? { label: 'Concluído', tone: 'success' as const, icon: CheckCircle2 } : p === 'pulado' ? { label: 'Pulado', tone: 'neutral' as const, icon: SkipForward } : typeof p === 'number' ? { label: `Em andamento ${Math.min(p + 1, n)}/${n}`, tone: 'info' as const, icon: Circle } : { label: 'Não iniciado', tone: 'neutral' as const, icon: Circle }
          return (
            <li key={tour.id} className="card tight stack" style={{ '--gap': '8px' } as React.CSSProperties}>
              <div className="row between nowrap"><h3>{tour.title}</h3><Badge tone={status.tone}>{status.label}</Badge></div>
              <p className="small muted">{tour.description} · {n} passos</p>
              <div className="row">
                {typeof p === 'number'
                  ? <><Button size="sm" variant="primary" icon={<Play />} onClick={() => startTour(tour.id, p)}>Retomar</Button><Button size="sm" icon={<RotateCcw />} onClick={() => startTour(tour.id, 0)}>Reiniciar</Button></>
                  : p ? <Button size="sm" icon={<RotateCcw />} onClick={() => startTour(tour.id, 0)}>Reiniciar</Button>
                    : <Button size="sm" variant="primary" icon={<Play />} onClick={() => startTour(tour.id, 0)}>Iniciar</Button>}
              </div>
            </li>
          )
        })}
      </ul>
      {hidden > 0 && <p className="small muted">{hidden} tour(s) de áreas que este perfil não acessa ou que não estão habilitadas nesta clínica foram ocultados.</p>}
    </section>
  )
}
