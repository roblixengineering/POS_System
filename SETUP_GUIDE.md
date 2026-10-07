# Cloud POS — Setup Guide

Two paths: **A) run it locally** (fastest way to try everything) and **B) go live** (hosted Supabase + web hosting).

## 0. Prerequisites
| Tool | Version | Why |
|---|---|---|
| Node.js | 20.11+ (22 fine) | runs the web app |
| npm | 10+ (included with Node.js) | installs dependencies |
| Docker Desktop | recent (running) | local Supabase runs in containers |
| Git | any | version control |

Windows: use PowerShell or WSL2. Make sure Docker Desktop is started before step A3.

## A. Run locally

**A1. Install dependencies**
```bash
npm install
```
This creates `package-lock.json`. **Commit it** so installs are reproducible in CI.

**A2. Start local Supabase** (first run downloads images, a few minutes)
```bash
npm run db:start
```
Wait for the output block with `API URL`, `anon key` and `service_role key`.

**A3. Create the database + demo data** (applies all 12 migrations, then `seed.sql`)
```bash
npm run db:reset
```

**A4. Configure the web app**
```bash
cp .env.example apps/web/.env.local        # Windows: copy .env.example apps\web\.env.local
```
Paste the values from A2 into `apps/web/.env.local`:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
(re-print them any time with `npx supabase status`).

**A5. Check and start**
```bash
npm run setup:check
npm run dev
```
Open http://localhost:3000. Supabase Studio (database browser): http://127.0.0.1:54323.

**A6. Demo logins** (password for all: `Password123!`)
| Email | Role | Try this |
|---|---|---|
| owner@demo.test | Owner | dashboard, all branches, staff, exports |
| manager@demo.test | Branch Manager (Main Branch) | refunds, receiving, transfers |
| cashier@demo.test | Cashier (Main Branch) | open shift, sell, print receipt |
| owner@rival.test | Owner of a *different* business | proves tenant isolation (sees none of the demo data) |

**First walkthrough (5 minutes):** sign in as cashier → POS → open shift → type `8964000000011` + Enter (Coca Cola 1.5L) → Charge → receipt. Sign in as owner → Dashboard shows the sale and Coca Cola dropping to 9; Inventory → search "Coca" to see Main 9 / DHA 0 / Johar 24 / Back Warehouse 80.

**A7. Run the tests**
```bash
npm test        # unit tests (money maths, validation, permission catalog parity)
npm run db:test     # pgTAP: RLS isolation, atomic sale, overselling blocked, refund restock, append-only ledger
npm run e2e         # needs: npx playwright install chromium (once)
```

## B. Go live

1. **Create a Supabase project** (supabase.com). Choose a region near your shops. Save the database password.
2. **Link and push the schema** (never paste SQL by hand into production):
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   Do **not** run `seed.sql` in production.
3. **Auth settings** (Dashboard → Authentication):
   - Providers → Email: turn **Confirm email ON**.
   - URL Configuration: set Site URL to your production URL.
   - If this is a private install for one customer, turn **Allow new users to sign up OFF** after creating the owner (the onboarding page is public otherwise).
   - Rate limits: keep defaults or tighten.
4. **Realtime**: migration 0009 already adds `stock_levels` and `sales` to the realtime publication. Verify under Database → Publications.
5. **Deploy the web app** to any Node host (Vercel, Netlify, a container). Settings: root = repo root, install `npm install`, build `npm run build`, start `npm run start`, app directory `apps/web`.
   Environment variables (host dashboard, never in Git):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API), `SUPABASE_SERVICE_ROLE_KEY` (**server only**), `NEXT_PUBLIC_APP_URL`.
6. **Create your owner**: open `/signup`, then complete `/onboarding`.
7. **Backups**: confirm Supabase daily backups (Pro plan adds point-in-time recovery). Schedule `scripts/maintenance/backup.sh` as an extra export and run `restore-check.sh` against a scratch DB monthly. Define your RPO/RTO — see `docs/operations.md`.
8. **Monitoring**: add error reporting (e.g. Sentry) and an uptime check on `/api/health`.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `supabase start` fails | Docker Desktop not running, or ports 54321-54324 are busy |
| Login works but you land on /onboarding | Account has no business yet: complete onboarding (or use a seeded demo user after `npm run db:reset`) |
| "open a cash session on this register before selling" | Cashiers must open a shift on POS first |
| "permission denied for column cost" / `select *` on products fails | By design: `cost` is hidden. Select explicit columns, or use the `products_with_cost` view (needs `products.manage`/`reports.profit`) |
| "insufficient stock" | The database refused to oversell. Receive stock or adjust it |
| Seed fails on `auth.users` columns | Supabase CLI/GoTrue version drift: see the comment in `seed.sql`, or create users via Studio and `npm run db:reset` without them |
| `npm run db:test` can't find pgTAP | Run `npx supabase start` first (pgTAP is bundled with Supabase local) |
