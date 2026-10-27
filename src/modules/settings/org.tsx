// Formulários de organização reutilizados por Onboarding e Configurações.
// Todos gravam no store (platformDb 'organizations' / coleção 'clinicProfile') e dão feedback.
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useTenant, useActor } from '@/app/session'
import { useCollection } from '@/data/store'
import { BASE_MODULES, MODULE_LABEL, SEGMENT_LABEL, type ModuleKey, type Organization, type Segment } from '@/domain/types'
import { validateSlug } from '@/domain/tenancy'
import { Alert, Badge, Button, Checkbox, demoText, Field, FileUpload, Input, isConnectedEnv, Select, SimBadge, Textarea, useAction } from '@/ui'
import { maskCEP, maskCNPJ, maskPhone } from '@/lib/util'
import { getProfile, planOf, saveProfile, updateOrg, validateDemoEmail, TIMEZONES } from './lib'
import type { ClinicProfile } from './types'

export function useCanEdit(resource: 'configuracoes' | 'marca' | 'equipe' = 'configuracoes') {
  const t = useTenant()
  return t.can(resource, 'update')
}

export function SaveBar({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return <div className="form-actions" style={{ alignItems: 'center' }}>{note && <span className="small muted grow">{note}</span>}{children}</div>
}

export function ReadOnlyNote({ what = 'estas configurações' }: { what?: string }) {
  return <Alert tone="neutral" title="Somente leitura">Seu perfil pode consultar {what}, mas não alterá-las. Peça a um proprietário ou gestor com permissão de edição.</Alert>
}

/** Organização, documento fictício, endereço e contatos (etapa 1 / aba Organização). */
export function OrgInfoForm({ onSaved, saveLabel = 'Salvar organização' }: { onSaved?: () => void; saveLabel?: string }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const editable = useCanEdit()
  useCollection(t.tenantId, 'clinicProfile')
  const prof0 = getProfile(t.org)
  const [f, setF] = useState({ name: t.org.name, legalName: t.org.legalName, document: t.org.document, contactEmail: t.org.contactEmail, contactPhone: t.org.contactPhone, city: t.org.city, timezone: t.org.timezone })
  const [p, setP] = useState<ClinicProfile>(prof0)
  const [err, setErr] = useState<Record<string, string | null>>({})
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const addr = (k: keyof ClinicProfile['address']) => (e: { target: { value: string } }) => setP({ ...p, address: { ...p.address, [k]: e.target.value } })
  const save = () => run(() => {
    const e: Record<string, string | null> = {
      name: f.name.trim().length < 3 ? 'Informe o nome comercial (mín. 3 caracteres).' : null,
      document: f.document && f.document.replace(/\D/g, '').length !== 14 ? demoText('CNPJ incompleto (14 dígitos). Use um número fictício.', 'CNPJ incompleto (14 dígitos).') : null,
      contactEmail: validateDemoEmail(f.contactEmail) ?? (!f.contactEmail.trim() ? 'Informe um e-mail de contato de exemplo.' : null),
      cep: p.address.cep && p.address.cep.replace(/\D/g, '').length !== 8 ? 'CEP deve ter 8 dígitos.' : null,
      phone: f.contactPhone && f.contactPhone.replace(/\D/g, '').length < 10 ? 'Telefone incompleto.' : null,
    }
    setErr(e)
    if (Object.values(e).some(Boolean)) throw new Error('Revise os campos destacados.')
    updateOrg(t.org, { ...f, name: f.name.trim(), legalName: f.legalName.trim() || demoText(`${f.name.trim()} (fictícia)`, f.name.trim()) }, actor, 'dados da organização')
    saveProfile(t.org, { address: p.address, whatsapp: p.whatsapp, links: p.links, technicalResponsible: p.technicalResponsible, professionalInfo: p.professionalInfo })
    onSaved?.()
  }, 'Dados da organização salvos.')
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
      {!editable && <ReadOnlyNote what="os dados da organização" />}
      <fieldset disabled={!editable} className="stack" style={{ border: 0, padding: 0 }}>
        <div className="form-grid">
          <Field label="Nome comercial" required error={err.name}><Input value={f.name} onChange={set('name')} autoComplete="organization" /></Field>
          <Field label={demoText('Razão social (fictícia)', 'Razão social')}><Input value={f.legalName} onChange={set('legalName')} /></Field>
          <Field label={demoText('CNPJ (fictício)', 'CNPJ')} hint={demoText('Use um número de exemplo, ex.: 00.000.000/0001-00.', 'Ex.: 00.000.000/0001-00.')} error={err.document}><Input value={f.document} onChange={set('document')} mask={maskCNPJ} inputMode="numeric" /></Field>
          <Field label="Fuso horário padrão" hint="Cada unidade pode ter seu fuso."><Select value={f.timezone} onChange={set('timezone')}>{TIMEZONES.map((z) => <option key={z} value={z}>{z.replace('America/', '').replace('_', ' ')} ({z})</option>)}</Select></Field>
        </div>
        <fieldset className="stack">
          <legend>Endereço</legend>
          <div className="form-grid">
            <Field label="CEP" error={err.cep}><Input value={p.address.cep} onChange={addr('cep')} mask={maskCEP} inputMode="numeric" autoComplete="postal-code" /></Field>
            <Field label="Logradouro"><Input value={p.address.street} onChange={addr('street')} autoComplete="address-line1" /></Field>
            <Field label="Número"><Input value={p.address.number} onChange={addr('number')} /></Field>
            <Field label="Bairro"><Input value={p.address.district} onChange={addr('district')} /></Field>
            <Field label="Cidade/UF (exibição)"><Input value={f.city} onChange={set('city')} placeholder="Campinas/SP" /></Field>
          </div>
        </fieldset>
        <fieldset className="stack">
          <legend>Contatos e links</legend>
          <div className="form-grid">
            <Field label="E-mail de contato" required hint="Somente domínios de exemplo (.exemplo.test)." error={err.contactEmail}><Input type="email" value={f.contactEmail} onChange={set('contactEmail')} /></Field>
            <Field label="Telefone" error={err.phone}><Input value={f.contactPhone} onChange={set('contactPhone')} mask={maskPhone} inputMode="tel" placeholder="(00) 0000-0000" /></Field>
            <Field label="WhatsApp da clínica"><Input value={p.whatsapp} onChange={(e) => setP({ ...p, whatsapp: e.target.value })} mask={maskPhone} inputMode="tel" placeholder="(00) 90000-0000" /></Field>
            <Field label="Site"><Input value={p.links.site} onChange={(e) => setP({ ...p, links: { ...p.links, site: e.target.value } })} placeholder="https://clinica.exemplo" /></Field>
            <Field label="Instagram"><Input value={p.links.instagram} onChange={(e) => setP({ ...p, links: { ...p.links, instagram: e.target.value } })} placeholder="@clinica.exemplo" /></Field>
          </div>
        </fieldset>
        <fieldset className="stack">
          <legend>Informações profissionais</legend>
          <div className="form-grid">
            <Field label="Responsável técnico"><Input value={p.technicalResponsible.name} onChange={(e) => setP({ ...p, technicalResponsible: { ...p.technicalResponsible, name: e.target.value } })} /></Field>
            <Field label={demoText('Registro no conselho (fictício)', 'Registro no conselho')}><Input value={p.technicalResponsible.council} onChange={(e) => setP({ ...p, technicalResponsible: { ...p.technicalResponsible, council: e.target.value } })} placeholder={demoText('CRO-SP 00000 (fictício)', 'CRO-SP 00000')} /></Field>
          </div>
          <Field label="Texto para cabeçalho/rodapé de documentos"><Textarea rows={3} value={p.professionalInfo} onChange={(e) => setP({ ...p, professionalInfo: e.target.value })} /></Field>
        </fieldset>
      </fieldset>
      {editable && <SaveBar><Button type="submit" variant="primary" data-tour="primary-action">{saveLabel}</Button></SaveBar>}
    </form>
  )
}

