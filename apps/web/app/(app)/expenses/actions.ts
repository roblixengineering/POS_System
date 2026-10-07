'use server';
import { expenseSchema } from '@cloud-pos/validation';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { go } from '@/lib/flash';

export async function createExpense(formData: FormData) {
  const ctx = await requirePermission('expenses.manage');
  const p = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) go('/expenses', 'error', p.error.issues[0]?.message ?? 'Check the form');
  if (!ctx.branches.some((b) => b.id === p.data.branchId)) go('/expenses', 'error', 'You cannot record expenses for that branch');
  const supabase = await createClient();
  const v = p.data;
  const { error } = await supabase.from('expenses').insert({
    branch_id: v.branchId, category: v.category, description: v.description ?? null, amount: v.amount, expense_date: v.expenseDate, payment_method: v.paymentMethod,
  });
  if (error) go('/expenses', 'error', error.message);
  go('/expenses', 'ok', 'Expense recorded');
}
