-- Qlinic 0001 — núcleo multi-tenant, identidade, tabelas relacionais e RLS.
-- Princípios: tenant_id em toda linha; FKs compostas (tenant_id, id) impedem associação entre tenants;
-- RLS explícita por operação; funções auxiliares SECURITY DEFINER com search_path vazio e auth.uid() em subselect.
-- Colunas relacionais = autorização, integridade, busca e relatórios. `data jsonb` = documento completo do frontend.

create extension if not exists btree_gist with schema extensions;
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, anon, service_role;

-- ---------------------------------------------------------------- utilidades
create or replace function app.touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------- identidade
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_self_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

create table public.platform_admins (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('platform_owner', 'platform_finance', 'platform_support')),
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

create or replace function app.platform_role() returns text language sql stable security definer set search_path = '' as $$
  select role from public.platform_admins where user_id = (select auth.uid())
$$;
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select app.platform_role()) = 'platform_owner');

-- ---------------------------------------------------------------- permissões (seed gerado de src/domain/permissions.ts em 0002)
create table app.role_permissions (
  role text not null,
  resource text not null,
  action text not null,
  scope text not null check (scope in ('all', 'own')),
  primary key (role, resource, action)
);
-- Coleção (documentos genéricos) → recurso de permissão. Gerado em 0002.
create table app.collection_resources (
  collection text primary key,
  resource text not null,
  member_readable boolean not null default false,
  portal_kind text check (portal_kind in ('clinical', 'financial', 'schedule', 'any'))
);

