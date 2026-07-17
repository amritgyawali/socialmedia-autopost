import "server-only";

import type { CalendarItem, Channel, LogEntry, Post, PublishResult } from "@/lib/contracts";
import { kathmanduDate, kathmanduDateTime } from "@/lib/date";

const DEMO_POST_ID = "74dd6b2e-cb8e-4cf3-86b3-2dc658f27f71";
const MEDIA = {
  id: "b18399ed-ec3f-4c22-a953-fd2421f62f61",
  key: "demo/meritbyte.svg",
  publicUrl: "/demo-media.svg",
  kind: "image" as const,
  contentType: "image/svg+xml",
  originalName: "meritbyte-demo.svg",
  createdAt: new Date().toISOString(),
};

export function demoPost(date = kathmanduDate()): Post {
  const caption = "Great content should travel farther than your to-do list. PostPilot gives every platform the right version—without six rounds of copy and paste.";
  return {
    id: DEMO_POST_ID,
    topic: "A calmer way to publish",
    contentDate: date,
    scheduledAt: kathmanduDateTime(date, "18:45"),
    status: "ready",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    variants: [
      { id: "10c45f0a-11c8-493f-ae6c-93b5ef10f7a1", platform: "facebook", title: "", caption, hashtags: "#MeritByte #SocialMedia #Automation", mediaId: MEDIA.id, media: MEDIA },
      { id: "10c45f0a-11c8-493f-ae6c-93b5ef10f7a2", platform: "instagram", title: "", caption: `${caption}\n\nSave the busywork for robots. Keep the creative decisions for yourself.`, hashtags: "#MeritByte #PostPilot #ContentCreator #SocialMediaTools", mediaId: MEDIA.id, media: MEDIA },
      { id: "10c45f0a-11c8-493f-ae6c-93b5ef10f7a3", platform: "x", title: "", caption: "Build once. Publish everywhere. PostPilot turns one idea into platform-ready content—without the copy-paste marathon.", hashtags: "#MeritByte #BuildInPublic", mediaId: MEDIA.id, media: MEDIA },
      { id: "10c45f0a-11c8-493f-ae6c-93b5ef10f7a4", platform: "linkedin", title: "A calmer publishing workflow", caption: `${caption}\n\nWe built the workflow we wanted to use: deliberate, reviewable, and one click away from done.`, hashtags: "#Automation #ContentOperations #MeritByte", mediaId: MEDIA.id, media: MEDIA },
    ],
  };
}

export function demoChannels(): Channel[] {
  return [
    { id: "demo-fb", platform: "facebook", externalId: "meritbyte", displayName: "MeritByte Page", status: "active", expiresAt: null },
    { id: "demo-ig", platform: "instagram", externalId: "@meritbyte", displayName: "@meritbyte", status: "active", expiresAt: null },
    { id: "demo-x", platform: "x", externalId: "@meritbyte", displayName: "@meritbyte", status: "expired", expiresAt: new Date(Date.now() - 86_400_000).toISOString() },
    { id: "demo-li", platform: "linkedin", externalId: "urn:li:person:demo", displayName: "MeritByte Admin", status: "active", expiresAt: new Date(Date.now() + 28 * 86_400_000).toISOString() },
  ];
}

export function demoResults(): PublishResult[] {
  return demoPost().variants.map((variant, index) => ({
    id: index + 1,
    variantId: variant.id!,
    platform: variant.platform,
    attempt: 1,
    status: index === 2 ? "failed" : "success",
    platformPostId: index === 2 ? null : `demo-${index + 1}`,
    error: index === 2 ? "Demo token expired — reconnect required." : null,
    postedAt: new Date(Date.now() - (index + 2) * 60_000).toISOString(),
  }));
}

export function demoCalendar(from: string): CalendarItem[] {
  const [year, month] = from.split("-");
  const iso = (day: number, time: string) => kathmanduDateTime(`${year}-${month}-${String(day).padStart(2, "0")}`, time);
  return [
    { id: DEMO_POST_ID, topic: "A calmer way to publish", scheduledAt: iso(4, "08:00"), status: "done", platforms: ["facebook", "instagram", "x", "linkedin"] },
    { id: "demo-2", topic: "Three lessons from shipping", scheduledAt: iso(10, "18:45"), status: "done", platforms: ["linkedin", "x"] },
    { id: "demo-3", topic: "Behind the build", scheduledAt: iso(16, "18:45"), status: "ready", platforms: ["facebook", "instagram", "x", "linkedin"] },
    { id: "demo-4", topic: "Weekly field note", scheduledAt: iso(22, "08:00"), status: "scheduled", platforms: ["linkedin"] },
    { id: "demo-5", topic: "Product walkthrough", scheduledAt: iso(27, "18:45"), status: "draft", platforms: ["instagram", "facebook"] },
  ];
}

export function demoLogs(): LogEntry[] {
  const results = demoResults();
  return results.map((result) => ({
    id: result.id,
    createdAt: result.postedAt,
    platform: result.platform,
    postId: DEMO_POST_ID,
    variantId: result.variantId,
    status: result.status,
    message: result.status === "success" ? "Published successfully" : "Publish attempt failed",
    error: result.error,
    attempt: result.attempt,
  }));
}

export function demoResponse(path: string, url: URL): unknown {
  if (path === "channels") return demoChannels();
  if (path === "posts/today") return [demoPost(url.searchParams.get("date") ?? kathmanduDate())];
  if (path === "posts") return [demoPost()];
  if (/^posts\/[0-9a-f-]+\/results$/i.test(path)) return demoResults();
  if (path === "calendar") return demoCalendar(url.searchParams.get("from") ?? `${kathmanduDate().slice(0, 7)}-01`);
  if (path === "logs") return { content: demoLogs(), page: 0, size: 25, totalElements: 4, totalPages: 1 };
  if (path === "health") return { status: "demo" };
  return null;
}
