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

const SETUP_GUIDE: Partial<Record<Platform, { developerUrl: string; developerLabel: string; envVars: string[]; callbacks: Platform[] }>> = {
  facebook: { developerUrl: "https://developers.facebook.com/apps", developerLabel: "developers.facebook.com/apps", envVars: ["META_CLIENT_ID", "META_CLIENT_SECRET"], callbacks: ["facebook", "instagram"] },
  instagram: { developerUrl: "https://developers.facebook.com/apps", developerLabel: "developers.facebook.com/apps", envVars: ["META_CLIENT_ID", "META_CLIENT_SECRET"], callbacks: ["facebook", "instagram"] },
  linkedin: { developerUrl: "https://www.linkedin.com/developers/apps", developerLabel: "linkedin.com/developers/apps", envVars: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"], callbacks: ["linkedin"] },
  x: { developerUrl: "https://developer.x.com/en/portal/dashboard", developerLabel: "developer.x.com/en/portal", envVars: ["X_CLIENT_ID", "X_CLIENT_SECRET"], callbacks: ["x"] },
};

function SetupGuide({ platform }: { platform: Platform }) {
  const guide = SETUP_GUIDE[platform];
  if (!guide) return null;
  return (
    <div className="setup-guide">
      <p><Icon name="alert" size={14} />{PLATFORM_META[platform].label} isn&apos;t registered with an app yet — this is a one-time setup, not a bug.</p>
      <ol>
        <li>Create an app at <a href={guide.developerUrl} target="_blank" rel="noreferrer">{guide.developerLabel}</a></li>
        <li>Add {guide.callbacks.length > 1 ? "these redirect URIs" : "this redirect URI"}:{guide.callbacks.map((cb) => <code key={cb}>{`https://${ENGINE_DOMAIN}/api/v1/oauth/${cb}/callback`}</code>)}</li>
        <li>Copy the app credentials into the VPS: <code>ssh ubuntu@{ENGINE_DOMAIN}</code> → edit <code>infra/.env</code> → set {guide.envVars.map((name, index) => <span key={name}><code>{name}</code>{index < guide.envVars.length - 1 ? ", " : ""}</span>)}</li>
        <li>Restart the engine: <code>docker compose restart engine</code></li>
      </ol>
    </div>
  );
}

export function ConnectionsClient() {
  const demoMode = useDemoMode();
  const query = useSearchParams();
  const router = useRouter();
  const { push } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [error, setError] = useState("");
  const [unconfigured, setUnconfigured] = useState<Set<Platform>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setChannels(asList<Channel>(await apiRequest<unknown>("/channels"))); }
    catch (caught) { setError(friendlyError(caught)); }
    finally { setLoading(false); }
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
    setUnconfigured((current) => { const next = new Set(current); next.delete(platform); return next; });
    try {
      const value = unwrap(await apiRequest<ApiEnvelope<{ url: string }>>(`/oauth/${platform}/start`));
      const destination = new URL(value.url);
      if (!['https:', 'http:'].includes(destination.protocol)) throw new Error("The engine returned an unsafe OAuth URL.");
      window.location.assign(destination.toString());
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 503) {
        setUnconfigured((current) => new Set(current).add(platform));
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
      <PageHeader eyebrow="OAuth & token health" title="Connections" description="PostPilot stores encrypted tokens in the engine. The browser only starts secure OAuth handshakes." actions={<Button variant="secondary" icon="refresh" onClick={load} disabled={loading}>Check health</Button>} />
      {loading ? <LoadingPanel label="Checking connected accounts…" /> : error ? <ErrorPanel message={error} retry={load} /> : <>
        <div className="connection-summary"><div className="stat-card"><span>Connected</span><strong>{stats.active}</strong></div><div className="stat-card"><span>Attention</span><strong>{stats.attention}</strong></div><div className="stat-card"><span>Platforms</span><strong>{stats.available}</strong></div></div>
        <section className="connections-grid">{PLATFORM_ORDER.map((platform) => {
          const platformChannels = channels.filter((channel) => channel.platform === platform);
          const channel = platformChannels.find((item) => item.status === "active") ?? platformChannels[0];
          const auditPending = platform === "youtube" || platform === "tiktok";
          const nativeUrl = platform === "youtube" ? "https://studio.youtube.com/" : "https://www.tiktok.com/upload";
          return <article className="connection-card" key={platform}><div className="connection-head"><PlatformIcon platform={platform} size="lg" /><div className="connection-title"><strong>{PLATFORM_META[platform].label}</strong><small>{channel ? channel.displayName || channel.externalId : PLATFORM_META[platform].description}{platformChannels.length > 1 ? ` · +${platformChannels.length - 1} more` : ""}</small></div>{channel ? <StatusBadge status={channel.status} /> : <StatusBadge status={auditPending ? "ready" : "draft"} />}</div>{auditPending ? <p className="audit-note"><Icon name="alert" size={14} />Publishing stays on the native scheduler until your platform audit is approved.</p> : null}<div className="connection-details"><p>{auditPending ? "Native scheduling for now" : connectionCopy(channel)}</p>{auditPending ? <a className="button button-secondary" href={nativeUrl} target="_blank" rel="noreferrer"><Icon name="external" size={18} /><span>{platform === "youtube" ? "Open Studio" : "Open TikTok"}</span></a> : <Button variant={channel?.status === "active" ? "ghost" : "secondary"} icon="external" onClick={() => connect(platform)} disabled={demoMode || Boolean(connecting)}>{connecting === platform ? "Opening…" : channel ? "Reconnect" : "Connect"}</Button>}</div>{unconfigured.has(platform) ? <SetupGuide platform={platform} /> : null}</article>;
        })}</section>
        {!channels.length ? <div style={{ marginTop: 18 }}><EmptyState icon="connections" title="No accounts connected yet" description="Start with LinkedIn, X, Facebook, or Instagram. You’ll return here after OAuth completes." /></div> : null}
      </>}
    </>
  );
}
