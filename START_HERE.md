# Cloud POS — Simple Setup

This project uses **npm only**. Do not install pnpm or Corepack.

## Option A — easiest: use Supabase Cloud

Use this if you already have a Supabase project.

### 1. Install

Install Node.js 20+.

Then, in the project folder:

```bash
npm install
```

### 2. Create the environment file

```bash
npm run setup
```

Open:

```text
apps/web/.env.local
```

Put your Supabase values there:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Get these from **Supabase → Project Settings → API**.

### 3. Check it

```bash
npm run setup:check
```

### 4. Start the POS

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

> If you use Supabase Cloud, you do **not** need Docker and you do **not** need to run `db:start` or `db:reset`.

---

## Option B — completely local Supabase

Use this if you want the database/Auth running on your own PC. You need **Docker Desktop**.

After `npm install`, the easiest route is one command:

```bash
npm run setup:local
```

That command starts Supabase, creates `apps/web/.env.local` with the local keys, and resets the database with the migrations and demo data.

Then start the POS:

```bash
npm run dev
```

If you prefer to do the local steps manually, use:

```bash
npm run db:start
npm run db:status
npm run db:reset
npm run dev
```

Local Supabase Studio:

```text
http://127.0.0.1:54323
```

The first `db:start` can take several minutes because Supabase downloads Docker images.

---

## Normal commands

You only need these most of the time:

```bash
npm install
npm run dev
npm run build
npm run lint
npm run typecheck
npm test
```

Database commands, only when using local Supabase:

```bash
npm run db:start
npm run db:status
npm run db:reset
npm run db:test
npm run db:stop
```

For browser tests, install Chromium once:

```bash
npx playwright install chromium
```

Then:

```bash
npm run e2e
```

## Demo accounts

Password for seeded demo users:

```text
Password123!
```

- `owner@demo.test` — Owner
- `manager@demo.test` — Branch Manager
- `cashier@demo.test` — Cashier
- `owner@rival.test` — separate tenant used for isolation tests

## If something fails

Do **not** install pnpm.

First run:

```bash
npm install
npm run setup:check
```

If you are using local Supabase, make sure Docker Desktop is running and then run:

```bash
npm run db:reset
```

If there is still an error, send the complete red error text/screenshot.
