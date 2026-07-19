// Mirrors packages/shared/src/index.ts. Copied in rather than depended on via
// the npm workspace "file:" link, which Vercel's Linux build resolves as a
// real symlink into packages/shared - a cross-package boundary its output
// tracing for this monorepo's nested Root Directory did not handle cleanly,
// producing an Edge Middleware bundle that threw "__dirname is not defined"
// in production even though every local build looked clean. Every usage
// here was already type-only, so the dependency was never load-bearing.
// If packages/shared's contract changes, mirror the change here too.

export const PLATFORMS = [
  "facebook",
  "instagram",
  "x",
  "linkedin",
  "youtube",
  "tiktok",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export type PostStatus =
  | "draft"
  | "ready"
  | "scheduled"
  | "publishing"
  | "done"
  | "partially_failed"
  | "failed";

export type PublishStatus = "queued" | "posting" | "success" | "failed";

export interface Channel {
  id: string;
  platform: Platform;
  externalId: string;
  displayName: string;
  status: "active" | "expired" | "error";
  expiresAt?: string | null;
  reconnectUrl?: string | null;
  scopes?: string | null;
}

export interface MediaAsset {
  id: string;
  key: string;
  publicUrl: string;
  kind: "image" | "video";
  contentType: string;
  originalName?: string | null;
  size?: number | null;
  createdAt: string;
}

export interface PostVariant {
  id?: string;
  platform: Platform;
  accountId?: string | null;
  title?: string | null;
  caption: string;
  hashtags?: string | null;
  mediaId?: string | null;
  media?: MediaAsset | null;
}

export interface Post {
  id: string;
  topic?: string | null;
  /** Local editorial date (YYYY-MM-DD), independent of automatic scheduling. */
  contentDate: string;
  scheduledAt?: string | null;
  status: PostStatus;
  variants: PostVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePostRequest {
  topic?: string | null;
  /** Local editorial date (YYYY-MM-DD); defaults to today in the engine timezone. */
  contentDate?: string | null;
  scheduledAt?: string | null;
  variants: Array<Omit<PostVariant, "id" | "media">>;
}

export interface PublishResult {
  id: number;
  postId?: string | null;
  variantId: string;
  platform: Platform;
  attempt: number;
  status: PublishStatus;
  platformPostId?: string | null;
  error?: string | null;
  nextAttemptAt?: string | null;
  retryable?: boolean;
  postedAt: string;
}

export interface CalendarItem {
  id: string;
  topic?: string | null;
  scheduledAt: string;
  status: PostStatus;
  platforms: Platform[];
}

export interface PresignRequest {
  filename: string;
  contentType: string;
  size: number;
}

export interface PresignResponse {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresInSeconds: number;
}

export interface CompleteMediaRequest {
  key: string;
  publicUrl: string;
  contentType: string;
  originalName?: string;
  size?: number;
}

/**
 * The UI depends on this boundary rather than any platform SDK. A future Postiz
 * implementation can satisfy the same interface without changing the pages.
 */
export interface EngineClient {
  listChannels(): Promise<Channel[]>;
  createPost(request: CreatePostRequest): Promise<Post>;
  updatePost(id: string, request: CreatePostRequest): Promise<Post>;
  publishPost(id: string): Promise<PublishResult[]>;
  getResults(id: string): Promise<PublishResult[]>;
  getCalendar(from: string, to: string): Promise<CalendarItem[]>;
}
