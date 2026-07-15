# 🚀 MERITBYTE "POSTPILOT" — FULL BUILD & DEPLOY PLAN
### Your own auto-posting platform: Next.js cockpit on Vercel + engine on a free VPS → one click, six platforms, $0/month

---

# PART 0 — WHAT YOU'RE BUILDING

**Product in one sentence:** a private web app at `app.yourdomain.com` where today's content (caption + title + hashtags + media, per platform) is pre-loaded, you review it on one screen, press **🚀 Post Everywhere**, and it publishes/schedules to Facebook, Instagram, X, LinkedIn (+ TikTok & YouTube once audited) — from any device, anywhere.

**Two build paths — same infrastructure, same frontend:**

| | Path A — "Cockpit + Engine" | Path B — "Full Custom Engine" |
|---|---|---|
| Posting engine | Postiz (open-source, self-hosted) does OAuth, tokens, platform quirks | You write it in **Spring Boot** — you own 100% |
| Your code | Next.js cockpit + thin proxy (~1,500 LOC) | Cockpit + engine (~6–8K LOC) |
| Time to live | **2–3 days** | **~14 days part-time** |
| Best for | Getting the single-click workflow running NOW | Turning PostPilot into a sellable MeritByte product later |

**The smart sequence:** build the frontend with an `EngineClient` adapter interface from day 1 → ship Path A this week → swap in your Spring Boot engine (Path B) behind the same UI whenever the SaaS itch wins. Zero throwaway work. This document specs both.

---

# PART 1 — FREE INFRASTRUCTURE MAP (verified July 2026)

| Component | Choice | Free limits (current) | Role |
|---|---|---|---|
| Frontend hosting | **Vercel Hobby** | 100 GB bandwidth/mo — plenty | Next.js cockpit, global CDN, HTTPS |
| VPS | **Oracle Cloud Always Free** | ⚠️ Arm Ampere A1 allowance was **cut in June 2026: now 2 OCPU / 12 GB RAM** (was 4/24) + 200 GB disk + 10 TB egress/mo | Engine + Postgres + reverse proxy — 2 OCPU/12 GB is still more than most $10–20/mo paid VPS |
| Database | Postgres 16 in Docker on the VPS | Unlimited (your disk) | Posts, variants, tokens, logs |
| Media storage | **Cloudflare R2** | 10 GB storage, **zero egress fees** | ⚠️ Critical: Meta/IG APIs require a **public URL** for media — R2 provides it free |
| DNS + SSL | Cloudflare Free + **Caddy** on VPS | Free | `api.` subdomain, automatic Let's Encrypt |
| CI/CD | GitHub Actions | 2,000 min/mo | Build arm64 image → deploy to VPS |
| Notifications | Telegram Bot API | Free | "✅ Posted to 4/4" / failure alerts |
| Auth | NextAuth (single admin) | Free | It's your internal tool — one login |

**Oracle gotchas (know before signup):**
1. **Capacity:** "Out of capacity" errors on A1 are common. Fixes: try another Availability Domain, retry off-peak, or upgrade the account to **Pay-As-You-Go** (a ~$100 temporary card hold, released) — PAYG accounts get capacity priority and you're still **billed $0 while inside free limits**. Set a **$1 budget alert** immediately either way.
2. **Home region is permanent** — pick one close-ish with known capacity (e.g., Singapore/Mumbai for you) at signup.
3. **It's ARM (aarch64)** — build Docker images for `linux/arm64` (covered in Part 6). Spring Boot, Node, Postgres, Postiz all run natively fine.
4. Stay within *exactly* the free shapes (1× A1 with 2 OCPU/12 GB, ≤200 GB volumes) and you cannot be charged on a free-tier account.

**Total monthly cost: $0** (+ the domain you already own).

---

# PART 2 — ARCHITECTURE

