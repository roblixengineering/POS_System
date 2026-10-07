# Operations runbook

## Backups and recovery
- Primary: Supabase automated backups (PITR on paid plans). Secondary: `scripts/maintenance/backup.sh` (logical dump) to encrypted storage outside the repo; keep backup credentials separate from source.
- **Define before launch:** RPO (e.g. ≤ 15 min with PITR) and RTO (e.g. ≤ 4 h), and the named owner who runs recovery.
- Monthly: `restore-check.sh <dump>` into a scratch DB and compare row counts. Record the result.
- Recovery steps: freeze writes (maintenance banner) → restore to a new project or PITR timestamp → run `supabase db push` if behind → point env vars to the restored project → verify `/api/health`, a test sale and stock totals → unfreeze.

## Monitoring
Uptime on `/api/health`; error reporting (Sentry) for Server Actions; Supabase dashboard for DB CPU, connections, slow queries; alert on failed logins spikes.

## Routine checks
Weekly: audit-log review for `stock.adjusted`, `sale.refund`, `sale.price_override`, `data.exported`. Daily: close all cash sessions; review differences.

## Incidents
Wrong stock: never edit tables — use `inv_adjust_stock` (audited). Wrong sale: refund via `pos_refund_sale`. Suspected leak: rotate keys (Supabase → API), disable affected users (`admin_update_member`), export audit log, notify per your privacy terms.

## Data export / offboarding
Owners can export CSVs from Settings (audited). For full tenant export use `pg_dump` filtered by `business_id` or a Supabase backup; follow the data-export policy in your commercial terms.
