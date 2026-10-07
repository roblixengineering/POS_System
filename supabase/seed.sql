-- seed.sql — DEVELOPMENT / DEMO DATA ONLY. Never run against production.
-- Logins (password for all: Password123!):
--   owner@demo.test   (Owner)
--   manager@demo.test (Branch Manager, Main Branch)
--   cashier@demo.test (Cashier, Main Branch)
--   owner@rival.test  (Rival tenant, used for isolation tests)


-- ============================================================
-- DEMO AUTH USERS
-- ============================================================

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id,
  'authenticated',
  'authenticated',
  u.email,
  extensions.crypt(
    'Password123!',
    extensions.gen_salt('bf')
  ),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '',
  '',
  '',
  ''
from (
  values
    (
      '11111111-1111-1111-1111-111111111111'::uuid,
      'owner@demo.test'
    ),
    (
      '22222222-2222-2222-2222-222222222222'::uuid,
      'cashier@demo.test'
    ),
    (
      '33333333-3333-3333-3333-333333333333'::uuid,
      'manager@demo.test'
    ),
    (
      '44444444-4444-4444-4444-444444444444'::uuid,
      'owner@rival.test'
    )
) as u(id, email);


-- ============================================================
-- DEMO AUTH IDENTITIES
-- ============================================================

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email
  ),
  'email',
  u.id::text,
  now(),
  now(),
  now()
from (
  values
    (
      '11111111-1111-1111-1111-111111111111'::uuid,
      'owner@demo.test'
    ),
    (
      '22222222-2222-2222-2222-222222222222'::uuid,
      'cashier@demo.test'
    ),
    (
      '33333333-3333-3333-3333-333333333333'::uuid,
      'manager@demo.test'
    ),
    (
      '44444444-4444-4444-4444-444444444444'::uuid,
      'owner@rival.test'
    )
) as u(id, email);


-- ============================================================
-- TENANT 1: DEMO TRADERS
-- ============================================================

select app.create_business_internal(
  '11111111-1111-1111-1111-111111111111',
  'Demo Traders',
  'PKR',
  'Demo Owner',
  'Main Branch',
  'MB',
  'aaaaaaaa-0000-0000-0000-00000000b001'
);


-- ============================================================
-- BRANCHES
-- ============================================================

insert into public.branches (
  business_id,
  code,
  name,
  address
)
values
  (
    'aaaaaaaa-0000-0000-0000-00000000b001',
    'DHA',
    'DHA Branch',
    'DHA Phase 5'
  ),
  (
    'aaaaaaaa-0000-0000-0000-00000000b001',
    'JT',
    'Johar Branch',
    'Johar Town'
  );


-- ============================================================
-- WAREHOUSES
-- ============================================================

insert into public.warehouses (
  business_id,
  branch_id,
  name,
  is_default
)
select
  b.business_id,
  b.id,
  'Main Store',
  true
from public.branches b
where b.business_id = 'aaaaaaaa-0000-0000-0000-00000000b001'
  and b.code in ('DHA', 'JT');


insert into public.warehouses (
  business_id,
  branch_id,
  name,
  is_default
)
select
  b.business_id,
  b.id,
  'Back Warehouse',
  false
from public.branches b
where b.business_id = 'aaaaaaaa-0000-0000-0000-00000000b001'
  and b.code = 'MB';


-- ============================================================
-- REGISTERS
-- ============================================================

insert into public.registers (
  business_id,
  branch_id,
  name
)
select
  b.business_id,
  b.id,
  'Register 1'
from public.branches b
where b.business_id = 'aaaaaaaa-0000-0000-0000-00000000b001'
  and b.code in ('DHA', 'JT');


-- ============================================================
-- DEMO CASHIER PROFILE
-- ============================================================

insert into public.profiles (
  id,
  business_id,
  role_id,
  full_name
)
select
  '22222222-2222-2222-2222-222222222222',
  r.business_id,
  r.id,
  'Demo Cashier'
from public.roles r
where r.business_id = 'aaaaaaaa-0000-0000-0000-00000000b001'
  and r.code = 'cashier';


-- ============================================================
-- DEMO MANAGER PROFILE
-- ============================================================

insert into public.profiles (
  id,
  business_id,
  role_id,
  full_name
)
select
  '33333333-3333-3333-3333-333333333333',
  r.business_id,
  r.id,
  'Demo Manager'
from public.roles r
where r.business_id = 'aaaaaaaa-0000-0000-0000-00000000b001'
  and r.code = 'branch_manager';


-- ============================================================
-- BRANCH USERS
-- ============================================================

insert into public.branch_users (
  user_id,
  branch_id,
  business_id
)
select
  u,
  b.id,
  b.business_id
from public.branches b,
(
  values
    ('22222222-2222-2222-2222-222222222222'::uuid),
    ('33333333-3333-3333-3333-333333333333'::uuid)
) as x(u)
where b.business_id = 'aaaaaaaa-0000-0000-0000-00000000b001'
  and b.code = 'MB';


-- ============================================================
-- CATEGORIES
-- ============================================================

insert into public.categories (
  business_id,
  name
)
values
  (
    'aaaaaaaa-0000-0000-0000-00000000b001',
    'Beverages'
  ),
  (
    'aaaaaaaa-0000-0000-0000-00000000b001',
    'Snacks'
  ),
  (
    'aaaaaaaa-0000-0000-0000-00000000b001',
    'Grocery'
  );


-- ============================================================
-- PRODUCTS
-- ============================================================

