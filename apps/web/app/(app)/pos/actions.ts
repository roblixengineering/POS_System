'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { saleInputSchema } from '@cloud-pos/validation';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { rpc } from '@/lib/rpc';
import { errMsg, go } from '@/lib/flash';

export interface PosProduct {
  id: string; name: string; sku: string; barcode: string | null;
  price: number; taxRate: number; stock: number | null;
}

export async function searchProducts(branchId: string, query: string): Promise<PosProduct[]> {
  const ctx = await requirePermission('sales.create');
  if (!ctx.branches.some((b) => b.id === branchId)) return [];
  const term = query.replace(/[^\p{L}\p{N} .\-]/gu, '').trim().slice(0, 60); // safe for the PostgREST or() filter
  if (!term) return [];

  const supabase = await createClient();
  const { data: products } = await supabase
    .from('products')
    .select('id, sku, barcode, name, price, tax_rate, track_stock')
    .eq('is_active', true)
    .or(`barcode.eq.${term},sku.ilike.${term},name.ilike.%${term}%`)
    .order('name')
    .limit(20);
  if (!products?.length) return [];

  const { data: wh } = await supabase.from('warehouses').select('id').eq('branch_id', branchId).eq('is_default', true).maybeSingle();
  const stock = new Map<string, number>();
  if (wh) {
    const { data: levels } = await supabase.from('stock_levels').select('product_id, qty').eq('warehouse_id', wh.id).in('product_id', products.map((p) => p.id));
    for (const l of levels ?? []) stock.set(l.product_id as string, Number(l.qty));
  }
  return products.map((p) => ({
    id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, price: Number(p.price), taxRate: Number(p.tax_rate),
    stock: p.track_stock ? (stock.get(p.id) ?? 0) : null,
  }));
}

export async function checkout(raw: unknown): Promise<{ ok: true; saleId: string } | { ok: false; error: string }> {
  await requirePermission('sales.create');
  const parsed = saleInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid sale' };
  const v = parsed.data;
  try {
    // business_id, prices, costs, warehouse and totals are all derived by the database, not the browser.
    const saleId = await rpc<string>('pos_create_sale', {
      p_branch_id: v.branchId,
      p_register_id: v.registerId,
      p_customer_id: v.customerId ?? null,
      p_items: v.items.map((i) => ({ product_id: i.productId, qty: i.qty, discount: i.discount ?? 0 })),
      p_payments: v.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference ?? null })),
      p_idempotency_key: v.idempotencyKey,
      p_note: v.note ?? null,
    });
    return { ok: true, saleId };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

const openSchema = z.object({ branchId: z.string().uuid(), registerId: z.string().uuid(), openingCash: z.coerce.number().min(0) });
export async function openShift(formData: FormData) {
  await requirePermission('cash.manage');
  const p = openSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) go('/pos', 'error', 'Check the opening cash amount');
  const back = `/pos?branch=${p.data.branchId}`;
  let failure: string | null = null;
  try {
    await rpc('pos_open_session', { p_register_id: p.data.registerId, p_opening_cash: p.data.openingCash });
  } catch (e) { failure = errMsg(e); }
  if (failure) go(back, 'error', failure);
  redirect(back);
}

const closeSchema = z.object({ branchId: z.string().uuid(), sessionId: z.string().uuid(), closingCash: z.coerce.number().min(0) });
export async function closeShift(formData: FormData) {
  await requirePermission('cash.manage');
  const p = closeSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) go('/pos', 'error', 'Check the counted cash amount');
  const back = `/pos?branch=${p.data.branchId}`;
  let result: { expected: number; difference: number } | null = null;
  let failure: string | null = null;
  try {
    result = await rpc('pos_close_session', { p_session_id: p.data.sessionId, p_closing_cash: p.data.closingCash });
  } catch (e) { failure = errMsg(e); }
  if (failure || !result) go(back, 'error', failure ?? 'Could not close the shift');
  go(back, 'ok', `Shift closed. Expected ${result.expected}, counted ${p.data.closingCash}, difference ${result.difference}.`);
}
