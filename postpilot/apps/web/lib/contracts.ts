import type {
  CalendarItem,
  Channel,
  MediaAsset,
  Platform,
  Post,
  PostVariant,
  PublishResult,
} from "./shared-types";

export type { CalendarItem, Channel, MediaAsset, Platform, Post, PostVariant, PublishResult };

export interface LogEntry {
  id: string | number;
  createdAt: string;
  platform?: Platform | null;
  postId?: string | null;
  variantId?: string | null;
  status: string;
  message?: string | null;
  error?: string | null;
  attempt?: number | null;
}

export interface PageResponse<T> {
  content: T[];
  page?: number;
  size?: number;
  totalElements?: number;
  totalPages?: number;
}

export interface PresignUpload {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresAt?: string;
  expiresInSeconds?: number;
  headers?: Record<string, string>;
}

export interface CompleteMediaInput {
  key: string;
  publicUrl: string;
  kind: "image" | "video";
  contentType: string;
  sizeBytes: number;
  originalName: string;
}

export type ApiEnvelope<T> = T | { data: T } | { result: T };

export function unwrap<T>(value: ApiEnvelope<T>): T {
  if (value && typeof value === "object" && "data" in value) return value.data;
  if (value && typeof value === "object" && "result" in value) return value.result;
  return value as T;
}

export function asList<T>(value: unknown): T[] {
  const unwrapped = unwrap(value as ApiEnvelope<unknown>);
  if (Array.isArray(unwrapped)) return unwrapped as T[];
  if (unwrapped && typeof unwrapped === "object") {
    const object = unwrapped as Record<string, unknown>;
    for (const key of ["content", "items", "posts", "results", "channels", "logs"]) {
      if (Array.isArray(object[key])) return object[key] as T[];
    }
  }
  return [];
}

export function mediaUrl(media: MediaAsset | null | undefined): string | null {
  if (!media) return null;
  const candidate = media as MediaAsset & { url?: string; public_url?: string };
  return candidate.publicUrl || candidate.url || candidate.public_url || null;
}

export function normalizePost(raw: Post): Post {
  const candidate = raw as Post & {
    scheduled_at?: string | null;
    created_at?: string;
    updated_at?: string;
    postVariants?: PostVariant[];
  };
  return {
    ...candidate,
    status: candidate.status || "draft",
    contentDate: candidate.contentDate ?? (candidate as Post & { content_date?: string }).content_date ?? (candidate.scheduledAt ? candidate.scheduledAt.slice(0, 10) : candidate.createdAt?.slice(0, 10)) ?? new Date().toISOString().slice(0, 10),
    scheduledAt: candidate.scheduledAt ?? candidate.scheduled_at ?? null,
    createdAt: candidate.createdAt ?? candidate.created_at ?? new Date().toISOString(),
    updatedAt: candidate.updatedAt ?? candidate.updated_at ?? new Date().toISOString(),
    variants: candidate.variants ?? candidate.postVariants ?? [],
  };
}
