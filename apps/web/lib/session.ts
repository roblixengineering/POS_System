import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { toPermissionSet, type Permission, type PermissionSet } from '@cloud-pos/permissions';
import type { Branch } from '@/types/models';

export interface AppContext {
  userId: string;
  email: string;
  fullName: string;
  roleCode: string;
  roleName: string;
  business: { id: string; name: string; currency: string; settings: Record<string, unknown> };
  permissions: PermissionSet;
  branches: Branch[]; // branches this user may operate in
  allBranches: Branch[]; // every branch in the business (names only; used for cross-branch views)
}

/** Loads identity, permissions and branch scope. Redirects to /login or /onboarding when needed. */
export const getContext = cache(async (): Promise<AppContext> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, status, role_id, role:roles(code, name, all_branches), business:businesses(id, name, currency, settings)')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) redirect('/onboarding');
  if (profile.status !== 'active') redirect('/login?error=Account%20disabled');

  const role = profile.role as unknown as { code: string; name: string; all_branches: boolean };
  const business = profile.business as unknown as AppContext['business'];

  const [{ data: perms }, { data: branchRows }, { data: mine }] = await Promise.all([
    supabase.from('role_permissions').select('permission_code').eq('role_id', profile.role_id),
    supabase.from('branches').select('id, code, name, address, timezone, is_active').eq('is_active', true).order('name'),
    supabase.from('branch_users').select('branch_id').eq('user_id', user.id),
  ]);

  const allBranches = (branchRows ?? []) as Branch[];
  const mineIds = new Set((mine ?? []).map((m) => m.branch_id as string));
  return {
    userId: user.id,
    email: user.email ?? '',
    fullName: profile.full_name,
    roleCode: role.code,
    roleName: role.name,
    business,
    permissions: toPermissionSet((perms ?? []).map((p) => p.permission_code as string)),
    branches: role.all_branches ? allBranches : allBranches.filter((b) => mineIds.has(b.id)),
    allBranches,
  };
});

/** Server-side gate for pages and actions. The database enforces the same rule independently. */
export async function requirePermission(permission: Permission): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx.permissions.has(permission)) redirect('/dashboard?error=You%20do%20not%20have%20access%20to%20that%20page');
  return ctx;
}

export function pickBranch(ctx: AppContext, requested?: string): Branch | undefined {
  return ctx.branches.find((b) => b.id === requested) ?? ctx.branches[0];
}