-- ---------------------------------------------------------------- organizações
create table public.organizations (
  id text primary key default gen_random_uuid()::text,
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  name text not null check (length(name) between 3 and 120),
  segment text not null check (segment in ('odontologia', 'medicina', 'veterinaria', 'estetica', 'psicologia', 'fisioterapia', 'nutricao')),
  status text not null default 'onboarding' check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled', 'onboarding')),
  plan_id text not null default 'plan_pro',
  public_enabled boolean not null default false,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_touch before update on public.organizations for each row execute function app.touch();
alter table public.organizations enable row level security;

-- ---------------------------------------------------------------- equipe e vínculos
create table public.staff (
  tenant_id text not null references public.organizations on delete cascade,
  id text not null,
  user_id uuid references auth.users on delete set null,
  email text,
  professional_id text,
  active boolean not null default true,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
create unique index staff_tenant_user_uq on public.staff (tenant_id, user_id) where user_id is not null;
create index staff_email_idx on public.staff (lower(email)) where user_id is null;
create trigger staff_touch before update on public.staff for each row execute function app.touch();

-- Vínculos normalizados (derivados de staff.data->memberships) — base de toda RLS. Nunca editados diretamente.
create table app.memberships (
  tenant_id text not null,
  staff_id text not null,
  user_id uuid not null,
  role text not null,
  unit_ids text[], -- null = todas as unidades
  professional_id text,
  foreign key (tenant_id, staff_id) references public.staff (tenant_id, id) on delete cascade
);
create index memberships_user_tenant_idx on app.memberships (user_id, tenant_id);

create or replace function app.sync_memberships() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from app.memberships where tenant_id = new.tenant_id and staff_id = new.id;
  if new.user_id is not null and new.active then
    insert into app.memberships (tenant_id, staff_id, user_id, role, unit_ids, professional_id)
    select new.tenant_id, new.id, new.user_id, m ->> 'role',
           case when jsonb_typeof(m -> 'unitIds') = 'array' then array(select jsonb_array_elements_text(m -> 'unitIds')) else null end,
           new.professional_id
    from jsonb_array_elements(coalesce(new.data -> 'memberships', '[]')) m
    where m ->> 'role' in ('clinic_owner', 'network_manager', 'unit_manager', 'reception', 'professional', 'assistant', 'finance', 'inventory');
  end if;
  return new;
end $$;
create trigger staff_sync_memberships after insert or update on public.staff for each row execute function app.sync_memberships();

create or replace function app.is_member(p_tenant text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.memberships where user_id = (select auth.uid()) and tenant_id = p_tenant)
$$;

/** recurso + ação + unidade + vínculo (espelha src/domain/permissions.ts::can). */
create or replace function app.can(p_tenant text, p_resource text, p_action text, p_unit text default null, p_owner_pro text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from app.memberships m
    join app.role_permissions rp on rp.role = m.role and rp.resource = p_resource and rp.action = p_action
    where m.user_id = (select auth.uid())
      and m.tenant_id = p_tenant
      and (p_unit is null or m.unit_ids is null or p_unit = any (m.unit_ids))
      and (rp.scope = 'all' or p_owner_pro is null or m.professional_id = p_owner_pro)
  )
$$;

-- ---------------------------------------------------------------- políticas de organizations/staff
create policy org_select on public.organizations for select to authenticated
  using ((select app.is_member(id)) or (select app.platform_role()) is not null
         or exists (select 1 from public.staff s where s.tenant_id = organizations.id and s.user_id = (select auth.uid())));
create policy org_update on public.organizations for update to authenticated
  using ((select app.can(id, 'configuracoes', 'update')) or (select app.can(id, 'marca', 'update')) or (select app.platform_role()) in ('platform_owner', 'platform_support'))
  with check ((select app.can(id, 'configuracoes', 'update')) or (select app.can(id, 'marca', 'update')) or (select app.platform_role()) in ('platform_owner', 'platform_support'));
-- insert apenas via RPC app.create_organization (0003)

alter table public.staff enable row level security;
create policy staff_select on public.staff for select to authenticated
  using ((select app.is_member(tenant_id)) or user_id = (select auth.uid()));
create policy staff_insert on public.staff for insert to authenticated with check ((select app.can(tenant_id, 'equipe', 'create')));
create policy staff_update on public.staff for update to authenticated
  using ((select app.can(tenant_id, 'equipe', 'update'))) with check ((select app.can(tenant_id, 'equipe', 'update')));
create policy staff_delete on public.staff for delete to authenticated using ((select app.can(tenant_id, 'equipe', 'delete')));

-- ---------------------------------------------------------------- estrutura da clínica
create table public.units (
  tenant_id text not null references public.organizations on delete cascade,
  id text not null,
  name text not null,
  timezone text not null default 'America/Sao_Paulo',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
create trigger units_touch before update on public.units for each row execute function app.touch();

create table public.resources (
  tenant_id text not null, id text not null, unit_id text not null,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, id), foreign key (tenant_id, unit_id) references public.units (tenant_id, id) on delete cascade
);
create trigger resources_touch before update on public.resources for each row execute function app.touch();

create table public.professionals (
  tenant_id text not null references public.organizations on delete cascade, id text not null,
  name text not null, active boolean not null default true,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
create trigger professionals_touch before update on public.professionals for each row execute function app.touch();

create table public.services (
  tenant_id text not null references public.organizations on delete cascade, id text not null,
  name text not null, public_bookable boolean not null default false, price_cents bigint not null default 0 check (price_cents >= 0),
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
create trigger services_touch before update on public.services for each row execute function app.touch();

-- ---------------------------------------------------------------- pessoas e pacientes
create table public.persons (
  tenant_id text not null references public.organizations on delete cascade, id text not null,
  user_id uuid references auth.users on delete set null, -- identidade do portal (paciente/tutor/responsável)
  name text not null, email text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
create index persons_user_idx on public.persons (user_id, tenant_id) where user_id is not null;
create trigger persons_touch before update on public.persons for each row execute function app.touch();

create table public.patients (
  tenant_id text not null, id text not null, unit_id text not null,
  kind text not null check (kind in ('human', 'animal')), name text not null, cpf text, status text not null default 'ativo',
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, id), foreign key (tenant_id, unit_id) references public.units (tenant_id, id)
);
-- mesmo CPF em tenants diferentes é permitido; nunca há merge entre organizações
create index patients_tenant_name_idx on public.patients (tenant_id, lower(name));
create index patients_tenant_cpf_idx on public.patients (tenant_id, cpf) where cpf is not null;
create trigger patients_touch before update on public.patients for each row execute function app.touch();

create table public.patient_links (
  tenant_id text not null, id text not null, patient_id text not null, person_id text not null,
  relation text not null check (relation in ('self', 'tutor', 'responsavel_legal', 'responsavel_financeiro')),
  can_clinical boolean not null default false, can_financial boolean not null default false, can_schedule boolean not null default false,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, patient_id) references public.patients (tenant_id, id) on delete cascade,
  foreign key (tenant_id, person_id) references public.persons (tenant_id, id) on delete cascade
);
create index patient_links_person_idx on public.patient_links (tenant_id, person_id);
create trigger patient_links_touch before update on public.patient_links for each row execute function app.touch();

/** Portal: a pessoa autenticada tem vínculo com o paciente para o tipo de acesso pedido. */
create or replace function app.portal_access(p_tenant text, p_patient text, p_kind text default 'any')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.patient_links l
    join public.persons p on p.tenant_id = l.tenant_id and p.id = l.person_id
    where l.tenant_id = p_tenant and l.patient_id = p_patient and p.user_id = (select auth.uid())
      and case p_kind when 'clinical' then l.can_clinical when 'financial' then l.can_financial when 'schedule' then l.can_schedule else true end
  )
$$;
create or replace function app.is_portal_person(p_tenant text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.persons where tenant_id = p_tenant and user_id = (select auth.uid()))
$$;

-- ---------------------------------------------------------------- agenda
create table public.appointments (
  tenant_id text not null, id text not null, unit_id text not null,
  patient_id text not null, professional_id text not null, service_id text not null,
  start_at timestamptz not null, end_at timestamptz not null check (end_at > start_at),
  status text not null check (status in ('solicitada', 'aguardando_confirmacao', 'confirmada', 'chegou', 'em_atendimento', 'concluida', 'faltou', 'cancelada')),
  resource_ids text[] not null default '{}',
  conflict_ack boolean not null default false,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, unit_id) references public.units (tenant_id, id),
  foreign key (tenant_id, patient_id) references public.patients (tenant_id, id),
  foreign key (tenant_id, professional_id) references public.professionals (tenant_id, id),
  foreign key (tenant_id, service_id) references public.services (tenant_id, id),
  -- reserva concorrente: dois atendimentos do mesmo profissional não se sobrepõem (salvo encaixe reconhecido pela gestão)
  constraint appointments_no_overlap exclude using gist (
    tenant_id with =, professional_id with =, tstzrange(start_at, end_at) with &&
  ) where (status not in ('cancelada', 'faltou') and not conflict_ack)
);
create index appointments_tenant_start_idx on public.appointments (tenant_id, start_at);
create index appointments_patient_idx on public.appointments (tenant_id, patient_id);
create trigger appointments_touch before update on public.appointments for each row execute function app.touch();

-- Recursos (sala/cadeira): mesma garantia, por recurso, via tabela de ocupação mantida por trigger.
create table app.resource_bookings (
  tenant_id text not null, appointment_id text not null, resource_id text not null, slot tstzrange not null,
  foreign key (tenant_id, appointment_id) references public.appointments (tenant_id, id) on delete cascade,
  constraint resource_no_overlap exclude using gist (tenant_id with =, resource_id with =, slot with &&)
);
create or replace function app.sync_resource_bookings() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from app.resource_bookings where tenant_id = new.tenant_id and appointment_id = new.id;
  if new.status not in ('cancelada', 'faltou') and not new.conflict_ack then
    insert into app.resource_bookings (tenant_id, appointment_id, resource_id, slot)
    select new.tenant_id, new.id, r, tstzrange(new.start_at, new.end_at) from unnest(new.resource_ids) r;
  end if;
  return new;
end $$;
create trigger appointments_resources after insert or update on public.appointments for each row execute function app.sync_resource_bookings();

-- ---------------------------------------------------------------- prontuário
create table public.clinical_records (
  tenant_id text not null, id text not null, patient_id text not null, professional_id text not null,
  status text not null check (status in ('rascunho', 'revisado', 'finalizado')),
  confidentiality text not null default 'padrao' check (confidentiality in ('padrao', 'restrito')),
  released_to_portal boolean not null default false,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, patient_id) references public.patients (tenant_id, id),
  foreign key (tenant_id, professional_id) references public.professionals (tenant_id, id)
);
create index clinical_records_patient_idx on public.clinical_records (tenant_id, patient_id);
create trigger clinical_records_touch before update on public.clinical_records for each row execute function app.touch();

