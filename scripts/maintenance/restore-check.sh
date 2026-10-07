#!/usr/bin/env bash
# Restore a dump into a SCRATCH database to prove the backup works. Never point this at production.
set -euo pipefail
: "${SCRATCH_DATABASE_URL:?Set SCRATCH_DATABASE_URL to an empty throw-away database}"
DUMP="${1:?usage: restore-check.sh path/to/file.dump}"
pg_restore --no-owner --clean --if-exists --dbname="$SCRATCH_DATABASE_URL" "$DUMP"
psql "$SCRATCH_DATABASE_URL" -Atc "select 'sales', count(*) from public.sales union all select 'stock_movements', count(*) from public.stock_movements;"
echo "Restore check finished. Compare the counts with production."
