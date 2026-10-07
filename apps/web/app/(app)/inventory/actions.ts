'use server';
import { adjustStockSchema, createTransferSchema } from '@cloud-pos/validation';
import { requirePermission } from '@/lib/session';
import { rpc } from '@/lib/rpc';
import { errMsg, go } from '@/lib/flash';
import { readRows } from '@/lib/data';

export async function adjustStock(formData: FormData) {
  await requirePermission('inventory.adjust');
  const p = adjustStockSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) go('/inventory', 'error', p.error.issues[0]?.message ?? 'Check the form');
  let failure: string | null = null;
  try {
    await rpc('inv_adjust_stock', { p_warehouse_id: p.data.warehouseId, p_product_id: p.data.productId, p_qty_delta: p.data.qtyDelta, p_reason: p.data.reason, p_note: p.data.note });
  } catch (e) { failure = errMsg(e); }
  if (failure) go('/inventory', 'error', failure);
  go('/inventory', 'ok', 'Stock adjusted and logged');
}

export async function createTransfer(formData: FormData) {
  await requirePermission('inventory.transfer');
  const items = readRows(formData, 'row', 5).map((r) => ({ productId: r.productId, qty: r.qty }));
  const p = createTransferSchema.safeParse({
    fromWarehouseId: formData.get('fromWarehouseId'), toWarehouseId: formData.get('toWarehouseId'), notes: formData.get('notes'), items,
  });
  if (!p.success) go('/inventory/transfers', 'error', p.error.issues[0]?.message ?? 'Check the form');
  let failure: string | null = null;
  try {
    await rpc('inv_create_transfer', {
      p_from_warehouse: p.data.fromWarehouseId, p_to_warehouse: p.data.toWarehouseId, p_notes: p.data.notes ?? null,
      p_items: p.data.items.map((i) => ({ product_id: i.productId, qty: i.qty })),
    });
  } catch (e) { failure = errMsg(e); }
  if (failure) go('/inventory/transfers', 'error', failure);
  go('/inventory/transfers', 'ok', 'Transfer drafted');
}

export async function transitionTransfer(formData: FormData) {
  await requirePermission('inventory.transfer');
  const id = String(formData.get('id') ?? '');
  const action = String(formData.get('action') ?? '');
  let failure: string | null = null;
  try {
    await rpc('inv_transition_transfer', { p_transfer_id: id, p_action: action });
  } catch (e) { failure = errMsg(e); }
  if (failure) go('/inventory/transfers', 'error', failure);
  go('/inventory/transfers', 'ok', action === 'cancel' ? 'Transfer cancelled' : `Transfer ${action}d`);
}
