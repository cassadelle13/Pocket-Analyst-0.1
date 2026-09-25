#!/usr/bin/env bash
# Unified Pocket Analyst checks. Used by skills, hooks, and CI.
#   scripts/agent/check.sh quick|affected|full
# Exit: 0 ok, 1 failed check, 2 tool/config failure, 3 missing runtime.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "$SCRIPT_DIR/env.sh"
cd "$PA_ROOT"

MODE="${1:-quick}"
case "$MODE" in
  quick|affected|full) ;;
  *) echo "usage: scripts/agent/check.sh quick|affected|full" >&2; exit 2 ;;
esac

# Pre-merge `full` includes next build unless the caller explicitly sets PA_CHECK_BUILD=0.
if [ "$MODE" = "full" ] && [ -z "${PA_CHECK_BUILD+x}" ]; then
  PA_CHECK_BUILD=1
fi
BUILD_FLAG=0
if [ "${PA_CHECK_BUILD:-}" = "1" ]; then BUILD_FLAG=1; fi
SUITES=()
record_suite() { SUITES+=("$1"); }
export PA_CHECK_RUNNING=1
export PA_ISOLATED_TMP="${PA_ISOLATED_TMP:-$PA_ROOT/.cursor/state/isolated-tmp}"
mkdir -p "$PA_ISOLATED_TMP"

stamp() {
  local code="$1"
  local suites_csv=""
  if [ "${#SUITES[@]}" -gt 0 ]; then
    suites_csv="$(IFS=,; echo "${SUITES[*]}")"
  fi
  node "$SCRIPT_DIR/verify-stamp.mjs" write --mode "$MODE" --exit "$code" --build "$BUILD_FLAG" --suites "$suites_csv"
}

fail() {
  local code="$1"; shift
  echo "[pa-check] FAIL ($MODE): $*" >&2
  stamp "$code" || true
  exit "$code"
}

CHANGED_FILE="$PA_ROOT/.cursor/state/changed-files.txt"
SCOPE_FILE="$PA_ROOT/.cursor/state/scope.json"
mkdir -p "$PA_ROOT/.cursor/state"
SCOPE_ARGS=(--meta-out "$SCOPE_FILE")
if [ -n "${PA_CHECK_BASE:-}" ]; then
  SCOPE_ARGS+=(--base "$PA_CHECK_BASE")
fi
if [ "$MODE" != "full" ]; then
  SCOPE_ARGS+=(--fail-if-unknown-empty)
fi
node "$SCRIPT_DIR/changed-files.mjs" "${SCOPE_ARGS[@]}" > "$CHANGED_FILE" || fail 2 "task scope unknown or empty"

echo "[pa-check] mode=$MODE build=${BUILD_FLAG} node=$(node -v) changed=$(wc -l < "$CHANGED_FILE" | tr -d ' ') files"
if [ "$MODE" = "full" ] && [ "$BUILD_FLAG" != "1" ]; then
  echo "[pa-check] WARNING: full without build (PA_CHECK_BUILD=0); stamp will not satisfy --require-build" >&2
fi

node "$SCRIPT_DIR/guards.mjs" ${PA_CHECK_BASE:+--base "$PA_CHECK_BASE"} || fail 1 "guards"
record_suite "guards"

node "$SCRIPT_DIR/diag-baseline.mjs" tsc --project dashboard --tsconfig tsconfig.typecheck.json || fail 1 "tsc dashboard vs baseline"
record_suite "tsc-dashboard"
node "$SCRIPT_DIR/diag-baseline.mjs" tsc --project datatalk-agent || fail 1 "tsc datatalk-agent vs baseline"
record_suite "tsc-datatalk-agent"

ESLINT_ARGS=(eslint --project dashboard)
if [ "$MODE" != "full" ] && [ -s "$CHANGED_FILE" ]; then
  dash_files="$(grep -E '^dashboard/.*\.(ts|tsx|js|mjs|cjs)$' "$CHANGED_FILE" | paste -sd, - || true)"
  if [ -n "$dash_files" ]; then
    ESLINT_ARGS+=(--files "$dash_files")
  fi
fi
if [ "$MODE" = "full" ] || grep -q '^dashboard/' "$CHANGED_FILE"; then
  node "$SCRIPT_DIR/diag-baseline.mjs" "${ESLINT_ARGS[@]}" || fail 1 "eslint vs baseline"
  record_suite "eslint-dashboard"
fi

run_dashboard_tests() {
  (
    cd "$PA_ROOT/dashboard"
    if [ "$#" -gt 0 ]; then
      npm test -- "$@"
    else
      npm test
    fi
  ) || fail 1 "vitest ${*:-all}"
  if [ "$#" -gt 0 ]; then
    local p
    for p in "$@"; do
      record_suite "vitest:$p"
    done
  else
    record_suite "vitest:all"
  fi
}

if [ "$MODE" = "quick" ]; then
  echo "[pa-check] quick: static only (no unit tests, no build)"
