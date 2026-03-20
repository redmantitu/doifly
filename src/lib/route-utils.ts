import { NextRequest } from "next/server";

declare global {
  var __doiflyRateLimitStore:
    | Map<
        string,
        {
          count: number;
          resetAt: number;
        }
      >
    | undefined;
}

function getRateLimitStore() {
  if (!globalThis.__doiflyRateLimitStore) {
    globalThis.__doiflyRateLimitStore = new Map();
  }

  return globalThis.__doiflyRateLimitStore;
}

function getClientIdentifier(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfIp = request.headers.get("cf-connecting-ip");

  return (
    forwardedFor?.split(",")[0]?.trim() ||
    realIp ||
    cfIp ||
    "anonymous"
  );
}

export function consumeRateLimit(
  request: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const key = `${scope}:${getClientIdentifier(request)}`;
  const store = getRateLimitStore();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    return {
      allowed: true,
      remaining: limit - 1,
    } as const;
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    } as const;
  }

  current.count += 1;
  store.set(key, current);

  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
  } as const;
}

export async function readParamsFromRequest(request: NextRequest) {
  if (request.method === "GET") {
    return request.nextUrl.searchParams;
  }

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const params = new URLSearchParams();

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return params;
  }

  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) {
      continue;
    }

    params.set(key, typeof value === "string" ? value : String(value));
  }

  return params;
}
