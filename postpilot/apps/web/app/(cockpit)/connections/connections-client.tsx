"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
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

// PostPilot's engine (behind Caddy) terminates the OAuth callback for each platform.
const ENGINE_DOMAIN = "pachey.duckdns.org";
function redirectFor(platform: Platform): string {
  return `https://${ENGINE_DOMAIN}/api/v1/oauth/${platform}/callback`;
}

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

interface ProviderGuide {
  title: string;
  portalUrl: string;
  portalLabel: string;
  idLabel: string;
  secretLabel: string;
  secretOptional?: boolean;
  note: string;
  steps: ReactNode[];
  callbacks: Platform[];
}

const PROVIDER_GUIDE: Record<ProviderGroup, ProviderGuide> = {
  meta: {
    title: "Facebook & Instagram",
    portalUrl: "https://developers.facebook.com/apps",
    portalLabel: "developers.facebook.com/apps",
    idLabel: "App ID",
    secretLabel: "App Secret",
    note: "One Meta Business app covers both Facebook Pages and Instagram. Instagram must be a Professional (Business/Creator) account linked to a Facebook Page.",
    steps: [
      <>Choose the <strong>Business</strong> app type.</>,
      <>Add the products <code>Facebook Login</code> and <code>Instagram Graph API</code>.</>,
      <>Copy the <strong>App ID</strong> and <strong>App Secret</strong> from <em>Settings → Basic</em>.</>,
      <>To post for accounts other than your own admins, submit for <strong>App Review + Business Verification</strong> (Meta requirement — can take days).</>,
    ],
    callbacks: ["facebook", "instagram"],
  },
  linkedin: {
    title: "LinkedIn",
    portalUrl: "https://www.linkedin.com/developers/apps",
    portalLabel: "linkedin.com/developers/apps",
    idLabel: "Client ID",
    secretLabel: "Client Secret",
    note: "Link the app to a LinkedIn Page you manage. The self-service “Share on LinkedIn” product posts to a member profile.",
    steps: [
      <>On the <em>Products</em> tab, request <code>Sign In with LinkedIn using OpenID Connect</code> and <code>Share on LinkedIn</code>.</>,
      <>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> from the <em>Auth</em> tab.</>,
    ],
    callbacks: ["linkedin"],
  },
  x: {
    title: "X (Twitter)",
    portalUrl: "https://developer.x.com/en/portal/dashboard",
    portalLabel: "developer.x.com/en/portal",
    idLabel: "OAuth 2.0 Client ID",
    secretLabel: "Client Secret",
    secretOptional: true,
    note: "Create a Project + App, then under User authentication settings enable OAuth 2.0 with app type “Web App”. Note: posting via the X API currently needs a paid access tier.",
    steps: [
      <>Under <em>User authentication settings</em>, turn on <code>OAuth 2.0</code> and set the app type to <strong>Web App</strong>.</>,
      <>Copy the <strong>OAuth 2.0 Client ID</strong> (and the Client Secret if it is a confidential client).</>,
    ],
    callbacks: ["x"],
  },
};

