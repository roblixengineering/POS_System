# Requirements traceability (spec → implementation)

Source: *Cloud Multi-Branch POS — Professional Specification v1.0* (kept alongside the project).

| Spec § | Requirement | Where implemented | Status |
|---|---|---|---|
| 6, 17 | Tenant isolation by RLS | `0006_roles_rls.sql` policies; `supabase/tests/database/00_core.test.sql` | Done |
| 7 | Core tables | migrations 0002–0005 | Done (`settings` = `businesses.settings` jsonb) |
| 8 | Event-driven inventory | `stock_movements` (append-only) + `stock_levels` trigger | Done |
| 9 | Atomic POS transaction | `pos_create_sale` | Done; receipt = printable page |
| 10 | Cross-branch stock search | `inv_search_stock`, permission `inventory.cross_branch` | Done |
| 11 | Low-stock alerts | `v_low_stock`, dashboard widget (threshold = at or below reorder level) | Done |
| 12 | Receiving / truck | `inv_receive_stock`; duplicate delivery refs rejected; no edits, only adjustments | Done |
| 13 | Transfers Draft→Approved→Completed | `inv_transition_transfer` | Done (no In-Transit yet, as specified) |
| 14 | Dashboard / P&L | `report_summary` (profit fields gated by `reports.profit`) | Done |
| 15 | Roles & permission codes | `permissions`, `role_permissions`, `app.has_permission` | Done; role editor UI not built (DB-ready) |
| 16 | Realtime rules | `LiveRefresh` re-fetches; never trusts payloads | Done |
| 17 | Audit sensitive actions | `app.write_audit` + triggers (refunds, adjustments, transfers, price/cost, role changes, exports) | Done |
| 17 | Rate-limit auth | Supabase Auth rate limits (`config.toml`); no custom limiter on RPCs | **Gap** |
| 21 | Test levels | unit, pgTAP (RLS/integration/regression), e2e | Partial: no load or realtime tests |
| 22 | CI/CD | `.github/workflows` | Done (deploy is a template) |
| 23 | Backup/DR | `scripts/maintenance`, `docs/operations.md` | Procedures documented; RPO/RTO to be set by the business |
| 24 | Printing | browser print, 80 mm CSS | Done; thermal/cash-drawer bridge not built (Phase 7) |
| 25 | Offline | not built (Phase 8) | Out of scope |
| 30 | MVP checklist | see below | |

## MVP checklist status
Business/branches ✔ · roles + branch scopes ✔ · products SKU/barcode/cost/price/reorder ✔ · stock per warehouse ✔ · receiving with supplier + delivery metadata ✔ · POS invoices/payments ✔ · stock auto-deduct ✔ · returns restore stock and refund ✔ · transfers ✔ · owner sees branch sales/inventory ✔ · low-stock alerts ✔ · receipts ✔ (browser) · audit logs ✔ · RLS ✔ · critical workflow tests ✔ (pgTAP + unit) · backups documented ✔ · **monitoring/error reporting: not wired (add Sentry)** · customer data export ✔ (CSV).

## Known limitations (be honest with customers)
- Customer/supplier *payments* (settling balances) are not yet recorded; balances move only via credit sales, purchases on account and refunds-to-balance.
- Product edits cannot yet be bulk-imported (CSV import is a good next feature).
- Stock for a product that has never had a movement in a warehouse has no `stock_levels` row, so it cannot trigger a low-stock alert until it has been received or adjusted once.
- Last-purchase-cost policy is used for product cost; switch to weighted average in `inv_receive_stock` if required.
