#!/usr/bin/env python3
"""beforeShellExecution: deny destructive git/docker/db commands. Fail closed via hooks.json.

This is a string filter, not a security boundary. Probe token: PA_HOOK_PROBE_DENY

Git push policy (not a general shell parser):
- Look at git invocations and their tokens, not the word "main" anywhere in the line.
- Destination ref is the right-hand side of a refspec (src:dst), or the sole refspec.
- Protected dest: last path component is exactly "main" (main, refs/heads/main, HEAD:main).
- Feature branches whose name only contains "main" (agent/main-fix) are allowed.
- Force flags and +refspec are denied regardless of dest.
- Comments and echo/printf text are not git commands.
- Nested `bash/sh/zsh -c '…'` is parsed as another command string.
- Ambiguous dest (bare `git push`, `HEAD` without :dst, $vars, eval/xargs) → ask.
"""
import json
import re
import sys

GIT_GLOBALS_WITH_ARG = {
    "-C", "--git-dir", "--work-tree", "--namespace", "-c",
    "--config-env", "--exec-path", "--list-cmds",
}

PUSH_OPTS_WITH_ARG = {
    "--repo", "--exec", "--receive-pack", "--thin",
    "--push-option", "-o", "--signed", "--recurse-submodules",
}

SHELL_WRAPPERS = {"bash", "sh", "zsh", "/bin/bash", "/bin/sh", "/bin/zsh"}


