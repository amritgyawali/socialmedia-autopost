#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/restic-env.sh"

BACKUP_ROOT="${POSTPILOT_BACKUP_TMP:-/var/tmp/postpilot-backup}"
mkdir -p -- "$BACKUP_ROOT"
work_dir="$(mktemp -d "$BACKUP_ROOT/verify.XXXXXXXX")"

cleanup() {
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

echo "Checking repository metadata and pack integrity."
restic check

echo "Restoring the latest database snapshot into a temporary directory."
restic restore latest --tag postpilot-db --target "$work_dir"

dump_file="$(find "$work_dir" -type f -name '*.dump' -print -quit)"
if [[ -z "$dump_file" || ! -s "$dump_file" ]]; then
  echo "No non-empty PostgreSQL dump was restored." >&2
  exit 1
fi

echo "Validating that PostgreSQL can read the restored archive catalogue."
compose exec -T db pg_restore --list <"$dump_file" >/dev/null
echo "Backup verification passed: restic restored a readable PostgreSQL archive."

