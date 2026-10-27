// /auth/* — autenticação DEMONSTRATIVA da plataforma. Nada aqui autentica de verdade nem guarda senha.
// Produção: Supabase Auth com sessão host-only por clínica; nunca CPF/data de nascimento como autenticação.
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowRight, Eye, EyeOff, KeyRound, MailCheck, ShieldCheck, Check, X, Copy } from 'lucide-react'
import { platformDb } from '@/data/store'
import { nowISO } from '@/lib/dates'
import { uid } from '@/lib/util'
import { Alert, Button, Field, Input, Progress, SimBadge } from '@/ui/core'
import { useAction, useToast } from '@/ui/overlay'
import { QlinicLogo, ThemeToggle, useDocumentBrand } from '@/ui/brand'
import { QRCode } from '@/modules/scheduling/qr'
import { supabaseConfigured } from '@/data/supabase/client'
import type { MyContexts } from '@/data/supabase/connected'
import { INVITE_TOKEN_DEMO, type AuthEvent, isDemoCode, isDemoInviteToken, isSixDigits, isValidEmail, maskEmail, passwordChecks, passwordStrength, recoveryCodes } from './lib'
import './styles.css'

function logEvent(kind: AuthEvent['kind'], detail: string) {
  platformDb.insert('authEvents', { id: uid('ae_'), at: nowISO(), kind, detail })
}

function AuthShell({ title, subtitle, children, foot }: { title: string; subtitle?: ReactNode; children: ReactNode; foot?: ReactNode }) {
  useDocumentBrand({ title: `${title} · Qlinic`, themeColor: '#0D9488', manifestHref: null, iconHref: '/brand/pwa/favicon.svg', appleIcon: '/brand/pwa/apple-touch-icon.png' })
  return (
    <div className="auth-page">
      <a href="#main" className="skip-link">Pular para o conteúdo</a>
      {!supabaseConfigured && (
        <div className="demo-banner" role="region" aria-label="Aviso de demonstração">
          <span>Autenticação demonstrativa · nenhum dado é enviado ou guardado como credencial</span>
          <Link to="/demonstracao">Ir ao seletor de perfis</Link>
        </div>
      )}
      <header className="auth-top">
        <Link to="/" aria-label="Qlinic — início"><QlinicLogo height={28} decorative /></Link>
        <ThemeToggle compact />
      </header>
      <main id="main" tabIndex={-1} className="auth-main">
        <div className="auth-card">
          <div className="stack" style={{ '--gap': '6px' } as React.CSSProperties}>
            <h1>{title}</h1>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {children}
        </div>
        {foot && <div className="auth-foot small">{foot}</div>}
        <p className="auth-note tiny muted">{supabaseConfigured
          ? 'Login por e-mail e senha (Supabase Auth). Seus dados são protegidos por regras de acesso no servidor. CPF ou data de nascimento nunca são usados como forma de login.'
          : 'Em produção: Supabase Auth, sessão restrita ao endereço de cada clínica (host-only), MFA opcional por perfil. CPF ou data de nascimento nunca serão usados como forma de login.'}</p>
      </main>
    </div>
  )
}

/** Recebe de <Field> id/aria-invalid/aria-describedby e repassa ao input; extraDescribedBy soma regras da senha. */
function PasswordInput({ value, onChange, autoComplete, extraDescribedBy, ...aria }: { value: string; onChange: (v: string) => void; id?: string; autoComplete: string; extraDescribedBy?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; required?: boolean }) {
  const [show, setShow] = useState(false)
  const described = [aria['aria-describedby'], extraDescribedBy].filter(Boolean).join(' ') || undefined
  return (
    <div className="auth-pw">
      <Input {...aria} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} aria-describedby={described} />
      <button type="button" className="btn btn-ghost btn-icon" onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
        {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  )
}

// ---------- Login ----------
export function LoginPage() {
  return supabaseConfigured ? <RealLogin /> : <DemoLogin />
}

