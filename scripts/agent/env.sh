# shellcheck shell=bash
# Sourced by scripts/agent/*.sh. Resolves repo root and a Node.js 20 runtime.
# Uses system node if present, otherwise the portable runtime in .tools/node (see SETUP_REPORT.md).

PA_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PA_ROOT

if [ -x "$PA_ROOT/.tools/node/bin/node" ]; then
  case ":$PATH:" in
    *":$PA_ROOT/.tools/node/bin:"*) ;;
    *) command -v node >/dev/null 2>&1 || export PATH="$PA_ROOT/.tools/node/bin:$PATH" ;;
  esac
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[pa-check] BLOCKED: node not found. Install Node 20 (see .nvmrc) or place a portable runtime in .tools/node." >&2
  exit 3
fi

PA_NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$PA_NODE_MAJOR" != "20" ]; then
  echo "[pa-check] WARN: node $(node -v) differs from .nvmrc (20); CI and Docker use 20." >&2
fi
