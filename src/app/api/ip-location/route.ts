import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { consumeRateLimit } from "@/lib/route-utils";

interface IpApiResponse {
  latitude?: number;
  longitude?: number;
  city?: string;
  country_name?: string;
  country_code?: string;
  error?: boolean;
  reason?: string;
}

function buildLocationLabel(city: string | undefined, countryName: string) {
  if (city) {
    return `${city}, ${countryName}`;
  }

  return countryName;
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_REQUESTS = 12;

export async function GET(request: NextRequest) {
  const rateLimit = consumeRateLimit(
    request,
    "ip-location",
    RATE_LIMIT_REQUESTS,
    RATE_LIMIT_WINDOW_MS,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many approximate location requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const response = await fetch("https://ipapi.co/json/", {
    cache: "no-store",
    headers: {
      "User-Agent": "DoIfly/0.1 (+https://doifly.local; location@doifly.local)",
    },
  }).catch(() => null);

  if (!response?.ok) {
    return NextResponse.json(
      { error: "Approximate location provider is unavailable right now." },
      { status: 502 },
    );
  }

  const payload = (await response.json().catch(() => null)) as IpApiResponse | null;

  if (
    !payload ||
    payload.error ||
    typeof payload.latitude !== "number" ||
    !Number.isFinite(payload.latitude) ||
    typeof payload.longitude !== "number" ||
    !Number.isFinite(payload.longitude)
  ) {
    return NextResponse.json(
      { error: payload?.reason ?? "Approximate location could not be resolved." },
      { status: 502 },
    );
  }

  const countryCode = (payload.country_code ?? "").toUpperCase();
  const countryName = payload.country_name?.trim() || countryCode || "Unknown area";
  const city = payload.city?.trim();

  return NextResponse.json({
    location: {
      latitude: payload.latitude,
      longitude: payload.longitude,
      countryCode,
      countryName,
      locationLabel: buildLocationLabel(city, countryName),
    },
  });
}