/** Login real: Supabase Auth → vínculos (equipe/portal/plataforma) → escolha de contexto. */
function RealLogin() {
  const [sp] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'signup'>(sp.get('modo') === 'cadastro' ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState<{ email?: string; pw?: string; name?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const [contexts, setContexts] = useState<MyContexts | null>(null)
  const [confirm, setConfirm] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const er: typeof err = {}
    if (!isValidEmail(email)) er.email = 'Informe um e-mail válido.'
    if (mode === 'signup' && name.trim().length < 3) er.name = 'Informe seu nome.'
    if (mode === 'signup' && passwordChecks(pw, email).some((c) => !c.ok)) er.pw = 'A senha não atende às regras.'
    else if (!pw) er.pw = 'Informe a senha.'
    setErr(er)
    if (Object.keys(er).length) return
    setBusy(true)
    try {
      const c = await import('@/data/supabase/connected')
      if (mode === 'signup') {
        const r = await c.signUp(email, pw, name.trim())
        setPw('')
        if (r.needsConfirmation) { setConfirm(true); return }
      } else await c.signIn(email, pw)
      setPw('')
      setContexts(await c.myContexts())
    } catch (x) { console.warn('[qlinic] erro no acesso:', x instanceof Error ? x.message : x); setErr({ form: x instanceof Error ? x.message : 'Não foi possível entrar.' }) }
    finally { setBusy(false) }
  }
  if (confirm) return (
    <AuthShell title="Confirme seu e-mail" subtitle="Enviamos um link de confirmação.">
      <Alert tone="success" title="Quase lá">Abra o e-mail enviado para <strong>{maskEmail(email)}</strong> e clique no link. Depois, volte e entre com sua senha.</Alert>
      <Button onClick={() => { setConfirm(false); setMode('login') }}>Voltar para entrar</Button>
    </AuthShell>
  )
  if (contexts) return <ContextPicker contexts={contexts} />
  return (
    <AuthShell title={mode === 'login' ? 'Entrar na Qlinic' : 'Criar conta'} subtitle={mode === 'login' ? 'Equipe da clínica, pacientes e equipe Qlinic.' : 'Crie sua conta para cadastrar sua clínica ou aceitar um convite.'}
      foot={<><Link to="/auth/recuperar">Esqueci minha senha</Link><span aria-hidden="true"> · </span><Button variant="link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErr({}) }}>{mode === 'login' ? 'Criar conta' : 'Já tenho conta'}</Button><span aria-hidden="true"> · </span><Link to="/demonstracao">Ver demonstração</Link></>}>
      <form className="stack" onSubmit={submit} noValidate aria-busy={busy}>
        {err.form && <Alert tone="danger">{err.form}</Alert>}
        {mode === 'signup' && <Field label="Nome" required error={err.name}><Input id="su-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>}
        <Field label="E-mail" required error={err.email}><Input id="login-email" type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Senha" required error={err.pw} id="login-pw"><PasswordInput id="login-pw" value={pw} onChange={setPw} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} extraDescribedBy={mode === 'signup' ? 'pw-rules' : undefined} /></Field>
        {mode === 'signup' && <PasswordRules pw={pw} email={email} />}
        <Button type="submit" variant="primary" block loading={busy}>{mode === 'login' ? 'Entrar' : 'Criar conta'}</Button>
      </form>
    </AuthShell>
  )
}

const SEGMENTS: [string, string][] = [['odontologia', 'Odontologia'], ['medicina', 'Medicina ambulatorial'], ['veterinaria', 'Veterinária'], ['estetica', 'Estética'], ['psicologia', 'Psicologia'], ['fisioterapia', 'Fisioterapia'], ['nutricao', 'Nutrição']]

function ContextPicker({ contexts }: { contexts: MyContexts }) {
  const nav = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [creating, setCreating] = useState(contexts.staff.length === 0 && contexts.portal.length === 0 && !contexts.platformRole)
  const [org, setOrg] = useState({ name: '', segment: 'odontologia', slug: '', primary: '#0D9488' })
  const [orgErr, setOrgErr] = useState<string | null>(null)
  const go = async (key: string, fn: () => Promise<string>) => {
    setBusy(key)
    try { nav(await fn()) } catch (x) { toast(x instanceof Error ? x.message : 'Falha ao carregar.', 'error') } finally { setBusy(null) }
  }
  const c = () => import('@/data/supabase/connected')
  const create = async (e: FormEvent) => {
    e.preventDefault()
    const slug = org.slug || slugify(org.name)
    const v = org.name.trim().length < 3 ? 'Informe o nome da clínica.' : !/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/.test(slug) ? 'Endereço: 3 a 40 letras minúsculas, números ou hífen.' : null
    if (v) { setOrgErr(v); return }
    setOrgErr(null)
    await go('create', async () => {
      const m = await c()
      const tenantId = await m.createOrganization(org.name.trim(), org.segment, slug, org.primary)
      const ctx = await m.myContexts()
      const st = ctx.staff.find((s) => s.tenantId === tenantId)!
      await m.enterContext({ kind: 'staff', tenantId, staffId: st.staffId })
      return `/app/${slug}/onboarding`
    })
  }
  return (
    <AuthShell title="Onde você quer entrar?" subtitle="Escolha o ambiente. Você pode trocar depois.">
      <div className="stack">
        {contexts.platformRole && (
          <Button variant="secondary" block loading={busy === 'platform'} onClick={() => go('platform', async () => { await (await c()).enterContext({ kind: 'platform', role: contexts.platformRole! }); return '/master' })}>
            <ShieldCheck aria-hidden="true" />Qlinic — Super Admin
          </Button>
        )}
        {contexts.staff.map((s) => (
          <Button key={s.staffId + s.tenantId} variant="secondary" block loading={busy === s.tenantId} onClick={() => go(s.tenantId, async () => { await (await c()).enterContext({ kind: 'staff', tenantId: s.tenantId, staffId: s.staffId }); return `/app/${s.slug}` })}>
            {s.name} <span className="small muted">· equipe</span>
          </Button>
        ))}
        {contexts.portal.map((p) => (
          <Button key={p.personId + p.tenantId} variant="secondary" block loading={busy === 'p' + p.tenantId} onClick={() => go('p' + p.tenantId, async () => { await (await c()).enterContext({ kind: 'portal', tenantId: p.tenantId, personId: p.personId }); return `/c/${p.slug}/portal` })}>
            {p.name} <span className="small muted">· portal do paciente</span>
          </Button>
        ))}
        {!creating ? <Button variant="link" onClick={() => setCreating(true)}>Cadastrar uma nova clínica</Button> : (
          <form className="stack" onSubmit={create} noValidate>
            <h2 style={{ fontSize: 16 }}>Nova clínica (período de teste)</h2>
            {orgErr && <Alert tone="danger">{orgErr}</Alert>}
            <Field label="Nome da clínica" required><Input value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} /></Field>
            <Field label="Segmento principal" required><select className="select" value={org.segment} onChange={(e) => setOrg({ ...org, segment: e.target.value })}>{SEGMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Endereço na Qlinic" hint={`/c/${org.slug || slugify(org.name) || 'sua-clinica'}`}><Input value={org.slug} placeholder={slugify(org.name)} onChange={(e) => setOrg({ ...org, slug: slugify(e.target.value) })} /></Field>
            <Field label="Cor da marca"><Input type="color" value={org.primary} onChange={(e) => setOrg({ ...org, primary: e.target.value })} style={{ width: 80, padding: 4 }} /></Field>
            <Button type="submit" variant="primary" loading={busy === 'create'}>Criar clínica</Button>
          </form>
        )}
        <Button variant="ghost" onClick={async () => { await (await c()).signOut(); location.assign('/auth/login') }}>Sair</Button>
      </div>
    </AuthShell>
  )
}

function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

function DemoLogin() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<{ email?: string; pw?: string }>({})
  const [sent, setSent] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const er: typeof err = {}
    if (!isValidEmail(email)) er.email = 'Informe um e-mail válido, como nome@clinica.com.br.'
    if (!pw) er.pw = 'Informe a senha.'
    else if (pw.length < 8) er.pw = 'A senha tem pelo menos 8 caracteres.'
    setErr(er)
    if (Object.keys(er).length) { document.getElementById(er.email ? 'login-email' : 'login-pw')?.focus(); return }
    setPw('') // nunca mantém a senha em memória após o envio
    setSent(true)
  }
  return (
    <AuthShell title="Entrar na Qlinic" subtitle="Acesso da equipe da clínica e da plataforma." foot={<><Link to="/auth/recuperar">Esqueci minha senha</Link><span aria-hidden="true"> · </span><Link to="/auth/convite">Recebi um convite</Link></>}>
      {sent ? (
        <div className="stack" aria-live="polite">
          <Alert tone="info" title="Esta é uma demonstração">Não existe login real nesta versão: nenhuma conta foi consultada e a senha não foi guardada nem enviada. Para explorar o sistema, escolha um perfil fictício no seletor.</Alert>
          <Link to="/demonstracao" className="btn btn-primary btn-block">Ir ao seletor de perfis <ArrowRight aria-hidden="true" /></Link>
          <div className="row">
            <Link to="/auth/verificar" className="btn btn-secondary">Ver verificação de e-mail</Link>
            <Link to="/auth/mfa" className="btn btn-secondary">Ver MFA</Link>
          </div>
          <Button variant="link" onClick={() => setSent(false)}>Voltar ao formulário</Button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <Field label="E-mail" required error={err.email}><Input id="login-email" type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Senha" required error={err.pw} id="login-pw"><PasswordInput id="login-pw" value={pw} onChange={setPw} autoComplete="current-password" /></Field>
          <Button type="submit" variant="primary" block>Entrar</Button>
          <p className="small muted">Não use credenciais reais. Esta tela demonstra validação e mensagens; ela não autentica.</p>
        </form>
      )}
    </AuthShell>
  )
}

// ---------- Recuperação ----------
export function RecoverPage() {
  const [sp] = useSearchParams()
  if (supabaseConfigured && sp.get('nova') === '1') return <NewPassword />
  return <RecoverRequest />
}

/** Link de recuperação do Supabase abre aqui com sessão temporária: define a nova senha. */
function NewPassword() {
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (passwordChecks(pw, '').some((c) => !c.ok)) { setErr('A senha não atende às regras.'); return }
    setBusy(true)
    try { await (await import('@/data/supabase/connected')).updatePassword(pw); setPw(''); nav('/auth/login') }
    catch (x) { setErr(x instanceof Error ? x.message : 'Falha ao alterar a senha.') } finally { setBusy(false) }
  }
  return (
    <AuthShell title="Definir nova senha" subtitle="Escolha uma senha forte para sua conta.">
      <form className="stack" onSubmit={submit} noValidate aria-busy={busy}>
        <Field label="Nova senha" required error={err} id="np-pw"><PasswordInput id="np-pw" value={pw} onChange={setPw} autoComplete="new-password" extraDescribedBy="pw-rules" /></Field>
        <PasswordRules pw={pw} email="" />
        <Button type="submit" variant="primary" block loading={busy}>Salvar senha</Button>
      </form>
    </AuthShell>
  )
}

