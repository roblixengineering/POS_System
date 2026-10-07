# Cloud POS

Multi-tenant, multi-branch, cloud-first point of sale with inventory, receiving, transfers, customers, suppliers, expenses and management reporting. Built to the *Cloud Multi-Branch POS — Architecture Specification v1.0*.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Supabase (PostgreSQL, Auth, Realtime, Storage) · Zod · Vitest · Playwright · npm.

**Start here → [START_HERE.md](START_HERE.md)**

The project uses npm. `pnpm` is not required.

Full setup/deployment reference → [SETUP_GUIDE.md](SETUP_GUIDE.md)

## Design in one paragraph
PostgreSQL is the source of truth. Every privileged action is a **SECURITY DEFINER SQL function** (`pos_create_sale`, `pos_refund_sale`, `inv_receive_stock`, `inv_transition_transfer`, …) that checks permission + branch scope from the authenticated session, then writes invoice, payments and **stock movements in one transaction**. Stock is an append-only ledger (`stock_movements`) with a trigger-maintained cache (`stock_levels`). **Row Level Security** isolates tenants and branches; the browser never supplies `business_id`. Realtime only nudges clients to re-fetch.

## Layout
```
apps/web/            Next.js app (auth, pos, inventory, purchases, sales, customers, suppliers, expenses, reports, branches, settings, api)
packages/validation/ Zod schemas + sale-total preview maths (mirrors the SQL)
packages/permissions Permission codes (parity-tested against the DB catalog)
supabase/migrations/ 0001 … 0012 — the schema, RLS, RPCs (version-controlled; no manual prod edits)
supabase/tests/      pgTAP database tests
supabase/seed.sql    demo data (dev only)
docs/                architecture, database/ERD, security, deployment, api, operations, requirements traceability
scripts/             env check, backup / restore-check
.github/workflows/   ci, e2e, deploy
```

## Commands
`npm install` · `npm run setup` · `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run e2e`

For local Supabase: `npm run setup:local` (or `npm run db:start` · `npm run db:status` · `npm run db:reset` · `npm run db:test` · `npm run db:stop`)

## Status
Phases 1–6 of the roadmap are implemented as an MVP (foundation, POS, inventory, management, reporting, operations basics). Hardware integration, offline POS, variants/batches and double-entry accounting remain future phases. The current build focuses on the cloud POS core and now also enforces tenant ownership at the database FK layer. See `docs/requirements.md` for the traceability matrix and known gaps.
