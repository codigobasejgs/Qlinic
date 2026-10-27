-- Qlinic 0008 — RLS de tenant_documents lia app.collection_resources diretamente (sem privilégio para authenticated → 403).
-- Encontrado pelo E2E conectado. Toda leitura do schema app passa por função SECURITY DEFINER.

create or replace function app.doc_access(p_tenant text, p_collection text, p_action text, p_unit text, p_patient text, p_professional text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.collection_resources c
    where c.collection = p_collection and (
      (c.member_readable and p_action in ('read', 'create', 'update') and app.is_member(p_tenant))
      or app.can(p_tenant, c.resource, p_action, p_unit, case when p_action = 'create' then null else p_professional end)
      or (c.portal_kind is not null and p_patient is not null and p_action in ('read', 'create', 'update') and app.portal_access(p_tenant, p_patient, c.portal_kind))
    )
  )
$$;
grant execute on function app.doc_access(text, text, text, text, text, text) to authenticated;

drop policy tdoc_select on public.tenant_documents;
drop policy tdoc_insert on public.tenant_documents;
drop policy tdoc_update on public.tenant_documents;
drop policy tdoc_delete on public.tenant_documents;
create policy tdoc_select on public.tenant_documents for select to authenticated
  using ((select app.doc_access(tenant_id, collection, 'read', unit_id, patient_id, professional_id)));
create policy tdoc_insert on public.tenant_documents for insert to authenticated
  with check ((select app.doc_access(tenant_id, collection, 'create', unit_id, patient_id, professional_id)));
create policy tdoc_update on public.tenant_documents for update to authenticated
  using ((select app.doc_access(tenant_id, collection, 'update', unit_id, patient_id, professional_id)))
  with check ((select app.doc_access(tenant_id, collection, 'update', unit_id, patient_id, professional_id)));
create policy tdoc_delete on public.tenant_documents for delete to authenticated
  using ((select app.doc_access(tenant_id, collection, 'delete', unit_id, patient_id, professional_id)));

-- Garantia geral: nenhuma política de public.* pode depender de leitura direta do schema app.
-- (verificado em supabase/tests/rls.sql pela consulta em pg_policies)
