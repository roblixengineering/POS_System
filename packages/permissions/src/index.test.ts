import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { can, PERMISSIONS, toPermissionSet } from './index';

describe('permissions', () => {
  it('checks codes, not role names', () => {
    const set = toPermissionSet(['sales.create']);
    expect(can(set, 'sales.create')).toBe(true);
    expect(can(set, 'sales.refund')).toBe(false);
  });

  it('matches the permission catalog seeded by the database migration', () => {
    const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/0006_roles_rls.sql'), 'utf8');
    const seeded = [...sql.matchAll(/^\s+\('([a-z_]+\.[a-z_]+)',/gm)].map((m) => m[1]).sort();
    expect(seeded).toEqual([...PERMISSIONS].sort());
  });
});
