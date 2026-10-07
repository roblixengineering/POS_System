-- 0004_sales_payments.sql
-- Cash sessions, invoices, lines, payments, returns.

create table public.cash_sessions (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id),
  branch_id     uuid not null references public.branches(id),
  register_id   uuid not null references public.registers(id),
  cashier_id    uuid not null references public.profiles(id),
  status        text not null default 'open' check (status in ('open', 'closed')),
  opening_cash  numeric(14,2) not null default 0 check (opening_cash >= 0),
  closing_cash  numeric(14,2),
  expected_cash numeric(14,2),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  note          text
);
create unique index cash_sessions_one_open_per_register on public.cash_sessions (register_id) where status = 'open';

create table public.sales (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id),
  branch_id       uuid not null references public.branches(id),
  warehouse_id    uuid not null references public.warehouses(id),
  register_id     uuid references public.registers(id),
  cash_session_id uuid references public.cash_sessions(id),
  cashier_id      uuid not null references public.profiles(id),
  customer_id     uuid references public.customers(id),
  invoice_no      text not null,
  status          text not null default 'completed'
                  check (status in ('completed', 'partially_refunded', 'refunded', 'void')),
  subtotal        numeric(14,2) not null default 0,   -- sum of qty * unit_price
  discount_total  numeric(14,2) not null default 0,
  tax_total       numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,   -- subtotal - discount + tax
  paid_total      numeric(14,2) not null default 0,
  change_due      numeric(14,2) not null default 0,
  cogs_total      numeric(14,2) not null default 0,   -- recorded product cost at time of sale
  idempotency_key uuid,
  note            text,
  created_at      timestamptz not null default now(),
  unique (business_id, invoice_no),
  unique (business_id, idempotency_key)
);
create index sales_branch_time_idx on public.sales (business_id, branch_id, created_at desc);
create trigger sales_no_delete before delete on public.sales for each row execute function app.forbid_mutation();

create table public.sale_items (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id),
  sale_id       uuid not null references public.sales(id),
  product_id    uuid not null references public.products(id),
  product_name  text not null,   -- snapshots: invoices never change when the catalog does
  sku           text not null,
  qty           numeric(14,3) not null check (qty > 0),
  unit_price    numeric(14,2) not null check (unit_price >= 0),
  unit_cost     numeric(14,4) not null default 0,
  discount      numeric(14,2) not null default 0 check (discount >= 0),
  tax_rate      numeric(5,2)  not null default 0,
  tax_amount    numeric(14,2) not null default 0,
  line_total    numeric(14,2) not null,
  returned_qty  numeric(14,3) not null default 0 check (returned_qty >= 0 and returned_qty <= qty)
);
create index sale_items_sale_idx on public.sale_items (sale_id);

-- Only returned_qty may change on a sale line; everything else is immutable.
create or replace function app.sale_items_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'sale lines cannot be deleted' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'returned_qty') is distinct from (to_jsonb(old) - 'returned_qty') then
    raise exception 'sale lines are immutable (only returned_qty may change)' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger sale_items_guard before update or delete on public.sale_items
  for each row execute function app.sale_items_guard();

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id),
  branch_id       uuid not null references public.branches(id),
  sale_id         uuid not null references public.sales(id),
  cash_session_id uuid references public.cash_sessions(id),
  method          text not null check (method in ('cash', 'card', 'bank', 'wallet', 'credit')),
  amount          numeric(14,2) not null check (amount > 0),
  reference       text,
  created_at      timestamptz not null default now()
);
create index payments_sale_idx on public.payments (sale_id);
create trigger payments_append_only before update or delete on public.payments
  for each row execute function app.forbid_mutation();

create table public.returns (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id),
  branch_id       uuid not null references public.branches(id),
  sale_id         uuid not null references public.sales(id),
  cash_session_id uuid references public.cash_sessions(id),
  return_no       text not null,
  reason          text not null,
  refund_method   text not null check (refund_method in ('cash', 'card', 'bank', 'wallet', 'balance')),
  restocked       boolean not null default true,
  total           numeric(14,2) not null default 0,   -- refund amount incl. tax
  tax_total       numeric(14,2) not null default 0,
  cogs_reversed   numeric(14,2) not null default 0,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  unique (business_id, return_no)
);
create trigger returns_no_delete before delete on public.returns for each row execute function app.forbid_mutation();

create table public.return_items (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id),
  return_id    uuid not null references public.returns(id),
  sale_item_id uuid not null references public.sale_items(id),
  product_id   uuid not null references public.products(id),
  qty          numeric(14,3) not null check (qty > 0),
  unit_cost    numeric(14,4) not null default 0,
  tax_amount   numeric(14,2) not null default 0,
  line_total   numeric(14,2) not null
);
create trigger return_items_append_only before update or delete on public.return_items
  for each row execute function app.forbid_mutation();