elif [ "$MODE" = "affected" ]; then
  if grep -qE '^dashboard/src/lib/semantic/' "$CHANGED_FILE"; then
    run_dashboard_tests "src/lib/semantic/__tests__"
  fi
  if grep -qE '^dashboard/src/lib/schema-intelligence/' "$CHANGED_FILE"; then
    run_dashboard_tests "src/lib/schema-intelligence/__tests__"
  fi
  if grep -qE '^dashboard/src/store/' "$CHANGED_FILE"; then
    run_dashboard_tests "src/store/__tests__"
  fi
  if grep -qE '^dashboard/src/components/dashboard/' "$CHANGED_FILE"; then
    run_dashboard_tests src/components/dashboard/__tests__ src/lib/semantic/__tests__/scopeConsistency.test.ts
  fi
  if grep -qE '^dashboard/src/lib/projects|dashboard/src/app/api/projects/' "$CHANGED_FILE"; then
    run_dashboard_tests "src/lib/projects/__tests__"
  fi
  if grep -qE '^dashboard/src/app/api/rest/' "$CHANGED_FILE"; then
    run_dashboard_tests "src/app/api/rest/__tests__"
  fi
  if grep -qE '^dashboard/src/lib/uploads/' "$CHANGED_FILE"; then
    run_dashboard_tests "src/lib/uploads/__tests__"
  fi
  if grep -qE '^datatalk-agent/' "$CHANGED_FILE"; then
    (cd "$PA_ROOT/datatalk-agent" && npm test) || fail 1 "datatalk-agent tests"
    record_suite "datatalk-agent"
  fi
  if grep -qE '^(\.cursor/hooks|scripts/agent/)' "$CHANGED_FILE"; then
    python3 "$SCRIPT_DIR/self-test-hooks.py" || fail 1 "hook self-test"
    record_suite "hook-self-test"
    node "$SCRIPT_DIR/self-test-stamp.mjs" || fail 1 "stamp self-test"
    record_suite "stamp-self-test"
    node "$SCRIPT_DIR/self-test-task-scope.mjs" || fail 1 "task-scope self-test"
    record_suite "task-scope-self-test"
    node "$SCRIPT_DIR/self-test-affected-filters.mjs" || fail 1 "affected-filters self-test"
    record_suite "affected-filters-self-test"
    node "$SCRIPT_DIR/self-test-required-suites.mjs" || fail 1 "required-suites self-test"
    record_suite "required-suites-self-test"
    node "$SCRIPT_DIR/self-test-rollback.mjs" || fail 1 "rollback-check"
    record_suite "rollback-check"
  fi
  suites_csv=""
  if [ "${#SUITES[@]}" -gt 0 ]; then
    suites_csv="$(IFS=,; echo "${SUITES[*]}")"
  fi
  node "$SCRIPT_DIR/lib/requiredSuites.mjs" --changed-file "$CHANGED_FILE" --suites "$suites_csv" --mode affected \
    || fail 1 "affected: uncovered logic or missing suites"
else
  run_dashboard_tests
  (cd "$PA_ROOT/datatalk-agent" && npm test) || fail 1 "datatalk-agent tests"
  record_suite "datatalk-agent"
  PYTHONDONTWRITEBYTECODE=1 python3 -c "import ast; ast.parse(open('ai-service/main.py', encoding='utf-8').read())" || fail 1 "ai-service syntax"
  record_suite "ai-service-syntax"
  node "$SCRIPT_DIR/match-globs.mjs" || fail 1 "rule glob coverage"
  record_suite "rule-globs"
  node "$SCRIPT_DIR/discover-cursor.mjs" || fail 1 "cursor component discovery"
  record_suite "cursor-discover"
  python3 "$SCRIPT_DIR/self-test-hooks.py" || fail 1 "hook self-test"
  record_suite "hook-self-test"
  node "$SCRIPT_DIR/self-test-stamp.mjs" || fail 1 "stamp self-test"
  record_suite "stamp-self-test"
  node "$SCRIPT_DIR/self-test-task-scope.mjs" || fail 1 "task-scope self-test"
  record_suite "task-scope-self-test"
  node "$SCRIPT_DIR/self-test-affected-filters.mjs" || fail 1 "affected-filters self-test"
  record_suite "affected-filters-self-test"
  node "$SCRIPT_DIR/self-test-required-suites.mjs" || fail 1 "required-suites self-test"
  record_suite "required-suites-self-test"
  node "$SCRIPT_DIR/self-test-rollback.mjs" || fail 1 "rollback-check"
  record_suite "rollback-check"
  if [ "${PA_CHECK_BUILD:-}" = "1" ]; then
    (
      cd "$PA_ROOT/dashboard"
      CLICKHOUSE_HOST="${CLICKHOUSE_HOST:-localhost}" \
      CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-analytics}" \
      DATATALK_AGENT_URL="${DATATALK_AGENT_URL:-http://localhost:9010}" \
      DATATALK_AGENT_SHARED_SECRET="${DATATALK_AGENT_SHARED_SECRET:-ci-placeholder-not-a-real-secret}" \
      npm run build
    ) || fail 1 "next build"
    record_suite "next-build"
  fi
fi

echo "[pa-check] PASS ($MODE)"
stamp 0
exit 0
