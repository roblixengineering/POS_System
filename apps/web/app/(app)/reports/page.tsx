import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { daysAgo, today } from '@/lib/format';
import { Flash, type FlashParams } from '@/components/flash';
import { ReportView } from '@/components/report-view';
import type { ReportSummary } from '@/types/models';

type SP = FlashParams & { from?: string; to?: string; branch?: string };
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requirePermission('reports.view');
  const from = isDate(sp.from) ? sp.from! : daysAgo(29);
  const to = isDate(sp.to) ? sp.to! : today();
  const branch = ctx.branches.find((b) => b.id === sp.branch)?.id ?? null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('report_summary', { p_from: from, p_to: to, p_branch_id: branch });

  return (
    <>
      <h1>Reports</h1>
      <p className="sub">Sales, profit, expenses and branch comparison for a date range.</p>
      <Flash {...sp} error={sp.error ?? error?.message} />
      <form className="card row noprint">
        <div><label htmlFor="from">From</label><input id="from" type="date" name="from" defaultValue={from} /></div>
        <div><label htmlFor="to">To</label><input id="to" type="date" name="to" defaultValue={to} /></div>
        <div>
          <label htmlFor="branch">Branch</label>
          <select id="branch" name="branch" defaultValue={branch ?? ''}>
            <option value="">All branches</option>
            {ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="fit"><button>Run report</button></div>
      </form>
      {data && <ReportView r={data as ReportSummary} currency={ctx.business.currency} />}
    </>
  );
}