/** Segmento principal + módulos adicionais (feature flags do tenant). */
export function SegmentModulesForm({ onSaved }: { onSaved?: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const editable = useCanEdit()
  const plan = planOf(t.org)
  const [segment, setSegment] = useState<Segment>(t.org.segment)
  const [mods, setMods] = useState<Set<ModuleKey>>(new Set(t.org.modules))
  const optional = (Object.keys(MODULE_LABEL) as ModuleKey[]).filter((m) => !BASE_MODULES.includes(m))
  const save = () => run(() => {
    const next = Array.from(new Set([...BASE_MODULES, ...mods, segment as ModuleKey]))
    updateOrg(t.org, { segment, modules: next }, actor, `segmento ${segment}; módulos ${next.length}`)
    onSaved?.()
  }, 'Segmento e módulos atualizados. O menu já reflete a mudança.')
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
      {!editable && <ReadOnlyNote what="segmento e módulos" />}
      <fieldset disabled={!editable} className="stack" style={{ border: 0, padding: 0 }}>
        <Field label="Segmento principal"><Select value={segment} onChange={(e) => { const s = e.target.value as Segment; setSegment(s); setMods(new Set([...mods, s as ModuleKey])) }}>{(Object.keys(SEGMENT_LABEL) as Segment[]).map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}</Select></Field>
        <Alert tone="info" title="Módulo habilitado não concede permissão">Habilitar um módulo apenas o torna disponível para a clínica. Quem pode usá-lo depende do papel de cada usuário (veja Permissões) e do plano contratado.</Alert>
        <div className="small muted">Incluídos em todos os planos: {BASE_MODULES.map((m) => MODULE_LABEL[m]).join(', ')}.</div>
        <fieldset>
          <legend>Módulos adicionais</legend>
          <div className="grid grid-3" style={{ '--gap': '0 16px' } as React.CSSProperties}>
            {optional.map((m) => {
              const inPlan = !plan || plan.modules.includes(m)
              return <Checkbox key={m} label={<span className="row" style={{ '--gap': '6px' } as React.CSSProperties}>{MODULE_LABEL[m]}{!inPlan && <Badge tone="warning">fora do plano {plan?.name}</Badge>}</span>} hint={m === segment ? 'Segmento principal (sempre ativo)' : undefined} checked={mods.has(m) || m === segment} disabled={m === segment} onChange={(e) => { const n = new Set(mods); if (e.target.checked) n.add(m); else n.delete(m); setMods(n) }} />
            })}
          </div>
        </fieldset>
        {plan && <p className="small muted">{demoText('Módulos marcados como “fora do plano” ficam habilitados nesta demonstração; em produção dependeriam de upgrade aprovado pela Qlinic.', 'Módulos marcados como “fora do plano” estão habilitados no momento; dependem de upgrade aprovado pela Qlinic.')}</p>}
      </fieldset>
      {editable && <SaveBar><Button type="submit" variant="primary">Salvar segmento e módulos</Button></SaveBar>}
    </form>
  )
}

