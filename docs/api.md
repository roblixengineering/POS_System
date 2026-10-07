# Server contracts

All RPCs are called as the signed-in user (`supabase.rpc`). Errors are raised as readable messages; SQLSTATE `42501` = permission/branch denied, `23514` = insufficient stock, `28000` = unauthenticated.

| RPC | Permission | Input | Effect |
|---|---|---|---|
| `bootstrap_business(name, currency, full_name, branch_name, branch_code)` | authenticated, no profile | | business, roles, branch, store, register, owner profile |
| `pos_open_session(register_id, opening_cash)` | `cash.manage` | | one open session per register |
| `pos_close_session(session_id, closing_cash, note)` | `cash.manage` (+`cash.manage_all` for others') | | expected vs counted; audited |
| `pos_create_sale(branch, register, customer, items, payments, idempotency_key, note)` | `sales.create` + branch | items `[{product_id, qty, discount?, unit_price?}]`, payments `[{method, amount, reference?}]` | invoice, lines, payments, stock movements, credit balance — atomic |
| `pos_refund_sale(sale_id, items, reason, method, restock)` | `sales.refund` + branch | items `[{sale_item_id, qty}]` | return, stock +, refund record, status, audit |
| `inv_receive_stock(branch, warehouse, supplier, delivery_ref, received_at, items, amount_paid, notes)` | `inventory.receive` + branch | items `[{product_id, qty, unit_cost}]` | purchase, lines, stock +, cost update, supplier balance |
| `inv_adjust_stock(warehouse, product, qty_delta, reason, note)` | `inventory.adjust` + branch | | movement + audit |
| `inv_create_transfer(from, to, items, notes)` | `inventory.transfer` | | draft |
| `inv_transition_transfer(id, 'approve'\|'complete'\|'cancel')` | `inventory.transfer_approve` / `inventory.transfer` | | state machine; completion moves stock |
| `inv_search_stock(query, limit)` | RLS-scoped | | stock per branch/warehouse |
| `report_summary(from, to, branch)` | `reports.view` (+`reports.profit`) | | KPIs, branches, top products, payment mix |
| `admin_add_member / admin_update_member` | `users.manage` | | staff profile + branch scope |
| `admin_create_branch` | `branches.manage` | | branch + store + register |
| `audit_export(table, rows)` | `data.export` | | audit entry |

HTTP routes: `GET /api/health`, `GET /api/export/[table]` (CSV; permission-checked, audited).
