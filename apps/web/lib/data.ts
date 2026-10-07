import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface WarehouseOption { id: string; label: string; branch_id: string }

export async function getWarehouses(supabase: SupabaseClient): Promise<WarehouseOption[]> {
  const { data } = await supabase.from('warehouses').select('id, name, branch_id, branch:branches(name)').eq('is_active', true).order('name');
  return (data ?? []).map((w) => {
    const b = w.branch as unknown as { name: string } | null;
    return { id: w.id as string, branch_id: w.branch_id as string, label: `${b?.name ?? '?'} — ${w.name}` };
  });
}

export async function getProductOptions(supabase: SupabaseClient) {
  const { data } = await supabase.from('products').select('id, sku, name').eq('is_active', true).order('name').limit(1000);
  return (data ?? []) as { id: string; sku: string; name: string }[];
}

/** Parses repeated form rows: fields `<prefix>_product_N`, `<prefix>_qty_N` (+ optional extra) for N=0..count-1. */
export function readRows(fd: FormData, prefix: string, count: number, extra?: string) {
  const rows: { productId: string; qty: string; extra?: string }[] = [];
  for (let i = 0; i < count; i++) {
    const productId = String(fd.get(`${prefix}_product_${i}`) ?? '');
    const qty = String(fd.get(`${prefix}_qty_${i}`) ?? '');
    if (!productId || qty === '') continue;
    rows.push({ productId, qty, extra: extra ? String(fd.get(`${extra}_${i}`) ?? '') : undefined });
  }
  return rows;
}
