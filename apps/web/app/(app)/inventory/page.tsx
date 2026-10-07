import { getContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { formatQty } from '@/lib/format';
import { getProductOptions, getWarehouses } from '@/lib/data';
import { Flash, type FlashParams } from '@/components/flash';
import { LiveRefresh } from '@/components/live-refresh';
import { SubmitButton } from '@/components/submit-button';
import { adjustStock } from './actions';

export default async function InventoryPage({ searchParams }: { searchParams: Promise<FlashParams & { q?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.permissions.has('inventory.view')) return <p>No access.</p>;
  const supabase = await createClient();
  const q = (sp.q ?? '').trim().slice(0, 60);

  const { data: found } = q ? await supabase.rpc('inv_search_stock', { p_query: q, p_limit: 60 }) : { data: [] };
  const { data: levels } = q ? { data: [] } : await supabase.from('stock_levels')
    .select('qty, product:products(name, sku, reorder_level), warehouse:warehouses(name), branch:branches(name)').order('qty').limit(100);
  const canAdjust = ctx.permissions.has('inventory.adjust');
  const [warehouses, products] = canAdjust ? await Promise.all([getWarehouses(supabase), getProductOptions(supabase)]) : [[], []];

  // Group search results per product so branches appear side by side (spec §10).
  const grouped = new Map<string, { name: string; rows: { loc: string; qty: number }[] }>();
  for (const r of found ?? []) {
    const g = grouped.get(r.product_id) ?? { name: `${r.product_name} (${r.sku})`, rows: [] };
    g.rows.push({ loc: `${r.branch_name} — ${r.warehouse_name}`, qty: Number(r.qty) });
    grouped.set(r.product_id, g);
  }

  return (
    <>
      <LiveRefresh tables={['stock_levels']} />
      <h1>Inventory</h1>
      <p className="sub">Live stock by location. Search shows every branch you are allowed to see.</p>
      <Flash {...sp} />
      <form className="card row noprint">
        <div><label htmlFor="q">Search product, SKU or barcode</label><input id="q" name="q" defaultValue={q} placeholder="e.g. Coca Cola" /></div>
        <div className="fit"><button>Search</button></div>
      </form>

      {q ? (
        [...grouped.entries()].map(([id, g]) => (
          <section className="card scroll" key={id}>
            <h2>{g.name}</h2>
            <table><tbody>
              {g.rows.map((r) => <tr key={r.loc}><td>{r.loc}</td><td className="num">{formatQty(r.qty)}</td><td>{r.qty > 0 ? <span className="pill">available</span> : <span className="pill bad">out</span>}</td></tr>)}
            </tbody></table>
            <p className="muted">{g.rows.some((r) => r.qty > 0) && g.rows.some((r) => r.qty <= 0) ? 'Status: available elsewhere' : ''}</p>
          </section>
        ))
      ) : (
        <div className="card scroll">
          <table>
            <thead><tr><th>Product</th><th>Location</th><th className="num">On hand</th><th>Status</th></tr></thead>
            <tbody>
              {(levels ?? []).map((l, i) => {
                const p = l.product as unknown as { name: string; sku: string; reorder_level: number };
                const w = l.warehouse as unknown as { name: string }; const b = l.branch as unknown as { name: string };
                const low = Number(p.reorder_level) > 0 && Number(l.qty) <= Number(p.reorder_level);
                return <tr key={i}><td>{p.name}<br /><small className="muted">{p.sku}</small></td><td>{b.name} — {w.name}</td><td className="num">{formatQty(l.qty)}</td>
                  <td>{low ? <span className="pill warn">LOW STOCK (min {formatQty(p.reorder_level)})</span> : <span className="pill">ok</span>}</td></tr>;
              })}
              {(levels ?? []).length === 0 && <tr><td colSpan={4} className="muted">No stock recorded yet. Receive stock or add opening stock.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {canAdjust && (
        <form action={adjustStock} className="card stack noprint">
          <h2>Adjust stock</h2>
          <div className="row">
            <div><label htmlFor="warehouseId">Location</label><select id="warehouseId" name="warehouseId" required>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
            <div><label htmlFor="productId">Product</label><select id="productId" name="productId" required>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></div>
          </div>
          <div className="row">
            <div><label htmlFor="qtyDelta">Change (+ adds, − removes)</label><input id="qtyDelta" name="qtyDelta" type="number" step="any" required /></div>
            <div><label htmlFor="reason">Reason</label><select id="reason" name="reason"><option value="damage">Damage</option><option value="count_correction">Count correction</option><option value="adjustment">Other adjustment</option><option value="opening_stock">Opening stock</option></select></div>
            <div><label htmlFor="note">Note (required)</label><input id="note" name="note" required minLength={3} /></div>
          </div>
          <SubmitButton>Record adjustment</SubmitButton>
        </form>
      )}
    </>
  );
}
