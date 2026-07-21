# Connecting Social Media to `postiz.pachey.duckdns.org`

Complete setup instructions for every network supported by your self-hosted Postiz.

> **Provider list, identifiers and env-var names in this document were extracted directly
> from your running Postiz container** — they are not generic docs. Callback URLs here are
> the exact ones your instance sends.

---

## 1. The universal process

Every network follows the same three steps. Only **Step A** differs per platform.

### Step A — Create a developer app on the platform
You must do this yourself: it requires your identity and agreement to that platform's terms.
Register the **callback URL** (below) and copy the **Client ID + Secret**.

### Step B — Put the credentials on the server
Secrets never go through chat or code. SSH in and edit one file:

```bash
ssh -i ~/.ssh/postpilot_oracle_ed25519 ubuntu@pachey.duckdns.org
sudo nano /opt/postiz/social.env
```
Fill in only the lines for the platform you set up. Save with `Ctrl+O`, `Enter`, exit `Ctrl+X`.

### Step C — Apply and restart
```bash
sudo python3 /opt/postiz/apply-social.py
cd /opt/postiz && sudo docker compose -f docker-compose.production.yaml up -d
```
Wait ~90 seconds for warm-up, then in Postiz: **Add Channel → pick the network → authorize.**

### The callback URL pattern
```
https://postiz.pachey.duckdns.org/integrations/social/<identifier>
```
Use the exact `<identifier>` from the tables below. **No trailing slash.** Always HTTPS.

---

## 2. Zero-setup networks — connect these in under 2 minutes

These require **no developer app, no API keys, no callback URL, and no server changes**.
Just click Add Channel in Postiz and sign in. **Start here if you are in a hurry.**

| Network | What you need | Notes |
|---|---|---|
| **Bluesky** | Handle + **app password** | Bluesky → Settings → App Passwords. Easiest network that exists. |
| **Nostr** | Private key (nsec) | Fully decentralised, instant. |
| **Dev.to** | API key from Dev.to settings | Blogging platform. |
| **Medium** | Integration token | Blogging platform. |
| **WordPress** | Site URL + credentials | Self-hosted or .com. |
| **Lemmy** | Instance + login | Reddit-like, federated. |
| **Listmonk** | Your Listmonk instance | Newsletter. |
| **Skool** | Community login | Community platform. |
| **Moltbook** | Login | — |

> **Deadline tip:** **Bluesky** is the single fastest path to a real published post. It needs
> nothing from the server — no `social.env` edit, no container restart.

---

## 3. Easy networks — self-serve app, no review

Instant approval. Create the app, paste two values, done.

### Reddit
| | |
|---|---|
| **Portal** | <https://www.reddit.com/prefs/apps> → *create app* → type **web app** |
| **Callback** | `https://postiz.pachey.duckdns.org/integrations/social/reddit` |
| **`social.env`** | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` |
| **Review?** | None. Works immediately. |

### Mastodon
| | |
|---|---|
| **Portal** | Your instance → *Preferences → Development → New application* |
| **Callback** | `https://postiz.pachey.duckdns.org/integrations/social/mastodon` |
| **`social.env`** | `MASTODON_CLIENT_ID`, `MASTODON_CLIENT_SECRET`, `MASTODON_URL` |
| **Scopes** | `read`, `write` |
| **Review?** | None. |

### Telegram
| | |
|---|---|
| **Portal** | Chat with **@BotFather** → `/newbot` → copy the token |
| **Callback** | none (bot-based) |
| **`social.env`** | `TELEGRAM_TOKEN` |
| **Notes** | Add the bot to your channel as an **administrator**. |

### Discord
| | |
|---|---|
| **Portal** | <https://discord.com/developers/applications> |
| **Callback** | `https://postiz.pachey.duckdns.org/integrations/social/discord` |
| **`social.env`** | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN_ID` |
| **Notes** | Add a **Bot** to the app; invite it to your server with *Send Messages*. |

### Slack
| | |
|---|---|
| **Portal** | <https://api.slack.com/apps> |
| **Callback** | `https://postiz.pachey.duckdns.org/integrations/social/slack` |
| **`social.env`** | `SLACK_ID`, `SLACK_SECRET` |
| **Scopes** | `chat:write`, `channels:read` |