```
                    ┌─────────────────────────────────────────────┐
   you, anywhere ──▶│  app.meritbyte.___  (Vercel · Next.js 15)   │
                    │  /today  /composer  /calendar  /connections │
                    └───────────────┬─────────────────────────────┘
                                    │ HTTPS + JWT (server-side proxy routes)
                                    ▼
                    ┌─────────────────────────────────────────────┐
                    │        api.meritbyte.___  (Oracle VPS)       │
                    │  Caddy :443 ──▶ ENGINE :3000/:8080           │
                    │     ENGINE = Postiz (Path A)                 │
                    │            or Spring Boot "postpilot" (B)    │
                    │  Postgres 16 ── tokens·posts·logs            │
                    └───────┬──────────────┬───────────────────────┘
                            │              │
              media public URLs      platform APIs
                            ▼              ▼
                    ┌──────────────┐  ┌────────────────────────────┐
                    │ Cloudflare R2│  │ Meta(FB+IG) · X · LinkedIn │
                    │  10GB free   │  │ · TikTok* · YouTube*       │
                    └──────────────┘  └────────────────────────────┘
                                           * after platform audit
                    Telegram bot ◀── publish results / failures
```

**Monorepo layout (one GitHub repo):**
```
postpilot/
├── apps/
│   ├── web/        # Next.js 15 cockpit → Vercel
│   └── engine/     # Spring Boot 3 (Path B) — empty until you build it
├── infra/
│   ├── docker-compose.yml
│   ├── Caddyfile
│   └── .env.example
└── packages/shared # TS types: Post, Variant, Platform, PublishResult
```

---

# PART 3 — PATH A: LIVE IN A WEEKEND (Postiz engine + your cockpit)