/** Página pública, slug e domínio desejado (etapa 7). `enabled` pode ser adiado até a conclusão do onboarding. */
export function PublicPageForm({ deferEnable, onSaved }: { deferEnable?: { value: boolean; set: (v: boolean) => void }; onSaved?: () => void }) {
  const t = useTenant()
  const actor = useActor()
  const run = useAction()
  const nav = useNavigate()
  const editable = useCanEdit()
  const [pp, setPp] = useState(t.org.publicPage)
  const [enabled, setEnabled] = useState(deferEnable ? deferEnable.value : t.org.publicPage.enabled)
  const [slug, setSlug] = useState(t.org.slug)
  const [domain, setDomain] = useState(t.org.domain?.customHostname ?? '')
  const [err, setErr] = useState<Record<string, string | null>>({})
  const slugLocked = t.org.demo
  const save = () => run(() => {
    const e = {
      slug: slug === t.org.slug ? null : validateSlug(slug, t.org.id),
      domain: domain && !/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain.trim().toLowerCase()) ? 'Domínio inválido. Ex.: agenda.minhaclinica.exemplo' : null,
      headline: enabled && pp.headline.trim().length < 5 ? 'Informe uma chamada (mín. 5 caracteres) para publicar.' : null,
    }
    setErr(e)
    if (Object.values(e).some(Boolean)) throw new Error('Revise os campos destacados.')
    const slugChanged = slug !== t.org.slug
    updateOrg(t.org, {
      slug,
      publicPage: { ...pp, enabled: deferEnable ? t.org.publicPage.enabled : enabled },
      domain: { ...(t.org.domain ?? { status: 'pendente' }), hostname: `${slug}.dominio-da-plataforma.exemplo`, customHostname: domain.trim().toLowerCase() || undefined, status: t.org.domain?.status === 'verificado' && !slugChanged && !domain ? 'verificado' : 'pendente' },
    }, actor, `página pública${slugChanged ? `; endereço ${t.org.slug} → ${slug}` : ''}`)
    deferEnable?.set(enabled)
    onSaved?.()
    if (slugChanged) nav(`${location.pathname.replace(`/app/${t.org.slug}`, `/app/${slug}`)}${location.search}`, { replace: true })
  }, 'Página pública salva.')
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
      {!editable && <ReadOnlyNote what="a página pública" />}
      <fieldset disabled={!editable} className="stack" style={{ border: 0, padding: 0 }}>
        <Checkbox label="Publicar página da clínica e agendamento público" hint={deferEnable ? 'Aplicado ao concluir a configuração inicial.' : 'Desativada, o endereço público mostra “clínica não encontrada”.'} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <div className="form-grid">
          <Field label="Chamada principal" error={err.headline}><Input value={pp.headline} onChange={(e) => setPp({ ...pp, headline: e.target.value })} maxLength={120} /></Field>
          <Field label="Endereço na plataforma (slug)" hint={slugLocked ? 'Clínica de demonstração: endereço fixo, pois o manifesto PWA foi publicado para ele.' : `Prévia: /c/${slug || '…'}`} error={err.slug}>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} readOnly={slugLocked} maxLength={40} />
          </Field>
          <Field label="Domínio próprio desejado (exemplo)" hint="Apenas registro de intenção. Verificação e certificado são futuros (seção de domínios)." error={err.domain}><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="agenda.minhaclinica.exemplo" /></Field>
        </div>
        <Field label="Sobre a clínica (texto público)" hint="Texto simples, sem HTML."><Textarea rows={4} value={pp.about} onChange={(e) => setPp({ ...pp, about: e.target.value })} maxLength={1200} /></Field>
        <div className="row">
          <Checkbox label="Exibir preços dos serviços" checked={pp.showPrices} onChange={(e) => setPp({ ...pp, showPrices: e.target.checked })} />
          <Checkbox label="Exibir profissionais" checked={pp.showProfessionals} onChange={(e) => setPp({ ...pp, showProfessionals: e.target.checked })} />
        </div>
        <p className="small muted">Endereço técnico atual: {t.org.domain?.hostname ?? `${t.org.slug}.dominio-da-plataforma.exemplo`} · status {t.org.domain?.status ?? 'nenhum'} (simulado).</p>
      </fieldset>
      {editable && <SaveBar><Button type="submit" variant="primary">Salvar página pública</Button></SaveBar>}
    </form>
  )
}

