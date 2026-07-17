#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <ghcr.io image@sha256:digest>" >&2
  exit 64
fi

IMAGE_REF="$1"
if [[ ! "$IMAGE_REF" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]]; then
  echo "Refusing a mutable or malformed image reference: $IMAGE_REF" >&2
  exit 64
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$INFRA_DIR/.env"
DEPLOY_ENV="$INFRA_DIR/.deploy.env"
LOCK_FILE="$INFRA_DIR/.deploy.lock"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$SCRIPT_DIR/dotenv.sh"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another PostPilot deployment is already running." >&2
  exit 75
fi

API_DOMAIN="$(dotenv_get "$ENV_FILE" API_DOMAIN)"
if [[ -z "$API_DOMAIN" ]]; then
  echo "API_DOMAIN is not set in $ENV_FILE" >&2
  exit 1
fi
if [[ ! "$API_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "API_DOMAIN contains invalid hostname characters" >&2
  exit 1
fi

previous_file="$(mktemp "$INFRA_DIR/.deploy.previous.XXXXXX")"
had_previous=false
if [[ -f "$DEPLOY_ENV" ]]; then
  cp -- "$DEPLOY_ENV" "$previous_file"
  had_previous=true
fi

cleanup() {
  rm -f -- "$previous_file"
}
trap cleanup EXIT

write_deploy_env() {
  local ref="$1"
  local next_file
  next_file="$(mktemp "$INFRA_DIR/.deploy.next.XXXXXX")"
  printf 'ENGINE_IMAGE=%s\n' "$ref" >"$next_file"
  chmod 600 "$next_file"
  mv -f -- "$next_file" "$DEPLOY_ENV"
}

compose() {
  docker compose \
    --project-directory "$INFRA_DIR" \
    --env-file "$ENV_FILE" \
    --env-file "$DEPLOY_ENV" \
    -f "$INFRA_DIR/docker-compose.yml" \
    "$@"
}

rollback() {
  if [[ "$had_previous" == true ]]; then
    echo "Health check failed; rolling back to the previous engine image." >&2
    cp -- "$previous_file" "$DEPLOY_ENV"
    compose pull engine || true
    compose up -d --remove-orphans || true
  else
    echo "Health check failed and no previous image is recorded." >&2
  fi
}

write_deploy_env "$IMAGE_REF"
compose config --quiet
compose pull engine
compose up -d --remove-orphans

healthy=false
for _ in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 5 \
    "https://${API_DOMAIN}/actuator/health" >/dev/null; then
    healthy=true
    break
  fi
  sleep 5
done

if [[ "$healthy" != true ]]; then
  compose ps >&2 || true
  compose logs --tail=150 engine caddy >&2 || true
  rollback
  exit 1
fi

compose ps
docker image prune -f >/dev/null
echo "Deployed $IMAGE_REF"
