#!/usr/bin/env python3
"""beforeReadFile: block secret-bearing files. failClosed in hooks.json."""
import json
import os
import re
import sys

ALLOW_NAMES = {".env.example", ".env.sample", ".env.template"}
DENY_EXACT = {".env", ".env.local", ".env.development.local", ".env.test.local", ".env.production.local"}
DENY_RE = re.compile(
    r"(^|/)("
    r"\.env(\..+)?|"
    r".*\.(pem|key|p12|pfx)|"
    r"id_rsa|id_ed25519|"
    r"credentials\.json|"
    r"serviceAccount.*\.json"
    r")$",
    re.I,
)

def main():
    try:
        data = json.loads(sys.stdin.read() or "{}")
    except Exception:
        sys.stdout.write(json.dumps({
            "permission": "deny",
            "user_message": "before-read hook received invalid JSON; blocked because failClosed.",
        }))
        return 0

    path = str(data.get("file_path") or "")
    base = os.path.basename(path)
    if base in ALLOW_NAMES:
        sys.stdout.write(json.dumps({"permission": "allow"}))
        return 0
    if base in DENY_EXACT or (DENY_RE.search(path.replace("\\", "/")) and base not in ALLOW_NAMES):
        sys.stdout.write(json.dumps({
            "permission": "deny",
            "user_message": "Refused to read a secret-bearing file. Use .env.example and variable names only.",
        }))
        return 0
    sys.stdout.write(json.dumps({"permission": "allow"}))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
