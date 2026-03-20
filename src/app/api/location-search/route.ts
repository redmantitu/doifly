import { NextRequest, NextResponse } from "next/server";
import { resolveLocationContext } from "@/lib/api-input";
import { consumeRateLimit, readParamsFromRequest } from "@/lib/route-utils";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_REQUESTS = 20;

export async function POST(request: NextRequest) {
  const rateLimit = consumeRateLimit(
    request,
    "location-search",
    RATE_LIMIT_REQUESTS,
    RATE_LIMIT_WINDOW_MS,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many location searches. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const params = await readParamsFromRequest(request);
  const resolution = await resolveLocationContext(params);

  if (!resolution.ok) {
    return NextResponse.json(
      { error: resolution.error },
      { status: resolution.status },
    );
  }

  return NextResponse.json({
    location: resolution.location,
  });
}
