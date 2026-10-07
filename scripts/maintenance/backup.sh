#!/usr/bin/env bash
# Logical backup of the production database. Requires pg_dump and DATABASE_URL (never commit it).
# Provider backups (Supabase PITR/daily) remain the primary safety net; this is the extra export copy.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the direct Postgres connection string}"
OUT_DIR="${1:-backups}"; mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/cloud-pos-$(date +%Y%m%d-%H%M%S).dump"
pg_dump "$DATABASE_URL" --format=custom --no-owner --schema=public --file="$FILE"
echo "Backup written: $FILE  (store it encrypted, away from the source repository)"
