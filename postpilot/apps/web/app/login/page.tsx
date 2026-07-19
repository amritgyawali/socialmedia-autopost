import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession();
  if (session) redirect("/today");

  const query = await searchParams;
  const nextPath = query.next?.startsWith("/") && !query.next.startsWith("//") ? query.next : "/today";
  return (
    <main className="login-page">
      <div className="login-glow login-glow-one" /><div className="login-glow login-glow-two" />
      <section className="login-card">
        <div className="login-brand"><span className="login-logo"><Icon name="rocket" size={30} /></span><div><strong>PostPilot</strong><span>MeritByte publishing cockpit</span></div></div>
        <div className="login-copy"><p className="eyebrow">Private workspace</p><h1>Welcome back.</h1><p>Review today’s content and publish everywhere from one calm screen.</p></div>
        <LoginForm nextPath={nextPath} />
        <p className="login-security"><span /><strong>Private admin access</strong> · Credentials never reach the publishing engine.</p>
      </section>
      <p className="login-footer">MeritByte PostPilot · Asia/Kathmandu schedule</p>
    </main>
  );
}
