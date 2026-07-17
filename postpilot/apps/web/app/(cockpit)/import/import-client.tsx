"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { CreatePostRequest } from "@postpilot/shared";
import { Icon } from "@/components/icons";
import { PlatformIcon } from "@/components/platform-icon";
import { useToast } from "@/components/toast";
import { Button, EmptyState, FieldError, PageHeader, StatusBadge } from "@/components/ui";
import { useDemoMode } from "@/components/demo-context";
import { apiRequest, friendlyError } from "@/lib/api-client";
import { asList, type ApiEnvelope, type Channel, type MediaAsset, type Post, unwrap } from "@/lib/contracts";
import { parseImportCsv, type ImportRow } from "@/lib/csv";
import { kathmanduDateTime } from "@/lib/date";
import { ACTIVE_PLATFORMS, PLATFORM_META } from "@/lib/platforms";

const SAMPLE = `date,platform,post_type,title,caption,hashtags,media_link,status
2026-07-20,linkedin,insight,A calmer content workflow,"Build once, review carefully, publish everywhere.","#MeritByte #PostPilot",,draft
2026-07-20,x,insight,,"One calm screen. Every social channel.","#MeritByte",,draft`;

type RowState = { status: "pending" | "importing" | "success" | "failed"; error?: string };

function topicFor(row: ImportRow): string {
  return row.title || row.postType || row.caption.slice(0, 60) || `Imported row ${row.rowNumber}`;
}

function externalContentType(row: ImportRow): string {
  const pathname = new URL(row.mediaLink).pathname.toLowerCase();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".mov")) return "video/quicktime";
  if (pathname.endsWith(".webm")) return "video/webm";
  if (pathname.endsWith(".mp4") || /video|reel|short/i.test(row.postType)) return "video/mp4";
  return "image/jpeg";
}

