-- Qlinic 0003 — RPCs (operações que precisam de transação ou contexto que o cliente não tem).

-- Página pública da clínica (anônimo): só campos publicáveis, nunca dados de pacientes.
create or replace function public.public_clinic(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org', jsonb_build_object('id', o.id, 'slug', o.slug, 'name', o.name, 'segment', o.segment, 'brand', o.data -> 'brand', 'publicPage', o.data -> 'publicPage', 'timezone', o.data -> 'timezone', 'city', o.data -> 'city'),
    'units', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'timezone', u.timezone, 'address', u.data -> 'address', 'hours', u.data -> 'hours', 'holidays', u.data -> 'holidays', 'specialHours', u.data -> 'specialHours')) from public.units u where u.tenant_id = o.id), '[]'),
    'services', coalesce((select jsonb_agg(s.data) from public.services s where s.tenant_id = o.id and s.public_bookable), '[]'),
    'professionals', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'specialty', p.data -> 'specialty', 'unitIds', p.data -> 'unitIds', 'schedule', p.data -> 'schedule', 'absences', p.data -> 'absences', 'active', p.active)) from public.professionals p where p.tenant_id = o.id and p.active), '[]')
  )
  from public.organizations o
  where o.slug = p_slug and o.public_enabled and o.status <> 'cancelled'
$$;
grant execute on function public.public_clinic(text) to anon, authenticated;

