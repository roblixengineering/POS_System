export interface Branch { id: string; code: string; name: string; address: string | null; timezone: string; is_active: boolean }
export interface Warehouse { id: string; branch_id: string; name: string; is_default: boolean; is_active: boolean }
export interface Register { id: string; branch_id: string; name: string; is_active: boolean }
export interface Product {
  id: string; sku: string; barcode: string | null; name: string; unit: string;
  price: number; tax_rate: number; reorder_level: number; track_stock: boolean; is_active: boolean;
}
export interface Customer { id: string; name: string; phone: string | null; credit_limit: number; balance: number }
export interface Supplier { id: string; name: string; phone: string | null; balance: number }
export interface ReportSummary {
  from: string; to: string; gross_sales: number; returns: number; net_sales: number; transactions: number;
  cost_of_goods: number | null; gross_profit: number | null; expenses: number | null; net_result: number | null;
  low_stock: number;
  top_products: { product_id: string; product_name: string; qty: number; revenue: number }[];
  branches: { id: string; name: string; net_sales: number; transactions: number; gross_profit: number | null }[];
  payment_mix: { method: string; amount: number }[];
}
