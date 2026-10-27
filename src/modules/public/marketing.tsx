// Site comercial: Landing, Segmento, Planos, Recursos.
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { Activity, Apple, ArrowRight, Brain, PawPrint, Smile, Sparkles, Stethoscope, Smartphone, Share, RefreshCw, Globe, MonitorSmartphone, Gauge, type LucideIcon } from 'lucide-react'
import { platformDb, usePlatformCollection } from '@/data/store'
import type { Segment } from '@/domain/types'
import { nowISO } from '@/lib/dates'
import { uid } from '@/lib/util'
import { Alert, Badge, Button, ButtonLink, Field, Input, Select, SimBadge, Textarea } from '@/ui/core'
import { useAction } from '@/ui/overlay'
import { SiteLayout, SectionHead } from './site'
import { BENEFITS, FAQ, FEATURE_AREAS, SEGMENTS, segmentByKey } from './content'
import { PlansCompare } from './plans'
import { Screenshot, hasShot } from './shot'
import { demoLink } from './links'
import { isValidEmail } from './lib'

export const SEG_ICON: Record<Segment, LucideIcon> = {
  odontologia: Smile, medicina: Stethoscope, veterinaria: PawPrint, estetica: Sparkles, psicologia: Brain, fisioterapia: Activity, nutricao: Apple,
}

