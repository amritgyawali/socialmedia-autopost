"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { CreatePostRequest } from "@/lib/shared-types";
import { Icon } from "@/components/icons";
import { PlatformIcon } from "@/components/platform-icon";
import { useToast } from "@/components/toast";
import { Button, EmptyState, ErrorPanel, LoadingPanel, PageHeader, StatusBadge } from "@/components/ui";
import { apiRequest, friendlyError } from "@/lib/api-client";
import { asList, normalizePost, unwrap, type ApiEnvelope, type Post, type PostVariant } from "@/lib/contracts";
import { kathmanduDate, kathmanduDateTime, monthBounds, toKathmanduTimeInput } from "@/lib/date";
import { PLATFORM_META } from "@/lib/platforms";

type Display = "month" | "list";
type ListFilter = "all" | "scheduled" | "draft" | "done";

const ITEM_TYPE = "postpilot-post";
const EDITABLE_STATUSES = ["draft", "ready", "scheduled"];

interface DragItem { postId: string }
interface DayCell { key: string; date: string; day: number; inMonth: boolean; posts: Post[] }

function validMonth(value: string | null): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

function calendarDay(post: Post): string {
  return post.scheduledAt ? kathmanduDate(new Date(post.scheduledAt)) : post.contentDate;
}

function rescheduleRequest(post: Post, targetDateKey: string): CreatePostRequest {
  const scheduledAt = post.scheduledAt ? kathmanduDateTime(targetDateKey, toKathmanduTimeInput(post.scheduledAt)) : null;
  return {
    topic: post.topic,
    contentDate: targetDateKey,
    scheduledAt,
    variants: post.variants.map(({ platform, accountId, title, caption, hashtags, mediaId }) => ({
      platform, accountId: accountId || null, title: title || null, caption, hashtags: hashtags || null, mediaId: mediaId || null,
    })),
  };
}

function duplicateRequest(post: Post): CreatePostRequest {
  return {
    topic: post.topic,
    contentDate: calendarDay(post),
    scheduledAt: null,
    variants: post.variants.map(({ platform, accountId, title, caption, hashtags, mediaId }) => ({
      platform, accountId: accountId || null, title: title || null, caption, hashtags: hashtags || null, mediaId: mediaId || null,
    })),
  };
}

