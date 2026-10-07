export function formatMoney(value: number | string | null | undefined, currency = 'PKR'): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
}
export const formatQty = (v: number | string) => Number(v).toLocaleString('en', { maximumFractionDigits: 3 });
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
export const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
