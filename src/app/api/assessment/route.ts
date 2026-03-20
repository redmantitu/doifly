import { NextRequest, NextResponse } from "next/server";
import {
  evaluateAssessment,
  FREE_FORECAST_HOURS,
  MAX_FORECAST_HOURS,
} from "@/lib/doifly";
import {
  buildProfileFromSearchParams,
  resolveLocationContext,
} from "@/lib/api-input";
import { consumeRateLimit, readParamsFromRequest } from "@/lib/route-utils";
import { loadWeatherBundle } from "@/lib/weather";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_REQUESTS = 30;

export async function POST(request: NextRequest) {
  const rateLimit = consumeRateLimit(
    request,
    "assessment",
    RATE_LIMIT_REQUESTS,
    RATE_LIMIT_WINDOW_MS,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many assessment requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const searchParams = await readParamsFromRequest(request);
  const mode = searchParams.get("mode") === "generic" ? "generic" : "personalized";
  const requestedHours = Number(searchParams.get("hours") ?? FREE_FORECAST_HOURS);
  const forecastHours = Math.min(
    MAX_FORECAST_HOURS,
    Math.max(1, Number.isFinite(requestedHours) ? requestedHours : FREE_FORECAST_HOURS),
  );

  const profile = buildProfileFromSearchParams(searchParams);
  const locationResult = await resolveLocationContext(searchParams);

  if (!locationResult.ok) {
    return NextResponse.json(
      { error: locationResult.error },
      { status: locationResult.status },
    );
  }

  const weather = await loadWeatherBundle({
    latitude: locationResult.location.latitude,
    longitude: locationResult.location.longitude,
    forecastHours,
    countryCode: locationResult.location.countryCode,
  }).catch(() => null);

  if (!weather) {
    return NextResponse.json(
      { error: "Weather data could not be loaded." },
      { status: 502 },
    );
  }

  const assessment = evaluateAssessment({
    profile,
    mode,
    forecastHours,
    currentWeather: weather.currentWeather,
    forecast: weather.forecast,
    countryCode: locationResult.location.countryCode,
    countryName: locationResult.location.countryName,
    locationLabel: locationResult.location.locationLabel,
    sources: weather.sources,
  });

  return NextResponse.json(assessment);
}
