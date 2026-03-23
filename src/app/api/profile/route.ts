import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAMES,
  fetchProfile,
  getCurrentUser,
  refreshSession,
  upsertProfile,
} from "@/lib/supabase";

async function getAccessToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAMES.auth)?.value ?? "";
}

async function getRefreshToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAMES.refresh)?.value ?? "";
}

async function resolveUserAndToken() {
  const accessToken = await getAccessToken();
  const refreshToken = await getRefreshToken();
  let currentAccessToken = accessToken;
  let user = currentAccessToken ? await getCurrentUser(currentAccessToken) : null;

  if (!user && refreshToken) {
    const refreshed = await refreshSession(refreshToken);
    currentAccessToken = refreshed.access_token;
    user = await getCurrentUser(currentAccessToken);

    if (user) {
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAMES.auth, refreshed.access_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: new Date(Date.now() + refreshed.expires_in * 1000),
      });
      cookieStore.set(SESSION_COOKIE_NAMES.refresh, refreshed.refresh_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      });
    }
  }

  if (!user) {
    return null;
  }

  return { accessToken: currentAccessToken, user };
}

export async function GET() {
  const resolved = await resolveUserAndToken();

  if (!resolved) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const profile = await fetchProfile(resolved.accessToken, resolved.user.id);

  if (!profile) {
    return NextResponse.json({ profile: null });
  }

  return NextResponse.json({
    profile: {
      id: profile.id,
      username: profile.username,
      usernameHash: profile.username_hash,
      visualMode: profile.visual_mode,
      droneProfile: profile.drone_profile,
      scheduledFlights: profile.scheduled_flights,
      scheduledReports: profile.scheduled_reports,
      updatedAt: profile.updated_at,
    },
  });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveUserAndToken();

  if (!resolved) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as
    | {
        username?: string;
        usernameHash?: string;
        visualMode?: string;
        droneProfile?: unknown;
        scheduledFlights?: unknown;
        scheduledReports?: unknown;
      }
    | null;

  if (!payload?.username || !payload.usernameHash) {
    return NextResponse.json({ error: "Incomplete profile data." }, { status: 400 });
  }

  const profile = await upsertProfile(resolved.accessToken, {
    id: resolved.user.id,
    username: payload.username,
    usernameHash: payload.usernameHash,
    visualMode: payload.visualMode ?? "night",
    droneProfile: payload.droneProfile ?? {},
    scheduledFlights: payload.scheduledFlights ?? [],
    scheduledReports: payload.scheduledReports ?? {},
  });

  return NextResponse.json({
    profile: profile
      ? {
          id: profile.id,
          username: profile.username,
          usernameHash: profile.username_hash,
          visualMode: profile.visual_mode,
          droneProfile: profile.drone_profile,
          scheduledFlights: profile.scheduled_flights,
          scheduledReports: profile.scheduled_reports,
          updatedAt: profile.updated_at,
        }
      : null,
  });
}
