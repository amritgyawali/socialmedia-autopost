import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Temporary one-time diagnostic route to find out why admin login is failing
// in production. Reports booleans only, never secret values. Deleted right
// after use.
const DEBUG_TOKEN = "c0337c947b124a969f85127c2f2e48d19b8aaa60975804a1";

export async function GET(request: Request) {
  if (request.headers.get("x-debug-token") !== DEBUG_TOKEN) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const plainHash = process.env.ADMIN_PASSWORD_HASH;
  let resolvedHash = plainHash;
  let source = plainHash ? "ADMIN_PASSWORD_HASH" : "none";
  if (!resolvedHash && process.env.ADMIN_PASSWORD_HASH_BASE64) {
    try {
      resolvedHash = Buffer.from(process.env.ADMIN_PASSWORD_HASH_BASE64, "base64").toString("utf8");
      source = "ADMIN_PASSWORD_HASH_BASE64";
    } catch {
      source = "base64-decode-failed";
    }
  }
  const testPasswordMatches = resolvedHash ? await bcrypt.compare("admin", resolvedHash).catch(() => false) : false;

  return NextResponse.json({
    adminEmailSet: Boolean(process.env.ADMIN_EMAIL),
    adminEmailMatchesExpected: adminEmail === "amritgyawali9@gmail.com",
    plainHashEnvVarSet: Boolean(plainHash),
    base64HashEnvVarSet: Boolean(process.env.ADMIN_PASSWORD_HASH_BASE64),
    hashSourceUsedByLogin: source,
    resolvedHashLooksLikeBcrypt: resolvedHash?.startsWith("$2") ?? false,
    testPasswordMatches,
  });
}
