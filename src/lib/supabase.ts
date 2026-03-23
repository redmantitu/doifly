import { createHash } from "node:crypto";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const DOIFLY_AUTH_COOKIE = "doifly-auth";
const DOIFLY_REFRESH_COOKIE = "doifly-refresh";

export const SESSION_COOKIE_NAMES = {
  auth: DOIFLY_AUTH_COOKIE,
  refresh: DOIFLY_REFRESH_COOKIE,
} as const;

export interface SupabaseAuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: {
    id: string;
    email: string;
    user_metadata?: Record<string, unknown>;
  };
}

export interface DoiflyProfileRecord {
  id: string;
  username: string;
  username_hash: string;
  visual_mode: string;
  drone_profile: unknown;
  scheduled_flights: unknown;
  scheduled_reports: unknown;
  updated_at: string;
}

function ensureSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.",
    );
  }
}

function ensureServiceRoleKey() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase service role key.");
  }
}

export function getSupabaseRestHeaders(token?: string) {
  ensureSupabaseConfig();

  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: token ? `Bearer ${token}` : `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    "Content-Type": "application/json",
  };
}

export function getSupabaseAuthHeaders(token?: string) {
  ensureSupabaseConfig();

  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: token ? `Bearer ${token}` : `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    "Content-Type": "application/json",
  };
}

export function getSupabaseAdminHeaders() {
  ensureServiceRoleKey();

  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

export function buildSyntheticEmail(username: string) {
  const normalized = normalizeUsername(username);
  const hash = createHash("sha256").update(normalized).digest("hex");

  return `${hash}@doifly.local`;
}

export function normalizeUsername(username: string) {
  return username.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function hashUsername(username: string) {
  return createHash("sha256").update(normalizeUsername(username)).digest("hex");
}

export async function createAuthAccount(username: string, password: string) {
  ensureServiceRoleKey();

  const normalizedUsername = normalizeUsername(username);
  const email = buildSyntheticEmail(normalizedUsername);
  const usernameHash = await hashUsername(normalizedUsername);

  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: getSupabaseAdminHeaders(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username: normalizedUsername,
        username_hash: usernameHash,
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; email?: string; user_metadata?: Record<string, unknown>; msg?: string }
    | null;

  if (!response.ok || !payload?.id) {
    throw new Error(payload?.msg ?? "Could not create the Supabase account.");
  }

  return {
    email,
    username: normalizedUsername,
    usernameHash,
    userId: payload.id,
  };
}

export async function signInWithPassword(username: string, password: string) {
  ensureSupabaseConfig();

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: getSupabaseAuthHeaders(),
    body: JSON.stringify({
      email: buildSyntheticEmail(username),
      password,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | SupabaseAuthSession
    | { error?: string; error_description?: string }
    | null;

  if (!response.ok || !payload || "error" in payload) {
    throw new Error(
      (payload && "error_description" in payload && payload.error_description) ||
        (payload && "error" in payload && payload.error) ||
        "Could not sign in.",
    );
  }

  return payload as SupabaseAuthSession;
}

export async function refreshSession(refreshToken: string) {
  ensureSupabaseConfig();

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: getSupabaseAuthHeaders(),
    body: JSON.stringify({
      refresh_token: refreshToken,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | SupabaseAuthSession
    | { error?: string; error_description?: string }
    | null;

  if (!response.ok || !payload || "error" in payload) {
    throw new Error(
      (payload && "error_description" in payload && payload.error_description) ||
        (payload && "error" in payload && payload.error) ||
        "Could not refresh the session.",
    );
  }

  return payload as SupabaseAuthSession;
}

export async function getCurrentUser(accessToken: string) {
  ensureSupabaseConfig();

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json().catch(() => null)) as
    | {
        id: string;
        email?: string;
        user_metadata?: Record<string, unknown>;
      }
    | null;
}

export async function fetchProfile(accessToken: string, userId: string) {
  ensureSupabaseConfig();

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=id,username,username_hash,visual_mode,drone_profile,scheduled_flights,scheduled_reports,updated_at&id=eq.${encodeURIComponent(
      userId,
    )}&limit=1`,
    {
      headers: getSupabaseRestHeaders(accessToken),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Could not load the profile.");
  }

  const rows = (await response.json().catch(() => [])) as DoiflyProfileRecord[];

  return rows[0] ?? null;
}

export async function upsertProfile(
  accessToken: string,
  payload: {
    id: string;
    username: string;
    usernameHash: string;
    visualMode: string;
    droneProfile: unknown;
    scheduledFlights: unknown;
    scheduledReports: unknown;
  },
) {
  ensureSupabaseConfig();

  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: {
      ...getSupabaseRestHeaders(accessToken),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      id: payload.id,
      username: payload.username,
      username_hash: payload.usernameHash,
      visual_mode: payload.visualMode,
      drone_profile: payload.droneProfile,
      scheduled_flights: payload.scheduledFlights,
      scheduled_reports: payload.scheduledReports,
    }),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(errorPayload?.message ?? "Could not save the profile.");
  }

  const rows = (await response.json().catch(() => [])) as DoiflyProfileRecord[];

  return rows[0] ?? null;
}

export async function deleteProfile(accessToken: string, userId: string) {
  ensureSupabaseConfig();

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: getSupabaseRestHeaders(accessToken),
    },
  );

  if (!response.ok) {
    throw new Error("Could not delete the profile.");
  }
}
