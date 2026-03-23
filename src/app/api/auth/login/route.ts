import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAMES, signInWithPassword } from "@/lib/supabase";

function setSessionCookies(response: NextResponse, session: Awaited<ReturnType<typeof signInWithPassword>>) {
  const expiresAt = new Date(Date.now() + session.expires_in * 1000);

  response.cookies.set(SESSION_COOKIE_NAMES.auth, session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  response.cookies.set(SESSION_COOKIE_NAMES.refresh, session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as
    | { username?: string; password?: string }
    | null;

  const username = payload?.username?.trim();
  const password = payload?.password ?? "";

  if (!username || !password) {
    return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  }

  try {
    const session = await signInWithPassword(username, password);
    const response = NextResponse.json({ ok: true });
    setSessionCookies(response, session);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not sign in." },
      { status: 401 },
    );
  }
}

