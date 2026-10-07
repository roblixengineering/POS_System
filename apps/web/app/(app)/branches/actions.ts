'use server';
import { z } from 'zod';
import { requirePermission } from '@/lib/session';
import { rpc } from '@/lib/rpc';
import { errMsg, go } from '@/lib/flash';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, 'Code: 2-8 letters or digits'),
  address: z.string().trim().max(200).optional(),
  timezone: z.string().trim().min(3).max(60).default('Asia/Karachi'),
});

export async function createBranch(formData: FormData) {
  await requirePermission('branches.manage');
  const p = schema.safeParse(Object.fromEntries(formData));
  if (!p.success) go('/branches', 'error', p.error.issues[0]?.message ?? 'Check the form');
  let failure: string | null = null;
  try {
    await rpc('admin_create_branch', { p_name: p.data.name, p_code: p.data.code, p_address: p.data.address ?? null, p_timezone: p.data.timezone });
  } catch (e) { failure = errMsg(e); }
  if (failure) go('/branches', 'error', failure);
  go('/branches', 'ok', 'Branch created with a default store and Register 1');
}
