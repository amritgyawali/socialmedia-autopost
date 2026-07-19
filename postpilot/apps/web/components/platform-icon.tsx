import type { Platform } from "@/lib/shared-types";
import { PLATFORM_META } from "@/lib/platforms";

export function PlatformIcon({ platform, size = "md" }: { platform: Platform; size?: "sm" | "md" | "lg" }) {
  const meta = PLATFORM_META[platform];
  return (
    <span
      className={`platform-icon platform-icon-${size}`}
      style={{ "--platform-color": meta.color } as React.CSSProperties}
      aria-label={meta.label}
      title={meta.label}
    >
      {meta.shortLabel}
    </span>
  );
}

