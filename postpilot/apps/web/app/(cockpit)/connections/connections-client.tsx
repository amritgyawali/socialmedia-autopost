"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { PlatformIcon } from "@/components/platform-icon";
import { useToast } from "@/components/toast";
import { Button, EmptyState, ErrorPanel, LoadingPanel, PageHeader, StatusBadge } from "@/components/ui";
import { useDemoMode } from "@/components/demo-context";
import { apiRequest, friendlyError } from "@/lib/api-client";
import { asList, unwrap, type ApiEnvelope, type Channel, type Platform } from "@/lib/contracts";
import { formatNpt } from "@/lib/date";
import { PLATFORM_META, PLATFORM_ORDER } from "@/lib/platforms";

function connectionCopy(channel: Channel | undefined): string {
  if (!channel) return "No account connected";
  if (channel.status === "expired") return "Token expired — reconnect now";
  if (channel.status === "error") return "Connection needs attention";
  return channel.expiresAt ? `Token expires ${formatNpt(channel.expiresAt)}` : "Token health looks good";
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
    try {
      const value = unwrap(await apiRequest<ApiEnvelope<{ url: string }>>(`/oauth/${platform}/start`));
      const destination = new URL(value.url);
      if (!['https:', 'http:'].includes(destination.protocol)) throw new Error("The engine returned an unsafe OAuth URL.");
      window.location.assign(destination.toString());
    } catch (caught) {
      push(friendlyError(caught), "error");
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
          return <article className="connection-card" key={platform}><div className="connection-head"><PlatformIcon platform={platform} size="lg" /><div className="connection-title"><strong>{PLATFORM_META[platform].label}</strong><small>{channel ? channel.displayName || channel.externalId : PLATFORM_META[platform].description}{platformChannels.length > 1 ? ` · +${platformChannels.length - 1} more` : ""}</small></div>{channel ? <StatusBadge status={channel.status} /> : <StatusBadge status={auditPending ? "ready" : "draft"} />}</div>{auditPending ? <p className="audit-note"><Icon name="alert" size={14} />Publishing stays on the native scheduler until your platform audit is approved.</p> : null}<div className="connection-details"><p>{auditPending ? "Native scheduling for now" : connectionCopy(channel)}</p>{auditPending ? <a className="button button-secondary" href={nativeUrl} target="_blank" rel="noreferrer"><Icon name="external" size={18} /><span>{platform === "youtube" ? "Open Studio" : "Open TikTok"}</span></a> : <Button variant={channel?.status === "active" ? "ghost" : "secondary"} icon="external" onClick={() => connect(platform)} disabled={demoMode || Boolean(connecting)}>{connecting === platform ? "Opening…" : channel ? "Reconnect" : "Connect"}</Button>}</div></article>;
        })}</section>
        {!channels.length ? <div style={{ marginTop: 18 }}><EmptyState icon="connections" title="No accounts connected yet" description="Start with LinkedIn, X, Facebook, or Instagram. You’ll return here after OAuth completes." /></div> : null}
      </>}
    </>
  );
}
