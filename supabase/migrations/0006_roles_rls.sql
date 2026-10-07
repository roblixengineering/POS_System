-- 0006_roles_rls.sql
-- Permission catalog, default roles, tenant bootstrap, user administration, RLS policies, audit triggers.

insert into public.permissions (code, description) values
  ('sales.create',            'Create sales at the POS'),
  ('sales.view_own',          'View own sales'),
  ('sales.view_all',          'View all sales in accessible branches'),
  ('sales.refund',            'Issue refunds / returns'),
  ('sales.discount',          'Apply line discounts'),
  ('sales.override_price',    'Sell at a price different from list price'),
  ('cash.manage',             'Open/close own cash sessions'),
  ('cash.manage_all',         'Close any cash session in accessible branches'),
  ('inventory.view',          'View stock for accessible branches'),
  ('inventory.cross_branch',  'View stock in all branches'),
  ('inventory.receive',       'Receive stock from suppliers'),
  ('inventory.adjust',        'Adjust stock (damage, counts)'),
  ('inventory.transfer',      'Create / cancel branch transfers'),
  ('inventory.transfer_approve','Approve and complete branch transfers'),
  ('products.manage',         'Create and edit products (incl. cost)'),
  ('customers.view',          'View customers'),
  ('customers.manage',        'Create and edit customers'),
  ('suppliers.view',          'View suppliers'),
  ('suppliers.manage',        'Create and edit suppliers'),
  ('purchases.view',          'View purchases / receiving documents'),
  ('expenses.view',           'View expenses'),
  ('expenses.manage',         'Record expenses'),
  ('reports.view',            'View sales and inventory reports'),
  ('reports.profit',          'View cost, profit and expense figures'),
  ('branches.manage',         'Manage branches, warehouses and registers'),
  ('users.view',              'View staff'),
  ('users.manage',            'Add staff, change roles and branch access'),
  ('settings.manage',         'Change business settings'),
  ('audit.view',              'View the audit log'),
  ('data.export',             'Export business data');

-- Default roles for a new business -----------------------------------------------------------------
create or replace function app.seed_business_roles(p_business uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_defs jsonb := '[
    {"code":"owner","name":"Owner / Super Admin","all_branches":true,"permissions":"*"},
    {"code":"business_admin","name":"Business Admin","all_branches":true,"permissions":"*"},
    {"code":"branch_manager","name":"Branch Manager","all_branches":false,"permissions":[
      "sales.create","sales.view_own","sales.view_all","sales.refund","sales.discount","cash.manage","cash.manage_all",
      "inventory.view","inventory.receive","inventory.adjust","inventory.transfer","inventory.transfer_approve",
      "customers.view","customers.manage","suppliers.view","purchases.view","expenses.view","expenses.manage","reports.view"]},
    {"code":"cashier","name":"Cashier","all_branches":false,"permissions":[
      "sales.create","sales.view_own","cash.manage","inventory.view","customers.view","customers.manage"]},
    {"code":"inventory_manager","name":"Inventory Manager","all_branches":false,"permissions":[
      "inventory.view","inventory.cross_branch","inventory.receive","inventory.adjust","inventory.transfer",
      "products.manage","suppliers.view","suppliers.manage","purchases.view","reports.view"]},
    {"code":"accountant","name":"Accountant","all_branches":true,"permissions":[
      "sales.view_all","inventory.view","customers.view","suppliers.view","purchases.view",
      "expenses.view","expenses.manage","reports.view","reports.profit","data.export"]}
  ]'::jsonb;
  d jsonb; v_role uuid;
begin
  perform set_config('app.seeding', 'on', true);
  for d in select * from jsonb_array_elements(v_defs) loop
    insert into public.roles (business_id, code, name, all_branches, is_system)
    values (p_business, d ->> 'code', d ->> 'name', (d ->> 'all_branches')::boolean, true)
    returning id into v_role;

    if d ->> 'permissions' = '*' then
      insert into public.role_permissions (role_id, permission_code) select v_role, code from public.permissions;
    else
      insert into public.role_permissions (role_id, permission_code)
      select v_role, jsonb_array_elements_text(d -> 'permissions');
    end if;
  end loop;
  perform set_config('app.seeding', 'off', true);
end $$;

