# PostPilot infrastructure

Production runs PostgreSQL and the engine on a private Docker network. Only
Caddy publishes host ports 80/443. The optional `self-host-web` profile adds the
Next.js container on the edge network without publishing port 3000.

The engine environment is explicitly allowlisted in Compose. Private-backup R2
credentials and `RESTIC_PASSWORD` stay on the host for the backup scripts and
are not injected into the web, engine, database, or Caddy containers.

Do not run Compose without both environment files:

```bash
cp .env.example .env
cp .deploy.env.example .deploy.env
chmod 600 .env .deploy.env
bash scripts/compose.sh config --quiet
bash scripts/compose.sh up -d
```

`scripts/compose.sh` always supplies the project directory and both files, so
relative paths and interpolation behave consistently. `.env` contains durable
operator-managed secrets. `.deploy.env` contains only the current immutable
engine image digest and is updated atomically by `scripts/deploy.sh`.

Never execute `.env` with `source`. Docker dotenv values are parsed as data by
Compose. The deploy/backup scripts use `scripts/dotenv.sh` to extract only their
required values without evaluating shell syntax.

Keep one `NAME=value` assignment per line with no inline comment. Single-quote
literal values containing `$`, `#`, or spaces; Docker and the safe parser remove
the matching outer quotes without executing the contents.

## Files

| File | Role |
|---|---|
| `docker-compose.yml` | Production database, engine, Caddy, optional web |
| `docker-compose.local.yml` | Local engine build and loopback port 8080 |
| `Caddyfile` | API TLS, headers, body limit, engine reverse proxy |
| `sites/web.caddy.example` | Optional self-hosted cockpit virtual host |
| `scripts/deploy.sh` | Locked digest deploy, public health check, rollback |
| `scripts/backup*.sh` | Encrypted database snapshots and retention |
| `scripts/verify-backup.sh` | Restore and archive-catalogue verification |
| `systemd/*` | Daily backup timer for `/home/ubuntu/postpilot` |

The operational sequence, GHCR login, DNS, R2 credentials, timer installation,
and destructive restore drill are documented in
[../ACCOUNT_SETUP_AND_DEPLOY.md](../ACCOUNT_SETUP_AND_DEPLOY.md).
