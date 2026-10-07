/**
 * Client-side PREVIEW of sale totals. The authoritative calculation is public.pos_create_sale() in the
 * database; keep both in sync (same rounding: per line, 2 decimals, half away from zero).
 */
export const PAYMENT_METHODS = ['cash', 'card', 'bank', 'wallet', 'credit'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const round2 = (n: number): number => {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 100 + 1e-9)) / 100;
};

export interface CartLine {
  productId: string;
  qty: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
}

export interface LineTotals {
  gross: number;
  discount: number;
  net: number;
  tax: number;
  total: number;
}

export function calcLine(line: CartLine): LineTotals {
  const gross = round2(line.qty * line.unitPrice);
  const discount = Math.min(Math.max(line.discount ?? 0, 0), gross);
  const net = round2(gross - discount);
  const tax = round2((net * (line.taxRate ?? 0)) / 100);
  return { gross, discount, net, tax, total: round2(net + tax) };
}

export interface CartTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
}

export function calcCart(lines: readonly CartLine[]): CartTotals {
  let subtotal = 0, discountTotal = 0, taxTotal = 0, total = 0;
  for (const l of lines) {
    const t = calcLine(l);
    subtotal += t.gross;
    discountTotal += t.discount;
    taxTotal += t.tax;
    total += t.total;
  }
  return {
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    taxTotal: round2(taxTotal),
    total: round2(total),
  };
}

export interface PaymentCheck {
  ok: boolean;
  paid: number;
  change: number;
  error?: string;
}

/** Mirrors the database rules: payments must cover the total; only cash may exceed it (change). */
export function checkPayments(
  total: number,
  payments: readonly { method: PaymentMethod; amount: number }[],
): PaymentCheck {
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  const cash = round2(payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0));
  if (payments.length === 0 || paid < total) {
    return { ok: false, paid, change: 0, error: 'Payment is less than the total' };
  }
  const change = round2(paid - total);
  if (change > cash) return { ok: false, paid, change, error: 'Change can only be given against cash' };
  return { ok: true, paid, change };
}
