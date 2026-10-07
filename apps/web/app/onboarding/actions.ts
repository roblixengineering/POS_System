'use server';
import { redirect } from 'next/navigation';
import { bootstrapSchema } from '@cloud-pos/validation';
import { go, errMsg } from '@/lib/flash';
import { rpc } from '@/lib/rpc';

export async function createBusiness(formData: FormData) {
  const parsed = bootstrapSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) go('/onboarding', 'error', parsed.error.issues[0]?.message ?? 'Check the form');
  const v = parsed.data;
  let failure: string | null = null;
  try {
    await rpc('bootstrap_business', {
      p_name: v.businessName, p_currency: v.currency, p_full_name: v.fullName,
      p_branch_name: v.branchName, p_branch_code: v.branchCode,
    });
  } catch (e) {
    failure = errMsg(e);
  }
  if (failure) go('/onboarding', 'error', failure);
  redirect('/dashboard');
}
