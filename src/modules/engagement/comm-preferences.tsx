import { useState } from 'react'
import { useTenant } from '@/app/session'
import { db, useCollection } from '@/data/store'
import { TENANT_ROLE_LABEL } from '@/domain/permissions'
import { Alert, Button, Checkbox, Field, Input, Section, Select, useAction } from '@/ui'
import { hhmmToMinutes, minutesToHHMM, nowISO } from '@/lib/dates'
import { ALERT_KEYS, ALERT_LABEL, CHANNEL_LABEL } from './catalog'
import { commConfig, saveCommConfig } from './engine'
import type { Channel } from '@/domain/types'

export function PreferencesTab() {
  const t = useTenant()
  const prefs = useCollection(t.tenantId, 'staffAlertPrefs')
  const run = useAction()
  const [d, setD] = useState(() => commConfig(t.tenantId))
  const edit = t.can('comunicacao', 'update')
  return <div className="stack">
    <Section title="Horário permitido e retentativas"><div className="stack">
      <Alert>Regra da clínica no fuso {t.org.timezone}. Preferência pessoal mais restritiva também é respeitada. Fora da janela: “aguardando_janela”. Início igual ao fim desativa o silêncio.</Alert>
      <div className="form-grid"><Field label="Silêncio começa"><Input type="time" disabled={!edit} value={minutesToHHMM(d.quietHours.start)} onChange={(e) => setD({ ...d, quietHours: { ...d.quietHours, start: hhmmToMinutes(e.target.value) } })} /></Field><Field label="Envios retomam"><Input type="time" disabled={!edit} value={minutesToHHMM(d.quietHours.end)} onChange={(e) => setD({ ...d, quietHours: { ...d.quietHours, end: hhmmToMinutes(e.target.value) } })} /></Field><Field label="Máximo de tentativas"><Input type="number" min={1} max={10} disabled={!edit} value={d.maxAttempts} onChange={(e) => setD({ ...d, maxAttempts: Number(e.target.value) })} /></Field></div>
      <div className="form-grid">{(['whatsapp', 'email', 'push'] as Channel[]).map((ch) => <Field key={ch} label={`Se ${CHANNEL_LABEL[ch]} falhar, usar`}><Select disabled={!edit} value={d.fallback[ch]} onChange={(e) => setD({ ...d, fallback: { ...d.fallback, [ch]: e.target.value } })}><option value="nenhum">Nenhum</option>{(['whatsapp', 'email', 'push'] as Channel[]).filter((c) => c !== ch).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</Select></Field>)}</div>
      <Button variant="primary" disabled={!edit} onClick={() => run(() => saveCommConfig(t.tenantId, d), 'Regras de comunicação salvas.')}>Salvar regras</Button>
    </div></Section>
    {!edit && <Alert tone="neutral">Seu perfil não pode alterar regras ou preferências da equipe.</Alert>}
    <Section title="Alertas internos por perfil"><div className="grid grid-2">{prefs.map((p) => <fieldset key={p.id}><legend>{TENANT_ROLE_LABEL[p.role]}</legend>{ALERT_KEYS.map((key) => <Checkbox key={key} label={ALERT_LABEL[key]} checked={p.alerts[key]} disabled={!edit} onChange={(e) => run(() => db.update(t.tenantId, 'staffAlertPrefs', p.id, { alerts: { ...p.alerts, [key]: e.target.checked }, updatedAt: nowISO() }), 'Preferência do perfil atualizada.')} />)}</fieldset>)}</div></Section>
  </div>
}