function RecoverRequest() {
  const run = useAction()
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!isValidEmail(email)) { setErr('Informe um e-mail válido.'); document.getElementById('rec-email')?.focus(); return }
    setErr(null)
    if (supabaseConfigured) {
      const addr = email.trim()
      // resposta neutra mesmo em erro: não revela se o e-mail existe
      import('@/data/supabase/connected').then((m) => m.requestPasswordReset(addr)).catch(() => {}).finally(() => { setSent(addr); setEmail('') })
      return
    }
    run(() => { logEvent('recuperacao', `Pedido para ${maskEmail(email)} (simulado)`); setSent(email.trim()); setEmail('') })
  }
  return (
    <AuthShell title="Recuperar acesso" subtitle="Enviaremos um link para definir uma nova senha." foot={<Link to="/auth/login">Voltar para entrar</Link>}>
      {sent ? (
        <div className="stack" aria-live="polite">
          <Alert tone="success" title="Verifique seu e-mail">Se houver uma conta para <strong>{maskEmail(sent)}</strong>, você receberá um link para definir uma nova senha. Confira também a caixa de spam.</Alert>
          {!supabaseConfigured && <SimBadge>Simulado — nenhum e-mail foi enviado</SimBadge>}
          <p className="small muted">A mensagem é a mesma exista ou não a conta, para não revelar quais e-mails estão cadastrados.</p>
          <Button onClick={() => setSent(null)}>Enviar para outro e-mail</Button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <Field label="E-mail da conta" required error={err}><Input id="rec-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button type="submit" variant="primary" block>Enviar link</Button>
          {!supabaseConfigured && <SimBadge />}
        </form>
      )}
    </AuthShell>
  )
}

