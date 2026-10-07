-- 0002_tenancy_auth.sql
-- Tenants, branches, warehouses, registers, users, roles, permissions, audit log, document numbering.

create table public.businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 200),
  currency    char(3) not null default 'PKR',
  settings    jsonb not null default '{"allow_negative_stock": false, "receipt_footer": "Thank you for shopping with us!"}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null default app.current_business_id() references public.businesses(id),
  code        text not null check (code ~ '^[A-Z0-9]{2,8}$'),
  name        text not null check (length(trim(name)) > 0),
  address     text,
  phone       text,
  timezone    text not null default 'Asia/Karachi',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, code),
  unique (id, business_id)
);

create table public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null default app.current_business_id(),
  branch_id   uuid not null,
  name        text not null,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  foreign key (branch_id, business_id) references public.branches (id, business_id),
  unique (id, business_id)
);
create unique index warehouses_one_default_per_branch on public.warehouses (branch_id) where is_default;

create table public.registers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null default app.current_business_id(),
  branch_id   uuid not null,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  foreign key (branch_id, business_id) references public.branches (id, business_id),
  unique (id, business_id)
);

-- Permission catalog (global) and per-business roles --------------------------------------------
create table public.permissions (
  code        text primary key,
  description text not null
);

create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id),
  code         text not null,
  name         text not null,
  all_branches boolean not null default false,
  is_system    boolean not null default false,
  unique (business_id, code)
);

create table public.role_permissions (
  role_id         uuid not null references public.roles(id) on delete cascade,
  permission_code text not null references public.permissions(code),
  primary key (role_id, permission_code)
);

create table public.profiles (
  id          uuid primary key references auth.users(id),
  business_id uuid not null references public.businesses(id),
  role_id     uuid not null references public.roles(id),
  full_name   text not null,
  status      text not null default 'active' check (status in ('active', 'disabled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_business_idx on public.profiles (business_id);

create table public.branch_users (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  branch_id   uuid not null references public.branches(id),
  business_id uuid not null references public.businesses(id),
  primary key (user_id, branch_id)
);

-- Audit log: append-only -------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id),
  actor_id    uuid,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_business_time_idx on public.audit_logs (business_id, created_at desc);
create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function app.forbid_mutation();

create or replace function app.write_audit(
  p_business uuid, p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (business_id, actor_id, action, entity_type, entity_id, details)
  values (p_business, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
end $$;

-- Gap-free document numbers (row-level counter, rolled back with the surrounding transaction) ------
create table public.document_sequences (
  business_id uuid not null references public.businesses(id),
  scope       text not null,
  kind        text not null,
  last_value  bigint not null default 0,
  primary key (business_id, scope, kind)
);

create or replace function app.next_doc_no(p_business uuid, p_scope text, p_kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into public.document_sequences as ds (business_id, scope, kind, last_value)
  values (p_business, p_scope, p_kind, 1)
  on conflict (business_id, scope, kind) do update set last_value = ds.last_value + 1
  returning ds.last_value into v;
  if p_scope = 'ALL' then
    return p_kind || '-' || lpad(v::text, 6, '0');
  end if;
  return p_kind || '-' || p_scope || '-' || lpad(v::text, 6, '0');
end $$;

create trigger businesses_updated before update on public.businesses for each row execute function app.set_updated_at();
create trigger branches_updated   before update on public.branches   for each row execute function app.set_updated_at();
create trigger profiles_updated   before update on public.profiles   for each row execute function app.set_updated_at();
