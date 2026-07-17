# PostPilot Engine

Spring Boot 3 / Java 21 backend for the MeritByte PostPilot cockpit. It owns post persistence, encrypted social tokens, R2 media, OAuth, scheduling, conservative retry and local success de-duplication, platform publishing, logs, and Telegram alerts.

## Run

The supported production path is Docker:

```bash
docker build -t postpilot-engine .
docker run --rm -p 8080:8080 --env-file .env postpilot-engine
```

For local development with Maven installed:

```bash
mvn test
mvn spring-boot:run
```

Postgres is required outside the `test` profile. Flyway applies the versioned schema migrations automatically.

## Authentication

All `/api/v1/**` endpoints except OAuth callbacks require `Authorization: Bearer <JWT>`. Sign the JWT with HS256 and `COCKPIT_JWT_SECRET`; it must include:

- `iss`: `COCKPIT_JWT_ISSUER` (default `postpilot-web`)
- `aud`: `COCKPIT_JWT_AUDIENCE` (default `postpilot-engine`)
- `role`: `cockpit` (or a `roles` array containing it)
- `iat` and `exp`; lifetime must not exceed `COCKPIT_JWT_MAX_LIFETIME` (default 15 minutes)

For a temporary compatibility migration only, `ALLOW_RAW_BEARER=true` permits the shared secret itself as the bearer token. It is off by default.

`GET /actuator/health`, `/actuator/health/liveness`, and `/actuator/health/readiness` are public.

## API contract

Platforms and status strings are lowercase on the wire. Timestamps are ISO-8601 UTC instants.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/v1/posts?from=&to=&status=` | List/filter posts |
| `GET` | `/api/v1/posts/today?date=YYYY-MM-DD` | Posts whose `contentDate` matches the requested engine-local date |
| `GET` | `/api/v1/posts/{id}` | Post detail |
| `POST` | `/api/v1/posts` | Create post and variants |
| `PUT` | `/api/v1/posts/{id}` | Replace editable post and variants |
| `DELETE` | `/api/v1/posts/{id}` | Delete a non-publishing post |
| `POST` | `/api/v1/posts/{id}/publish` | Queue variants and return immediately |
| `GET` | `/api/v1/posts/{id}/results` | Latest result for each variant; poll this after publish |
| `GET` | `/api/v1/calendar?from=&to=` | Scheduled calendar items |
| `GET` | `/api/v1/channels` | Connected accounts and token health |
| `GET` | `/api/v1/platforms` | API vs native-scheduler capabilities |
| `GET` | `/api/v1/logs?limit=100` | Recent attempts as a bare array |
| `GET` | `/api/v1/logs?page=0&size=50` | `{items,page,size,total,totalPages}` attempt page |
| `POST` | `/api/v1/media/presign` | `{filename,contentType,size}` to an R2 PUT URL |
| `POST` | `/api/v1/media/complete` | Verify uploaded R2 object and register it |
| `POST` | `/api/v1/media/register-external` | Verify and register an existing object URL from the configured R2 bucket |
| `GET` | `/api/v1/oauth/{platform}/start` | Return `{url}` for a protected OAuth start |
| `GET` | `/api/v1/oauth/{platform}/callback` | Verify state, store encrypted tokens, redirect to cockpit Connections |

Create/update body:

```json
{
  "topic": "Launch",
  "contentDate": "2030-05-04",
  "scheduledAt": "2030-05-04T02:15:00Z",
  "variants": [
    {
      "platform": "facebook",
      "accountId": null,
      "title": null,
      "caption": "Hello",
      "hashtags": "#launch",
      "mediaId": null
    }
  ]
}
```

`contentDate` is optional on create/update but always present in responses. When omitted it is derived from
`scheduledAt` in `TIME_ZONE`, or from the current date in `TIME_ZONE` for an unscheduled draft.
`scheduledAt`, when supplied, must be in the future. Immediate publishing is always an explicit `POST /api/v1/posts/{id}/publish` action.

If `accountId` is omitted, publishing binds the variant only when exactly one active account exists for that platform.
With multiple accounts it fails safely and requires an explicit account selection; it never guesses.

Publish result:

```json
{
  "id": 42,
  "postId": "uuid",
  "variantId": "uuid",
  "platform": "facebook",
  "attempt": 1,
  "status": "failed",
  "error": "rate limited",
  "postedAt": "2030-05-04T02:15:03Z",
  "nextAttemptAt": "2030-05-04T02:15:33Z",
  "retryable": true
}
```

Only an explicit provider `429` is eligible for automatic backoff. I/O timeouts, provider 5xx responses, and stale
workers are terminal with `outcome unknown—verify platform before manual retry`, because automatically repeating a
non-idempotent provider create could duplicate a post. A checked, user-initiated `/publish` attempt remains available
after the automatic-attempt cap.

## Environment

Required production values:

- Database: `DB_URL`, `DB_USER`, `DB_PASS`
- Security: `COCKPIT_JWT_SECRET` (32+ chars), `VAULT_KEY` (base64-encoded 32 bytes), `CORS_ALLOWED_ORIGINS`
- URLs: `OAUTH_REDIRECT_BASE` (engine public origin), `COCKPIT_URL`, optional `TIME_ZONE`
- R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`
- Meta: `META_CLIENT_ID`, `META_CLIENT_SECRET`, optional `META_API_VERSION`
- LinkedIn: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, optional `LINKEDIN_API_VERSION`
- X: `X_CLIENT_ID`, optional `X_CLIENT_SECRET`
- Telegram: optional `TG_BOT_TOKEN`, `TG_CHAT_ID`

Useful tuning: `PUBLISH_MAX_ATTEMPTS`, `PUBLISH_HTTP_TIMEOUT`, `SCHEDULER_INTERVAL`, `RETRY_INTERVAL`, `TOKEN_REFRESH_INTERVAL`, `R2_MAX_UPLOAD_BYTES`, `PUBLISH_MAX_IN_MEMORY_MEDIA_BYTES`, `INSTAGRAM_POLL_INTERVAL`, `INSTAGRAM_POLL_TIMEOUT`.

Generate a vault key without printing any repository secret:

```bash
openssl rand -base64 32
```

## Deliberate v1 limits

- Automated adapters are Facebook Pages, Instagram Business/Creator, LinkedIn member posts, and X. YouTube and TikTok are explicitly `native_scheduler` until their app verification/audit is approved.
- One media asset per variant; no carousel/multi-image flow yet. Instagram videos publish as Reels.
- R2 uploads and LinkedIn/X in-memory media transfers default to a 25 MiB cap (`R2_MAX_UPLOAD_BYTES` and `PUBLISH_MAX_IN_MEMORY_MEDIA_BYTES`). Raise it only with adequate heap; streaming large-video upload is future work.
- CSV media registration accepts only a query-free object URL under the exact `R2_PUBLIC_BASE_URL` path, then verifies it with an authenticated R2 HEAD; it never fetches arbitrary URLs. Move third-party media into R2 first.
- Platform APIs and permissions change. Keep API version environment values current and run a real-account staging post before production changes.
- The scheduler targets the documented single-engine VPS deployment. Running multiple replicas needs distributed job leasing.