export function ImportClient() {
  const demoMode = useDemoMode();
  const { push } = useToast();
  const [csv, setCsv] = useState(SAMPLE);
  const [slot, setSlot] = useState("18:45");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [rowState, setRowState] = useState<Record<number, RowState>>({});
  const [importing, setImporting] = useState(false);
  const parsed = useMemo(() => parseImportCsv(csv), [csv]);
  const safetyError = (row: ImportRow): string | null => {
    if (row.errors.length) return null;
    if (row.platform === "instagram" && !row.mediaLink) return "Instagram rows require a media_link on your configured R2 domain.";
    if (row.sourceStatus !== "scheduled") return null;
    if (!row.platform || !ACTIVE_PLATFORMS.includes(row.platform)) return "Native-only platforms cannot be auto-scheduled; import this row as draft.";
    if (new Date(kathmanduDateTime(row.date, slot)).getTime() <= Date.now()) return "Scheduled date and time must be in the future.";
    if (!channelsLoaded) return "Waiting for connected-account check.";
    const accounts = channels.filter((channel) => channel.platform === row.platform && channel.status === "active");
    if (accounts.length !== 1) return `Scheduled CSV rows require exactly one active ${PLATFORM_META[row.platform].label} account; import as draft or resolve Connections.`;
    return null;
  };
  const validRows = parsed.rows.filter((row) => !row.errors.length && !safetyError(row));
  const invalidRows = parsed.rows.filter((row) => row.errors.length || safetyError(row));
  const completed = Object.values(rowState).filter((state) => state.status === "success" || state.status === "failed").length;

  useEffect(() => {
    apiRequest<unknown>("/channels").then((payload) => setChannels(asList<Channel>(payload))).catch(() => setChannels([])).finally(() => setChannelsLoaded(true));
  }, []);

  function fileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) { push("CSV files must be smaller than 2 MB.", "error"); return; }
    const reader = new FileReader();
    reader.onload = () => { setCsv(typeof reader.result === "string" ? reader.result : ""); setRowState({}); };
    reader.onerror = () => push("Could not read that CSV file.", "error");
    reader.readAsText(file);
    event.target.value = "";
  }

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([SAMPLE], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "postpilot-import-sample.csv"; anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importOne(row: ImportRow) {
    setRowState((current) => ({ ...current, [row.rowNumber]: { status: "importing" } }));
    try {
      let mediaId: string | null = null;
      if (row.mediaLink) {
        const pathname = new URL(row.mediaLink).pathname;
        const registered = unwrap(await apiRequest<ApiEnvelope<MediaAsset>>("/media/register-external", {
          method: "POST",
          body: JSON.stringify({
            publicUrl: row.mediaLink,
            contentType: externalContentType(row),
            originalName: pathname.split("/").pop() || undefined,
          }),
        }));
        mediaId = registered.id;
      }
      const variant = {
        platform: row.platform,
        accountId: row.sourceStatus === "scheduled" ? channels.find((channel) => channel.platform === row.platform && channel.status === "active")?.id ?? null : null,
        title: row.title || null,
        caption: row.caption,
        hashtags: row.hashtags || null,
        mediaId,
      };
      const request = {
        topic: topicFor(row),
        contentDate: row.date,
        scheduledAt: row.sourceStatus === "scheduled" ? kathmanduDateTime(row.date, slot) : null,
        variants: [variant],
      } as CreatePostRequest;
      unwrap(await apiRequest<ApiEnvelope<Post>>("/posts", { method: "POST", body: JSON.stringify(request) }));
      setRowState((current) => ({ ...current, [row.rowNumber]: { status: "success" } }));
    } catch (caught) {
      setRowState((current) => ({ ...current, [row.rowNumber]: { status: "failed", error: friendlyError(caught) } }));
    }
  }

  async function runImport() {
    if (demoMode || importing || !validRows.length || invalidRows.length) return;
    setImporting(true); setRowState({});
    for (let index = 0; index < validRows.length; index += 3) await Promise.all(validRows.slice(index, index + 3).map(importOne));
    setImporting(false);
    push("CSV import finished. Review any failed rows below.", "success");
  }

  const progress = validRows.length ? Math.round((completed / validRows.length) * 100) : 0;

  return (
    <>
      <PageHeader eyebrow="Content calendar" title="Import CSV" description="Paste your existing sheet or upload a CSV. We validate every row before touching the engine." actions={<Button icon="import" onClick={runImport} disabled={demoMode || importing || !validRows.length || Boolean(invalidRows.length)}>{importing ? `Importing ${completed}/${validRows.length}` : `Import ${validRows.length} row${validRows.length === 1 ? "" : "s"}`}</Button>} />
      <div className="import-layout">
        <section className="panel"><header className="panel-header"><div><h2>CSV source</h2><p>Upload a file or paste rows directly.</p></div><Button variant="ghost" icon="copy" onClick={downloadSample}>Sample</Button></header><div className="panel-body composer-form">
          <label className="csv-drop"><input type="file" accept=".csv,text/csv" onChange={fileChosen} disabled={demoMode} /><Icon name="upload" size={23} /><strong>Choose a CSV file</strong><span>or paste the contents below</span></label>
          <label className="field"><span>CSV contents</span><textarea className="csv-textarea" spellCheck={false} value={csv} onChange={(event) => { setCsv(event.target.value); setRowState({}); }} disabled={demoMode} /></label>
          <p className="import-help">Required schema: <code>date, platform, post_type, title, caption, hashtags, media_link, status</code>. Only rows explicitly marked <code>scheduled</code> are put on the scheduler; <code>draft</code>, <code>ready</code>, and blank rows stay manual. A media link must already use your configured public R2 media domain; the engine copies it into a managed asset.</p>
          <label className="field"><span>Default time for imported dates</span><select value={slot} onChange={(event) => setSlot(event.target.value)} disabled={demoMode}><option value="08:00">08:00 NPT</option><option value="18:45">18:45 NPT</option></select></label>
          <FieldError>{parsed.errors.join(" ")}</FieldError>
          {invalidRows.length ? <FieldError>{invalidRows.length} row{invalidRows.length === 1 ? " has" : "s have"} errors. Fix them before importing.</FieldError> : null}
          {importing ? <div className="import-progress"><span className="import-progress-bar"><span style={{ width: `${progress}%` }} /></span><span>{progress}%</span></div> : null}
          <Button icon="import" onClick={runImport} disabled={demoMode || importing || !validRows.length || Boolean(invalidRows.length)}>{importing ? "Importing…" : "Validate & import"}</Button>
        </div></section>
        <section className="panel"><header className="panel-header"><div><h2>Preview</h2><p>{parsed.rows.length ? `${validRows.length} valid · ${invalidRows.length} needs attention` : "Rows appear here after parsing."}</p></div></header>{!parsed.rows.length ? <div className="panel-body"><EmptyState icon="import" title="No rows to preview" description="Paste CSV content with the required header to get started." /></div> : <div className="preview-table-wrap"><table className="data-table"><thead><tr><th>Row</th><th>Date / mode</th><th>Platform</th><th>Content</th><th>Media</th><th>Result</th></tr></thead><tbody>{parsed.rows.map((row) => { const state = rowState[row.rowNumber]; const scheduled = row.sourceStatus === "scheduled"; const operationalError = safetyError(row); return <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.date || "—"}<br/><span className="field-hint">{scheduled ? `${slot} NPT · scheduled` : "manual draft"}</span></td><td>{row.platform ? <span className="platform-badge"><PlatformIcon platform={row.platform} size="sm" />{row.platform}</span> : <span className="row-error">Invalid</span>}</td><td><strong className="table-truncate">{row.title || row.postType || "Untitled"}</strong><span className="table-truncate">{row.caption}</span>{[...row.errors, ...(operationalError ? [operationalError] : [])].map((error) => <span className="log-error" key={error}>{error}</span>)}</td><td><span className="table-truncate">{row.mediaLink || "—"}</span></td><td>{state ? <><StatusBadge status={state.status === "importing" ? "posting" : state.status} pulse={state.status === "importing"} />{state.error ? <span className="log-error">{state.error}</span> : null}</> : row.errors.length || operationalError ? <StatusBadge status="error" /> : <StatusBadge status={scheduled ? "scheduled" : "draft"} />}</td></tr>; })}</tbody></table></div>}</section>
      </div>
    </>
  );
}
