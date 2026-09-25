#!/usr/bin/env python3
"""stop: if verification is stale or last check failed, ask the agent to re-verify once.

loop_limit is set to 2 in hooks.json. Does not run a full build.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
STATE = os.path.join(ROOT, ".cursor/state")
NODE = os.path.join(ROOT, ".tools/node/bin/node")


def node_bin():
    if os.path.isfile(NODE):
        return NODE
    return "node"


def main():
    try:
        data = json.loads(sys.stdin.read() or "{}")
    except Exception:
        sys.stdout.write("{}")
        return 0

    status = data.get("status")
    loop_count = int(data.get("loop_count") or 0)
    if status != "completed" or loop_count >= 1:
        sys.stdout.write("{}")
        return 0

    env = os.environ.copy()
    tools_bin = os.path.join(ROOT, ".tools/node/bin")
    if os.path.isdir(tools_bin):
        env["PATH"] = tools_bin + os.pathsep + env.get("PATH", "")

    reasons = []
    try:
        proc = subprocess.run(
            [node_bin(), os.path.join(ROOT, "scripts/agent/verify-stamp.mjs"), "check", "--for-task"],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode != 0:
            reasons.append((proc.stdout + proc.stderr).strip() or "verification stamp missing or stale")
    except Exception as e:
        reasons.append("stamp check failed: " + str(e))

    guard = os.path.join(STATE, "edit-guard.json")
    if os.path.isfile(guard):
        try:
            g = json.loads(open(guard).read())
            if g.get("ok") is False:
                reasons.append("after-edit guards failed on " + str(g.get("file") or "file"))
        except Exception:
            pass

    if not reasons:
        sys.stdout.write("{}")
        return 0

    msg = (
        "Verification is incomplete. "
        + " | ".join(reasons[:3])
        + ". Run `scripts/agent/check.sh affected` and do not claim the task is done. "
        + "Do not start a full next build. Do not update baselines."
    )
    sys.stdout.write(json.dumps({"followup_message": msg}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
