import { describe, expect, it } from 'vitest';
import { calcCart, calcLine, checkPayments, round2 } from './money';

describe('round2', () => {
  it('rounds half away from zero', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1.01);
  });
});

describe('calcLine', () => {
  it('computes tax on the discounted net', () => {
    const t = calcLine({ productId: 'p', qty: 2, unitPrice: 130, discount: 10, taxRate: 17 });
    expect(t).toEqual({ gross: 260, discount: 10, net: 250, tax: 42.5, total: 292.5 });
  });
  it('caps the discount at the line value', () => {
    expect(calcLine({ productId: 'p', qty: 1, unitPrice: 50, discount: 80 }).total).toBe(0);
  });
});

describe('calcCart', () => {
  it('sums lines (3 x 180 = 540)', () => {
    expect(calcCart([{ productId: 'a', qty: 3, unitPrice: 180 }]).total).toBe(540);
  });
});

describe('checkPayments', () => {
  it('allows cash change', () => {
    expect(checkPayments(540, [{ method: 'cash', amount: 600 }])).toMatchObject({ ok: true, change: 60 });
  });
  it('rejects underpayment', () => {
    expect(checkPayments(540, [{ method: 'card', amount: 500 }]).ok).toBe(false);
  });
  it('rejects overpayment by card', () => {
    expect(checkPayments(540, [{ method: 'card', amount: 600 }]).ok).toBe(false);
  });
  it('accepts split payments', () => {
    expect(checkPayments(540, [{ method: 'card', amount: 400 }, { method: 'cash', amount: 140 }]).ok).toBe(true);
  });
});
