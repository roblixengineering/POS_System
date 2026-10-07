import { getContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime, formatQty } from '@/lib/format';
import { getProductOptions, getWarehouses } from '@/lib/data';
import { Flash, type FlashParams } from '@/components/flash';
import { SubmitButton } from '@/components/submit-button';
import { createTransfer, transitionTransfer } from '../actions';

export default async function TransfersPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.permissions.has('inventory.view')) return <p>No access.</p>;
  const supabase = await createClient();
  const { data: transfers } = await supabase.from('stock_transfers')
    .select('id, transfer_no, status, created_at, from_wh:warehouses!stock_transfers_from_warehouse_id_fkey(name, branch:branches(name)), to_wh:warehouses!stock_transfers_to_warehouse_id_fkey(name, branch:branches(name)), items:transfer_items(qty, product:products(name))')
    .order('created_at', { ascending: false }).limit(50);
  const canCreate = ctx.permissions.has('inventory.transfer');
  const canApprove = ctx.permissions.has('inventory.transfer_approve');
  const [warehouses, products] = canCreate ? await Promise.all([getWarehouses(supabase), getProductOptions(supabase)]) : [[], []];
  const label = (w: unknown) => { const x = w as { name: string; branch: { name: string } }; return `${x.branch?.name} — ${x.name}`; };

  const Btn = ({ id, action, text, danger }: { id: string; action: string; text: string; danger?: boolean }) => (
    <form action={transitionTransfer} style={{ display: 'inline' }}><input type="hidden" name="id" value={id} /><input type="hidden" name="action" value={action} />
      <button className={danger ? 'ghost' : ''} style={{ marginRight: '.4rem' }}>{text}</button></form>
  );

  return (
    <>
      <h1>Branch transfers</h1>
      <p className="sub">Draft → Approved → Completed. Stock moves only when a transfer is completed.</p>
      <Flash {...sp} />
      <div className="card scroll">
        <table>
          <thead><tr><th>No.</th><th>From → To</th><th>Items</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(transfers ?? []).map((t) => (
              <tr key={t.id}>
                <td>{t.transfer_no}<br /><small className="muted">{formatDateTime(t.created_at)}</small></td>
                <td>{label(t.from_wh)} → {label(t.to_wh)}</td>
                <td>{(t.items as unknown as { qty: number; product: { name: string } }[]).map((i, k) => <div key={k}>{i.product.name} × {formatQty(i.qty)}</div>)}</td>
                <td><span className={`pill ${t.status === 'completed' ? '' : 'warn'}`}>{t.status}</span></td>
                <td>
                  {canApprove && t.status === 'draft' && <Btn id={t.id} action="approve" text="Approve" />}
                  {canApprove && t.status === 'approved' && <Btn id={t.id} action="complete" text="Complete" />}
                  {canCreate && (t.status === 'draft' || t.status === 'approved') && <Btn id={t.id} action="cancel" text="Cancel" danger />}
                </td>
              </tr>
            ))}
            {(transfers ?? []).length === 0 && <tr><td colSpan={5} className="muted">No transfers yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {canCreate && (
        <form action={createTransfer} className="card stack">
          <h2>New transfer</h2>
          <div className="row">
            <div><label htmlFor="fromWarehouseId">From</label><select id="fromWarehouseId" name="fromWarehouseId" required>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
            <div><label htmlFor="toWarehouseId">To</label><select id="toWarehouseId" name="toWarehouseId" required>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div className="row" key={i}>
              <div><label htmlFor={`row_product_${i}`}>Product {i + 1}</label>
                <select id={`row_product_${i}`} name={`row_product_${i}`}><option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label htmlFor={`row_qty_${i}`}>Quantity</label><input id={`row_qty_${i}`} name={`row_qty_${i}`} type="number" min="0" step="any" /></div>
            </div>
          ))}
          <div><label htmlFor="notes">Notes</label><input id="notes" name="notes" /></div>
          <SubmitButton>Create draft</SubmitButton>
        </form>
      )}
    </>
  );
}
