"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CreatePostRequest } from "@/lib/shared-types";
import { Icon } from "@/components/icons";
import { PlatformIcon } from "@/components/platform-icon";
import { useToast } from "@/components/toast";
import { Button, EmptyState, ErrorPanel, LoadingPanel, PageHeader, StatusBadge } from "@/components/ui";
import { useDemoMode } from "@/components/demo-context";
import { apiRequest, friendlyError } from "@/lib/api-client";
import { asList, mediaUrl, normalizePost, unwrap, type ApiEnvelope, type Channel, type Post, type PostVariant, type PublishResult } from "@/lib/contracts";
import { kathmanduDate, kathmanduDateTime } from "@/lib/date";
import { contentProblem, publishedLength } from "@/lib/content-validation";
import { ACTIVE_PLATFORMS, PLATFORM_META } from "@/lib/platforms";

function postsFromPayload(payload: unknown): Post[] {
  const unwrapped = unwrap(payload as ApiEnvelope<unknown>);
  if (Array.isArray(unwrapped)) return unwrapped.map((post) => normalizePost(post as Post));
  if (unwrapped && typeof unwrapped === "object" && "id" in unwrapped) return [normalizePost(unwrapped as Post)];
  return asList<Post>(unwrapped).map(normalizePost);
}

function resultsFromPayload(payload: unknown): PublishResult[] {
  return asList<PublishResult>(payload);
}

function editableRequest(post: Post, scheduledAt = post.scheduledAt): CreatePostRequest {
  return {
    topic: post.topic,
    contentDate: post.contentDate,
    scheduledAt,
    variants: post.variants.map(({ platform, accountId, title, caption, hashtags, mediaId }) => ({
      platform,
      accountId: accountId || null,
      title: title || null,
      caption,
      hashtags: hashtags || null,
      mediaId: mediaId || null,
    })),
  };
}

function addDays(value: string, amount: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return date.toISOString().slice(0, 10);
}

