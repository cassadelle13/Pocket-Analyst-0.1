#!/usr/bin/env bash
# Validate rollback inputs. Does not apply a rollback.
#   scripts/agent/rollback-check.sh
# Exit: 0 plan is consistent, 1 backup/manifest problem, 2 usage.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
# env.sh sets PA_ROOT to this checkout (Node/path). Isolated fixtures override via PA_ROLLBACK_ROOT.
source "$SCRIPT_DIR/env.sh"
if [ -n "${PA_ROLLBACK_ROOT:-}" ]; then
  PA_ROOT="$PA_ROLLBACK_ROOT"
fi
cd "$PA_ROOT"

BACKUP_REF="${PA_ROLLBACK_BACKUP:-backup/pre-agent-env-20260925}"
MANIFEST="${PA_ROLLBACK_MANIFEST:-$SCRIPT_DIR/rollback-manifest.txt}"
EXCLUDES="${PA_ROLLBACK_EXCLUDES:-$SCRIPT_DIR/secret-excludes}"

if [ "${1:-}" = "--apply" ] || [ "${PA_ROLLBACK_APPLY:-}" = "1" ]; then
  echo "[rollback] refuse: apply is not performed by this script" >&2
  exit 2
fi

if ! git rev-parse --verify "${BACKUP_REF}^{commit}" >/dev/null 2>&1; then
  echo "[rollback] FAIL: backup ref missing: $BACKUP_REF" >&2
  exit 1
fi
BACKUP_SHA="$(git rev-parse "${BACKUP_REF}^{commit}")"
echo "[rollback] backup $BACKUP_REF = $BACKUP_SHA"

if [ ! -f "$MANIFEST" ] || [ ! -s "$MANIFEST" ]; then
  echo "[rollback] FAIL: empty or missing $MANIFEST" >&2
  exit 1
fi
if [ ! -f "$EXCLUDES" ]; then
  echo "[rollback] FAIL: missing $EXCLUDES" >&2
  exit 1
fi

is_secret_path() {
  local rel="$1" base
  base="$(basename "$rel")"
  case "$base" in
    .env|.env.local|.env.development.local|.env.test.local|.env.production.local) return 0 ;;
    *.pem|*.key|*.p12|*.pfx|id_rsa|id_ed25519|credentials.json) return 0 ;;
  esac
  [[ "$rel" == *serviceAccount*.json ]] && return 0
  return 1
}

unexpected=0
missing=0
while IFS= read -r rel || [ -n "${rel:-}" ]; do
  [[ -z "$rel" || "$rel" == \#* ]] && continue
  if is_secret_path "$rel"; then
    echo "[rollback] FAIL: manifest names a secret path: $rel" >&2
    exit 1
  fi
  if [ ! -e "$PA_ROOT/$rel" ]; then
    echo "[rollback] missing listed path (ok if already removed): $rel"
    missing=$((missing + 1))
  fi
done < "$MANIFEST"

# New setup-like untracked files must be added to the manifest before rollback is considered safe.
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  is_secret_path "$rel" && continue
    if ! grep -Fxq "$rel" "$MANIFEST"; then
    setup=0
    case "$rel" in
      AGENTS.md|SETUP_REPORT.md|SETUP_REVIEW.md|.nvmrc|.github/pull_request_template.md|.github/workflows/verify.yml|dashboard/tsconfig.typecheck.json|datatalk-agent/src/rolePolicy.ts)
        setup=1 ;;
    esac
    [[ "$rel" == .cursor/* || "$rel" == scripts/agent/* || "$rel" == datatalk-agent/test/* ]] && setup=1
    [[ "$rel" == dashboard/src/* && "$rel" == *"/__tests__/"* ]] && setup=1
    if [ "$setup" -eq 1 ]; then
      echo "[rollback] UNEXPECTED setup path not in manifest: $rel" >&2
      unexpected=$((unexpected + 1))
    fi
  fi
done < <(git ls-files --others --exclude-standard)

if [ "$unexpected" -gt 0 ]; then
  echo "[rollback] FAIL: $unexpected path(s) not in $MANIFEST — stop, do not delete blindly" >&2
  exit 1
fi

echo "[rollback] CHECK ok manifest=$(grep -cve '^[[:space:]]*$' "$MANIFEST") unexpected=0"
exit 0