insert into public.products (
  id,
  business_id,
  category_id,
  sku,
  barcode,
  name,
  cost,
  price,
  tax_rate,
  reorder_level
)
select
  v.id::uuid,
  'aaaaaaaa-0000-0000-0000-00000000b001',
  c.id,
  v.sku,
  v.barcode,
  v.name,
  v.cost,
  v.price,
  v.tax,
  v.reorder
from (
  values
    (
      'aaaaaaaa-0000-0000-0000-000000000001',
      'COKE15',
      '8964000000011',
      'Coca Cola 1.5L',
      140,
      180,
      0,
      10,
      'Beverages'
    ),
    (
      'aaaaaaaa-0000-0000-0000-000000000002',
      'PEPSI15',
      '8964000000028',
      'Pepsi 1.5L',
      135,
      175,
      0,
      10,
      'Beverages'
    ),
    (
      'aaaaaaaa-0000-0000-0000-000000000003',
      'WATER15',
      '8964000000035',
      'Water 1.5L',
      55,
      80,
      0,
      20,
      'Beverages'
    ),
    (
      'aaaaaaaa-0000-0000-0000-000000000004',
      'LAYS50',
      '8964000000042',
      'Lays Classic 50g',
      60,
      90,
      0,
      12,
      'Snacks'
    ),
    (
      'aaaaaaaa-0000-0000-0000-000000000005',
      'BISC01',
      '8964000000059',
      'Digestive Biscuits',
      70,
      110,
      0,
      10,
      'Snacks'
    ),
    (
      'aaaaaaaa-0000-0000-0000-000000000006',
      'RICE5K',
      '8964000000066',
      'Basmati Rice 5kg',
      1450,
      1750,
      0,
      5,
      'Grocery'
    ),
    (
      'aaaaaaaa-0000-0000-0000-000000000007',
      'OIL1L',
      '8964000000073',
      'Cooking Oil 1L',
      420,
      520,
      0,
      8,
      'Grocery'
    ),
    (
      'aaaaaaaa-0000-0000-0000-000000000008',
      'SOAP01',
      '8964000000080',
      'Bath Soap',
      90,
      130,
      17,
      10,
      'Grocery'
    )
) as v(
  id,
  sku,
  barcode,
  name,
  cost,
  price,
  tax,
  reorder,
  cat
)
join public.categories c
  on c.business_id = 'aaaaaaaa-0000-0000-0000-00000000b001'
 and c.name = v.cat;


-- ============================================================
-- CUSTOMERS
-- ============================================================

insert into public.customers (
  business_id,
  name,
  phone,
  credit_limit
)
values
  (
    'aaaaaaaa-0000-0000-0000-00000000b001',
    'Walk-in Regular',
    '0300-0000001',
    5000
  );


-- ============================================================
-- SUPPLIERS
-- ============================================================

insert into public.suppliers (
  business_id,
  name,
  phone
)
values
  (
    'aaaaaaaa-0000-0000-0000-00000000b001',
    'XYZ Distributor',
    '0300-0000002'
  );


-- ============================================================
-- OPENING STOCK
-- ============================================================
-- Stock is created through ledger movements.
-- stock_levels should never be written directly.
--
-- Coca Cola 1.5L:
-- Main Branch      = 10
-- DHA Branch       = 0
-- Johar Branch     = 24
-- Back Warehouse   = 80

insert into public.stock_movements (
  business_id,
  branch_id,
  warehouse_id,
  product_id,
  qty_delta,
  reason,
  unit_cost,
  note
)
select
  w.business_id,
  w.branch_id,
  w.id,
  p.id,

  case
    when b.code = 'MB'
      and w.is_default
      and p.sku = 'COKE15'
      then 10

    when b.code = 'JT'
      and p.sku = 'COKE15'
      then 24

    when b.code = 'MB'
      and not w.is_default
      and p.sku = 'COKE15'
      then 80

    when b.code = 'DHA'
      and p.sku = 'COKE15'
      then 0

    when b.code = 'DHA'
      then 15

    when w.is_default
      then 40

    else 0
  end,

  'opening_stock',
  p.cost,
  'seed'

from public.warehouses w

join public.branches b
  on b.id = w.branch_id

cross join public.products p

where w.business_id = 'aaaaaaaa-0000-0000-0000-00000000b001'
  and p.business_id = w.business_id

  and case
    when b.code = 'MB'
      and w.is_default
      and p.sku = 'COKE15'
      then 10

    when b.code = 'JT'
      and p.sku = 'COKE15'
      then 24

    when b.code = 'MB'
      and not w.is_default
      and p.sku = 'COKE15'
      then 80

    when b.code = 'DHA'
      and p.sku = 'COKE15'
      then 0

    when b.code = 'DHA'
      then 15

    when w.is_default
      then 40

    else 0
  end <> 0;


-- ============================================================
-- TENANT 2: RIVAL MART
-- Used to verify tenant isolation.
-- ============================================================

select app.create_business_internal(
  '44444444-4444-4444-4444-444444444444',
  'Rival Mart',
  'PKR',
  'Rival Owner',
  'Rival Main',
  'RM',
  'bbbbbbbb-0000-0000-0000-00000000b002'
);


-- ============================================================
-- RIVAL PRODUCT
-- ============================================================

insert into public.products (
  id,
  business_id,
  sku,
  name,
  cost,
  price
)
values (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-00000000b002',
  'RIVAL01',
  'Rival Cola',
  100,
  150
);