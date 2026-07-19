"use client";

import { useEffect, useMemo, useState, type DragEvent, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CreatePostRequest } from "@/lib/shared-types";
import { Icon } from "@/components/icons";
import { PlatformIcon } from "@/components/platform-icon";
import { useToast } from "@/components/toast";
import { Button, FieldError, PageHeader } from "@/components/ui";
import { useDemoMode } from "@/components/demo-context";
import { apiRequest, friendlyError } from "@/lib/api-client";
import { asList, unwrap, type ApiEnvelope, type Channel, type MediaAsset, type Platform, type Post } from "@/lib/contracts";
import { kathmanduDate, kathmanduDateTime } from "@/lib/date";
import { contentProblem, publishedLength } from "@/lib/content-validation";
import { MAX_UPLOAD_LABEL, uploadMedia, validateMediaFile } from "@/lib/media-upload";
import { ACTIVE_PLATFORMS, PLATFORM_META, PLATFORM_ORDER } from "@/lib/platforms";

interface VariantDraft { title: string; caption: string; hashtags: string; accountId: string }

function trimAtWord(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const slice = value.slice(0, Math.max(0, limit - 1));
  const boundary = slice.lastIndexOf(" ");
  return `${slice.slice(0, boundary > limit * 0.65 ? boundary : undefined).trim()}…`;
}

