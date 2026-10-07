'use server';
import { z } from 'zod';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { rpc } from '@/lib/rpc';
import { errMsg, go } from '@/lib/flash';

const schema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().trim().min(3, 'Enter a reason').max(300),
  method: z.enum(['cash', 'card', 'bank', 'wallet', 'balance']),
});

export async function refundSale(formData: FormData) {
  await requirePermission('sales.refund');
  const p = schema.safeParse(Object.fromEntries(formData));
  if (!p.success) go('/sales', 'error', p.error.issues[0]?.message ?? 'Check the form');
  const back = `/sales/${p.data.saleId}`;

  const supabase = await createClient();
  const { data: lines } = await supabase.from('sale_items').select('id').eq('sale_id', p.data.saleId);
  const items = (lines ?? [])
    .map((l) => ({ sale_item_id: l.id as string, qty: Number(formData.get(`qty_${l.id}`) || 0) }))
    .filter((i) => i.qty > 0);
  if (items.length === 0) go(back, 'error', 'Enter a quantity to return for at least one line');

  let failure: string | null = null;
  try {
    await rpc('pos_refund_sale', {
      p_sale_id: p.data.saleId, p_items: items, p_reason: p.data.reason,
      p_refund_method: p.data.method, p_restock: formData.get('restock') === 'on',
    });
  } catch (e) { failure = errMsg(e); }
  if (failure) go(back, 'error', failure);
  go(back, 'ok', 'Refund recorded');
}
