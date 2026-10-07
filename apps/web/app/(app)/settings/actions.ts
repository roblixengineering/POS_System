'use server';
import { z } from 'zod';
import { staffSchema } from '@cloud-pos/validation';
import { requirePermission } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rpc } from '@/lib/rpc';
import { errMsg, go } from '@/lib/flash';

export async function addStaff(formData: FormData) {
  await requirePermission('users.manage');   // checked server-side BEFORE the service-role client is used
  const p = staffSchema.safeParse({ ...Object.fromEntries(formData), branchIds: formData.getAll('branchIds') });
  if (!p.success) go('/settings', 'error', p.error.issues[0]?.message ?? 'Check the form');
  const v = p.data;

  let failure: string | null = null;
  let createdId: string | null = null;
  const admin = createAdminClient();
  try {
    const { data, error } = await admin.auth.admin.createUser({ email: v.email, password: v.password, email_confirm: true });
    if (error || !data.user) throw new Error(error?.message ?? 'Could not create the login');
    createdId = data.user.id;
    // The RPC runs as the CALLER (needs users.manage) and derives the business from their session.
    await rpc('admin_add_member', { p_user_id: createdId, p_full_name: v.fullName, p_role_code: v.roleCode, p_branch_ids: v.branchIds });
  } catch (e) {
    failure = errMsg(e);
    if (createdId) await admin.auth.admin.deleteUser(createdId); // do not leave an orphan login behind
  }
  if (failure) go('/settings', 'error', failure);
  go('/settings', 'ok', `${v.fullName} can now sign in as ${v.roleCode.replace('_', ' ')}`);
}

const updSchema = z.object({ userId: z.string().uuid(), roleCode: z.string(), status: z.enum(['active', 'disabled']) });
export async function updateStaff(formData: FormData) {
  await requirePermission('users.manage');
  const p = updSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) go('/settings', 'error', 'Check the form');
  let failure: string | null = null;
  try {
    await rpc('admin_update_member', { p_user_id: p.data.userId, p_role_code: p.data.roleCode, p_status: p.data.status, p_branch_ids: formData.getAll('branchIds') });
  } catch (e) { failure = errMsg(e); }
  if (failure) go('/settings', 'error', failure);
  go('/settings', 'ok', 'Staff access updated');
}

export async function saveSettings(formData: FormData) {
  const ctx = await requirePermission('settings.manage');
  const supabase = await createClient();
  const settings = {
    ...ctx.business.settings,
    allow_negative_stock: formData.get('allow_negative_stock') === 'on',
    receipt_footer: String(formData.get('receipt_footer') ?? '').slice(0, 200),
  };
  const { error } = await supabase.from('businesses').update({ settings }).eq('id', ctx.business.id);
  if (error) go('/settings', 'error', error.message);
  go('/settings', 'ok', 'Settings saved');
}
