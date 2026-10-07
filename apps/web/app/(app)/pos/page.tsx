import { pickBranch, requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Flash, type FlashParams } from '@/components/flash';
import { SubmitButton } from '@/components/submit-button';
import { PosClient } from './pos-client';
import { closeShift, openShift } from './actions';

export default async function PosPage({ searchParams }: { searchParams: Promise<FlashParams & { branch?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission('sales.create');
  const branch = pickBranch(ctx, sp.branch);
  if (!branch) return <><h1>POS</h1><p className="sub">You are not assigned to any branch. Ask an administrator.</p></>;

  const supabase = await createClient();
  const [{ data: registers }, { data: session }, { data: customers }] = await Promise.all([
    supabase.from('registers').select('id, name').eq('branch_id', branch.id).eq('is_active', true).order('name'),
    supabase.from('cash_sessions').select('id, register_id, opening_cash, opened_at').eq('cashier_id', ctx.userId).eq('branch_id', branch.id).eq('status', 'open').maybeSingle(),
    ctx.permissions.has('customers.view')
      ? supabase.from('customers').select('id, name, balance, credit_limit').eq('is_active', true).order('name').limit(200)
      : Promise.resolve({ data: [] as { id: string; name: string; balance: number; credit_limit: number }[] }),
  ]);

  return (
    <>
      <h1>POS — {branch.name}</h1>
      <Flash {...sp} />
      {ctx.branches.length > 1 && (
        <form className="row noprint" style={{ maxWidth: 360, marginBottom: '1rem' }}>
          <div><label htmlFor="branch">Branch</label>
            <select id="branch" name="branch" defaultValue={branch.id}>{ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div className="fit"><button className="ghost">Switch</button></div>
        </form>
      )}

      {!session ? (
        <form action={openShift} className="card stack" style={{ maxWidth: 420 }}>
          <h2>Open your shift</h2>
          <input type="hidden" name="branchId" value={branch.id} />
          <div><label htmlFor="registerId">Register</label>
            <select id="registerId" name="registerId" required>{(registers ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div><label htmlFor="openingCash">Opening cash in drawer</label><input id="openingCash" name="openingCash" type="number" min="0" step="0.01" defaultValue="0" required /></div>
          <SubmitButton>Open shift</SubmitButton>
        </form>
      ) : (
        <>
          <PosClient
            branchId={branch.id}
            registerId={session.register_id}
            currency={ctx.business.currency}
            customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name, available: Number(c.credit_limit) - Number(c.balance) }))}
            canDiscount={ctx.permissions.has('sales.discount')}
          />
          <form action={closeShift} className="card row noprint" style={{ marginTop: '1.5rem' }}>
            <input type="hidden" name="branchId" value={branch.id} />
            <input type="hidden" name="sessionId" value={session.id} />
            <div><label htmlFor="closingCash">End of shift: counted cash in drawer</label><input id="closingCash" name="closingCash" type="number" min="0" step="0.01" required /></div>
            <div className="fit"><SubmitButton className="ghost">Close shift</SubmitButton></div>
          </form>
        </>
      )}
    </>
  );
}
