import { NextRequest, NextResponse } from "next/server";
import {
  evaluateScheduledFlight,
  FREE_FORECAST_HOURS,
  MAX_FORECAST_HOURS,
  type CurrentWeather,
} from "@/lib/doifly";
import {
  buildProfileFromSearchParams,
  resolveLocationContext,
} from "@/lib/api-input";
import { consumeRateLimit, readParamsFromRequest } from "@/lib/route-utils";
import { loadWeatherBundle } from "@/lib/weather";
const MAX_SCHEDULE_AHEAD_DAYS = 365;
const MAX_SCHEDULE_AHEAD_MS = MAX_SCHEDULE_AHEAD_DAYS * 24 * 60 * 60 * 1000;
const FORECAST_WINDOW_MS = MAX_FORECAST_HOURS * 60 * 60 * 1000;
const FORECAST_WINDOW_DAYS = Math.max(1, Math.round(MAX_FORECAST_HOURS / 24));
const MAX_SCHEDULE_GAP_MS = 90 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_REQUESTS = 20;

function createCurrentPoint(weather: CurrentWeather) {
  return {
    time: new Date().toISOString(),
    ...weather,
  };
}

export async function POST(request: NextRequest) {
  const rateLimit = consumeRateLimit(
    request,
    "scheduled-flight",
    RATE_LIMIT_REQUESTS,
    RATE_LIMIT_WINDOW_MS,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many scheduled flight checks. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const searchParams = await readParamsFromRequest(request);
  const targetAt = searchParams.get("targetAt");
  const mode = searchParams.get("mode") === "generic" ? "generic" : "personalized";

  if (!targetAt || Number.isNaN(Date.parse(targetAt))) {
    return NextResponse.json(
      { error: "targetAt must be a valid ISO date-time." },
      { status: 400 },
    );
  }

  const scheduledTime = Date.parse(targetAt);
  const now = Date.now();
  const leadMs = scheduledTime - now;

  if (leadMs <= 0) {
    return NextResponse.json(
      { error: "Scheduled flights must be in the future." },
      { status: 400 },
    );
  }

  if (leadMs > MAX_SCHEDULE_AHEAD_MS) {
    return NextResponse.json(
      { error: `Scheduled flights can be saved up to ${MAX_SCHEDULE_AHEAD_DAYS} days ahead.` },
      { status: 400 },
    );
  }

  if (leadMs > FORECAST_WINDOW_MS + MAX_SCHEDULE_GAP_MS) {
    return NextResponse.json(
      {
        code: "forecast_not_available_yet",
        error: `Forecast data is not available for that scheduled time yet. It will populate automatically once the flight enters the next ${FORECAST_WINDOW_DAYS}-day weather window.`,
      },
      { status: 409 },
    );
  }

  const profile = buildProfileFromSearchParams(searchParams);
  const locationResult = await resolveLocationContext(searchParams);

  if (!locationResult.ok) {
    return NextResponse.json(
      { error: locationResult.error },
      { status: locationResult.status },
    );
  }

  const requestedHours = Math.max(
    FREE_FORECAST_HOURS,
    Math.min(MAX_FORECAST_HOURS, Math.ceil(leadMs / (60 * 60 * 1000)) + 2),
  );
  const weather = await loadWeatherBundle({
    latitude: locationResult.location.latitude,
    longitude: locationResult.location.longitude,
    forecastHours: requestedHours,
    countryCode: locationResult.location.countryCode,
  }).catch(() => null);

  if (!weather) {
    return NextResponse.json(
      { error: "Weather data could not be loaded." },
      { status: 502 },
    );
  }

  const candidates = [createCurrentPoint(weather.currentWeather), ...weather.forecast];
  const nearestPoint = candidates
    .map((point) => ({
      point,
      deltaMs: Math.abs(Date.parse(point.time) - scheduledTime),
    }))
    .sort((left, right) => left.deltaMs - right.deltaMs)[0];

  if (!nearestPoint || nearestPoint.deltaMs > MAX_SCHEDULE_GAP_MS) {
    return NextResponse.json(
      {
        code: "forecast_not_available_yet",
        error:
          "No forecast hour is close enough to that scheduled time yet. It will populate automatically once newer forecast data is available.",
      },
      { status: 409 },
    );
  }

  const assessment = evaluateScheduledFlight({
    profile,
    mode,
    scheduledFor: new Date(scheduledTime).toISOString(),
    forecastFor: nearestPoint.point.time,
    weather: {
      temperatureC: nearestPoint.point.temperatureC,
      windSpeedKph: nearestPoint.point.windSpeedKph,
      windDirectionDeg: nearestPoint.point.windDirectionDeg,
      windDirectionLabel: nearestPoint.point.windDirectionLabel,
      gustKph: nearestPoint.point.gustKph,
    },
    countryCode: locationResult.location.countryCode,
    countryName: locationResult.location.countryName,
    locationLabel: locationResult.location.locationLabel,
    sources: weather.sources,
  });

  return NextResponse.json(assessment);
}
