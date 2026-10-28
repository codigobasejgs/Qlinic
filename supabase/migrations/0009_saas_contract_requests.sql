-- Qlinic 0009 — Solicitação de contratação SaaS (ambiente real, sem provedor de assinatura).
-- O cliente revisa o contrato em /planos e envia a solicitação. NÃO é assinatura: status nunca vira "assinado" aqui.
-- Preço/limites são RECALCULADOS no servidor a partir do catálogo publicado (platform_documents 'plans');
-- o total enviado pelo navegador é só comparado. Contratar pela clínica exige configuracoes.approve (proprietário).

create table public.saas_contract_requests (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique default ('QLS-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  user_id uuid not null references auth.users on delete cascade,
  tenant_id text references public.organizations on delete set null,
  kind text not null check (kind in ('nova', 'alteracao')),
  plan_id text not null,
  cycle text not null check (cycle in ('mensal', 'trimestral', 'anual')),
  trial boolean not null default false,
  offer jsonb not null,
  client_total_cents bigint not null,
  contractor jsonb not null,
  signatory jsonb not null,
  template_version int not null,
  document_hash text not null,
  acceptances jsonb not null,
  idempotency_key text not null,
  status text not null default 'solicitado' check (status in ('solicitado', 'em_analise', 'aguardando_assinatura', 'substituido', 'cancelado', 'concluido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index saas_contract_requests_tenant on public.saas_contract_requests (tenant_id);
create trigger saas_contract_requests_touch before update on public.saas_contract_requests for each row execute function app.touch();

alter table public.saas_contract_requests enable row level security;
-- leitura: quem solicitou, proprietário da clínica e financeiro/proprietário da plataforma (suporte não vê CPF)
create policy scr_select on public.saas_contract_requests for select to authenticated using (
  user_id = (select auth.uid())
  or (tenant_id is not null and (select app.can(tenant_id, 'configuracoes', 'approve')))
  or (select app.platform_role()) in ('platform_owner', 'platform_finance')
);
-- escrita direta proibida; só a RPC abaixo cria. Plataforma atualiza status.
create policy scr_update_platform on public.saas_contract_requests for update to authenticated
  using ((select app.platform_role()) in ('platform_owner', 'platform_finance'))
  with check ((select app.platform_role()) in ('platform_owner', 'platform_finance'));
grant select, update (status) on public.saas_contract_requests to authenticated;
revoke all on public.saas_contract_requests from anon;

create or replace function public.request_saas_contract(
  p_plan text, p_cycle text, p_trial boolean, p_tenant text,
  p_contractor jsonb, p_signatory jsonb, p_template_version int, p_document_hash text,
  p_acceptances jsonb, p_client_total_cents bigint, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan jsonb;
  v_total bigint;
  v_offer jsonb;
  v_sub jsonb;
  v_kind text := 'nova';
  v_row public.saas_contract_requests;
  v_doc text := regexp_replace(coalesce(p_contractor ->> 'document', ''), '\D', '', 'g');
begin
  if v_uid is null then raise exception 'Entre na sua conta para enviar a solicitação.' using errcode = '42501'; end if;
  if p_cycle not in ('mensal', 'trimestral', 'anual') then raise exception 'Ciclo inválido.' using errcode = 'P0001'; end if;
  if coalesce(length(p_idempotency_key), 0) < 16 then raise exception 'Chave de solicitação inválida.' using errcode = 'P0001'; end if;

  -- idempotência: mesmo conteúdo (duplo clique, voltar/avançar) devolve a mesma solicitação
  select * into v_row from public.saas_contract_requests where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('id', v_row.id, 'protocol', v_row.protocol, 'status', v_row.status, 'total_cents', (v_row.offer ->> 'totalCents')::bigint, 'existing', true); end if;

  if p_tenant is not null then
    if not app.can(p_tenant, 'configuracoes', 'approve') then
      raise exception 'Seu perfil não pode contratar pela clínica selecionada. Peça ao proprietário da clínica.' using errcode = '42501';
    end if;
    select data into v_sub from public.platform_documents where collection = 'subscriptions' and tenant_id = p_tenant order by updated_at desc limit 1;
    if v_sub is not null and v_sub ->> 'status' in ('ativa', 'trial', 'inadimplente', 'pausada') then
      v_kind := 'alteracao';
      if v_sub ->> 'planId' = p_plan and v_sub ->> 'cycle' = p_cycle and v_sub ->> 'status' = 'ativa' then
        raise exception 'Este já é o plano e o ciclo atuais da clínica.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  select data into v_plan from public.platform_documents where collection = 'plans' and id = p_plan;
  if v_plan is null or coalesce((v_plan ->> 'active')::boolean, false) = false then
    raise exception 'Plano indisponível. Escolha outro plano.' using errcode = 'P0001';
  end if;
  v_total := (v_plan -> 'prices' ->> p_cycle)::bigint;
  if v_total is null or v_total <= 0 then raise exception 'Plano sem preço publicado para este ciclo.' using errcode = 'P0001'; end if;

  -- validação de formato (não verifica identidade nem poderes)
  if coalesce(p_contractor ->> 'kind', '') not in ('pj', 'pf') then raise exception 'Tipo de contratante inválido.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_contractor ->> 'legalName', ''))) not between 3 and 140 then raise exception 'Nome/razão social inválido.' using errcode = 'P0001'; end if;
  if length(v_doc) <> (case when p_contractor ->> 'kind' = 'pj' then 14 else 11 end) then
    raise exception 'Documento do contratante inválido.' using errcode = 'P0001';
  end if;
  if coalesce(p_contractor ->> 'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail do contratante inválido.' using errcode = 'P0001'; end if;
  if coalesce(p_signatory ->> 'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail de assinatura inválido.' using errcode = 'P0001'; end if;
  if not (coalesce((p_acceptances ->> 'terms')::boolean, false) and coalesce((p_acceptances ->> 'powers')::boolean, false) and coalesce((p_acceptances ->> 'privacyNotice')::boolean, false)) then
    raise exception 'Aceites obrigatórios ausentes.' using errcode = 'P0001';
  end if;

  v_offer := jsonb_build_object('planId', p_plan, 'planName', v_plan ->> 'name', 'planVersion', (v_plan ->> 'version')::int, 'cycle', p_cycle, 'trial', p_trial,
    'totalCents', v_total, 'limits', v_plan -> 'limits', 'modules', v_plan -> 'modules', 'overage', v_plan -> 'overage', 'calculatedAt', now());

  -- uma solicitação aberta por usuário+clínica: a anterior é substituída (sem apagar histórico)
  update public.saas_contract_requests set status = 'substituido'
   where user_id = v_uid and tenant_id is not distinct from p_tenant and status = 'solicitado';

  insert into public.saas_contract_requests (user_id, tenant_id, kind, plan_id, cycle, trial, offer, client_total_cents, contractor, signatory, template_version, document_hash, acceptances, idempotency_key)
  values (v_uid, p_tenant, v_kind, p_plan, p_cycle, coalesce(p_trial, false), v_offer, coalesce(p_client_total_cents, 0), p_contractor, p_signatory, p_template_version, p_document_hash,
          p_acceptances || jsonb_build_object('recordedAt', now()), p_idempotency_key)
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'protocol', v_row.protocol, 'status', v_row.status, 'total_cents', v_total, 'existing', false, 'kind', v_kind);
end $$;
revoke all on function public.request_saas_contract(text, text, boolean, text, jsonb, jsonb, int, text, jsonb, bigint, text) from public, anon;
grant execute on function public.request_saas_contract(text, text, boolean, text, jsonb, jsonb, int, text, jsonb, bigint, text) to authenticated;
