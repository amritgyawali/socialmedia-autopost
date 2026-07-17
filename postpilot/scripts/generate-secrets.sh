#!/usr/bin/env bash
set -Eeuo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required" >&2
  exit 1
fi

echo '# Generate once, then place each value only in the documented secret store.'
echo "DB_PASS=$(openssl rand -hex 32)"
echo "COCKPIT_JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')"
echo "VAULT_KEY=$(openssl rand -base64 32 | tr -d '\n')"
echo "RESTIC_PASSWORD=$(openssl rand -base64 48 | tr -d '\n')"