export function TodayClient() {
  const demoMode = useDemoMode();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { push } = useToast();
  const [date, setDate] = useState(kathmanduDate);
  const [focusedPostId, setFocusedPostId] = useState(() => {
    const value = searchParams.get("post");
    return value && /^[0-9a-f-]{20,}$/i.test(value) ? value : null;
  });
  const [posts, setPosts] = useState<Post[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [results, setResults] = useState<Record<string, PublishResult>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [pollingIds, setPollingIds] = useState<string[]>([]);
  const [slot, setSlot] = useState("18:45");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setResults({});
    setPollingIds([]);
    setDirty(new Set());
    try {
      const [payload, channelPayload] = await Promise.all([
        apiRequest<unknown>(focusedPostId ? `/posts/${focusedPostId}` : `/posts/today?date=${encodeURIComponent(date)}`),
        apiRequest<unknown>("/channels"),
      ]);
      const loadedChannels = asList<Channel>(channelPayload);
      setChannels(loadedChannels);
      const loadedPosts = postsFromPayload(payload);
      const autoAssigned = loadedPosts.map((post) => ({
        ...post,
        variants: post.variants.map((variant) => {
          if (variant.accountId || !ACTIVE_PLATFORMS.includes(variant.platform)) return variant;
          const accounts = loadedChannels.filter((channel) => channel.platform === variant.platform && channel.status === "active");
          return accounts.length === 1 ? { ...variant, accountId: accounts[0].id } : variant;
        }),
      }));
      setPosts(autoAssigned);
      setDirty(new Set(autoAssigned.flatMap((post) => post.variants.filter((variant, index) => variant.id && variant.accountId && !loadedPosts.find((item) => item.id === post.id)?.variants[index]?.accountId).map((variant) => variant.id!))));
      const resultSets = await Promise.all(autoAssigned.map((post) => apiRequest<unknown>(`/posts/${post.id}/results`).then(resultsFromPayload).catch(() => [])));
      setResults(() => {
        const latest: Record<string, PublishResult> = {};
        resultSets.flat().forEach((result) => {
          if (!latest[result.variantId] || result.attempt >= latest[result.variantId].attempt) latest[result.variantId] = result;
        });
        return latest;
      });
      setPollingIds(autoAssigned.filter((post) => post.status === "publishing").map((post) => post.id));
      if (focusedPostId && loadedPosts[0]?.contentDate) setDate(loadedPosts[0].contentDate);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setLoading(false);
    }
  }, [date, focusedPostId]);

  function changeDate(nextDate: string) {
    setFocusedPostId(null);
    setDate(nextDate);
  }

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!pollingIds.length) return;
    let active = true;
    const poll = async () => {
      await Promise.all(pollingIds.map(async (postId) => {
        try {
          const [resultPayload, postPayload] = await Promise.all([
            apiRequest<unknown>(`/posts/${postId}/results`),
            apiRequest<unknown>(`/posts/${postId}`).catch(() => null),
          ]);
          const next = resultsFromPayload(resultPayload);
          if (!active) return;
          setResults((current) => {
            const merged = { ...current };
            next.forEach((result) => {
              const previous = merged[result.variantId];
              if (!previous || result.attempt >= previous.attempt || new Date(result.postedAt) >= new Date(previous.postedAt)) merged[result.variantId] = result;
            });
            return merged;
          });
          const post = posts.find((item) => item.id === postId);
          const freshPost = postPayload ? normalizePost(unwrap(postPayload as ApiEnvelope<Post>)) : null;
          if (freshPost) setPosts((current) => current.map((item) => item.id === postId ? freshPost : item));
          const retryPending = next.some((result) => result.status === "failed" && (result.retryable || result.nextAttemptAt));
          const terminalByPost = freshPost && ["done", "failed", "partially_failed"].includes(freshPost.status);
          const terminalByResults = post && next.length >= post.variants.length && next.every((result) => result.status === "success" || (result.status === "failed" && !result.retryable && !result.nextAttemptAt));
          const terminal = !retryPending && (terminalByPost || terminalByResults);
          if (terminal) setPollingIds((current) => current.filter((id) => id !== postId));
        } catch {
          // A temporary poll failure should not erase visible status. The next tick retries.
        }
      }));
    };
    void poll();
    const interval = window.setInterval(poll, 2_500);
    return () => { active = false; window.clearInterval(interval); };
  }, [pollingIds, posts]);

  const updateVariant = (postId: string, variantId: string | undefined, field: keyof PostVariant, value: string) => {
    const dirtyKey = variantId ?? `${postId}-${field}`;
    setPosts((current) => current.map((post) => post.id === postId ? {
      ...post,
      variants: post.variants.map((variant) => variant.id === variantId ? { ...variant, [field]: value } : variant),
    } : post));
    setDirty((current) => new Set(current).add(dirtyKey));
  };

  async function savePost(post: Post, quiet = false) {
    if (post.variants.some((variant) => variant.platform === "instagram" && !variant.mediaId)) throw new Error("Instagram requires media. Create a replacement in Composer and upload an image or video.");
    const invalid = post.variants.find((variant) => contentProblem(variant.platform, variant.caption, variant.hashtags));
    if (invalid) throw new Error(`${PLATFORM_META[invalid.platform].label}: ${contentProblem(invalid.platform, invalid.caption, invalid.hashtags)}`);
    const updated = unwrap(await apiRequest<ApiEnvelope<Post>>(`/posts/${post.id}`, {
      method: "PUT",
      body: JSON.stringify(editableRequest(post)),
    }));
    setPosts((current) => current.map((item) => item.id === post.id ? normalizePost(updated) : item));
    setDirty((current) => {
      const next = new Set(current);
      post.variants.forEach((variant) => variant.id && next.delete(variant.id));
      return next;
    });
    if (!quiet) push("Changes saved.", "success");
  }

  async function handleSave(post: Post) {
    setBusy(`save-${post.id}`);
    try { await savePost(post); } catch (caught) { push(friendlyError(caught), "error"); } finally { setBusy(null); }
  }

  async function duplicatePost(post: Post) {
    if (demoMode) return;
    if (post.variants.some((variant) => variant.platform === "instagram" && !variant.mediaId)) { push("This Instagram post has no media. Recreate it in Composer so you can upload media.", "error"); return; }
    setBusy(`duplicate-${post.id}`);
    try {
      const created = normalizePost(unwrap(await apiRequest<ApiEnvelope<Post>>("/posts", {
        method: "POST",
        body: JSON.stringify({ ...editableRequest(post, null), contentDate: date }),
      })));
      setFocusedPostId(created.id);
      setPosts([created]);
      setResults({});
      setDirty(new Set());
      router.replace(`/today?post=${encodeURIComponent(created.id)}`, { scroll: false });
      push("Editable draft duplicated from the attempted post.", "success");
    } catch (caught) { push(friendlyError(caught), "error"); }
    finally { setBusy(null); }
  }

  async function publish(postIds = posts.map((post) => post.id)) {
    if (demoMode) return;
    if (!postIds.length) return;
    const requested = posts.filter((post) => postIds.includes(post.id));
    const unsupported = requested.some((post) => post.variants.some((variant) => !ACTIVE_PLATFORMS.includes(variant.platform)));
    const unresolved = requested.flatMap((post) => post.variants.filter((variant) => ACTIVE_PLATFORMS.includes(variant.platform) && !channels.some((channel) => channel.id === variant.accountId && channel.platform === variant.platform && channel.status === "active")));
    const missingInstagramMedia = requested.some((post) => post.variants.some((variant) => variant.platform === "instagram" && !variant.mediaId));
    const invalidContent = requested.flatMap((post) => post.variants).find((variant) => contentProblem(variant.platform, variant.caption, variant.hashtags));
    if (unsupported) { push("Native-only or mixed posts must be published from their platform schedulers.", "error"); return; }
    if (unresolved.length) { push("Choose an active publishing account on every card before publishing.", "error"); return; }
    if (missingInstagramMedia) { push("Attach media to every Instagram card before publishing.", "error"); return; }
    if (invalidContent) { push(`${PLATFORM_META[invalidContent.platform].label}: ${contentProblem(invalidContent.platform, invalidContent.caption, invalidContent.hashtags)}`, "error"); return; }
    setBusy("publish");
    try {
      for (const post of requested) {
        if (post.variants.some((variant) => variant.id && dirty.has(variant.id))) await savePost(post, true);
      }
      for (const post of requested) {
        const payload = await apiRequest<unknown>(`/posts/${post.id}/publish`, { method: "POST", body: "{}" });
        const immediate = resultsFromPayload(payload);
        setResults((current) => {
          const merged = { ...current };
          post.variants.forEach((variant) => {
            if (variant.id) merged[variant.id] = immediate.find((result) => result.variantId === variant.id) ?? {
              id: 0, variantId: variant.id, platform: variant.platform, attempt: 1, status: "queued", postedAt: new Date().toISOString(),
            };
          });
          return merged;
        });
      }
      setPollingIds((current) => [...new Set([...current, ...postIds])]);
      push(`Publishing started for ${postIds.length === 1 ? "this post" : `${postIds.length} posts`}.`, "success");
    } catch (caught) {
      push(friendlyError(caught), "error");
    } finally {
      setBusy(null);
    }
  }

  async function scheduleAll() {
    if (demoMode || !scheduleCandidates.length) return;
    setBusy("schedule");
    const scheduledAt = kathmanduDateTime(date, slot);
    if (new Date(scheduledAt).getTime() <= Date.now()) { push("Choose a future date and time before scheduling.", "error"); setBusy(null); return; }
    const invalidContent = scheduleCandidates.flatMap((post) => post.variants).find((variant) => contentProblem(variant.platform, variant.caption, variant.hashtags));
    if (invalidContent) { push(`${PLATFORM_META[invalidContent.platform].label}: ${contentProblem(invalidContent.platform, invalidContent.caption, invalidContent.hashtags)}`, "error"); setBusy(null); return; }
    const updated: Post[] = [];
    try {
      for (const post of scheduleCandidates) {
        const saved = normalizePost(unwrap(await apiRequest<ApiEnvelope<Post>>(`/posts/${post.id}`, {
          method: "PUT",
          body: JSON.stringify(editableRequest(post, scheduledAt)),
        })));
        updated.push(saved);
        setPosts((current) => current.map((item) => item.id === saved.id ? saved : item));
        setDirty((current) => {
          const next = new Set(current);
          post.variants.forEach((variant) => variant.id && next.delete(variant.id));
          return next;
        });
      }
      const normalized = updated.map(normalizePost);
      setPosts((current) => current.map((post) => normalized.find((item) => item.id === post.id) ?? post));
      push(`${updated.length} post${updated.length === 1 ? "" : "s"} scheduled for ${slot} NPT.`, "success");
    } catch (caught) {
      push(`${updated.length ? `${updated.length} post${updated.length === 1 ? " was" : "s were"} scheduled before the engine stopped. ` : ""}${friendlyError(caught)}`, "error");
    } finally {
      setBusy(null);
    }
  }

  const progress = useMemo(() => {
    const all = Object.values(results);
    return { done: all.filter((result) => result.status === "success").length, failed: all.filter((result) => result.status === "failed").length, active: all.filter((result) => result.status === "posting" || result.status === "queued").length };
  }, [results]);
  const supportedPosts = useMemo(() => posts.filter((post) => ["draft", "ready", "scheduled"].includes(post.status) && post.variants.length > 0 && post.variants.every((variant) => ACTIVE_PLATFORMS.includes(variant.platform))), [posts]);
  const unresolvedVariants = useMemo(() => supportedPosts.flatMap((post) => post.variants.filter((variant) => !channels.some((channel) => channel.id === variant.accountId && channel.platform === variant.platform && channel.status === "active"))), [channels, supportedPosts]);
  const missingInstagramMedia = useMemo(() => supportedPosts.some((post) => post.variants.some((variant) => variant.platform === "instagram" && !variant.mediaId)), [supportedPosts]);
  const publishablePosts = useMemo(() => unresolvedVariants.length || missingInstagramMedia ? [] : supportedPosts, [missingInstagramMedia, supportedPosts, unresolvedVariants.length]);
  const scheduleCandidates = useMemo(
    () => publishablePosts.filter((post) => ["draft", "ready", "scheduled"].includes(post.status)),
    [publishablePosts],
  );

  return (
    <>
      <PageHeader eyebrow="Daily command center" title="Today’s flight plan" description="Review each platform’s version, make final edits, then launch the whole set." actions={progress.done || progress.active || progress.failed ? <div className="publish-summary"><span>{progress.done} posted</span><span>·</span><span>{progress.active} in flight</span>{progress.failed ? <><span>·</span><span className="row-error">{progress.failed} failed</span></> : null}</div> : undefined} />
      <section className="today-toolbar" aria-label="Date and publish controls">
        <div className="date-control"><div className="date-step"><button className="icon-button" onClick={() => changeDate(addDays(date, -1))} aria-label="Previous day"><Icon name="chevronLeft" /></button><button className="icon-button" onClick={() => changeDate(addDays(date, 1))} aria-label="Next day"><Icon name="chevronRight" /></button></div><label className="sr-only" htmlFor="today-date">Content date</label><input id="today-date" type="date" value={date} onChange={(event) => changeDate(event.target.value)} /><Button variant="ghost" onClick={() => changeDate(kathmanduDate())}>Today</Button></div>
        <div className="today-actions"><div className="slot-control"><select value={slot} onChange={(event) => setSlot(event.target.value)} aria-label="Schedule slot"><option value="08:00">08:00 NPT</option><option value="18:45">18:45 NPT</option></select><Button variant="secondary" icon="clock" onClick={scheduleAll} disabled={demoMode || !scheduleCandidates.length || Boolean(busy)}>{busy === "schedule" ? "Scheduling…" : scheduleCandidates.length ? `Schedule ${scheduleCandidates.length} post${scheduleCandidates.length === 1 ? "" : "s"}` : "Nothing editable"}</Button></div><Button className="button-lg" icon="rocket" onClick={() => publish(publishablePosts.map((post) => post.id))} disabled={demoMode || !publishablePosts.length || Boolean(busy)} title={unresolvedVariants.length ? "Choose an active account for every API platform" : undefined}>{busy === "publish" ? "Launching…" : publishablePosts.length ? `Post ${publishablePosts.length === 1 ? "everywhere" : `${publishablePosts.length} posts`}` : "Publishing blocked"}</Button></div>
      </section>

      {unresolvedVariants.length ? <p className="audit-note"><Icon name="alert" size={14} />Publishing and scheduling are blocked until every API platform card has an active account selected.</p> : null}
      {missingInstagramMedia ? <p className="audit-note"><Icon name="image" size={14} />Publishing and scheduling are blocked because Instagram requires an uploaded image or video.</p> : null}
      {posts.some((post) => post.variants.some((variant) => variant.platform === "youtube" || variant.platform === "tiktok")) ? <p className="audit-note"><Icon name="alert" size={14} />YouTube and TikTok cards are preparation-only until their platform audits pass. Publish those variants from the native schedulers linked in Connections.</p> : null}

      {loading ? <LoadingPanel label="Loading today’s content…" /> : error ? <ErrorPanel message={error} retry={load} /> : !posts.length ? <EmptyState icon="today" title="Nothing planned for this date" description="Create a post in Composer or import your content calendar as CSV." action={<a className="button button-primary" href={`/composer?date=${date}`}><Icon name="plus" size={18} />Create a post</a>} /> : (
        <div className="post-group">
          {posts.map((post) => <section key={post.id} className="platform-stack">
            <div className="post-group-heading"><div><h2>{post.topic || "Untitled post"}</h2><p>{post.variants.length} platform variant{post.variants.length === 1 ? "" : "s"}{post.scheduledAt ? ` · scheduled ${new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kathmandu", hour: "numeric", minute: "2-digit" }).format(new Date(post.scheduledAt))} NPT` : ""}</p></div><div className="variant-head-actions">{!["draft", "ready", "scheduled"].includes(post.status) ? <Button variant="secondary" icon="copy" onClick={() => duplicatePost(post)} disabled={demoMode || Boolean(busy)}>{busy === `duplicate-${post.id}` ? "Duplicating…" : "Duplicate as draft"}</Button> : null}<StatusBadge status={pollingIds.includes(post.id) ? "publishing" : post.status} pulse={pollingIds.includes(post.id)} /></div></div>
            {post.variants.map((variant) => {
              const result = variant.id ? results[variant.id] : undefined;
              const limit = PLATFORM_META[variant.platform].limit;
              const finalLength = publishedLength(variant.caption, variant.hashtags);
              const changed = Boolean(variant.id && dirty.has(variant.id));
              const editable = ["draft", "ready", "scheduled"].includes(post.status);
              const source = mediaUrl(variant.media);
              return <article key={variant.id ?? variant.platform} className="variant-card">
                <header className="variant-card-head"><div className="variant-platform"><PlatformIcon platform={variant.platform} /><span><strong>{PLATFORM_META[variant.platform].label}</strong><small>{result?.status === "failed" && (result.retryable || result.nextAttemptAt) ? `Retry ${result.attempt + 1} queued${result.nextAttemptAt ? ` · ${new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kathmandu", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(result.nextAttemptAt))}` : ""}` : variant.platform === "youtube" || variant.platform === "tiktok" ? "Manual · use native scheduler" : PLATFORM_META[variant.platform].description}</small></span></div><div className="variant-head-actions">{changed ? <span className="unsaved-dot" title="Unsaved changes" /> : null}{result ? <StatusBadge status={result.status === "failed" && (result.retryable || result.nextAttemptAt) && pollingIds.includes(post.id) ? "queued" : result.status} pulse={result.status === "queued" || result.status === "posting" || Boolean(result.retryable)} /> : null}{result?.status === "failed" && !result.retryable && !result.nextAttemptAt ? <Button variant="ghost" icon="refresh" onClick={() => publish([post.id])} disabled={Boolean(busy)}>Retry</Button> : <Button variant="ghost" icon="save" onClick={() => handleSave(post)} disabled={demoMode || !editable || !changed || Boolean(busy)}>{busy === `save-${post.id}` ? "Saving…" : "Save"}</Button>}</div></header>
                <div className="variant-card-body"><div className="variant-fields">{ACTIVE_PLATFORMS.includes(variant.platform) ? (() => { const accounts = channels.filter((channel) => channel.platform === variant.platform && channel.status === "active"); return <label className="field"><span>Publishing account</span><select value={variant.accountId ?? ""} onChange={(event) => updateVariant(post.id, variant.id, "accountId", event.target.value)} disabled={demoMode || !editable || !accounts.length}><option value="">{accounts.length ? "Choose an account…" : "No active account"}</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.displayName || account.externalId}</option>)}</select>{!variant.accountId || !accounts.some((account) => account.id === variant.accountId) ? <span className="field-error"><Icon name="alert" size={14} />Connect or choose an active account before publishing.</span> : null}</label>; })() : null}{variant.platform === "instagram" && !variant.mediaId ? <p className="field-error"><Icon name="image" size={14} />Instagram requires an uploaded image or video.</p> : null}<label className="field"><span>Title <span className="field-hint">optional</span></span><input value={variant.title ?? ""} onChange={(event) => updateVariant(post.id, variant.id, "title", event.target.value)} disabled={demoMode || !editable} placeholder="Platform-specific title" /></label><label className="field"><span>Caption</span><textarea value={variant.caption} onChange={(event) => updateVariant(post.id, variant.id, "caption", event.target.value)} disabled={demoMode || !editable} /><span className={`caption-meta ${finalLength > limit ? "over" : ""}`}>{finalLength.toLocaleString()} / {limit.toLocaleString()} final</span></label><label className="field"><span>Hashtags</span><input value={variant.hashtags ?? ""} onChange={(event) => updateVariant(post.id, variant.id, "hashtags", event.target.value)} disabled={demoMode || !editable} placeholder="#MeritByte #PostPilot" />{contentProblem(variant.platform, variant.caption, variant.hashtags) ? <span className="field-error"><Icon name="alert" size={14} />{contentProblem(variant.platform, variant.caption, variant.hashtags)}</span> : null}</label>{result?.error ? <p className="field-error"><Icon name="alert" size={14} />{result.error}</p> : null}</div><div className="media-preview">{source ? variant.media?.kind === "video" ? <video src={source} controls preload="metadata" /> : <img src={source} alt={`${PLATFORM_META[variant.platform].label} media preview`} /> : <div className="media-placeholder"><Icon name="image" size={24} /><span>No media attached</span></div>}</div></div>
              </article>;
            })}
          </section>)}
        </div>
      )}
    </>
  );
}
