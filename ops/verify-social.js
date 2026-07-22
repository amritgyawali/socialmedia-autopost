#!/usr/bin/env node
/**
 * Live-check every connected Postiz channel against its provider.
 *
 * Postiz only discovers a dead token when a scheduled post fails, which shows up
 * as a bare 401 in the logs hours later. This makes the same check on demand and
 * prints the provider's own error text. Never prints tokens or app secrets.
 *
 * Run:  sudo /opt/postiz/verify-social.sh
 */
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const { TwitterApi } = require('/app/node_modules/twitter-api-v2');

const short = (v, n = 160) =>
  String(v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v))
    .replace(/\s+/g, ' ')
    .slice(0, n);

async function json(url, init) {
  const res = await fetch(url, init);
  let body;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => '');
  }
  return { ok: res.ok, status: res.status, body };
}

// Each checker resolves { ok, detail }. Throwing is fine; it is caught per channel.
const checks = {
  async x(integration) {
    const [accessToken, accessSecret] = integration.token.split(':');
    const client = new TwitterApi({
      appKey: process.env.X_API_KEY,
      appSecret: process.env.X_API_SECRET,
      accessToken,
      accessSecret,
    });
    try {
      const me = await client.v2.me();
      return { ok: true, detail: `@${me.data.username} (id ${me.data.id})` };
    } catch (err) {
      const detail = short(err.data || err.message);
      if (err.code === 401) {
        return {
          ok: false,
          detail:
            `${detail} - the stored token was issued by a different X app than ` +
            `X_API_KEY/X_API_SECRET, or those are not OAuth 1.0a Consumer Keys`,
        };
      }
      return { ok: false, detail: `HTTP ${err.code}: ${detail}` };
    }
  },

  async linkedin(integration) {
    const r = await json('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${integration.token}` },
    });
    return { ok: r.ok, detail: r.ok ? r.body.name || r.body.sub : `HTTP ${r.status}: ${short(r.body)}` };
  },

  async 'linkedin-page'(integration) {
    // Page posting needs the org scopes, so check the org endpoint, not /userinfo.
    const r = await json(
      `https://api.linkedin.com/v2/organizations/${integration.internalId}?projection=(id,localizedName)`,
      { headers: { Authorization: `Bearer ${integration.token}` } }
    );
    return {
      ok: r.ok,
      detail: r.ok ? r.body.localizedName : `HTTP ${r.status}: ${short(r.body)}`,
    };
  },

  async facebook(integration) {
    const r = await json(
      `https://graph.facebook.com/v20.0/me?fields=id,name&access_token=${encodeURIComponent(integration.token)}`
    );
    return { ok: r.ok, detail: r.ok ? r.body.name : `HTTP ${r.status}: ${short(r.body.error || r.body)}` };
  },

  async 'instagram-standalone'(integration) {
    const r = await json(
      `https://graph.instagram.com/me?fields=id,username&access_token=${encodeURIComponent(integration.token)}`
    );
    return { ok: r.ok, detail: r.ok ? `@${r.body.username}` : `HTTP ${r.status}: ${short(r.body.error || r.body)}` };
  },

  async threads(integration) {
    const r = await json(
      `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(integration.token)}`
    );
    return { ok: r.ok, detail: r.ok ? `@${r.body.username}` : `HTTP ${r.status}: ${short(r.body.error || r.body)}` };
  },

  async tiktok(integration) {
    const r = await json('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', {
      headers: { Authorization: `Bearer ${integration.token}` },
    });
    // TikTok returns HTTP 200 with error.code !== 'ok' for auth failures.
    const ok = r.ok && (r.body?.error?.code ?? 'ok') === 'ok';
    return {
      ok,
      detail: ok
        ? r.body?.data?.user?.display_name
        : `HTTP ${r.status}: ${short(r.body.error || r.body)}`,
    };
  },
};

(async () => {
  const prisma = new PrismaClient();
  const integrations = await prisma.integration.findMany({
    where: { deletedAt: null },
    orderBy: { providerIdentifier: 'asc' },
  });

  console.log(`Checking ${integrations.length} connected channel(s) against their providers.\n`);
  let failed = 0;

  for (const integration of integrations) {
    const label = `${integration.providerIdentifier.padEnd(21)} ${(integration.name || '').slice(0, 24).padEnd(24)}`;
    const check = checks[integration.providerIdentifier];
    if (!check) {
      console.log(`SKIP  ${label} no checker for this provider`);
      continue;
    }
    try {
      const { ok, detail } = await check(integration);
      console.log(`${ok ? 'OK   ' : 'FAIL '} ${label} ${detail || ''}`);
      if (!ok) failed++;
    } catch (err) {
      console.log(`FAIL  ${label} ${short(err.message)}`);
      failed++;
    }
  }

  console.log(`\n${failed === 0 ? 'All channels authenticate.' : `${failed} channel(s) cannot authenticate - posting to them will fail.`}`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})();