// ---------- Convite ----------
function PasswordRules({ pw, email }: { pw: string; email: string }) {
  const checks = passwordChecks(pw, email)
  const st = passwordStrength(pw, email)
  return (
    <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties} id="pw-rules">
      <div className="row between"><span className="small strong">Força: {st.label}</span></div>
      <Progress value={st.score} max={4} label={`Força da senha: ${st.label}`} tone={st.score <= 1 ? 'danger' : st.score === 2 ? 'warn' : undefined} />
      <ul className="auth-rules" aria-label="Regras da senha">
        {checks.map((c) => (
          <li key={c.id} className={c.ok ? 'ok' : ''}>{c.ok ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}<span>{c.label}</span><span className="sr-only">{c.ok ? ' — atendida' : ' — pendente'}</span></li>
        ))}
      </ul>
    </div>
  )
}

export function InvitePage() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const run = useAction()
  const token = params.get('token') ?? INVITE_TOKEN_DEMO
  const valid = isDemoInviteToken(token)
  const email = 'convidada@sorriso-pleno.exemplo.test'
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [accept, setAccept] = useState(false)
  const [err, setErr] = useState<{ pw?: string; pw2?: string; accept?: string }>({})
  const [done, setDone] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const er: typeof err = {}
    if (!passwordStrength(pw, email).ok) er.pw = 'A senha ainda não atende a todas as regras.'
    if (pw2 !== pw) er.pw2 = 'As senhas não coincidem.'
    if (!accept) er.accept = 'Confirme que leu os termos de uso da demonstração.'
    setErr(er)
    if (Object.keys(er).length) return
    run(() => { logEvent('convite_aceito', `Convite ${token} aceito (simulado)`); setPw(''); setPw2(''); setDone(true) })
  }
  if (!valid) {
    return (
      <AuthShell title="Convite inválido ou expirado" foot={<Link to="/auth/login">Ir para entrar</Link>}>
        <Alert tone="danger">Este link de convite não é válido. Peça um novo convite ao responsável pela clínica.</Alert>
        <Link className="btn btn-secondary" to={`/auth/convite?token=${INVITE_TOKEN_DEMO}`}>Abrir convite de exemplo</Link>
      </AuthShell>
    )
  }
  return (
    <AuthShell title="Aceitar convite" subtitle={<>Você foi convidada para a equipe da <strong>Sorriso Pleno Odontologia</strong> (fictícia) como <strong>Recepção</strong>.</>}>
      {done ? (
        <div className="stack" aria-live="polite">
          <Alert tone="success" title="Convite aceito">Na versão real, sua conta seria criada e você seguiria para verificar o e-mail. A senha não foi guardada.</Alert>
          <Button variant="primary" onClick={() => nav('/auth/verificar')}>Continuar para verificação</Button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <div className="muted-surface small"><span className="muted">E-mail do convite</span><br /><strong>{email}</strong><br /><span className="muted">Token: </span><span className="mono">{token}</span></div>
          <Field label="Crie sua senha" required error={err.pw} id="inv-pw"><PasswordInput id="inv-pw" value={pw} onChange={setPw} autoComplete="new-password" extraDescribedBy="pw-rules" /></Field>
          <PasswordRules pw={pw} email={email} />
          <Field label="Repita a senha" required error={err.pw2} id="inv-pw2"><PasswordInput id="inv-pw2" value={pw2} onChange={setPw2} autoComplete="new-password" /></Field>
          <label className="check"><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} aria-invalid={err.accept ? true : undefined} aria-describedby={err.accept ? 'inv-acc-err' : undefined} /><span>Li e aceito os termos de uso da demonstração.</span></label>
          {err.accept && <span id="inv-acc-err" className="small" style={{ color: 'var(--q-danger)' }} role="alert">{err.accept}</span>}
          <Button type="submit" variant="primary" block>Aceitar e criar acesso</Button>
        </form>
      )}
    </AuthShell>
  )
}

