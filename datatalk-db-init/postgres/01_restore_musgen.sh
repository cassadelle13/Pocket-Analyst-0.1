#!/bin/bash
set -e

echo "=== Creating musgen_2 database ==="
psql -U postgres -c "SELECT 1 FROM pg_database WHERE datname = 'musgen_2'" | grep -q 1 || \
  psql -U postgres -c "CREATE DATABASE musgen_2;"

echo "=== Restoring musgen_2 dump ==="
pg_restore -U postgres -d musgen_2 --no-owner --no-privileges --if-exists --clean /docker-entrypoint-initdb.d/musgen_2_2026-02-07_19-50-05.dump 2>/dev/null || \
  echo "pg_restore completed (some warnings may be expected)"

echo "=== musgen_2 database ready ==="
psql -U postgres -d musgen_2 -c "\dt" || true