const NOTIF_LABEL: Record<string, string> = { confirmacao: 'Confirmação de consulta', lembrete: 'Lembrete de consulta', cancelamento: 'Cancelamento/reagendamento', documento_disponivel: 'Documento disponível', proposta_disponivel: 'Proposta disponível', cobranca_proxima: 'Cobrança próxima do vencimento', pagamento_confirmado: 'Pagamento confirmado', estoque_baixo: 'Estoque baixo (equipe)' }

/** Remetente, WhatsApp e notificações (etapa 8). Nunca credenciais. */
export function CommunicationProfileForm() {
  const t = useTenant()
  const run = useAction()
  const editable = useCanEdit()
  useCollection(t.tenantId, 'clinicProfile')
  const [p, setP] = useState(() => getProfile(t.org))
  const [err, setErr] = useState<string | null>(null)
  const save = () => run(() => {
    const e = validateDemoEmail(p.senderEmail) ?? (!p.senderEmail ? 'Informe o e-mail remetente de exemplo.' : null)
    setErr(e)
    if (e) throw new Error(e)
    saveProfile(t.org, { senderEmail: p.senderEmail.trim().toLowerCase(), whatsapp: p.whatsapp, notifications: p.notifications })
  }, 'Remetente e notificações salvos.')
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
      <SimBadge />
      <fieldset disabled={!editable} className="stack" style={{ border: 0, padding: 0 }}>
        <div className="form-grid">
          <Field label="E-mail remetente" hint="Domínio de exemplo. Envio real exige domínio verificado no provedor (futuro)." error={err}><Input type="email" value={p.senderEmail} onChange={(e) => setP({ ...p, senderEmail: e.target.value })} /></Field>
          <Field label="Número de WhatsApp" hint="Conexão real (Evolution) é configuração futura no servidor."><Input value={p.whatsapp} onChange={(e) => setP({ ...p, whatsapp: e.target.value })} mask={maskPhone} inputMode="tel" placeholder="(00) 90000-0000" /></Field>
          <Field label="Chave de API do provedor" hint="Configuração futura no servidor — nunca informada no navegador."><Input value="" placeholder="Configuração futura no servidor" disabled readOnly /></Field>
        </div>
        <fieldset>
          <legend>Notificações enviadas</legend>
          <div className="grid grid-2" style={{ '--gap': '0 16px' } as React.CSSProperties}>
            {Object.keys(NOTIF_LABEL).map((k) => <Checkbox key={k} label={NOTIF_LABEL[k]} checked={p.notifications[k] !== false} onChange={(e) => setP({ ...p, notifications: { ...p.notifications, [k]: e.target.checked } })} />)}
          </div>
        </fieldset>
      </fieldset>
      {editable && <SaveBar><Button type="submit" variant="primary">Salvar remetente e notificações</Button></SaveBar>}
    </form>
  )
}

