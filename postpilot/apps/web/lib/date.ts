const KATHMANDU_OFFSET = "+05:45";

export function kathmanduDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function kathmanduDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00${KATHMANDU_OFFSET}`).toISOString();
}

export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return kathmanduDate(new Date(iso));
}

export function toKathmanduTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kathmandu",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.hour}:${value.minute}`;
}

export function formatNpt(iso: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kathmandu",
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(iso));
}

export function monthBounds(year: number, monthIndex: number): { from: string; to: string } {
  const startMonth = String(monthIndex + 1).padStart(2, "0");
  const next = new Date(Date.UTC(year, monthIndex + 1, 1));
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
  return {
    from: new Date(`${year}-${startMonth}-01T00:00:00${KATHMANDU_OFFSET}`).toISOString(),
    to: new Date(`${next.getUTCFullYear()}-${nextMonth}-01T00:00:00${KATHMANDU_OFFSET}`).toISOString(),
  };
}

export function statusDate(iso: string): string {
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    Math.round((new Date(iso).getTime() - Date.now()) / 60_000),
    "minute",
  );
}
