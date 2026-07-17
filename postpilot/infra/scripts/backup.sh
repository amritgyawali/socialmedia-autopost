#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/restic-env.sh"

BACKUP_ROOT="${POSTPILOT_BACKUP_TMP:-/var/tmp/postpilot-backup}"
mkdir -p -- "$BACKUP_ROOT"
work_dir="$(mktemp -d "$BACKUP_ROOT/run.XXXXXXXX")"
dump_file="$work_dir/postpilot-$(date -u +%Y%m%dT%H%M%SZ).dump"

cleanup() {
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

echo "Creating a consistent PostgreSQL custom-format dump."
compose exec -T db pg_dump \
  --username "$DB_USER" \
  --dbname "$DB_NAME" \
  --format custom \
  --compress 9 \
  --no-owner \
  --no-privileges >"$dump_file"

if [[ ! -s "$dump_file" ]]; then
  echo "pg_dump produced an empty file; backup aborted." >&2
  exit 1
fi

echo "Uploading the dump to the encrypted restic repository."
restic backup "$dump_file" --tag postpilot-db --host "$(hostname -s)"

echo "Applying retention: 7 daily, 5 weekly, and 12 monthly snapshots."
restic forget \
  --tag postpilot-db \
  --keep-daily 7 \
  --keep-weekly 5 \
  --keep-monthly 12 \
  --prune

restic snapshots --tag postpilot-db --latest 3

