# Backend Supabase — implementado

Projeto `hhzgpaprsproamjufkqf` (us-east-1, Postgres 17). Migrações em `supabase/migrations/` aplicadas por `npm run db:migrate`
(registro em `supabase_migrations.schema_migrations`, compatível com a Supabase CLI; `0004` é repetível: gerada do código e reaplicada quando muda).

## Dois ambientes no mesmo frontend
| | Demonstração | Conectado |
|---|---|---|
| Entrada | `/demonstracao` (seletor de perfis) | `/auth/login` (Supabase Auth) |
| Dados | `localStorage`, 7 clínicas fictícias | Postgres com RLS; nada de clínica real fica no `localStorage` |
| Sessão | `{ remote: undefined }` | `{ remote: true }` — faixa de demonstração some |
| IA / WhatsApp | determinísticos | Gemini e Evolution via Edge Functions |
| Pagamentos, e-mail, TISS, NFS-e, assinatura | simulados | **continuam simulados** (provedores não contratados) |

Fluxo conectado: login → `claim_invites()` (vincula convites ao e-mail confirmado) → `my_contexts()` → escolher equipe/portal/Super Admin
(ou criar clínica via `create_organization`) → `src/data/supabase/sync.ts` hidrata o tenant e envia cada escrita (diff) ao banco.
Erro de permissão/validação reverte o estado local para o do servidor e mostra mensagem (`friendlyError`).

## Modelo
| Tabela | Conteúdo | Chaves/garantias |
|---|---|---|
| `organizations` | tenant (slug, segmento, status, plano, `data`) | slug único e validado |
| `staff` → `app.memberships` | equipe; vínculos normalizados por trigger | base de toda RLS |
| `units`, `resources`, `professionals`, `services` | estrutura da clínica | PK `(tenant_id, id)` |
| `persons`, `patients`, `patient_links` | pessoas, pacientes/animais, vínculos com permissões clínica/financeira/agenda | mesmo CPF em tenants diferentes permitido, nunca mesclado |
| `appointments` + `app.resource_bookings` | agenda | **constraint de exclusão**: sem sobreposição de profissional nem de recurso (salvo encaixe reconhecido pela gestão) |
| `clinical_records` | prontuário | trigger: finalizado imutável, só adendos acrescentados |
| `documents` | documentos | restrito só ao autor; portal só liberados |
| `charges` | cobranças (contexto B) | trigger de ledger: pagamento liquidado/estorno nunca removido ou alterado; sem DELETE |
| `outbox`, `audit_events`, `webhook_events` | comunicação, auditoria imutável, dedupe de webhooks | `webhook_events (provider, event_id)` PK |
| `tenant_documents` | coleções de módulo (ponytail: normalizar por demanda) | RLS por recurso + unidade/paciente/profissional |
| `platform_documents`, `platform_admins` | contexto A (planos, assinaturas, faturas…) | só equipe da plataforma; planos visíveis a autenticados |
| `ai_usage`, `whatsapp_instances` | limites de IA por tenant/mês; instância Evolution por tenant | escrita só pelo servidor |

FKs compostas `(tenant_id, id)` impedem associar registros de tenants diferentes. Excluir organização: só `purge_tenant()` (service_role).

## RLS
Funções `SECURITY DEFINER` com `search_path = ''` e `auth.uid()` em subselect: `app.can(tenant, recurso, ação, unidade, profissional-dono)`
(matriz gerada de `src/domain/permissions.ts`), `app.is_member`, `app.portal_access(tenant, paciente, 'clinical'|'financial'|'schedule')`,
`app.is_professional`, `app.doc_access`. Nenhuma política lê o schema `app` diretamente (verificado em teste). `anon` não lê tabelas: só RPCs
públicas (`public_clinic`, `public_busy`, `public_book` com limite por telefone/dia e recusa de horário ocupado).
**Suporte da plataforma não lê pacientes nem prontuário.** Psicologia (`restrito`): só o profissional autor, nem o proprietário.

## Edge Functions (`supabase/functions`, `npm run fn:deploy`)
- `ai-assistant` — Gemini 2.5 Flash; exige permissão `ia`; limite mensal por tenant; urgência → resposta fixa (SAMU 192/CVV 188) sem chamar o modelo;
  mensagem do usuário delimitada como dado (prompt injection); modelo só PROPÕE, confirmação humana no app; logs sem conteúdo.
- `whatsapp` — Evolution API (instância `qlinic-<tenant>`): status, QR de conexão, logout, envio só com opt-in. Chave da Evolution só no servidor.
Segredos (`GEMINI_API_KEY`, `EVOLUTION_API_*`) definidos como secrets do projeto; nunca no bundle.

## Auth
`site_url` = `https://qlinic-mauve.vercel.app`; redirects: produção, previews do projeto, localhost. MFA TOTP habilitado; senha mínima 10.
Primeiro `platform_owner`: `qlinic.system@gmail.com` (convite enviado — definir senha pelo link). `npm run db:test-rls` não deixa resíduos.

## Testes executados contra o banco real
- `npm run db:test-rls` — **44/44** asserções (transação com rollback): isolamento entre tenants, unidade, recepção × prontuário, psicologia restrita,
  imutabilidade de registro e ledger, sobreposição bloqueada, encaixe só pela gestão, portal (só o que é liberado), suporte sem dados clínicos, anônimo.
- `node scripts/ops/smoke-backend.mjs` — **17/17**: signup/login, criação de clínica, RLS de escrita, página pública e agendamento anônimo, horário
  duplicado recusado, IA real, urgência, IA exige login, WhatsApp real (status).
- `node qa/connected-e2e.mjs` — **8/8** no navegador contra o banco: login → criar clínica → cadastrar paciente pela UI → recarregar → dado do servidor,
  nada no `localStorage`, sem faixa de demo, sem erro de console.

## Pendente (exige contrato/decisão)
Pagamentos reais (Asaas/Mercado Pago/InfinitePay: credenciais + homologação + webhooks assinados), Resend (domínio verificado + chave),
Storage privado para arquivos (hoje data URL no registro), fila durável para outbox/lembretes (pg_cron/pgmq disponíveis), push (VAPID),
normalização das coleções de módulo que precisarem de relatório/integridade, testes físicos iOS/Android.
