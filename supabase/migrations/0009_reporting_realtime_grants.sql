-- 0009_reporting_realtime_grants.sql
-- Low-stock view, cross-branch stock search, management report, realtime publication, privilege lockdown.

-- Low stock: at or below the reorder level (deterministic threshold; no forecasting in v1).
-- security_invoker => the caller's RLS applies, so users only see stock they may see.
create view public.v_low_stock with (security_invoker = true) as
select sl.business_id, sl.branch_id, b.name as branch_name, sl.warehouse_id, w.name as warehouse_name,
       sl.product_id, p.name as product_name, p.sku, sl.qty, p.reorder_level
  from public.stock_levels sl
  join public.products p   on p.id = sl.product_id
  join public.branches b   on b.id = sl.branch_id
  join public.warehouses w on w.id = sl.warehouse_id
 where p.track_stock and p.is_active and p.reorder_level > 0 and sl.qty <= p.reorder_level;

-- Cost is hidden from staff without products.manage / reports.profit: column-level SELECT is withheld
-- on products.cost and exposed through a permission-checked view.
revoke select on public.products from authenticated;
grant select (id, business_id, category_id, sku, barcode, name, unit, price, tax_rate, reorder_level,
              track_stock, is_active, image_path, created_at, updated_at)
  on public.products to authenticated;

create view public.products_with_cost as
select p.*
  from public.products p
 where p.business_id = app.current_business_id()
   and (app.has_permission('products.manage') or app.has_permission('reports.profit'));
grant select on public.products_with_cost to authenticated;

-- Cross-branch stock search (RLS decides which branches the caller can see).
create or replace function public.inv_search_stock(p_query text, p_limit int default 20)
returns table (product_id uuid, product_name text, sku text, barcode text, branch_id uuid, branch_name text,
               warehouse_id uuid, warehouse_name text, qty numeric)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.name, p.sku, p.barcode, b.id, b.name, w.id, w.name, sl.qty
    from public.products p
    join public.stock_levels sl on sl.product_id = p.id
    join public.warehouses w on w.id = sl.warehouse_id
    join public.branches b on b.id = sl.branch_id
   where p.is_active
     and (p.name ilike '%' || p_query || '%' or p.sku ilike p_query or p.barcode = p_query)
   order by p.name, b.name, w.name
   limit least(greatest(p_limit, 1), 200)
$$;

-- Management report. Cost/profit/expense figures are null unless the caller has reports.profit.
-- These are management estimates, not formal accounting statements.
create or replace function public.report_summary(p_from date, p_to date, p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_biz uuid; v_profit boolean; res jsonb;
begin
  v_biz := app.require_ctx('reports.view');
  if p_from is null or p_to is null or p_to < p_from then raise exception 'invalid date range'; end if;
  if p_branch_id is not null and not app.can_access_branch(p_branch_id) then
    raise exception 'branch access denied' using errcode = '42501';
  end if;
  v_profit := app.has_permission('reports.profit');

  with s as (
    select s.* from public.sales s join public.branches b on b.id = s.branch_id
     where s.business_id = v_biz and s.status <> 'void'
       and (s.created_at at time zone b.timezone)::date between p_from and p_to
       and (p_branch_id is null or s.branch_id = p_branch_id) and app.can_access_branch(s.branch_id)
  ), r as (
    select r.* from public.returns r join public.branches b on b.id = r.branch_id
     where r.business_id = v_biz
       and (r.created_at at time zone b.timezone)::date between p_from and p_to
       and (p_branch_id is null or r.branch_id = p_branch_id) and app.can_access_branch(r.branch_id)
  ), e as (
    select x.* from public.expenses x
     where x.business_id = v_biz and x.expense_date between p_from and p_to
       and (p_branch_id is null or x.branch_id = p_branch_id) and app.can_access_branch(x.branch_id)
  ), top_p as (
    select si.product_id, si.product_name,
           sum(si.qty - si.returned_qty) as qty,
           sum(round(si.line_total * (si.qty - si.returned_qty) / si.qty, 2)) as revenue
      from public.sale_items si join s on s.id = si.sale_id
     group by si.product_id, si.product_name
     order by revenue desc limit 10
  ), bp as (
    select b.id, b.name,
           coalesce((select sum(s.total) from s where s.branch_id = b.id), 0)
             - coalesce((select sum(r.total) from r where r.branch_id = b.id), 0) as net_sales,
           coalesce((select sum(s.cogs_total) from s where s.branch_id = b.id), 0)
             - coalesce((select sum(r.cogs_reversed) from r where r.branch_id = b.id), 0) as cogs,
           (select count(*) from s where s.branch_id = b.id) as transactions
      from public.branches b
     where b.business_id = v_biz and app.can_access_branch(b.id) and (p_branch_id is null or b.id = p_branch_id)
  ), pm as (
    select py.method, sum(py.amount) as amount from public.payments py join s on s.id = py.sale_id group by py.method
  ), tot as (
    select coalesce((select sum(total) from s), 0)  as gross_sales,
           coalesce((select sum(total) from r), 0)  as returns_total,
           coalesce((select sum(cogs_total) from s), 0) - coalesce((select sum(cogs_reversed) from r), 0) as cogs,
           coalesce((select sum(amount) from e), 0) as expenses,
           (select count(*) from s) as transactions
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'gross_sales', tot.gross_sales,
    'returns', tot.returns_total,
    'net_sales', tot.gross_sales - tot.returns_total,
    'transactions', tot.transactions,
    'cost_of_goods',  case when v_profit then tot.cogs end,
    'gross_profit',   case when v_profit then tot.gross_sales - tot.returns_total - tot.cogs end,
    'expenses',       case when v_profit then tot.expenses end,
    'net_result',     case when v_profit then tot.gross_sales - tot.returns_total - tot.cogs - tot.expenses end,
    'low_stock', (select count(*) from public.stock_levels sl join public.products p on p.id = sl.product_id
                   where sl.business_id = v_biz and p.track_stock and p.is_active and p.reorder_level > 0
                     and sl.qty <= p.reorder_level and app.can_access_branch(sl.branch_id)
                     and (p_branch_id is null or sl.branch_id = p_branch_id)),
    'top_products', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from top_p t),
    'branches', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', bp.id, 'name', bp.name, 'net_sales', bp.net_sales, 'transactions', bp.transactions,
                    'gross_profit', case when v_profit then bp.net_sales - bp.cogs end) order by bp.net_sales desc), '[]'::jsonb) from bp),
    'payment_mix', (select coalesce(jsonb_agg(to_jsonb(pm)), '[]'::jsonb) from pm)
  ) into res from tot;

  return res;
end $$;

-- Realtime: notification only. PostgreSQL stays the source of truth; clients re-fetch on every event.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.stock_levels;
    alter publication supabase_realtime add table public.sales;
  end if;
end $$;

-- Privilege lockdown (RLS is the gate; grants are the second lock) -------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

revoke insert, update, delete, truncate on
  public.stock_levels, public.stock_movements, public.sales, public.sale_items, public.payments,
  public.returns, public.return_items, public.cash_sessions, public.purchases, public.purchase_items,
  public.stock_transfers, public.transfer_items, public.audit_logs, public.roles, public.role_permissions,
  public.permissions, public.profiles, public.branch_users
  from authenticated;
revoke all on public.document_sequences from authenticated;
revoke truncate, delete on public.products, public.customers, public.suppliers, public.categories,
  public.branches, public.warehouses, public.registers, public.businesses, public.expenses from authenticated;

select app.harden_public_functions();
