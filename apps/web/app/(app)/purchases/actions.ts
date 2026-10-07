'use server';
import { receiveStockSchema } from '@cloud-pos/validation';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { rpc } from '@/lib/rpc';
import { errMsg, go } from '@/lib/flash';
import { readRows } from '@/lib/data';

export async function receiveStock(formData: FormData) {
  await requirePermission('inventory.receive');
  const supabase = await createClient();
  const { data: wh } = await supabase.from('warehouses').select('branch_id').eq('id', String(formData.get('warehouseId'))).maybeSingle();
  const items = readRows(formData, 'row', 8, 'row_cost').map((r) => ({ productId: r.productId, qty: r.qty, unitCost: r.extra }));
  const p = receiveStockSchema.safeParse({
    branchId: wh?.branch_id, warehouseId: formData.get('warehouseId'), supplierId: formData.get('supplierId'),
    deliveryRef: formData.get('deliveryRef'), receivedAt: formData.get('receivedAt'), amountPaid: formData.get('amountPaid') || 0,
    notes: formData.get('notes'), items,
  });
  if (!p.success) go('/purchases', 'error', p.error.issues[0]?.message ?? 'Check the form');
  const v = p.data;
  let failure: string | null = null;
  try {
    await rpc('inv_receive_stock', {
      p_branch_id: v.branchId, p_warehouse_id: v.warehouseId, p_supplier_id: v.supplierId ?? null,
      p_delivery_ref: v.deliveryRef ?? null, p_received_at: v.receivedAt ? new Date(v.receivedAt).toISOString() : null,
      p_items: v.items.map((i) => ({ product_id: i.productId, qty: i.qty, unit_cost: i.unitCost })),
      p_amount_paid: v.amountPaid, p_notes: v.notes ?? null,
    });
  } catch (e) { failure = errMsg(e); }
  if (failure) go('/purchases', 'error', failure);
  go('/purchases', 'ok', 'Stock received. Completed receiving documents cannot be edited; use an adjustment to correct mistakes.');
}
