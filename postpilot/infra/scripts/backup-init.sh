#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/restic-env.sh"

echo "Initializing the encrypted backup repository in the private R2 bucket."
echo "If this reports that a config already exists, do not initialize it again."
restic init
restic snapshots

