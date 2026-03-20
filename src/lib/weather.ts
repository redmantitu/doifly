import {
  directionToLabel,
  type CurrentWeather,
  type ForecastPoint,
} from "@/lib/doifly";

export type WeatherProviderId = "met-no" | "open-meteo";

export interface WeatherBundle {
  currentWeather: CurrentWeather;
  forecast: Omit<ForecastPoint, "status">[];
  providerId: WeatherProviderId;
  sources: string[];
}

interface WeatherRequest {
  latitude: number;
  longitude: number;
  forecastHours: number;
  countryCode?: string;
}

interface MetNoCompactResponse {
  properties?: {
    timeseries?: Array<{
      time: string;
      data?: {
        instant?: {
          details?: {
            air_temperature?: number;
            wind_from_direction?: number;
            wind_speed?: number;
            wind_speed_of_gust?: number;
          };
        };
      };
    }>;
  };
}

interface OpenMeteoForecastResponse {
  current?: {
    temperature_2m: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    wind_gusts_10m: number[];
  };
}

interface MeteoRomaniaFeatureCollection {
  features?: MeteoRomaniaFeature[];
}

interface MeteoRomaniaFeature {
  geometry?: {
    coordinates?: [string, string];
  };
  properties?: {
    nume?: string;
    tempe?: string;
    vant?: string;
  };
}

const MET_NO_USER_AGENT =
  "DoIfly/0.1 (+https://doifly.local; weather-proxy@doifly.local)";

const ROMANIA_WEATHER_URL =
  "https://www.meteoromania.ro/wp-json/meteoapi/v2/starea-vremii";
const HOUR_IN_MS = 60 * 60 * 1000;

function metersPerSecondToKph(value: number): number {
  return value * 3.6;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function filterForecastWindow<T extends { time: string }>(
  points: T[],
  forecastHours: number,
) {
  const now = Date.now();
  const forecastWindowEnd = now + forecastHours * HOUR_IN_MS;

  return points.filter((point) => {
    const pointTime = Date.parse(point.time);

    return Number.isFinite(pointTime) && pointTime > now && pointTime <= forecastWindowEnd;
  });
}

function parseRomaniaWindDirection(rawValue: string): number | null {
  const direction = rawValue.split("directia :")[1]?.trim().toUpperCase();

  if (!direction) {
    return null;
  }

  const directionMap: Record<string, number> = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSV: 202.5,
    SSW: 202.5,
    SV: 225,
    SW: 225,
    VSV: 247.5,
    WSW: 247.5,
    V: 270,
    W: 270,
    VNV: 292.5,
    WNW: 292.5,
    NV: 315,
    NW: 315,
    NNV: 337.5,
    NNW: 337.5,
  };

  return directionMap[direction] ?? null;
}

function mercatorX(longitude: number): number {
  return (longitude * 20037508.34) / 180;
}

function mercatorY(latitude: number): number {
  const safeLatitude = Math.max(Math.min(latitude, 89.5), -89.5);
  const radians = (safeLatitude * Math.PI) / 180;
  return (Math.log(Math.tan(Math.PI / 4 + radians / 2)) * 20037508.34) / Math.PI;
}