/** Dados bancários DEMONSTRATIVOS (etapa 9 / aba Organização). */
export function BankDemoForm() {
  const t = useTenant()
  const run = useAction()
  const editable = useCanEdit()
  useCollection(t.tenantId, 'clinicProfile')
  const [b, setB] = useState(() => getProfile(t.org).bank)
  const save = () => run(() => {
    if (!isConnectedEnv() && /\d{5,}/.test(b.account.replace(/\D/g, '')) && !/^0+$/.test(b.account.replace(/\D/g, '').slice(0, 3))) throw new Error('Use apenas números fictícios (comece a conta com 000).')
    saveProfile(t.org, { bank: b })
  }, demoText('Conta recebedora demonstrativa salva.', 'Conta recebedora salva (uso informativo; pagamentos ainda não integrados).'))
  const f = (k: keyof typeof b) => (e: { target: { value: string } }) => setB({ ...b, [k]: e.target.value })
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
      <Alert tone="warning" title="Dados bancários demonstrativos">Não informe dados reais. Conta recebedora real exige integração e validação do provedor de pagamento (futuro).</Alert>
      <fieldset disabled={!editable} className="form-grid" style={{ border: 0, padding: 0 }}>
        <Field label="Banco (exemplo)"><Input value={b.bank} onChange={f('bank')} /></Field>
        <Field label="Agência (fictícia)"><Input value={b.agency} onChange={f('agency')} inputMode="numeric" /></Field>
        <Field label="Conta (fictícia)"><Input value={b.account} onChange={f('account')} /></Field>
        <Field label="Titular (fictício)"><Input value={b.holder} onChange={f('holder')} /></Field>
        <Field label="Chave Pix (descrição de exemplo)"><Input value={b.pixKeyLabel} onChange={f('pixKeyLabel')} /></Field>
        <Field label="Token do gateway" hint="Configuração futura no servidor."><Input value="" placeholder="Configuração futura no servidor" disabled readOnly /></Field>
      </fieldset>
      {editable && <SaveBar><Button type="submit" variant="primary">Salvar conta demonstrativa</Button></SaveBar>}
    </form>
  )
}