-- Create a tenant with its first branch and owner. Used by bootstrap_business() and seed.sql.
create or replace function app.create_business_internal(
  p_owner uuid, p_name text, p_currency text, p_full_name text,
  p_branch_name text, p_branch_code text, p_business_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_role uuid; v_branch uuid;
begin
  insert into public.businesses (id, name, currency) values (p_business_id, p_name, upper(p_currency));
  perform app.seed_business_roles(p_business_id);
  select id into v_role from public.roles where business_id = p_business_id and code = 'owner';

  insert into public.branches (business_id, code, name) values (p_business_id, upper(p_branch_code), p_branch_name)
  returning id into v_branch;
  insert into public.warehouses (business_id, branch_id, name, is_default) values (p_business_id, v_branch, 'Main Store', true);
  insert into public.registers (business_id, branch_id, name) values (p_business_id, v_branch, 'Register 1');

  insert into public.profiles (id, business_id, role_id, full_name) values (p_owner, p_business_id, v_role, p_full_name);
  perform app.write_audit(p_business_id, 'business.created', 'business', p_business_id, jsonb_build_object('owner', p_owner));
  return p_business_id;
end $$;

create or replace function public.bootstrap_business(
  p_name text, p_currency text, p_full_name text, p_branch_name text, p_branch_code text
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'this account already belongs to a business';
  end if;
  return app.create_business_internal(auth.uid(), trim(p_name), p_currency, trim(p_full_name), trim(p_branch_name), p_branch_code);
end $$;

-- Staff administration (the auth user itself is created server-side with the service role) --------
create or replace function public.admin_add_member(
  p_user_id uuid, p_full_name text, p_role_code text, p_branch_ids uuid[] default '{}'
) returns void language plpgsql security definer set search_path = '' as $$
declare v_biz uuid; v_role uuid; v_caller_role text; b uuid;
begin
  v_biz := app.require_ctx('users.manage');
  select r.code into v_caller_role from public.profiles pr join public.roles r on r.id = pr.role_id where pr.id = auth.uid();
  if p_role_code = 'owner' and v_caller_role <> 'owner' then
    raise exception 'only an owner can create another owner' using errcode = '42501';
  end if;
  select id into v_role from public.roles where business_id = v_biz and code = p_role_code;
  if v_role is null then raise exception 'unknown role %', p_role_code; end if;
  if exists (select 1 from public.profiles where id = p_user_id) then raise exception 'user already has a profile'; end if;

  insert into public.profiles (id, business_id, role_id, full_name) values (p_user_id, v_biz, v_role, trim(p_full_name));
  foreach b in array coalesce(p_branch_ids, '{}') loop
    if not exists (select 1 from public.branches where id = b and business_id = v_biz) then
      raise exception 'branch % not found', b;
    end if;
    insert into public.branch_users (user_id, branch_id, business_id) values (p_user_id, b, v_biz);
  end loop;
  perform app.write_audit(v_biz, 'user.added', 'profile', p_user_id, jsonb_build_object('role', p_role_code, 'branches', p_branch_ids));
end $$;

create or replace function public.admin_update_member(
  p_user_id uuid, p_role_code text, p_status text, p_branch_ids uuid[] default '{}'
) returns void language plpgsql security definer set search_path = '' as $$
declare v_biz uuid; v_role uuid; v_caller_role text; v_target_role text; b uuid;
begin
  v_biz := app.require_ctx('users.manage');
  if p_user_id = auth.uid() then raise exception 'you cannot change your own role or status'; end if;
  if p_status not in ('active', 'disabled') then raise exception 'invalid status'; end if;
  select r.code into v_caller_role from public.profiles pr join public.roles r on r.id = pr.role_id where pr.id = auth.uid();
  select r.code into v_target_role from public.profiles pr join public.roles r on r.id = pr.role_id
   where pr.id = p_user_id and pr.business_id = v_biz;
  if v_target_role is null then raise exception 'user not found'; end if;
  if (p_role_code = 'owner' or v_target_role = 'owner') and v_caller_role <> 'owner' then
    raise exception 'only an owner can change owner accounts' using errcode = '42501';
  end if;
  select id into v_role from public.roles where business_id = v_biz and code = p_role_code;
  if v_role is null then raise exception 'unknown role %', p_role_code; end if;

  update public.profiles set role_id = v_role, status = p_status where id = p_user_id;
  delete from public.branch_users where user_id = p_user_id;
  foreach b in array coalesce(p_branch_ids, '{}') loop
    if not exists (select 1 from public.branches where id = b and business_id = v_biz) then
      raise exception 'branch % not found', b;
    end if;
    insert into public.branch_users (user_id, branch_id, business_id) values (p_user_id, b, v_biz);
  end loop;
end $$;

-- Audit triggers ------------------------------------------------------------------------------------
create or replace function app.audit_product_change() returns trigger language plpgsql as $$
begin
  if new.price is distinct from old.price or new.cost is distinct from old.cost then
    perform app.write_audit(new.business_id, 'product.price_changed', 'product', new.id,
      jsonb_build_object('sku', new.sku, 'price', jsonb_build_array(old.price, new.price), 'cost', jsonb_build_array(old.cost, new.cost)));
  end if;
  return new;
end $$;
create trigger products_audit after update on public.products for each row execute function app.audit_product_change();

create or replace function app.audit_profile_change() returns trigger language plpgsql as $$
begin
  if new.role_id is distinct from old.role_id or new.status is distinct from old.status then
    perform app.write_audit(new.business_id, 'user.access_changed', 'profile', new.id,
      jsonb_build_object('role', jsonb_build_array(old.role_id, new.role_id), 'status', jsonb_build_array(old.status, new.status)));
  end if;
  return new;
end $$;
create trigger profiles_audit after update on public.profiles for each row execute function app.audit_profile_change();

create or replace function app.audit_role_permission_change() returns trigger language plpgsql as $$
declare v_role uuid := coalesce(new.role_id, old.role_id); v_biz uuid;
begin
  if coalesce(current_setting('app.seeding', true), 'off') = 'on' then return coalesce(new, old); end if;
  select business_id into v_biz from public.roles where id = v_role;
  if v_biz is not null then
    perform app.write_audit(v_biz, 'role.permission_changed', 'role', v_role,
      jsonb_build_object('op', tg_op, 'permission', coalesce(new.permission_code, old.permission_code)));
  end if;
  return coalesce(new, old);
end $$;
create trigger role_permissions_audit after insert or delete on public.role_permissions
  for each row execute function app.audit_role_permission_change();

-- Row Level Security ------------------------------------------------------------------------------
alter table public.businesses         enable row level security;
alter table public.branches           enable row level security;
alter table public.warehouses         enable row level security;
alter table public.registers          enable row level security;
alter table public.permissions        enable row level security;
alter table public.roles              enable row level security;
alter table public.role_permissions   enable row level security;
alter table public.profiles           enable row level security;
alter table public.branch_users       enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.document_sequences enable row level security;
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.customers          enable row level security;
alter table public.suppliers          enable row level security;
alter table public.stock_movements    enable row level security;
alter table public.stock_levels       enable row level security;
alter table public.cash_sessions      enable row level security;
alter table public.sales              enable row level security;
alter table public.sale_items         enable row level security;
alter table public.payments           enable row level security;
alter table public.returns            enable row level security;
alter table public.return_items       enable row level security;
alter table public.purchases          enable row level security;
alter table public.purchase_items     enable row level security;
alter table public.stock_transfers    enable row level security;
alter table public.transfer_items     enable row level security;
alter table public.expenses           enable row level security;
-- document_sequences intentionally has no policies: only SECURITY DEFINER functions touch it.

-- Identity / tenancy
create policy businesses_select on public.businesses for select using (id = (select app.current_business_id()));
create policy businesses_update on public.businesses for update
  using (id = (select app.current_business_id()) and (select app.has_permission('settings.manage')))
  with check (id = (select app.current_business_id()));

create policy branches_select on public.branches for select using (business_id = (select app.current_business_id()));
create policy branches_insert on public.branches for insert
  with check (business_id = (select app.current_business_id()) and (select app.has_permission('branches.manage')));
create policy branches_update on public.branches for update
  using (business_id = (select app.current_business_id()) and (select app.has_permission('branches.manage')))
  with check (business_id = (select app.current_business_id()));

create policy warehouses_select on public.warehouses for select using (business_id = (select app.current_business_id()));
create policy warehouses_insert on public.warehouses for insert
  with check (business_id = (select app.current_business_id()) and (select app.has_permission('branches.manage')));
create policy warehouses_update on public.warehouses for update
  using (business_id = (select app.current_business_id()) and (select app.has_permission('branches.manage')))
  with check (business_id = (select app.current_business_id()));

create policy registers_select on public.registers for select using (business_id = (select app.current_business_id()));
create policy registers_insert on public.registers for insert
  with check (business_id = (select app.current_business_id()) and (select app.has_permission('branches.manage')));
create policy registers_update on public.registers for update
  using (business_id = (select app.current_business_id()) and (select app.has_permission('branches.manage')))
  with check (business_id = (select app.current_business_id()));

create policy permissions_select on public.permissions for select to authenticated using (true);
create policy roles_select on public.roles for select using (business_id = (select app.current_business_id()));
create policy role_permissions_select on public.role_permissions for select
  using (exists (select 1 from public.roles r where r.id = role_id));

create policy profiles_select on public.profiles for select
  using (id = (select auth.uid())
         or (business_id = (select app.current_business_id()) and (select app.has_permission('users.view'))));
create policy branch_users_select on public.branch_users for select
  using (user_id = (select auth.uid())
         or (business_id = (select app.current_business_id()) and (select app.has_permission('users.view'))));

create policy audit_logs_select on public.audit_logs for select
  using (business_id = (select app.current_business_id()) and (select app.has_permission('audit.view')));

-- Catalog and parties
create policy categories_select on public.categories for select using (business_id = (select app.current_business_id()));
create policy categories_insert on public.categories for insert
  with check (business_id = (select app.current_business_id()) and (select app.has_permission('products.manage')));
create policy categories_update on public.categories for update
  using (business_id = (select app.current_business_id()) and (select app.has_permission('products.manage')))
  with check (business_id = (select app.current_business_id()));

create policy products_select on public.products for select using (business_id = (select app.current_business_id()));
create policy products_insert on public.products for insert
  with check (business_id = (select app.current_business_id()) and (select app.has_permission('products.manage')));
create policy products_update on public.products for update
  using (business_id = (select app.current_business_id()) and (select app.has_permission('products.manage')))
  with check (business_id = (select app.current_business_id()));

create policy customers_select on public.customers for select
  using (business_id = (select app.current_business_id()) and (select app.has_permission('customers.view')));
create policy customers_insert on public.customers for insert
  with check (business_id = (select app.current_business_id()) and (select app.has_permission('customers.manage')) and balance = 0);
create policy customers_update on public.customers for update
  using (business_id = (select app.current_business_id()) and (select app.has_permission('customers.manage')))
  with check (business_id = (select app.current_business_id()));

create policy suppliers_select on public.suppliers for select
  using (business_id = (select app.current_business_id()) and (select app.has_permission('suppliers.view')));
create policy suppliers_insert on public.suppliers for insert
  with check (business_id = (select app.current_business_id()) and (select app.has_permission('suppliers.manage')) and balance = 0);
create policy suppliers_update on public.suppliers for update
  using (business_id = (select app.current_business_id()) and (select app.has_permission('suppliers.manage')))
  with check (business_id = (select app.current_business_id()));

-- Inventory (read-only for clients; all writes go through RPCs)
create policy stock_levels_select on public.stock_levels for select
  using (business_id = (select app.current_business_id())
         and ((app.can_access_branch(branch_id) and (select app.has_permission('inventory.view')))
              or (select app.has_permission('inventory.cross_branch'))));
create policy stock_movements_select on public.stock_movements for select
  using (business_id = (select app.current_business_id()) and app.can_access_branch(branch_id)
         and (select app.has_permission('inventory.view')));

-- Sales
create policy sales_select on public.sales for select
  using (business_id = (select app.current_business_id()) and app.can_access_branch(branch_id)
         and ((select app.has_permission('sales.view_all'))
              or (cashier_id = (select auth.uid()) and (select app.has_permission('sales.view_own')))));
create policy sale_items_select on public.sale_items for select
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy payments_select on public.payments for select
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy returns_select on public.returns for select
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy return_items_select on public.return_items for select
  using (exists (select 1 from public.returns r where r.id = return_id));
create policy cash_sessions_select on public.cash_sessions for select
  using (business_id = (select app.current_business_id()) and app.can_access_branch(branch_id)
         and (cashier_id = (select auth.uid()) or (select app.has_permission('cash.manage_all'))));

-- Purchasing, transfers, expenses
create policy purchases_select on public.purchases for select
  using (business_id = (select app.current_business_id()) and app.can_access_branch(branch_id)
         and (select app.has_permission('purchases.view')));
create policy purchase_items_select on public.purchase_items for select
  using (exists (select 1 from public.purchases p where p.id = purchase_id));
create policy transfers_select on public.stock_transfers for select
  using (business_id = (select app.current_business_id()) and (select app.has_permission('inventory.view'))
         and exists (select 1 from public.warehouses w
                      where w.id in (from_warehouse_id, to_warehouse_id) and app.can_access_branch(w.branch_id)));
create policy transfer_items_select on public.transfer_items for select
  using (exists (select 1 from public.stock_transfers t where t.id = transfer_id));
create policy expenses_select on public.expenses for select
  using (business_id = (select app.current_business_id()) and app.can_access_branch(branch_id)
         and (select app.has_permission('expenses.view')));
create policy expenses_insert on public.expenses for insert
  with check (business_id = (select app.current_business_id()) and app.can_access_branch(branch_id)
              and (select app.has_permission('expenses.manage')) and created_by = (select auth.uid()));

select app.harden_public_functions();