-- Ocupação pública (só intervalos ocupados, sem paciente/serviço) para cálculo de disponibilidade.
create or replace function public.public_busy(p_slug text, p_from timestamptz, p_to timestamptz) returns table (professional_id text, resource_ids text[], start_at timestamptz, end_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.professional_id, a.resource_ids, a.start_at, a.end_at
  from public.appointments a join public.organizations o on o.id = a.tenant_id
  where o.slug = p_slug and o.public_enabled and a.status not in ('cancelada', 'faltou')
    and a.start_at < p_to and a.end_at > p_from and p_to - p_from <= interval '62 days'
$$;
grant execute on function public.public_busy(text, timestamptz, timestamptz) to anon, authenticated;

-- Agendamento público (sem login): cria pessoa + paciente + solicitação numa transação.
-- Nunca mescla com cadastro existente: possível duplicado vai marcado para revisão da recepção.
-- A constraint de exclusão da tabela impede dupla reserva concorrente.
create or replace function public.public_book(p_slug text, p_service text, p_professional text, p_unit text, p_start timestamptz, p_name text, p_phone text, p_email text, p_consent boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.organizations; s public.services; dur int; v_end timestamptz;
  pid text := 'per_' || replace(gen_random_uuid()::text, '-', ''); pat text := 'pat_' || replace(gen_random_uuid()::text, '-', '');
  aid text := 'ap_' || replace(gen_random_uuid()::text, '-', ''); now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  dup text[];
begin
  if not p_consent then raise exception 'É necessário autorizar o contato da clínica.' using errcode = 'P0001'; end if;
  if length(coalesce(trim(p_name), '')) < 3 then raise exception 'Informe seu nome.' using errcode = 'P0001'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 then raise exception 'Informe um telefone válido.' using errcode = 'P0001'; end if;
  select * into o from public.organizations where slug = p_slug and public_enabled and status <> 'cancelled';
  if not found then raise exception 'Clínica não encontrada.' using errcode = 'P0001'; end if;
  select * into s from public.services where tenant_id = o.id and id = p_service and public_bookable;
  if not found then raise exception 'Serviço indisponível para agendamento online.' using errcode = 'P0001'; end if;
  if p_start < now() + interval '1 hour' then raise exception 'Escolha um horário com mais antecedência.' using errcode = 'P0001'; end if;
  dur := coalesce((s.data ->> 'durationMin')::int, 30);
  v_end := p_start + make_interval(mins => dur);
  -- limite anti-abuso: 3 solicitações públicas por telefone por dia
  if (select count(*) from public.appointments a where a.tenant_id = o.id and a.data ->> 'source' = 'publico' and a.created_at > now() - interval '1 day'
        and a.data ->> 'contactPhone' = regexp_replace(p_phone, '\D', '', 'g')) >= 3 then
    raise exception 'Limite de solicitações atingido. Fale com a clínica.' using errcode = 'P0001';
  end if;
  select array_agg(id) into dup from public.patients where tenant_id = o.id and (lower(name) = lower(trim(p_name)) or data ->> 'phone' = p_phone);
  insert into public.persons (tenant_id, id, name, email, data) values (o.id, pid, trim(p_name), nullif(trim(p_email), ''), jsonb_build_object(
    'id', pid, 'tenantId', o.id, 'createdAt', now_iso, 'name', trim(p_name), 'phone', p_phone, 'email', nullif(trim(p_email), ''),
    'communication', jsonb_build_object('whatsapp', true, 'email', p_email is not null and p_email <> '', 'push', false, 'marketing', false)));
  insert into public.patients (tenant_id, id, unit_id, kind, name, data) values (o.id, pat, p_unit, case when o.segment = 'veterinaria' then 'animal' else 'human' end, trim(p_name), jsonb_build_object(
    'id', pat, 'tenantId', o.id, 'createdAt', now_iso, 'kind', case when o.segment = 'veterinaria' then 'animal' else 'human' end, 'name', trim(p_name), 'phone', p_phone,
    'email', nullif(trim(p_email), ''), 'personId', pid, 'allergies', '[]'::jsonb, 'clinicalAlerts', '[]'::jsonb, 'tags', jsonb_build_array('Agendamento online'),
    'unitId', p_unit, 'status', 'ativo', 'pendingDocuments', '[]'::jsonb, 'sharing', jsonb_build_object('portal', true, 'multidisciplinar', false),
    'duplicateOf', coalesce(to_jsonb(dup), 'null'::jsonb)));
  insert into public.patient_links (tenant_id, id, patient_id, person_id, relation, can_clinical, can_financial, can_schedule, data) values (o.id, pat || '_lk', pat, pid, 'self', true, true, true,
    jsonb_build_object('id', pat || '_lk', 'tenantId', o.id, 'createdAt', now_iso, 'patientId', pat, 'personId', pid, 'relation', 'self', 'canSeeClinical', true, 'canSeeFinancial', true, 'canSchedule', true));
  insert into public.appointments (tenant_id, id, unit_id, patient_id, professional_id, service_id, start_at, end_at, status, resource_ids, data) values (
    o.id, aid, p_unit, pat, p_professional, p_service, p_start, v_end, 'solicitada', '{}', jsonb_build_object(
      'id', aid, 'tenantId', o.id, 'createdAt', now_iso, 'unitId', p_unit, 'patientId', pat, 'professionalId', p_professional, 'serviceId', p_service, 'resourceIds', '[]'::jsonb,
      'start', to_char(p_start at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'end', to_char(v_end at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'status', 'solicitada', 'source', 'publico', 'financialStatus', 'nao_cobrado', 'contactPhone', regexp_replace(p_phone, '\D', '', 'g'),
      'history', jsonb_build_array(jsonb_build_object('at', now_iso, 'from', null, 'to', 'solicitada', 'by', 'Agendamento online'))));
  insert into public.audit_events (tenant_id, id, actor_user, data) values (o.id, 'au_' || replace(gen_random_uuid()::text, '-', ''), null,
    jsonb_build_object('action', 'agendamento.publico', 'resource', 'appointments', 'resourceId', aid, 'actorName', 'Agendamento online', 'detail', case when dup is not null then 'Possível duplicado para revisão' end, 'createdAt', now_iso));
  return jsonb_build_object('appointmentId', aid, 'duplicateReview', dup is not null);
exception when exclusion_violation then
  raise exception 'Este horário acabou de ser ocupado. Escolha outro.' using errcode = 'P0001';
end $$;
grant execute on function public.public_book(text, text, text, text, timestamptz, text, text, text, boolean) to anon, authenticated;

-- Cria organização (trial) com o usuário atual como proprietário. Slug reservado/duplicado é recusado.
create or replace function public.create_organization(p_name text, p_segment text, p_slug text, p_primary text default '#0D9488')
returns text language plpgsql security definer set search_path = '' as $$
declare oid text := 'org_' || replace(gen_random_uuid()::text, '-', ''); uid uuid := (select auth.uid()); u_id text := oid || '_u1'; s_id text := oid || '_owner';
  nm text := trim(p_name); now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); prof public.profiles;
begin
  if uid is null then raise exception 'Faça login para criar uma clínica.' using errcode = 'P0001'; end if;
  if p_slug in ('app', 'master', 'admin', 'api', 'auth', 'c', 't', 'brand', 'assets', 'www', 'qlinic', 'demonstracao', 'ajuda') then raise exception 'Endereço reservado.' using errcode = 'P0001'; end if;
  if (select count(*) from app.memberships where user_id = uid and role = 'clinic_owner') >= 5 then raise exception 'Limite de clínicas por conta atingido.' using errcode = 'P0001'; end if;
  select * into prof from public.profiles where id = uid;
  insert into public.organizations (id, slug, name, segment, status, data) values (oid, p_slug, nm, p_segment, 'onboarding', jsonb_build_object(
    'id', oid, 'slug', p_slug, 'name', nm, 'legalName', nm, 'document', '', 'segment', p_segment,
    'modules', jsonb_build_array('agenda', 'recepcao', 'pacientes', 'prontuario', 'documentos', 'orcamentos', 'financeiro', 'portal', 'pwa', 'comunicacao', 'relatorios', 'importacao', p_segment),
    'brand', jsonb_build_object('primary', p_primary, 'initials', upper(left(nm, 2)), 'version', 1, 'themeMode', 'system'),
    'status', 'onboarding', 'planId', 'plan_pro', 'timezone', 'America/Sao_Paulo', 'contactEmail', prof.email, 'contactPhone', '', 'city', '', 'demo', false,
    'createdAt', now_iso, 'onboarding', jsonb_build_object('step', 1, 'completed', false, 'data', '{}'::jsonb),
    'publicPage', jsonb_build_object('enabled', false, 'headline', '', 'about', '', 'showPrices', true, 'showProfessionals', true),
    'domain', jsonb_build_object('status', 'pendente')));
  insert into public.units (tenant_id, id, name, timezone, data) values (oid, u_id, 'Unidade principal', 'America/Sao_Paulo', jsonb_build_object(
    'id', u_id, 'tenantId', oid, 'createdAt', now_iso, 'name', 'Unidade principal', 'timezone', 'America/Sao_Paulo', 'address', '', 'phone', '',
    'hours', jsonb_build_object('0', '[]'::jsonb, '1', '[{"start":480,"end":1080}]'::jsonb, '2', '[{"start":480,"end":1080}]'::jsonb, '3', '[{"start":480,"end":1080}]'::jsonb, '4', '[{"start":480,"end":1080}]'::jsonb, '5', '[{"start":480,"end":1080}]'::jsonb, '6', '[]'::jsonb),
    'holidays', '[]'::jsonb, 'specialHours', '[]'::jsonb));
  insert into public.staff (tenant_id, id, user_id, email, active, data) values (oid, s_id, uid, prof.email, true, jsonb_build_object(
    'id', s_id, 'tenantId', oid, 'createdAt', now_iso, 'name', coalesce(prof.name, 'Proprietário(a)'), 'email', prof.email,
    'memberships', jsonb_build_array(jsonb_build_object('role', 'clinic_owner', 'unitIds', 'all')), 'active', true, 'mfa', false, 'userId', uid));
  insert into public.platform_documents (collection, id, tenant_id, data) values ('subscriptions', 'sub_' || oid, oid, jsonb_build_object(
    'id', 'sub_' || oid, 'tenantId', oid, 'planId', 'plan_pro', 'cycle', 'mensal', 'status', 'trial', 'startedAt', current_date, 'currentPeriodEnd', current_date + 14,
    'trial', jsonb_build_object('start', current_date, 'end', current_date + 14, 'extensions', '[]'::jsonb), 'history', jsonb_build_array(jsonb_build_object('at', now_iso, 'event', 'Teste iniciado', 'by', coalesce(prof.email, 'usuário')))));
  return oid;
exception when unique_violation then
  raise exception 'Endereço já em uso por outra clínica.' using errcode = 'P0001';
end $$;
grant execute on function public.create_organization(text, text, text, text) to authenticated;

-- Aceita convite: vincula o usuário logado ao cadastro de equipe/pessoa com o mesmo e-mail (sem vínculo prévio).
create or replace function public.claim_invites() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); em text; n_staff int; n_person int;
begin
  select lower(email) into em from auth.users where id = uid and email_confirmed_at is not null;
  if em is null then return jsonb_build_object('staff', 0, 'persons', 0, 'reason', 'email_nao_confirmado'); end if;
  update public.staff set user_id = uid, data = data || jsonb_build_object('userId', uid) where user_id is null and lower(email) = em;
  get diagnostics n_staff = row_count;
  update public.persons set user_id = uid where user_id is null and lower(email) = em;
  get diagnostics n_person = row_count;
  return jsonb_build_object('staff', n_staff, 'persons', n_person);
end $$;
grant execute on function public.claim_invites() to authenticated;

-- Contextos do usuário logado (para o seletor de ambiente após login).
create or replace function public.my_contexts() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'platformRole', (select role from public.platform_admins where user_id = (select auth.uid())),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('tenantId', s.tenant_id, 'staffId', s.id, 'slug', o.slug, 'name', o.name, 'segment', o.segment)) from public.staff s join public.organizations o on o.id = s.tenant_id where s.user_id = (select auth.uid()) and s.active), '[]'),
    'portal', coalesce((select jsonb_agg(jsonb_build_object('tenantId', p.tenant_id, 'personId', p.id, 'slug', o.slug, 'name', o.name)) from public.persons p join public.organizations o on o.id = p.tenant_id where p.user_id = (select auth.uid())), '[]'))
$$;
grant execute on function public.my_contexts() to authenticated;

-- Assinatura pelo portal: só acrescenta à trilha do documento liberado; não altera o conteúdo.
create or replace function public.portal_sign_document(p_tenant text, p_document text, p_method text, p_typed_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.documents; now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select * into d from public.documents where tenant_id = p_tenant and id = p_document and released_to_portal;
  if not found or not app.portal_access(p_tenant, d.patient_id, 'any') then raise exception 'Documento não disponível.' using errcode = 'P0001'; end if;
  update public.documents set data = jsonb_set(jsonb_set(data, '{signature,status}', '"assinado"'), '{signature,trail}',
    coalesce(data #> '{signature,trail}', '[]') || jsonb_build_array(jsonb_build_object('at', now_iso, 'event', format('Aceite pelo portal (%s) — %s', p_method, left(p_typed_name, 80)))))
  where tenant_id = p_tenant and id = p_document;
end $$;
grant execute on function public.portal_sign_document(text, text, text, text) to authenticated;
