# Architecture

```
Browser / POS terminal
   │ (HTTPS, Supabase session cookie)
   ▼
Next.js (App Router)
   ├─ Server Components: read data as the signed-in user (RLS applies)
   ├─ Server Actions: Zod validation → supabase.rpc(...)  (no business logic duplicated in JS)
   └─ Middleware: refresh session, redirect unauthenticated users
   ▼
Supabase
   ├─ PostgreSQL: tables, RLS, SECURITY DEFINER RPCs, triggers, pgTAP tests
   ├─ Auth: identity (JWT)         ├─ Realtime: change notifications     └─ Storage: reserved for logos/images
```

## Key decisions
1. **Business rules live in the database** (RPCs). The same rules then apply to the web app, future mobile apps, imports and scripts, and a transaction is atomic by construction.
2. **Identity-derived scope.** `app.require_ctx(permission, branch)` resolves business and branch access from `auth.uid()`; RPC arguments never carry `business_id`.
3. **Ledger + cache inventory.** Movements are immutable; `stock_levels` is a cache updated by a trigger whose upsert row-lock serialises concurrent sales per product/warehouse. Negative stock is rejected unless the business setting allows it.
4. **Idempotent checkout.** The POS sends a UUID per cart; a retry returns the existing sale instead of double-charging.
5. **Immutability.** Payments, return lines, purchase lines, stock movements and audit logs reject UPDATE/DELETE; sale lines allow only `returned_qty` to change; corrections are refunds/adjustments.
6. **Cost confidentiality.** `products.cost` has no column-level SELECT for `authenticated`; exposed through `products_with_cost` to authorised roles only.
7. **Server-side only secrets.** The service-role key is used in exactly one place (creating staff logins) after an explicit permission check.
8. **Realtime is advisory.** `LiveRefresh` calls `router.refresh()` on events and on reconnect.

## Money and rounding
Per line: gross = qty×price (2 dp), discount capped at gross, tax = (gross−discount)×rate (2 dp), total = net + tax. Sale total = sum of line totals. `packages/validation/src/money.ts` previews this; the SQL is authoritative.

## Extending
New feature = new numbered migration (+ RLS + pgTAP test) → RPC if it changes money/stock → Zod schema → server action → page. End every migration that adds functions with `select app.harden_public_functions();`.
