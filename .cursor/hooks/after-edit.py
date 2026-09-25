#!/usr/bin/env python3
"""afterFileEdit: run guards on the edited file only. No tsc/build. Writes state for stop hook."""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
STATE = os.path.join(ROOT, ".cursor/state")
NODE_CANDIDATES = [
    os.path.join(ROOT, ".tools/node/bin/node"),
    "node",
]


def find_node():
    for c in NODE_CANDIDATES:
        if c == "node" or os.path.isfile(c):
            return c
    return None


def rel(p):
    try:
        return os.path.relpath(p, ROOT).replace("\\", "/")
    except Exception:
        return p


def main():
    os.makedirs(STATE, exist_ok=True)
    try:
        data = json.loads(sys.stdin.read() or "{}")
    except Exception as e:
        open(os.path.join(STATE, "edit-guard.json"), "w").write(json.dumps({
            "ok": False, "error": "invalid json: " + str(e), "at": datetime.now(timezone.utc).isoformat()
        }))
        return 0

    file_path = str(data.get("file_path") or "")
    rel_path = rel(file_path)
    result = {"file": rel_path, "ok": True, "at": datetime.now(timezone.utc).isoformat()}
    node = find_node()
    if not node:
        result["ok"] = False
        result["error"] = "node not found; skipped guards"
    else:
        env = os.environ.copy()
        tools_bin = os.path.join(ROOT, ".tools/node/bin")
        if os.path.isdir(tools_bin):
            env["PATH"] = tools_bin + os.pathsep + env.get("PATH", "")
        try:
            proc = subprocess.run(
                [node, os.path.join(ROOT, "scripts/agent/guards.mjs"), "--files", rel_path],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
                timeout=20,
            )
            result["exit"] = proc.returncode
            result["output"] = (proc.stdout + proc.stderr)[-2000:]
            result["ok"] = proc.returncode == 0
        except subprocess.TimeoutExpired:
            result["ok"] = False
            result["error"] = "guards timed out (20s)"
        except Exception as e:
            result["ok"] = False
            result["error"] = str(e)

    open(os.path.join(STATE, "edit-guard.json"), "w").write(json.dumps(result, indent=2))
    # afterFileEdit has no official output fields; side effects only.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
