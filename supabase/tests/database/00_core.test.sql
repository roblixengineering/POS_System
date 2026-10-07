-- pgTAP tests: run with `npx supabase test db` (after `npx supabase start`, seed.sql is applied).
begin;
select plan(16);

-- helper: act as a given user (what PostgREST does with a verified JWT)
create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- 1. every public table has RLS enabled -------------------------------------------------------------
select is((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint,
          'all public tables have RLS enabled');

-- 2-4. tenant isolation ----------------------------------------------------------------------------------
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');   -- Rival owner
select is((select count(*) from public.products where name = 'Coca Cola 1.5L'), 0::bigint, 'rival cannot see demo products');
select throws_ok($$insert into public.products (business_id, sku, name, price)
                   values ('aaaaaaaa-0000-0000-0000-00000000b001', 'HACK', 'Hack', 1)$$, '42501', null,
                 'rival cannot insert into the demo tenant');
select is((select count(*) from public.sales), 0::bigint, 'rival sees no sales');
reset role;

-- 5. cost is hidden from cashiers ------------------------------------------------------------------------
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');   -- cashier
select throws_ok($$select cost from public.products$$, '42501', null, 'cashier cannot read product cost');
select is((select count(*) from public.products_with_cost), 0::bigint, 'cashier gets nothing from products_with_cost');

-- 6. a sale is atomic: invoice + payment + stock movement ------------------------------------------------
select lives_ok($$select public.pos_open_session((select id from public.registers
                    where business_id = 'aaaaaaaa-0000-0000-0000-00000000b001' limit 1), 1000)$$, 'cashier opens a shift');
create temp table t_sale as
select public.pos_create_sale(
  (select id from public.branches where code = 'MB' and business_id = 'aaaaaaaa-0000-0000-0000-00000000b001'),
  (select id from public.registers where business_id = 'aaaaaaaa-0000-0000-0000-00000000b001' limit 1),
  null,
  '[{"product_id":"aaaaaaaa-0000-0000-0000-000000000001","qty":3}]'::jsonb,
  '[{"method":"cash","amount":600}]'::jsonb,
  '99999999-0000-0000-0000-000000000001') as id;

select is((select total from public.sales where id = (select id from t_sale)), 540.00::numeric, 'sale total = 3 x 180');
select is((select sum(amount) from public.payments where sale_id = (select id from t_sale)), 540.00::numeric,
          'cash payment stored net of change');
select is((select qty from public.stock_levels where product_id = 'aaaaaaaa-0000-0000-0000-000000000001'
             and warehouse_id = (select warehouse_id from public.sales where id = (select id from t_sale))), 7.000::numeric,
          'stock reduced 10 -> 7');
-- idempotent retry returns the same sale
select is(public.pos_create_sale(
  (select branch_id from public.sales where id = (select id from t_sale)),
  (select register_id from public.sales where id = (select id from t_sale)), null,
  '[{"product_id":"aaaaaaaa-0000-0000-0000-000000000001","qty":3}]'::jsonb,
  '[{"method":"cash","amount":600}]'::jsonb, '99999999-0000-0000-0000-000000000001'),
  (select id from t_sale), 'same idempotency key returns the same sale');

-- 7. overselling is rejected and rolls everything back ---------------------------------------------------
select throws_ok($$select public.pos_create_sale(
  (select branch_id from public.sales limit 1), (select register_id from public.sales limit 1), null,
  '[{"product_id":"aaaaaaaa-0000-0000-0000-000000000001","qty":50}]'::jsonb,
  '[{"method":"cash","amount":9000}]'::jsonb)$$, '23514', null, 'overselling is rejected');

-- 8. cashier cannot refund; manager can, and stock is restored ---------------------------------------------
select throws_ok(format($f$select public.pos_refund_sale(%L, '[]'::jsonb, 'test')$f$, (select id from t_sale)),
                 '42501', null, 'cashier cannot refund');
reset role;
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');   -- manager (Main Branch)
select lives_ok($$select public.pos_refund_sale((select id from t_sale),
  (select jsonb_build_array(jsonb_build_object('sale_item_id', id, 'qty', 1)) from public.sale_items
    where sale_id = (select id from t_sale)), 'customer changed mind', 'card', true)$$, 'manager refunds 1 unit by card');
select is((select qty from public.stock_levels where product_id = 'aaaaaaaa-0000-0000-0000-000000000001'
             and warehouse_id = (select warehouse_id from public.sales where id = (select id from t_sale))), 8.000::numeric,
          'refund restocks 1 unit (7 -> 8)');
reset role;

-- 9. the ledger is append-only ----------------------------------------------------------------------------
select throws_ok($$update public.stock_movements set note = 'tamper'$$, '42501', null, 'stock_movements cannot be updated');

select * from finish();
rollback;
