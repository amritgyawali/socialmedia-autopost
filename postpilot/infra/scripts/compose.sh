#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$INFRA_DIR/.env" ]]; then
  echo "Missing $INFRA_DIR/.env (copy .env.example and fill it first)." >&2
  exit 1
fi

if [[ ! -f "$INFRA_DIR/.deploy.env" ]]; then
  echo "Missing $INFRA_DIR/.deploy.env (copy .deploy.env.example and set ENGINE_IMAGE)." >&2
  exit 1
fi

exec docker compose \
  --project-directory "$INFRA_DIR" \
  --env-file "$INFRA_DIR/.env" \
  --env-file "$INFRA_DIR/.deploy.env" \
  -f "$INFRA_DIR/docker-compose.yml" \
  "$@"

