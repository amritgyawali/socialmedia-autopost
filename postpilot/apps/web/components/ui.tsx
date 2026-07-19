import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import type { Platform, PostStatus, PublishResult } from "@/lib/shared-types";
import { Icon, type IconName } from "@/components/icons";
import { PlatformIcon } from "@/components/platform-icon";
import { platformLabel } from "@/lib/platforms";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Button({ className, variant = "primary", icon, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; icon?: IconName }) {
  return (
    <button className={clsx("button", `button-${variant}`, className)} {...props}>
      {icon ? <Icon name={icon} size={18} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function LinkButton({ href, variant = "primary", icon, children, className }: { href: string; variant?: "primary" | "secondary" | "ghost"; icon?: IconName; children: ReactNode; className?: string }) {
  return <Link href={href} className={clsx("button", `button-${variant}`, className)}>{icon ? <Icon name={icon} size={18} /> : null}<span>{children}</span></Link>;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ready: "Ready",
  scheduled: "Scheduled",
  publishing: "Publishing",
  done: "Posted",
  partially_failed: "Partial failure",
  failed: "Failed",
  queued: "Queued",
  posting: "Posting",
  success: "Posted",
  active: "Connected",
  expired: "Expired",
  error: "Needs attention",
};

export function StatusBadge({ status, pulse = false }: { status: PostStatus | PublishResult["status"] | string; pulse?: boolean }) {
  return <span className={clsx("status-badge", `status-${status}`, pulse && "status-pulse")}><span className="status-dot" />{STATUS_LABELS[status] ?? status.replaceAll("_", " ")}</span>;
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  return <span className="platform-badge"><PlatformIcon platform={platform} size="sm" />{platformLabel(platform)}</span>;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span className="spinner-wrap"><span className="spinner" /><span className="sr-only">{label}</span></span>;
}

export function LoadingPanel({ label = "Loading your cockpit…" }: { label?: string }) {
  return <div className="state-panel"><Spinner /><p>{label}</p></div>;
}

export function ErrorPanel({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="state-panel state-error"><span className="state-icon"><Icon name="alert" size={24} /></span><h2>Couldn’t load this view</h2><p>{message}</p>{retry ? <Button variant="secondary" icon="refresh" onClick={retry}>Try again</Button> : null}</div>;
}

export function EmptyState({ icon = "sparkles", title, description, action }: { icon?: IconName; title: string; description: string; action?: ReactNode }) {
  return <div className="state-panel"><span className="state-icon"><Icon name={icon} size={25} /></span><h2>{title}</h2><p>{description}</p>{action}</div>;
}

export function FieldError({ children }: { children?: ReactNode }) {
  return children ? <p className="field-error"><Icon name="alert" size={14} />{children}</p> : null;
}

export function DemoNotice() {
  return <div className="demo-notice"><span>DEMO</span> Preview data only. Saving and publishing are disabled.</div>;
}

