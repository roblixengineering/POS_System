# Deployment

Environments: **local** (Docker Supabase) → **staging** (separate Supabase project) → **production** (separate project, approval-gated).

1. PR → CI (`lint`, `typecheck`, `test`, `build`, fresh-DB migrations + pgTAP).
2. Merge to `main` → deploy workflow applies `supabase db push` to staging, smoke-test, then production after approval.
3. Web host builds from `main` with environment variables from the host dashboard.
4. **Migration rules:** forward-only, one concern per file, never edit an applied migration, test on staging data volume first. Rollback = a new corrective migration (or restore from backup for disasters).
5. Release: tag, update `CHANGELOG.md`.

Production checklist: email confirmation on · signups policy decided · service-role key only on the server · HTTPS only · backups verified · Sentry + uptime check on `/api/health` · edge rate limits · privacy/terms published.