## A1. Engine up on the VPS (half a day)
1. VPS ready (Part 6, steps 1–5).
2. Deploy Postiz with its **official current docker-compose** from `docs.postiz.com` (it includes Postgres/Redis/Temporal — don't hand-roll from old tutorials). Put it behind Caddy at `https://postiz.yourdomain.com`.
3. Connect accounts (from the previous guide): **LinkedIn 🟢, X 🟢, Meta FB+IG 🟡** now; keep **TikTok/YouTube 🔴** on native schedulers until their audits clear.
4. Settings → API → generate your **Postiz API key**.

## A2. The cockpit (1–2 days)
**Stack:** Next.js 15 (App Router) · Tailwind + shadcn/ui · NextAuth (credentials, single admin) · dark theme `#0A0E1A` / cyan `#00D4FF`.

**Pages:**
- `/today` — **the one-click screen.** A vertical stack of platform cards (FB, IG, X, LinkedIn…), each showing today's caption/title/hashtags + media thumbnail, editable inline. Top of page: date selector + one giant button **[🚀 Post Everywhere]** and a secondary **[🕒 Schedule for slot times]** (08:00 / 18:45 NPT). After click: each card shows a live status chip `queued → posting → ✅ / ❌ retry`.
- `/composer` — write once → auto-generates per-platform variants (rule-based trims + your saved hashtag banks); attach media (uploads to R2 via presigned URL).
- `/calendar` — month grid of scheduled/posted items (reads engine).
- `/import` — paste CSV rows (your existing Google-Sheet schema: `date, platform, post_type, title, caption, hashtags, media_link, status`) → bulk-create drafts.
- `/connections` — status per platform + "Reconnect" links.
- `/logs` — publish history + errors.

**The adapter (the future-proofing trick):**
```ts
// packages/shared/engine.ts
export interface EngineClient {
  listChannels(): Promise<Channel[]>;
  createPost(p: { channels: string[]; content: PerPlatformContent;
                  mediaUrls: string[]; publishAt?: string }): Promise<PublishResult[]>;
  getCalendar(from: string, to: string): Promise<CalendarItem[]>;
}
// implementations: PostizEngine (Path A) · PostpilotEngine (Path B)
// selected by env: ENGINE=postiz | custom
```

**Security shape:** the browser never talks to the VPS directly. Cockpit UI → Next.js **Route Handlers** (`/api/engine/*`, server-side on Vercel) → VPS with the API key from Vercel env vars. CORS on the VPS locked to nothing public; Caddy only accepts your Vercel egress + basic auth header.

**Vercel env vars:** `ENGINE=postiz · ENGINE_URL=https://postiz.yourdomain.com/public/v1 · ENGINE_API_KEY=… · NEXTAUTH_SECRET=… · ADMIN_EMAIL/PASSWORD_HASH=… · R2_ACCOUNT_ID/ACCESS_KEY/SECRET/BUCKET=…`

**Definition of done (Path A):** open `app.yourdomain.com` on your phone → `/today` shows Day N content → one tap → FB, IG, X, LinkedIn all post → Telegram pings ✅. TikTok/YouTube: 5 min/week on native schedulers until audits pass.

---

# PART 4 — PATH B: THE FULL CUSTOM ENGINE (Spring Boot 3 · Java 21)

Build this when you want to own the engine outright (and eventually sell PostPilot as a MeritByte product).

## 4.1 Database schema (Postgres)

```sql
create table social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,              -- facebook|instagram|x|linkedin|youtube|tiktok
  external_id text not null,           -- page id / ig user id / member urn / handle
  display_name text,
  access_token_enc bytea not null,     -- AES-GCM encrypted
  refresh_token_enc bytea,
  expires_at timestamptz,
  scopes text,
  status text default 'active',        -- active|expired|error
  unique (platform, external_id)
);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  r2_key text not null,
  public_url text not null,            -- Meta/IG consume this
  kind text not null,                  -- image|video
  created_at timestamptz default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  topic text,
  scheduled_at timestamptz,            -- null = manual one-click only
  status text default 'draft'          -- draft|ready|publishing|done|failed
);

create table post_variants (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  platform text not null,
  title text,                          -- YT/short title
  caption text not null,
  hashtags text,
  media_id uuid references media_assets(id),
  unique (post_id, platform)
);

create table publish_results (
  id bigserial primary key,
  variant_id uuid references post_variants(id),
  attempt int default 1,
  status text not null,                -- queued|posting|success|failed
  platform_post_id text,
  error text,
  posted_at timestamptz default now()
);
```

## 4.2 Engine core (module shape + the one interface that matters)

```
engine/src/main/java/com/meritbyte/postpilot/
├── auth/          # cockpit JWT filter (single shared secret)
├── connections/   # OAuth controllers: /oauth/{platform}/start + /callback
├── vault/         # TokenVault: AES-GCM encrypt/decrypt, hourly refresh job
├── media/         # R2 presign (S3-compatible SDK), asset registry
├── publish/       # PublishService + adapters
├── schedule/      # @Scheduled(60s): due variants → publish
└── notify/        # TelegramNotifier
```

```java
public interface PlatformPublisher {
  Platform platform();
  PublishResult publish(PostVariant v, MediaAsset media, SocialAccount acct);
  boolean refresh(SocialAccount acct);          // token refresh, true if renewed
}

@Service
public class PublishService {
  private final Map<Platform, PlatformPublisher> adapters; // injected registry
  public List<PublishResult> publishAll(UUID postId) {
    // load variants → run adapters in parallel (virtual threads) →
    // persist publish_results → TelegramNotifier.summary(results)
  }
}
```

Retry policy: 3 attempts, exponential backoff (30s → 2m → 10m), then mark `failed` + Telegram alert. Idempotency: skip variant if a `success` result already exists.

## 4.3 Per-platform adapter cheat sheet (the hard-won part)

| Platform | Auth | Publish flow | Quirks / limits |
|---|---|---|---|
| **X** | OAuth2 PKCE (`tweet.write users.read offline.access`) | media chunked upload → `POST /2/tweets` with media ids | Free tier ≈ **500 posts/mo** — fine for 1–2/day. Refresh tokens rotate: always store the new one. |
| **LinkedIn** | OAuth2 3-legged (`w_member_social` + OpenID) | images/video: `initializeUpload` → PUT bytes → `POST /rest/posts` | Send the required `LinkedIn-Version: YYYYMM` header; own-profile posting needs no review. |
| **Facebook Page** | Meta app → user token → **Page token** via `/me/accounts` | `POST /{page-id}/feed` (text/link), `/photos`, `/videos` | Page tokens from long-lived user tokens don't expire in practice; still monitor. |
| **Instagram** | Same Meta app (IG **Business** + linked Page) | `POST /{ig-user-id}/media` with `image_url` / `video_url` (+`media_type=REELS`) from **R2 public URL** → poll container `status_code` → `POST /{ig-user-id}/media_publish` | ⭐ **Dev-Mode apps can post to accounts whose users are app admins/testers — i.e., your own pages/IG need NO App Review.** This is what makes Path B viable solo. |
| **YouTube** | Google OAuth2 (`youtube.upload`) | `videos.insert` resumable upload, set title/description/tags + `publishAt` | ⚠️ Uploads via **unverified** OAuth apps are locked **private**. Ship without YT; do Google's verification/audit in parallel; use native Studio scheduler meanwhile. |
| **TikTok** | TikTok OAuth (Content Posting API) | init upload → chunk video → publish | ⚠️ **Unaudited apps = private/draft posts only.** Apply for audit as a real business; native scheduler until approved. |

**v1 scope decision (be ruthless):** adapters for **X, LinkedIn, Facebook, Instagram** = 100% automated. TikTok + YouTube stay on native schedulers (≈5 min/week) until audits pass — then drop in their adapters. Same UI either way.

## 4.4 Engine REST API (what the cockpit calls)

```
POST /api/v1/oauth/{platform}/start        → redirect URL
GET  /api/v1/oauth/{platform}/callback     → stores encrypted tokens
GET  /api/v1/channels                      → connected accounts + health
POST /api/v1/media/presign                 → R2 presigned PUT + public_url
POST /api/v1/posts                         → create post + variants
POST /api/v1/posts/{id}/publish            → 🚀 the one-click endpoint
GET  /api/v1/posts/{id}/results            → per-platform status (cockpit polls)
GET  /api/v1/calendar?from&to
```

**Engine env:** `DB_URL/USER/PASS · VAULT_KEY(32B base64) · COCKPIT_JWT_SECRET · R2_* · TG_BOT_TOKEN/CHAT_ID ·` per-platform `CLIENT_ID/SECRET` + `OAUTH_REDIRECT_BASE=https://api.yourdomain.com`.

---

# PART 5 — DEPLOYMENT RUNBOOK (exact steps)

## Step 1 — Oracle VPS
1. Sign up at oracle.com/cloud/free (card = identity check only). **Home region choice is permanent** — Singapore or Mumbai are sensible from Nepal.
2. Create instance: **VM.Standard.A1.Flex — 2 OCPU / 12 GB**, Ubuntu 24.04 (aarch64), 100 GB boot volume, paste your SSH public key.
3. "Out of capacity"? → other Availability Domain → retry off-peak → or upgrade to PAYG (temporary ~$100 hold; still $0 within free limits) and set a **$1 budget alert** (Billing → Budgets).
4. Networking: VCN security list → allow ingress TCP **80, 443** from 0.0.0.0/0.

## Step 2 — Server prep
```bash
ssh ubuntu@<VPS_IP>
sudo apt update && sudo apt -y upgrade
curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker ubuntu
sudo ufw allow 22,80,443/tcp && sudo ufw enable
```

## Step 3 — DNS (Cloudflare)
`A api → <VPS_IP>` and `A postiz → <VPS_IP>` (proxy **off/grey** until Caddy issues certs, then optional). Cockpit domain `app.` will point to Vercel later.

## Step 4 — infra/Caddyfile
```
api.yourdomain.com {
    reverse_proxy engine:8080
}
postiz.yourdomain.com {
    reverse_proxy postiz:5000
}
```

## Step 5 — infra/docker-compose.yml (Path B core; add Postiz's official services alongside for Path A)
```yaml
services:
  db:
    image: postgres:16-alpine
    environment: { POSTGRES_DB: postpilot, POSTGRES_USER: pp, POSTGRES_PASSWORD: ${DB_PASS} }
    volumes: [ dbdata:/var/lib/postgresql/data ]
    restart: unless-stopped
  engine:
    image: ghcr.io/<you>/postpilot-engine:latest   # arm64 image
    env_file: .env
    depends_on: [ db ]
    restart: unless-stopped
  caddy:
    image: caddy:2-alpine
    ports: [ "80:80", "443:443" ]
    volumes: [ ./Caddyfile:/etc/caddy/Caddyfile, caddydata:/data ]
    restart: unless-stopped
volumes: { dbdata: {}, caddydata: {} }
```

## Step 6 — CI/CD (GitHub Actions → arm64 image → VPS)
```yaml
name: deploy-engine
on: { push: { branches: [main], paths: ['apps/engine/**'] } }
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - uses: docker/build-push-action@v6
        with: { context: apps/engine, platforms: linux/arm64, push: true,
                tags: ghcr.io/${{ github.repository }}-engine:latest }
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ubuntu
          key: ${{ secrets.VPS_SSH_KEY }}
          script: cd ~/postpilot/infra && docker compose pull engine && docker compose up -d
```

## Step 7 — R2
Cloudflare dash → R2 → create bucket `postpilot-media` → enable public access (r2.dev URL or custom `media.yourdomain.com`) → create API token → put keys in both Vercel and engine envs.

## Step 8 — Vercel
Import repo → root directory `apps/web` → add env vars (Part 3) → deploy → attach `app.yourdomain.com`. Redeploys on every push. Done: cockpit is globally accessible.

## Step 9 — Platform developer apps (redirect URI everywhere: `https://api.yourdomain.com/api/v1/oauth/{platform}/callback`)
☐ Meta app (FB Login + Instagram products; add yourself as admin — Dev Mode is enough)
☐ LinkedIn app (Share on LinkedIn + Sign In products)
☐ X developer free tier app (OAuth2, write scope)
☐ Google Cloud project (YouTube Data API; start verification — parallel track)
☐ TikTok developer app (Content Posting; apply for audit — parallel track)

---

# PART 6 — BUILD SCHEDULE

**Path A (this week):** D1 VPS+Caddy+Postiz live · D2 connect X/LinkedIn/Meta + cockpit `/today`+auth · D3 composer, CSV import, R2 upload, polish → **live**.

**Path B (14 days part-time), keeping A in production:**
D1–2 schema + JWT + Telegram · D3 R2 presign/media · D4–5 X adapter (OAuth→publish e2e) · D6–7 LinkedIn · D8–10 Meta FB+IG (container flow — hardest, budget it) · D11 scheduler+retries · D12 publish orchestrator + results SSE/poll · D13 swap cockpit `ENGINE=custom`, parallel-run vs Postiz · D14 hardening, backups, kill or keep Postiz.

---

# PART 7 — GUARDRAILS & GOTCHAS

1. **Nightly backup:** cron `pg_dump | gzip` → upload to R2. An un-backed-up free VPS is a time bomb.
2. **Keep the VPS "active":** free-tier idle instances can be reclaimed — your 60s scheduler conveniently counts as activity; add a 5-min healthcheck ping (UptimeRobot free) for alerting too.
3. **Tokens are the #1 failure:** X refresh tokens rotate on use; LinkedIn expires ~60 days; hourly refresh job + `status=expired` → Telegram "Reconnect LinkedIn" alert.
4. **Secrets hygiene:** `VAULT_KEY` and platform secrets only in `.env` on the VPS + Vercel env — never in the repo. Cockpit→engine calls carry the shared JWT; engine rejects all else.
5. **Don't spam-clone captions** across platforms — your calendar already varies them; keep it that way (both for reach and platform policy).
6. **Vercel Hobby is licensed for personal/non-commercial** — fine for your internal tool; the day PostPilot takes client accounts, move to Pro ($20) — by then it's a product.
7. **The productization path (later):** add `tenant_id` to every table + Postiz-style channel limits + Stripe — PostPilot becomes a MeritByte SaaS with the same architecture. You'll have built it by using it.

---

*MeritByte PostPilot — one click, everywhere, $0/month.* ⚙️🚀
