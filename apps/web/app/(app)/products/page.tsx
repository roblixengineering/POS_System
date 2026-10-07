import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Flash, type FlashParams } from '@/components/flash';
import { SubmitButton } from '@/components/submit-button';
import { createProduct, updateProduct } from './actions';

export default async function ProductsPage({ searchParams }: { searchParams: Promise<FlashParams & { q?: string }> }) {
  const sp = await searchParams;
  await requirePermission('products.manage');
  const supabase = await createClient();
  const q = (sp.q ?? '').replace(/[^\p{L}\p{N} .\-]/gu, '').trim();
  let query = supabase.from('products_with_cost').select('id, sku, barcode, name, unit, cost, price, tax_rate, reorder_level, is_active').order('name').limit(100);
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.eq.${q}`);
  const { data } = await query;

  return (
    <>
      <h1>Products</h1>
      <p className="sub">Cost is only visible to people with product or profit access.</p>
      <Flash {...sp} />
      <form action={createProduct} className="card stack">
        <h2>Add product</h2>
        <div className="row">
          <div><label htmlFor="name">Name</label><input id="name" name="name" required /></div>
          <div><label htmlFor="sku">SKU</label><input id="sku" name="sku" required /></div>
          <div><label htmlFor="barcode">Barcode</label><input id="barcode" name="barcode" /></div>
        </div>
        <div className="row">
          <div><label htmlFor="cost">Cost</label><input id="cost" name="cost" type="number" step="0.01" min="0" required /></div>
          <div><label htmlFor="price">Price</label><input id="price" name="price" type="number" step="0.01" min="0" required /></div>
          <div><label htmlFor="taxRate">Tax %</label><input id="taxRate" name="taxRate" type="number" step="0.01" min="0" max="100" defaultValue="0" /></div>
          <div><label htmlFor="reorderLevel">Reorder level</label><input id="reorderLevel" name="reorderLevel" type="number" step="any" min="0" defaultValue="0" /></div>
        </div>
        <SubmitButton>Add product</SubmitButton>
      </form>
      <form className="row noprint" style={{ maxWidth: 420, marginBottom: '1rem' }}>
        <div><label htmlFor="q">Search</label><input id="q" name="q" defaultValue={q} /></div><div className="fit"><button className="ghost">Search</button></div>
      </form>
      <div className="card scroll">
        <table>
          <thead><tr><th>Name / SKU / barcode</th><th>Cost</th><th>Price</th><th>Tax %</th><th>Reorder</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id}>
                <td colSpan={7} style={{ padding: 0 }}>
                  <form action={updateProduct} className="row" style={{ padding: '.45rem .5rem', alignItems: 'center' }}>
                    <input type="hidden" name="id" value={p.id} />
                    <div style={{ flex: '3 1 260px' }}><input name="name" defaultValue={p.name} aria-label="Name" required />
                      <div className="row" style={{ marginTop: '.25rem' }}><input name="sku" defaultValue={p.sku} aria-label="SKU" required /><input name="barcode" defaultValue={p.barcode ?? ''} aria-label="Barcode" /></div></div>
                    <input name="cost" type="number" step="0.01" min="0" defaultValue={p.cost} aria-label="Cost" />
                    <input name="price" type="number" step="0.01" min="0" defaultValue={p.price} aria-label="Price" />
                    <input name="taxRate" type="number" step="0.01" min="0" max="100" defaultValue={p.tax_rate} aria-label="Tax percent" />
                    <input name="reorderLevel" type="number" step="any" min="0" defaultValue={p.reorder_level} aria-label="Reorder level" />
                    <label className="fit" style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}><input type="checkbox" name="is_active" defaultChecked={p.is_active} style={{ width: 'auto' }} />active</label>
                    <div className="fit"><SubmitButton className="ghost">Save</SubmitButton></div>
                  </form>
                </td>
              </tr>
            ))}
            {(data ?? []).length === 0 && <tr><td colSpan={7} className="muted">No products.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
