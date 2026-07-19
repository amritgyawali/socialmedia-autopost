import type { Platform } from "@/lib/shared-types";

export const PLATFORM_ORDER: Platform[] = [
  "facebook",
  "instagram",
  "x",
  "linkedin",
  "youtube",
  "tiktok",
];

export const ACTIVE_PLATFORMS: Platform[] = ["facebook", "instagram", "x", "linkedin"];

export const PLATFORM_META: Record<
  Platform,
  { label: string; shortLabel: string; color: string; limit: number; description: string }
> = {
  facebook: {
    label: "Facebook",
    shortLabel: "FB",
    color: "#4f8cff",
    limit: 63_206,
    description: "Page feed",
  },
  instagram: {
    label: "Instagram",
    shortLabel: "IG",
    color: "#f65b91",
    limit: 2_200,
    description: "Business account",
  },
  x: {
    label: "X",
    shortLabel: "X",
    color: "#e7edf8",
    limit: 280,
    description: "Timeline",
  },
  linkedin: {
    label: "LinkedIn",
    shortLabel: "in",
    color: "#55b8ff",
    limit: 3_000,
    description: "Personal profile",
  },
  youtube: {
    label: "YouTube",
    shortLabel: "YT",
    color: "#ff5b65",
    limit: 5_000,
    description: "After verification",
  },
  tiktok: {
    label: "TikTok",
    shortLabel: "TT",
    color: "#75f5e7",
    limit: 2_200,
    description: "After audit",
  },
};

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && PLATFORM_ORDER.includes(value.toLowerCase() as Platform);
}

export function platformLabel(platform: Platform): string {
  return PLATFORM_META[platform].label;
}

