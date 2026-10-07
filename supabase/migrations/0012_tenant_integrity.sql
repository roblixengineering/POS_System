-- 0012_tenant_integrity.sql
-- Enforce tenant ownership at the database FK layer, not only inside RPCs/RLS policies.

-- Tables referenced together with business_id need matching composite uniqueness.
alter table public.categories add constraint categories_id_business_uq unique (id, business_id);
alter table public.roles add constraint roles_id_business_uq unique (id, business_id);
alter table public.profiles add constraint profiles_id_business_uq unique (id, business_id);
alter table public.cash_sessions add constraint cash_sessions_id_business_uq unique (id, business_id);
alter table public.sales add constraint sales_id_business_uq unique (id, business_id);
alter table public.sale_items add constraint sale_items_id_business_uq unique (id, business_id);
alter table public.purchases add constraint purchases_id_business_uq unique (id, business_id);
alter table public.stock_transfers add constraint stock_transfers_id_business_uq unique (id, business_id);

-- Remove unscoped references where the child row already carries business_id.
alter table public.branch_users drop constraint if exists branch_users_branch_id_fkey;
alter table public.branch_users
  add constraint branch_users_branch_business_fkey
  foreign key (branch_id, business_id) references public.branches(id, business_id);

alter table public.products drop constraint if exists products_category_id_fkey;
alter table public.products
  add constraint products_category_business_fkey
  foreign key (category_id, business_id) references public.categories(id, business_id);

alter table public.stock_movements drop constraint if exists stock_movements_branch_id_fkey;
alter table public.stock_movements drop constraint if exists stock_movements_warehouse_id_fkey;
alter table public.stock_movements drop constraint if exists stock_movements_product_id_fkey;
alter table public.stock_movements
  add constraint stock_movements_branch_business_fkey
  foreign key (branch_id, business_id) references public.branches(id, business_id);
alter table public.stock_movements
  add constraint stock_movements_warehouse_business_fkey
  foreign key (warehouse_id, business_id) references public.warehouses(id, business_id);
alter table public.stock_movements
  add constraint stock_movements_product_business_fkey
  foreign key (product_id, business_id) references public.products(id, business_id);

alter table public.stock_levels drop constraint if exists stock_levels_warehouse_id_fkey;
alter table public.stock_levels drop constraint if exists stock_levels_product_id_fkey;
alter table public.stock_levels drop constraint if exists stock_levels_branch_id_fkey;
alter table public.stock_levels
  add constraint stock_levels_warehouse_business_fkey
  foreign key (warehouse_id, business_id) references public.warehouses(id, business_id);
alter table public.stock_levels
  add constraint stock_levels_product_business_fkey
  foreign key (product_id, business_id) references public.products(id, business_id);
alter table public.stock_levels
  add constraint stock_levels_branch_business_fkey
  foreign key (branch_id, business_id) references public.branches(id, business_id);

alter table public.cash_sessions drop constraint if exists cash_sessions_branch_id_fkey;
alter table public.cash_sessions drop constraint if exists cash_sessions_register_id_fkey;
alter table public.cash_sessions drop constraint if exists cash_sessions_cashier_id_fkey;
alter table public.cash_sessions
  add constraint cash_sessions_branch_business_fkey
  foreign key (branch_id, business_id) references public.branches(id, business_id);
alter table public.cash_sessions
  add constraint cash_sessions_register_business_fkey
  foreign key (register_id, business_id) references public.registers(id, business_id);
alter table public.cash_sessions
  add constraint cash_sessions_cashier_business_fkey
  foreign key (cashier_id, business_id) references public.profiles(id, business_id);

alter table public.sales drop constraint if exists sales_branch_id_fkey;
alter table public.sales drop constraint if exists sales_warehouse_id_fkey;
alter table public.sales drop constraint if exists sales_register_id_fkey;
alter table public.sales drop constraint if exists sales_cashier_id_fkey;
alter table public.sales drop constraint if exists sales_customer_id_fkey;
alter table public.sales
  add constraint sales_branch_business_fkey
  foreign key (branch_id, business_id) references public.branches(id, business_id);
alter table public.sales
  add constraint sales_warehouse_business_fkey
  foreign key (warehouse_id, business_id) references public.warehouses(id, business_id);
alter table public.sales
  add constraint sales_register_business_fkey
  foreign key (register_id, business_id) references public.registers(id, business_id);
alter table public.sales
  add constraint sales_cashier_business_fkey
  foreign key (cashier_id, business_id) references public.profiles(id, business_id);
alter table public.sales
  add constraint sales_customer_business_fkey
  foreign key (customer_id, business_id) references public.customers(id, business_id);

alter table public.sale_items drop constraint if exists sale_items_sale_id_fkey;
alter table public.sale_items drop constraint if exists sale_items_product_id_fkey;
alter table public.sale_items
  add constraint sale_items_sale_business_fkey
  foreign key (sale_id, business_id) references public.sales(id, business_id);
