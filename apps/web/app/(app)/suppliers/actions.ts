'use server';
import { supplierSchema } from '@cloud-pos/validation';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { go } from '@/lib/flash';

export async function createSupplier(formData: FormData) {
  await requirePermission('suppliers.manage');
  const p = supplierSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) go('/suppliers', 'error', p.error.issues[0]?.message ?? 'Check the form');
  const supabase = await createClient();
  const { error } = await supabase.from('suppliers').insert({ name: p.data.name, phone: p.data.phone ?? null, email: p.data.email ?? null });
  if (error) go('/suppliers', 'error', error.message);
  go('/suppliers', 'ok', 'Supplier added');
}
