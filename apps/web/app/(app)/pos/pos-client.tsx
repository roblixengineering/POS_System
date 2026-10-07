'use client';
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { calcCart, calcLine, checkPayments, type PaymentMethod } from '@cloud-pos/validation';
import { formatMoney } from '@/lib/format';
import { checkout, searchProducts, type PosProduct } from './actions';

interface Line { product: PosProduct; qty: number; discount: number }
interface Props {
  branchId: string; registerId: string; currency: string; canDiscount: boolean;
  customers: { id: string; name: string; available: number }[];
}
const METHODS: PaymentMethod[] = ['cash', 'card', 'bank', 'wallet', 'credit'];

export function PosClient({ branchId, registerId, currency, canDiscount, customers }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PosProduct[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const idempotencyKey = useRef(crypto.randomUUID());
  const searchBox = useRef<HTMLInputElement>(null);
  const money = (n: number) => formatMoney(n, currency);

  const cartLines = lines.map((l) => ({ productId: l.product.id, qty: l.qty, unitPrice: l.product.price, discount: l.discount, taxRate: l.product.taxRate }));
  const totals = useMemo(() => calcCart(cartLines), [lines]); // eslint-disable-line react-hooks/exhaustive-deps
  const amount = tendered === '' ? totals.total : Number(tendered);
  const payments = [{ method, amount }];
  const check = checkPayments(totals.total, payments);

  function add(p: PosProduct) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i >= 0) return prev.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { product: p, qty: 1, discount: 0 }];
    });
    setQuery(''); setResults([]); searchBox.current?.focus();
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault(); // scanners type the barcode then press Enter
    const q = query.trim();
    if (!q) return;
    start(async () => {
      const found = await searchProducts(branchId, q);
      const exact = found.filter((p) => p.barcode === q || p.sku.toLowerCase() === q.toLowerCase());
      if (exact.length === 1) add(exact[0]);
      else if (found.length === 1) add(found[0]);
      else { setResults(found); if (found.length === 0) setError('No product found'); else setError(null); }
    });
  }

  function pay() {
    setError(null);
    start(async () => {
      const res = await checkout({
        branchId, registerId, customerId: customerId || null, idempotencyKey: idempotencyKey.current,
        items: lines.map((l) => ({ productId: l.product.id, qty: l.qty, discount: l.discount || undefined })),
        payments,
      });
      if (!res.ok) { setError(res.error); return; }
      idempotencyKey.current = crypto.randomUUID();
      router.push(`/sales/${res.saleId}?print=1`);
    });
  }

  const credit = customers.find((c) => c.id === customerId);
  const blocked = lines.length === 0 || !check.ok || (method === 'credit' && !customerId);

  return (
    <div className="pos">
      <section>
        <form onSubmit={onSearch} className="row" role="search">
          <div>
            <label htmlFor="q">Scan barcode or search name / SKU</label>
            <input id="q" ref={searchBox} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus autoComplete="off" />
          </div>
          <div className="fit"><button disabled={pending}>Find</button></div>
        </form>
        {error && <div className="msg error" role="alert" style={{ marginTop: '.75rem' }}>{error}</div>}
        <div className="results" style={{ marginTop: '.75rem' }}>
          {results.map((p) => (
            <button key={p.id} type="button" onClick={() => add(p)} disabled={p.stock !== null && p.stock <= 0}>
              <span>{p.name}<br /><small className="muted">{p.sku}</small></span>
              <span style={{ textAlign: 'right' }}>{money(p.price)}<br /><small className="muted">{p.stock === null ? 'not tracked' : `${p.stock} in stock`}</small></span>
            </button>
          ))}
        </div>
      </section>

      <aside className="card cart">
        <h2>Cart</h2>
        {lines.length === 0 && <p className="muted">Scan or search to add items.</p>}
        <table>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.product.id}>
                <td>{l.product.name}<br /><small className="muted">{money(l.product.price)} · {money(calcLine(cartLines[i]).total)}</small></td>
                <td>
                  <input className="qty" type="number" min="0" step="any" value={l.qty} aria-label={`Quantity for ${l.product.name}`}
                    onChange={(e) => { const q = Number(e.target.value); setLines((p) => q <= 0 ? p.filter((x) => x !== l) : p.map((x) => x === l ? { ...x, qty: q } : x)); }} />
                  {canDiscount && (
                    <input className="qty" type="number" min="0" step="0.01" placeholder="disc." value={l.discount || ''} aria-label={`Discount for ${l.product.name}`}
                      onChange={(e) => setLines((p) => p.map((x) => x === l ? { ...x, discount: Number(e.target.value) || 0 } : x))} />
                  )}
                </td>
                <td><button type="button" className="ghost" aria-label={`Remove ${l.product.name}`} onClick={() => setLines((p) => p.filter((x) => x !== l))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="stack" style={{ marginTop: '1rem' }}>
          {totals.taxTotal > 0 && <div className="row"><span className="muted">Tax</span><span style={{ textAlign: 'right' }}>{money(totals.taxTotal)}</span></div>}
          <div className="total">{money(totals.total)}</div>

          {customers.length > 0 && (
            <div><label htmlFor="cust">Customer (optional)</label>
              <select id="cust" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Walk-in</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          )}
          <div className="paybtns" role="group" aria-label="Payment method">
            {METHODS.map((m) => (
              <button key={m} type="button" className={m === method ? 'on' : 'ghost'} onClick={() => setMethod(m)} disabled={m === 'credit' && !customerId}>{m}</button>
            ))}
          </div>
          <div><label htmlFor="tender">Amount received (blank = exact)</label>
            <input id="tender" type="number" min="0" step="0.01" value={tendered} onChange={(e) => setTendered(e.target.value)} /></div>
          {check.ok && check.change > 0 && <div className="msg ok">Change due: <b>{money(check.change)}</b></div>}
          {method === 'credit' && credit && <div className="muted">Credit available: {money(credit.available)}</div>}
          <button type="button" disabled={blocked || pending} onClick={pay} style={{ width: '100%', padding: '.8rem' }}>
            {pending ? 'Processing…' : `Charge ${money(totals.total)}`}
          </button>
          <small className="muted">The server re-checks prices, stock and payment before saving. Nothing is saved unless everything succeeds.</small>
        </div>
      </aside>
    </div>
  );
}
