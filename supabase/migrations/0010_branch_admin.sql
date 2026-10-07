-- 0010_branch_admin.sql
-- Atomic branch creation: branch + default warehouse + first register in one transaction.

create or replace function public.admin_create_branch(
  p_name text, p_code text, p_address text default null, p_timezone text default 'Asia/Karachi'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_biz uuid; v_id uuid;
begin
  v_biz := app.require_ctx('branches.manage');
  insert into public.branches (business_id, code, name, address, timezone)
  values (v_biz, upper(trim(p_code)), trim(p_name), nullif(trim(coalesce(p_address, '')), ''), p_timezone)
  returning id into v_id;
  insert into public.warehouses (business_id, branch_id, name, is_default) values (v_biz, v_id, 'Main Store', true);
  insert into public.registers (business_id, branch_id, name) values (v_biz, v_id, 'Register 1');
  perform app.write_audit(v_biz, 'branch.created', 'branch', v_id, jsonb_build_object('code', upper(trim(p_code)), 'name', p_name));
  return v_id;
exception when unique_violation then
  raise exception 'a branch with this code already exists';
end $$;

select app.harden_public_functions();
