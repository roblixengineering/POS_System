import { describe, expect, it } from 'vitest';
import { saleInputSchema, staffSchema } from './schemas';

const id = '11111111-1111-4111-8111-111111111111';

describe('saleInputSchema', () => {
  const base = {
    branchId: id, registerId: id, idempotencyKey: id,
    items: [{ productId: id, qty: 1 }],
    payments: [{ method: 'cash', amount: 10 }],
  };
  it('accepts a valid sale', () => expect(saleInputSchema.safeParse(base).success).toBe(true));
  it('rejects an empty cart', () => expect(saleInputSchema.safeParse({ ...base, items: [] }).success).toBe(false));
  it('rejects negative quantity', () =>
    expect(saleInputSchema.safeParse({ ...base, items: [{ productId: id, qty: -1 }] }).success).toBe(false));
  it('rejects an unknown payment method', () =>
    expect(saleInputSchema.safeParse({ ...base, payments: [{ method: 'barter', amount: 5 }] }).success).toBe(false));
});

describe('staffSchema', () => {
  it('cannot create an owner through the staff form', () =>
    expect(staffSchema.safeParse({ email: 'a@b.co', password: 'longenough1', fullName: 'Ann', roleCode: 'owner' }).success).toBe(false));
});
