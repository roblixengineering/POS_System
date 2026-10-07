import Link from 'next/link';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime, formatMoney } from '@/lib/format';
import { Flash, type FlashParams } from '@/components/flash';

export default async function SalesPage({ searchParams }: { searchParams: Promise<FlashParams & { branch?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission('sales.view_own');
  const supabase = await createClient();
  let q = supabase.from('sales').select('id, invoice_no, created_at, total, status, branch:branches(name)').order('created_at', { ascending: false }).limit(100);
  if (sp.branch) q = q.eq('branch_id', sp.branch);
  const { data } = await q;

  return (
    <>
      <h1>Sales</h1>
      <p className="sub">Most recent 100 invoices you are allowed to see.</p>
      <Flash {...sp} />
      <form className="row noprint" style={{ maxWidth: 360, marginBottom: '1rem' }}>
        <div><label htmlFor="branch">Branch</label>
          <select id="branch" name="branch" defaultValue={sp.branch ?? ''}><option value="">All</option>{ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div className="fit"><button className="ghost">Filter</button></div>
      </form>
      <div className="card scroll">
        <table>
          <thead><tr><th>Invoice</th><th>Date</th><th>Branch</th><th>Status</th><th className="num">Total</th></tr></thead>
          <tbody>
            {(data ?? []).map((s) => (
              <tr key={s.id}>
                <td><Link href={`/sales/${s.id}`}>{s.invoice_no}</Link></td>
                <td>{formatDateTime(s.created_at)}</td>
                <td>{(s.branch as unknown as { name: string } | null)?.name}</td>
                <td><span className={`pill ${s.status === 'completed' ? '' : 'warn'}`}>{s.status.replace('_', ' ')}</span></td>
                <td className="num">{formatMoney(s.total, ctx.business.currency)}</td>
              </tr>
            ))}
            {(data ?? []).length === 0 && <tr><td colSpan={5} className="muted">No sales yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