### Twitch / Kick / Pinterest / Dribbble / VK
| Network | Portal | Callback identifier | Env vars |
|---|---|---|---|
| Twitch | dev.twitch.tv/console/apps | `twitch` | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` |
| Kick | kick.com developer settings | `kick` | `KICK_CLIENT_ID`, `KICK_SECRET` |
| Pinterest | developers.pinterest.com | `pinterest` | `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` |
| Dribbble | dribbble.com/account/applications | `dribbble` | `DRIBBBLE_CLIENT_ID`, `DRIBBBLE_CLIENT_SECRET` |
| VK | vk.com/apps?act=manage | `vk` | `VK_ID` |

---

## 4. Approval-gated networks — start these early

These work only after the platform reviews your app. **Begin the request days in advance.**

### LinkedIn — personal profile ✅ *configured on your instance*
| | |
|---|---|
| **Portal** | <https://www.linkedin.com/developers/apps> |
| **Callback** | `https://postiz.pachey.duckdns.org/integrations/social/linkedin` |
| **`social.env`** | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |
| **Products** | *Sign In with LinkedIn using OpenID Connect* + *Share on LinkedIn* (both self-serve) |
| **Scopes used** | `openid`, `profile`, `w_member_social` |

> ⚠️ **Local patch applied.** Stock Postiz also demands `r_basicprofile`,
> `rw_organization_admin`, `w_organization_social`, `r_organization_social` on this
> provider, and its `checkScopes()` rejects the connection unless **every** scope is
> granted — producing *"Could not add provider."* Your instance is patched to request only
> the three scopes above. The patch lives in `/opt/postiz/patches/` and is bind-mounted in
> `docker-compose.production.yaml`, so it survives container recreates.
> **If you ever upgrade the Postiz image, re-generate this patch.**

### LinkedIn — Company Page (e.g. MeritByte)
| | |
|---|---|
| **Callback** | `https://postiz.pachey.duckdns.org/integrations/social/linkedin-page` |
| **`social.env`** | same `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` |
| **Required product** | **Community Management API** — *not* self-serve |
| **Scopes** | `rw_organization_admin`, `w_organization_social`, `r_organization_social` |

**Steps:** Products tab → request *Community Management API* → LinkedIn generates a
verification link → a **Page admin** must approve it → set *Settings → Company* to your Page.
You must be an admin of the Page. **This cannot be bypassed by any server-side change** —
LinkedIn simply will not issue org scopes to an unapproved app.

### Facebook + Instagram (one Meta app)
| | |
|---|---|
| **Portal** | <https://developers.facebook.com/apps> → app type **Business** |
| **Callbacks** | `.../integrations/social/facebook` and `.../integrations/social/instagram` |
| **`social.env`** | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` |
| **Products** | *Facebook Login* + *Instagram Graph API* |
| **Requirements** | Instagram must be a **Professional (Business/Creator)** account **linked to a Facebook Page** |
| **Review** | **App Review + Business Verification** required to post for anyone but app admins. Days to weeks. |

*Instagram standalone* is a separate provider (`instagram-standalone`) using
`INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`.

### X (Twitter)
| | |
|---|---|
| **Portal** | <https://developer.x.com/en/portal/dashboard> |
| **Callback** | `https://postiz.pachey.duckdns.org/integrations/social/x` |
| **`social.env`** | `X_API_KEY`, `X_API_SECRET` |
| **Auth flow** | **OAuth 1.0a** (Postiz uses the `twitter-api-v2` client with `appKey`/`appSecret`) |
| **Credentials** | *Keys and tokens* → **Consumer Keys → API Key and Secret** |
| **Permissions** | *User authentication settings* → enable **OAuth 1.0a**, App permissions **Read and write** |

