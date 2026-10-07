import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { formatMoney } from '@/lib/format';
import { Flash, type FlashParams } from '@/components/flash';
import { SubmitButton } from '@/components/submit-button';
import { createSupplier } from './actions';

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const sp = await searchParams;
  const ctx = await requirePermission('suppliers.view');
  const supabase = await createClient();
  const { data } = await supabase.from('suppliers').select('id, name, phone, balance').eq('is_active', true).order('name').limit(200);
  return (
    <>
      <h1>Suppliers</h1>
      <Flash {...sp} />
      {ctx.permissions.has('suppliers.manage') && (
        <form action={createSupplier} className="card row">
          <div><label htmlFor="name">Name</label><input id="name" name="name" required /></div>
          <div><label htmlFor="phone">Phone</label><input id="phone" name="phone" /></div>
          <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" /></div>
          <div className="fit"><SubmitButton>Add</SubmitButton></div>
        </form>
      )}
      <div className="card scroll"><table>
        <thead><tr><th>Name</th><th>Phone</th><th className="num">We owe</th></tr></thead>
        <tbody>{(data ?? []).map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.phone ?? '—'}</td><td className="num">{formatMoney(s.balance, ctx.business.currency)}</td></tr>)}
          {(data ?? []).length === 0 && <tr><td colSpan={3} className="muted">No suppliers yet.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
