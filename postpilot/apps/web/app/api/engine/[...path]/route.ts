import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/auth";
import { demoResponse } from "@/lib/demo-fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 1_000_000;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const ALLOWED_PATHS = [
  /^channels$/,
  /^posts$/,
  /^posts\/today$/,
  /^posts\/[0-9a-f-]+$/i,
  /^posts\/[0-9a-f-]+\/(publish|results)$/i,
  /^calendar$/,
  /^logs$/,
  /^media\/(presign|complete|register-external)$/,
  /^oauth\/(facebook|instagram|x|linkedin|youtube|tiktok)\/start$/,
  /^health$/,
];

function allowedPath(path: string): boolean {
  return ALLOWED_PATHS.some((pattern) => pattern.test(path));
}

async function engineHeaders(sessionEmail: string): Promise<Headers> {
  const headers = new Headers({ Accept: "application/json", "X-Request-Id": crypto.randomUUID() });
  const secret = process.env.COCKPIT_JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("COCKPIT_JWT_SECRET must contain at least 32 characters.");
  const token = await new SignJWT({ role: "cockpit", email: sessionEmail })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("postpilot-web")
    .setAudience("postpilot-engine")
    .setSubject(sessionEmail)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(secret));
  headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Your session expired. Sign in again." }, { status: 401 });
  if (MUTATING.has(request.method) && !isSameOrigin(request)) {
    return NextResponse.json({ message: "Cross-origin engine requests are not allowed." }, { status: 403 });
  }

  const { path: pathParts } = await context.params;
  const path = (pathParts ?? []).join("/");
  if (!allowedPath(path)) return NextResponse.json({ message: "Unknown engine operation." }, { status: 404 });

  if (process.env.DEMO_MODE === "true") {
    if (request.method !== "GET" || path.startsWith("oauth/")) {
      return NextResponse.json({ message: "Demo mode is read-only. Connect the engine to save or publish." }, { status: 409 });
    }
    const fixture = demoResponse(path, new URL(request.url));
    if (fixture === null) return NextResponse.json({ message: "This operation is unavailable in demo mode." }, { status: 404 });
    return NextResponse.json(fixture, { headers: { "Cache-Control": "no-store" } });
  }

  const base = process.env.ENGINE_URL?.replace(/\/+$/, "");
  if (!base) return NextResponse.json({ message: "ENGINE_URL is not configured." }, { status: 503 });

  const incomingUrl = new URL(request.url);
  const target = `${base}/${path}${incomingUrl.search}`;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ message: "Request is too large." }, { status: 413 });
  }

  try {
    const headers = await engineHeaders(session.email);
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const body = MUTATING.has(request.method) ? await request.arrayBuffer() : undefined;
    if (body && body.byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ message: "Request is too large." }, { status: 413 });
    }

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: body?.byteLength ? body : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
      redirect: "manual",
    });
    const responseHeaders = new Headers({
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
    });
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) responseHeaders.set("Retry-After", retryAfter);
    return new NextResponse(upstream.status === 204 ? null : await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`Engine proxy failed for ${request.method} ${path}.`, error);
    const configurationError = error instanceof Error && /configured|must contain|unsupported/i.test(error.message);
    return NextResponse.json(
      { message: configurationError ? "Engine authentication is not configured." : "The publishing engine could not be reached." },
      { status: configurationError ? 503 : 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
