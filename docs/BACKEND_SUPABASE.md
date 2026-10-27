# Backend futuro — Supabase (proposta para validação)

> Nada provisionado nesta etapa. Este documento descreve o modelo e as políticas que substituem os mocks do frontend.

## Entidades relacionais (todas com `tenant_id uuid not null`)
organizations, units, profiles (auth.users 1:1), memberships (profile, organization, role, unit_ids), roles, permissions, patients, guardians/persons,
patient_links, animals (ou patients.kind = animal com colunas específicas), professionals, resources, resource_blocks, services, service_kits,
appointments, appointment_status_history, waitlist_entries, encounters, clinical_records, clinical_addenda, forms, form_versions, form_responses,
treatments, treatment_items, proposals, proposal_items, proposal_versions, charges, payments, refunds, cash_sessions, cash_movements,
commission_rules (versionadas), commission_runs (snapshot), ledger_entries, products, lots, stock_movements, purchase_orders, documents,
document_versions, signatures, files (metadados; objeto no Storage), integration_accounts, webhook_events, notifications (outbox), notification_preferences,
audit_events, settings (rede/unidade), subscriptions_saas, saas_invoices, plans, usage_records, support_tickets, assisted_access_grants, domains.
Evitar tabela universal; JSONB só para conteúdo flexível versionado (ex.: `clinical_records.content` segundo `form_versions.schema`), mantendo
colunas relacionais para autorização, integridade, busca e relatórios (patient_id, professional_id, status, finalized_at, confidentiality).

## Integridade entre tenants
FKs compostas `(tenant_id, id)`: ex. `appointments (tenant_id, patient_id) references patients (tenant_id, id)` — impede associar paciente de outro tenant.
Unicidades por tenant (`unique (tenant_id, slug)`, `unique (tenant_id, number)`). Mesmo CPF em dois tenants é permitido e nunca mesclado.

## RLS (explícita por operação)
```sql
alter table appointments enable row level security;
create policy appt_select on appointments for select using (
  exists (select 1 from memberships m where m.profile_id = auth.uid() and m.organization_id = appointments.tenant_id
          and (m.unit_ids is null or appointments.unit_id = any(m.unit_ids)))
);
-- insert/update/delete: políticas separadas com WITH CHECK incluindo tenant_id e unidade
```
- `clinical_records`: leitura exige papel clínico + vínculo (profissional autor ou permissão de escopo total); `confidentiality = 'restrito'` só autor
  (ou grant explícito). Recepção nunca. Suporte da plataforma: só via `assisted_access_grants` válido (motivo, prazo, autorização, auditoria).
- Portal: `patient_links` define acesso clínico/financeiro separadamente; views públicas expõem só campos liberados (`released_to_portal`).
- Testes automatizados com identidades de tenants diferentes (pgTAP ou testes de integração) para cada tabela e operação.
- **`service_role` ignora RLS e nunca vai ao navegador.** Funções `security definer`, joins em views, Realtime e Storage validados separadamente.

## Storage
Bucket privado por tenant (`tenant/<id>/files/...`) com políticas por registro + URLs assinadas de curta duração; bucket público separado só para
marca/ícones/manifestos publicados (versionados). Originais diagnósticos/DICOM sem recompressão; miniaturas derivadas separadas.

## Transações e concorrência
- Reserva de horário: constraint de exclusão `EXCLUDE USING gist (professional_id WITH =, tstzrange(start, end_buffered) WITH &&) WHERE (status in (...))`
  e o mesmo para recursos — resolve a disputa da lista de espera.
- Aceite de proposta, geração de cobranças, consumo de estoque (uma vez por atendimento: `unique (appointment_id)` em consumo), fechamento de comissões
  e caixa: funções transacionais idempotentes.
- Webhooks: `webhook_events.event_id unique`; processamento idempotente.

## Funções / filas
Edge Functions para webhooks, envio (Resend/Evolution), reconciliação; fila persistente (ex.: pgmq/pg_cron ou serviço dedicado) para outbox,
retries e lembretes. Vercel não é daemon: jobs duráveis ficam fora do ciclo de requisição.

## Auth
Supabase Auth (e-mail + senha/magic link, MFA TOTP), sessão host-only por domínio do tenant, convites com token de uso único e expiração.
Nunca CPF/data de nascimento como autenticação.

Referência: https://supabase.com/docs/guides/database/postgres/row-level-security
