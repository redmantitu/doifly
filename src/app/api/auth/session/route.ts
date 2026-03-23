import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAMES,
  fetchProfile,
  getCurrentUser,
  refreshSession,
  type DoiflyProfileRecord,
} from "@/lib/supabase";

function pickProfile(record: DoiflyProfileRecord | null) {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    username: record.username,
    usernameHash: record.username_hash,
    visualMode: record.visual_mode,
    droneProfile: record.drone_profile,
    scheduledFlights: record.scheduled_flights,
    scheduledReports: record.scheduled_reports,
    updatedAt: record.updated_at,
  };
}

async function getAccessToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAMES.auth)?.value ?? "";
}

async function getRefreshToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAMES.refresh)?.value ?? "";
}

async function tryLoadSession() {
  const accessToken = await getAccessToken();
  const refreshToken = await getRefreshToken();

  if (!accessToken && !refreshToken) {
    return null;
  }

  const currentUser = accessToken ? await getCurrentUser(accessToken) : null;

  if (currentUser && accessToken) {
    const profile = await fetchProfile(accessToken, currentUser.id).catch(() => null);
    return {
      user: currentUser,
      profile: pickProfile(profile),
      accessToken,
      refreshToken,
    };
  }

  if (!refreshToken) {
    return null;
  }

  const refreshed = await refreshSession(refreshToken).catch(() => null);

  if (!refreshed) {
    return null;
  }

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

  const user = await getCurrentUser(refreshed.access_token);
  if (!user) {
    return null;
  }

  const profile = await fetchProfile(refreshed.access_token, user.id).catch(() => null);

  return {
    user,
    profile: pickProfile(profile),
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
  };
}

export async function GET() {
  const session = await tryLoadSession();

  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.user.id,
      email: session.user.email ?? "",
      username:
        (session.user.user_metadata?.username as string | undefined) ??
        session.profile?.username ??
        "",
    },
    profile: session.profile,
  });
}
