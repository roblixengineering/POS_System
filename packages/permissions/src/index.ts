/**
 * Permission codes. The authoritative copy lives in the database (public.permissions, seeded in
 * supabase/migrations/0006_roles_rls.sql); this list is used for typed UI checks only.
 * A unit test fails if the two drift apart. The database still enforces every permission.
 */
export const PERMISSIONS = [
  'sales.create', 'sales.view_own', 'sales.view_all', 'sales.refund', 'sales.discount', 'sales.override_price',
  'cash.manage', 'cash.manage_all',
  'inventory.view', 'inventory.cross_branch', 'inventory.receive', 'inventory.adjust',
  'inventory.transfer', 'inventory.transfer_approve',
  'products.manage', 'customers.view', 'customers.manage', 'suppliers.view', 'suppliers.manage',
  'purchases.view', 'expenses.view', 'expenses.manage',
  'reports.view', 'reports.profit',
  'branches.manage', 'users.view', 'users.manage', 'settings.manage', 'audit.view', 'data.export',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_CODES = [
  'owner', 'business_admin', 'branch_manager', 'cashier', 'inventory_manager', 'accountant',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export type PermissionSet = ReadonlySet<string>;

export function toPermissionSet(codes: readonly string[]): PermissionSet {
  return new Set(codes);
}

export function can(set: PermissionSet, permission: Permission): boolean {
  return set.has(permission);
}

export function canAny(set: PermissionSet, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => set.has(p));
}
