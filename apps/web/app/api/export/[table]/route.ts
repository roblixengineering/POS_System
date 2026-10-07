import { NextResponse } from 'next/server';
import { getContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

// Explicit column lists: products.cost is never exported here, and nothing is selected with "*".
const TABLES: Record<string, { columns: string; perm: string }> = {
  products: { columns: 'sku,barcode,name,unit,price,tax_rate,reorder_level,is_active', perm: 'data.export' },
  customers: { columns: 'name,phone,email,credit_limit,balance', perm: 'customers.view' },
  suppliers: { columns: 'name,phone,email,balance', perm: 'suppliers.view' },
  sales: { columns: 'invoice_no,created_at,status,subtotal,discount_total,tax_total,total,cogs_total', perm: 'sales.view_all' },
  stock_levels: { columns: 'warehouse_id,product_id,qty,updated_at', perm: 'inventory.view' },
  expenses: { columns: 'expense_date,category,description,amount,payment_method', perm: 'expenses.view' },
};

/** Neutralise spreadsheet formula injection (=, +, -, @) and quote values. */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  const def = TABLES[table];
  if (!def) return NextResponse.json({ error: 'unknown table' }, { status: 404 });

  const ctx = await getContext();
  if (!ctx.permissions.has('data.export') || !ctx.permissions.has(def.perm as never)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const supabase = await createClient();
  const cols = def.columns.split(',');
  const rows: string[] = [cols.join(',')];
  for (let from = 0; from < 200_000; from += 1000) {            // paginate past the API row cap
    const { data, error } = await supabase.from(table).select(def.columns).order(cols[0]).range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) rows.push(cols.map((c) => cell(r[c])).join(','));
    if (!data || data.length < 1000) break;
  }
  await supabase.rpc('audit_export', { p_table: table, p_rows: rows.length - 1 });
  return new NextResponse(rows.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${table}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
