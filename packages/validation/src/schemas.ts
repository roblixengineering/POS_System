import { z } from 'zod';
import { PAYMENT_METHODS } from './money';

const uuid = z.string().uuid();
const money = z.coerce.number().finite().nonnegative().max(1_000_000_000);
const qty = z.coerce.number().finite().positive().max(1_000_000);
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

export const saleInputSchema = z.object({
  branchId: uuid,
  registerId: uuid,
  customerId: uuid.nullable().optional(),
  idempotencyKey: uuid,
  note: optText(500),
  items: z
    .array(z.object({ productId: uuid, qty, unitPrice: money.optional(), discount: money.optional() }))
    .min(1).max(200),
  payments: z
    .array(z.object({
      method: z.enum(PAYMENT_METHODS),
      amount: z.coerce.number().finite().positive().max(1_000_000_000),
      reference: optText(100),
    }))
    .min(1).max(6),
});
export type SaleInput = z.infer<typeof saleInputSchema>;

export const refundInputSchema = z.object({
  saleId: uuid,
  reason: z.string().trim().min(3).max(300),
  method: z.enum(['cash', 'card', 'bank', 'wallet', 'balance']),
  restock: z.boolean(),
  items: z.array(z.object({ saleItemId: uuid, qty })).min(1),
});

export const receiveStockSchema = z.object({
  branchId: uuid,
  warehouseId: uuid,
  supplierId: z.preprocess(blankToUndefined, uuid.optional()),
  deliveryRef: optText(100),
  receivedAt: z.preprocess(blankToUndefined, z.string().optional()),
  amountPaid: money.default(0),
  notes: optText(500),
  items: z.array(z.object({ productId: uuid, qty, unitCost: money })).min(1).max(300),
});

export const adjustStockSchema = z.object({
  warehouseId: uuid,
  productId: uuid,
  qtyDelta: z.coerce.number().finite().refine((n) => n !== 0, 'Change cannot be zero'),
  reason: z.enum(['damage', 'adjustment', 'count_correction', 'opening_stock']),
  note: z.string().trim().min(3).max(300),
});

export const createTransferSchema = z
  .object({
    fromWarehouseId: uuid,
    toWarehouseId: uuid,
    notes: optText(300),
    items: z.array(z.object({ productId: uuid, qty })).min(1).max(200),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, { message: 'Source and destination must differ' });

export const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().min(1).max(64),
  barcode: optText(64),
  unit: z.preprocess(blankToUndefined, z.string().trim().max(16).default('pcs')),
  cost: money,
  price: money,
  taxRate: z.coerce.number().min(0).max(100).default(0),
  reorderLevel: z.coerce.number().min(0).default(0),
});

export const customerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: optText(40),
  email: z.preprocess(blankToUndefined, z.string().email().optional()),
  creditLimit: z.coerce.number().min(0).default(0),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: optText(40),
  email: z.preprocess(blankToUndefined, z.string().email().optional()),
});

export const expenseSchema = z.object({
  branchId: uuid,
  category: z.string().trim().min(1).max(80),
  description: optText(300),
  amount: z.coerce.number().positive().max(1_000_000_000),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMethod: z.enum(['cash', 'card', 'bank', 'wallet']).default('cash'),
});

export const bootstrapSchema = z.object({
  businessName: z.string().trim().min(2).max(200),
  currency: z.string().trim().length(3).toUpperCase(),
  fullName: z.string().trim().min(2).max(120),
  branchName: z.string().trim().min(2).max(120),
  branchCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, '2-8 letters or digits'),
});

export const staffSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(10, 'Use at least 10 characters').max(128),
  fullName: z.string().trim().min(2).max(120),
  roleCode: z.enum(['business_admin', 'branch_manager', 'cashier', 'inventory_manager', 'accountant']),
  branchIds: z.array(uuid).default([]),
});
