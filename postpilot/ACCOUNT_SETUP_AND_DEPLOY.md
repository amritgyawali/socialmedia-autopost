# PostPilot account setup and deployment

This is the beginner-oriented runbook for taking this repository from a Windows development computer to a working private cockpit and engine. Follow it in order. Commands marked **Windows PowerShell** run on your computer; commands marked **VPS** run after SSHing into Ubuntu.

Platform facts were checked on **2026-07-16**. Read [the corrections to the original plan](docs/RESEARCH_CORRECTIONS.md) before creating paid resources or promising a launch date.

## 1. What this code does—and does not do

The repository is the custom-engine path:

```text
browser
  -> app.example.com (Next.js cockpit)
  -> same-origin Next.js /api/engine/* route
  -> signed, short-lived JWT over HTTPS
  -> api.example.com (Caddy -> Spring Boot engine)
  -> PostgreSQL + Cloudflare R2 + approved social APIs
```

The browser does not know the engine signing secret, database password, vault key, R2 key, or social client secrets. Next.js server route handlers call the engine. CORS is an additional browser restriction, not the authentication boundary.

Current launch targets and gates:

| Destination | Account you can target | Launch status / external gate |
|---|---|---|
| Facebook | A Facebook Page you manage | Requires a configured Meta developer app and the applicable permissions/access level. Test your exact Page. |
| Instagram | A Professional (Business or Creator) account linked to that Page | Uses Meta's Facebook Login model. Consumer Instagram accounts are not supported. |
| LinkedIn | The authenticated member's own profile | Self-service `Share on LinkedIn` grants `w_member_social`. Organization Page publishing is a different, vetted program and is not promised here. |
| X | The authenticated X account | X API is prepaid pay-per-use. Buy credits and monitor usage; it is not a guaranteed free destination. |
| YouTube | — | Not implemented in v1. Unverified API-project uploads are private until the project passes YouTube's audit. Use YouTube Studio. |
| TikTok | — | Not implemented in v1. TikTok says an internal/team-only upload utility is not an acceptable Direct Post audit use case. Use TikTok's native tools. |

This code does not include Postiz. Do not paste Postiz services into this Compose stack.

## 2. Accounts to create

Create accounts only from the provider's own site. Turn on two-factor authentication everywhere it is offered and save recovery codes in a password manager.

### Required infrastructure accounts

