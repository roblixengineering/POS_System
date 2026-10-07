# Contributing
- Branch from `main`; small PRs; CI must pass (lint, typecheck, unit, build, DB tests).
- **Schema changes = new migration** in `supabase/migrations` (+ RLS policy + pgTAP test). Never edit applied migrations or production tables by hand.
- Anything that changes money or stock goes through a SQL RPC and gets a test.
- Keep secrets out of Git. Conventional commits (`feat:`, `fix:`, `docs:`).
- Format with Prettier; follow ESLint.
