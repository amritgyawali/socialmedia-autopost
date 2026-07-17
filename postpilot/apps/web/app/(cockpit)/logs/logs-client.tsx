"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlatformIcon } from "@/components/platform-icon";
import { Button, EmptyState, ErrorPanel, LoadingPanel, PageHeader, StatusBadge } from "@/components/ui";
import { apiRequest, friendlyError } from "@/lib/api-client";
import { asList, unwrap, type ApiEnvelope, type LogEntry, type PageResponse, type Platform, type PublishResult } from "@/lib/contracts";
import { formatNpt } from "@/lib/date";
import { PLATFORM_META, PLATFORM_ORDER, isPlatform } from "@/lib/platforms";

function normalizeLog(value: LogEntry | PublishResult): LogEntry {
  const candidate = value as LogEntry & PublishResult & { timestamp?: string; message?: string };
  return {
    id: candidate.id,
    createdAt: candidate.createdAt ?? candidate.postedAt ?? candidate.timestamp ?? new Date().toISOString(),
    platform: isPlatform(candidate.platform) ? candidate.platform : null,
    postId: candidate.postId,
    variantId: candidate.variantId,
    status: candidate.status,
    message: candidate.message ?? (candidate.status === "success" ? "Published successfully" : candidate.status === "failed" ? "Publish attempt failed" : "Publish state changed"),
    error: candidate.error,
    attempt: candidate.attempt,
  };
}

export function LogsClient() {
  const [platform, setPlatform] = useState<Platform | "">("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), size: "25" });
    if (platform) params.set("platform", platform);
    if (status) params.set("status", status);
    try {
      const raw = unwrap(await apiRequest<ApiEnvelope<unknown>>(`/logs?${params}`));
      if (raw && typeof raw === "object" && !Array.isArray(raw) && ("content" in raw || "items" in raw)) {
        const response = raw as PageResponse<LogEntry | PublishResult> & { items?: Array<LogEntry | PublishResult>; total?: number };
        const content = response.content ?? response.items ?? [];
        setLogs(content.map(normalizeLog));
        setTotalPages(Math.max(1, response.totalPages ?? 1));
        setTotalElements(response.totalElements ?? response.total ?? content.length);
      } else {
        const list = asList<LogEntry | PublishResult>(raw);
        setLogs(list.map(normalizeLog)); setTotalPages(1); setTotalElements(list.length);
      }
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [page, platform, status]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const interval = window.setInterval(() => void load(true), 15_000); return () => window.clearInterval(interval); }, [load]);

  const failures = useMemo(() => logs.filter((log) => log.status === "failed").length, [logs]);
  const resetFilters = () => { setPlatform(""); setStatus(""); setPage(0); };

  return (
    <>
      <PageHeader eyebrow="Engine activity" title="Publish logs" description="Attempt history for every queue, retry, success, and platform error." actions={<Button variant="secondary" icon="refresh" onClick={() => load(true)} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</Button>} />
      <div className="filter-bar"><select value={platform} onChange={(event) => { setPlatform(event.target.value as Platform | ""); setPage(0); }} aria-label="Filter by platform"><option value="">All platforms</option>{PLATFORM_ORDER.map((item) => <option value={item} key={item}>{PLATFORM_META[item].label}</option>)}</select><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }} aria-label="Filter by status"><option value="">All statuses</option><option value="queued">Queued</option><option value="posting">Posting</option><option value="success">Success</option><option value="failed">Failed</option></select><Button variant="ghost" icon="filter" onClick={resetFilters} disabled={!platform && !status}>Clear filters</Button><span className="filter-spacer" /><span className="publish-summary"><span>{totalElements} events</span>{failures ? <><span>·</span><span className="row-error">{failures} failures on page</span></> : null}</span></div>
      <section className="panel">{loading ? <LoadingPanel label="Reading engine activity…" /> : error ? <div className="panel-body"><ErrorPanel message={error} retry={() => load()} /></div> : !logs.length ? <div className="panel-body"><EmptyState icon="logs" title="No matching activity" description={platform || status ? "Try clearing the filters." : "Publish a post and its engine events will appear here."} /></div> : <>
        <div className="preview-table-wrap desktop-log-table"><table className="data-table"><thead><tr><th>Time (NPT)</th><th>Platform</th><th>Event</th><th>Status</th><th>Attempt</th><th>Post</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{formatNpt(log.createdAt)}</td><td>{log.platform ? <span className="platform-badge"><PlatformIcon platform={log.platform} size="sm" />{PLATFORM_META[log.platform].label}</span> : "System"}</td><td><span className="log-message">{log.message || "Publish event"}</span>{log.error ? <span className="log-error">{log.error}</span> : null}</td><td><StatusBadge status={log.status} pulse={log.status === "queued" || log.status === "posting"} /></td><td>{log.attempt ?? "—"}</td><td><span className="table-truncate" title={log.postId ?? undefined}>{log.postId ? log.postId.slice(0, 8) : "—"}</span></td></tr>)}</tbody></table></div>
        <div className="mobile-log-list">{logs.map((log) => <article className="mobile-log" key={log.id}><div className="mobile-log-head">{log.platform ? <span className="platform-badge"><PlatformIcon platform={log.platform} size="sm" />{PLATFORM_META[log.platform].label}</span> : <span>System</span>}<StatusBadge status={log.status} /></div><p>{log.message || "Publish event"}</p>{log.error ? <span className="log-error">{log.error}</span> : null}<small>{formatNpt(log.createdAt)}{log.attempt ? ` · attempt ${log.attempt}` : ""}</small></article>)}</div>
        {totalPages > 1 ? <footer className="pagination"><Button variant="ghost" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>Previous</Button><span>Page {page + 1} of {totalPages}</span><Button variant="ghost" onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} disabled={page + 1 >= totalPages}>Next</Button></footer> : null}
      </>}</section>
    </>
  );
}
