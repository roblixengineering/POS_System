-- 0005_purchases_transfers_expenses.sql

create table public.purchases (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id),
  branch_id     uuid not null references public.branches(id),
  warehouse_id  uuid not null references public.warehouses(id),
  supplier_id   uuid references public.suppliers(id),
  purchase_no   text not null,
  delivery_ref  text,           -- truck / delivery reference
  received_at   timestamptz not null default now(),
  status        text not null default 'received' check (status in ('received')),
  total         numeric(14,2) not null default 0,
  amount_paid   numeric(14,2) not null default 0 check (amount_paid >= 0),
  notes         text,
  created_by    uuid not null,
  created_at    timestamptz not null default now(),
  unique (business_id, purchase_no)
);
-- The same truck/delivery cannot be received twice from the same supplier.
create unique index purchases_delivery_uq on public.purchases (business_id, supplier_id, delivery_ref)
  where delivery_ref is not null and supplier_id is not null;
create trigger purchases_no_delete before delete on public.purchases for each row execute function app.forbid_mutation();

create table public.purchase_items (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  purchase_id uuid not null references public.purchases(id),
  product_id  uuid not null references public.products(id),
  qty         numeric(14,3) not null check (qty > 0),
  unit_cost   numeric(14,4) not null check (unit_cost >= 0),
  line_total  numeric(14,2) not null
);
create trigger purchase_items_append_only before update or delete on public.purchase_items
  for each row execute function app.forbid_mutation();

create table public.stock_transfers (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id),
  transfer_no       text not null,
  from_warehouse_id uuid not null references public.warehouses(id),
  to_warehouse_id   uuid not null references public.warehouses(id),
  status            text not null default 'draft' check (status in ('draft', 'approved', 'completed', 'cancelled')),
  notes             text,
  created_by        uuid not null,
  approved_by       uuid,
  completed_by      uuid,
  created_at        timestamptz not null default now(),
  approved_at       timestamptz,
  completed_at      timestamptz,
  check (from_warehouse_id <> to_warehouse_id),
  unique (business_id, transfer_no)
);

create table public.transfer_items (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  transfer_id uuid not null references public.stock_transfers(id),
  product_id  uuid not null references public.products(id),
  qty         numeric(14,3) not null check (qty > 0)
);
create index transfer_items_transfer_idx on public.transfer_items (transfer_id);

create table public.expenses (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null default app.current_business_id() references public.businesses(id),
  branch_id      uuid not null references public.branches(id),
  category       text not null,
  description    text,
  amount         numeric(14,2) not null check (amount > 0),
  expense_date   date not null default current_date,
  payment_method text not null default 'cash',
  created_by     uuid not null default auth.uid(),
  created_at     timestamptz not null default now()
);
create index expenses_branch_date_idx on public.expenses (business_id, branch_id, expense_date);
-- No client UPDATE/DELETE policies exist for expenses; corrections go through an admin and are audited.
