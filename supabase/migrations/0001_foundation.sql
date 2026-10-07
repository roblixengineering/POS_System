-- 0001_foundation.sql
-- Extensions, private "app" schema and the helper functions that RLS and RPCs rely on.
-- Helper functions are plpgsql on purpose: bodies are not validated against tables at creation time,
-- which lets column defaults reference them before the tables exist.

create extension if not exists pg_trgm with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function app.forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% on % is not allowed: records are append-only', tg_op, tg_table_name
    using errcode = '42501';
end $$;

-- Identity helpers (SECURITY DEFINER so they can read profiles regardless of RLS) -----------------

create or replace function app.current_business_id() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  select pr.business_id into v
    from public.profiles pr
   where pr.id = auth.uid() and pr.status = 'active';
  return v;
end $$;

create or replace function app.has_permission(p_code text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1
      from public.profiles pr
      join public.role_permissions rp on rp.role_id = pr.role_id
     where pr.id = auth.uid() and pr.status = 'active' and rp.permission_code = p_code
  );
end $$;

create or replace function app.can_access_branch(p_branch uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1
      from public.profiles pr
      join public.roles r on r.id = pr.role_id
      join public.branches br on br.id = p_branch and br.business_id = pr.business_id
     where pr.id = auth.uid() and pr.status = 'active'
       and (r.all_branches
            or exists (select 1 from public.branch_users bu
                        where bu.user_id = pr.id and bu.branch_id = p_branch))
  );
end $$;

-- Guard used at the top of every privileged RPC: authenticated + permission + optional branch scope.
-- Returns the caller's business id. Business/branch scope ALWAYS comes from the session, never the client.
create or replace function app.require_ctx(p_permission text, p_branch uuid default null) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_biz uuid := app.current_business_id();
begin
  if auth.uid() is null or v_biz is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_permission(p_permission) then
    raise exception 'permission denied: %', p_permission using errcode = '42501';
  end if;
  if p_branch is not null and not app.can_access_branch(p_branch) then
    raise exception 'branch access denied' using errcode = '42501';
  end if;
  return v_biz;
end $$;

-- Lock down RPCs: call at the end of every migration that adds functions to the public schema.
create or replace function app.harden_public_functions() returns void
language plpgsql as $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