function CalendarChip({ post, variant, onChanged }: { post: Post; variant: PostVariant; onChanged: () => void }) {
  const { push } = useToast();
  const router = useRouter();
  const draggable = EDITABLE_STATUSES.includes(post.status);
  const [{ isDragging }, dragRef] = useDrag(() => ({
    type: ITEM_TYPE,
    item: { postId: post.id } satisfies DragItem,
    canDrag: draggable,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [post.id, draggable]);

  async function duplicate(event: React.MouseEvent) {
    event.stopPropagation();
    if (post.variants.some((item) => item.platform === "instagram" && !item.mediaId)) {
      push("This Instagram post has no media — recreate it in Composer to duplicate.", "error");
      return;
    }
    try {
      await apiRequest<ApiEnvelope<Post>>("/posts", { method: "POST", body: JSON.stringify(duplicateRequest(post)) });
      push("Duplicated as a new draft.", "success");
      onChanged();
    } catch (caught) { push(friendlyError(caught), "error"); }
  }

  async function remove(event: React.MouseEvent) {
    event.stopPropagation();
    if (!window.confirm(`Delete "${post.topic || "this post"}"? This cannot be undone.`)) return;
    try {
      await apiRequest<void>(`/posts/${post.id}`, { method: "DELETE" });
      push("Post deleted.", "success");
      onChanged();
    } catch (caught) { push(friendlyError(caught), "error"); }
  }

  return (
    <div
      ref={dragRef as unknown as React.Ref<HTMLDivElement>}
      className={`calendar-chip ${draggable ? "draggable" : "locked"}`}
      style={{ "--platform-color": PLATFORM_META[variant.platform].color, opacity: isDragging ? 0.35 : 1 } as React.CSSProperties}
      onClick={() => router.push(`/today?post=${encodeURIComponent(post.id)}`)}
    >
      <div className="calendar-chip-strip">
        <span>{post.scheduledAt ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kathmandu", hour: "numeric", minute: "2-digit" }).format(new Date(post.scheduledAt)) : "Draft"}</span>
        <span className="calendar-chip-actions">
          {draggable ? <button type="button" onClick={duplicate} aria-label="Duplicate as draft" title="Duplicate as draft"><Icon name="copy" size={12} /></button> : null}
          {draggable ? <button type="button" onClick={remove} aria-label="Delete post" title="Delete post"><Icon name="trash" size={12} /></button> : null}
        </span>
      </div>
      <div className="calendar-chip-body">
        <span className="calendar-chip-avatar">{(variant.title || post.topic || PLATFORM_META[variant.platform].label).slice(0, 1).toUpperCase()}<PlatformIcon platform={variant.platform} size="sm" /></span>
        <span className="calendar-chip-content">
          {post.status === "draft" ? <em>Draft: </em> : null}
          {variant.caption?.trim() || variant.title || "No content"}
        </span>
      </div>
    </div>
  );
}

function CalendarDayCell({ cell, onDropPost, onChanged }: { cell: DayCell; onDropPost: (postId: string, targetDateKey: string) => void; onChanged: () => void }) {
  const [{ isOver, canDrop }, dropRef] = useDrop(() => ({
    accept: ITEM_TYPE,
    canDrop: () => cell.inMonth,
    drop: (item: DragItem) => onDropPost(item.postId, cell.date),
    collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
  }), [cell.date, cell.inMonth, onDropPost]);

  const entries = cell.posts.flatMap((post) => post.variants.map((variant) => ({ post, variant })));
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, 3);

  return (
    <div
      ref={dropRef as unknown as React.Ref<HTMLDivElement>}
      className={`calendar-day-cell ${cell.inMonth ? "" : "outside"} ${cell.date === kathmanduDate() ? "today" : ""} ${isOver && canDrop ? "drop-target" : ""}`}
    >
      <div className="calendar-date-row"><span className="calendar-date">{cell.day}</span></div>
      <div className="calendar-chip-list">
        {visible.map(({ post, variant }) => <CalendarChip key={`${post.id}-${variant.platform}`} post={post} variant={variant} onChanged={onChanged} />)}
        {entries.length > 3 && !showAll ? <button type="button" className="calendar-show-more" onClick={() => setShowAll(true)}>+{entries.length - 3} more</button> : null}
      </div>
    </div>
  );
}

function MonthGrid({ month, posts, onDropPost, onChanged }: { month: string; posts: Post[]; onDropPost: (postId: string, targetDateKey: string) => void; onChanged: () => void }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const cells = useMemo<DayCell[]>(() => {
    const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(Date.UTC(year, monthIndex, 1 - firstWeekday + index, 12));
      const dateKey = date.toISOString().slice(0, 10);
      return { key: dateKey, date: dateKey, day: date.getUTCDate(), inMonth: date.getUTCMonth() === monthIndex, posts: posts.filter((post) => calendarDay(post) === dateKey) };
    });
  }, [posts, monthIndex, year]);
  return (
    <>
      <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{cells.map((cell) => <CalendarDayCell key={cell.key} cell={cell} onDropPost={onDropPost} onChanged={onChanged} />)}</div>
    </>
  );
}

