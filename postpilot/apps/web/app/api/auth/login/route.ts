import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth";
import { clearLoginRateLimit, loginRateLimit } from "@/lib/rate-limit";
import {
  createSessionToken,
  secureCookies,
  SESSION_COOKIE,
  sessionMaxAge,
} from "@/lib/session";

export const runtime = "nodejs";

const DUMMY_HASH = "$2b$12$KIXQ4Y1iBicWK1le6yV5a.6wiQ3J.fjQyIKi/E2s3FPuSO3XKxI.C";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: "Cross-origin sign-in is not allowed." }, { status: 403 });
  }

  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const limit = loginRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Too many sign-in attempts. Wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Enter your email and password." }, { status: 400 });
  }

  const input = body as { email?: unknown; password?: unknown };
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!email || password.length < 1 || password.length > 256) {
    return NextResponse.json({ message: "Enter a valid email and password." }, { status: 400 });
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  let passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!passwordHash && process.env.ADMIN_PASSWORD_HASH_BASE64) {
    try { passwordHash = Buffer.from(process.env.ADMIN_PASSWORD_HASH_BASE64, "base64").toString("utf8"); }
    catch { passwordHash = undefined; }
  }
  if (!adminEmail || !passwordHash) {
    console.error("Cockpit authentication is missing ADMIN_EMAIL or a valid password hash.");
    return NextResponse.json({ message: "Cockpit authentication is not configured." }, { status: 503 });
  }

  const passwordMatches = await bcrypt.compare(password, passwordHash || DUMMY_HASH).catch(() => false);
  if (email !== adminEmail || !passwordMatches) {
    return NextResponse.json({ message: "Email or password is incorrect." }, { status: 401 });
  }

  try {
    const token = await createSessionToken(adminEmail);
    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      secure: secureCookies(),
      sameSite: "strict",
      path: "/",
      maxAge: sessionMaxAge(),
    });
    clearLoginRateLimit(ip);
    return response;
  } catch (error) {
    console.error("Could not create the administrator session.", error);
    return NextResponse.json({ message: "Cockpit session security is not configured." }, { status: 503 });
  }
}
