"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { PlatformIcon } from "@/components/platform-icon";
import { useToast } from "@/components/toast";
import { Button, EmptyState, ErrorPanel, LoadingPanel, PageHeader, StatusBadge } from "@/components/ui";
import { useDemoMode } from "@/components/demo-context";
import { ApiError, apiRequest, friendlyError } from "@/lib/api-client";
import { asList, unwrap, type ApiEnvelope, type Channel, type Platform } from "@/lib/contracts";
import { formatNpt } from "@/lib/date";
import { PLATFORM_META, PLATFORM_ORDER } from "@/lib/platforms";

function connectionCopy(channel: Channel | undefined): string {
  if (!channel) return "No account connected";
  if (channel.status === "expired") return "Token expired — reconnect now";
  if (channel.status === "error") return "Connection needs attention";
  return channel.expiresAt ? `Token expires ${formatNpt(channel.expiresAt)}` : "Token health looks good";
}

const ENGINE_DOMAIN = "pachey.duckdns.org";

type ProviderGroup = "meta" | "linkedin" | "x";

interface OAuthApp {
  provider: ProviderGroup;
  configured: boolean;
  source: "app" | "env" | "none";
  clientIdHint?: string | null;
}

const PROVIDER_FOR: Partial<Record<Platform, ProviderGroup>> = {
  facebook: "meta",
  instagram: "meta",
  linkedin: "linkedin",
  x: "x",
};

const PROVIDER_GUIDE: Record<ProviderGroup, { portalUrl: string; portalLabel: string; idLabel: string; secretLabel: string; note: string; callbacks: Platform[] }> = {
  meta: {
    portalUrl: "https://developers.facebook.com/apps",
    portalLabel: "developers.facebook.com/apps",
    idLabel: "App ID",
    secretLabel: "App Secret",
    note: "One Meta Business app covers both Facebook and Instagram. Add products “Facebook Login” and “Instagram Graph API”, then register both redirect URIs below.",
    callbacks: ["facebook", "instagram"],
  },
  linkedin: {
    portalUrl: "https://www.linkedin.com/developers/apps",
    portalLabel: "linkedin.com/developers/apps",
    idLabel: "Client ID",
    secretLabel: "Client Secret",
    note: "Add products “Sign In with LinkedIn using OpenID Connect” and “Share on LinkedIn”, then register the redirect URI below.",
    callbacks: ["linkedin"],
  },
  x: {
    portalUrl: "https://developer.x.com/en/portal/dashboard",
    portalLabel: "developer.x.com/en/portal",
    idLabel: "OAuth 2.0 Client ID",
    secretLabel: "Client Secret (optional for public clients)",
    note: "Create a project + app with OAuth 2.0 user authentication enabled, then register the callback URI below.",
    callbacks: ["x"],
  },
};

function ProviderSetupForm({ group, onSaved, onCancel }: { group: ProviderGroup; onSaved: () => void; onCancel: () => void }) {
  const { push } = useToast();
  const guide = PROVIDER_GUIDE[group];
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!clientId.trim()) { push(`Enter the ${guide.idLabel}.`, "error"); return; }
    if (group !== "x" && !clientSecret.trim()) { push(`Enter the ${guide.secretLabel}.`, "error"); return; }
    setSaving(true);
    try {
      await apiRequest<ApiEnvelope<OAuthApp>>(`/oauth-apps/${group}`, {
        method: "PUT",
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() || null }),
      });
      setClientId(""); setClientSecret("");
      push("App saved. You can connect now — no restart needed.", "success");
      onSaved();
    } catch (caught) {
      push(friendlyError(caught), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="setup-guide">
      <p><Icon name="sparkles" size={14} />{guide.note}</p>
      <ol>
        <li>Create the app at <a href={guide.portalUrl} target="_blank" rel="noreferrer">{guide.portalLabel}</a></li>
        <li>Register {guide.callbacks.length > 1 ? "these redirect URIs" : "this redirect URI"}:{guide.callbacks.map((cb) => <code key={cb}>{`https://${ENGINE_DOMAIN}/api/v1/oauth/${cb}/callback`}</code>)}</li>
        <li>Paste the credentials here — they are encrypted and stored on your own engine:</li>
      </ol>
      <div className="setup-form">
        <label className="field"><span>{guide.idLabel}</span><input value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" spellCheck={false} /></label>
        <label className="field"><span>{guide.secretLabel}</span><input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} autoComplete="new-password" /></label>
        <div className="setup-form-actions">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save app"}</Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>Close</Button>
        </div>
      </div>
    </div>
  );
}

