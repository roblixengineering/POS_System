import { formatMoney } from '@/lib/format';
import type { ReportSummary } from '@/types/models';

export function ReportView({ r, currency }: { r: ReportSummary; currency: string }) {
  const m = (v: number | null) => (v === null ? '—' : formatMoney(v, currency));
  return (
    <>
      <div className="kpis">
        <div className="kpi"><span>Net sales</span><b>{m(r.net_sales)}</b></div>
        <div className="kpi"><span>Transactions</span><b>{r.transactions}</b></div>
        <div className="kpi"><span>Cost of goods</span><b>{m(r.cost_of_goods)}</b></div>
        <div className="kpi"><span>Gross profit</span><b>{m(r.gross_profit)}</b></div>
        <div className="kpi"><span>Expenses</span><b>{m(r.expenses)}</b></div>
        <div className="kpi"><span>Net result (estimate)</span><b>{m(r.net_result)}</b></div>
        <div className={`kpi ${r.low_stock > 0 ? 'warn' : ''}`}><span>Low-stock lines</span><b>{r.low_stock}</b></div>
      </div>
      <p className="muted" style={{ marginTop: '-.25rem' }}>
        Management estimates from recorded sales, product cost and expenses — not a formal accounting statement.
      </p>
      <div className="grid g2">
        <section className="card scroll">
          <h2>Branch performance</h2>
          <table>
            <thead><tr><th>Branch</th><th className="num">Sales</th><th className="num">Profit</th><th className="num">Txns</th></tr></thead>
            <tbody>
              {r.branches.map((b) => (
                <tr key={b.id}><td>{b.name}</td><td className="num">{m(b.net_sales)}</td><td className="num">{m(b.gross_profit)}</td><td className="num">{b.transactions}</td></tr>
              ))}
              {r.branches.length === 0 && <tr><td colSpan={4} className="muted">No data</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="card scroll">
          <h2>Top products</h2>
          <table>
            <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Revenue</th></tr></thead>
            <tbody>
              {r.top_products.map((p) => (
                <tr key={p.product_id}><td>{p.product_name}</td><td className="num">{Number(p.qty)}</td><td className="num">{m(Number(p.revenue))}</td></tr>
              ))}
              {r.top_products.length === 0 && <tr><td colSpan={3} className="muted">No sales in this period</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="card scroll">
          <h2>Payment mix</h2>
          <table>
            <tbody>
              {r.payment_mix.map((p) => (
                <tr key={p.method}><td style={{ textTransform: 'capitalize' }}>{p.method}</td><td className="num">{m(Number(p.amount))}</td></tr>
              ))}
              {r.payment_mix.length === 0 && <tr><td className="muted">No payments</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
