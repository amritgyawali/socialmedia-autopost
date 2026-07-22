# Postiz VPS operations scripts

Operational tooling for the self-hosted Postiz stack at `postiz.pachey.duckdns.org`.
These files are the source of record; the deployed copies live in `/opt/postiz/` on
the VPS and are **not** managed by this repo automatically — copy them across by hand
after changing anything here.

Nothing in this folder contains credentials. All of it reads secrets at runtime from
`/opt/postiz/social.env` (chmod 600, never committed) or from the running container's
environment.

## `verify-social.sh` / `verify-social.js`

Live-checks every connected channel against its provider and prints the provider's own
error text.

```bash
sudo /opt/postiz/verify-social.sh
```

```
OK    facebook              MeritByte Technologies
OK    x                     Meritbyte    @Meritbyte (id 2076409689118760960)
FAIL  linkedin-page         HTTP 403: ...
```

This exists because Postiz surfaces a dead channel only when a scheduled post fires,
as a bare `401` buried in `docker logs postiz` hours later. A channel can look
connected in the UI while every publish silently fails. Run this after any credential
change, and before trusting a channel.

`verify-social.sh` copies the JS into the `postiz` container and runs it there, so the
check uses exactly the same app credentials the publisher uses.

## `apply-social.py`

Injects developer-app credentials from `/opt/postiz/social.env` into the
`environment:` block of `docker-compose.production.yaml`. Only non-empty values are
written, and secret values are never printed.

```bash
sudo python3 /opt/postiz/apply-social.py
cd /opt/postiz && sudo docker compose -f docker-compose.production.yaml up -d
```

### The X credential guard

Postiz signs X requests with **OAuth 1.0a**, so it needs the app's 25-char Consumer
*API Key* — not the OAuth 2.0 Client ID sitting a few lines away in the same developer
portal screen. Pasting the wrong one is silent: the connect flow still stores a real
token, and only the request signature fails, so posts fail at publish time with an
unexplained `401`.

`apply-social.py` therefore refuses an `X_API_KEY` that base64-decodes to the OAuth 2.0
Client ID shape (`<id>:<digit>:<2 letters>`), and refuses `X_API_SECRET` whenever the
key was refused. Both secret types are exactly 50 characters, so the secret cannot be
validated on its own — but the two are always copied from the same screen, so they are
treated as an atomic pair. Refused keys leave the existing compose value untouched
rather than overwriting a working one.

```
REFUSED (compose left unchanged for these, existing value kept):
  - X_API_KEY (this is the OAuth 2.0 Client ID; Postiz needs the OAuth 1.0a API Key)
  - X_API_SECRET (paired with X_API_KEY, which was refused)
```

## Related

Provider scope overrides are bind-mounted from `/opt/postiz/patches/` — see
`POSTIZ_ORACLE_CLOUD_A_TO_Z_GUIDE.md` for the full deployment walkthrough.
