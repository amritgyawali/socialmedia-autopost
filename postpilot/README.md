# MeritByte PostPilot

PostPilot is a private, single-admin social publishing cockpit. It pairs a
Next.js web application with a Java 21/Spring Boot engine, PostgreSQL, and
Cloudflare R2. The browser talks to a same-origin Next.js proxy; the proxy signs
short-lived engine requests, so infrastructure and provider secrets never enter
client JavaScript.

The first release implements Facebook Page, linked Instagram Professional,
LinkedIn member, and X publishing adapters. Provider accounts, permissions,
reviews, billing, and current API rules still apply. YouTube and TikTok are
documented native/manual workflows, not implemented adapters.

## Start here

The complete beginner runbook is [ACCOUNT_SETUP_AND_DEPLOY.md](ACCOUNT_SETUP_AND_DEPLOY.md).
It covers every account to create, local setup, GitHub, Oracle Cloud,
Cloudflare DNS/R2, Vercel or self-hosting, OAuth app registration, secrets,
backups, validation, and routine operations.

Read [docs/RESEARCH_CORRECTIONS.md](docs/RESEARCH_CORRECTIONS.md) before relying
on the original plan's pricing, quota, or approval assumptions. Important
changes include X pay-per-use API access, Vercel Hobby's personal/non-commercial
restriction, current Oracle A1 allowances, and the launch gates for YouTube and
TikTok.

For a shorter, fully-free path (GitHub + Supabase + a free Oracle VPS +
Vercel), see [FREE_DEPLOYMENT_STEPS.md](FREE_DEPLOYMENT_STEPS.md).

## Local quick start

Prerequisites: Node.js 22+, Java 21/Maven 3.9+ for direct engine development,
and Docker Desktop.

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item infra/.env.example infra/.env
Copy-Item infra/.deploy.env.example infra/.deploy.env
Set-ExecutionPolicy -Scope Process Bypass
./scripts/generate-secrets.ps1
npm install
npm run hash-password -- "choose-a-long-local-password"
```

Put the generated local values into the two environment files, set
`ENGINE_IMAGE=postpilot-engine:local` in `infra/.deploy.env`, then start the
database and engine:

Prefer the generator's `ADMIN_PASSWORD_HASH_BASE64=...` output in dotenv files;
the web app decodes it server-side and Docker cannot misread bcrypt dollar signs
as variable interpolation. The actual admin password is never stored there.

```powershell
docker compose `
  --project-directory infra `
  --env-file infra/.env `
  --env-file infra/.deploy.env `
  -f infra/docker-compose.yml `
  -f infra/docker-compose.local.yml `
  up -d --build db engine

Invoke-RestMethod http://localhost:8080/actuator/health
npm run dev
```

Open `http://localhost:3000`. See the full runbook before configuring real
social accounts or production secrets.

## Repository map

| Path | Purpose |
|---|---|
| `apps/web` | Next.js cockpit, admin session, engine proxy, direct R2 upload UI |
| `apps/engine` | Spring Boot API, OAuth/token vault, scheduler, provider adapters |
| `packages/shared` | Shared TypeScript contracts used by the cockpit |
| `infra` | Compose, Caddy, immutable deployment, restic backup, systemd timer |
| `.github/workflows` | CI and ARM64 engine build/deploy |
| `config` | Copyable provider configuration examples |
| `scripts` | Cross-platform secret generators |

## Useful checks

```powershell
npm run typecheck
npm run build
docker build -f apps/web/Dockerfile -t postpilot-web .
docker build -t postpilot-engine apps/engine
```

Run the engine's Maven verification directly when Maven is installed:

```powershell
mvn --batch-mode --no-transfer-progress -f apps/engine/pom.xml verify
```

Local `.env` files, deploy state, dumps, keys, build output, and dependencies
are ignored. Confirm `git status` before every first push. Do not commit a
plaintext admin password, OAuth token, cloud credential, database password,
JWT secret, vault key, or restic password.

## Deployment choices

- **Vercel UI + Oracle engine:** easiest split deployment, but Vercel Hobby is
  for personal/non-commercial use. A MeritByte business deployment may need a
  suitable paid plan.
- **Self-hosted UI + engine:** the optional `self-host-web` Compose profile runs
  the supplied web Dockerfile behind Caddy on the same VM. It avoids Vercel plan
  fit questions, but does not make the domain, R2 metering, X API, or Oracle
  capacity guaranteed free.

Both choices use HTTPS and the same short-lived JWT contract. CORS is a browser
control, not engine authentication.