/** Logo usado no cabeçalho de documentos (pode diferir do logo da interface). */
export function DocLogoForm() {
  const t = useTenant()
  const run = useAction()
  const editable = useCanEdit()
  useCollection(t.tenantId, 'clinicProfile')
  const p = getProfile(t.org)
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="stack">
      <div className="st-logo-box" style={{ background: '#FFFFFF' }}>{p.docLogoUrl ? <img src={p.docLogoUrl} alt={`Logo de documentos de ${t.org.name}`} /> : <span className="small" style={{ color: '#526579' }}>Sem logo de documentos — será usado o nome da clínica.</span>}</div>
      {editable && (
        <>
          <FileUpload accept={['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']} maxMb={2} label="Enviar logo de documentos" hint="PNG, JPEG ou WebP até 2 MB." onFile={(f) => {
            setErr(null)
            if (f.mime === 'image/svg+xml') { setErr('SVG requer sanitização no servidor — futuro. Envie PNG, JPEG ou WebP.'); return }
            run(() => saveProfile(t.org, { docLogoUrl: f.dataUrl }), 'Logo de documentos atualizado.')
          }} />
          {err && <span className="error small" role="alert" style={{ color: 'var(--q-danger)' }}>{err}</span>}
          {p.docLogoUrl && <Button size="sm" onClick={() => run(() => saveProfile(t.org, { docLogoUrl: undefined }), 'Logo de documentos removido.')}>Remover logo de documentos</Button>}
        </>
      )}
    </div>
  )
}

export function PreferencesForm() {
  const t = useTenant()
  const run = useAction()
  const editable = useCanEdit()
  useCollection(t.tenantId, 'clinicProfile')
  const [pr, setPr] = useState(() => getProfile(t.org).preferences)
  const [mode, setMode] = useState<Organization['brand']['themeMode']>(t.org.brand.themeMode)
  const actor = useActor()
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => { saveProfile(t.org, { preferences: pr }); if (mode !== t.org.brand.themeMode) updateOrg(t.org, { brand: { ...t.org.brand, themeMode: mode } }, actor, 'tema padrão') }, 'Preferências salvas.') }}>
      <fieldset disabled={!editable} className="stack" style={{ border: 0, padding: 0 }}>
        <div className="form-grid">
          <Field label="Semana começa em"><Select value={pr.weekStart} onChange={(e) => setPr({ ...pr, weekStart: Number(e.target.value) as 0 | 1 })}><option value={1}>Segunda-feira</option><option value={0}>Domingo</option></Select></Field>
          <Field label="Visão padrão da agenda"><Select value={pr.agendaView} onChange={(e) => setPr({ ...pr, agendaView: e.target.value as 'dia' | 'semana' })}><option value="dia">Dia</option><option value="semana">Semana</option></Select></Field>
          <Field label="Tema padrão da clínica" hint="Cada usuário ainda pode alternar o próprio tema."><Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="system">Seguir o sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></Select></Field>
        </div>
        <Checkbox label="Exibir valores na agenda" checked={pr.showPricesOnAgenda} onChange={(e) => setPr({ ...pr, showPricesOnAgenda: e.target.checked })} />
        <Checkbox label="Avisar antes de sair com rascunho não salvo" checked={pr.confirmBeforeLeave} onChange={(e) => setPr({ ...pr, confirmBeforeLeave: e.target.checked })} />
      </fieldset>
      {editable && <SaveBar><Button type="submit" variant="primary">Salvar preferências</Button></SaveBar>}
    </form>
  )
}
