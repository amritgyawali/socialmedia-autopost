# Security policy

PostPilot stores credentials that can publish to real social accounts. Treat a
suspected leak as an operational incident, even if the repository is private.

Do not open a public issue containing a vulnerability, token, request header,
environment file, database dump, screenshot of secrets, or provider response
with credentials. Use the private repository's GitHub **Security → Advisories →
New draft security advisory** flow, or the owner's established private security
contact.

## Immediate response to an exposed secret

1. Revoke or rotate it at the issuing provider first.
2. Replace it in the VPS/Vercel/GitHub environment where it is consumed.
3. Restart or redeploy the affected service.
4. Inspect provider activity, application logs, GitHub Actions runs, and billing.
5. If the value entered Git history, keep it revoked permanently; removing a
   commit does not make the old value safe again.

Losing or rotating `VAULT_KEY` makes existing encrypted OAuth tokens unreadable
unless a deliberate migration is implemented; reconnect accounts after an
unplanned rotation. Losing `RESTIC_PASSWORD` makes existing backups
unrecoverable. A changed `COCKPIT_JWT_SECRET` must be rolled out to both the web
and engine together.

The public R2 media bucket must never contain confidential assets. Social
providers fetch those URLs without a PostPilot session.

## Current dependency note

As checked on 2026-07-16, `npm audit --omit=dev` reports no high or critical
advisories and one moderate advisory chain: Next.js 15.5.20 pins PostCSS 8.4.31,
which is covered by [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93).
PostPilot neither accepts user-authored CSS nor stringifies untrusted CSS, so
the vulnerable operation is not exposed by this application. Do not accept
npm's suggested forced downgrade to Next 9. Dependabot is enabled; take the
upstream patched Next release when it becomes available and rerun the full
build/runtime checks.
