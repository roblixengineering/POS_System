-- 0007_rpc_pos.sql
-- Atomic POS operations. Each function is one transaction: invoice + lines + payments + stock movements
-- succeed together or not at all. business_id / warehouse / prices / costs are derived server-side.

create or replace function public.pos_open_session(p_register_id uuid, p_opening_cash numeric default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_biz uuid; v_reg public.registers%rowtype; v_id uuid;
begin
  v_biz := app.require_ctx('cash.manage');
  select * into v_reg from public.registers where id = p_register_id and business_id = v_biz and is_active;
  if not found then raise exception 'register not found'; end if;
  if not app.can_access_branch(v_reg.branch_id) then
    raise exception 'branch access denied' using errcode = '42501';
  end if;
  if p_opening_cash is null or p_opening_cash < 0 then raise exception 'opening cash must be zero or more'; end if;

  insert into public.cash_sessions (business_id, branch_id, register_id, cashier_id, opening_cash)
  values (v_biz, v_reg.branch_id, v_reg.id, auth.uid(), p_opening_cash)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'this register already has an open session';
end $$;

create or replace function public.pos_close_session(p_session_id uuid, p_closing_cash numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_biz uuid; v_s public.cash_sessions%rowtype; v_in numeric; v_out numeric; v_expected numeric;
begin
  v_biz := app.require_ctx('cash.manage');
  select * into v_s from public.cash_sessions
   where id = p_session_id and business_id = v_biz and status = 'open' for update;
  if not found then raise exception 'open session not found'; end if;
  if v_s.cashier_id <> auth.uid() and not app.has_permission('cash.manage_all') then
    raise exception 'permission denied: cash.manage_all' using errcode = '42501';
  end if;
  if not app.can_access_branch(v_s.branch_id) then raise exception 'branch access denied' using errcode = '42501'; end if;
  if p_closing_cash is null or p_closing_cash < 0 then raise exception 'closing cash must be zero or more'; end if;

  select coalesce(sum(amount), 0) into v_in  from public.payments where cash_session_id = v_s.id and method = 'cash';
  select coalesce(sum(total), 0)  into v_out from public.returns  where cash_session_id = v_s.id and refund_method = 'cash';
  v_expected := v_s.opening_cash + v_in - v_out;

  update public.cash_sessions
     set status = 'closed', closed_at = now(), closing_cash = p_closing_cash, expected_cash = v_expected, note = p_note
   where id = v_s.id;
  perform app.write_audit(v_biz, 'cash_session.closed', 'cash_session', v_s.id,
    jsonb_build_object('expected', v_expected, 'counted', p_closing_cash, 'difference', p_closing_cash - v_expected));
  return jsonb_build_object('expected', v_expected, 'counted', p_closing_cash, 'difference', p_closing_cash - v_expected);
end $$;

-- p_items:    [{"product_id": uuid, "qty": n, "discount": n?, "unit_price": n?}]
-- p_payments: [{"method": "cash|card|bank|wallet|credit", "amount": n, "reference": text?}]
create or replace function public.pos_create_sale(
  p_branch_id uuid, p_register_id uuid, p_customer_id uuid,
  p_items jsonb, p_payments jsonb, p_idempotency_key uuid default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_biz uuid; v_branch public.branches%rowtype; v_wh uuid; v_session uuid; v_sale uuid; v_invoice text; v_existing uuid;
  v_item jsonb; v_prod public.products%rowtype;
  v_qty numeric; v_price numeric; v_disc numeric; v_gross numeric; v_net numeric; v_tax numeric; v_line numeric;
  v_subtotal numeric := 0; v_discount numeric := 0; v_tax_total numeric := 0; v_total numeric := 0; v_cogs numeric := 0;
  v_pay jsonb; v_method text; v_amt numeric; v_paid numeric := 0; v_cash numeric := 0;
  v_change numeric; v_change_left numeric; v_applied numeric; v_cut numeric;
  v_customer public.customers%rowtype;
begin
  v_biz := app.require_ctx('sales.create', p_branch_id);

  if p_idempotency_key is not null then
    select id into v_existing from public.sales where business_id = v_biz and idempotency_key = p_idempotency_key;
    if found then return v_existing; end if;   -- safe retry after a dropped connection
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty';
  end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'at least one payment is required';
  end if;

  select * into v_branch from public.branches where id = p_branch_id and business_id = v_biz and is_active;
  if not found then raise exception 'branch not found'; end if;

  if p_register_id is null then raise exception 'a register is required'; end if;
  perform 1 from public.registers where id = p_register_id and branch_id = p_branch_id and business_id = v_biz and is_active;
  if not found then raise exception 'register not found for this branch'; end if;
  select id into v_session from public.cash_sessions
   where register_id = p_register_id and cashier_id = auth.uid() and status = 'open';
  if v_session is null then raise exception 'open a cash session on this register before selling'; end if;

  select id into v_wh from public.warehouses where branch_id = p_branch_id and business_id = v_biz and is_default and is_active;
  if v_wh is null then raise exception 'branch has no default warehouse'; end if;

  if p_customer_id is not null then
    perform 1 from public.customers where id = p_customer_id and business_id = v_biz and is_active;
    if not found then raise exception 'customer not found'; end if;
  end if;

  v_invoice := app.next_doc_no(v_biz, v_branch.code, 'INV');
  insert into public.sales (business_id, branch_id, warehouse_id, register_id, cash_session_id, cashier_id,
                            customer_id, invoice_no, idempotency_key, note)
  values (v_biz, p_branch_id, v_wh, p_register_id, v_session, auth.uid(),
          p_customer_id, v_invoice, p_idempotency_key, p_note)
  returning id into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid quantity'; end if;

    select * into v_prod from public.products
     where id = (v_item ->> 'product_id')::uuid and business_id = v_biz and is_active;
    if not found then raise exception 'product not found or inactive'; end if;

    v_price := coalesce((v_item ->> 'unit_price')::numeric, v_prod.price);
    if v_price < 0 then raise exception 'invalid price'; end if;
    if v_price <> v_prod.price then
      if not app.has_permission('sales.override_price') then
        raise exception 'permission denied: sales.override_price' using errcode = '42501';
      end if;
      perform app.write_audit(v_biz, 'sale.price_override', 'sale', v_sale,
        jsonb_build_object('sku', v_prod.sku, 'list_price', v_prod.price, 'sold_price', v_price));
    end if;

    v_disc := coalesce((v_item ->> 'discount')::numeric, 0);
    if v_disc < 0 then raise exception 'invalid discount'; end if;
    if v_disc > 0 and not app.has_permission('sales.discount') then
      raise exception 'permission denied: sales.discount' using errcode = '42501';
    end if;

    v_gross := round(v_qty * v_price, 2);
    v_disc  := least(v_disc, v_gross);
    v_net   := v_gross - v_disc;
    v_tax   := round(v_net * v_prod.tax_rate / 100, 2);
    v_line  := v_net + v_tax;

    insert into public.sale_items (business_id, sale_id, product_id, product_name, sku, qty, unit_price,
                                   unit_cost, discount, tax_rate, tax_amount, line_total)
    values (v_biz, v_sale, v_prod.id, v_prod.name, v_prod.sku, v_qty, v_price,
            v_prod.cost, v_disc, v_prod.tax_rate, v_tax, v_line);

    if v_prod.track_stock then
      insert into public.stock_movements (business_id, branch_id, warehouse_id, product_id, qty_delta, reason,
                                          reference_type, reference_id, unit_cost, created_by)
      values (v_biz, p_branch_id, v_wh, v_prod.id, -v_qty, 'sale', 'sale', v_sale, v_prod.cost, auth.uid());
    end if;

    v_subtotal  := v_subtotal + v_gross;
    v_discount  := v_discount + v_disc;
    v_tax_total := v_tax_total + v_tax;
    v_total     := v_total + v_line;
    v_cogs      := v_cogs + round(v_qty * v_prod.cost, 2);
  end loop;

  -- Payments: must cover the total; only cash may exceed it (that excess is change).
  for v_pay in select * from jsonb_array_elements(p_payments) loop
    v_method := v_pay ->> 'method';
    v_amt    := (v_pay ->> 'amount')::numeric;
    if v_method is null or v_method not in ('cash', 'card', 'bank', 'wallet', 'credit') then
      raise exception 'invalid payment method';
    end if;
    if v_amt is null or v_amt <= 0 then raise exception 'invalid payment amount'; end if;
    v_paid := v_paid + v_amt;
    if v_method = 'cash' then v_cash := v_cash + v_amt; end if;
  end loop;
  if v_paid < v_total then
    raise exception 'payment (%) is less than the total (%)', v_paid, v_total;
  end if;
  v_change := v_paid - v_total;
  if v_change > v_cash then raise exception 'change can only be given against cash payments'; end if;

  v_change_left := v_change;
  for v_pay in select * from jsonb_array_elements(p_payments) loop
    v_method  := v_pay ->> 'method';
    v_applied := (v_pay ->> 'amount')::numeric;
    if v_method = 'cash' and v_change_left > 0 then
      v_cut := least(v_applied, v_change_left);
      v_applied := v_applied - v_cut;
      v_change_left := v_change_left - v_cut;
    end if;
    if v_applied > 0 then
      if v_method = 'credit' then
        if p_customer_id is null then raise exception 'credit sales require a customer'; end if;
        select * into v_customer from public.customers where id = p_customer_id for update;
        if v_customer.balance + v_applied > v_customer.credit_limit then
          raise exception 'credit limit exceeded for %', v_customer.name;
        end if;
        update public.customers set balance = balance + v_applied where id = p_customer_id;
      end if;
      insert into public.payments (business_id, branch_id, sale_id, cash_session_id, method, amount, reference)
      values (v_biz, p_branch_id, v_sale, v_session, v_method, v_applied, nullif(trim(coalesce(v_pay ->> 'reference', '')), ''));
    end if;
  end loop;

  update public.sales
     set subtotal = v_subtotal, discount_total = v_discount, tax_total = v_tax_total, total = v_total,
         paid_total = v_total, change_due = v_change, cogs_total = v_cogs
   where id = v_sale;
  return v_sale;
end $$;

-- p_items: [{"sale_item_id": uuid, "qty": n}]
create or replace function public.pos_refund_sale(
  p_sale_id uuid, p_items jsonb, p_reason text, p_refund_method text default 'cash', p_restock boolean default true
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_biz uuid; v_sale public.sales%rowtype; v_code text; v_item jsonb; v_si public.sale_items%rowtype;
  v_rq numeric; v_remaining numeric; v_line numeric; v_tax numeric; v_ret uuid; v_track boolean;
  v_total numeric := 0; v_tax_total numeric := 0; v_cogs numeric := 0; v_session uuid;
begin
  v_biz := app.require_ctx('sales.refund');
  select * into v_sale from public.sales where id = p_sale_id and business_id = v_biz for update;
  if not found then raise exception 'sale not found'; end if;
  if not app.can_access_branch(v_sale.branch_id) then raise exception 'branch access denied' using errcode = '42501'; end if;
  if v_sale.status = 'void' then raise exception 'sale is void'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'a refund reason is required'; end if;
  if p_refund_method not in ('cash', 'card', 'bank', 'wallet', 'balance') then raise exception 'invalid refund method'; end if;
  if p_refund_method = 'balance' and v_sale.customer_id is null then
    raise exception 'refund to customer balance requires a customer on the sale';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'select at least one item to return';
  end if;

  select id into v_session from public.cash_sessions
   where cashier_id = auth.uid() and branch_id = v_sale.branch_id and status = 'open' limit 1;
  if p_refund_method = 'cash' and v_session is null then
    raise exception 'open a cash session to pay out a cash refund';
  end if;

  select code into v_code from public.branches where id = v_sale.branch_id;
  insert into public.returns (business_id, branch_id, sale_id, cash_session_id, return_no, reason,
                              refund_method, restocked, created_by)
  values (v_biz, v_sale.branch_id, v_sale.id, case when p_refund_method = 'cash' then v_session end,
          app.next_doc_no(v_biz, v_code, 'RET'), trim(p_reason), p_refund_method, p_restock, auth.uid())
  returning id into v_ret;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_si from public.sale_items
     where id = (v_item ->> 'sale_item_id')::uuid and sale_id = v_sale.id for update;
    if not found then raise exception 'sale line not found'; end if;
    v_rq := (v_item ->> 'qty')::numeric;
    v_remaining := v_si.qty - v_si.returned_qty;
    if v_rq is null or v_rq <= 0 or v_rq > v_remaining then
      raise exception 'invalid return quantity for "%" (max %)', v_si.product_name, v_remaining;
    end if;

    if v_rq = v_remaining then   -- final return of this line: refund exactly what is left (no rounding drift)
      v_line := v_si.line_total - coalesce((select sum(line_total) from public.return_items where sale_item_id = v_si.id), 0);
      v_tax  := v_si.tax_amount - coalesce((select sum(tax_amount)  from public.return_items where sale_item_id = v_si.id), 0);
    else
      v_line := round(v_si.line_total * v_rq / v_si.qty, 2);
      v_tax  := round(v_si.tax_amount * v_rq / v_si.qty, 2);
    end if;

    insert into public.return_items (business_id, return_id, sale_item_id, product_id, qty, unit_cost, tax_amount, line_total)
    values (v_biz, v_ret, v_si.id, v_si.product_id, v_rq, v_si.unit_cost, v_tax, v_line);
    update public.sale_items set returned_qty = returned_qty + v_rq where id = v_si.id;

    select track_stock into v_track from public.products where id = v_si.product_id;
    if p_restock and v_track then
      insert into public.stock_movements (business_id, branch_id, warehouse_id, product_id, qty_delta, reason,
                                          reference_type, reference_id, unit_cost, created_by)
      values (v_biz, v_sale.branch_id, v_sale.warehouse_id, v_si.product_id, v_rq, 'sale_return', 'return', v_ret,
              v_si.unit_cost, auth.uid());
    end if;

    v_total := v_total + v_line;
    v_tax_total := v_tax_total + v_tax;
    v_cogs := v_cogs + round(v_rq * v_si.unit_cost, 2);
  end loop;

  update public.returns set total = v_total, tax_total = v_tax_total, cogs_reversed = v_cogs where id = v_ret;
  update public.sales
     set status = case when exists (select 1 from public.sale_items where sale_id = v_sale.id and returned_qty < qty)
                       then 'partially_refunded' else 'refunded' end
   where id = v_sale.id;
  if p_refund_method = 'balance' then
    update public.customers set balance = balance - v_total where id = v_sale.customer_id;
  end if;

  perform app.write_audit(v_biz, 'sale.refund', 'return', v_ret,
    jsonb_build_object('sale', v_sale.invoice_no, 'amount', v_total, 'method', p_refund_method, 'restocked', p_restock, 'reason', p_reason));
  return v_ret;
end $$;

select app.harden_public_functions();
