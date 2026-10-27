-- Qlinic 0005 — políticas não podem ler app.memberships diretamente (schema app não é exposto a authenticated).
-- Encontrado pelo teste supabase/tests/rls.sql. Substitui EXISTS inline por função SECURITY DEFINER.

create or replace function app.is_professional(p_tenant text, p_professional text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.memberships where user_id = (select auth.uid()) and tenant_id = p_tenant and professional_id = p_professional)
$$;
/** Autor do documento: profissional vinculado ou o próprio cadastro de equipe que o criou. */
create or replace function app.is_author(p_tenant text, p_created_by text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.memberships where user_id = (select auth.uid()) and tenant_id = p_tenant and (professional_id = p_created_by or staff_id = p_created_by))
$$;
grant execute on function app.is_professional(text, text), app.is_author(text, text) to authenticated;

drop policy rec_select on public.clinical_records;
create policy rec_select on public.clinical_records for select to authenticated using (
  case confidentiality
    when 'restrito' then (select app.is_professional(tenant_id, professional_id))
    else (select app.can(tenant_id, 'clinical', 'read', null, professional_id))
  end);

drop policy rec_insert on public.clinical_records;
create policy rec_insert on public.clinical_records for insert to authenticated with check (
  (select app.can(tenant_id, case confidentiality when 'restrito' then 'clinical_restricted' else 'clinical' end, 'create'))
  and (select app.is_professional(tenant_id, professional_id)));

-- restrito: só o autor altera (escopo 'own' + vínculo), mesmo para quem tem escopo total no recurso padrão
drop policy rec_update on public.clinical_records;
create policy rec_update on public.clinical_records for update to authenticated
  using (case confidentiality when 'restrito' then (select app.is_professional(tenant_id, professional_id))
         else (select app.can(tenant_id, 'clinical', 'update', null, professional_id)) end)
  with check (case confidentiality when 'restrito' then (select app.is_professional(tenant_id, professional_id))
              else (select app.can(tenant_id, 'clinical', 'update', null, professional_id)) end);

drop policy doc_staff_select on public.documents;
create policy doc_staff_select on public.documents for select to authenticated using (
  case confidentiality
    when 'restrito' then (select app.is_author(tenant_id, created_by))
    else (select app.can(tenant_id, 'documentos', 'read'))
  end);