// ---------- Verificação de e-mail ----------
function CodeForm({ label, onOk, cta }: { label: string; onOk: () => void; cta: string }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!isSixDigits(code)) { setErr('Digite os 6 números do código.'); return }
    if (!isDemoCode(code)) { setErr('Código incorreto. Na demonstração, use 000000.'); return }
    setErr(null)
    setCode('')
    onOk()
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Field label={label} required error={err} hint="Demonstração: o código aceito é 000000.">
        <Input className="auth-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
      </Field>
      <Button type="submit" variant="primary" block>{cta}</Button>
    </form>
  )
}

export function VerifyPage() {
  const toast = useToast()
  const [ok, setOk] = useState(false)
  const [resends, setResends] = useState(0)
  return (
    <AuthShell title="Verifique seu e-mail" subtitle={<>Enviamos um código de 6 dígitos para <strong>c***@sorriso-pleno.exemplo.test</strong>.</>} foot={<Link to="/auth/login">Voltar para entrar</Link>}>
      {ok ? (
        <div className="stack" aria-live="polite">
          <Alert tone="success" title="E-mail verificado">Na versão real, seu acesso seria liberado. Recomendamos ativar a verificação em duas etapas.</Alert>
          <Link to="/auth/mfa" className="btn btn-primary">Configurar verificação em duas etapas</Link>
        </div>
      ) : (
        <>
          <span className="auth-ico"><MailCheck aria-hidden="true" /></span>
          <CodeForm label="Código de verificação" cta="Verificar" onOk={() => { logEvent('email_verificado', 'Código demo aceito'); setOk(true) }} />
          <div className="row between">
            <Button variant="link" onClick={() => { logEvent('verificacao_reenviada', 'Reenvio simulado'); setResends(resends + 1); toast('Novo código gerado (simulado, sem envio).') }} disabled={resends >= 3}>Reenviar código</Button>
            <SimBadge>Simulado — sem envio</SimBadge>
          </div>
          {resends >= 3 && <p className="small muted" role="status">Limite de reenvios atingido. Aguarde alguns minutos (na versão real).</p>}
        </>
      )}
    </AuthShell>
  )
}

