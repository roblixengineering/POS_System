# Security

## Controls
| Spec requirement | Control |
|---|---|
| Tenant isolation | RLS on every table (pgTAP asserts no table lacks it); composite FKs on key parents |
| Server-side authorisation | `app.require_ctx` in every RPC; Server Actions also gate with `requirePermission` (defence in depth) |
| Never trust browser scope | `business_id` is a column default from the session; RPCs take no business argument |
| Validate money/stock server-side | RPCs recompute prices/tax/cost; Zod validates inputs; DB CHECK constraints |
| No plaintext passwords | Supabase Auth (bcrypt) |
| Secure sessions | `@supabase/ssr` httpOnly cookies; middleware validates JWT via `getUser()` |
| Rate limiting | Supabase Auth limits. **Add** an edge/WAF rate limit on `/api/export/*` and server actions before launch |
| Audit | refunds, adjustments, transfers, price/cost, role/permission changes, price overrides, exports, shift closes |
| Secrets | env vars only; `.env*` git-ignored; service-role key server-only (`server-only` import) |
| HTTPS | enforce at host; HSTS header set in `next.config.mjs` |
| Backups | see operations.md; protect like production |

## Threat notes
- **IDOR on sale/receipt URLs**: RLS returns no row for other tenants/branches → 404.
- **Privilege escalation via staff admin**: only owners can create/modify owners; users cannot edit themselves; `staffSchema` excludes `owner`.
- **Spreadsheet injection** in CSV exports is neutralised in `cell()`.
- **Open signup**: `/signup` + `bootstrap_business` let anyone create a *new, isolated* business. Disable signups for single-customer installs.
- **SECURITY DEFINER functions** use `set search_path = ''` and schema-qualified names; execute is revoked from `anon`/`public`.
- **Cashier cost visibility** blocked by column privileges.

## Before public launch
Penetration test; add Sentry; add rate limits at the edge; enable email confirmation + leaked-password protection in Supabase Auth; review `SECURITY.md` contact; publish privacy and commercial terms (spec §27).
