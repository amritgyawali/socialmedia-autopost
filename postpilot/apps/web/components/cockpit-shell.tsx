"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Icon, type IconName } from "@/components/icons";
import { DemoNotice } from "@/components/ui";

// Shell layout adapted from Postiz's new-layout chrome (github.com/gitroomhq/postiz-app,
// AGPL-3.0): icon rail on the left, main column with a title topbar.
const nav: Array<{ href: string; label: string; title: string; icon: IconName }> = [
  { href: "/calendar", label: "Calendar", title: "Calendar", icon: "calendar" },
  { href: "/composer", label: "Create", title: "Composer", icon: "compose" },
  { href: "/today", label: "Today", title: "Today", icon: "today" },
  { href: "/import", label: "Import", title: "Import CSV", icon: "import" },
  { href: "/connections", label: "Channels", title: "Channels", icon: "connections" },
  { href: "/logs", label: "Logs", title: "Publish logs", icon: "logs" },
];

export function CockpitShell({ email, demoMode, children }: { email: string; demoMode: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  const title = nav.find((item) => pathname.startsWith(item.href))?.title ?? "PostPilot";

  return (
    <div className="pz-shell">
      {open ? <button className="nav-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}
      <aside className={clsx("pz-rail", open && "pz-rail-open")}>
        <Link href="/calendar" className="pz-logo" aria-label="PostPilot home" onClick={() => setOpen(false)}><Icon name="rocket" size={22} /></Link>
        <nav className="pz-rail-nav" aria-label="Cockpit navigation">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} title={item.title} onClick={() => setOpen(false)} className={clsx("pz-rail-item", pathname.startsWith(item.href) && "active")}>
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="pz-rail-bottom">
          <button className="pz-rail-item" onClick={signOut} disabled={signingOut} title="Sign out">
            <Icon name="logout" size={20} />
            <span>{signingOut ? "…" : "Sign out"}</span>
          </button>
        </div>
      </aside>
      <div className="pz-main">
        <header className="pz-topbar">
          <button className="icon-button pz-burger" onClick={() => setOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button>
          <div className="pz-title">{title}</div>
          <div className="pz-topbar-actions">
            <span className="pz-user" title={email}><span className="pz-avatar">{email.slice(0, 1).toUpperCase()}</span><span className="pz-user-email">{email}</span></span>
            <span className="pz-sep" aria-hidden />
            <button className="icon-button" onClick={signOut} disabled={signingOut} aria-label="Sign out"><Icon name="logout" size={18} /></button>
          </div>
        </header>
        <main className="pz-content">{demoMode ? <DemoNotice /> : null}{children}</main>
      </div>
    </div>
  );
}