> ⚠️ **Do not use the OAuth 2.0 Client ID / Client Secret here.** Postiz's X provider is
> OAuth 1.0a and needs the **API Key + API Secret** (a.k.a. Consumer Keys) — a different pair
> on the same page. PostPilot's X integration uses OAuth 2.0, so the two apps need
> *different* values from the same X app. Mixing them up is the most common cause of failure.
>
> ⚠️ **App permissions must be "Read and write"** before you connect. If it is Read-only,
> the OAuth handshake still succeeds but every post fails. Changing this setting requires
> regenerating your keys afterwards.
>
> 💰 **Cost:** X is the only network here that charges. On the **Pay Per Use** plan you must
> hold a **prepaid credit balance** — with a zero balance the API returns `HTTP 402 Payment
> Required` on publish (the OAuth connect step may still succeed, which is misleading).
> Check *Billing → Credits*. Metered billing is typically cents per post, not a flat $200/mo.

### YouTube / Google Business Profile
| | |
|---|---|
| **Portal** | Google Cloud Console → enable **YouTube Data API v3** |
| **Callbacks** | `.../integrations/social/youtube`, `.../integrations/social/gmb` |
| **`social.env`** | `YOUTUBE_CLIENT_ID`/`SECRET`; GMB uses `GOOGLE_GMB_CLIENT_ID`/`SECRET` |
| **Review** | OAuth consent screen verification needed for sensitive scopes. |

### TikTok
| | |
|---|---|
| **Portal** | <https://developers.tiktok.com> |
| **Callback** | `https://postiz.pachey.duckdns.org/integrations/social/tiktok` |
| **`social.env`** | `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET` |
| **Review** | **Content Posting API** scope requires audit/approval. |

### Threads
| | |
|---|---|
| **Callback** | `https://postiz.pachey.duckdns.org/integrations/social/threads` |
| **`social.env`** | `THREADS_APP_ID`, `THREADS_APP_SECRET` |
| **Notes** | Created through the Meta developer portal. |

---

## 5. Recommended order

1. **Bluesky** — prove the pipeline end-to-end today, zero setup.
2. **LinkedIn personal** — already configured and patched on your instance.
3. **Reddit / Mastodon / Telegram** — 5 minutes each, no review.
4. **Start the slow approvals now** so they land while you use the above:
   LinkedIn Community Management API, Meta App Review, TikTok audit.
5. **X** — only if you're willing to pay for API access.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `client_id=` **blank** in the URL | Credentials not set for that platform | Fill `social.env`, run `apply-social.py`, recreate container |
| **"The redirect_uri does not match the registered value"** | Callback not registered, or wrong identifier | Register the exact URL. Note `linkedin` ≠ `linkedin-page` |
| **"Could not add provider"** | Token came back missing a required scope; `checkScopes()` threw | Confirm the platform granted every scope Postiz requests (see LinkedIn note above) |
| **"Bummer, something went wrong"** (LinkedIn) | Requested a scope the app isn't approved for | Add the matching product, or reduce the requested scopes |
| Changes to `social.env` do nothing | Container not recreated | `docker compose ... up -d` — a `restart` is **not** enough for env changes |
| Patch reverted after an update | New image replaced patched files | Re-apply from `/opt/postiz/patches/` |

**Check overall health any time:** <https://status.pachey.duckdns.org>

**Useful commands**
```bash
# live logs
sudo docker logs -f postiz --tail 100

# which credentials are currently populated (names only, no secrets)
sudo grep -oE '^[A-Z_]+=' /opt/postiz/social.env

# container health
sudo docker ps --filter name=postiz
```

---

## 7. Not yet wired into your compose

These providers exist in Postiz but their env keys aren't yet in
`docker-compose.production.yaml`, so `apply-social.py` will warn if you fill them:

`TELEGRAM_TOKEN`, `PINTEREST_*`, `TWITCH_*`, `KICK_*`, `DRIBBBLE_*`, `VK_ID`,
`GOOGLE_GMB_*`, `INSTAGRAM_APP_*`, `MEWE_*`, `WHOP_CLIENT_ID`, `NEYNAR_*` (Farcaster)

Ask and they'll be added to the compose environment block in a couple of minutes.
Everything in sections 2 and 3 marked ✅ ready needs no such change.
