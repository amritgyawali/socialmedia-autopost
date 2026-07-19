export const SESSION_COOKIE = "postpilot_session";
export const SESSION_ISSUER = "postpilot-web";
export const SESSION_AUDIENCE = "postpilot-admin";

export interface AdminSession {
  email: string;
  role: "admin";
  expiresAt: number;
}

// HS256 JWTs signed with native Web Crypto instead of a JOSE-style library.
// Middleware always runs on the Edge runtime, and a package's Node build can
// end up resolved there depending on how a monorepo hoists dependencies,
// which Vercel rejects as an unsupported module. Web Crypto is a platform
// API available in both the Edge and Node.js runtimes, so this session
// module works in both without depending on package resolution at all.

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeJson(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
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
    ["sign", "verify"],
  );
}

export function sessionMaxAge(): number {
  const requested = Number(process.env.AUTH_SESSION_HOURS ?? 12);
  const hours = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 168) : 12;
  return Math.round(hours * 60 * 60);
}

export function secureCookies(): boolean {
  if (process.env.AUTH_COOKIE_SECURE === "false") return false;
  if (process.env.AUTH_COOKIE_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}

export async function createSessionToken(email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    email,
    role: "admin",
    iss: SESSION_ISSUER,
    aud: SESSION_AUDIENCE,
    sub: email,
    iat: now,
    exp: now + sessionMaxAge(),
  });
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), signingInput);
  return `${header}.${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string | undefined): Promise<AdminSession | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;

  try {
    const header = decodeJson<{ alg?: string }>(headerPart);
    if (header.alg !== "HS256") return null;

    const signingInput = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      fromBase64Url(signaturePart) as BufferSource,
      signingInput,
    );
    if (!valid) return null;

    const payload = decodeJson<{
      email?: unknown;
      role?: unknown;
      iss?: unknown;
      aud?: unknown;
      exp?: unknown;
    }>(payloadPart);
    const now = Math.floor(Date.now() / 1000);

    if (payload.role !== "admin" || typeof payload.email !== "string") return null;
    if (payload.iss !== SESSION_ISSUER || payload.aud !== SESSION_AUDIENCE) return null;
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;

    return { email: payload.email, role: "admin", expiresAt: payload.exp };
  } catch {
    return null;
  }
}
