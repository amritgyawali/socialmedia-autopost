#!/usr/bin/env python3
"""Inject social developer-app credentials from social.env into the Postiz compose file.

Only non-empty values are written. Each KEY must already exist in the compose
'environment:' block as `KEY: '...'`. Reports which keys changed; never prints secret values.
"""
import base64
import re
from pathlib import Path

BASE = Path("/opt/postiz")
ENV = BASE / "social.env"
COMPOSE = BASE / "docker-compose.production.yaml"


def load_env(path: Path) -> dict:
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        out[key.strip()] = val.strip()
    return out


def looks_like_x_oauth2_client_id(val: str) -> bool:
    """X's OAuth 2.0 Client ID is base64 of '<id>:<digit>:<2 letters>'.

    Postiz signs X with OAuth 1.0a and needs the 25-char Consumer API Key instead.
    The two are easy to confuse in the developer portal, and pasting the OAuth 2.0
    value produces a silent 401 only at publish time, so reject it here.
    """
    try:
        decoded = base64.b64decode(val + "==").decode("utf-8")
    except Exception:
        return False
    return bool(re.fullmatch(r".{15,25}:[0-9]:[a-z]{2}", decoded))


def reject(key: str, val: str) -> str | None:
    """Return a reason to skip this key, or None to accept it."""
    if key == "X_API_KEY":
        if looks_like_x_oauth2_client_id(val):
            return "this is the OAuth 2.0 Client ID; Postiz needs the OAuth 1.0a API Key"
        if len(val) != 25:
            return f"expected the 25-char OAuth 1.0a API Key, got {len(val)} chars"
    return None


def main() -> None:
    env = load_env(ENV)
    text = COMPOSE.read_text(encoding="utf-8")
    changed, missing, refused = [], [], []
    x_key_refused = False
    x_key_val = env.get("X_API_KEY", "")
    if x_key_val and reject("X_API_KEY", x_key_val):
        x_key_refused = True
    for key, val in env.items():
        if val == "":
            continue
        reason = reject(key, val)
        if reason is None and key == "X_API_SECRET" and x_key_refused:
            reason = "paired with X_API_KEY, which was refused"
        if reason:
            refused.append(f"{key} ({reason})")
            continue
        pattern = re.compile(r"^(?P<indent>[ \t]+)" + re.escape(key) + r": '.*?'[ \t]*$", re.M)
        if not pattern.search(text):
            missing.append(key)
            continue
        safe = val.replace("'", "''")  # YAML single-quoted scalar: escape ' by doubling
        text = pattern.sub(lambda m: f"{m.group('indent')}{key}: '{safe}'", text, count=1)
        changed.append(key)
    COMPOSE.write_text(text, encoding="utf-8")
    print("Set credentials for:", ", ".join(changed) if changed else "(none)")
    if refused:
        print("REFUSED (compose left unchanged for these, existing value kept):")
        for item in refused:
            print("  -", item)
    if missing:
        print("WARNING: these keys are not in the compose file - add them manually:", ", ".join(missing))
    print("Recreate now:  cd /opt/postiz && sudo docker compose -f docker-compose.production.yaml up -d")


if __name__ == "__main__":
    main()
