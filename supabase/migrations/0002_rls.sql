-- Qlinic 0002 — RLS explícita por operação para as tabelas de tenant.
-- Regras espelham src/domain/permissions.ts e src/domain/access.ts:
--  * equipe: app.can(tenant, recurso, ação, unidade, profissional-dono)
--  * registro clínico 'restrito' (psicologia): somente o profissional autor
--  * portal: somente pacientes vinculados (app.portal_access) e somente conteúdo liberado
--  * suporte da plataforma NÃO tem leitura de prontuário (nenhuma política concede)

-- ---------------------------------------------------------------- helpers de leitura por recurso
create or replace function app.unit_read(p_tenant text, p_resource text, p_unit text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can(p_tenant, p_resource, 'read', p_unit)
$$;

-- ---------------------------------------------------------------- estrutura (leitura por membro; escrita por configuracoes)
do $$
declare t text;
begin
  foreach t in array array['units', 'resources', 'professionals', 'services'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using ((select app.is_member(tenant_id)) or (select app.is_portal_person(tenant_id)))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check ((select app.can(tenant_id, ''configuracoes'', ''update'')))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using ((select app.can(tenant_id, ''configuracoes'', ''update''))) with check ((select app.can(tenant_id, ''configuracoes'', ''update'')))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using ((select app.can(tenant_id, ''configuracoes'', ''delete'')))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- pessoas
alter table public.persons enable row level security;
create policy persons_staff_select on public.persons for select to authenticated using ((select app.can(tenant_id, 'pacientes', 'read')));
create policy persons_self_select on public.persons for select to authenticated using (user_id = (select auth.uid()));
create policy persons_staff_insert on public.persons for insert to authenticated with check ((select app.can(tenant_id, 'pacientes', 'create')));
create policy persons_staff_update on public.persons for update to authenticated using ((select app.can(tenant_id, 'pacientes', 'update'))) with check ((select app.can(tenant_id, 'pacientes', 'update')));
-- portal altera só as próprias preferências (user_id não pode ser trocado)
create policy persons_self_update on public.persons for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- pacientes e vínculos
alter table public.patients enable row level security;
create policy patients_staff_select on public.patients for select to authenticated using ((select app.can(tenant_id, 'pacientes', 'read', unit_id)));
create policy patients_portal_select on public.patients for select to authenticated using ((select app.portal_access(tenant_id, id, 'any')));
create policy patients_insert on public.patients for insert to authenticated with check ((select app.can(tenant_id, 'pacientes', 'create', unit_id)));
create policy patients_update on public.patients for update to authenticated using ((select app.can(tenant_id, 'pacientes', 'update', unit_id))) with check ((select app.can(tenant_id, 'pacientes', 'update', unit_id)));

alter table public.patient_links enable row level security;
create policy links_staff_select on public.patient_links for select to authenticated using ((select app.can(tenant_id, 'pacientes', 'read')));
create policy links_portal_select on public.patient_links for select to authenticated
  using (exists (select 1 from public.persons p where p.tenant_id = patient_links.tenant_id and p.id = patient_links.person_id and p.user_id = (select auth.uid())));
create policy links_insert on public.patient_links for insert to authenticated with check ((select app.can(tenant_id, 'pacientes', 'create')));
create policy links_update on public.patient_links for update to authenticated using ((select app.can(tenant_id, 'pacientes', 'update'))) with check ((select app.can(tenant_id, 'pacientes', 'update')));

-- ---------------------------------------------------------------- agenda
alter table public.appointments enable row level security;
create policy appt_staff_select on public.appointments for select to authenticated using ((select app.can(tenant_id, 'agenda', 'read', unit_id)));
create policy appt_portal_select on public.appointments for select to authenticated using ((select app.portal_access(tenant_id, patient_id, 'schedule')));
create policy appt_staff_insert on public.appointments for insert to authenticated
  with check ((select app.can(tenant_id, 'agenda', 'create', unit_id)) and (not conflict_ack or (select app.can(tenant_id, 'agenda', 'approve', unit_id))));
create policy appt_staff_update on public.appointments for update to authenticated
  using ((select app.can(tenant_id, 'agenda', 'update', unit_id, professional_id)))
  with check ((select app.can(tenant_id, 'agenda', 'update', unit_id, professional_id)) and (not conflict_ack or (select app.can(tenant_id, 'agenda', 'approve', unit_id))));
-- paciente: só cria solicitação para si e só muda status para cancelado/confirmado (janela validada no app + RPC futura)
create policy appt_portal_insert on public.appointments for insert to authenticated
  with check ((select app.portal_access(tenant_id, patient_id, 'schedule')) and status in ('solicitada', 'aguardando_confirmacao') and not conflict_ack);
create policy appt_portal_update on public.appointments for update to authenticated
  using ((select app.portal_access(tenant_id, patient_id, 'schedule')))
  with check ((select app.portal_access(tenant_id, patient_id, 'schedule')) and status in ('solicitada', 'aguardando_confirmacao', 'confirmada', 'cancelada') and not conflict_ack);

-- ---------------------------------------------------------------- prontuário
alter table public.clinical_records enable row level security;
create policy rec_select on public.clinical_records for select to authenticated using (
  case confidentiality
    when 'restrito' then exists (select 1 from app.memberships m where m.user_id = (select auth.uid()) and m.tenant_id = clinical_records.tenant_id and m.professional_id = clinical_records.professional_id)
    else (select app.can(tenant_id, 'clinical', 'read', null, professional_id))
  end);
-- portal NÃO lê clinical_records: orientações liberadas saem pela view public.portal_guidance
create policy rec_insert on public.clinical_records for insert to authenticated with check (
  (select app.can(tenant_id, case confidentiality when 'restrito' then 'clinical_restricted' else 'clinical' end, 'create'))
  and exists (select 1 from app.memberships m where m.user_id = (select auth.uid()) and m.tenant_id = clinical_records.tenant_id and m.professional_id = clinical_records.professional_id));
create policy rec_update on public.clinical_records for update to authenticated
  using ((select app.can(tenant_id, case confidentiality when 'restrito' then 'clinical_restricted' else 'clinical' end, 'update', null, professional_id)))
  with check ((select app.can(tenant_id, case confidentiality when 'restrito' then 'clinical_restricted' else 'clinical' end, 'update', null, professional_id)));

create view public.portal_guidance with (security_invoker = false) as
  select r.tenant_id, r.id, r.patient_id, r.data ->> 'title' as title, r.data ->> 'portalGuidance' as guidance, r.data ->> 'finalizedAt' as finalized_at
  from public.clinical_records r
  where r.released_to_portal and r.confidentiality = 'padrao' and r.status = 'finalizado'
    and (select app.portal_access(r.tenant_id, r.patient_id, 'clinical'));
revoke all on public.portal_guidance from anon;
grant select on public.portal_guidance to authenticated;

-- ---------------------------------------------------------------- documentos
alter table public.documents enable row level security;
create policy doc_staff_select on public.documents for select to authenticated using (
  case confidentiality
    when 'restrito' then exists (select 1 from app.memberships m join public.staff s on s.tenant_id = m.tenant_id and s.id = m.staff_id
                                  where m.user_id = (select auth.uid()) and m.tenant_id = documents.tenant_id and (m.professional_id = documents.created_by or s.id = documents.created_by))
    else (select app.can(tenant_id, 'documentos', 'read'))
  end);
create policy doc_portal_select on public.documents for select to authenticated
  using (released_to_portal and (select app.portal_access(tenant_id, patient_id, case when data ->> 'kind' = 'recibo' then 'financial' else 'clinical' end)));
create policy doc_insert on public.documents for insert to authenticated with check ((select app.can(tenant_id, 'documentos', 'create')));
create policy doc_update on public.documents for update to authenticated using ((select app.can(tenant_id, 'documentos', 'update'))) with check ((select app.can(tenant_id, 'documentos', 'update')));
-- assinatura do paciente: atualização só da trilha de assinatura é feita pela RPC app.portal_sign_document (0003)

-- ---------------------------------------------------------------- financeiro
alter table public.charges enable row level security;
create policy charges_staff_select on public.charges for select to authenticated using ((select app.can(tenant_id, 'financeiro', 'read', unit_id)) or (select app.can(tenant_id, 'caixa', 'read', unit_id)));
create policy charges_portal_select on public.charges for select to authenticated using ((select app.portal_access(tenant_id, patient_id, 'financial')));
create policy charges_insert on public.charges for insert to authenticated with check ((select app.can(tenant_id, 'financeiro', 'create', unit_id)) or (select app.can(tenant_id, 'orcamentos', 'update', unit_id)));
create policy charges_update on public.charges for update to authenticated
  using ((select app.can(tenant_id, 'financeiro', 'update', unit_id)) or (select app.can(tenant_id, 'caixa', 'update', unit_id)) or (select app.can(tenant_id, 'financeiro', 'create', unit_id)))
  with check ((select app.can(tenant_id, 'financeiro', 'update', unit_id)) or (select app.can(tenant_id, 'caixa', 'update', unit_id)) or (select app.can(tenant_id, 'financeiro', 'create', unit_id)));
-- sem política DELETE: nenhuma cobrança é apagada pelo cliente

-- ---------------------------------------------------------------- comunicação, auditoria, webhooks
alter table public.outbox enable row level security;
create policy outbox_select on public.outbox for select to authenticated using ((select app.can(tenant_id, 'comunicacao', 'read')));
-- qualquer membro enfileira (efeitos de agenda/recepção); envio real é do worker com service_role
create policy outbox_insert on public.outbox for insert to authenticated with check ((select app.is_member(tenant_id)) or (select app.is_portal_person(tenant_id)));
create policy outbox_update on public.outbox for update to authenticated using ((select app.can(tenant_id, 'comunicacao', 'update'))) with check ((select app.can(tenant_id, 'comunicacao', 'update')));

alter table public.audit_events enable row level security;
create policy audit_select on public.audit_events for select to authenticated using ((select app.can(tenant_id, 'auditoria', 'read')));
create policy audit_insert on public.audit_events for insert to authenticated with check (((select app.is_member(tenant_id)) or (select app.is_portal_person(tenant_id))) and actor_user = (select auth.uid()));
-- sem update/delete: trilha imutável

alter table public.webhook_events enable row level security; -- só service_role (Edge Functions)

-- ---------------------------------------------------------------- documentos genéricos de módulo
alter table public.tenant_documents enable row level security;
create policy tdoc_select on public.tenant_documents for select to authenticated using (
  exists (select 1 from app.collection_resources c where c.collection = tenant_documents.collection and (
    (c.member_readable and (select app.is_member(tenant_id)))
    or app.can(tenant_id, c.resource, 'read', tenant_documents.unit_id, tenant_documents.professional_id)
    or (c.portal_kind is not null and tenant_documents.patient_id is not null and app.portal_access(tenant_id, tenant_documents.patient_id, c.portal_kind))
  )));
create policy tdoc_insert on public.tenant_documents for insert to authenticated with check (
  exists (select 1 from app.collection_resources c where c.collection = tenant_documents.collection and (
    (c.member_readable and (select app.is_member(tenant_id)))
    or app.can(tenant_id, c.resource, 'create', tenant_documents.unit_id)
    or (c.portal_kind is not null and tenant_documents.patient_id is not null and app.portal_access(tenant_id, tenant_documents.patient_id, c.portal_kind))
  )));
create policy tdoc_update on public.tenant_documents for update to authenticated
  using (exists (select 1 from app.collection_resources c where c.collection = tenant_documents.collection and (
    (c.member_readable and (select app.is_member(tenant_id)))
    or app.can(tenant_id, c.resource, 'update', tenant_documents.unit_id, tenant_documents.professional_id)
    or (c.portal_kind is not null and tenant_documents.patient_id is not null and app.portal_access(tenant_id, tenant_documents.patient_id, c.portal_kind)))))
  with check (exists (select 1 from app.collection_resources c where c.collection = tenant_documents.collection and (
    (c.member_readable and (select app.is_member(tenant_id)))
    or app.can(tenant_id, c.resource, 'update', tenant_documents.unit_id, tenant_documents.professional_id)
    or (c.portal_kind is not null and tenant_documents.patient_id is not null and app.portal_access(tenant_id, tenant_documents.patient_id, c.portal_kind)))));
create policy tdoc_delete on public.tenant_documents for delete to authenticated using (
  exists (select 1 from app.collection_resources c where c.collection = tenant_documents.collection and app.can(tenant_id, c.resource, 'delete', tenant_documents.unit_id)));

-- ---------------------------------------------------------------- privilégios mínimos
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema app from anon, authenticated;
grant execute on all functions in schema app to authenticated;
