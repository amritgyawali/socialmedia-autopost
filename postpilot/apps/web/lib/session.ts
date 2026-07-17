import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "postpilot_session";
export const SESSION_ISSUER = "postpilot-web";
export const SESSION_AUDIENCE = "postpilot-admin";

export interface AdminSession {
  email: string;
  role: "admin";
  expiresAt: number;
}

function sessionKey(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("NEXTAUTH_SECRET must contain at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
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
  const maxAge = sessionMaxAge();
  return new SignJWT({ email, role: "admin" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(sessionKey());
}

export async function verifySessionToken(token: string | undefined): Promise<AdminSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    if (payload.role !== "admin" || typeof payload.email !== "string" || !payload.exp) return null;
    return { email: payload.email, role: "admin", expiresAt: payload.exp };
  } catch {
    return null;
  }
}

