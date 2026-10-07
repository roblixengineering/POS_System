'use server';
import { customerSchema } from '@cloud-pos/validation';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { go } from '@/lib/flash';

export async function createCustomer(formData: FormData) {
  await requirePermission('customers.manage');
  const p = customerSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) go('/customers', 'error', p.error.issues[0]?.message ?? 'Check the form');
  const supabase = await createClient();
  const { error } = await supabase.from('customers').insert({ name: p.data.name, phone: p.data.phone ?? null, email: p.data.email ?? null, credit_limit: p.data.creditLimit });
  if (error) go('/customers', 'error', error.message);
  go('/customers', 'ok', 'Customer added');
}