function ProviderSetupModal({ group, onSaved, onClose }: { group: ProviderGroup; onSaved: () => void; onClose: () => void }) {
  const { push } = useToast();
  const guide = PROVIDER_GUIDE[group];
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  async function save() {
    if (!clientId.trim()) { push(`Enter the ${guide.idLabel}.`, "error"); return; }
    if (!guide.secretOptional && !clientSecret.trim()) { push(`Enter the ${guide.secretLabel}.`, "error"); return; }
    setSaving(true);
    try {
      await apiRequest<ApiEnvelope<OAuthApp>>(`/oauth-apps/${group}`, {
        method: "PUT",
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() || null }),
      });
      push("App saved. You can connect now — no restart needed.", "success");
      onSaved();
    } catch (caught) {
      push(friendlyError(caught), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="pz-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={`${guide.title} setup`}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="pz-modal">
        <div className="pz-modal-head">
          <div>
            <h3>Connect {guide.title}</h3>
            <p className="pz-modal-sub">One-time setup · credentials are encrypted and saved on your engine — no code or restart needed</p>
          </div>
          <button type="button" className="pz-modal-close" aria-label="Close" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>

        <p className="pz-modal-note"><Icon name="sparkles" size={14} />{guide.note}</p>

        <ol className="pz-steps">
          <li>Open <a href={guide.portalUrl} target="_blank" rel="noreferrer">{guide.portalLabel}</a> and create an app.</li>
          {guide.steps.map((step, index) => <li key={index}>{step}</li>)}
          <li>
            Add {guide.callbacks.length > 1 ? "these redirect URLs" : "this redirect URL"} to the app’s allowed list (click to select):
            <span className="pz-redirects">{guide.callbacks.map((cb) => <code key={cb}>{redirectFor(cb)}</code>)}</span>
          </li>
          <li>Paste the {guide.idLabel} and {guide.secretLabel} below and save.</li>
        </ol>

        <div className="pz-modal-divider">
          <span className="field-label">Enter credentials</span>
          <div className="setup-form">
            <label className="field">
              <span>{guide.idLabel}</span>
              <input value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" spellCheck={false} placeholder={`Your ${guide.idLabel}`} />
            </label>
            <label className="field">
              <span>{guide.secretLabel}{guide.secretOptional ? " (optional)" : ""}</span>
              <input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} autoComplete="new-password" placeholder="Stored encrypted — never shown again" />
            </label>
            <div className="setup-form-actions">
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save & enable"}</Button>
              <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            </div>
          </div>
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
    const group = PROVIDER_FOR[platform];
    // No app credentials yet -> open the setup popup instead of a doomed OAuth round-trip.
    if (group && !apps[group]?.configured) {
      setFormOpen(group);
      return;
    }
    setConnecting(platform);
    try {
      const value = unwrap(await apiRequest<ApiEnvelope<{ url: string }>>(`/oauth/${platform}/start`));
      const destination = new URL(value.url);
      if (!["https:", "http:"].includes(destination.protocol)) throw new Error("The engine returned an unsafe OAuth URL.");
      window.location.assign(destination.toString());
    } catch (caught) {
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
          return <article className="connection-card" key={platform}>
            <div className="connection-head"><PlatformIcon platform={platform} size="lg" /><div className="connection-title"><strong>{PLATFORM_META[platform].label}</strong><small>{channel ? channel.displayName || channel.externalId : PLATFORM_META[platform].description}{platformChannels.length > 1 ? ` · +${platformChannels.length - 1} more` : ""}</small></div>{channel ? <StatusBadge status={channel.status} /> : <StatusBadge status={auditPending ? "ready" : "draft"} />}</div>
            {auditPending ? <p className="audit-note"><Icon name="alert" size={14} />Publishing stays on the native scheduler until your platform audit is approved.</p> : null}
            <div className="connection-details">
              <p>{auditPending ? "Native scheduling for now" : needsApp ? "One-time app setup needed" : connectionCopy(channel)}</p>
              {auditPending
                ? <a className="button button-secondary" href={nativeUrl} target="_blank" rel="noreferrer"><Icon name="external" size={18} /><span>{platform === "youtube" ? "Open Studio" : "Open TikTok"}</span></a>
                : needsApp
                  ? <Button variant="secondary" icon="sparkles" onClick={() => setFormOpen(group!)}>Set up &amp; connect</Button>
                  : <Button variant={channel?.status === "active" ? "ghost" : "secondary"} icon="external" onClick={() => connect(platform)} disabled={demoMode || Boolean(connecting)}>{connecting === platform ? "Opening…" : channel ? "Reconnect" : "Connect"}</Button>}
            </div>
            {group && app?.configured ? <p className="app-hint">App ····{app.clientIdHint ?? ""} ({app.source === "env" ? "from server env" : "saved from cockpit"}) · <button type="button" onClick={() => setFormOpen(group)}>change credentials</button></p> : null}
          </article>;
        })}</section>
        {!channels.length ? <div style={{ marginTop: 18 }}><EmptyState icon="connections" title="No accounts connected yet" description="Set up the app once for a platform, then every future connection is just a social login." /></div> : null}
      </>}
      {formOpen ? <ProviderSetupModal group={formOpen} onClose={() => setFormOpen(null)} onSaved={() => { setFormOpen(null); void reloadApps(); }} /> : null}
    </>
  );
}
