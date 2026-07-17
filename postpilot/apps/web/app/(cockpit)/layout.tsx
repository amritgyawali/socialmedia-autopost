import type { ReactNode } from "react";
import { CockpitShell } from "@/components/cockpit-shell";
import { DemoProvider } from "@/components/demo-context";
import { requireSession } from "@/lib/auth";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const demoMode = process.env.DEMO_MODE === "true";
  return <DemoProvider enabled={demoMode}><CockpitShell email={session.email} demoMode={demoMode}>{children}</CockpitShell></DemoProvider>;
}

