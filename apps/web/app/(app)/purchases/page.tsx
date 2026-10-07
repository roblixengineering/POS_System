import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime, formatMoney } from '@/lib/format';
import { getProductOptions, getWarehouses } from '@/lib/data';
import { Flash, type FlashParams } from '@/components/flash';
import { SubmitButton } from '@/components/submit-button';
import { receiveStock } from './actions';

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const sp = await searchParams;
  const ctx = await requirePermission('purchases.view');
  const supabase = await createClient();
  const canReceive = ctx.permissions.has('inventory.receive');
  const [{ data: purchases }, { data: suppliers }, warehouses, products] = await Promise.all([
    supabase.from('purchases').select('id, purchase_no, delivery_ref, received_at, total, amount_paid, branch:branches(name), supplier:suppliers(name)').order('received_at', { ascending: false }).limit(50),
    ctx.permissions.has('suppliers.view') ? supabase.from('suppliers').select('id, name').eq('is_active', true).order('name') : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    canReceive ? getWarehouses(supabase) : Promise.resolve([]),
    canReceive ? getProductOptions(supabase) : Promise.resolve([]),
  ]);
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const nowLocal = now.toISOString().slice(0, 16);
  const m = (v: number | string) => formatMoney(v, ctx.business.currency);

  return (
    <>
      <h1>Receiving</h1>
      <p className="sub">Record a supplier delivery / truck. Confirming creates the purchase and stock-in movements together.</p>
      <Flash {...sp} />
      {canReceive && (
        <form action={receiveStock} className="card stack">
          <h2>Receive stock</h2>
          <div className="row">
            <div><label htmlFor="warehouseId">Branch / warehouse</label>
              <select id="warehouseId" name="warehouseId" required>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
            <div><label htmlFor="supplierId">Supplier</label>
              <select id="supplierId" name="supplierId"><option value="">—</option>{(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          </div>
          <div className="row">
            <div><label htmlFor="deliveryRef">Truck / delivery ref</label><input id="deliveryRef" name="deliveryRef" placeholder="TRK-2026-104" /></div>
            <div><label htmlFor="receivedAt">Received at</label><input id="receivedAt" name="receivedAt" type="datetime-local" defaultValue={nowLocal} /></div>
            <div><label htmlFor="amountPaid">Amount paid now</label><input id="amountPaid" name="amountPaid" type="number" min="0" step="0.01" defaultValue="0" /></div>
          </div>
          {Array.from({ length: 8 }, (_, i) => (
            <div className="row" key={i}>
              <div><label htmlFor={`row_product_${i}`}>Product {i + 1}</label>
                <select id={`row_product_${i}`} name={`row_product_${i}`}><option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label htmlFor={`row_qty_${i}`}>Quantity</label><input id={`row_qty_${i}`} name={`row_qty_${i}`} type="number" min="0" step="any" /></div>
              <div><label htmlFor={`row_cost_${i}`}>Unit cost</label><input id={`row_cost_${i}`} name={`row_cost_${i}`} type="number" min="0" step="0.01" /></div>
            </div>
          ))}
          <div><label htmlFor="notes">Notes</label><input id="notes" name="notes" /></div>
          <SubmitButton>Receive stock</SubmitButton>
        </form>
      )}
      <div className="card scroll">
        <h2>Recent deliveries</h2>
        <table>
          <thead><tr><th>No.</th><th>Received</th><th>Branch</th><th>Supplier</th><th>Truck ref</th><th className="num">Total</th><th className="num">Paid</th></tr></thead>
          <tbody>
            {(purchases ?? []).map((p) => (
              <tr key={p.id}><td>{p.purchase_no}</td><td>{formatDateTime(p.received_at)}</td><td>{(p.branch as unknown as { name: string })?.name}</td>
                <td>{(p.supplier as unknown as { name: string } | null)?.name ?? '—'}</td><td>{p.delivery_ref ?? '—'}</td><td className="num">{m(p.total)}</td><td className="num">{m(p.amount_paid)}</td></tr>
            ))}
            {(purchases ?? []).length === 0 && <tr><td colSpan={7} className="muted">Nothing received yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
