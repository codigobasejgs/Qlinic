// /demonstracao/identidade — vitrine do design system com tokens reais (design-system/tokens.json) e
// contraste registrado (docs/contraste.json) + recalculado ao vivo, light e dark lado a lado (data-theme por container).
import { useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, Users, Wallet, Package, Bell, Search, Settings, Smile, PawPrint, Stethoscope, Check, X, AlertTriangle, Info, Plus, Download } from 'lucide-react'
import { Alert, Badge, Button, Checkbox, Field, Input, Select, SimBadge } from '@/ui/core'
import { QlinicLogo } from '@/ui/brand'
import { SiteLayout } from './site'
import { BRAND, FONT, THEMES, contrastRows, type Mode } from './lib'

const LOGO_SIZES = [24, 32, 48, 64]

export function BrandShowcasePage() {
  return (
    <SiteLayout title="Identidade visual">
      <div className="container stack" style={{ '--gap': '40px', paddingTop: 32, paddingBottom: 64 } as React.CSSProperties}>
        <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <nav aria-label="Trilha de navegação" className="breadcrumbs"><Link to="/demonstracao">Demonstração</Link><span aria-hidden="true">/</span><span aria-current="page">Identidade visual</span></nav>
          <h1>Identidade visual Qlinic 1.0</h1>
          <p className="lead muted">Logos oficiais em SVG, tokens semânticos e componentes reais, nos temas claro e escuro. Dados fictícios.</p>
        </div>

        <section aria-labelledby="bs-logos" className="stack">
          <h2 id="bs-logos">Logos</h2>
          <div className="bs-split">
            <ThemeBox mode="light">
              <LogoCell label="Principal" node={<QlinicLogo tone="principal" height={40} />} />
              <LogoCell label="Monocromático" node={<QlinicLogo tone="monocromatico" height={40} />} />
              <LogoCell label="Vertical" node={<QlinicLogo variant="vertical" tone="principal" height={96} />} />
              <LogoCell label="Símbolo" node={<QlinicLogo variant="simbolo" tone="principal" height={48} />} />
            </ThemeBox>
            <ThemeBox mode="dark">
              <LogoCell label="Reverso" node={<QlinicLogo tone="reverso" height={40} />} />
              <LogoCell label="Branco" node={<QlinicLogo tone="branco" height={40} />} />
              <LogoCell label="Vertical reverso" node={<QlinicLogo variant="vertical" tone="reverso" height={96} />} />
              <LogoCell label="Símbolo reverso" node={<QlinicLogo variant="simbolo" tone="reverso" height={48} />} />
            </ThemeBox>
          </div>
          <div className="card stack" style={{ '--gap': '12px' } as React.CSSProperties}>
            <h3>Tamanhos proporcionais (automático pelo tema)</h3>
            <div className="row" style={{ '--gap': '24px', alignItems: 'flex-end' } as React.CSSProperties}>
              {LOGO_SIZES.map((h) => <figure key={h} className="bs-fig"><QlinicLogo height={h} /><figcaption className="tiny muted">{h} px</figcaption></figure>)}
            </div>
            <p className="small muted">Horizontal mínimo 128 px de largura; símbolo mínimo 24 px. Área livre de 25% da altura do símbolo. Nunca recolorir o logo para imitar a marca de uma clínica.</p>
          </div>
        </section>

        <section aria-labelledby="bs-tokens" className="stack">
          <h2 id="bs-tokens">Tokens de cor</h2>
          <div className="row" style={{ '--gap': '16px' } as React.CSSProperties}>
            {Object.entries(BRAND).map(([k, v]) => (
              <div key={k} className="bs-brand"><span className="bs-brand-sw" style={{ background: v }} aria-hidden="true" /><span className="strong">{k}</span><span className="mono">{v}</span></div>
            ))}
          </div>
          <div className="bs-split">
            {(['light', 'dark'] as Mode[]).map((m) => (
              <ThemeBox key={m} mode={m}>
                <ul className="bs-swatches" role="list">
                  {Object.entries(THEMES[m]).map(([k, v]) => (
                    <li key={k}><span className="swatch" style={{ background: v }} aria-hidden="true" /><span className="small strong">{k}</span><span className="mono tiny">{v}</span></li>
                  ))}
                </ul>
              </ThemeBox>
            ))}
          </div>
        </section>

        <section aria-labelledby="bs-contrast" className="stack">
          <h2 id="bs-contrast">Contraste</h2>
          <p className="muted">Pares registrados em <span className="mono">docs/contraste.json</span>, recalculados ao vivo a partir de <span className="mono">design-system/tokens.json</span>. Mínimo AA para texto: 4,5:1. Isso não certifica toda a aplicação em WCAG.</p>
          <div className="bs-split">
            {(['light', 'dark'] as Mode[]).map((m) => (
              <ThemeBox key={m} mode={m}>
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">Contraste — tema {m === 'light' ? 'claro' : 'escuro'}</caption>
                    <thead><tr><th scope="col">Amostra</th><th scope="col">Par</th><th scope="col" className="num">Registrado</th><th scope="col" className="num">Ao vivo</th></tr></thead>
                    <tbody>
                      {contrastRows(m).map((r) => (
                        <tr key={r.fg + r.bg}>
                          <td><span className="bs-sample" style={{ color: THEMES[m][r.fg], background: THEMES[m][r.bg] }}>Aa</span></td>
                          <td className="small">{r.fg}<br /><span className="muted">sobre {r.bg}</span></td>
                          <td className="num">{r.recorded.toFixed(2).replace('.', ',')}</td>
                          <td className="num">{r.live.toFixed(2).replace('.', ',')} {r.aa ? <Badge tone="success">AA</Badge> : <Badge tone="danger">Abaixo</Badge>}{r.drift && <Badge tone="warning">Revisar</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ThemeBox>
            ))}
          </div>
        </section>

        <section aria-labelledby="bs-type" className="stack">
          <h2 id="bs-type">Tipografia</h2>
          <div className="card stack" style={{ '--gap': '8px', overflow: 'hidden' } as React.CSSProperties}>
            {FONT.sizes.map((s) => (
              <div key={s} className="bs-type"><span className="tiny muted mono">{s}px</span><span style={{ fontSize: s, lineHeight: 1.2, fontWeight: s >= 24 ? 650 : 400 }}>Sua clínica conectada ao cuidado.</span></div>
            ))}
            <p className="small muted">Fonte de interface: {FONT.ui}. Inter não é carregada externamente; usa-se a fonte do sistema como alternativa.</p>
          </div>
        </section>

        <section aria-labelledby="bs-comp" className="stack">
          <h2 id="bs-comp">Componentes</h2>
          <div className="bs-split">
            <ThemeBox mode="light"><ComponentSamples mode="light" /></ThemeBox>
            <ThemeBox mode="dark"><ComponentSamples mode="dark" /></ThemeBox>
          </div>
        </section>

        <section aria-labelledby="bs-icons" className="stack">
          <h2 id="bs-icons">Ícones</h2>
          <div className="card">
            <ul className="bs-icons" role="list">
              {([[CalendarDays, 'Agenda'], [Users, 'Pacientes'], [Wallet, 'Financeiro'], [Package, 'Estoque'], [Bell, 'Notificações'], [Search, 'Buscar'], [Settings, 'Configurações'], [Smile, 'Odontologia'], [PawPrint, 'Veterinária'], [Stethoscope, 'Medicina'], [Check, 'Concluído'], [X, 'Fechar'], [AlertTriangle, 'Atenção'], [Info, 'Informação']] as const).map(([I, l]) => (
                <li key={l}><I size={24} strokeWidth={1.75} aria-hidden="true" /><span className="tiny">{l}</span></li>
              ))}
            </ul>
            <p className="small muted">Família lucide, traço 1,75–2 px, 20/24 px. Ações críticas sempre com rótulo.</p>
          </div>
        </section>
      </div>
    </SiteLayout>
  )
}

function ThemeBox({ mode, children }: { mode: Mode; children: React.ReactNode }) {
  return (
    <div data-theme={mode} className="bs-theme" role="group" aria-label={mode === 'light' ? 'Tema claro' : 'Tema escuro'}>
      <p className="tiny strong bs-theme-label">{mode === 'light' ? 'Tema claro' : 'Tema escuro'}</p>
      <div className="stack">{children}</div>
    </div>
  )
}
function LogoCell({ label, node }: { label: string; node: React.ReactNode }) {
  return <figure className="bs-logo"><div className="bs-logo-box">{node}</div><figcaption className="tiny muted">{label}</figcaption></figure>
}

function ComponentSamples({ mode }: { mode: Mode }) {
  const [v, setV] = useState('')
  const id = `bs-${mode}`
  return (
    <div className="stack">
      <div className="row">
        <Button variant="primary" icon={<Plus />}>Nova consulta</Button>
        <Button>Salvar alterações</Button>
        <Button variant="ghost">Cancelar</Button>
        <Button variant="danger">Excluir</Button>
        <Button disabled>Indisponível</Button>
        <Button iconOnly icon={<Download />}>Baixar</Button>
      </div>
      <div className="form-grid">
        <Field label="Nome do paciente" hint="Como consta no documento"><Input id={`${id}-n`} defaultValue="Marina Exemplo" /></Field>
        <Field label="E-mail" required error={v && !v.includes('@') ? 'Informe um e-mail válido.' : 'Campo obrigatório.'}><Input id={`${id}-e`} value={v} onChange={(e) => setV(e.target.value)} placeholder="nome@exemplo.test" /></Field>
        <Field label="Unidade"><Select id={`${id}-u`} defaultValue="1"><option value="1">Unidade Centro</option><option value="2">Unidade Cambuí</option></Select></Field>
      </div>
      <Checkbox label="Enviar lembrete por WhatsApp" hint="Respeita as preferências do paciente" defaultChecked />
      <div className="row">
        <Badge tone="success">Confirmada</Badge><Badge tone="warning">Aguardando</Badge><Badge tone="danger">Faltou</Badge><Badge tone="info">Em atendimento</Badge><Badge tone="brand">Plano Pro</Badge><Badge>Rascunho</Badge><SimBadge />
      </div>
      <Alert tone="success" title="Consulta confirmada">Marina Exemplo · terça, 10:30.</Alert>
      <Alert tone="warning" title="Revisar pagamento">Recebimento parcial de R$ 150,00.</Alert>
      <Alert tone="danger" title="Conflito de agenda">A cadeira 2 está ocupada neste horário.</Alert>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">Exemplo de tabela — agenda fictícia</caption>
          <thead><tr><th scope="col">Horário</th><th scope="col">Paciente</th><th scope="col">Status</th><th scope="col" className="num">Valor</th></tr></thead>
          <tbody>
            <tr><td className="num">09:00</td><td>Bruno Exemplo</td><td><Badge tone="success">Concluída</Badge></td><td className="num">R$ 220,00</td></tr>
            <tr><td className="num">10:30</td><td>Marina Exemplo</td><td><Badge tone="info">Chegou</Badge></td><td className="num">R$ 180,00</td></tr>
            <tr><td className="num">11:15</td><td>Thor (tutor: Ana Exemplo)</td><td><Badge tone="warning">Aguardando</Badge></td><td className="num">R$ 140,00</td></tr>
          </tbody>
        </table>
      </div>
      <div className="grid grid-2">
        <div className="card stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <h3>{mode === 'light' ? 'Bom dia, Dra. Marina' : 'O cuidado continua.'}</h3>
          <p className="small muted">{mode === 'light' ? 'Sua agenda está organizada. Vamos começar?' : 'Mesma identidade. Conforto em cada contexto.'}</p>
          <Button variant="primary" className="pub-self-start">{mode === 'light' ? 'Nova consulta' : 'Ver pacientes'}</Button>
        </div>
        <div className="kpi"><span className="kpi-label">Atendimentos hoje</span><span className="kpi-value">18</span><span className="kpi-foot">3 aguardando confirmação</span></div>
      </div>
    </div>
  )
}
