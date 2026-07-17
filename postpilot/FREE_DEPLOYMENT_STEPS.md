# PostPilot — 100% Free Deployment, Step by Step

This is the condensed path: **GitHub → Supabase (database) → a free VPS (backend) → Vercel (frontend)**,
using only free-tier services. Follow the steps in order — **Step 1 is the very
first thing to do.**

This file complements, not replaces,
[ACCOUNT_SETUP_AND_DEPLOY.md](ACCOUNT_SETUP_AND_DEPLOY.md), which is the full
reference (every social-provider OAuth app, restore drills, full
troubleshooting table). Use **this** file to get the app live end-to-end with
a free stack; use that file when you connect Facebook/Instagram/LinkedIn/X or
need deep troubleshooting.

Read this whole section before creating anything — one piece genuinely
cannot be made free, and it's better to know that now:

> **X (Twitter) posting is NOT free.** X's API is prepaid pay-per-use with no
> free posting tier. Every other piece below has a real, current free tier.
> If you don't want to pay X, simply leave `X_CLIENT_ID` / `X_CLIENT_SECRET`
> blank — the app works fine with Facebook, Instagram, and LinkedIn only.

Free-tier terms change. Where a provider might have changed a limit since
this was written, this guide tells you which live page to check.

## The stack this guide builds

```text
Browser
  -> your-app.vercel.app            (Next.js cockpit, hosted free on Vercel)
  -> same-origin /api/engine/* proxy (signs a short-lived JWT)
  -> https://yourapp.duckdns.org    (Caddy -> Spring Boot engine, free VPS)
  -> Supabase Postgres (free)  +  Cloudflare R2 media bucket (free)
```

