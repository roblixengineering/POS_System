import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime, formatMoney, formatQty } from '@/lib/format';
import { Flash, type FlashParams } from '@/components/flash';
import { PrintButton } from '@/components/print-button';
import { AutoPrint } from '@/components/auto-print';
import { SubmitButton } from '@/components/submit-button';
import { refundSale } from './actions';

export default async function SaleDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams & { print?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission('sales.view_own');
  const supabase = await createClient();

  const { data: sale } = await supabase.from('sales').select('*, branch:branches(name, address)').eq('id', id).maybeSingle();
  if (!sale) notFound();
  const [{ data: items }, { data: payments }, { data: returns }] = await Promise.all([
    supabase.from('sale_items').select('*').eq('sale_id', id).order('product_name'),
    supabase.from('payments').select('method, amount, reference').eq('sale_id', id),
    supabase.from('returns').select('return_no, total, refund_method, reason, created_at').eq('sale_id', id).order('created_at'),
  ]);
  const cur = ctx.business.currency;
  const m = (v: number | string) => formatMoney(v, cur);
  const branch = sale.branch as unknown as { name: string; address: string | null };
  const footer = String(ctx.business.settings.receipt_footer ?? '');
  const refundable = ctx.permissions.has('sales.refund') && sale.status !== 'refunded' && sale.status !== 'void';

  return (
    <>
      {sp.print === '1' && <AutoPrint />}
      <Flash ok={sp.ok} error={sp.error} />
      <div className="card receipt">
        <h2 style={{ textAlign: 'center', marginBottom: 0 }}>{ctx.business.name}</h2>
        <p style={{ textAlign: 'center', margin: 0 }} className="muted">{branch.name}{branch.address ? ` · ${branch.address}` : ''}</p>
        <p>Invoice <b>{sale.invoice_no}</b><br />{formatDateTime(sale.created_at)} · <span className="pill">{String(sale.status).replace('_', ' ')}</span></p>
        <table>
          <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Total</th></tr></thead>
          <tbody>
            {(items ?? []).map((i) => (
              <tr key={i.id}><td>{i.product_name}{Number(i.discount) > 0 && <><br /><small className="muted">discount {m(i.discount)}</small></>}</td>
                <td className="num">{formatQty(i.qty)}</td><td className="num">{m(i.unit_price)}</td><td className="num">{m(i.line_total)}</td></tr>
            ))}
          </tbody>
        </table>
        <table style={{ marginTop: '.5rem' }}><tbody>
          {Number(sale.discount_total) > 0 && <tr><td>Discount</td><td className="num">−{m(sale.discount_total)}</td></tr>}
          {Number(sale.tax_total) > 0 && <tr><td>Tax</td><td className="num">{m(sale.tax_total)}</td></tr>}
          <tr><td><b>Total</b></td><td className="num"><b>{m(sale.total)}</b></td></tr>
          {(payments ?? []).map((p, i) => <tr key={i}><td style={{ textTransform: 'capitalize' }}>Paid · {p.method}</td><td className="num">{m(p.amount)}</td></tr>)}
          {Number(sale.change_due) > 0 && <tr><td>Change</td><td className="num">{m(sale.change_due)}</td></tr>}
          {(returns ?? []).map((r) => <tr key={r.return_no}><td>Refund {r.return_no} ({r.refund_method})</td><td className="num">−{m(r.total)}</td></tr>)}
        </tbody></table>
        {footer && <p style={{ textAlign: 'center' }} className="muted">{footer}</p>}
      </div>
      <PrintButton />

      {refundable && (
        <form action={refundSale} className="card stack noprint" style={{ marginTop: '1.5rem' }}>
          <h2>Refund / return</h2>
          <input type="hidden" name="saleId" value={sale.id} />
          <table>
            <thead><tr><th>Item</th><th className="num">Returnable</th><th>Return qty</th></tr></thead>
            <tbody>
              {(items ?? []).map((i) => {
                const left = Number(i.qty) - Number(i.returned_qty);
                return <tr key={i.id}><td>{i.product_name}</td><td className="num">{formatQty(left)}</td>
                  <td>{left > 0 ? <input type="number" name={`qty_${i.id}`} min="0" max={left} step="any" defaultValue="" style={{ width: '6rem' }} /> : <span className="muted">—</span>}</td></tr>;
              })}
            </tbody>
          </table>
          <div className="row">
            <div><label htmlFor="reason">Reason</label><input id="reason" name="reason" required minLength={3} /></div>
            <div><label htmlFor="method">Refund to</label>
              <select id="method" name="method"><option value="cash">Cash (needs an open shift)</option><option value="card">Card</option><option value="bank">Bank</option><option value="wallet">Wallet</option>{sale.customer_id && <option value="balance">Customer balance</option>}</select></div>
          </div>
          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}><input type="checkbox" name="restock" defaultChecked style={{ width: 'auto' }} /> Return items to stock (untick for damaged goods)</label>
          <SubmitButton className="danger">Issue refund</SubmitButton>
        </form>
      )}
    </>
  );
}
