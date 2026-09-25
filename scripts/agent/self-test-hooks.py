#!/usr/bin/env python3
"""Direct-invocation tests for hook scripts. Does not run destructive commands."""
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))


def run_hook(script, payload):
    proc = subprocess.run(
        [sys.executable, os.path.join(ROOT, script)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        cwd=ROOT,
        timeout=15,
    )
    try:
        body = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        body = {"_raw": proc.stdout, "_err": proc.stderr}
    return proc.returncode, body


def expect(cond, msg):
    if not cond:
        print("FAIL", msg)
        return False
    print("OK  ", msg)
    return True


def main():
    ok = True
    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "echo PA_HOOK_PROBE_DENY", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "deny", "probe token deny")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "docker compose down -v", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "deny", "compose down -v deny (string only)")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "git reset --hard", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "deny", "reset --hard deny")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "npm test", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "allow", "npm test allow")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "docker compose up -d", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "allow", "compose up allow")

    code, body = run_hook(".cursor/hooks/before-read.py", {"file_path": os.path.join(ROOT, ".env")})
    ok &= expect(code == 0 and body.get("permission") == "deny", ".env deny")

    code, body = run_hook(".cursor/hooks/before-read.py", {"file_path": os.path.join(ROOT, ".env.example")})
    ok &= expect(code == 0 and body.get("permission") == "allow", ".env.example allow")

    code, body = run_hook(".cursor/hooks/before-read.py", {"file_path": os.path.join(ROOT, "AGENTS.md")})
    ok &= expect(code == 0 and body.get("permission") == "allow", "AGENTS.md allow")

    code, body = run_hook(".cursor/hooks/stop.py", {"status": "completed", "loop_count": 0})
    ok &= expect(code == 0 and isinstance(body, dict), "stop returns JSON")

    code, body = run_hook(".cursor/hooks/stop.py", {"status": "completed", "loop_count": 1})
    ok &= expect(code == 0 and body == {}, "stop no loop after first followup")

    # Git dest/refspec — not a substring of "main".
    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "git push origin agent/main-fix", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "allow", "push feature branch with main in the name")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "git push origin HEAD:main", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "deny", "push HEAD:main deny")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "git push origin refs/heads/main", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "deny", "push refs/heads/main deny")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "git push --force origin chore/x", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "deny", "force-push deny even off main")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "git push -f origin agent/main-fix", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "deny", "short -f deny")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "git push --force-with-lease origin chore/x", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "deny", "force-with-lease deny")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "git push origin +HEAD:main", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "deny", "+HEAD:main force refspec deny")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "npm test # git push origin main", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "allow", "comment mentioning main is not a push")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": 'echo "git push origin main"', "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "allow", "echo text mentioning main is not a push")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "git push", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "ask", "bare git push is ambiguous")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "git push origin", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "ask", "push remote without refspec is ambiguous")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "git push origin HEAD", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "ask", "push HEAD without dest is ambiguous")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "bash -c 'git push origin agent/main-fix'", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "allow", "bash -c feature branch with main in name")

    code, body = run_hook(".cursor/hooks/before-shell.py", {"command": "bash -c 'git push origin main'", "cwd": ROOT})
    ok &= expect(code == 0 and body.get("permission") == "deny", "bash -c push main deny")

    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
