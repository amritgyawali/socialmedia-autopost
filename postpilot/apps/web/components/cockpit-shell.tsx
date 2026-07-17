"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Icon, type IconName } from "@/components/icons";
import { DemoNotice } from "@/components/ui";

const nav: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/today", label: "Today", icon: "today" },
  { href: "/composer", label: "Composer", icon: "compose" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/import", label: "Import CSV", icon: "import" },
  { href: "/connections", label: "Connections", icon: "connections" },
  { href: "/logs", label: "Publish logs", icon: "logs" },
];

function Brand() {
  return <Link href="/today" className="brand" aria-label="PostPilot home"><span className="brand-mark"><Icon name="rocket" size={22} /></span><span><strong>PostPilot</strong><small>by MeritByte</small></span></Link>;
}

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

  return (
    <div className="cockpit-shell">
      <header className="mobile-header"><Brand /><button className="icon-button" onClick={() => setOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button></header>
      {open ? <button className="nav-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}
      <aside className={clsx("sidebar", open && "sidebar-open")}>
        <div className="sidebar-top"><Brand /><button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><Icon name="close" /></button></div>
        <nav className="primary-nav" aria-label="Cockpit navigation">
          <p className="nav-label">Workspace</p>
          {nav.slice(0, 4).map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={clsx("nav-link", pathname.startsWith(item.href) && "active")}><Icon name={item.icon} /><span>{item.label}</span>{item.href === "/today" ? <span className="nav-live" /> : null}</Link>)}
          <p className="nav-label nav-label-spaced">System</p>
          {nav.slice(4).map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={clsx("nav-link", pathname.startsWith(item.href) && "active")}><Icon name={item.icon} /><span>{item.label}</span></Link>)}
        </nav>
        <div className="sidebar-footer">
          <div className="admin-chip"><span className="avatar">{email.slice(0, 1).toUpperCase()}</span><span className="admin-copy"><strong>Administrator</strong><small title={email}>{email}</small></span><button className="icon-button" onClick={signOut} disabled={signingOut} aria-label="Sign out"><Icon name="logout" size={18} /></button></div>
        </div>
      </aside>
      <main className="main-content">{demoMode ? <DemoNotice /> : null}{children}</main>
    </div>
  );
}