| Piece | Free service | Cost gotcha to know about |
|---|---|---|
| Source code | [GitHub](https://github.com) | Free private repos. No card needed. |
| Database | [Supabase](https://supabase.com) | Free project **pauses after ~1 week idle** (you just click "restore" — no data loss). Check current limits at [supabase.com/pricing](https://supabase.com/pricing). |
| Backend server | [Oracle Cloud Always Free](https://www.oracle.com/cloud/free/) VPS | Free forever, but signup asks for a card for identity verification (not charged unless you upgrade). Capacity isn't guaranteed at signup time. |
| Backend hostname/HTTPS | [DuckDNS](https://www.duckdns.org) | Free subdomain, no card. |
| Media storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) | Free 10 GB/month, but Cloudflare requires you to go through a billing/checkout screen to switch R2 on even though nothing is charged inside the free limit. |
| Frontend hosting | [Vercel Hobby](https://vercel.com/pricing) | Free, but Vercel's terms say Hobby is for personal/non-commercial use. Fine for testing or a personal project; a business deployment should use Pro. |
| Social posting APIs | Meta, LinkedIn free / X paid | Covered in Step 12 and in `ACCOUNT_SETUP_AND_DEPLOY.md`. |

---

## Step 1 — The very beginning: install tools and run the app on your own PC

Do this before creating any account. If it doesn't run locally, it won't run
in the cloud either — cloud problems are much slower to debug.

### 1.1 Install these on your Windows PC

| Tool | Get it from |
|---|---|
| Git | [git-scm.com/download/win](https://git-scm.com/download/win) |
| Node.js 20 LTS or newer | [nodejs.org](https://nodejs.org) |
| Java 21 (JDK) | [adoptium.net](https://adoptium.net) |
| Maven 3.9+ | [maven.apache.org/download.cgi](https://maven.apache.org/download.cgi) |
| Docker Desktop (with WSL2/Linux containers) | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |

Verify each one installed correctly, in **Windows PowerShell**:

```powershell
git --version
node --version
npm --version
java -version
mvn --version
docker version
docker compose version
```

Fix any missing tool before continuing.

### 1.2 Confirm the project is where you think it is

Your project already exists at:

```text
c:\Users\amrit\OneDrive\Pictures\social media auto publish\postpilot
```

Open PowerShell there:

```powershell
cd "c:\Users\amrit\OneDrive\Pictures\social media auto publish\postpilot"
git status
```

It should say `nothing to commit, working tree clean` — this project is
already a Git repository.

### 1.3 Create your local environment files and secrets

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item infra/.env.example infra/.env
Copy-Item infra/.deploy.env.example infra/.deploy.env
Set-ExecutionPolicy -Scope Process Bypass
./scripts/generate-secrets.ps1
```

Copy the five printed values (`DB_PASS`, `COCKPIT_JWT_SECRET`,
`NEXTAUTH_SECRET`, `VAULT_KEY`, `RESTIC_PASSWORD`) into a password manager —
you'll reuse them later. **Never paste them into chat, a commit, or an
issue.**

Fill `infra/.env` for local use:

```dotenv
API_DOMAIN=api.example.com
ACME_EMAIL=you@example.com
OAUTH_REDIRECT_BASE=http://localhost:8080
COCKPIT_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000
DB_NAME=postpilot
DB_USER=postpilot
DB_PASS=<the DB_PASS you just generated>
COCKPIT_JWT_SECRET=<the COCKPIT_JWT_SECRET you just generated>
VAULT_KEY=<the VAULT_KEY you just generated>
```

Set `infra/.deploy.env` to:

```dotenv
ENGINE_IMAGE=postpilot-engine:local
```

Install dependencies and create your admin login:

```powershell
npm install
npm run hash-password -- "choose-a-long-local-password"
```

Paste the printed `ADMIN_PASSWORD_HASH_BASE64=...` line into
`apps/web/.env.local`, along with `ENGINE_URL=http://localhost:8080/api/v1`,
`COCKPIT_JWT_SECRET` (same value as `infra/.env`), your `ADMIN_EMAIL`, and the
`NEXTAUTH_SECRET` you generated.

### 1.4 Start it and open it in a browser

```powershell
docker compose `
  --project-directory infra `
  --env-file infra/.env `
  --env-file infra/.deploy.env `
  -f infra/docker-compose.yml `
  -f infra/docker-compose.local.yml `
  up -d --build db engine

Invoke-RestMethod http://localhost:8080/actuator/health
```

In a second PowerShell window:

```powershell
npm run dev
```

Open `http://localhost:3000`, log in with your admin email/password. If this
page loads and logs you in, the project is provably workable — everything
after this point is "put the same thing in the cloud."

---

## Step 2 — Create the free accounts you'll need

Create each of these now (all free, most need no card except where noted):

1. **GitHub** — [github.com/signup](https://github.com/signup) (you already have this repo pushed — see Step 3).
2. **Supabase** — [supabase.com](https://supabase.com), sign up with GitHub for the fastest flow.
3. **Oracle Cloud** — [oracle.com/cloud/free](https://www.oracle.com/cloud/free/). Needs a card for identity verification.
4. **DuckDNS** — [duckdns.org](https://www.duckdns.org), sign in with GitHub/Google.
5. **Cloudflare** — [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up), for the R2 media bucket.
6. **Vercel** — [vercel.com/signup](https://vercel.com/signup), sign up with GitHub for one-click repo import.

Turn on two-factor authentication everywhere it's offered.

---

## Step 3 — Push the project to GitHub

Your repo is **already pushed**. Confirm it:

```powershell
cd "c:\Users\amrit\OneDrive\Pictures\social media auto publish\postpilot"
git remote -v
git log --oneline -3
```

You should see `origin  https://github.com/amritgyawali/socialmedia-autopost.git`
and a clean `git status`. Nothing more to do here unless you make new local
changes — then it's the usual:

```powershell
git add <files>
git commit -m "your message"
git push
```

Before any push, run `git status` and make sure it never lists `infra/.env`,
`infra/.deploy.env`, `apps/web/.env.local`, or any key/dump file — `.gitignore`
already excludes them, but always glance at the list.

In GitHub, open **Settings → Actions → General** on the repo once and confirm
Actions are allowed to run — the included CI workflow needs this.

---

## Step 4 — Create the free database on Supabase

1. In Supabase, click **New project**. Pick any name (e.g. `postpilot`), a
   strong database password (save it in your password manager now — you
   cannot view it again later), and the region closest to your VPS region
   (pick this after Step 5 if you want them to match, but it's not critical).
2. Wait for the project to finish provisioning (a couple of minutes).
3. Go to **Project Settings → Database → Connection string**. Switch the
   format dropdown to **JDBC**. Use the **Session pooler** or **Direct
   connection** string (not the "Transaction pooler" one — this app keeps a
   persistent connection pool, and transaction-mode pooling doesn't support
   that well). It looks like:

   ```text
   jdbc:postgresql://<host-shown-by-supabase>:5432/postgres?sslmode=require
   ```

4. Note the three values you'll need shortly:
   - `DB_URL` = the JDBC string above (exactly as Supabase shows it)
   - `DB_USER` = the username Supabase shows next to it (often
     `postgres.<project-ref>` for the pooler, or `postgres` for direct)
   - `DB_PASS` = the database password you set in step 1

You do not need to create any tables — the engine runs its own Flyway
migrations automatically on first boot.

> **Free-tier gotcha:** Supabase pauses a free project after roughly a week
> with no API activity. Since PostPilot polls the database continuously while
> the engine is running, an actively-running engine should keep it awake; if
> you ever stop the VPS for a long time, you may need to click **Restore
> project** in the Supabase dashboard before restarting. No data is lost when
> a project is paused. Current limits: [supabase.com/pricing](https://supabase.com/pricing).

---

## Step 5 — Create the free backend VPS on Oracle Cloud

1. Sign up at [OCI Free Tier](https://www.oracle.com/cloud/free/), choosing
   your home region carefully (Always Free compute must be created in the
   home region).
2. Create a **VM.Standard.A1.Flex** instance: up to 2 OCPUs / 12 GB RAM
   (within the Always Free allowance), **Ubuntu 24.04 ARM64**, marked "Always
   Free eligible" in the console before you click Create. A 100 GB boot volume
   is enough.
3. Add your SSH public key during creation (or generate one first with
   `ssh-keygen`), and reserve a public IPv4 address if the console offers it,
   so your IP doesn't change later.
4. Open the instance's network security rules (Security List or a Network
   Security Group) and allow only:

   | Protocol | Port | Source | Reason |
   |---|---:|---|---|
   | TCP | 22 | your IP `/32` | SSH |
   | TCP | 80 | `0.0.0.0/0` | HTTPS certificate issuance / redirect |
   | TCP | 443 | `0.0.0.0/0` | API traffic |
   | UDP | 443 | `0.0.0.0/0` | optional HTTP/3 |

   Do **not** open 5432, 8080, or 3000 to the internet.

5. Connect and install Docker, from **Windows PowerShell**:

   ```powershell
   ssh -i C:\path\to\oracle-key ubuntu@YOUR_VPS_IP
   ```

   Then on the **VPS**:

   ```bash
   sudo apt update && sudo apt -y upgrade
   sudo apt install -y ca-certificates curl git
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   sudo chmod a+r /etc/apt/keyrings/docker.asc
   sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
   Types: deb
   URIs: https://download.docker.com/linux/ubuntu
   Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
   Components: stable
   Architectures: $(dpkg --print-architecture)
   Signed-By: /etc/apt/keyrings/docker.asc
   EOF
   sudo apt update
   sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   sudo usermod -aG docker ubuntu
   exit
   ```

   Reconnect, then verify:

   ```bash
   docker run --rm hello-world
   docker compose version
   ```

---

## Step 6 — Give the backend a free domain name (DuckDNS)

Caddy (already built into this project) needs a real hostname to get a free
HTTPS certificate. Instead of buying a domain, use a free DuckDNS subdomain:

1. Sign in at [duckdns.org](https://www.duckdns.org) with GitHub/Google.
2. Create a subdomain, e.g. `mypostpilot` → this gives you
   `mypostpilot.duckdns.org`.
3. Set its IP to your Oracle VPS's public IPv4 address and save.
4. Confirm it resolves, from **Windows PowerShell**:

   ```powershell
   Resolve-DnsName mypostpilot.duckdns.org
   ```

   It must return your VPS IP.

Your backend's public URL is now `https://mypostpilot.duckdns.org`.

(If you already own a real domain, you can use Cloudflare DNS instead — see
`ACCOUNT_SETUP_AND_DEPLOY.md` section 7.1 — but DuckDNS keeps this fully
free.)

---

## Step 7 — Clone the repo onto the VPS and point it at Supabase

### 7.1 Clone with a read-only deploy key

On the **VPS**:

```bash
ssh-keygen -t ed25519 -f "$HOME/.ssh/postpilot_github" -N '' -C postpilot-vps-readonly
cat "$HOME/.ssh/postpilot_github.pub"
```

In GitHub, open **Settings → Deploy keys → Add deploy key** on the
`socialmedia-autopost` repo, paste the public key, leave write access
unchecked.

```bash
printf '%s\n' \
  'Host github.com' \
  '  IdentityFile ~/.ssh/postpilot_github' \
  '  IdentitiesOnly yes' >> "$HOME/.ssh/config"
chmod 600 "$HOME/.ssh/config"
git clone git@github.com:amritgyawali/socialmedia-autopost.git "$HOME/socialmedia-autopost"
cd "$HOME/socialmedia-autopost/postpilot/infra"
```

### 7.2 One-time edit: point the engine at Supabase instead of a local database

This project ships with a self-hosted Postgres container by default. To use
Supabase instead, make this one small edit **on the VPS** (or locally, then
commit and push) to `infra/docker-compose.yml`:

Find this block inside the `engine:` service's `environment:` section:

```yaml
      DB_URL: jdbc:postgresql://db:5432/${DB_NAME}
      DB_USER: ${DB_USER}
      DB_PASS: ${DB_PASS}
```

Replace it with:

```yaml
      DB_URL: ${DB_URL:?Set DB_URL in infra/.env}
      DB_USER: ${DB_USER:?Set DB_USER in infra/.env}
      DB_PASS: ${DB_PASS:?Set DB_PASS in infra/.env}
```

Then find this block, still inside `engine:`, and delete it entirely:

```yaml
    depends_on:
      db:
        condition: service_healthy
        restart: true
```

Leave the rest of the file — including the `db:` service definition itself —
untouched. It simply won't be used, since nothing depends on it anymore and
you won't start it by name. (If you ever want to go back to a self-hosted
database, undo this edit — no data migration needed since you never wrote to
the local one.)

Commit this change so future deploys keep using Supabase:

```bash
cd "$HOME/socialmedia-autopost"
git add postpilot/infra/docker-compose.yml
git commit -m "Point engine at Supabase Postgres"
git push
```

(Do this from your Windows machine if you'd rather not set up a push-capable
key on the VPS — either way, pull the change on the VPS afterward with
`git pull --ff-only`.)

### 7.3 Create the production environment file

```bash
cd "$HOME/socialmedia-autopost/postpilot/infra"
cp .env.example .env
chmod 600 .env
nano .env
```

Fill in:

```dotenv
API_DOMAIN=mypostpilot.duckdns.org
ACME_EMAIL=you@example.com
OAUTH_REDIRECT_BASE=https://mypostpilot.duckdns.org
COCKPIT_URL=https://YOUR-VERCEL-URL.vercel.app
CORS_ALLOWED_ORIGINS=https://YOUR-VERCEL-URL.vercel.app

# Supabase, from Step 4
DB_URL=jdbc:postgresql://<supabase-host>:5432/postgres?sslmode=require
DB_USER=<supabase-user>
DB_PASS=<supabase-db-password>

COCKPIT_JWT_SECRET=<production value — generate fresh with scripts/generate-secrets.ps1>
VAULT_KEY=<production value>
```

You won't have the exact Vercel URL until Step 9 — come back and update
`COCKPIT_URL` / `CORS_ALLOWED_ORIGINS` once you have it, then restart the
engine (final command in this step).

Leave R2 and social-provider variables blank for now; Step 8 fills in R2.

### 7.4 Let the VPS pull the engine image built by GitHub Actions

The included `.github/workflows/deploy-engine.yml` builds and pushes the
engine's Docker image to GitHub Container Registry (GHCR) automatically. On
the **VPS**, log in once so it can pull that image (create a GitHub personal
access token with only the `read:packages` scope first):

```bash
read -rsp 'GHCR read token: ' CR_PAT; echo
printf '%s' "$CR_PAT" | docker login ghcr.io -u amritgyawali --password-stdin
unset CR_PAT
```

### 7.5 First deployment

Follow `ACCOUNT_SETUP_AND_DEPLOY.md` section 8.4–8.5 to add the
`VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY` / `VPS_KNOWN_HOSTS` GitHub Actions
secrets, then run **Actions → Deploy engine → Run workflow**. It builds the
ARM64 image, pushes it, deploys to the VPS, and health-checks it — using the
`docker-compose.yml` you just edited to skip the local database and use
Supabase.

Once it succeeds, confirm:

```powershell
Invoke-RestMethod https://mypostpilot.duckdns.org/actuator/health
```

Expected: `UP`. If you'd rather deploy manually the first time instead of via
Actions, on the VPS:

```bash
cd "$HOME/socialmedia-autopost/postpilot/infra"
bash scripts/compose.sh up -d --build engine caddy
bash scripts/compose.sh ps
```

(Notice `db` is intentionally left out of that command.)

---

## Step 8 — Free media storage on Cloudflare R2

PostPilot uploads post images/video to an R2 bucket and posts a public URL to
each social platform's API.

1. In Cloudflare, go to **Storage & databases → R2** and complete the
   subscription/checkout screen (needed to enable R2 even on the free tier).
2. Create a bucket named `postpilot-media`.
3. In its settings, note the `r2.dev` public URL for quick testing, or attach
   a custom domain if you already have one — a bare `r2.dev` URL works for
   getting things running.
4. Create a bucket-scoped API token with **Object Read & Write**, limited to
   `postpilot-media` only. Save the Access Key ID and Secret immediately —
   the secret is shown once.
5. Copy your Cloudflare account ID from the R2 overview page.
6. Set the bucket's CORS policy (Settings → CORS Policy) using
   `postpilot/config/r2-cors.example.json` as a starting point, with your
   Vercel URL and `http://localhost:3000` as allowed origins.
7. Add the values to the VPS's `infra/.env`:

   ```dotenv
   R2_ACCOUNT_ID=<account id>
   R2_ACCESS_KEY_ID=<access key>
   R2_SECRET_ACCESS_KEY=<secret>
   R2_BUCKET=postpilot-media
   R2_PUBLIC_BASE_URL=https://<your bucket's public URL>
   ```

8. Restart the engine to pick it up:

   ```bash
   cd "$HOME/socialmedia-autopost/postpilot/infra"
   bash scripts/compose.sh up -d engine
   ```

Free tier is 10 GB storage/month with no egress fee — current numbers at
[developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/).
(A second, private bucket for encrypted database backups is optional now that
Supabase handles its own backups — skip `postpilot-backups` and the
`restic`/systemd steps in the full runbook unless you specifically want an
independent backup copy.)

---

## Step 9 — Deploy the frontend on Vercel

1. In Vercel, **Add New → Project**, import
   `amritgyawali/socialmedia-autopost` from GitHub.
2. Set **Root Directory** to `postpilot/apps/web`. Under the same settings,
   make sure **"Include source files outside of the Root Directory in the
   Build Step"** is enabled — the cockpit imports `postpilot/packages/shared`
   from elsewhere in the monorepo.
3. Add these **Production** environment variables:

   | Variable | Value |
   |---|---|
   | `ENGINE_URL` | `https://mypostpilot.duckdns.org/api/v1` |
   | `COCKPIT_JWT_SECRET` | the exact same value you put in the VPS's `infra/.env` |
   | `ADMIN_EMAIL` | your login email |
   | `ADMIN_PASSWORD_HASH_BASE64` | run `npm run hash-password -- "your-prod-password"` locally and paste the printed value |
   | `NEXTAUTH_SECRET` | a fresh value from `scripts/generate-secrets.ps1` |

4. Deploy. Vercel gives you a free URL like
   `https://socialmedia-autopost.vercel.app` — no domain purchase required.
5. Go back to Step 7.3 and set the VPS's `COCKPIT_URL` and
   `CORS_ALLOWED_ORIGINS` to this exact Vercel URL, then:

   ```bash
   cd "$HOME/socialmedia-autopost/postpilot/infra"
   bash scripts/compose.sh up -d engine
   ```

If you'd rather have a nicer URL than `*.vercel.app` for free, you can attach
any domain you already own under **Project → Settings → Domains** — but a
fresh purchase is the one thing in this stack that is never free.

---

## Step 10 — Confirm the frontend and backend are actually talking

Open your Vercel URL, log in with the admin email/password from Step 9, and
check in the browser:

- The page loads and login succeeds.
- Browser dev tools (Network tab) show calls to `/api/engine/...` on the same
  Vercel origin — not direct calls to `mypostpilot.duckdns.org` with visible
  secrets.
- A direct request to `https://mypostpilot.duckdns.org/api/v1/...` without a
  token is rejected; `/actuator/health` alone stays public.

If login fails with an engine/auth error, it's almost always one of:
`COCKPIT_JWT_SECRET` differing between Vercel and the VPS, `ENGINE_URL` not
ending in `/api/v1`, or the VPS environment not restarted after an edit.

---

## Step 11 — Verify the database and storage independently

- In Supabase, **Table Editor**: after the engine's first successful boot you
  should see PostPilot's tables (Flyway creates them automatically).
- In Cloudflare R2, upload a test image from the PostPilot composer and
  confirm the object appears in `postpilot-media` and its public URL loads in
  a logged-out browser tab.

---

## Step 12 — Connect social platforms

This part is unavoidably provider-specific — each platform has its own
developer console, OAuth app, and callback URL. Full instructions live in
`ACCOUNT_SETUP_AND_DEPLOY.md` sections 10.1–10.4:

- **Facebook Page + Instagram Professional** — free, needs a Meta developer
  app (section 10.1).
- **LinkedIn** (posting to your own member profile) — free, self-service
  (section 10.2).
- **X** — **not free**; X charges per API usage. Only set up
  `X_CLIENT_ID`/`X_CLIENT_SECRET` if you're willing to pay for credits
  (section 10.3). Otherwise leave them blank — PostPilot simply won't show X
  as connected.
- **Telegram notifications** (optional, free) — section 10.4.

Your OAuth callback URLs, using the DuckDNS hostname from Step 6:

```text
https://mypostpilot.duckdns.org/api/v1/oauth/facebook/callback
https://mypostpilot.duckdns.org/api/v1/oauth/instagram/callback
https://mypostpilot.duckdns.org/api/v1/oauth/linkedin/callback
https://mypostpilot.duckdns.org/api/v1/oauth/x/callback
```

---

## Step 13 — Keep it all free: what to watch

| Service | Watch for | Where to check |
|---|---|---|
| Supabase | Free project pausing after ~1 week idle; 500 MB-class storage cap | Supabase dashboard, [pricing](https://supabase.com/pricing) |
| Oracle Cloud | Always Free A1 instances can be reclaimed if idle across all measured dimensions for 7 days | OCI console notifications |
| Cloudflare R2 | 10 GB storage/month free | R2 dashboard usage tab |
| Vercel Hobby | Personal/non-commercial ToS; bandwidth limits | [vercel.com/docs/limits](https://vercel.com/docs/limits) |
| GitHub Actions | Free minutes/month on private repos | Repo → Settings → Billing |
| X API | Pay-per-use — only relevant if you enabled it | [console.x.com](https://console.x.com/) billing |

Since your database now lives on Supabase, you can skip the VPS restic/backup
setup in `ACCOUNT_SETUP_AND_DEPLOY.md` section 13 — Supabase's free tier
already keeps its own backups. Everything else in that document (routine
operations, rollback, troubleshooting table) still applies to this stack.

---

## Step 14 — Turn on automatic deploys (optional)

Once Step 7.5's manual deployment succeeds, create the repository Actions
variable `ENABLE_PRODUCTION_DEPLOY=true` (**Settings → Secrets and variables
→ Actions → Variables**). From then on, pushes to `main` that touch the
engine or `infra/` auto-deploy to the VPS, with automatic rollback if the
health check fails after a deploy. Vercel already redeploys automatically on
every push to `main` for the frontend — no extra setup needed there.

---

## Quick troubleshooting

| Symptom | Check |
|---|---|
| Engine won't start after the Supabase edit | `DB_URL` must be the exact JDBC string Supabase shows, including `?sslmode=require`; confirm `depends_on` block was fully removed (a leftover partial edit breaks the YAML). |
| Caddy can't get HTTPS | DuckDNS record doesn't point at the current VPS IP; ports 80/443 not open in Oracle's security rules. |
| Vercel says engine unavailable | `ENGINE_URL` must end in `/api/v1`; confirm `https://<duckdns-host>/actuator/health` returns `UP` first. |
| 401 through the UI | `COCKPIT_JWT_SECRET` differs between Vercel and VPS `infra/.env`. |
| Upload fails with CORS error | Vercel URL missing from the R2 bucket's CORS policy. |
| Supabase queries suddenly fail | Project may have auto-paused from inactivity — open the Supabase dashboard and click Restore. |

For anything not covered here, see the full troubleshooting table in
`ACCOUNT_SETUP_AND_DEPLOY.md` section 16.
