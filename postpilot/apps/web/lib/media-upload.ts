import type { MediaAsset } from "@postpilot/shared";
import { apiRequest } from "@/lib/api-client";
import { unwrap, type ApiEnvelope, type PresignUpload } from "@/lib/contracts";

const configuredMax = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024);
export const MAX_UPLOAD_BYTES = Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : 25 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = MAX_UPLOAD_BYTES >= 1024 * 1024
  ? `${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`
  : `${Math.round(MAX_UPLOAD_BYTES / 1024)} KB`;
const ALLOWED_PREFIXES = ["image/", "video/"];

export function validateMediaFile(file: File): string | null {
  if (!ALLOWED_PREFIXES.some((prefix) => file.type.startsWith(prefix))) return "Choose an image or video file.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return `Media must be ${MAX_UPLOAD_LABEL} or smaller.`;
  return null;
}

function uploadPut(url: string, file: File, headers: Record<string, string>, progress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    if (!Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage upload failed (${xhr.status}). Check the R2 CORS policy.`));
    });
    xhr.addEventListener("error", () => reject(new Error("Storage upload was interrupted. Check your connection and R2 CORS policy.")));
    xhr.addEventListener("abort", () => reject(new Error("Storage upload was cancelled.")));
    xhr.send(file);
  });
}

export async function uploadMedia(file: File, progress: (percent: number) => void): Promise<MediaAsset> {
  const validation = validateMediaFile(file);
  if (validation) throw new Error(validation);
  progress(2);
  const rawPresign = await apiRequest<ApiEnvelope<PresignUpload>>("/media/presign", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  });
  const presign = unwrap(rawPresign);
  if (!presign.uploadUrl || !presign.key || !presign.publicUrl) throw new Error("The engine returned an incomplete upload ticket.");
  await uploadPut(presign.uploadUrl, file, presign.headers ?? {}, progress);
  progress(96);
  const complete = unwrap(await apiRequest<ApiEnvelope<MediaAsset>>("/media/complete", {
    method: "POST",
    body: JSON.stringify({
      key: presign.key,
      publicUrl: presign.publicUrl,
      contentType: file.type,
      size: file.size,
      originalName: file.name,
    }),
  }));
  progress(100);
  return {
    ...complete,
    key: complete.key ?? presign.key,
    publicUrl: complete.publicUrl ?? presign.publicUrl,
    kind: complete.kind ?? (file.type.startsWith("video/") ? "video" : "image"),
    contentType: complete.contentType ?? file.type,
    originalName: complete.originalName ?? file.name,
    createdAt: complete.createdAt ?? new Date().toISOString(),
  };
}