def read_input():
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def strip_hash_comments(text: str) -> str:
    out = []
    quote = None
    i = 0
    while i < len(text):
        ch = text[i]
        if quote:
            out.append(ch)
            if ch == "\\" and quote == '"' and i + 1 < len(text):
                out.append(text[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch in ("'", '"'):
            quote = ch
            out.append(ch)
            i += 1
            continue
        if ch == "#":
            while i < len(text) and text[i] != "\n":
                i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def split_statements(text: str):
    parts = []
    buf = []
    quote = None
    i = 0
    while i < len(text):
        ch = text[i]
        if quote:
            buf.append(ch)
            if ch == "\\" and quote == '"' and i + 1 < len(text):
                buf.append(text[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch in ("'", '"'):
            quote = ch
            buf.append(ch)
            i += 1
            continue
        if ch == "\n":
            parts.append("".join(buf))
            buf = []
            i += 1
            continue
        if text.startswith("&&", i) or text.startswith("||", i):
            parts.append("".join(buf))
            buf = []
            i += 2
            continue
        if ch == ";":
            parts.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    parts.append("".join(buf))
    return [p.strip() for p in parts if p.strip()]


def tokenize(stmt: str):
    tokens = []
    buf = []
    quote = None
    i = 0
    while i < len(stmt):
        ch = stmt[i]
        if quote:
            if ch == "\\" and quote == '"' and i + 1 < len(stmt):
                buf.append(stmt[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = None
                i += 1
                continue
            buf.append(ch)
            i += 1
            continue
        if ch in ("'", '"'):
            quote = ch
            i += 1
            continue
        if ch.isspace():
            if buf:
                tokens.append("".join(buf))
                buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    if buf:
        tokens.append("".join(buf))
    return tokens


def is_git_token(tok: str) -> bool:
    base = tok.rsplit("/", 1)[-1]
    return base in {"git", "git.exe"}


def dest_from_refspec(spec: str):
    force = spec.startswith("+")
    body = spec[1:] if force else spec
    if ":" in body:
        _src, dst = body.rsplit(":", 1)
        return dst, force
    return body, force


def is_protected_main(dest: str) -> bool:
    d = dest.strip().rstrip("/")
    if not d:
        return False
    last = d.split("/")[-1]
    return last == "main"


def is_unknown_dest(dest: str) -> bool:
    if dest in {"", "HEAD"}:
        return True
    if "$" in dest or "`" in dest:
        return True
    return False


def parse_push_args(args):
    force = False
    positionals = []
    i = 0
    while i < len(args):
        a = args[i]
        if a in {"--force", "-f", "--force-with-lease", "--force-if-includes"} or a.startswith("--force-with-lease=") or a.startswith("--force-if-includes="):
            force = True
            i += 1
            continue
        if a in PUSH_OPTS_WITH_ARG:
            i += 2 if i + 1 < len(args) else i + 1
            continue
        if a.startswith("-"):
            i += 1
            continue
        positionals.append(a)
        i += 1

    if not positionals:
        return "ask", "git push without an explicit destination ref (ambiguous)"

    first = positionals[0]
    if ":" in first or first.startswith("refs/") or first.startswith("+") or first == "HEAD":
        refspecs = positionals
    else:
        refspecs = positionals[1:]
        if not refspecs:
            return "ask", "git push to a remote without a refspec (current branch unknown)"

    for spec in refspecs:
        dest, spec_force = dest_from_refspec(spec)
        if spec_force:
            force = True
        if is_unknown_dest(dest):
            return "ask", "git push destination ref is ambiguous (HEAD or expansion)"
        if is_protected_main(dest):
            return "deny", "push to main is not allowed"

    if force:
        return "deny", "force-push is not allowed"
    return "allow", ""


def walk_tokens(tokens):
    findings = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        base = tok.rsplit("/", 1)[-1]
        if base in SHELL_WRAPPERS or tok in SHELL_WRAPPERS:
            j = i + 1
            while j < len(tokens):
                if tokens[j] in {"-c", "-lc"} and j + 1 < len(tokens):
                    findings.extend(analyze_command(tokens[j + 1]))
                    break
                if tokens[j].startswith("-"):
                    j += 1
                    continue
                break
            i += 1
            continue
        if is_git_token(tok):
            j = i + 1
            while j < len(tokens):
                t = tokens[j]
                if t in GIT_GLOBALS_WITH_ARG:
                    j += 2
                    continue
                if t.startswith("--git-dir=") or t.startswith("--work-tree=") or t.startswith("--namespace="):
                    j += 1
                    continue
                if t.startswith("-") and t not in {"-C", "-c"}:
                    j += 1
                    continue
                if t == "push":
                    findings.append(parse_push_args(tokens[j + 1 :]))
                    break
                break
        i += 1
    return findings


def analyze_command(command: str):
    findings = []
    stripped = strip_hash_comments(command or "")
    for stmt in split_statements(stripped):
        tokens = tokenize(stmt)
        if tokens and tokens[0] in {"eval", "xargs"}:
            findings.append(("ask", "eval/xargs around git is ambiguous; needs a human check"))
            continue
        findings.extend(walk_tokens(tokens))
    return findings


def decide(command: str):
    cmd = command or ""
    if "PA_HOOK_PROBE_DENY" in cmd:
        return "deny", "Hook probe token denied (safe stand)."

    rules = [
        (r"(^|[;&|]|&&)\s*docker(\s+compose|\s+-f\s+\S+)*\s+down\b[^\n]*(-v|--volumes)\b",
         "docker compose down with volumes would delete owner data"),
        (r"\bdocker\s+volume\s+(rm|prune)\b", "docker volume rm/prune"),
        (r"\bgit\s+reset\s+--hard\b", "git reset --hard"),
        (r"\bgit\s+clean\b[^\n]*-[^\n]*f", "git clean -f"),
        (r"\b(psql|clickhouse-client)\b[^\n]*\b(DROP|TRUNCATE|DELETE\s+FROM)\b",
         "destructive SQL client command"),
        (r"\brm\s+-rf\s+[^\n]*(clickhouse_data|postgres_data|datatalk_.*_data|/var/lib/postgresql|/var/lib/clickhouse)",
         "rm -rf on a data directory"),
    ]
    for pat, reason in rules:
        if re.search(pat, cmd, re.I):
            return "deny", reason

    if re.search(r"\bcloudflared\s+tunnel\s+(run|route)\b", cmd, re.I):
        return "ask", "cloudflared tunnel changes need a human"

    push_findings = analyze_command(cmd)
    for perm, reason in push_findings:
        if perm == "deny":
            return perm, reason
    for perm, reason in push_findings:
        if perm == "ask":
            return perm, reason

    return "allow", ""


def main():
    try:
        data = read_input()
    except Exception:
        sys.stdout.write(json.dumps({
            "permission": "deny",
            "user_message": "before-shell hook received invalid JSON; blocked because failClosed.",
            "agent_message": "before-shell hook: invalid stdin JSON",
        }))
        return 0

    permission, reason = decide(str(data.get("command") or ""))
    out = {"permission": permission}
    if reason:
        out["user_message"] = reason
        out["agent_message"] = reason
    sys.stdout.write(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