export function ConnectionsClient() {
  const demoMode = useDemoMode();
  const query = useSearchParams();
  const router = useRouter();
  const { push } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [apps, setApps] = useState<Partial<Record<ProviderGroup, OAuthApp>>>({});
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState<ProviderGroup | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [channelPayload, appPayload] = await Promise.all([
        apiRequest<unknown>("/channels"),
        apiRequest<unknown>("/oauth-apps").catch(() => []),
      ]);
      setChannels(asList<Channel>(channelPayload));
      const loadedApps: Partial<Record<ProviderGroup, OAuthApp>> = {};
      asList<OAuthApp>(appPayload).forEach((app) => { loadedApps[app.provider] = app; });
      setApps(loadedApps);
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setLoading(false); }
  }, []);

  const reloadApps = useCallback(async () => {
    try {
      const payload = await apiRequest<unknown>("/oauth-apps");
      const loadedApps: Partial<Record<ProviderGroup, OAuthApp>> = {};
      asList<OAuthApp>(payload).forEach((app) => { loadedApps[app.provider] = app; });
      setApps(loadedApps);
    } catch { /* keep previous state; the next full load refreshes it */ }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const oauth = query.get("oauth");
    const platform = query.get("platform") as Platform | null;
    const accounts = query.get("accounts");
    if (oauth === "success") push(`${platform && PLATFORM_META[platform] ? PLATFORM_META[platform].label : "Account"} connected${accounts ? ` (${accounts} found)` : ""}.`, "success");
    if (oauth === "error") push(`${platform && PLATFORM_META[platform] ? PLATFORM_META[platform].label : "Connection"} could not be connected. Check the engine logs.`, "error");
    if (oauth) { void load(); router.replace("/connections", { scroll: false }); }
  }, [load, query, push, router]);

  async function connect(platform: Platform) {
    if (demoMode) return;
    setConnecting(platform);
    try {
      const value = unwrap(await apiRequest<ApiEnvelope<{ url: string }>>(`/oauth/${platform}/start`));
      const destination = new URL(value.url);
      if (!["https:", "http:"].includes(destination.protocol)) throw new Error("The engine returned an unsafe OAuth URL.");
      window.location.assign(destination.toString());
    } catch (caught) {
      const group = PROVIDER_FOR[platform];
      if (group && caught instanceof ApiError && caught.status === 503) {
        setFormOpen(group);
        push("This platform needs its app credentials first — the form below walks you through it.", "info");
      } else {
        push(friendlyError(caught), "error");
      }
      setConnecting(null);
    }
  }

  const stats = useMemo(() => ({
    active: channels.filter((channel) => channel.status === "active").length,
    attention: channels.filter((channel) => channel.status !== "active").length,
    available: PLATFORM_ORDER.length,
  }), [channels]);

  return (
    <>
      <PageHeader eyebrow="OAuth & token health" title="Channels" description="Set up each platform's app once, then connect accounts with a normal social login. Tokens stay encrypted in your engine." actions={<Button variant="secondary" icon="refresh" onClick={load} disabled={loading}>Check health</Button>} />
      {loading ? <LoadingPanel label="Checking connected accounts…" /> : error ? <ErrorPanel message={error} retry={load} /> : <>
        <div className="connection-summary"><div className="stat-card"><span>Connected</span><strong>{stats.active}</strong></div><div className="stat-card"><span>Attention</span><strong>{stats.attention}</strong></div><div className="stat-card"><span>Platforms</span><strong>{stats.available}</strong></div></div>
        <section className="connections-grid">{PLATFORM_ORDER.map((platform) => {
          const platformChannels = channels.filter((channel) => channel.platform === platform);
          const channel = platformChannels.find((item) => item.status === "active") ?? platformChannels[0];
          const auditPending = platform === "youtube" || platform === "tiktok";
          const nativeUrl = platform === "youtube" ? "https://studio.youtube.com/" : "https://www.tiktok.com/upload";
          const group = PROVIDER_FOR[platform];
          const app = group ? apps[group] : undefined;
          const needsApp = Boolean(group) && !app?.configured;
          const showForm = Boolean(group) && formOpen === group;
          return <article className="connection-card" key={platform}>
            <div className="connection-head"><PlatformIcon platform={platform} size="lg" /><div className="connection-title"><strong>{PLATFORM_META[platform].label}</strong><small>{channel ? channel.displayName || channel.externalId : PLATFORM_META[platform].description}{platformChannels.length > 1 ? ` · +${platformChannels.length - 1} more` : ""}</small></div>{channel ? <StatusBadge status={channel.status} /> : <StatusBadge status={auditPending ? "ready" : "draft"} />}</div>
            {auditPending ? <p className="audit-note"><Icon name="alert" size={14} />Publishing stays on the native scheduler until your platform audit is approved.</p> : null}
            <div className="connection-details">
              <p>{auditPending ? "Native scheduling for now" : needsApp ? "One-time app setup needed" : connectionCopy(channel)}</p>
              {auditPending
                ? <a className="button button-secondary" href={nativeUrl} target="_blank" rel="noreferrer"><Icon name="external" size={18} /><span>{platform === "youtube" ? "Open Studio" : "Open TikTok"}</span></a>
                : needsApp
                  ? <Button variant="secondary" icon="sparkles" onClick={() => setFormOpen(showForm ? null : group!)}>{showForm ? "Hide setup" : "Set up app"}</Button>
                  : <Button variant={channel?.status === "active" ? "ghost" : "secondary"} icon="external" onClick={() => connect(platform)} disabled={demoMode || Boolean(connecting)}>{connecting === platform ? "Opening…" : channel ? "Reconnect" : "Connect"}</Button>}
            </div>
            {group && app?.configured ? <p className="app-hint">App ····{app.clientIdHint ?? ""} ({app.source === "env" ? "from server env" : "saved from cockpit"}) · <button type="button" onClick={() => setFormOpen(showForm ? null : group)}>{showForm ? "close" : "change"}</button></p> : null}
            {showForm ? <ProviderSetupForm group={group!} onCancel={() => setFormOpen(null)} onSaved={() => { setFormOpen(null); void reloadApps(); }} /> : null}
          </article>;
        })}</section>
        {!channels.length ? <div style={{ marginTop: 18 }}><EmptyState icon="connections" title="No accounts connected yet" description="Set up the app once for a platform, then every future connection is just a social login." /></div> : null}
      </>}
    </>
  );
}
