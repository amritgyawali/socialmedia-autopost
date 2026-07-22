#!/usr/bin/env bash
# Live-check every connected Postiz channel. Runs inside the postiz container so
# it sees the same app credentials the publisher uses.
set -euo pipefail
docker cp /opt/postiz/verify-social.js postiz:/tmp/verify-social.js
exec docker exec postiz node /tmp/verify-social.js