export function LandingPage() {
  return (
    <SiteLayout title="Sua clínica conectada ao cuidado">
      <section className="hero container pub-hero" aria-labelledby="hero-t">
        <div className="stack pub-hero-text" style={{ '--gap': '20px' } as React.CSSProperties}>
          <span className="badge brand plain">Gestão para clínicas de saúde e veterinárias</span>
          <h1 id="hero-t">Sua clínica conectada ao cuidado.</h1>
          <p className="lead">Agenda, recepção, prontuário por especialidade, financeiro, estoque e portal do paciente em um só lugar — com a marca da sua clínica e um app instalável para equipe e pacientes.</p>
          <div className="row" style={{ '--gap': '12px' } as React.CSSProperties}>
            <Link to="/demonstracao" className="btn btn-primary">Ver demonstração <ArrowRight aria-hidden="true" /></Link>
            <Link to="/recursos" className="btn btn-secondary">Conhecer recursos</Link>
          </div>
          <p className="small muted">Demonstração navegável com clínicas fictícias. Nenhum dado real, envio ou cobrança.</p>
        </div>
        <Screenshot id="agenda" eager alt="Tela real da agenda semanal da clínica fictícia Sorriso Pleno, com atendimentos por profissional" className="pub-hero-shot" />
      </section>

      <section className="site-section pub-band" aria-labelledby="segmentos">
        <div className="container stack" style={{ '--gap': '24px' } as React.CSSProperties}>
          <SectionHead id="segmentos" eyebrow="Segmentos" title="Feito para a rotina de cada especialidade" lead="Escolha seu segmento para ver os módulos, os fluxos e a clínica de demonstração correspondente." />
          <ul className="pub-seg-grid" role="list">
            {SEGMENTS.map((s) => {
              const Icon = SEG_ICON[s.key]
              return (
                <li key={s.key}>
                  <Link to={`/segmentos/${s.key}`} className="pub-seg">
                    <Icon aria-hidden="true" />
                    <span className="strong">{s.label}</span>
                    <span className="small muted">{s.demoName}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className="site-section" aria-labelledby="beneficios">
        <div className="container stack" style={{ '--gap': '32px' } as React.CSSProperties}>
          <SectionHead id="beneficios" eyebrow="Na prática" title="Benefícios que você pode testar agora" lead="Cada item abre a tela real da demonstração. As imagens são capturas do próprio sistema, com dados fictícios." />
          <div className="pub-benefits">
            {BENEFITS.map((b) => (
              <article key={b.title} className="pub-benefit" aria-labelledby={`b-${b.shot}`}>
                <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
                  <h3 id={`b-${b.shot}`}>{b.title}</h3>
                  <p className="muted">{b.body}</p>
                  <Link to={demoLink(b.route, b.slug)} className="btn btn-link" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>Abrir na demonstração<ArrowRight aria-hidden="true" /></Link>
                </div>
                <Screenshot id={b.shot} alt={`Captura real da tela: ${b.title.toLowerCase()}`} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <PwaSection />

      <section className="site-section" aria-labelledby="planos-t">
        <div className="container stack" style={{ '--gap': '24px' } as React.CSSProperties}>
          <SectionHead id="planos-t" eyebrow="Planos" title="Planos com limites claros" lead="Compare franquias e módulos. Valores de demonstração, editáveis no Super Admin." />
          <PlansCompare compact />
          <ButtonLink to="/planos" variant="secondary" className="pub-self-start">Ver comparativo completo</ButtonLink>
        </div>
      </section>

      <Transparency />

      <section className="site-section" aria-labelledby="faq">
        <div className="container stack pub-narrow" style={{ '--gap': '16px' } as React.CSSProperties}>
          <SectionHead id="faq" eyebrow="Dúvidas" title="Perguntas frequentes" />
          <FaqList items={FAQ} />
        </div>
      </section>

      <section className="site-section pub-band" aria-labelledby="contato">
        <div className="container pub-cta">
          <div className="stack" style={{ '--gap': '16px' } as React.CSSProperties}>
            <SectionHead id="contato" eyebrow="Próximo passo" title="Veja funcionando com a sua especialidade" lead="Entre na demonstração com o perfil que você usa no dia a dia: recepção, profissional, financeiro, gestão ou paciente." />
            <Link to="/demonstracao" className="btn btn-primary pub-self-start">Ver demonstração <ArrowRight aria-hidden="true" /></Link>
          </div>
          <ContactForm />
        </div>
      </section>
    </SiteLayout>
  )
}

function PwaSection() {
  const items: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: MonitorSmartphone, title: 'App da equipe e app do paciente', body: 'Cada clínica tem identidades separadas para a equipe e para pacientes/tutores, com nome, cor e ícone próprios.' },
    { icon: Smartphone, title: 'Instalação pelo navegador', body: 'No Android e no computador, navegadores compatíveis oferecem “Instalar app”. A disponibilidade depende do navegador e do sistema.' },
    { icon: Share, title: 'No iPhone e iPad', body: 'Abra no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Não há instalação automática.' },
    { icon: RefreshCw, title: 'Atualizações da marca', body: 'Ao trocar logo ou cor, a interface muda na hora. O ícone já instalado pode demorar a atualizar, conforme o sistema operacional.' },
    { icon: Globe, title: 'Sem loja de aplicativos', body: 'É um app web instalável (PWA), não um app publicado em lojas. Funciona também como site normal.' },
    { icon: Gauge, title: 'Sem conexão', body: 'Sem internet, o app mostra um aviso e não confirma horários, pagamentos ou assinaturas até reconectar.' },
  ]
  return (
    <section className="site-section pub-band" aria-labelledby="pwa">
      <div className="container stack" style={{ '--gap': '24px' } as React.CSSProperties}>
        <SectionHead id="pwa" eyebrow="Marca própria" title="App com a marca da sua clínica" lead="O Qlinic é a plataforma; a identidade que aparece para pacientes e equipe é a da sua clínica." />
        <div className="pub-pwa">
          <ul className="pub-feature-list" role="list">
            {items.map((i) => (
              <li key={i.title}><i.icon aria-hidden="true" /><div><h3>{i.title}</h3><p className="small muted">{i.body}</p></div></li>
            ))}
          </ul>
          <div className="stack" style={{ '--gap': '12px' } as React.CSSProperties}>
            <Screenshot id="portal-mobile" alt="Captura real do portal do tutor no celular, com a marca da clínica fictícia Vet Amigo" className="pub-phone" />
            {!hasShot('portal-mobile') && <Alert tone="neutral" title="Experimente no seu celular">Abra o portal de uma clínica fictícia e use a opção de instalar do seu navegador.</Alert>}
            <Link to={demoLink('/c/vet-amigo/portal')} className="btn btn-secondary">Abrir portal de exemplo</Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function Transparency() {
  const rows = [
    { t: 'WhatsApp e e-mail', b: 'Cada plano inclui uma franquia mensal de mensagens. Acima dela, cada mensagem é cobrada. Provedores de envio (ex.: Resend, Evolution API) têm custos próprios e regras de uso.' },
    { t: 'Armazenamento', b: 'Fotos, documentos e anexos contam para o limite em GB do plano. O excedente é cobrado por GB/mês.' },
    { t: 'Inteligência artificial', b: 'Recursos de IA consomem créditos mensais. Nesta demonstração as respostas são simuladas; nenhum modelo está conectado.' },
    { t: 'Pagamentos de pacientes', b: 'Gateways como InfinitePay, Asaas e Mercado Pago cobram tarifas próprias, direto da clínica. A Qlinic não intermedeia esse dinheiro por padrão.' },
    { t: 'Assinatura eletrônica e NFS-e', b: 'Dependem de provedores contratados à parte. Na demonstração são fluxos visuais, sem validade jurídica ou fiscal.' },
  ]
  return (
    <section className="site-section" aria-labelledby="limites">
      <div className="container stack" style={{ '--gap': '24px' } as React.CSSProperties}>
        <SectionHead id="limites" eyebrow="Transparência" title="Limites e custos externos, sem letras miúdas" lead="Nada é ilimitado. Tudo que depende de provedores externos tem franquia, excedente ou tarifa própria." />
        <dl className="pub-transp">
          {rows.map((r) => <div key={r.t} className="card tight"><dt className="strong">{r.t}</dt><dd className="small muted">{r.b}</dd></div>)}
        </dl>
      </div>
    </section>
  )
}

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="pub-faq">
      {items.map((f) => (
        <details key={f.q}>
          <summary>{f.q}</summary>
          <p className="muted">{f.a}</p>
        </details>
      ))}
    </div>
  )
}

function ContactForm() {
  const run = useAction()
  const saved = usePlatformCollection('contactRequests')
  const [f, setF] = useState({ name: '', email: '', clinic: '', segment: '', message: '' })
  const [err, setErr] = useState<Partial<Record<keyof typeof f, string>>>({})
  const [done, setDone] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const er: typeof err = {}
    if (f.name.trim().length < 2) er.name = 'Informe seu nome.'
    if (!isValidEmail(f.email)) er.email = 'Informe um e-mail válido, como nome@clinica.com.br.'
    if (!f.segment) er.segment = 'Escolha o segmento.'
    if (f.message.length > 1000) er.message = 'Use no máximo 1.000 caracteres.'
    setErr(er)
    if (Object.keys(er).length) { document.getElementById(`ct-${Object.keys(er)[0]}`)?.focus(); return }
    run(() => {
      const id = uid('ct_')
      platformDb.insert('contactRequests', { id, at: nowISO(), name: f.name.trim(), email: f.email.trim(), clinic: f.clinic.trim(), segment: f.segment, message: f.message.trim() })
      setDone(id)
      setF({ name: '', email: '', clinic: '', segment: '', message: '' })
    }, 'Contato registrado neste navegador (sem envio).')
  }
  return (
    <form className="card stack" onSubmit={submit} noValidate aria-labelledby="ct-title">
      <div className="row between"><h3 id="ct-title">Fale com a gente</h3><SimBadge>Simulado — sem envio</SimBadge></div>
      <p className="small muted">Nesta demonstração o formulário é gravado apenas neste navegador. Ninguém receberá a mensagem.</p>
      <div className="form-grid">
        <Field label="Nome" required error={err.name}><Input id="ct-name" value={f.name} onChange={set('name')} autoComplete="name" /></Field>
        <Field label="E-mail" required error={err.email}><Input id="ct-email" type="email" value={f.email} onChange={set('email')} autoComplete="email" inputMode="email" /></Field>
        <Field label="Clínica"><Input id="ct-clinic" value={f.clinic} onChange={set('clinic')} autoComplete="organization" /></Field>
        <Field label="Segmento" required error={err.segment}>
          <Select id="ct-segment" value={f.segment} onChange={set('segment')}>
            <option value="">Selecione</option>
            {SEGMENTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Mensagem" hint="Opcional. Não inclua dados de pacientes." error={err.message}><Textarea id="ct-message" value={f.message} onChange={set('message')} maxLength={1200} /></Field>
      <div aria-live="polite">{done && <Alert tone="success" title="Contato registrado localmente">Protocolo de demonstração {done.slice(3, 9).toUpperCase()}. {saved.length} contato(s) gravado(s) neste navegador.</Alert>}</div>
      <div className="form-actions"><Button type="submit" variant="primary">Registrar contato</Button></div>
    </form>
  )
}

// ---------- Segmento ----------
export function SegmentPage() {
  const { segmento } = useParams()
  const s = segmentByKey(segmento)
  if (!s) {
    return (
      <SiteLayout title="Segmento não encontrado">
        <div className="container site-section stack pub-narrow">
          <h1>Segmento não encontrado</h1>
          <p className="muted">Não temos uma página para “{segmento}”. Estes são os segmentos atendidos:</p>
          <ul className="pub-seg-grid" role="list">
            {SEGMENTS.map((x) => <li key={x.key}><Link className="pub-seg" to={`/segmentos/${x.key}`}><span className="strong">{x.label}</span></Link></li>)}
          </ul>
          <Link to="/" className="btn btn-secondary pub-self-start">Voltar ao início</Link>
        </div>
      </SiteLayout>
    )
  }
  const Icon = SEG_ICON[s.key]
  return (
    <SiteLayout title={s.label}>
      <section className="hero container stack" style={{ '--gap': '16px' } as React.CSSProperties} aria-labelledby="seg-t">
        <nav aria-label="Trilha de navegação" className="breadcrumbs"><Link to="/">Início</Link><span aria-hidden="true">/</span><Link to="/#segmentos">Segmentos</Link><span aria-hidden="true">/</span><span aria-current="page">{s.label}</span></nav>
        <span className="pub-seg-icon"><Icon aria-hidden="true" /></span>
        <h1 id="seg-t">Qlinic para {s.label.toLowerCase()}</h1>
        <p className="lead">{s.pitch}</p>
        <div className="row" style={{ '--gap': '12px' } as React.CSSProperties}>
          <Link className="btn btn-primary" to={`/demonstracao?clinica=${s.demoSlug}`}>Entrar na {s.demoName}</Link>
          <Link className="btn btn-secondary" to={`/c/${s.demoSlug}`}>Página pública da clínica</Link>
        </div>
      </section>
      <section className="site-section" aria-labelledby="seg-mod">
        <div className="container stack" style={{ '--gap': '24px' } as React.CSSProperties}>
          <SectionHead id="seg-mod" title="Módulos usados neste segmento" />
          <div className="grid grid-2">
            {s.modules.map((m) => (
              <article key={m.title} className="card stack" style={{ '--gap': '8px' } as React.CSSProperties}>
                <h3>{m.title}</h3>
                <p className="small muted">{m.body}</p>
                <Link to={demoLink(m.route, s.demoSlug)} className="btn btn-link pub-self-start" style={{ paddingLeft: 0 }}>Abrir tela na demonstração<ArrowRight aria-hidden="true" /></Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="site-section pub-band" aria-labelledby="seg-flow">
        <div className="container stack pub-narrow" style={{ '--gap': '16px' } as React.CSSProperties}>
          <SectionHead id="seg-flow" title="Fluxos que você pode percorrer" />
          <ol className="pub-flows">{s.flows.map((f) => <li key={f}>{f}</li>)}</ol>
          {s.notes.map((n) => <Alert key={n} tone="info">{n}</Alert>)}
        </div>
      </section>
    </SiteLayout>
  )
}

// ---------- Planos ----------
export function PlansPage() {
  return (
    <SiteLayout title="Planos">
      <section className="hero container stack" style={{ '--gap': '12px' } as React.CSSProperties}>
        <h1>Planos e limites</h1>
        <p className="lead">Escolha pelo tamanho da equipe e pelas unidades. Todos os planos têm franquias de consumo; o excedente é cobrado por unidade.</p>
      </section>
      <section className="container" style={{ paddingBottom: 64 }} aria-label="Comparativo de planos">
        <PlansCompare />
      </section>
      <Transparency />
    </SiteLayout>
  )
}

// ---------- Recursos ----------
export function FeaturesPage() {
  return (
    <SiteLayout title="Recursos">
      <section className="hero container stack" style={{ '--gap': '12px' } as React.CSSProperties}>
        <h1>Recursos por área</h1>
        <p className="lead">Status honesto de cada recurso: o que já pode ser testado na demonstração e o que depende de integração futura.</p>
        <div className="legend"><span><Badge tone="success">Demonstração</Badge> navegável com dados fictícios</span><span><Badge tone="warning">Integração futura</Badge> interface/contrato prontos, sem operação real</span></div>
      </section>
      <div className="container stack" style={{ '--gap': '40px', paddingBottom: 64 } as React.CSSProperties}>
        {FEATURE_AREAS.map((a) => (
          <section key={a.area} aria-labelledby={`fa-${a.area}`} className="stack" style={{ '--gap': '16px' } as React.CSSProperties}>
            <h2 id={`fa-${a.area}`}>{a.area}</h2>
            <ul className="grid grid-3" role="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {a.items.map((i) => (
                <li key={i.title} className="card tight stack" style={{ '--gap': '8px' } as React.CSSProperties}>
                  <div className="row between nowrap"><h3 style={{ fontSize: 15 }}>{i.title}</h3>{i.status === 'demonstracao' ? <Badge tone="success">Demonstração</Badge> : <Badge tone="warning">Integração futura</Badge>}</div>
                  <p className="small muted">{i.body}</p>
                  {i.route && <Link to={demoLink(i.route)} className="small strong">Abrir na demonstração</Link>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </SiteLayout>
  )
}
