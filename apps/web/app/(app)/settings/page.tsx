import { getContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import { Flash, type FlashParams } from '@/components/flash';
import { SubmitButton } from '@/components/submit-button';
import { addStaff, saveSettings, updateStaff } from './actions';

const ROLES = [['branch_manager', 'Branch Manager'], ['cashier', 'Cashier'], ['inventory_manager', 'Inventory Manager'], ['accountant', 'Accountant'], ['business_admin', 'Business Admin']];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.permissions.has('users.view')) return <p>No access.</p>;
  const supabase = await createClient();
  const canManage = ctx.permissions.has('users.manage');
  const [{ data: staff }, { data: links }, { data: audit }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, status, role:roles(code, name)').order('full_name'),
    supabase.from('branch_users').select('user_id, branch_id'),
    ctx.permissions.has('audit.view') ? supabase.from('audit_logs').select('id, action, created_at, details').order('created_at', { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
  ]);
  const assigned = (uid: string) => new Set((links ?? []).filter((l) => l.user_id === uid).map((l) => l.branch_id as string));

  return (
    <>
      <h1>Staff &amp; settings</h1>
      <Flash {...sp} />
      {canManage && (
        <form action={addStaff} className="card stack">
          <h2>Add staff login</h2>
          <div className="row">
            <div><label htmlFor="fullName">Full name</label><input id="fullName" name="fullName" required /></div>
            <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" required /></div>
            <div><label htmlFor="password">Temporary password (10+)</label><input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
            <div><label htmlFor="roleCode">Role</label><select id="roleCode" name="roleCode">{ROLES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></div>
          </div>
          <fieldset style={{ border: 0, padding: 0 }}><legend className="muted">Branch access (not needed for business-wide roles)</legend>
            {ctx.allBranches.map((b) => <label key={b.id} style={{ display: 'inline-flex', gap: '.3rem', marginRight: '1rem' }}><input type="checkbox" name="branchIds" value={b.id} style={{ width: 'auto' }} />{b.name}</label>)}</fieldset>
          <SubmitButton>Create login</SubmitButton>
        </form>
      )}
      <div className="card scroll">
        <h2>Team</h2>
        <table><thead><tr><th>Name</th><th>Role</th><th>Status</th>{canManage && <th>Change access</th>}</tr></thead>
          <tbody>{(staff ?? []).map((s) => {
            const role = s.role as unknown as { code: string; name: string }; const mine = assigned(s.id);
            return (<tr key={s.id}><td>{s.full_name}</td><td>{role.name}</td><td><span className={`pill ${s.status === 'active' ? '' : 'bad'}`}>{s.status}</span></td>
              {canManage && <td>{s.id === ctx.userId || role.code === 'owner' ? <span className="muted">—</span> : (
                <form action={updateStaff} className="row" style={{ alignItems: 'center' }}>
                  <input type="hidden" name="userId" value={s.id} />
                  <select name="roleCode" defaultValue={role.code} aria-label="Role">{ROLES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
                  <select name="status" defaultValue={s.status} aria-label="Status"><option>active</option><option>disabled</option></select>
                  <span>{ctx.allBranches.map((b) => <label key={b.id} style={{ display: 'inline-flex', gap: '.25rem', marginRight: '.6rem' }}><input type="checkbox" name="branchIds" value={b.id} defaultChecked={mine.has(b.id)} style={{ width: 'auto' }} />{b.name}</label>)}</span>
                  <div className="fit"><SubmitButton className="ghost">Save</SubmitButton></div>
                </form>)}</td>}</tr>);
          })}</tbody></table>
      </div>
      {ctx.permissions.has('settings.manage') && (
        <form action={saveSettings} className="card stack">
          <h2>Business settings</h2>
          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}><input type="checkbox" name="allow_negative_stock" defaultChecked={ctx.business.settings.allow_negative_stock === true} style={{ width: 'auto' }} /> Allow selling below zero stock (not recommended)</label>
          <div><label htmlFor="receipt_footer">Receipt footer</label><input id="receipt_footer" name="receipt_footer" defaultValue={String(ctx.business.settings.receipt_footer ?? '')} /></div>
          <SubmitButton>Save settings</SubmitButton>
        </form>
      )}
      {ctx.permissions.has('data.export') && (
        <div className="card"><h2>Export your data (CSV)</h2>
          <p>{['products', 'customers', 'suppliers', 'sales', 'stock_levels', 'expenses'].map((t) => <a key={t} className="btn ghost" style={{ marginRight: '.5rem' }} href={`/api/export/${t}`}>{t}</a>)}</p></div>
      )}
      {(audit ?? []).length > 0 && (
        <div className="card scroll"><h2>Recent audit log</h2><table><tbody>
          {(audit ?? []).map((a) => <tr key={a.id}><td>{formatDateTime(a.created_at)}</td><td>{a.action}</td><td className="muted"><code>{JSON.stringify(a.details).slice(0, 140)}</code></td></tr>)}
        </tbody></table></div>
      )}
    </>
  );
}