/** Registro finalizado é imutável: só aceita novos adendos (prefixo preservado) e liberação/orientação ao portal. */
create or replace function app.guard_finalized_record() returns trigger language plpgsql set search_path = '' as $$
declare
  old_add jsonb := coalesce(old.data -> 'addenda', '[]');
  new_add jsonb := coalesce(new.data -> 'addenda', '[]');
begin
  if tg_op = 'DELETE' then
    if old.status = 'finalizado' then raise exception 'Registro finalizado não pode ser excluído' using errcode = 'P0001'; end if;
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
create trigger clinical_records_guard before update or delete on public.clinical_records for each row execute function app.guard_finalized_record();

create table public.documents (
  tenant_id text not null, id text not null, patient_id text not null,
  confidentiality text not null default 'padrao' check (confidentiality in ('padrao', 'restrito')),
  released_to_portal boolean not null default false, created_by text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, id), foreign key (tenant_id, patient_id) references public.patients (tenant_id, id)
);
create index documents_patient_idx on public.documents (tenant_id, patient_id);
create trigger documents_touch before update on public.documents for each row execute function app.touch();

-- ---------------------------------------------------------------- financeiro da clínica (contexto B)
create table public.charges (
  tenant_id text not null, id text not null, unit_id text not null, patient_id text not null,
  status text not null, due_date date not null, amount_cents bigint not null check (amount_cents >= 0),
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, unit_id) references public.units (tenant_id, id),
  foreign key (tenant_id, patient_id) references public.patients (tenant_id, id)
);
create index charges_tenant_due_idx on public.charges (tenant_id, due_date);
create trigger charges_touch before update on public.charges for each row execute function app.touch();

