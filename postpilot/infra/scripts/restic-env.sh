#!/usr/bin/env bash

# This file is sourced by backup scripts. It intentionally does not enable shell
# options because the caller owns those settings.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$INFRA_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  return 1
fi

# Parse only the values this script needs. The Docker dotenv file is never
# executed as a shell script, so a provider secret remains inert data.
# shellcheck disable=SC1091
source "$SCRIPT_DIR/dotenv.sh"

required=(
  BACKUP_R2_ACCOUNT_ID
  BACKUP_R2_ACCESS_KEY_ID
  BACKUP_R2_SECRET_ACCESS_KEY
  BACKUP_R2_BUCKET
  RESTIC_PASSWORD
  DB_NAME
  DB_USER
)

for name in "${required[@]}"; do
  value="$(dotenv_get "$ENV_FILE" "$name")"
  printf -v "$name" '%s' "$value"
  export "$name=${!name}"
  if [[ -z "${!name}" || "${!name}" == CHANGE_ME* ]]; then
    echo "Set $name in $ENV_FILE" >&2
    return 1
  fi
done

export AWS_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
export RESTIC_REPOSITORY="s3:https://${BACKUP_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BACKUP_R2_BUCKET}"

compose() {
  bash "$SCRIPT_DIR/compose.sh" "$@"
}
