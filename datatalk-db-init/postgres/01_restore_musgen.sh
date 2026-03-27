#!/bin/bash
set -e

DUMP_FILE="musgen_2_2026-02-07_19-50-05.dump"
DUMP_PATH="/docker-entrypoint-initdb.d/$DUMP_FILE"
if [ ! -f "$DUMP_PATH" ]; then
  DUMP_PATH="/init/$DUMP_FILE"
fi

HOST_OPT=""
if [ -n "${PGHOST:-}" ]; then
  HOST_OPT="-h $PGHOST"
fi

echo "=== Creating musgen_2 database ==="
psql $HOST_OPT -U postgres -c "SELECT 1 FROM pg_database WHERE datname = 'musgen_2'" | grep -q 1 || \
  psql $HOST_OPT -U postgres -c "CREATE DATABASE musgen_2;"

echo "=== Restoring musgen_2 dump ==="
pg_restore $HOST_OPT -U postgres -d musgen_2 --no-owner --no-privileges --if-exists --clean -v "$DUMP_PATH" || \
  echo "pg_restore completed (some warnings may be expected)"

echo "=== musgen_2 database ready ==="
psql $HOST_OPT -U postgres -d musgen_2 -c "\dt" || true
