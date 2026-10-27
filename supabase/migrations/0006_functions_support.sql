-- Qlinic 0006 — apoio às Edge Functions: checagem de permissão exposta, limites de IA e log minimizado.

/** Exposto ao PostgREST (schema app não é exposto). Mesma regra de app.can. */
create or replace function public.can_current(p_tenant text, p_resource text, p_action text default 'read')
returns boolean language sql stable security definer set search_path = '' as $$
  select app.can(p_tenant, p_resource, p_action)
$$;
grant execute on function public.can_current(text, text, text) to authenticated;

/** Uso de IA por tenant/mês (limite do plano aplicado na função). Sem conteúdo de mensagem. */
create table public.ai_usage (
  tenant_id text not null references public.organizations on delete cascade,
  month text not null,
  requests int not null default 0,
  tokens int not null default 0,
  primary key (tenant_id, month)
);
alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage for select to authenticated using ((select app.can(tenant_id, 'ia', 'read')));

create or replace function public.ai_consume(p_tenant text, p_tokens int, p_limit int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare m text := to_char(now() at time zone 'utc', 'YYYY-MM'); cur int;
begin
  insert into public.ai_usage (tenant_id, month) values (p_tenant, m) on conflict do nothing;
  select requests into cur from public.ai_usage where tenant_id = p_tenant and month = m for update;
  if cur >= p_limit then return false; end if;
  update public.ai_usage set requests = requests + 1, tokens = tokens + greatest(p_tokens, 0) where tenant_id = p_tenant and month = m;
  return true;
end $$;
revoke all on function public.ai_consume(text, int, int) from public, anon, authenticated; -- só service_role (Edge Function)

/** Instâncias Evolution por tenant (nome da instância é derivado; chave da API fica só no servidor). */
create table public.whatsapp_instances (
  tenant_id text primary key references public.organizations on delete cascade,
  instance text not null unique,
  status text not null default 'desconectada',
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_instances enable row level security;
create policy wa_select on public.whatsapp_instances for select to authenticated using ((select app.can(tenant_id, 'comunicacao', 'read')));