alter table public.sale_items
  add constraint sale_items_product_business_fkey
  foreign key (product_id, business_id) references public.products(id, business_id);

alter table public.payments drop constraint if exists payments_branch_id_fkey;
alter table public.payments drop constraint if exists payments_sale_id_fkey;
alter table public.payments drop constraint if exists payments_cash_session_id_fkey;
alter table public.payments
  add constraint payments_branch_business_fkey
  foreign key (branch_id, business_id) references public.branches(id, business_id);
alter table public.payments
  add constraint payments_sale_business_fkey
  foreign key (sale_id, business_id) references public.sales(id, business_id);
alter table public.payments
  add constraint payments_cash_session_business_fkey
  foreign key (cash_session_id, business_id) references public.cash_sessions(id, business_id);

alter table public.purchases drop constraint if exists purchases_branch_id_fkey;
alter table public.purchases drop constraint if exists purchases_warehouse_id_fkey;
alter table public.purchases drop constraint if exists purchases_supplier_id_fkey;
alter table public.purchases
  add constraint purchases_branch_business_fkey
  foreign key (branch_id, business_id) references public.branches(id, business_id);
alter table public.purchases
  add constraint purchases_warehouse_business_fkey
  foreign key (warehouse_id, business_id) references public.warehouses(id, business_id);
alter table public.purchases
  add constraint purchases_supplier_business_fkey
  foreign key (supplier_id, business_id) references public.suppliers(id, business_id);

alter table public.purchase_items drop constraint if exists purchase_items_purchase_id_fkey;
alter table public.purchase_items drop constraint if exists purchase_items_product_id_fkey;
alter table public.purchase_items
  add constraint purchase_items_purchase_business_fkey
  foreign key (purchase_id, business_id) references public.purchases(id, business_id);
alter table public.purchase_items
  add constraint purchase_items_product_business_fkey
  foreign key (product_id, business_id) references public.products(id, business_id);

alter table public.stock_transfers drop constraint if exists stock_transfers_from_warehouse_id_fkey;
alter table public.stock_transfers drop constraint if exists stock_transfers_to_warehouse_id_fkey;
alter table public.stock_transfers
  add constraint stock_transfers_from_warehouse_business_fkey
  foreign key (from_warehouse_id, business_id) references public.warehouses(id, business_id);
alter table public.stock_transfers
  add constraint stock_transfers_to_warehouse_business_fkey
  foreign key (to_warehouse_id, business_id) references public.warehouses(id, business_id);

alter table public.transfer_items drop constraint if exists transfer_items_transfer_id_fkey;
alter table public.transfer_items drop constraint if exists transfer_items_product_id_fkey;
alter table public.transfer_items
  add constraint transfer_items_transfer_business_fkey
  foreign key (transfer_id, business_id) references public.stock_transfers(id, business_id);
alter table public.transfer_items
  add constraint transfer_items_product_business_fkey
  foreign key (product_id, business_id) references public.products(id, business_id);

alter table public.returns add constraint returns_id_business_uq unique (id, business_id);
alter table public.return_items add constraint return_items_id_business_uq unique (id, business_id);
alter table public.returns drop constraint if exists returns_branch_id_fkey;
alter table public.returns drop constraint if exists returns_sale_id_fkey;
alter table public.returns drop constraint if exists returns_cash_session_id_fkey;
alter table public.returns
  add constraint returns_branch_business_fkey
  foreign key (branch_id, business_id) references public.branches(id, business_id);
alter table public.returns
  add constraint returns_sale_business_fkey
  foreign key (sale_id, business_id) references public.sales(id, business_id);
alter table public.returns
  add constraint returns_cash_session_business_fkey
  foreign key (cash_session_id, business_id) references public.cash_sessions(id, business_id);

alter table public.return_items drop constraint if exists return_items_return_id_fkey;
alter table public.return_items drop constraint if exists return_items_sale_item_id_fkey;
alter table public.return_items drop constraint if exists return_items_product_id_fkey;
alter table public.return_items
  add constraint return_items_return_business_fkey
  foreign key (return_id, business_id) references public.returns(id, business_id);
alter table public.return_items
  add constraint return_items_sale_item_business_fkey
  foreign key (sale_item_id, business_id) references public.sale_items(id, business_id);
alter table public.return_items
  add constraint return_items_product_business_fkey
  foreign key (product_id, business_id) references public.products(id, business_id);

alter table public.expenses drop constraint if exists expenses_branch_id_fkey;
alter table public.expenses
  add constraint expenses_branch_business_fkey
  foreign key (branch_id, business_id) references public.branches(id, business_id);

alter table public.branch_users drop constraint if exists branch_users_user_id_fkey;
alter table public.branch_users
  add constraint branch_users_user_business_fkey
  foreign key (user_id, business_id) references public.profiles(id, business_id);

alter table public.profiles drop constraint if exists profiles_role_id_fkey;
alter table public.profiles
  add constraint profiles_role_business_fkey
  foreign key (role_id, business_id) references public.roles(id, business_id);
