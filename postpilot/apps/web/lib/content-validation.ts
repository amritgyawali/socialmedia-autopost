import type { Platform } from "@postpilot/shared";
import { PLATFORM_META } from "@/lib/platforms";

export function hashtagCount(hashtags: string | null | undefined): number {
  return (hashtags ?? "").split(/[\s,]+/).filter(Boolean).length;
}

export function publishedLength(caption: string, hashtags: string | null | undefined): number {
  const tags = (hashtags ?? "").trim();
  return caption.trim().length + (tags ? 2 + tags.length : 0);
}

export function contentProblem(platform: Platform, caption: string, hashtags: string | null | undefined): string | null {
  if (!caption.trim()) return "Caption is required.";
  const length = publishedLength(caption, hashtags);
  if (length > PLATFORM_META[platform].limit) return `Final published text is ${length.toLocaleString()} characters; ${PLATFORM_META[platform].label} allows ${PLATFORM_META[platform].limit.toLocaleString()}.`;
  if (platform === "instagram" && hashtagCount(hashtags) > 30) return "Instagram allows at most 30 hashtags.";
  return null;
}