function cleanHashtags(value: string): string {
  return value.split(/[\s,]+/).filter(Boolean).map((tag) => tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`).join(" ");
}

function generateVariant(platform: Platform, title: string, caption: string, hashtags: string): VariantDraft {
  const cleanedTags = cleanHashtags(hashtags);
  if (platform === "x") {
    const tagSuffix = cleanedTags ? `\n\n${cleanedTags.split(" ").slice(0, 3).join(" ")}` : "";
    return { title: "", caption: trimAtWord(`${caption.trim()}${tagSuffix}`, PLATFORM_META.x.limit), hashtags: "", accountId: "" };
  }
  if (platform === "instagram") return { title: "", caption: caption.trim(), hashtags: cleanedTags.split(" ").slice(0, 15).join(" "), accountId: "" };
  if (platform === "linkedin") return { title: title.trim(), caption: trimAtWord(caption.trim(), PLATFORM_META.linkedin.limit), hashtags: cleanedTags.split(" ").slice(0, 5).join(" "), accountId: "" };
  if (platform === "youtube") return { title: trimAtWord(title.trim() || caption.trim(), 100), caption: trimAtWord(caption.trim(), PLATFORM_META.youtube.limit), hashtags: cleanedTags, accountId: "" };
  return { title: title.trim(), caption: trimAtWord(caption.trim(), PLATFORM_META[platform].limit), hashtags: cleanedTags, accountId: "" };
}

function freshVariants(title = "", caption = "", hashtags = ""): Record<Platform, VariantDraft> {
  return Object.fromEntries(PLATFORM_ORDER.map((platform) => [platform, generateVariant(platform, title, caption, hashtags)])) as Record<Platform, VariantDraft>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ComposerClient() {
  const demoMode = useDemoMode();
  const router = useRouter();
  const params = useSearchParams();
  const { push } = useToast();
  const [topic, setTopic] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceCaption, setSourceCaption] = useState("");
  const [sourceHashtags, setSourceHashtags] = useState("#MeritByte");
  const [selected, setSelected] = useState<Platform[]>(ACTIVE_PLATFORMS);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelError, setChannelError] = useState("");
  const [variants, setVariants] = useState<Record<Platform, VariantDraft>>(freshVariants());
  const [schedule, setSchedule] = useState(false);
  const [date, setDate] = useState(() => params.get("date") || kathmanduDate());
  const [time, setTime] = useState("18:45");
  const [media, setMedia] = useState<MediaAsset | null>(null);
  const [mediaName, setMediaName] = useState("");
  const [mediaSize, setMediaSize] = useState(0);
  const [localPreview, setLocalPreview] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const invalid = useMemo(() => selected.find((platform) => contentProblem(platform, variants[platform].caption, variants[platform].hashtags)), [selected, variants]);
  const nativeOnly = selected.some((platform) => !ACTIVE_PLATFORMS.includes(platform));
  const unresolvedAccounts = useMemo(() => selected.filter((platform) => {
    if (!ACTIVE_PLATFORMS.includes(platform)) return false;
    const active = channels.filter((channel) => channel.platform === platform && channel.status === "active");
    return !variants[platform].accountId || !active.some((channel) => channel.id === variants[platform].accountId);
  }), [channels, selected, variants]);

  useEffect(() => {
    const saved = window.localStorage.getItem("postpilot_hashtag_bank");
    if (saved) setSourceHashtags(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("postpilot_hashtag_bank", sourceHashtags);
  }, [sourceHashtags]);

  useEffect(() => {
    let active = true;
    apiRequest<unknown>("/channels").then((payload) => {
      if (!active) return;
      const loaded = asList<Channel>(payload);
      setChannels(loaded);
      setVariants((current) => {
        const next = { ...current };
        ACTIVE_PLATFORMS.forEach((platform) => {
          const accounts = loaded.filter((channel) => channel.platform === platform && channel.status === "active");
          if (!next[platform].accountId && accounts.length === 1) next[platform] = { ...next[platform], accountId: accounts[0].id };
        });
        return next;
      });
    }).catch(() => active && setChannelError("Could not load connected accounts. Draft saving still works, but scheduling is blocked."));
    return () => { active = false; };
  }, []);

  function regenerate() {
    setVariants((current) => {
      const generated = freshVariants(sourceTitle, sourceCaption, sourceHashtags);
      PLATFORM_ORDER.forEach((platform) => { generated[platform].accountId = current[platform].accountId; });
      return generated;
    });
    push("Platform variants regenerated.", "success");
  }

  function togglePlatform(platform: Platform) {
    setSelected((current) => {
      if (current.includes(platform)) return current.filter((item) => item !== platform);
      const choosingNative = !ACTIVE_PLATFORMS.includes(platform);
      const mixed = current.some((item) => ACTIVE_PLATFORMS.includes(item) === choosingNative);
      if (mixed) {
        setSchedule(false);
        push("API-published and native-only platforms are kept in separate drafts.", "info");
        return [platform];
      }
      return [...current, platform];
    });
  }

  function updateVariant(platform: Platform, field: keyof VariantDraft, value: string) {
    setVariants((current) => ({ ...current, [platform]: { ...current[platform], [field]: value } }));
  }

  async function chooseFile(file: File | undefined) {
    if (!file || demoMode) return;
    const validation = validateMediaFile(file);
    if (validation) { setError(validation); return; }
    setError("");
    setProgress(0);
    setMediaName(file.name);
    setMediaSize(file.size);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(URL.createObjectURL(file));
    try {
      const asset = await uploadMedia(file, setProgress);
      setMedia(asset);
      push("Media uploaded securely.", "success");
    } catch (caught) {
      setMedia(null);
      setError(friendlyError(caught));
    } finally {
      setProgress(null);
    }
  }

  function fileInput(event: ChangeEvent<HTMLInputElement>) { void chooseFile(event.target.files?.[0]); event.target.value = ""; }
  function dropped(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); setDragging(false); void chooseFile(event.dataTransfer.files?.[0]); }

  function removeMedia() {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(""); setMedia(null); setMediaName(""); setMediaSize(0); setError("");
  }

  async function createPost() {
    setError("");
    if (demoMode) return;
    if (!selected.length) { setError("Choose at least one platform."); return; }
    if (!sourceCaption.trim() && selected.some((platform) => !variants[platform].caption.trim())) { setError("Write a caption before creating the post."); return; }
    if (invalid) { setError(`${PLATFORM_META[invalid].label}: ${contentProblem(invalid, variants[invalid].caption, variants[invalid].hashtags)}`); return; }
    if (schedule && nativeOnly) { setError("YouTube and TikTok must be scheduled in their native tools."); return; }
    if (schedule && unresolvedAccounts.length) { setError(`Choose an active account for ${unresolvedAccounts.map((platform) => PLATFORM_META[platform].label).join(", ")} before scheduling.`); return; }
    if (selected.includes("instagram") && !media?.id) { setError("Instagram requires an uploaded image or video before this post can be saved."); return; }
    if (schedule && new Date(kathmanduDateTime(date, time)).getTime() <= Date.now()) { setError("Choose a future date and time before scheduling."); return; }
    if (progress !== null) { setError("Wait for the media upload to finish."); return; }
    const request: CreatePostRequest = {
      topic: topic.trim() || sourceTitle.trim() || "Untitled post",
      contentDate: date,
      scheduledAt: schedule ? kathmanduDateTime(date, time) : null,
      variants: selected.map((platform) => ({
        platform,
        accountId: variants[platform].accountId || null,
        title: variants[platform].title.trim() || null,
        caption: variants[platform].caption.trim(),
        hashtags: variants[platform].hashtags.trim() || null,
        mediaId: media?.id ?? null,
      })),
    };
    setSaving(true);
    try {
      const created = unwrap(await apiRequest<ApiEnvelope<Post>>("/posts", { method: "POST", body: JSON.stringify(request) }));
      push(schedule ? "Post scheduled." : "Draft created.", "success");
      router.push(schedule ? `/calendar?month=${date.slice(0, 7)}` : `/today?post=${encodeURIComponent(created.id)}`);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Write once" title="Composer" description="Start with the core idea, then tune each platform’s version before saving." actions={<Button icon="save" onClick={createPost} disabled={demoMode || saving}>{saving ? "Creating…" : schedule ? "Schedule post" : "Save draft"}</Button>} />
      <div className="composer-layout">
        <section className="panel composer-source"><header className="panel-header"><div><h2>Source content</h2><p>Your starting point for every variant.</p></div></header><div className="panel-body composer-form">
          <label className="field"><span>Internal topic</span><input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. PostPilot launch story" disabled={demoMode} /></label>
          <label className="field"><span>Working title <span className="field-hint">optional</span></span><input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="A clear, useful headline" disabled={demoMode} /></label>
          <label className="field"><span>Core caption</span><textarea value={sourceCaption} onChange={(event) => setSourceCaption(event.target.value)} rows={7} placeholder="Write the full thought here. You can tailor it per platform next." disabled={demoMode} /></label>
          <label className="field"><span>Hashtag bank <span className="field-hint">saved in this browser</span></span><input value={sourceHashtags} onChange={(event) => setSourceHashtags(event.target.value)} placeholder="#MeritByte #PostPilot" disabled={demoMode} /></label>
          <div className="field"><span className="field-label">Platforms</span><div className="platform-selector">{PLATFORM_ORDER.map((platform) => <button key={platform} type="button" className={`platform-toggle ${selected.includes(platform) ? "selected" : ""}`} onClick={() => togglePlatform(platform)} disabled={demoMode}><PlatformIcon platform={platform} size="sm" /><span>{PLATFORM_META[platform].label}{platform === "youtube" || platform === "tiktok" ? " · manual" : ""}</span></button>)}</div>{selected.some((platform) => platform === "youtube" || platform === "tiktok") ? <p className="audit-note"><Icon name="alert" size={14} />YouTube and TikTok variants are saved for native scheduling; Post Everywhere cannot publish them until their audits are approved.</p> : null}</div>
          <Button variant="secondary" icon="sparkles" onClick={regenerate} disabled={demoMode || !sourceCaption.trim()}>Generate platform variants</Button>
          <div className="field"><span className="field-label">Media</span>{media ? <div className="uploaded-media">{media.kind === "video" ? <video src={localPreview || media.publicUrl} /> : <img src={localPreview || media.publicUrl} alt="Uploaded media" />}<div className="uploaded-media-copy"><strong>{mediaName || media.originalName || "Uploaded media"}</strong><small>{mediaSize ? formatBytes(mediaSize) : media.contentType} · ready</small></div><button className="icon-button" type="button" onClick={removeMedia} aria-label="Remove media"><Icon name="trash" size={17} /></button></div> : <label className={`upload-zone ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={dropped}><input type="file" accept="image/*,video/*" onChange={fileInput} disabled={demoMode || progress !== null} /><Icon name={progress === null ? "upload" : "clock"} size={22} /><strong>{progress === null ? "Drop media or choose a file" : `Uploading ${progress}%`}</strong><small>Image or video · up to {MAX_UPLOAD_LABEL}</small>{progress !== null ? <span className="upload-progress"><span style={{ width: `${progress}%` }} /></span> : null}</label>}</div>
          <div className="form-grid"><label className="field"><span>Publishing mode</span><select value={schedule ? "scheduled" : "draft"} onChange={(event) => setSchedule(event.target.value === "scheduled")} disabled={demoMode || nativeOnly}><option value="draft">Save as draft</option><option value="scheduled">Schedule</option></select></label>{schedule ? <label className="field"><span>Date & time (NPT)</span><span style={{ display: "grid", gridTemplateColumns: "1fr 105px", gap: 8 }}><input type="date" min={kathmanduDate()} value={date} onChange={(event) => setDate(event.target.value)} /><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></span></label> : <div />}</div>
          {channelError ? <FieldError>{channelError}</FieldError> : unresolvedAccounts.length ? <p className="audit-note"><Icon name="alert" size={14} />Choose an active account in each platform card before scheduling. You can still save this as a draft.</p> : null}
          {selected.includes("instagram") && !media ? <p className="audit-note"><Icon name="image" size={14} />Instagram requires an uploaded image or video before this post can be saved.</p> : null}
          <FieldError>{error}</FieldError>
          <div className="composer-actions"><Button icon="save" onClick={createPost} disabled={demoMode || saving}>{saving ? "Creating…" : schedule ? "Schedule post" : "Save draft"}</Button><Button variant="ghost" onClick={() => router.push("/today")}>Cancel</Button></div>
        </div></section>
        <section><div className="variant-editor-list">{selected.length ? selected.map((platform) => { const variant = variants[platform]; const limit = PLATFORM_META[platform].limit; const finalLength = publishedLength(variant.caption, variant.hashtags); const accounts = channels.filter((channel) => channel.platform === platform && channel.status === "active"); const supported = ACTIVE_PLATFORMS.includes(platform); return <article key={platform} className="variant-editor"><header className="variant-editor-head"><span className="platform-badge"><PlatformIcon platform={platform} size="sm" />{PLATFORM_META[platform].label}</span><span className={`char-count ${finalLength > limit ? "over" : ""}`}>{finalLength.toLocaleString()} / {limit.toLocaleString()} final</span></header><div className="variant-editor-body">{supported ? <label className="field"><span>Publishing account</span><select value={variant.accountId} onChange={(event) => updateVariant(platform, "accountId", event.target.value)} disabled={demoMode || !accounts.length}><option value="">{accounts.length ? "Choose an account…" : "No active account"}</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.displayName || account.externalId}</option>)}</select>{!accounts.length ? <span className="field-error"><Icon name="alert" size={14} />Connect {PLATFORM_META[platform].label} before scheduling or publishing.</span> : null}</label> : <p className="audit-note"><Icon name="external" size={14} />Copy preparation only · publish with the native scheduler.</p>}<label className="field"><span>Title <span className="field-hint">optional</span></span><input value={variant.title} onChange={(event) => updateVariant(platform, "title", event.target.value)} disabled={demoMode} placeholder="Platform-specific title" /></label><label className="field"><span>Caption</span><textarea value={variant.caption} onChange={(event) => updateVariant(platform, "caption", event.target.value)} disabled={demoMode} rows={platform === "x" ? 4 : 6} /></label><label className="field"><span>Hashtags</span><input value={variant.hashtags} onChange={(event) => updateVariant(platform, "hashtags", event.target.value)} disabled={demoMode} />{contentProblem(platform, variant.caption, variant.hashtags) ? <span className="field-error"><Icon name="alert" size={14} />{contentProblem(platform, variant.caption, variant.hashtags)}</span> : null}</label></div></article>; }) : <div className="state-panel"><span className="state-icon"><Icon name="compose" /></span><h2>Choose a platform</h2><p>Select at least one destination to edit its version.</p></div>}</div></section>
      </div>
    </>
  );
}
