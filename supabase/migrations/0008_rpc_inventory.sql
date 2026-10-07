-- 0008_rpc_inventory.sql
-- Receiving, adjustments and branch transfers. All stock changes create stock_movements.

-- p_items: [{"product_id": uuid, "qty": n, "unit_cost": n}]
create or replace function public.inv_receive_stock(
  p_branch_id uuid, p_warehouse_id uuid, p_supplier_id uuid, p_delivery_ref text,
  p_received_at timestamptz, p_items jsonb, p_amount_paid numeric default 0, p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_biz uuid; v_branch public.branches%rowtype; v_pid uuid; v_no text; v_item jsonb; v_prod public.products%rowtype;
  v_qty numeric; v_cost numeric; v_line numeric; v_total numeric := 0;
begin
  v_biz := app.require_ctx('inventory.receive', p_branch_id);
  select * into v_branch from public.branches where id = p_branch_id and business_id = v_biz and is_active;
  if not found then raise exception 'branch not found'; end if;
  perform 1 from public.warehouses where id = p_warehouse_id and branch_id = p_branch_id and business_id = v_biz and is_active;
  if not found then raise exception 'warehouse not found for this branch'; end if;
  if p_supplier_id is not null then
    perform 1 from public.suppliers where id = p_supplier_id and business_id = v_biz and is_active;
    if not found then raise exception 'supplier not found'; end if;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'add at least one product to receive';
  end if;

  v_no := app.next_doc_no(v_biz, v_branch.code, 'PUR');
  insert into public.purchases (business_id, branch_id, warehouse_id, supplier_id, purchase_no, delivery_ref,
                                received_at, notes, created_by)
  values (v_biz, p_branch_id, p_warehouse_id, p_supplier_id, v_no, nullif(trim(coalesce(p_delivery_ref, '')), ''),
          coalesce(p_received_at, now()), p_notes, auth.uid())
  returning id into v_pid;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty  := (v_item ->> 'qty')::numeric;
    v_cost := (v_item ->> 'unit_cost')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid quantity'; end if;
    if v_cost is null or v_cost < 0 then raise exception 'invalid unit cost'; end if;
    select * into v_prod from public.products where id = (v_item ->> 'product_id')::uuid and business_id = v_biz and is_active;
    if not found then raise exception 'product not found or inactive'; end if;

    v_line := round(v_qty * v_cost, 2);
    insert into public.purchase_items (business_id, purchase_id, product_id, qty, unit_cost, line_total)
    values (v_biz, v_pid, v_prod.id, v_qty, v_cost, v_line);
    insert into public.stock_movements (business_id, branch_id, warehouse_id, product_id, qty_delta, reason,
                                        reference_type, reference_id, unit_cost, created_by)
    values (v_biz, p_branch_id, p_warehouse_id, v_prod.id, v_qty, 'purchase_received', 'purchase', v_pid, v_cost, auth.uid());
    -- Last-purchase-cost policy (change to weighted average here if your business needs it). Audited by trigger.
    if v_prod.cost is distinct from v_cost then
      update public.products set cost = v_cost where id = v_prod.id;
    end if;
    v_total := v_total + v_line;
  end loop;

  if p_amount_paid is null or p_amount_paid < 0 or p_amount_paid > v_total then
    raise exception 'amount paid must be between 0 and the purchase total (%)', v_total;
  end if;
  update public.purchases set total = v_total, amount_paid = p_amount_paid where id = v_pid;
  if p_supplier_id is not null and v_total - p_amount_paid <> 0 then
    update public.suppliers set balance = balance + (v_total - p_amount_paid) where id = p_supplier_id;
  end if;

  perform app.write_audit(v_biz, 'purchase.received', 'purchase', v_pid,
    jsonb_build_object('purchase_no', v_no, 'delivery_ref', p_delivery_ref, 'total', v_total));
  return v_pid;
exception when unique_violation then
  raise exception 'this delivery reference was already received from this supplier';
end $$;

create or replace function public.inv_adjust_stock(
  p_warehouse_id uuid, p_product_id uuid, p_qty_delta numeric, p_reason text, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_biz uuid; v_wh public.warehouses%rowtype; v_id uuid; v_cost numeric;
begin
  v_biz := app.require_ctx('inventory.adjust');
  select * into v_wh from public.warehouses where id = p_warehouse_id and business_id = v_biz and is_active;
  if not found then raise exception 'warehouse not found'; end if;
  if not app.can_access_branch(v_wh.branch_id) then raise exception 'branch access denied' using errcode = '42501'; end if;
  select cost into v_cost from public.products where id = p_product_id and business_id = v_biz and is_active;
  if not found then raise exception 'product not found or inactive'; end if;
  if p_reason is null or p_reason not in ('damage', 'adjustment', 'count_correction', 'opening_stock') then
    raise exception 'invalid adjustment reason';
  end if;
  if p_qty_delta is null or p_qty_delta = 0 then raise exception 'quantity change cannot be zero'; end if;
  if p_reason in ('damage') and p_qty_delta > 0 then raise exception 'damage must reduce stock'; end if;
  if p_reason = 'opening_stock' and p_qty_delta < 0 then raise exception 'opening stock must be positive'; end if;
  if p_note is null or length(trim(p_note)) < 3 then raise exception 'a note is required for adjustments'; end if;

  insert into public.stock_movements (business_id, branch_id, warehouse_id, product_id, qty_delta, reason,
                                      reference_type, unit_cost, note, created_by)
  values (v_biz, v_wh.branch_id, v_wh.id, p_product_id, p_qty_delta, p_reason, 'adjustment', v_cost, trim(p_note), auth.uid())
  returning id into v_id;
  perform app.write_audit(v_biz, 'stock.adjusted', 'stock_movement', v_id,
    jsonb_build_object('product', p_product_id, 'warehouse', p_warehouse_id, 'delta', p_qty_delta, 'reason', p_reason, 'note', p_note));
  return v_id;
end $$;

-- p_items: [{"product_id": uuid, "qty": n}]
create or replace function public.inv_create_transfer(
  p_from_warehouse uuid, p_to_warehouse uuid, p_items jsonb, p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_biz uuid; v_from public.warehouses%rowtype; v_id uuid; v_item jsonb; v_qty numeric;
begin
  v_biz := app.require_ctx('inventory.transfer');
  select * into v_from from public.warehouses where id = p_from_warehouse and business_id = v_biz and is_active;
  if not found then raise exception 'source warehouse not found'; end if;
  perform 1 from public.warehouses where id = p_to_warehouse and business_id = v_biz and is_active;
  if not found then raise exception 'destination warehouse not found'; end if;
  if p_from_warehouse = p_to_warehouse then raise exception 'source and destination must differ'; end if;
  if not app.can_access_branch(v_from.branch_id) then raise exception 'branch access denied' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'add at least one product to transfer';
  end if;

  insert into public.stock_transfers (business_id, transfer_no, from_warehouse_id, to_warehouse_id, notes, created_by)
  values (v_biz, app.next_doc_no(v_biz, 'ALL', 'TRF'), p_from_warehouse, p_to_warehouse, p_notes, auth.uid())
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid quantity'; end if;
    perform 1 from public.products where id = (v_item ->> 'product_id')::uuid and business_id = v_biz and is_active;
    if not found then raise exception 'product not found or inactive'; end if;
    insert into public.transfer_items (business_id, transfer_id, product_id, qty)
    values (v_biz, v_id, (v_item ->> 'product_id')::uuid, v_qty);
  end loop;

  perform app.write_audit(v_biz, 'transfer.created', 'transfer', v_id, jsonb_build_object('from', p_from_warehouse, 'to', p_to_warehouse));
  return v_id;
end $$;

-- Single entry point for the state machine: draft -> approved -> completed (or cancelled).
create or replace function public.inv_transition_transfer(p_transfer_id uuid, p_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_biz uuid; v_t public.stock_transfers%rowtype; v_from public.warehouses%rowtype; v_to public.warehouses%rowtype; i record;
begin
  if p_action not in ('approve', 'complete', 'cancel') then raise exception 'invalid action'; end if;
  v_biz := app.require_ctx(case when p_action = 'cancel' then 'inventory.transfer' else 'inventory.transfer_approve' end);
  select * into v_t from public.stock_transfers where id = p_transfer_id and business_id = v_biz for update;
  if not found then raise exception 'transfer not found'; end if;
  select * into v_from from public.warehouses where id = v_t.from_warehouse_id;
  select * into v_to   from public.warehouses where id = v_t.to_warehouse_id;

  if p_action = 'approve' then
    if v_t.status <> 'draft' then raise exception 'only draft transfers can be approved'; end if;
    if not app.can_access_branch(v_from.branch_id) then raise exception 'branch access denied' using errcode = '42501'; end if;
    update public.stock_transfers set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = v_t.id;

  elsif p_action = 'complete' then
    if v_t.status <> 'approved' then raise exception 'only approved transfers can be completed'; end if;
    if not (app.can_access_branch(v_from.branch_id) or app.can_access_branch(v_to.branch_id)) then
      raise exception 'branch access denied' using errcode = '42501';
    end if;
    for i in select ti.product_id, ti.qty, p.cost from public.transfer_items ti join public.products p on p.id = ti.product_id
              where ti.transfer_id = v_t.id loop
      insert into public.stock_movements (business_id, branch_id, warehouse_id, product_id, qty_delta, reason,
                                          reference_type, reference_id, unit_cost, created_by)
      values (v_biz, v_from.branch_id, v_from.id, i.product_id, -i.qty, 'transfer_out', 'transfer', v_t.id, i.cost, auth.uid());
      insert into public.stock_movements (business_id, branch_id, warehouse_id, product_id, qty_delta, reason,
                                          reference_type, reference_id, unit_cost, created_by)
      values (v_biz, v_to.branch_id, v_to.id, i.product_id, i.qty, 'transfer_in', 'transfer', v_t.id, i.cost, auth.uid());
    end loop;
    update public.stock_transfers set status = 'completed', completed_by = auth.uid(), completed_at = now() where id = v_t.id;

  else
    if v_t.status not in ('draft', 'approved') then raise exception 'this transfer can no longer be cancelled'; end if;
    if not app.can_access_branch(v_from.branch_id) then raise exception 'branch access denied' using errcode = '42501'; end if;
    update public.stock_transfers set status = 'cancelled' where id = v_t.id;
  end if;

  perform app.write_audit(v_biz, 'transfer.' || p_action, 'transfer', v_t.id, jsonb_build_object('transfer_no', v_t.transfer_no));
  return (select status from public.stock_transfers where id = v_t.id);
end $$;

select app.harden_public_functions();
