"use client";

export interface AppSessionUser {
  id: string;
  email: string;
  username: string;
}

export interface AppProfilePayload {
  id: string;
  username: string;
  usernameHash: string;
  visualMode: string;
  droneProfile: unknown;
  scheduledFlights: unknown;
  scheduledReports: unknown;
  updatedAt?: string;
}

export interface AppSessionResponse {
  authenticated: boolean;
  user?: AppSessionUser;
  profile?: AppProfilePayload | null;
}

const COOKIE_USERNAME = "doifly-username";
const COOKIE_USER_HASH = "doifly-username-hash";

function normalizeUsername(username: string) {
  return username.trim().replace(/\s+/g, " ").toLowerCase();
}

async function sha256(message: string) {
  const bytes = new TextEncoder().encode(message);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashUsername(username: string) {
  return sha256(normalizeUsername(username));
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

function removeCookie(name: string) {
  document.cookie = `${name}=; Path=/; SameSite=Lax; Max-Age=0`;
}

export function rememberUsername(username: string, usernameHash: string) {
  setCookie(COOKIE_USERNAME, username);
  setCookie(COOKIE_USER_HASH, usernameHash);
}

export function getRememberedUsername() {
  const usernameMatch = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_USERNAME}=([^;]*)`));
  const hashMatch = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_USER_HASH}=([^;]*)`));

  return {
    username: usernameMatch ? decodeURIComponent(usernameMatch[1]) : "",
    usernameHash: hashMatch ? decodeURIComponent(hashMatch[1]) : "",
  };
}

export function clearRememberedUsername() {
  removeCookie(COOKIE_USERNAME);
  removeCookie(COOKIE_USER_HASH);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;

  if (!response.ok) {
    throw new Error(
      (payload && typeof payload === "object" && "error" in payload && payload.error) ||
        "Request failed.",
    );
  }

  return payload as T;
}

export async function signUp(username: string, password: string) {
  return fetchJson<{ ok: true; email: string }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function signIn(username: string, password: string) {
  return fetchJson<{ ok: true }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function signOut() {
  return fetchJson<{ ok: true }>("/api/auth/logout", {
    method: "POST",
  });
}

export async function loadSession() {
  return fetchJson<AppSessionResponse>("/api/auth/session");
}

export async function loadProfile() {
  return fetchJson<{ profile: AppProfilePayload | null }>("/api/profile");
}

export async function saveProfile(profile: AppProfilePayload) {
  return fetchJson<{ profile: AppProfilePayload | null }>("/api/profile", {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

