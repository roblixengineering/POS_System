-- 0011_audit_export.sql
-- Data exports are sensitive: record who exported what.
create or replace function public.audit_export(p_table text, p_rows int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_biz uuid;
begin
  v_biz := app.require_ctx('data.export');
  perform app.write_audit(v_biz, 'data.exported', 'export', null, jsonb_build_object('table', p_table, 'rows', p_rows));
end $$;

select app.harden_public_functions();
