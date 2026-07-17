"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { Button, EmptyState, ErrorPanel, LinkButton, LoadingPanel, PageHeader, StatusBadge } from "@/components/ui";
import { apiRequest, friendlyError } from "@/lib/api-client";
import { asList, type CalendarItem, type Platform, type Post } from "@/lib/contracts";
import { kathmanduDate, monthBounds } from "@/lib/date";

interface DayCell { key: string; date: string; day: number; inMonth: boolean; items: CalendarItem[] }

function validMonth(value: string | null): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

function normalizeItem(raw: CalendarItem | Post): CalendarItem | null {
  const candidate = raw as CalendarItem & Post;
  if (!candidate.scheduledAt) return null;
  return {
    id: candidate.id,
    topic: candidate.topic,
    scheduledAt: candidate.scheduledAt,
    status: candidate.status,
    platforms: candidate.platforms ?? candidate.variants?.map((variant) => variant.platform) ?? [],
  };
}

function dateInKathmandu(iso: string): string {
  return kathmanduDate(new Date(iso));
}

export function CalendarClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentMonth = kathmanduDate().slice(0, 7);
  const initial = validMonth(searchParams.get("month")) ? searchParams.get("month")! : currentMonth;
  const [month, setMonth] = useState(initial);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const bounds = monthBounds(year, monthIndex);
    try {
      const query = new URLSearchParams({ from: bounds.from, to: bounds.to });
      const payload = await apiRequest<unknown>(`/calendar?${query}`);
      setItems(asList<CalendarItem | Post>(payload).map(normalizeItem).filter((item): item is CalendarItem => Boolean(item)));
    } catch (caught) { setError(friendlyError(caught)); } finally { setLoading(false); }
  }, [year, monthIndex]);

  useEffect(() => { void load(); }, [load]);

  function move(amount: number) {
    const date = new Date(Date.UTC(year, monthIndex + amount, 1));
    const next = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    setMonth(next);
    router.replace(`/calendar?month=${next}`, { scroll: false });
  }

  const cells = useMemo<DayCell[]>(() => {
    const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(Date.UTC(year, monthIndex, 1 - firstWeekday + index, 12));
      const dateKey = date.toISOString().slice(0, 10);
      return { key: dateKey, date: dateKey, day: date.getUTCDate(), inMonth: date.getUTCMonth() === monthIndex, items: items.filter((item) => dateInKathmandu(item.scheduledAt) === dateKey) };
    });
  }, [items, monthIndex, year]);

  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthIndex, 1)));
  const agenda = cells.filter((cell) => cell.inMonth && cell.items.length);

  return (
    <>
      <PageHeader eyebrow="Publishing timeline" title="Calendar" description="See scheduled posts and completed launches in Nepal time. Manual drafts stay on Today." actions={<LinkButton href={`/composer?date=${month}-01`} icon="plus">New post</LinkButton>} />
      <section className="panel calendar-shell">
        <header className="panel-header"><div className="calendar-nav"><button className="icon-button" onClick={() => move(-1)} aria-label="Previous month"><Icon name="chevronLeft" /></button><strong>{monthName}</strong><button className="icon-button" onClick={() => move(1)} aria-label="Next month"><Icon name="chevronRight" /></button></div><div className="panel-actions"><Button variant="ghost" onClick={() => { setMonth(currentMonth); router.replace(`/calendar?month=${currentMonth}`); }}>This month</Button><Button variant="ghost" icon="refresh" onClick={load}>Refresh</Button></div></header>
        {loading ? <LoadingPanel label="Reading the publishing schedule…" /> : error ? <div className="panel-body"><ErrorPanel message={error} retry={load} /></div> : <>
          <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">{cells.map((cell) => <div key={cell.key} className={`calendar-day ${cell.inMonth ? "" : "outside"} ${cell.date === kathmanduDate() ? "today" : ""}`}><span className="calendar-date">{cell.day}</span><div className="calendar-items">{cell.items.slice(0, 3).map((item) => <div key={item.id} className={`calendar-item ${item.status}`} title={`${item.topic || "Untitled post"} · ${item.status}`}>{new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kathmandu", hour: "numeric", minute: "2-digit" }).format(new Date(item.scheduledAt))} · {item.topic || "Untitled"}</div>)}{cell.items.length > 3 ? <span className="calendar-item">+{cell.items.length - 3} more</span> : null}</div></div>)}</div>
          <div className="calendar-agenda">{agenda.length ? agenda.map((cell) => <div className="agenda-day" key={cell.date}><div className="agenda-date">{new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${cell.date}T12:00:00Z`))}<strong>{cell.day}</strong></div><div className="agenda-items">{cell.items.map((item) => <div className="agenda-item" key={item.id}><strong>{item.topic || "Untitled post"}</strong><small>{new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kathmandu", hour: "numeric", minute: "2-digit" }).format(new Date(item.scheduledAt))} · {(item.platforms as Platform[]).join(", ")}</small><StatusBadge status={item.status} /></div>)}</div></div>) : <EmptyState icon="calendar" title="No scheduled posts this month" description="Schedule a post in Composer to place it on the calendar." action={<LinkButton href="/composer" icon="plus">Create post</LinkButton>} />}</div>
        </>}
      </section>
    </>
  );
}
