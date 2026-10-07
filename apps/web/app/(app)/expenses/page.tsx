import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { formatMoney, today } from '@/lib/format';
import { Flash, type FlashParams } from '@/components/flash';
import { SubmitButton } from '@/components/submit-button';
import { createExpense } from './actions';

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const sp = await searchParams;
  const ctx = await requirePermission('expenses.view');
  const supabase = await createClient();
  const { data } = await supabase.from('expenses').select('id, category, description, amount, expense_date, payment_method, branch:branches(name)').order('expense_date', { ascending: false }).limit(100);
  return (
    <>
      <h1>Expenses</h1>
      <Flash {...sp} />
      {ctx.permissions.has('expenses.manage') && (
        <form action={createExpense} className="card stack">
          <div className="row">
            <div><label htmlFor="branchId">Branch</label><select id="branchId" name="branchId" required>{ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <div><label htmlFor="category">Category</label><input id="category" name="category" list="cats" required /><datalist id="cats"><option value="Rent" /><option value="Utilities" /><option value="Salaries" /><option value="Transport" /><option value="Maintenance" /></datalist></div>
            <div><label htmlFor="amount">Amount</label><input id="amount" name="amount" type="number" min="0.01" step="0.01" required /></div>
            <div><label htmlFor="expenseDate">Date</label><input id="expenseDate" name="expenseDate" type="date" defaultValue={today()} required /></div>
            <div><label htmlFor="paymentMethod">Paid by</label><select id="paymentMethod" name="paymentMethod"><option>cash</option><option>card</option><option>bank</option><option>wallet</option></select></div>
          </div>
          <div><label htmlFor="description">Description</label><input id="description" name="description" /></div>
          <SubmitButton>Record expense</SubmitButton>
        </form>
      )}
      <div className="card scroll"><table>
        <thead><tr><th>Date</th><th>Branch</th><th>Category</th><th>Description</th><th className="num">Amount</th></tr></thead>
        <tbody>{(data ?? []).map((e) => <tr key={e.id}><td>{e.expense_date}</td><td>{(e.branch as unknown as { name: string })?.name}</td><td>{e.category}</td><td>{e.description ?? '—'}</td><td className="num">{formatMoney(e.amount, ctx.business.currency)}</td></tr>)}
          {(data ?? []).length === 0 && <tr><td colSpan={5} className="muted">No expenses recorded.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