// ---------- MFA (TOTP demonstrativo) ----------
export function MfaPage() {
  const toast = useToast()
  const run = useAction()
  const secret = 'DEMO DEMO DEMO DEMO' // fictício, não serve para nenhum autenticador real
  const otpauth = 'otpauth://totp/Qlinic%20(demonstracao):usuario%40exemplo.test?secret=DEMODEMODEMODEMO&issuer=Qlinic%20Demo'
  const codes = useMemo(() => recoveryCodes('qlinic-mfa-demo'), [])
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [saved, setSaved] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(codes.join('\n')); toast('Códigos copiados.') } catch { toast('Não foi possível copiar. Selecione e copie manualmente.', 'error') }
  }
  return (
    <AuthShell title="Verificação em duas etapas" subtitle="Proteja o acesso com um aplicativo autenticador (TOTP)." foot={<Link to="/demonstracao">Ir ao seletor de perfis</Link>}>
      <ol className="steps" aria-label="Etapas">
        {['Escanear', 'Confirmar', 'Códigos de recuperação'].map((l, i) => <li key={l} className={i + 1 < step ? 'done' : i + 1 === step ? 'current' : ''}><button type="button" disabled aria-current={i + 1 === step ? 'step' : undefined}>{l}</button></li>)}
      </ol>
      {step === 1 && (
        <div className="stack">
          <p className="small">Abra seu aplicativo autenticador e escaneie o código abaixo. Este QR é <strong>fictício</strong> e não configura nenhuma conta real.</p>
          <div className="auth-qr"><QRCode value={otpauth} size={176} label="QR code fictício de configuração do autenticador" /></div>
          <details><summary>Não consigo escanear</summary><p className="small">Digite a chave manualmente: <span className="mono">{secret}</span> (fictícia).</p></details>
          <Button variant="primary" onClick={() => setStep(2)}>Já escaneei</Button>
        </div>
      )}
      {step === 2 && <CodeForm label="Código de 6 dígitos do aplicativo" cta="Confirmar" onOk={() => setStep(3)} />}
      {step === 3 && (
        <div className="stack">
          <Alert tone="warning" title="Guarde seus códigos de recuperação">Cada código pode ser usado uma única vez se você perder o celular. Na versão real eles só são exibidos agora.</Alert>
          <ul className="auth-codes mono" aria-label="Códigos de recuperação fictícios">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
          <div className="row"><Button icon={<Copy />} onClick={copy}>Copiar códigos</Button></div>
          <label className="check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /><span>Guardei os códigos em local seguro.</span></label>
          <Button variant="primary" icon={<ShieldCheck />} disabled={!saved} onClick={() => run(() => { logEvent('mfa_ativado', 'MFA demonstrativo concluído'); setStep(1); setSaved(false) }, 'Verificação em duas etapas ativada (demonstração).')}>Concluir</Button>
        </div>
      )}
      <p className="small muted row nowrap" style={{ alignItems: 'flex-start' }}><KeyRound size={16} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />Demonstração: o código aceito é 000000. Nada é configurado de verdade.</p>
    </AuthShell>
  )
}