function ListView({ posts, filter, onFilterChange }: { posts: Post[]; filter: ListFilter; onFilterChange: (value: ListFilter) => void }) {
  const filtered = useMemo(() => posts.filter((post) => {
    if (filter === "scheduled") return post.status === "scheduled";
    if (filter === "draft") return post.status === "draft" || post.status === "ready";
    if (filter === "done") return post.status === "done" || post.status === "partially_failed";
    return true;
  }), [posts, filter]);
  const grouped = useMemo(() => {
    const groups = new Map<string, Post[]>();
    [...filtered].sort((a, b) => calendarDay(a).localeCompare(calendarDay(b))).forEach((post) => {
      const key = calendarDay(post);
      groups.set(key, [...(groups.get(key) ?? []), post]);
    });
    return [...groups.entries()];
  }, [filtered]);

  return (
    <div className="calendar-list">
      <div className="calendar-list-filters">
        {(["all", "scheduled", "draft", "done"] as ListFilter[]).map((value) => (
          <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => onFilterChange(value)}>{value === "all" ? "All" : value === "scheduled" ? "Scheduled" : value === "draft" ? "Draft" : "Completed"}</button>
        ))}
      </div>
      {!grouped.length ? <EmptyState icon="calendar" title="Nothing here" description="Try a different filter, or schedule a post in Composer." /> : grouped.map(([dateKey, dayPosts]) => (
        <section key={dateKey} className="calendar-list-day">
          <h3>{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${dateKey}T12:00:00Z`))}</h3>
          <div className="calendar-list-items">
            {dayPosts.flatMap((post) => post.variants.map((variant) => (
              <a key={`${post.id}-${variant.platform}`} href={`/today?post=${encodeURIComponent(post.id)}`} className="calendar-list-item">
                <PlatformIcon platform={variant.platform} size="sm" />
                <span className="calendar-list-item-copy"><strong>{post.topic || variant.title || "Untitled post"}</strong><small>{variant.caption?.trim().slice(0, 90) || "No caption yet"}</small></span>
                {post.scheduledAt ? <time>{new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kathmandu", hour: "numeric", minute: "2-digit" }).format(new Date(post.scheduledAt))}</time> : <span className="field-hint">Draft</span>}
                <StatusBadge status={post.status} />
              </a>
            )))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function CalendarClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { push } = useToast();
  const currentMonth = kathmanduDate().slice(0, 7);
  const initial = validMonth(searchParams.get("month")) ? searchParams.get("month")! : currentMonth;
  const [month, setMonth] = useState(initial);
  const [display, setDisplay] = useState<Display>("month");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const bounds = monthBounds(year, monthIndex);
    try {
      const query = new URLSearchParams({ from: bounds.from, to: bounds.to });
      const payload = await apiRequest<unknown>(`/posts?${query}`);
      setPosts(asList<Post>(payload).map(normalizePost));
    } catch (caught) { setError(friendlyError(caught)); } finally { setLoading(false); }
  }, [year, monthIndex]);

  useEffect(() => { void load(); }, [load]);

  function move(amount: number) {
    const date = new Date(Date.UTC(year, monthIndex + amount, 1));
    const next = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    setMonth(next);
    router.replace(`/calendar?month=${next}`, { scroll: false });
  }

  const onDropPost = useCallback(async (postId: string, targetDateKey: string) => {
    const post = posts.find((item) => item.id === postId);
    if (!post || calendarDay(post) === targetDateKey) return;
    try {
      const fresh = normalizePost(unwrap(await apiRequest<ApiEnvelope<Post>>(`/posts/${postId}`)));
      const updated = normalizePost(unwrap(await apiRequest<ApiEnvelope<Post>>(`/posts/${postId}`, {
        method: "PUT",
        body: JSON.stringify(rescheduleRequest(fresh, targetDateKey)),
      })));
      setPosts((current) => current.map((item) => item.id === postId ? updated : item));
      push(`Moved to ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${targetDateKey}T12:00:00Z`))}.`, "success");
    } catch (caught) { push(friendlyError(caught), "error"); }
  }, [posts, push]);

  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthIndex, 1)));

  return (
    <DndProvider backend={HTML5Backend}>
      <PageHeader eyebrow="Publishing timeline" title="Calendar" description="Drag a post to a new day to reschedule it, or switch to List for a filterable agenda." actions={<LinkButtonNewPost month={month} />} />
      <section className="panel calendar-shell">
        <header className="panel-header">
          <div className="calendar-nav"><button className="icon-button" onClick={() => move(-1)} aria-label="Previous month" disabled={display === "list"}><Icon name="chevronLeft" /></button><strong>{display === "month" ? monthName : "All content"}</strong><button className="icon-button" onClick={() => move(1)} aria-label="Next month" disabled={display === "list"}><Icon name="chevronRight" /></button></div>
          <div className="panel-actions">
            <div className="calendar-view-toggle">
              <button type="button" className={display === "month" ? "active" : ""} onClick={() => setDisplay("month")}>Month</button>
              <button type="button" className={display === "list" ? "active" : ""} onClick={() => setDisplay("list")}>List</button>
            </div>
            <Button variant="ghost" onClick={() => { setMonth(currentMonth); router.replace(`/calendar?month=${currentMonth}`); }}>This month</Button>
            <Button variant="ghost" icon="refresh" onClick={load}>Refresh</Button>
          </div>
        </header>
        {loading ? <LoadingPanel label="Reading the publishing schedule…" /> : error ? <div className="panel-body"><ErrorPanel message={error} retry={load} /></div> : display === "month" ? <MonthGrid month={month} posts={posts} onDropPost={onDropPost} onChanged={load} /> : <ListView posts={posts} filter={listFilter} onFilterChange={setListFilter} />}
      </section>
    </DndProvider>
  );
}

function LinkButtonNewPost({ month }: { month: string }) {
  return <a className="button button-primary" href={`/composer?date=${month}-01`}><Icon name="plus" size={18} />New post</a>;
}