1. **GitHub** — source repository, Actions, and the private engine container. Sign up at [github.com](https://github.com/signup). GitHub Free currently includes plan-dependent Actions usage for private repositories; public standard runners are free. Check [current Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
2. **A domain registrar** — use an existing domain or buy one. The recurring domain fee is not part of any cloud free tier.
3. **Cloudflare** — authoritative DNS and two R2 buckets. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up). R2 is metered and requires its subscription/checkout flow even though it has included monthly usage; read [current R2 pricing](https://developers.cloudflare.com/r2/pricing/).
4. **Oracle Cloud Infrastructure** — the ARM VPS. Start from [OCI Free Tier](https://www.oracle.com/cloud/free/) and read the [current Free Tier documentation](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm). Capacity is not guaranteed.
5. **Vercel, or no Vercel if self-hosting the cockpit** — sign up at [vercel.com](https://vercel.com/signup). Vercel states Hobby is personal/non-commercial. A MeritByte business/internal-business deployment may require Pro; see [Vercel pricing](https://vercel.com/pricing) and [terms](https://vercel.com/legal/terms). Section 12 provides a self-hosted alternative.

### Required social accounts for destinations you enable

6. **Meta** — a normal Facebook account with control of a Facebook Page, an Instagram Professional account, and a [Meta for Developers](https://developers.facebook.com/) app. The Instagram account must be linked to the Page for the flow implemented here.
7. **LinkedIn** — a LinkedIn member account and an app in the [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps). App creation may require association/verification with a LinkedIn Page.
8. **X** — the target X account and an app in the [X Developer Console](https://console.x.com/). X documents prepaid pay-per-usage billing; add only the credits you intend to use.

### Optional account

9. **Telegram** — only for success/failure notifications. Create a bot through [@BotFather](https://t.me/BotFather). The posting workflow works without Telegram when both Telegram variables are blank.

You do **not** need Google Cloud or TikTok developer accounts for v1. Their optional preparation tracks are in section 11 so their restrictions are not mistaken for launch blockers.

### What goes in each account

| Account/service | What you put there |
|---|---|
| GitHub repository | The entire `postpilot` directory, except ignored local secret/build files |
| GitHub Actions/GHCR | Nothing pasted manually: the workflow tests code, builds the ARM64 engine image, and publishes it |
| Oracle VPS | A Git clone plus local `infra/.env`; Docker runs database, engine, Caddy, backups, and optionally web |
| Vercel | Import the same GitHub repository and select `apps/web` as Root Directory; enter only web environment variables |
| Cloudflare DNS/R2 | DNS records, two buckets, bucket CORS, and bucket-scoped API tokens; no application source code |
| Meta/LinkedIn/X dashboards | Exact OAuth callback URL, scopes/products, and app metadata; copy client IDs/secrets back to VPS `.env` |
| Telegram | Create a bot and copy its token/chat ID to VPS `.env`; no source code |

Do not paste Java or TypeScript into Oracle, Vercel, R2, or a social provider
dashboard. GitHub is the source of truth; the workflow/container and Vercel
import move the appropriate code to their runtimes.

## 3. Decide your names and record them

The examples use:

| Purpose | Example | Your value |
|---|---|---|
| Base domain | `example.com` | __________ |
| Cockpit | `app.example.com` | __________ |
| Engine API | `api.example.com` | __________ |
| Public media | `media.example.com` | __________ |
| GitHub owner | `your-github-user` | __________ |
| GitHub repository | `postpilot` | __________ |
| Admin email | `you@example.com` | __________ |

Use lower-case hostnames. Do not include `https://` in `API_DOMAIN`; do include it in `OAUTH_REDIRECT_BASE`, `COCKPIT_URL`, `R2_PUBLIC_BASE_URL`, `ENGINE_URL`, and the CORS origins.

OAuth callback URLs are exact strings. This engine uses:

```text
https://api.example.com/api/v1/oauth/facebook/callback
https://api.example.com/api/v1/oauth/instagram/callback
https://api.example.com/api/v1/oauth/linkedin/callback
https://api.example.com/api/v1/oauth/x/callback
```

Do not add a trailing slash unless the engine route itself has one. OAuth providers compare callback URLs strictly.

## 4. Prepare and test the code locally

### 4.1 Install local tools

Install:

- Git
- Node.js 22 LTS or newer compatible version
- Java 21
- Maven 3.9+
- Docker Desktop with Linux containers

Verify in **Windows PowerShell**:

```powershell
git --version
node --version
npm --version
java -version
mvn --version
docker version
docker compose version
```

If a command is missing, fix that installation before continuing.

### 4.2 Generate secrets

From the repository root in **Windows PowerShell**:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./scripts/generate-secrets.ps1
```

Copy the five results into a password-manager entry named `PostPilot production`. Do not post the output in chat, email, an issue, or a commit.

Important:

- `VAULT_KEY` is exactly 32 random bytes encoded as Base64. It encrypts OAuth tokens. If it is lost, reconnect every social account. Do not casually rotate it.
- `RESTIC_PASSWORD` encrypts all database backups. If it is lost, those backups cannot be restored.
- `COCKPIT_JWT_SECRET` must be byte-for-byte identical in the engine and web environments.
- Production and local development should use different secrets if both contain meaningful accounts.

### 4.3 Create local environment files

The frontend agent provides `apps/web/.env.example`. Copy it:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item infra/.env.example infra/.env
Copy-Item infra/.deploy.env.example infra/.deploy.env
```

Edit `infra/.env` for local development:

```dotenv
API_DOMAIN=api.example.com
ACME_EMAIL=you@example.com
OAUTH_REDIRECT_BASE=http://localhost:8080
COCKPIT_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000
DB_NAME=postpilot
DB_USER=postpilot
DB_PASS=<local random value>
COCKPIT_JWT_SECRET=<local shared value>
VAULT_KEY=<local 32-byte Base64 value>
```

Cloud and social values may remain blank for draft-only local UI work. R2 upload and platform connection buttons cannot complete until their real credentials exist.

Set `infra/.deploy.env` to:

```dotenv
ENGINE_IMAGE=postpilot-engine:local
```

Edit `apps/web/.env.local`:

```dotenv
ENGINE_URL=http://localhost:8080/api/v1
COCKPIT_JWT_SECRET=<the same local shared value>
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD_HASH_BASE64=<create this in the next step>
NEXTAUTH_SECRET=<local random Base64 value>
AUTH_COOKIE_SECURE=false
```

Generate the password hash. Replace the example with a long unique admin password:

```powershell
npm install
npm run hash-password -- "replace-with-your-admin-password"
```

The command prints both a quoted bcrypt value and a Base64-encoded form. Put the
`ADMIN_PASSWORD_HASH_BASE64=...` line in the dotenv file; it avoids all dollar-
sign interpolation issues. Keep the actual password in your password manager.
Never put a plaintext password in an environment file.

The raw alternative also works when its full bcrypt value remains inside single
quotes:

```dotenv
ADMIN_PASSWORD_HASH='$2b$12$the_entire_generated_hash'
```

Next.js and Docker remove the outer quotes while preserving every dollar sign.
In any repository dotenv file, use one `NAME=value` assignment per line and no
inline comment. Wrap a value in single quotes when it contains `$`, `#`, or
spaces. Do not add those quotes when pasting a value into a provider dashboard
or Vercel's environment-variable form.

### 4.4 Start the local engine and UI

Start PostgreSQL and the engine, publishing engine port 8080 only on local loopback:

```powershell
docker compose `
  --project-directory infra `
  --env-file infra/.env `
  --env-file infra/.deploy.env `
  -f infra/docker-compose.yml `
  -f infra/docker-compose.local.yml `
  up -d --build db engine
```

Check health:

```powershell
Invoke-RestMethod http://localhost:8080/actuator/health
```

In a second PowerShell window:

```powershell
npm run dev
```

Open `http://localhost:3000`, sign in, and confirm pages load. A protected direct engine request without the Next.js-signed JWT should be rejected; `/actuator/health` is intentionally public.

Stop local services when finished:

```powershell
docker compose `
  --project-directory infra `
  --env-file infra/.env `
  --env-file infra/.deploy.env `
  -f infra/docker-compose.yml `
  -f infra/docker-compose.local.yml `
  down
```

Do not use `down -v`; `-v` deletes the local database volume.

## 5. Put the repository on GitHub

Create a new **private** empty repository named `postpilot`. Do not initialize it with another README or `.gitignore`.

The delivered workspace is already initialized and committed locally. Confirm
with `git status` and `git log -1 --oneline`; when you see `Build MeritByte
PostPilot`, skip the initialization/commit block below and go straight to
adding your GitHub remote. The block remains here for anyone starting from a
fresh source archive.

From `postpilot` in **Windows PowerShell**:

```powershell
git init
git branch -M main
git add .
git status
```

Before committing, inspect `git status`. It must not list `infra/.env`, `infra/.deploy.env`, `apps/web/.env.local`, SSH keys, dumps, or token files. If it does, stop and fix `.gitignore`.

Then:

```powershell
git commit -m "Build MeritByte PostPilot"
git remote add origin git@github.com:YOUR_GITHUB_USER/postpilot.git
git push -u origin main
```

In GitHub:

1. Open **Settings → Actions → General**.
2. Permit the actions used by this repository. They are pinned to full commit SHAs.
3. Ensure workflow permissions allow the declared `packages: write` permission, subject to any organization policy.
4. Open **Settings → Code security** and enable Dependabot alerts and updates if available.
5. Keep the repository private unless you intentionally want its source public.

The CI workflow must eventually show green for web build, engine verification, and Compose rendering.
The separate **Deploy engine** workflow is expected to be skipped on early
pushes while `ENABLE_PRODUCTION_DEPLOY` is unset. This prevents a new repository
with no VPS secrets from attempting a production deployment.

## 6. Create the Oracle VPS

### 6.1 Create the instance

Oracle's [current Always Free documentation](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) states a total equivalent to 2 A1 OCPUs and 12 GB memory for an Always Free tenancy as of this guide's check date.

In OCI:

1. Choose the home region carefully during signup; Always Free compute must be in the home region. Pick based on latency, regulatory needs, and actual displayed capacity—not an online promise.
2. Create a budget for the root/project compartment and an email alert. OCI [budgets are soft alerts](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm), not hard spending caps.
3. Create a VCN with internet connectivity.
4. Create one instance using `VM.Standard.A1.Flex`, no more than **2 OCPUs / 12 GB RAM total**, and an Ubuntu 24.04 ARM64 image marked Always Free eligible.
5. A 100 GB boot volume is enough for this stack and remains within the documented 200 GB combined allowance if no other volumes consume it. Confirm the console shows Always Free eligibility before clicking Create.
6. Assign a reserved public IPv4 address if OCI offers it within your account/allowance, so DNS does not change after a stop/start.
7. Add your SSH public key. Downloaded private keys must be stored safely and never committed.

If OCI reports out of host capacity, try another availability domain where available or wait. Upgrading an account exposes more resource types but is not a guarantee of free A1 capacity. Oracle does not document the fixed card-hold amount claimed in the original plan.

### 6.2 Configure network rules

Use a Network Security Group attached to the VM, or the subnet security list:

| Protocol | Destination port | Source | Reason |
|---|---:|---|---|
| TCP | 22 | Your current public IP `/32` | SSH administration |
| TCP | 80 | `0.0.0.0/0` and optionally `::/0` | ACME HTTP challenge and HTTPS redirect |
| TCP | 443 | `0.0.0.0/0` and optionally `::/0` | API HTTPS |
| UDP | 443 | `0.0.0.0/0` and optionally `::/0` | Optional HTTP/3 |

Do not open 5432, 8080, or 3000. PostgreSQL and the engine use private Docker networks.

### 6.3 Install server software

Connect from PowerShell:

```powershell
ssh -i C:\path\to\oracle-key ubuntu@YOUR_VPS_IP
```

On the **VPS**:

```bash
sudo apt update
sudo apt -y upgrade
sudo apt install -y ca-certificates curl git restic
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Add Docker's official repository:

```bash
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
sudo timedatectl set-timezone Asia/Kathmandu
```

Docker explicitly warns that published container ports can bypass UFW rules. This stack publishes only Caddy's 80/443 ports; OCI network rules remain the outer filter. Read the [official Ubuntu installation and firewall notes](https://docs.docker.com/engine/install/ubuntu/).

Log out and reconnect so Docker group membership takes effect:

```bash
exit
```

Then reconnect and verify:

```bash
docker run --rm hello-world
docker compose version
restic version
```

## 7. Configure Cloudflare DNS and R2

### 7.1 Move DNS to Cloudflare safely

Add the base domain to Cloudflare and follow its nameserver instructions. Before changing nameservers, copy every existing mail (`MX`, SPF, DKIM, DMARC), verification, and service record. Losing an MX or TXT record can break email.

Cloudflare documents record creation in [Manage DNS records](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/).

Create:

| Type | Name | Target | Proxy |
|---|---|---|---|
| A | `api` | Oracle VPS public IPv4 | **DNS only** initially |

Leave `app` until the Vercel or self-host step. R2 creates the `media` record when its custom domain is connected.

Verify from **Windows PowerShell**:

```powershell
Resolve-DnsName api.example.com
```

It must return the VPS IP.

### 7.2 Create the public media bucket

In Cloudflare **Storage & databases → R2**:

1. Complete the R2 subscription/checkout flow.
2. Create a Standard-storage bucket named `postpilot-media`.
3. In its settings, add the custom domain `media.example.com`. Do not use the rate-limited `r2.dev` development hostname in production; see [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).
4. Create a bucket-scoped API token with Object Read & Write access only to `postpilot-media`.
5. Immediately save the shown Access Key ID and Secret Access Key in the password manager. The secret is not shown again.
6. Copy the account ID from the R2 overview.

Set the bucket CORS policy. Start from `config/r2-cors.example.json`, replace the hostname, and paste the JSON into **Bucket → Settings → CORS Policy**. Exact allowed origins should be:

```json
[
  {
    "AllowedOrigins": ["https://app.example.com", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Cloudflare explains why browser presigned uploads still require CORS in [Configure CORS](https://developers.cloudflare.com/r2/buckets/cors/). Do not use `*` for the production origin.

### 7.3 Create the private backup bucket

1. Create a second Standard bucket named `postpilot-backups`.
2. Keep every public-access option **off**. Do not attach a public domain.
3. Create a second bucket-scoped Object Read & Write token limited to `postpilot-backups`. Retention pruning requires delete permission, which is part of write access.
4. Save its two keys separately.

Do not reuse the public-media token for backups. A compromise in media-upload credentials should not expose database history.

## 8. Configure the VPS and first engine deployment

### 8.1 Clone with a read-only GitHub deploy key

On the **VPS**:

```bash
ssh-keygen -t ed25519 -f "$HOME/.ssh/postpilot_github" -N '' -C postpilot-vps-readonly
cat "$HOME/.ssh/postpilot_github.pub"
```

In GitHub, open **Repository Settings → Deploy keys → Add deploy key**, paste the public key, name it `postpilot-vps-readonly`, and leave write access unchecked.

On the **VPS**, create an SSH host entry:

```bash
printf '%s\n' \
  'Host github.com' \
  '  IdentityFile ~/.ssh/postpilot_github' \
  '  IdentitiesOnly yes' >> "$HOME/.ssh/config"
chmod 600 "$HOME/.ssh/config"
ssh -T git@github.com
git clone git@github.com:YOUR_GITHUB_USER/postpilot.git "$HOME/postpilot"
```

GitHub's test command says authentication succeeded but shell access is unavailable; that is expected.

### 8.2 Create the production engine environment

On the **VPS**:

```bash
cd "$HOME/postpilot/infra"
cp .env.example .env
chmod 600 .env
nano .env
```

Replace every relevant `CHANGE_ME`. Required core values:

```dotenv
API_DOMAIN=api.example.com
APP_DOMAIN=app.example.com
ACME_EMAIL=you@example.com
OAUTH_REDIRECT_BASE=https://api.example.com
COCKPIT_URL=https://app.example.com
CORS_ALLOWED_ORIGINS=https://app.example.com
DB_NAME=postpilot
DB_USER=postpilot
DB_PASS=<production DB_PASS>
COCKPIT_JWT_SECRET=<production shared secret>
VAULT_KEY=<production VAULT_KEY>
R2_ACCOUNT_ID=<Cloudflare account ID>
R2_ACCESS_KEY_ID=<media token access key>
R2_SECRET_ACCESS_KEY=<media token secret>
R2_BUCKET=postpilot-media
R2_PUBLIC_BASE_URL=https://media.example.com
R2_MAX_UPLOAD_BYTES=26214400
PUBLISH_MAX_IN_MEMORY_MEDIA_BYTES=26214400
BACKUP_R2_ACCOUNT_ID=<Cloudflare account ID>
BACKUP_R2_ACCESS_KEY_ID=<backup token access key>
BACKUP_R2_SECRET_ACCESS_KEY=<backup token secret>
BACKUP_R2_BUCKET=postpilot-backups
RESTIC_PASSWORD=<production RESTIC_PASSWORD>
```

The two 25 MiB limits are intentionally equal. The v1 LinkedIn and X adapters
download media into Java heap before sending it to the provider, so accepting a
1 GB object here would create an avoidable out-of-memory risk. Compress or
resize larger files; raise the ceiling only after implementing and testing a
streaming publisher path.

Leave social and Telegram variables blank until those apps are created. An unset provider should appear disconnected rather than receive a fake credential.

### 8.3 Let the VPS pull the private GHCR image

Images first published by GitHub Container Registry are private. Choose one approach:

- Keep it private: create a GitHub personal access token **(classic)** with only `read:packages`, then log in once on the VPS.
- Make only the container package public in GitHub Packages; public GHCR packages can be pulled anonymously. This exposes the built image even if source remains private.

GitHub documents both options in [Working with the Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry). For the private option, on the **VPS**:

```bash
read -rsp 'GHCR read token: ' CR_PAT; echo
printf '%s' "$CR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
unset CR_PAT
```

The token lands in Docker's credential configuration for future pulls. Restrict access to the `ubuntu` account and revoke/replace the token if the server is compromised.

### 8.4 Create a dedicated Actions-to-VPS SSH key

On your **Windows computer**:

```powershell
ssh-keygen -t ed25519 -f $HOME\.ssh\postpilot_actions -C postpilot-github-actions
Get-Content $HOME\.ssh\postpilot_actions.pub | ssh ubuntu@YOUR_VPS_IP "umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys"
```

In GitHub **Repository Settings → Secrets and variables → Actions**, create these repository or `production` environment secrets:

| Secret | Value |
|---|---|
| `VPS_HOST` | The VPS IP or `api.example.com` |
| `VPS_USER` | `ubuntu` |
| `VPS_SSH_KEY` | Entire contents of the private `postpilot_actions` file, including BEGIN/END lines |
| `VPS_KNOWN_HOSTS` | A verified `known_hosts` line for the server |

Do not blindly trust a host key gathered over an untrusted network. On the **VPS**, get its ED25519 fingerprint:

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

On Windows, scan and inspect the same key, compare the fingerprint through your already trusted Oracle SSH session, and then store the complete scan output as `VPS_KNOWN_HOSTS`:

```powershell
ssh-keyscan -t ed25519 YOUR_VPS_IP | Set-Content .\postpilot_known_hosts
ssh-keygen -lf .\postpilot_known_hosts
Get-Content .\postpilot_known_hosts
Remove-Item .\postpilot_known_hosts
```

### 8.5 Run the first deployment

In GitHub **Actions → Deploy engine → Run workflow**. The workflow:

1. runs Maven verification;
2. builds only `linux/arm64`;
3. pushes the image to GHCR;
4. records the immutable image digest;
5. sends non-secret `infra/` files to the VPS;
6. deploys PostgreSQL, engine, and Caddy;
7. polls `https://api.example.com/actuator/health`;
8. rolls back to the prior image digest when a later deployment fails health checks.

After the first manual deployment succeeds, create the repository Actions
variable `ENABLE_PRODUCTION_DEPLOY=true` under **Settings → Secrets and
variables → Actions → Variables**. Later pushes that change the engine,
infrastructure, or deployment workflow will then deploy automatically. Leave
it unset whenever you want push deployments paused; manual workflow runs remain
available.

The workflow never copies `.env` because it is ignored and exists only on the VPS.

Verify:

```powershell
Invoke-RestMethod https://api.example.com/actuator/health
```

Expected status is `UP`. Caddy obtains and renews TLS automatically when the hostname resolves publicly and ports 80/443 are reachable; see the [Caddy HTTPS quick start](https://caddyserver.com/docs/quick-starts/https).

On the **VPS** inspect without exposing secrets:

```bash
cd "$HOME/postpilot/infra"
bash scripts/compose.sh ps
bash scripts/compose.sh logs --tail=100 caddy engine
```

## 9. Deploy the cockpit on Vercel

Skip to section 12 if Vercel Hobby's personal/non-commercial restriction does not fit your use.

### 9.1 Generate production web values

On **Windows PowerShell**, with `apps/web/.env.local` configured enough for the hash script:

```powershell
npm run hash-password -- "your-production-admin-password"
```

You need:

| Variable | Production value | Secret? |
|---|---|---|
| `ENGINE_URL` | `https://api.example.com/api/v1` | No, but server-only |
| `COCKPIT_JWT_SECRET` | Exact value from VPS `infra/.env` | **Yes** |
| `ADMIN_EMAIL` | Your login email | Treat as private |
| `ADMIN_PASSWORD_HASH_BASE64` | Generated Base64-wrapped bcrypt hash, never plaintext | **Yes** |
| `NEXTAUTH_SECRET` | Production generated value | **Yes** |

Do not add R2 credentials. Upload signing happens in the engine.

### 9.2 Import and configure the repository

1. In Vercel, select **Add New → Project** and import the GitHub repository.
2. Set **Root Directory** to `apps/web`. Vercel documents this monorepo flow in [Using Monorepos](https://vercel.com/docs/monorepos).
   In the same Root Directory settings, confirm **Include source files outside of the Root Directory in the Build Step** is enabled; the cockpit imports `packages/shared` from the monorepo. Newer projects normally enable this automatically, but verify it before the first deployment.
3. Keep the detected Next.js framework settings unless this repository's README says otherwise.
4. Add the five variables above for **Production**. Mark secrets Sensitive where the plan/UI permits; read [Vercel environment variables](https://vercel.com/docs/environment-variables).
5. Do not give preview deployments the production engine secret. Either disable untrusted previews, create a separate development engine, or use an invalid preview `ENGINE_URL` and a different random secret so previews cannot mutate production.
6. Deploy and inspect the build logs.

### 9.3 Attach the cockpit domain

In **Vercel Project → Settings → Domains**, add `app.example.com`. Vercel shows the exact CNAME it expects. Copy that value; do not rely on a value from a blog or this guide. Vercel's [custom-domain guide](https://vercel.com/docs/domains/set-up-custom-domain) explicitly recommends inspecting the required record.

In Cloudflare DNS create the shown CNAME for `app`, initially **DNS only**. Wait for Vercel to show valid configuration and issue TLS. Then open:

```text
https://app.example.com
```

### 9.4 How the UI is connected to the engine

No frontend code URL is pasted into Caddy and no engine secret is sent to the browser. The connection works as follows:

1. The signed-in browser calls `https://app.example.com/api/engine/...` on the same origin.
2. A Next.js server route reads `ENGINE_URL` and `COCKPIT_JWT_SECRET` from Vercel's server environment.
3. It issues a very short-lived JWT for the specific engine request.
4. It calls `https://api.example.com/api/v1/...` with that token.
5. The Spring Security filter checks the JWT before protected business routes run.
6. The engine response returns through Next.js to the browser.

`CORS_ALLOWED_ORIGINS=https://app.example.com` is still useful, but it is not what prevents unauthorized direct callers. Vercel Hobby egress addresses are dynamic, so no reliable Hobby IP allowlist is configured.

## 10. Create and connect publishing-provider apps

Deploy both hostnames first. Provider dashboards need real HTTPS callback URLs.

### 10.1 Meta: Facebook Page and Instagram Professional

Prerequisites:

- Your Facebook account has control of the target Page.
- The Instagram account is Business or Creator, not a consumer account.
- The Instagram Professional account is linked to the target Facebook Page.
- Your Facebook account is an administrator/developer/tester of the Meta app while testing.

Meta's verified official Postman collection lists the Facebook Login permissions used by its Instagram publishing flow: `pages_show_list`, `pages_read_engagement`, `instagram_basic`, and `instagram_content_publish`; Facebook Page publishing also requires the applicable Page-post management permission. See Meta's official [Instagram API collection](https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api) and always use the live Permissions and Features screen as the final authority.

Steps:

1. Open [Meta for Developers](https://developers.facebook.com/), complete developer registration, and create an app suitable for managing business assets. Dashboard labels change frequently; choose the use case/product that exposes Facebook Login, Pages, and Instagram API access.
2. Add Facebook Login and the Instagram API product/configuration used with Facebook Login.
3. In the OAuth client settings add both exact callback URLs. Facebook and
   Instagram buttons share the Meta app and can return through different
   platform-specific engine routes:

   ```text
   https://api.example.com/api/v1/oauth/facebook/callback
   https://api.example.com/api/v1/oauth/instagram/callback
   ```

4. Set the app domain and required privacy-policy/data-deletion details if the dashboard requests them.
5. Add your own Facebook user as an app role and ensure the target assets are owned/managed by that user/business during standard-access testing.
6. Copy App ID and App Secret into the VPS `infra/.env`:

   ```dotenv
   META_CLIENT_ID=<app ID>
   META_CLIENT_SECRET=<app secret>
   ```

7. Restart the engine so it reads the new environment:

   ```bash
   cd "$HOME/postpilot/infra"
   bash scripts/compose.sh up -d engine
   ```

8. Open PostPilot **Connections → Meta → Connect**, complete consent, select/confirm the Page, and verify both Page and Instagram channel health.

Start with the app in its testing/development access state and only your owned/managed assets. If unrelated client users or assets will connect, request the exact Advanced Access/App Review/business verification that Meta shows. “It is my app” is not a blanket review exemption.

Never describe the stored Page token as permanent. Password/security changes, revoked permissions, role changes, app changes, or provider enforcement can invalidate it. PostPilot must show reconnect when authorization fails.

### 10.2 LinkedIn member posting

LinkedIn documents `Share on LinkedIn` and `w_member_social` as open/self-service access for posting on behalf of an authenticated member. Organization Page posting is part of the vetted Community Management program. Read [Getting Access to LinkedIn APIs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access) before choosing products.

1. Create an app at the [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps), filling its associated LinkedIn Page/organization verification details when requested.
2. On **Products**, add **Share on LinkedIn** and **Sign in with LinkedIn
   using OpenID Connect**. The current engine requests `openid profile
   w_member_social` and calls LinkedIn's UserInfo endpoint to identify the
   member, so both products are part of this implemented flow.
3. On **Auth**, add exactly this HTTPS Authorized Redirect URL:

   ```text
   https://api.example.com/api/v1/oauth/linkedin/callback
   ```

   LinkedIn documents exact HTTPS callback registration in its [3-legged OAuth guide](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).

4. Copy Client ID and Client Secret to VPS `infra/.env`:

   ```dotenv
   LINKEDIN_CLIENT_ID=<client ID>
   LINKEDIN_CLIENT_SECRET=<client secret>
   LINKEDIN_API_VERSION=<a currently supported YYYYMM version tested by the engine>
   ```

5. Restart the engine, open **Connections → LinkedIn → Connect**, and authorize the member.
6. Publish one text-only test to your own member profile, then an image test.

If you need a company Page, stop and apply through LinkedIn's [Community Management App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review). Current documentation requires vetting and describes registered-legal-organization/commercial requirements. Do not assume member access permits organization posting.

LinkedIn retires versioned Marketing APIs. Review its supported versions before the configured `LINKEDIN_API_VERSION` sunsets.

### 10.3 X

X now documents a credit-based pay-per-usage API. Check [current pricing](https://docs.x.com/x-api/getting-started/pricing) in the same session in which you buy credits.

1. Sign in at [console.x.com](https://console.x.com/), accept the developer agreement, and create an app.
2. Purchase only the API credits you intend to test/use and enable the console's available usage controls/alerts.
3. Configure OAuth 2.0 Authorization Code with PKCE. This server application can be a confidential web client; keep the client secret only on the VPS.
4. Add exactly this callback URL:

   ```text
   https://api.example.com/api/v1/oauth/x/callback
   ```

5. Request only the scopes needed by the current adapter:

   ```text
   tweet.read tweet.write users.read offline.access media.write
   ```

   X documents these scopes in its [OAuth 2.0 PKCE guide](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code). `media.write` is needed when uploading media.

6. Set the website URL to the cockpit and fill any required app description/policy fields truthfully.
7. Copy values to VPS `infra/.env`:

   ```dotenv
   X_CLIENT_ID=<OAuth 2 client ID>
   X_CLIENT_SECRET=<client secret, if issued for the confidential client>
   ```

8. Restart engine, open **Connections → X → Connect**, and authorize the target account.
9. Publish one short text-only test and inspect X usage/billing before adding media or scheduling routine posts.

Use only X's official API. Do not replace it with cookie automation or scraping to avoid charges. X's [developer guidelines](https://docs.x.com/developer-guidelines) prohibit non-API automation and spam patterns.

### 10.4 Optional Telegram notifications

Telegram's [official bot guide](https://core.telegram.org/bots/features#botfather) says anyone with the bot token controls the bot, so treat it as a secret.

1. In Telegram, open verified `@BotFather`, send `/newbot`, and choose a unique username ending in `bot`.
2. Save the returned token.
3. Open a chat with the new bot and send `/start`. Bots cannot initiate a private conversation before the user interacts.
4. In a private browser window or terminal, call `getUpdates` using the token and find `message.chat.id` in the JSON:

   ```text
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```

5. Put both values in VPS `infra/.env`:

   ```dotenv
   TG_BOT_TOKEN=<token>
   TG_CHAT_ID=<numeric chat id>
   ```

6. Restart the engine and perform a test publish. Rotate the token through BotFather immediately if it appears in a log, screenshot, commit, or chat.

## 11. YouTube and TikTok: native workflows and optional future preparation

### YouTube

Use YouTube Studio to upload and schedule in v1. If building the adapter later:

1. Create a dedicated Google Cloud project.
2. Enable **YouTube Data API v3** as documented in [Getting Started](https://developers.google.com/youtube/v3/getting-started).
3. Configure the Google Auth consent screen and create a Web application OAuth client with the future engine's exact HTTPS callback URL.
4. Request the narrow `youtube.upload` scope and offline access only when implementing secure refresh-token storage.
5. Treat all uploads as private until the separate YouTube API audit is complete. Google states this restriction directly on [`videos.insert`](https://developers.google.com/youtube/v3/docs/videos/insert).

Ordinary Google OAuth verification and the YouTube upload audit are related but not interchangeable. Do not add Google secrets to this v1 environment because no YouTube adapter consumes them.

### TikTok

Use TikTok's native upload/scheduler. TikTok's [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/) state:

- unaudited Direct Post content is private;
- required privacy choices cannot be defaulted by the app;
- the user must expressly consent before transfer;
- an internal utility limited to accounts managed by the developer/team is not an acceptable intended-use example for audit.

Only create a TikTok developer app if PostPilot becomes a genuine broader creator product with the required user-controlled UX. TikTok's [app registration guide](https://developers.tiktok.com/doc/getting-started-create-an-app/) requires app review and URL ownership verification. R2 `PULL_FROM_URL` media also requires verified domain/prefix ownership and a non-redirecting HTTPS URL; see the [media transfer guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide).

## 12. Self-host the cockpit instead of Vercel

This option keeps both UI and engine on the Oracle VM and avoids Vercel Hobby's personal/non-commercial restriction. It is still not a guaranteed zero-cost service: Oracle capacity/reclamation, domain cost, R2 metering, and X API charges remain.

Prerequisites: the frontend Dockerfile exists, `app.example.com` points to the VPS, and the engine is healthy.

1. In Cloudflare DNS create `A app → VPS_IP`, DNS only initially. Remove any Vercel CNAME for the same name.
2. On the **VPS**, create the web environment:

   ```bash
   cd "$HOME/postpilot"
   cp apps/web/.env.example apps/web/.env.local
   chmod 600 apps/web/.env.local
   nano apps/web/.env.local
   ```

3. Use the internal Docker service name for the server-side engine URL:

   ```dotenv
   ENGINE_URL=http://engine:8080/api/v1
   COCKPIT_JWT_SECRET=<same production value as infra/.env>
   ADMIN_EMAIL=you@example.com
   ADMIN_PASSWORD_HASH_BASE64=<production Base64 hash output>
   NEXTAUTH_SECRET=<production NextAuth secret>
   AUTH_COOKIE_SECURE=true
   ```

4. Enable the Caddy site and persistent profile:

   ```bash
   cd "$HOME/postpilot/infra"
   cp sites/web.caddy.example sites/web.caddy
   chmod 600 sites/web.caddy
   printf '\nCOMPOSE_PROFILES=self-host-web\n' >> .env
   ```

   Ensure `APP_DOMAIN=app.example.com` exists once in `.env`.

5. Build and start:

   ```bash
   bash scripts/compose.sh --profile self-host-web up -d --build web caddy
   bash scripts/compose.sh ps
   ```

6. Open `https://app.example.com` and test login. Caddy handles both certificates.

For future frontend updates:

```bash
cd "$HOME/postpilot"
git pull --ff-only
cd infra
bash scripts/compose.sh --profile self-host-web up -d --build web caddy
```

The engine GitHub workflow continues deploying immutable engine digests. Because `COMPOSE_PROFILES=self-host-web` is in VPS `.env`, its Compose operations preserve the web service.

## 13. Initialize, schedule, and verify encrypted backups

The backup bucket is private. `pg_dump` creates a consistent custom-format archive; restic encrypts it before R2 storage. Restic deduplicates successive snapshots and the script retains 7 daily, 5 weekly, and 12 monthly generations. Retention uses R2 operations, so monitor usage rather than assuming it is always free.

On the **VPS**, initialize exactly once:

```bash
cd "$HOME/postpilot/infra"
bash scripts/backup-init.sh
bash scripts/backup.sh
bash scripts/verify-backup.sh
```

The verification does three things: checks the restic repository, restores the latest snapshot into a temporary directory, and asks `pg_restore` to parse the archive catalogue. A green upload log alone is not enough.

Install the systemd timer. These provided unit files assume the repository path is `/home/ubuntu/postpilot` and user is `ubuntu`:

```bash
sudo ln -sf /home/ubuntu/postpilot/infra/systemd/postpilot-backup.service /etc/systemd/system/postpilot-backup.service
sudo ln -sf /home/ubuntu/postpilot/infra/systemd/postpilot-backup.timer /etc/systemd/system/postpilot-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now postpilot-backup.timer
systemctl list-timers postpilot-backup.timer
sudo systemctl start postpilot-backup.service
journalctl -u postpilot-backup.service -n 100 --no-pager
```

Run `bash scripts/verify-backup.sh` monthly and after changing PostgreSQL, restic, R2 credentials, or retention.

Store `RESTIC_PASSWORD`, `VAULT_KEY`, production admin password, and recovery codes outside the VPS. The backup cannot help if its decryption password existed only on a lost/reclaimed VPS.

### Restore drill/runbook

Do this first on a disposable test host. The database replacement commands below are destructive.

1. Stop writes and take a current backup:

   ```bash
   cd "$HOME/postpilot/infra"
   bash scripts/backup.sh
   bash scripts/compose.sh stop engine
   ```

2. Load backup environment and inspect snapshots:

   ```bash
   source scripts/restic-env.sh
   restic snapshots --tag postpilot-db
   mkdir -p /var/tmp/postpilot-restore
   chmod 700 /var/tmp/postpilot-restore
   restic restore latest --tag postpilot-db --target /var/tmp/postpilot-restore
   find /var/tmp/postpilot-restore -type f -name '*.dump'
   ```

3. Set `DUMP_FILE` to the one restored file. Confirm it before continuing:

   ```bash
   DUMP_FILE=/var/tmp/postpilot-restore/path/to/postpilot-TIMESTAMP.dump
   test -s "$DUMP_FILE"
   bash scripts/compose.sh exec -T db pg_restore --list < "$DUMP_FILE" | head
   ```

4. Only after confirming the archive and accepting data loss after that snapshot, recreate and restore:

   ```bash
   bash scripts/compose.sh exec -T db dropdb --username "$DB_USER" --if-exists "$DB_NAME"
   bash scripts/compose.sh exec -T db createdb --username "$DB_USER" "$DB_NAME"
   bash scripts/compose.sh exec -T db pg_restore \
     --username "$DB_USER" \
     --dbname "$DB_NAME" \
     --no-owner \
     --no-privileges < "$DUMP_FILE"
   bash scripts/compose.sh start engine
   curl --fail --silent https://api.example.com/actuator/health
   ```

5. Verify login, connections, posts, calendar, and logs before deleting `/var/tmp/postpilot-restore`.

## 14. End-to-end validation checklist

Do not press “Post Everywhere” first. Validate one provider at a time with harmless content and remove the test posts afterwards if desired.

### Infrastructure

- [ ] `Resolve-DnsName api.example.com` returns the VPS.
- [ ] `https://api.example.com/actuator/health` returns `UP`.
- [ ] Ports 5432, 8080, and 3000 are not reachable from the internet.
- [ ] `bash scripts/compose.sh ps` shows database healthy and engine/Caddy running.
- [ ] `bash scripts/verify-backup.sh` passes.
- [ ] The backup timer appears in `systemctl list-timers`.
- [ ] Cloudflare R2 dashboard shows the media object only in the media bucket and restic data only in the private backup bucket.

### Authentication and UI-to-engine connection

- [ ] Wrong admin credentials fail without a detailed account-discovery message.
- [ ] Correct credentials set a Secure/HttpOnly production cookie.
- [ ] Browser developer tools show calls to same-origin `/api/engine/*`, not direct secrets or R2 keys.
- [ ] A direct protected engine API call without a valid JWT returns unauthorized.
- [ ] Vercel Preview deployments cannot mutate the production engine.

### Media

- [ ] Upload a small supported image from the composer.
- [ ] The browser PUT succeeds without any R2 credential in client JavaScript.
- [ ] The returned `https://media.example.com/...` URL is publicly fetchable by a logged-out browser.
- [ ] An upload from an unlisted origin fails CORS in a browser.

### Providers

- [ ] Meta connection shows the correct Page and linked Instagram Professional account.
- [ ] Facebook text-only test succeeds and its result stores a provider post ID.
- [ ] Instagram image test reaches a final success state; the engine does not treat container creation as publication success.
- [ ] LinkedIn test appears on the intended **member**, not an assumed organization Page.
- [ ] X text test appears and the X Developer Console shows expected credit usage.
- [ ] A failed/expired authorization produces a reconnect status, not infinite retries.
- [ ] Retrying a successful variant does not create a duplicate post.
- [ ] Telegram summary is correct when notifications are enabled.

Only then test a multi-platform post. Keep the first real campaign manually supervised.

## 15. Routine operations

### Logs and status

On the VPS:

```bash
cd "$HOME/postpilot/infra"
bash scripts/compose.sh ps
bash scripts/compose.sh logs --since=30m engine
bash scripts/compose.sh logs --since=30m caddy
journalctl -u postpilot-backup.service --since yesterday --no-pager
df -h
docker system df
```

The Compose logging driver rotates container logs. Do not add access tokens or full authorization headers to application logs.

### Deployments and rollback

When `ENABLE_PRODUCTION_DEPLOY=true`, pushes to `main` that change the engine or infra trigger deployment. Images are deployed by immutable digest, not `latest`. The deployment script preserves the prior digest and automatically rolls back when the public health check fails.

For an infrastructure configuration failure, revert the offending commit and run the workflow again. The image rollback cannot undo an incompatible database migration; treat Flyway migrations as forward-only production changes and back up before risky schema releases.

### Updates

- Review Dependabot pull requests; do not auto-merge major framework, database, Caddy, Docker, or action changes without CI and a backup.
- Patch Ubuntu and Docker regularly during a maintenance window.
- Check Meta Graph and LinkedIn version retirement calendars monthly.
- Check X credit balance/usage, R2 metering, Vercel usage, OCI cost reports, and the OCI budget alert.
- Re-test backups after every storage credential change.

### Oracle reclamation risk

Oracle documents that an Always Free A1 instance may be reclaimed when all three seven-day idle measures remain below its thresholds. A scheduler or synthetic ping does not guarantee retention. Do not waste resources to manufacture load. Encrypted off-host backups, a reproducible Compose stack, saved secrets, and the GitHub repository are the recovery plan.

## 16. Troubleshooting map

| Symptom | Most likely checks |
|---|---|
| Caddy cannot issue TLS | DNS does not point to VPS; ports 80/443 blocked in OCI; another process owns a port; inspect Caddy logs. |
| UI says engine unavailable | Verify `ENGINE_URL` ends in `/api/v1`; health endpoint; Caddy logs; Vercel production variables; redeploy after variable changes. |
| Engine returns 401 through UI | `COCKPIT_JWT_SECRET` differs between Vercel/web and VPS; JWT issuer/audience settings were changed on only one side; system clocks are badly skewed. |
| Browser upload CORS failure | Exact app origin missing from R2 CORS; `Content-Type` header differs from the signed request; stale cached CORS response. |
| Media URL is 404 | Wrong `R2_PUBLIC_BASE_URL`; custom domain not Active; wrong object key; cache may hold a previous 404. |
| OAuth redirect mismatch | Registered callback differs in scheme, host, path, case, or trailing slash; use the exact four URLs in section 3. |
| Meta Page absent | User lacks Page control; permissions not granted; Page/IG link missing; asset not available at the app's current access level. |
| Instagram container never publishes | Media URL is not public/fetchable or format is rejected; poll container status and record provider error. |
| LinkedIn organization absent | `Share on LinkedIn` is member access; organization publishing needs Community Management approval and applicable Page role. |
| X requests fail despite valid OAuth | Credit balance exhausted; required scope missing; app permission changed after token issuance; reconnect after changing scopes. |
| Backup timer “succeeds” but nothing in R2 | Inspect service journal, run backup and verification manually, confirm backup bucket token and restic repository password. |
| `docker compose pull` denied | GHCR package remains private and VPS login/token lacks `read:packages`, or token was revoked. |
| OCI VM disappears | Check OCI notifications/resource state, recreate within current allowance, restore secrets and database from R2; do not rely on local disk. |

## 17. Source links to re-check before launch

- [Oracle Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm) and [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Vercel plans/terms](https://vercel.com/pricing), [limits](https://vercel.com/docs/limits), [monorepos](https://vercel.com/docs/monorepos), and [custom domains](https://vercel.com/docs/domains/set-up-custom-domain)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/), [public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), and [CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- Meta's official [Instagram API collection](https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api) and [Meta developer docs](https://developers.facebook.com/docs/)
- LinkedIn [API access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access), [OAuth](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow), and [Community Management review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review)
- X [pricing](https://docs.x.com/x-api/getting-started/pricing), [OAuth 2.0](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), and [developer guidelines](https://docs.x.com/developer-guidelines)
- YouTube [`videos.insert`](https://developers.google.com/youtube/v3/docs/videos/insert) and [Google OAuth verification](https://support.google.com/cloud/answer/13463073)
- TikTok [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/) and [app registration](https://developers.tiktok.com/doc/getting-started-create-an-app/)
- GitHub [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), and [secure Actions use](https://docs.github.com/en/actions/reference/security/secure-use)