function distanceInMercatorMeters(
  latitude: number,
  longitude: number,
  x: number,
  y: number,
): number {
  const deltaX = mercatorX(longitude) - x;
  const deltaY = mercatorY(latitude) - y;
  return Math.hypot(deltaX, deltaY);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Provider request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

async function loadMetNoWeather({
  latitude,
  longitude,
  forecastHours,
}: WeatherRequest): Promise<WeatherBundle> {
  const payload = await fetchJson<MetNoCompactResponse>(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude}&lon=${longitude}`,
    {
      headers: {
        "User-Agent": MET_NO_USER_AGENT,
      },
    },
  );

  const allTimeseries =
    payload.properties?.timeseries?.filter((point) => point.data?.instant?.details) ??
    [];
  const timeseries = filterForecastWindow(allTimeseries, forecastHours);

  if (timeseries.length === 0) {
    throw new Error("MET Norway did not return forecast timeseries.");
  }

  const currentDetails = timeseries[0].data?.instant?.details;

  if (
    !currentDetails ||
    !isFiniteNumber(currentDetails.air_temperature) ||
    !isFiniteNumber(currentDetails.wind_speed) ||
    !isFiniteNumber(currentDetails.wind_from_direction)
  ) {
    throw new Error("MET Norway current weather details were incomplete.");
  }

  const currentTemperature = currentDetails.air_temperature;
  const currentWindSpeed = currentDetails.wind_speed;
  const currentWindDirection = currentDetails.wind_from_direction;
  const currentWindGust = currentDetails.wind_speed_of_gust ?? currentWindSpeed;

  return {
    providerId: "met-no",
    currentWeather: {
      temperatureC: currentTemperature,
      windSpeedKph: metersPerSecondToKph(currentWindSpeed),
      windDirectionDeg: currentWindDirection,
      windDirectionLabel: directionToLabel(currentWindDirection),
      gustKph: metersPerSecondToKph(currentWindGust),
    },
    forecast: timeseries.map((point) => {
      const details = point.data?.instant?.details;
      const temperatureC = details?.air_temperature ?? currentTemperature;
      const windDirectionDeg = details?.wind_from_direction ?? currentWindDirection;
      const windSpeed = details?.wind_speed ?? currentWindSpeed;

      return {
        time: point.time,
        temperatureC,
        windSpeedKph: metersPerSecondToKph(windSpeed),
        windDirectionDeg,
        windDirectionLabel: directionToLabel(windDirectionDeg),
        gustKph: metersPerSecondToKph(details?.wind_speed_of_gust ?? windSpeed),
      };
    }),
    sources: ["MET Norway Locationforecast"],
  };
}

async function loadOpenMeteoWeather({
  latitude,
  longitude,
  forecastHours,
}: WeatherRequest): Promise<WeatherBundle> {
  const requestHours = forecastHours + 2;
  const payload = await fetchJson<OpenMeteoForecastResponse>(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m&forecast_hours=${requestHours}&timezone=auto`,
  );

  if (
    !payload.current ||
    !payload.hourly?.time?.length ||
    !payload.hourly.temperature_2m?.length ||
    !payload.hourly.wind_speed_10m?.length ||
    !payload.hourly.wind_direction_10m?.length ||
    !payload.hourly.wind_gusts_10m?.length
  ) {
    throw new Error("Open-Meteo returned incomplete forecast data.");
  }

  const forecastCandidates = filterForecastWindow(
    payload.hourly.time
    .map((time, index) => ({
      time,
      temperatureC: payload.hourly?.temperature_2m[index] ?? 0,
      windSpeedKph: payload.hourly?.wind_speed_10m[index] ?? 0,
      windDirectionDeg: payload.hourly?.wind_direction_10m[index] ?? 0,
      windDirectionLabel: directionToLabel(
        payload.hourly?.wind_direction_10m[index] ?? 0,
      ),
      gustKph: payload.hourly?.wind_gusts_10m[index] ?? 0,
    })),
    forecastHours,
  );

  return {
    providerId: "open-meteo",
    currentWeather: {
      temperatureC: payload.current.temperature_2m,
      windSpeedKph: payload.current.wind_speed_10m,
      windDirectionDeg: payload.current.wind_direction_10m,
      windDirectionLabel: directionToLabel(payload.current.wind_direction_10m),
      gustKph: payload.current.wind_gusts_10m,
    },
    forecast: forecastCandidates,
    sources: ["Open-Meteo Forecast API"],
  };
}

async function mergeMeteoRomaniaObservation(
  bundle: WeatherBundle,
  latitude: number,
  longitude: number,
): Promise<WeatherBundle> {
  const payload = await fetchJson<MeteoRomaniaFeatureCollection>(ROMANIA_WEATHER_URL);
  const stations = payload.features ?? [];

  if (stations.length === 0) {
    return bundle;
  }

  const nearestStation = stations
    .map((feature) => {
      const x = Number(feature.geometry?.coordinates?.[0]);
      const y = Number(feature.geometry?.coordinates?.[1]);
      const stationName = feature.properties?.nume;

      if (!Number.isFinite(x) || !Number.isFinite(y) || !stationName) {
        return null;
      }

      return {
        feature,
        stationName,
        distanceMeters: distanceInMercatorMeters(latitude, longitude, x, y),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => left.distanceMeters - right.distanceMeters)[0];

  if (!nearestStation) {
    return bundle;
  }

  const rawTemperature = nearestStation.feature.properties?.tempe;
  const rawWind = nearestStation.feature.properties?.vant ?? "";
  const windMatch = rawWind.match(/([0-9]+(?:\.[0-9]+)?)\s*m\/s/i);
  const observedWindSpeedMps = windMatch ? Number(windMatch[1]) : null;
  const observedDirectionDeg = parseRomaniaWindDirection(rawWind);
  const observedTemperature = rawTemperature ? Number(rawTemperature) : null;

  if (
    !isFiniteNumber(observedTemperature) ||
    !isFiniteNumber(observedWindSpeedMps) ||
    !isFiniteNumber(observedDirectionDeg)
  ) {
    return bundle;
  }

  const currentWeather: CurrentWeather = {
    temperatureC: observedTemperature,
    windSpeedKph: metersPerSecondToKph(observedWindSpeedMps),
    windDirectionDeg: observedDirectionDeg,
    windDirectionLabel: directionToLabel(observedDirectionDeg),
    gustKph: Math.max(
      bundle.currentWeather.gustKph,
      metersPerSecondToKph(observedWindSpeedMps),
    ),
  };

  return {
    ...bundle,
    currentWeather,
    sources: [
      `MeteoRomania station observations (${nearestStation.stationName})`,
      ...bundle.sources,
    ],
  };
}

export async function loadWeatherBundle(
  request: WeatherRequest,
): Promise<WeatherBundle> {
  let bundle: WeatherBundle;

  try {
    bundle = await loadMetNoWeather(request);
  } catch {
    bundle = await loadOpenMeteoWeather(request);
  }

  if (request.countryCode === "RO") {
    try {
      bundle = await mergeMeteoRomaniaObservation(
        bundle,
        request.latitude,
        request.longitude,
      );
    } catch {
      return bundle;
    }
  }

  return bundle;
}
