-- Qlinic 0007 — excluir uma organização remove todos os dados dela (encerramento controlado, executado só por service_role).
-- Encontrado no smoke: FKs compostas sem ON DELETE CASCADE bloqueavam a exclusão do tenant.
-- Retenção legal (prontuário etc.) é política de negócio: o encerramento real passa por exportação/aprovação (dataRequests)
-- antes de qualquer exclusão. Cliente autenticado não tem DELETE em organizations.

alter table public.resources drop constraint resources_tenant_id_unit_id_fkey,
  add constraint resources_tenant_id_unit_id_fkey foreign key (tenant_id, unit_id) references public.units (tenant_id, id) on delete cascade;
alter table public.patients drop constraint patients_tenant_id_unit_id_fkey,
  add constraint patients_tenant_id_unit_id_fkey foreign key (tenant_id, unit_id) references public.units (tenant_id, id) on delete cascade;
alter table public.appointments
  drop constraint appointments_tenant_id_unit_id_fkey, add constraint appointments_tenant_id_unit_id_fkey foreign key (tenant_id, unit_id) references public.units (tenant_id, id) on delete cascade,
  drop constraint appointments_tenant_id_patient_id_fkey, add constraint appointments_tenant_id_patient_id_fkey foreign key (tenant_id, patient_id) references public.patients (tenant_id, id) on delete cascade,
  drop constraint appointments_tenant_id_professional_id_fkey, add constraint appointments_tenant_id_professional_id_fkey foreign key (tenant_id, professional_id) references public.professionals (tenant_id, id) on delete cascade,
  drop constraint appointments_tenant_id_service_id_fkey, add constraint appointments_tenant_id_service_id_fkey foreign key (tenant_id, service_id) references public.services (tenant_id, id) on delete cascade;
alter table public.clinical_records
  drop constraint clinical_records_tenant_id_patient_id_fkey, add constraint clinical_records_tenant_id_patient_id_fkey foreign key (tenant_id, patient_id) references public.patients (tenant_id, id) on delete cascade,
  drop constraint clinical_records_tenant_id_professional_id_fkey, add constraint clinical_records_tenant_id_professional_id_fkey foreign key (tenant_id, professional_id) references public.professionals (tenant_id, id) on delete cascade;
alter table public.documents drop constraint documents_tenant_id_patient_id_fkey,
  add constraint documents_tenant_id_patient_id_fkey foreign key (tenant_id, patient_id) references public.patients (tenant_id, id) on delete cascade;
alter table public.charges
  drop constraint charges_tenant_id_unit_id_fkey, add constraint charges_tenant_id_unit_id_fkey foreign key (tenant_id, unit_id) references public.units (tenant_id, id) on delete cascade,
  drop constraint charges_tenant_id_patient_id_fkey, add constraint charges_tenant_id_patient_id_fkey foreign key (tenant_id, patient_id) references public.patients (tenant_id, id) on delete cascade;

-- Guards de imutabilidade continuam valendo para exclusão de linha isolada; na exclusão em cascata do tenant
-- (executada só por service_role após aprovação) eles são ignorados.
create or replace function app.tenant_purge_in_progress() returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('qlinic.purge', true), '') = 'on'
$$;
create or replace function app.guard_finalized_record() returns trigger language plpgsql set search_path = '' as $$
declare
  old_add jsonb := coalesce(old.data -> 'addenda', '[]');
  new_add jsonb := coalesce(new.data -> 'addenda', '[]');
begin
  if tg_op = 'DELETE' then
    if old.status = 'finalizado' and not app.tenant_purge_in_progress() then raise exception 'Registro finalizado não pode ser excluído' using errcode = 'P0001'; end if;
    return old;
  end if;
  if old.status = 'finalizado' then
    if new.status <> 'finalizado' then raise exception 'Registro finalizado não pode voltar a rascunho' using errcode = 'P0001'; end if;
    if (new.data - 'addenda' - 'updatedAt' - 'releasedToPortal' - 'portalGuidance' - 'history')
       is distinct from (old.data - 'addenda' - 'updatedAt' - 'releasedToPortal' - 'portalGuidance' - 'history') then
      raise exception 'Registro finalizado não pode ser alterado. Use um adendo.' using errcode = 'P0001';
    end if;
    if jsonb_array_length(new_add) < jsonb_array_length(old_add)
       or (select jsonb_agg(e) from (select e from jsonb_array_elements(new_add) with ordinality t(e, i) where i <= jsonb_array_length(old_add)) s) is distinct from nullif(old_add, '[]') then
      raise exception 'Adendos existentes não podem ser alterados ou removidos' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create or replace function app.guard_charge_ledger() returns trigger language plpgsql set search_path = '' as $$
declare missing int;
begin
  if tg_op = 'DELETE' then
    if not app.tenant_purge_in_progress() and exists (select 1 from jsonb_array_elements(coalesce(old.data -> 'payments', '[]')) p where p ->> 'status' in ('confirmado', 'estornado', 'chargeback')) then
      raise exception 'Cobrança com pagamento liquidado não pode ser excluída' using errcode = 'P0001';
    end if;
    return old;
  end if;
  select count(*) into missing
  from jsonb_array_elements(coalesce(old.data -> 'payments', '[]')) o
  where o ->> 'status' in ('confirmado', 'estornado', 'chargeback')
    and not exists (select 1 from jsonb_array_elements(coalesce(new.data -> 'payments', '[]')) n where n ->> 'id' = o ->> 'id' and n -> 'amountCents' = o -> 'amountCents');
  if missing > 0 then raise exception 'Pagamentos liquidados não podem ser removidos ou alterados' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(new.data -> 'refunds', '[]')) < jsonb_array_length(coalesce(old.data -> 'refunds', '[]')) then
    raise exception 'Estornos registrados não podem ser removidos' using errcode = 'P0001';
  end if;
  return new;
end $$;

/** Encerramento de tenant: só service_role (Super Admin via função servidor, após aprovação da solicitação). */
create or replace function public.purge_tenant(p_tenant text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('qlinic.purge', 'on', true);
  delete from public.platform_documents where tenant_id = p_tenant;
  delete from public.organizations where id = p_tenant;
end $$;
revoke all on function public.purge_tenant(text) from public, anon, authenticated;
