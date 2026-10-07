'use server';
import { productSchema } from '@cloud-pos/validation';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { go } from '@/lib/flash';

export async function createProduct(formData: FormData) {
  await requirePermission('products.manage');
  const p = productSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) go('/products', 'error', p.error.issues[0]?.message ?? 'Check the form');
  const v = p.data;
  const supabase = await createClient();
  // business_id is filled by a column default from the session; RLS also verifies it.
  const { error } = await supabase.from('products').insert({
    name: v.name, sku: v.sku, barcode: v.barcode ?? null, unit: v.unit, cost: v.cost, price: v.price, tax_rate: v.taxRate, reorder_level: v.reorderLevel,
  });
  if (error) go('/products', 'error', error.code === '23505' ? 'SKU or barcode already exists' : error.message);
  go('/products', 'ok', 'Product created');
}

export async function updateProduct(formData: FormData) {
  await requirePermission('products.manage');
  const id = String(formData.get('id'));
  const p = productSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) go('/products', 'error', p.error.issues[0]?.message ?? 'Check the form');
  const v = p.data;
  const supabase = await createClient();
  const { error } = await supabase.from('products').update({
    name: v.name, sku: v.sku, barcode: v.barcode ?? null, cost: v.cost, price: v.price, tax_rate: v.taxRate, reorder_level: v.reorderLevel,
    is_active: formData.get('is_active') === 'on',
  }).eq('id', id);
  if (error) go('/products', 'error', error.code === '23505' ? 'SKU or barcode already exists' : error.message);
  go('/products', 'ok', 'Product updated (price/cost changes are audited)');
}
