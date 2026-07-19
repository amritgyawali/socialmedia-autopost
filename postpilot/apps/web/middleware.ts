import { NextResponse, type NextRequest } from "next/server";

// Session verification is duplicated from lib/session.ts (not imported) on
// purpose. Vercel's Edge Function bundler for this monorepo (Root Directory
// nested two levels under the npm workspace root) fails to resolve the
// "@/lib/session" path alias when it is reached only through middleware,
// rejecting the deployment with "referencing unsupported modules" even
// though the same file compiles fine for Node-runtime routes and contains
// no external imports. Keeping middleware.ts's only import as "next/server"
// sidesteps the bug entirely. lib/session.ts remains the source of truth
// for every Node-runtime caller (API routes, server components); if the
// token format changes, mirror the change here too.
const SESSION_COOKIE = "postpilot_session";
const SESSION_ISSUER = "postpilot-web";
const SESSION_AUDIENCE = "postpilot-admin";

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(fromBase64Url(value))) as T;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("NEXTAUTH_SECRET must contain at least 32 characters.");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [headerPart, payloadPart, signaturePart] = parts;

  try {
    const header = decodeJson<{ alg?: string }>(headerPart);
    if (header.alg !== "HS256") return false;

    const signingInput = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      fromBase64Url(signaturePart) as BufferSource,
      signingInput,
    );
    if (!valid) return false;

    const payload = decodeJson<{
      email?: unknown;
      role?: unknown;
      iss?: unknown;
      aud?: unknown;
      exp?: unknown;
    }>(payloadPart);
    const now = Math.floor(Date.now() / 1000);

    if (payload.role !== "admin" || typeof payload.email !== "string") return false;
    if (payload.iss !== SESSION_ISSUER || payload.aud !== SESSION_AUDIENCE) return false;
    if (typeof payload.exp !== "number" || payload.exp <= now) return false;

    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = request.nextUrl.pathname === "/login";
  const isPublicAuth = request.nextUrl.pathname === "/api/auth/login";

  if (!session && !isLogin && !isPublicAuth) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ message: "Your session expired. Sign in again." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (session && isLogin) return NextResponse.redirect(new URL("/today", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
