-- Teste de isolamento RLS com identidades reais (executado em transação com ROLLBACK — não deixa dados).
-- Cada asserção grava em _results(name, ok, detail). Retorna a tabela ao final.
begin;
create temp table _results (n serial, name text, ok boolean, detail text) on commit drop;
grant all on _results to authenticated, anon;
grant usage, select on sequence _results_n_seq to authenticated, anon;

-- ---------- fixtures (como postgres, ignora RLS) ----------
insert into auth.users (id, email, email_confirmed_at, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner-a@rls.test', now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000a2', 'recep-a@rls.test', now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000a3', 'psico-a@rls.test', now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000a4', 'psico2-a@rls.test', now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner-b@rls.test', now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c1', 'paciente-a@rls.test', now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000d1', 'suporte@rls.test', now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.platform_admins values ('00000000-0000-0000-0000-0000000000d1', 'platform_support', now());

insert into public.organizations (id, slug, name, segment, status, public_enabled) values ('rls_a', 'rls-clinica-a', 'Clínica A', 'psicologia', 'active', true), ('rls_b', 'rls-clinica-b', 'Clínica B', 'odontologia', 'active', true);
insert into public.units (tenant_id, id, name, data) values ('rls_a', 'a_u1', 'A1', '{}'), ('rls_a', 'a_u2', 'A2', '{}'), ('rls_b', 'b_u1', 'B1', '{}');
insert into public.professionals (tenant_id, id, name, data) values ('rls_a', 'a_pro1', 'Psico 1', '{}'), ('rls_a', 'a_pro2', 'Psico 2', '{}'), ('rls_b', 'b_pro1', 'Dentista', '{}');
insert into public.services (tenant_id, id, name, public_bookable, data) values ('rls_a', 'a_svc', 'Sessão', true, '{"durationMin":50}'), ('rls_b', 'b_svc', 'Avaliação', true, '{"durationMin":40}');
insert into public.staff (tenant_id, id, user_id, email, professional_id, data) values
  ('rls_a', 'a_owner', '00000000-0000-0000-0000-0000000000a1', 'owner-a@rls.test', null, '{"memberships":[{"role":"clinic_owner","unitIds":"all"}]}'),
  ('rls_a', 'a_recep', '00000000-0000-0000-0000-0000000000a2', 'recep-a@rls.test', null, '{"memberships":[{"role":"reception","unitIds":["a_u1"]}]}'),
  ('rls_a', 'a_psico', '00000000-0000-0000-0000-0000000000a3', 'psico-a@rls.test', 'a_pro1', '{"memberships":[{"role":"professional","unitIds":"all"}]}'),
  ('rls_a', 'a_psico2', '00000000-0000-0000-0000-0000000000a4', 'psico2-a@rls.test', 'a_pro2', '{"memberships":[{"role":"professional","unitIds":"all"}]}'),
  ('rls_b', 'b_owner', '00000000-0000-0000-0000-0000000000b1', 'owner-b@rls.test', null, '{"memberships":[{"role":"clinic_owner","unitIds":"all"}]}');
insert into public.persons (tenant_id, id, user_id, name, data) values ('rls_a', 'a_per1', '00000000-0000-0000-0000-0000000000c1', 'Paciente A', '{}'), ('rls_a', 'a_per2', null, 'Outro', '{}');
insert into public.patients (tenant_id, id, unit_id, kind, name, cpf, data) values
  ('rls_a', 'a_pat1', 'a_u1', 'human', 'Paciente A', '000.000.001-91', '{}'),
  ('rls_a', 'a_pat2', 'a_u2', 'human', 'Paciente A2 (outra unidade)', null, '{}'),
  ('rls_a', 'a_pat3', 'a_u1', 'human', 'Paciente de outra pessoa', null, '{}'),
  ('rls_b', 'b_pat1', 'b_u1', 'human', 'Paciente B mesmo CPF', '000.000.001-91', '{}');
insert into public.patient_links (tenant_id, id, patient_id, person_id, relation, can_clinical, can_financial, can_schedule, data) values
  ('rls_a', 'a_lk1', 'a_pat1', 'a_per1', 'self', true, true, true, '{}'), ('rls_a', 'a_lk3', 'a_pat3', 'a_per2', 'self', true, true, true, '{}');
insert into public.clinical_records (tenant_id, id, patient_id, professional_id, status, confidentiality, released_to_portal, data) values
  ('rls_a', 'a_rec_restrito', 'a_pat1', 'a_pro1', 'finalizado', 'restrito', false, '{"title":"Sessão","content":{"x":"sigilo"},"addenda":[]}'),
  ('rls_a', 'a_rec_liberado', 'a_pat1', 'a_pro1', 'finalizado', 'padrao', true, '{"title":"Orientação","portalGuidance":"Beba água","addenda":[]}');
insert into public.documents (tenant_id, id, patient_id, confidentiality, released_to_portal, created_by, data) values
  ('rls_a', 'a_doc_lib', 'a_pat1', 'padrao', true, 'a_pro1', '{"kind":"declaracao"}'),
  ('rls_a', 'a_doc_int', 'a_pat1', 'padrao', false, 'a_pro1', '{"kind":"relatorio"}');
insert into public.charges (tenant_id, id, unit_id, patient_id, status, due_date, amount_cents, data) values
  ('rls_a', 'a_ch1', 'a_u1', 'a_pat1', 'paga', current_date, 20000, '{"payments":[{"id":"p1","status":"confirmado","amountCents":20000}],"refunds":[]}');
insert into public.appointments (tenant_id, id, unit_id, patient_id, professional_id, service_id, start_at, end_at, status, data) values
  ('rls_a', 'a_ap1', 'a_u1', 'a_pat1', 'a_pro1', 'a_svc', now() + interval '2 day', now() + interval '2 day 50 min', 'confirmada', '{}');

-- ---------- helper: trocar identidade ----------
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.check(name text, ok boolean, detail text default null) returns void language sql as $$ insert into _results (name, ok, detail) values (name, ok, detail) $$;

-- ===== Proprietário B (outro tenant) =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check('B não vê pacientes de A', (select count(*) from public.patients where tenant_id = 'rls_a') = 0);
select pg_temp.check('B vê seu paciente com mesmo CPF (sem merge)', (select count(*) from public.patients where cpf = '000.000.001-91') = 1);
select pg_temp.check('B não vê prontuário de A', (select count(*) from public.clinical_records where tenant_id = 'rls_a') = 0);
select pg_temp.check('B não vê cobranças de A', (select count(*) from public.charges where tenant_id = 'rls_a') = 0);
select pg_temp.check('B não vê organização A', (select count(*) from public.organizations where id = 'rls_a') = 0);
do $$ begin
  begin insert into public.patients (tenant_id, id, unit_id, kind, name, data) values ('rls_a', 'x', 'a_u1', 'human', 'invasor', '{}');
    perform pg_temp.check('B não insere paciente em A', false);
  exception when insufficient_privilege then perform pg_temp.check('B não insere paciente em A', true); end;
end $$;
do $$ declare n int; begin update public.patients set name = 'hack' where tenant_id = 'rls_a'; get diagnostics n = row_count; perform pg_temp.check('B não altera pacientes de A', n = 0); end $$;
reset role;

-- ===== Recepção A (unidade a_u1) =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check('Recepção vê paciente da própria unidade', (select count(*) from public.patients where id = 'a_pat1') = 1);
select pg_temp.check('Recepção não vê paciente de outra unidade', (select count(*) from public.patients where id = 'a_pat2') = 0);
select pg_temp.check('Recepção não lê prontuário (nem restrito)', (select count(*) from public.clinical_records) = 0);
select pg_temp.check('Recepção vê agenda da unidade', (select count(*) from public.appointments where id = 'a_ap1') = 1);
do $$ begin
  begin insert into public.appointments (tenant_id, id, unit_id, patient_id, professional_id, service_id, start_at, end_at, status, data)
          values ('rls_a', 'a_ap_conf', 'a_u1', 'a_pat3', 'a_pro1', 'a_svc', now() + interval '2 day 10 min', now() + interval '2 day 40 min', 'confirmada', '{}');
    perform pg_temp.check('Sobreposição do profissional bloqueada no banco', false);
  exception when exclusion_violation then perform pg_temp.check('Sobreposição do profissional bloqueada no banco', true); end;
end $$;
do $$ begin
  begin insert into public.appointments (tenant_id, id, unit_id, patient_id, professional_id, service_id, start_at, end_at, status, conflict_ack, data)
          values ('rls_a', 'a_ap_enc', 'a_u1', 'a_pat3', 'a_pro1', 'a_svc', now() + interval '2 day 10 min', now() + interval '2 day 40 min', 'confirmada', true, '{}');
    perform pg_temp.check('Recepção não força encaixe com conflito', false);
  exception when insufficient_privilege then perform pg_temp.check('Recepção não força encaixe com conflito', true); end;
end $$;
reset role;

-- ===== Proprietário A =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ declare n int; begin
  insert into public.appointments (tenant_id, id, unit_id, patient_id, professional_id, service_id, start_at, end_at, status, conflict_ack, data)
    values ('rls_a', 'a_ap_enc2', 'a_u1', 'a_pat3', 'a_pro1', 'a_svc', now() + interval '2 day 10 min', now() + interval '2 day 40 min', 'confirmada', true, '{}');
  get diagnostics n = row_count; perform pg_temp.check('Gestão grava encaixe com conflito reconhecido', n = 1);
end $$;
select pg_temp.check('Proprietário vê todas as unidades', (select count(*) from public.patients where tenant_id = 'rls_a') = 3);
select pg_temp.check('Proprietário NÃO lê registro restrito de psicologia', (select count(*) from public.clinical_records where id = 'a_rec_restrito') = 0);
select pg_temp.check('Proprietário lê registro padrão', (select count(*) from public.clinical_records where id = 'a_rec_liberado') = 1);
do $$ begin
  begin update public.charges set data = jsonb_set(data, '{payments}', '[]') where id = 'a_ch1';
    perform pg_temp.check('Pagamento liquidado não pode ser apagado', false);
  exception when raise_exception then perform pg_temp.check('Pagamento liquidado não pode ser apagado', true); end;
end $$;
do $$ declare n int; begin delete from public.charges where id = 'a_ch1'; get diagnostics n = row_count; perform pg_temp.check('Cobrança não é excluída pelo cliente', n = 0); end $$;
reset role;

-- ===== Psicólogo autor e psicólogo colega =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.check('Autor lê o próprio registro restrito', (select count(*) from public.clinical_records where id = 'a_rec_restrito') = 1);
do $$ begin
  begin update public.clinical_records set data = jsonb_set(data, '{content}', '{"x":"alterado"}') where id = 'a_rec_restrito';
    perform pg_temp.check('Registro finalizado imutável (sem adendo)', false);
  exception when raise_exception then perform pg_temp.check('Registro finalizado imutável (sem adendo)', true); end;
end $$;
do $$ declare n int; begin
  update public.clinical_records set data = jsonb_set(data, '{addenda}', '[{"id":"ad1","reason":"correção","text":"ok"}]') where id = 'a_rec_restrito';
  get diagnostics n = row_count; perform pg_temp.check('Adendo em registro finalizado é aceito', n = 1);
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select pg_temp.check('Colega psicólogo não lê registro restrito de outro', (select count(*) from public.clinical_records where id = 'a_rec_restrito') = 0);
reset role;

-- ===== Documentos genéricos de módulo (tenant_documents) =====
reset role;
insert into public.tenant_documents (tenant_id, collection, id, patient_id, data) values
  ('rls_a', 'vaccines', 'vac1', 'a_pat1', '{}'), ('rls_a', 'vaccines', 'vac3', 'a_pat3', '{}'),
  ('rls_a', 'psychPlans', 'pp1', 'a_pat1', '{}'), ('rls_a', 'products', 'prod1', null, '{}'), ('rls_b', 'products', 'prodB', null, '{}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check('tdoc: recepção lê catálogo do tenant (member_readable)', (select count(*) from public.tenant_documents where id = 'prod1') = 1);
select pg_temp.check('tdoc: recepção não lê vacinas (clínico)', (select count(*) from public.tenant_documents where collection = 'vaccines') = 0);
select pg_temp.check('tdoc: recepção não lê plano de psicologia', (select count(*) from public.tenant_documents where collection = 'psychPlans') = 0);
select pg_temp.check('tdoc: nada de outro tenant', (select count(*) from public.tenant_documents where tenant_id = 'rls_b') = 0);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ declare n int; begin
  insert into public.tenant_documents (tenant_id, collection, id, data) values ('rls_a', 'leads', 'lead1', '{}');
  get diagnostics n = row_count; perform pg_temp.check('tdoc: proprietário grava lead', n = 1);
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check('tdoc portal: vê só vacina do próprio paciente', (select array_agg(id) from public.tenant_documents where collection = 'vaccines') = array['vac1']);
select pg_temp.check('tdoc portal: não vê catálogo interno', (select count(*) from public.tenant_documents where collection = 'products') = 0);
reset role;
select pg_temp.check('nenhuma política lê o schema app diretamente', (select count(*) from pg_policies where schemaname = 'public' and (qual ~ 'from app\.' or with_check ~ 'from app\.')) = 0,
  (select string_agg(tablename || '.' || policyname, ', ') from pg_policies where schemaname = 'public' and (qual ~ 'from app\.' or with_check ~ 'from app\.')));

-- ===== Portal (paciente A) =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check('Portal vê só o próprio paciente', (select array_agg(id order by id) from public.patients) = array['a_pat1']);
select pg_temp.check('Portal não lê prontuário', (select count(*) from public.clinical_records) = 0);
select pg_temp.check('Portal lê orientação liberada pela view', (select count(*) from public.portal_guidance) = 1);
select pg_temp.check('Portal vê só documento liberado', (select array_agg(id) from public.documents) = array['a_doc_lib']);
select pg_temp.check('Portal vê sua cobrança', (select count(*) from public.charges) = 1);
select pg_temp.check('Portal vê sua consulta', (select count(*) from public.appointments) = 1);
select pg_temp.check('Portal não vê equipe', (select count(*) from public.staff) = 0);
reset role;

-- ===== Suporte da plataforma =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check('Suporte vê organizações (contexto comercial)', (select count(*) from public.organizations where id in ('rls_a', 'rls_b')) = 2);
select pg_temp.check('Suporte NÃO lê prontuário', (select count(*) from public.clinical_records) = 0);
select pg_temp.check('Suporte NÃO lê pacientes', (select count(*) from public.patients) = 0);
reset role;

-- ===== Solicitação de contratação SaaS (0009) =====
insert into public.platform_documents (collection, id, data) values
  ('plans', 'rls_plan', '{"id":"rls_plan","name":"Plano RLS","active":true,"version":3,"prices":{"mensal":12345,"trimestral":30000,"anual":100000},"limits":{"units":1},"modules":["agenda"],"overage":{}}'),
  ('plans', 'rls_plan_off', '{"id":"rls_plan_off","name":"Inativo","active":false,"version":1,"prices":{"mensal":100},"limits":{},"modules":[],"overage":{}}')
  on conflict (collection, id) do update set data = excluded.data;
create or replace function pg_temp.req(p_tenant text, p_plan text, p_key text, p_total bigint default 12345) returns jsonb language sql as $$
  select public.request_saas_contract(p_plan, 'mensal', false, p_tenant,
    '{"kind":"pj","legalName":"Clínica Teste","document":"00000000000191","email":"a@rls.test"}'::jsonb,
    '{"name":"Rep Teste","email":"r@rls.test"}'::jsonb, 1, 'hash', '{"terms":true,"powers":true,"privacyNotice":true}'::jsonb, p_total, p_key)
$$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin perform pg_temp.req('rls_a', 'rls_plan', 'chave-idempotente-0009', 1); perform pg_temp.check('Contratação: total divergente do catálogo recusado', false);
exception when raise_exception then perform pg_temp.check('Contratação: total divergente do catálogo recusado', true); end $$;
select pg_temp.check('Contratação: preço vem do catálogo no servidor', (pg_temp.req('rls_a', 'rls_plan', 'chave-idempotente-0001', 12345) ->> 'total_cents')::bigint = 12345);
select pg_temp.check('Contratação: duplo envio devolve a mesma solicitação', (pg_temp.req('rls_a', 'rls_plan', 'chave-idempotente-0001') ->> 'existing')::boolean and (select count(*) from public.saas_contract_requests where tenant_id = 'rls_a') = 1);
select pg_temp.check('Contratação: solicitação nunca nasce assinada', (select bool_and(status = 'solicitado') from public.saas_contract_requests));
do $$ begin perform pg_temp.req('rls_a', 'rls_plan_off', 'chave-idempotente-0002'); perform pg_temp.check('Contratação: plano inativo recusado', false);
exception when raise_exception then perform pg_temp.check('Contratação: plano inativo recusado', true); end $$;
do $$ begin insert into public.saas_contract_requests (user_id, kind, plan_id, cycle, offer, client_total_cents, contractor, signatory, template_version, document_hash, acceptances, idempotency_key)
  values ('00000000-0000-0000-0000-0000000000a1', 'nova', 'rls_plan', 'mensal', '{}', 1, '{}', '{}', 1, 'h', '{}', 'direto-sem-rpc-0001');
  perform pg_temp.check('Contratação: INSERT direto bloqueado', false);
exception when insufficient_privilege then perform pg_temp.check('Contratação: INSERT direto bloqueado', true); end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
do $$ begin perform pg_temp.req('rls_a', 'rls_plan', 'chave-idempotente-0003'); perform pg_temp.check('Contratação: recepção não contrata pela clínica', false);
exception when insufficient_privilege then perform pg_temp.check('Contratação: recepção não contrata pela clínica', true); end $$;
select pg_temp.check('Contratação: recepção não lê solicitação da clínica', (select count(*) from public.saas_contract_requests) = 0);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check('Contratação: B não lê solicitação de A', (select count(*) from public.saas_contract_requests where tenant_id = 'rls_a') = 0);
do $$ begin perform pg_temp.req('rls_a', 'rls_plan', 'chave-idempotente-0004'); perform pg_temp.check('Contratação: B não contrata por A', false);
exception when insufficient_privilege then perform pg_temp.check('Contratação: B não contrata por A', true); end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check('Contratação: suporte não lê solicitações (CPF)', (select count(*) from public.saas_contract_requests) = 0);
reset role;

-- ===== Anônimo =====
set local role anon;
select pg_temp.check('Anônimo não lê tabelas', (select count(*) from information_schema.table_privileges where grantee = 'anon' and table_schema = 'public' and table_name in ('patients', 'clinical_records', 'charges')) = 0);
do $$ begin perform public.request_saas_contract('rls_plan', 'mensal', false, null, '{}', '{}', 1, 'h', '{}', 1, 'chave-anonima-00001'); perform pg_temp.check('Anônimo não envia solicitação de contratação', false);
exception when insufficient_privilege then perform pg_temp.check('Anônimo não envia solicitação de contratação', true); end $$;
select pg_temp.check('Anônimo lê página pública (RPC)', (select public.public_clinic('rls-clinica-a') ->> 'org') is not null);
select pg_temp.check('Anônimo: RPC pública não expõe pacientes', position('Paciente' in public.public_clinic('rls-clinica-a')::text) = 0);
reset role;

select name, ok, detail from _results order by n;
rollback;