/** Ledger: pagamento liquidado não some nem muda de valor; correções são reversões vinculadas. */
create or replace function app.guard_charge_ledger() returns trigger language plpgsql set search_path = '' as $$
declare missing int;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from jsonb_array_elements(coalesce(old.data -> 'payments', '[]')) p where p ->> 'status' in ('confirmado', 'estornado', 'chargeback')) then
      raise exception 'Cobrança com pagamento liquidado não pode ser excluída' using errcode = 'P0001';
    end if;
    return old;
  end if;
  select count(*) into missing
  from jsonb_array_elements(coalesce(old.data -> 'payments', '[]')) o
  where o ->> 'status' in ('confirmado', 'estornado', 'chargeback')
    and not exists (
      select 1 from jsonb_array_elements(coalesce(new.data -> 'payments', '[]')) n
      where n ->> 'id' = o ->> 'id' and n -> 'amountCents' = o -> 'amountCents'
    );
  if missing > 0 then raise exception 'Pagamentos liquidados não podem ser removidos ou alterados' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(new.data -> 'refunds', '[]')) < jsonb_array_length(coalesce(old.data -> 'refunds', '[]')) then
    raise exception 'Estornos registrados não podem ser removidos' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger charges_ledger before update or delete on public.charges for each row execute function app.guard_charge_ledger();

-- ---------------------------------------------------------------- comunicação, auditoria, webhooks
create table public.outbox (
  tenant_id text not null references public.organizations on delete cascade, id text not null,
  status text not null, channel text not null, dedupe_key text not null,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);
create index outbox_pending_idx on public.outbox (tenant_id, status) where status in ('pendente', 'aguardando_janela');
create trigger outbox_touch before update on public.outbox for each row execute function app.touch();

create table public.audit_events (
  tenant_id text not null references public.organizations on delete cascade, id text not null,
  actor_user uuid default auth.uid(), data jsonb not null, created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

create table public.webhook_events (
  provider text not null, event_id text not null, tenant_id text references public.organizations on delete set null,
  payload_hash text, received_at timestamptz not null default now(), processed_at timestamptz, result text,
  primary key (provider, event_id)
);

-- ---------------------------------------------------------------- documentos genéricos (transitório)
-- ponytail: coleções de módulo ainda sem tabela própria. Colunas extraídas garantem RLS por unidade/paciente/profissional.
-- Upgrade: normalizar coleção por coleção (lista em docs/BACKEND_SUPABASE.md) quando houver relatório/integridade que exija.
create table public.tenant_documents (
  tenant_id text not null references public.organizations on delete cascade,
  collection text not null references app.collection_resources (collection),
  id text not null,
  unit_id text, patient_id text, professional_id text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (tenant_id, collection, id)
);
create index tenant_documents_patient_idx on public.tenant_documents (tenant_id, collection, patient_id) where patient_id is not null;
create trigger tenant_documents_touch before update on public.tenant_documents for each row execute function app.touch();

-- ---------------------------------------------------------------- plataforma (contexto A)
create table public.platform_documents (
  collection text not null, id text not null,
  tenant_id text references public.organizations on delete cascade,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create trigger platform_documents_touch before update on public.platform_documents for each row execute function app.touch();
alter table public.platform_documents enable row level security;
create policy platform_docs_admin on public.platform_documents for all to authenticated
  using ((select app.platform_role()) is not null) with check ((select app.platform_role()) is not null);
-- planos são catálogo público para autenticados; dados do próprio tenant visíveis ao proprietário
create policy platform_docs_plans on public.platform_documents for select to authenticated using (collection = 'plans');
create policy platform_docs_own_tenant on public.platform_documents for select to authenticated
  using (tenant_id is not null and collection in ('subscriptions', 'saasInvoices', 'usage', 'domains', 'tickets') and (select app.can(tenant_id, 'configuracoes', 'read')));
