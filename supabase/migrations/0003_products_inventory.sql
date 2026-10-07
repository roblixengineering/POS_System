-- 0003_products_inventory.sql
-- Catalog, parties and the event-sourced inventory ledger.

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null default app.current_business_id() references public.businesses(id),
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (business_id, name)
);

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null default app.current_business_id() references public.businesses(id),
  category_id   uuid references public.categories(id),
  sku           text not null check (length(trim(sku)) > 0),
  barcode       text,
  name          text not null check (length(trim(name)) > 0),
  unit          text not null default 'pcs',
  cost          numeric(14,4) not null default 0 check (cost >= 0),
  price         numeric(14,2) not null default 0 check (price >= 0),
  tax_rate      numeric(5,2)  not null default 0 check (tax_rate between 0 and 100),
  reorder_level numeric(14,3) not null default 0 check (reorder_level >= 0),
  track_stock   boolean not null default true,
  is_active     boolean not null default true,
  image_path    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, sku),
  unique (id, business_id)
);
create unique index products_barcode_uq on public.products (business_id, barcode) where barcode is not null;
create index products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);
create trigger products_updated before update on public.products for each row execute function app.set_updated_at();

create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null default app.current_business_id() references public.businesses(id),
  name         text not null,
  phone        text,
  email        text,
  address      text,
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  balance      numeric(14,2) not null default 0,  -- amount the customer owes us
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (id, business_id)
);

create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null default app.current_business_id() references public.businesses(id),
  name        text not null,
  phone       text,
  email       text,
  address     text,
  balance     numeric(14,2) not null default 0,  -- amount we owe the supplier
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (id, business_id)
);

-- Inventory ledger: every stock change is an immutable movement ----------------------------------
create table public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id),
  branch_id      uuid not null references public.branches(id),
  warehouse_id   uuid not null references public.warehouses(id),
  product_id     uuid not null references public.products(id),
  qty_delta      numeric(14,3) not null check (qty_delta <> 0),
  reason         text not null check (reason in (
                   'purchase_received','sale','sale_return','damage','transfer_out',
                   'transfer_in','adjustment','count_correction','opening_stock')),
  reference_type text,
  reference_id   uuid,
  unit_cost      numeric(14,4),
  note           text,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (warehouse_id, product_id, created_at desc);
create index stock_movements_ref_idx on public.stock_movements (reference_type, reference_id);
create trigger stock_movements_append_only before update or delete on public.stock_movements
  for each row execute function app.forbid_mutation();

-- Cached current stock, maintained ONLY by the trigger below (no client write access).
create table public.stock_levels (
  warehouse_id uuid not null references public.warehouses(id),
  product_id   uuid not null references public.products(id),
  business_id  uuid not null references public.businesses(id),
  branch_id    uuid not null references public.branches(id),
  qty          numeric(14,3) not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (warehouse_id, product_id)
);
create index stock_levels_branch_idx on public.stock_levels (business_id, branch_id);
create index stock_levels_product_idx on public.stock_levels (product_id);

create or replace function app.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_qty numeric; v_allow boolean; v_name text;
begin
  -- The upsert row-locks stock_levels, so concurrent sales serialise per (warehouse, product).
  insert into public.stock_levels as sl (warehouse_id, product_id, business_id, branch_id, qty)
  values (new.warehouse_id, new.product_id, new.business_id, new.branch_id, new.qty_delta)
  on conflict (warehouse_id, product_id)
  do update set qty = sl.qty + excluded.qty, updated_at = now()
  returning sl.qty into v_qty;

  if v_qty < 0 then
    select coalesce((b.settings ->> 'allow_negative_stock')::boolean, false) into v_allow
      from public.businesses b where b.id = new.business_id;
    if not v_allow then
      select p.name into v_name from public.products p where p.id = new.product_id;
      raise exception 'insufficient stock for "%" (short by %)', v_name, abs(v_qty) using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger stock_movements_apply after insert on public.stock_movements
  for each row execute function app.apply_stock_movement();
