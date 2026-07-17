import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth";
import { secureCookies, SESSION_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: "Cross-origin sign-out is not allowed." }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookies(),
    maxAge: 0,
  });
  return response;
}

