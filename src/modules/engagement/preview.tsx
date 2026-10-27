// Prévias de mensagens renderizadas com componentes React (sem HTML arbitrário).
import type { Organization } from '@/domain/types'
import { ClinicLogo, useTheme } from '@/ui'
import { brandCssVars } from '@/lib/color'
import { cssVars } from './ui'

/** Texto puro → parágrafos; {{link}} já substituído vira texto (links reais só no servidor futuro). */
function Paragraphs({ text }: { text: string }) {
  return <>{text.split(/\n{2,}/).map((p, i) => <p key={i}>{p.split('\n').map((l, k) => <span key={k}>{k > 0 && <br />}{l}</span>)}</p>)}</>
}

export function EmailPreview({ org, subject, body, fromHeader, replyTo, marketing, portalPath }: { org: Organization; subject: string; body: string; fromHeader: string; replyTo?: string; marketing?: boolean; portalPath: string }) {
  const { mode } = useTheme()
  const vars = brandCssVars(org.brand.primary, mode)
  return (
    <figure className="eng-email" style={cssVars(vars)} aria-label="Prévia do e-mail">
      <dl className="eng-email-meta small">
        <div><dt>De</dt><dd>{fromHeader}</dd></div>
        {replyTo && <div><dt>Responder para</dt><dd>{replyTo}</dd></div>}
        <div><dt>Assunto</dt><dd className="strong">{subject}</dd></div>
      </dl>
      <div className="eng-email-body">
        <div className="eng-email-brand"><ClinicLogo org={org} height={28} /></div>
        <div className="eng-email-content stack" style={cssVars({ '--gap': '12px' })}>
          <Paragraphs text={body} />
          <span className="eng-email-cta" aria-hidden="true">Abrir no portal</span>
          <span className="tiny muted">Link do botão: {portalPath} (exige login no portal)</span>
        </div>
        <footer className="eng-email-foot tiny">
          <span>{org.name} · {org.city}</span>
          <span>Informações clínicas não são enviadas por e-mail; acesse pelo portal com sua conta.</span>
          {marketing && <span><strong>Você recebe esta comunicação porque autorizou marketing.</strong> Para deixar de receber, altere suas preferências no portal (opt-out a qualquer momento).</span>}
        </footer>
      </div>
    </figure>
  )
}

export function WhatsAppPreview({ body, orgName }: { body: string; orgName: string }) {
  return (
    <figure className="eng-phone" aria-label="Prévia da mensagem de WhatsApp">
      <div className="eng-phone-head small strong">{orgName}</div>
      <div className="eng-phone-thread"><div className="eng-bubble out"><Paragraphs text={body || '(sem texto)'} /><span className="tiny muted">10:00</span></div></div>
    </figure>
  )
}

export function PushPreview({ body, org }: { body: string; org: Organization }) {
  return (
    <figure className="eng-lock" aria-label="Prévia de notificação push na tela bloqueada">
      <div className="eng-lock-time" aria-hidden="true">10:00</div>
      <div className="eng-push">
        <ClinicLogo org={org} symbol height={24} decorative />
        <div className="stack" style={cssVars({ '--gap': '2px' })}><span className="small strong">{org.name}</span><span className="small">{body || '(sem texto)'}</span></div>
      </div>
      <span className="tiny eng-lock-note">Tela bloqueada: sem diagnóstico, procedimento ou dado clínico.</span>
    </figure>
  )
}
