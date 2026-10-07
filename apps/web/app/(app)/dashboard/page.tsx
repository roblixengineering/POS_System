import Link from 'next/link';
import { getContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { today } from '@/lib/format';
import { Flash, type FlashParams } from '@/components/flash';
import { LiveRefresh } from '@/components/live-refresh';
import { ReportView } from '@/components/report-view';
import { formatQty } from '@/lib/format';
import type { ReportSummary } from '@/types/models';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<FlashParams & { branch?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();

  // Staff without reporting access (e.g. cashiers) get a simple landing page instead of a redirect loop.
  if (!ctx.permissions.has('reports.view')) {
    return (
      <>
        <h1>Welcome, {ctx.fullName}</h1>
        <Flash {...sp} />
        <p className="sub">{ctx.roleName}</p>
        {ctx.permissions.has('sales.create') && <Link className="btn" href="/pos">Open the POS</Link>}
      </>
    );
  }

  const supabase = await createClient();
  const branch = ctx.branches.find((b) => b.id === sp.branch)?.id ?? null;
  const t = today();
  const { data, error } = await supabase.rpc('report_summary', { p_from: t, p_to: t, p_branch_id: branch });
  const { data: low } = await supabase.from('v_low_stock').select('*').order('qty').limit(8);

  return (
    <>
      <LiveRefresh tables={['sales', 'stock_levels']} />
      <h1>Dashboard</h1>
      <p className="sub">Today across {branch ? 'the selected branch' : 'all your branches'}. Updates live.</p>
      <Flash {...sp} error={sp.error ?? error?.message} />
      <form className="row noprint" style={{ marginBottom: '1rem', maxWidth: 360 }}>
        <div>
          <label htmlFor="branch">Branch</label>
          <select id="branch" name="branch" defaultValue={branch ?? ''}>
            <option value="">All branches</option>
            {ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="fit"><button className="ghost">Apply</button></div>
      </form>
      {data && <ReportView r={data as ReportSummary} currency={ctx.business.currency} />}
      <section className="card scroll">
        <h2>Low stock</h2>
        <table>
          <thead><tr><th>Product</th><th>Branch / location</th><th className="num">On hand</th><th className="num">Minimum</th></tr></thead>
          <tbody>
            {(low ?? []).map((l) => (
              <tr key={`${l.warehouse_id}-${l.product_id}`}>
                <td>{l.product_name}</td><td>{l.branch_name} / {l.warehouse_name}</td>
                <td className="num"><span className="pill warn">{formatQty(l.qty)}</span></td><td className="num">{formatQty(l.reorder_level)}</td>
              </tr>
            ))}
            {(low ?? []).length === 0 && <tr><td colSpan={4} className="muted">Nothing is low right now.</td></tr>}
          </tbody>
        </table>
        {ctx.permissions.has('inventory.receive') && <p className="muted">Suggested actions: <Link href="/purchases">receive stock</Link> or <Link href="/inventory/transfers">transfer from another branch</Link>.</p>}
      </section>
    </>
  );
}
