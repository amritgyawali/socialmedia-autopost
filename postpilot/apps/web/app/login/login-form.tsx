"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Button, FieldError } from "@/components/ui";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Could not sign in.");
      router.replace(nextPath);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="login-form">
      <label className="field"><span>Email address</span><span className="input-with-icon"><Icon name="connections" size={18} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" autoFocus placeholder="admin@example.com" required /></span></label>
      <label className="field"><span>Password</span><span className="input-with-icon"><Icon name="logs" size={18} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Your administrator password" required /></span></label>
      <FieldError>{error}</FieldError>
      <Button type="submit" icon="rocket" disabled={loading}>{loading ? "Signing in…" : "Open cockpit"}</Button>
    </form>
  );
}

