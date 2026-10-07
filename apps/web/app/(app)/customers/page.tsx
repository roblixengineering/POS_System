import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { formatMoney } from '@/lib/format';
import { Flash, type FlashParams } from '@/components/flash';
import { SubmitButton } from '@/components/submit-button';
import { createCustomer } from './actions';

export default async function CustomersPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const sp = await searchParams;
  const ctx = await requirePermission('customers.view');
  const supabase = await createClient();
  const { data } = await supabase.from('customers').select('id, name, phone, email, credit_limit, balance').eq('is_active', true).order('name').limit(200);
  return (
    <>
      <h1>Customers</h1>
      <Flash {...sp} />
      {ctx.permissions.has('customers.manage') && (
        <form action={createCustomer} className="card row">
          <div><label htmlFor="name">Name</label><input id="name" name="name" required /></div>
          <div><label htmlFor="phone">Phone</label><input id="phone" name="phone" /></div>
          <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" /></div>
          <div><label htmlFor="creditLimit">Credit limit</label><input id="creditLimit" name="creditLimit" type="number" min="0" step="0.01" defaultValue="0" /></div>
          <div className="fit"><SubmitButton>Add</SubmitButton></div>
        </form>
      )}
      <div className="card scroll"><table>
        <thead><tr><th>Name</th><th>Phone</th><th className="num">Credit limit</th><th className="num">Owes us</th></tr></thead>
        <tbody>{(data ?? []).map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.phone ?? '—'}</td><td className="num">{formatMoney(c.credit_limit, ctx.business.currency)}</td><td className="num">{formatMoney(c.balance, ctx.business.currency)}</td></tr>)}
          {(data ?? []).length === 0 && <tr><td colSpan={4} className="muted">No customers yet.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
