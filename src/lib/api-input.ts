import { DRONE_CATALOG } from "@/lib/drone-catalog";
import {
  createProfileFromCatalog,
  parseLicenses,
  type DroneProfile,
} from "@/lib/doifly";

const GEOCODER_USER_AGENT =
  "DoIfly/0.1 (+https://doifly.local; geocoder@doifly.local)";
const MAX_PLACE_QUERY_LENGTH = 160;

const DEFAULT_CUSTOM_PROFILE: DroneProfile = {
  modelId: "custom-other",
  manufacturer: "Custom",
  modelName: "",
  weightGrams: 250,
  classLabel: "C0",
  category: "Open",
  operationPurpose: "recreational",
  licenses: [],
  operatorCountry: "",
};

interface NominatimAddress {
  country?: string;
  country_code?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
}

interface NominatimSearchResult {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  address?: NominatimAddress;
}

interface NominatimReverseResponse {
  name?: string;
  display_name?: string;
  address?: NominatimAddress;
}

export interface ResolvedLocationContext {
  latitude: number;
  longitude: number;
  countryCode: string;
  countryName: string;
  locationLabel: string;
}

export type LocationResolutionResult =
  | { ok: true; location: ResolvedLocationContext }
  | { ok: false; status: number; error: string };

function readTrimmedParam(
  searchParams: URLSearchParams,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = searchParams.get(key)?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function readFiniteNumberParam(
  searchParams: URLSearchParams,
  keys: string[],
): number | undefined {
  const rawValue = readTrimmedParam(searchParams, keys);

  if (!rawValue) {
    return undefined;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue)) {
    return undefined;
  }

  return parsedValue;
}

function readPositiveNumberParam(
  searchParams: URLSearchParams,
  keys: string[],
): number | undefined {
  const value = readFiniteNumberParam(searchParams, keys);

  if (value === undefined || value <= 0) {
    return undefined;
  }

  return value;
}

function hasManualAircraftOverrides(searchParams: URLSearchParams): boolean {
  return (
    readTrimmedParam(searchParams, ["manufacturer"]) !== undefined ||
    readTrimmedParam(searchParams, ["modelName"]) !== undefined ||
    readTrimmedParam(searchParams, ["weightGrams"]) !== undefined ||
    readTrimmedParam(searchParams, ["classLabel"]) !== undefined ||
    readTrimmedParam(searchParams, ["category"]) !== undefined
  );
}

function isCatalogModelId(modelId: string): boolean {
  return DRONE_CATALOG.some((entry) => entry.modelId === modelId);
}

function buildLabel(
  countryName: string,
  address?: NominatimAddress,
  fallbackLabel?: string,
  displayName?: string,
): string {
  const locality =
    address?.city ??
    address?.town ??
    address?.village ??
    address?.municipality ??
    address?.county ??
    address?.state;

  if (locality) {
    return countryName ? `${locality}, ${countryName}` : locality;
  }

  if (fallbackLabel) {
    return countryName ? `${fallbackLabel}, ${countryName}` : fallbackLabel;
  }

  if (displayName) {
    return displayName;
  }

  return countryName || "Unknown area";
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Geocoder request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

async function reverseGeocodeLocation(
  latitude: number,
  longitude: number,
): Promise<NominatimReverseResponse | null> {
  try {
    return await fetchJson<NominatimReverseResponse>(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=en&lat=${latitude}&lon=${longitude}`,
      {
        headers: {
          "User-Agent": GEOCODER_USER_AGENT,
        },
      },
    );
  } catch {
    return null;
  }
}

async function geocodePlace(place: string): Promise<NominatimSearchResult | null> {
  const results = await fetchJson<NominatimSearchResult[]>(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&accept-language=en&limit=1&q=${encodeURIComponent(place)}`,
    {
      headers: {
        "User-Agent": GEOCODER_USER_AGENT,
      },
    },
  );

  return results[0] ?? null;
}

function createProfileBaseline(searchParams: URLSearchParams): DroneProfile {
  const rawModelId = readTrimmedParam(searchParams, ["modelId"]);
  const hasOverrides = hasManualAircraftOverrides(searchParams);

  if (rawModelId) {
    if (isCatalogModelId(rawModelId)) {
      return createProfileFromCatalog(rawModelId);
    }

    return {
      ...DEFAULT_CUSTOM_PROFILE,
      modelId: rawModelId,
    };
  }

  if (hasOverrides) {
    return {
      ...DEFAULT_CUSTOM_PROFILE,
    };
  }

  return createProfileFromCatalog();
}

export function buildProfileFromSearchParams(
  searchParams: URLSearchParams,
): DroneProfile {
  const profile = createProfileBaseline(searchParams);
  const operationPurpose = readTrimmedParam(searchParams, ["operationPurpose"]);

  return {
    ...profile,
    modelId: readTrimmedParam(searchParams, ["modelId"]) ?? profile.modelId,
    manufacturer:
      readTrimmedParam(searchParams, ["manufacturer"]) ?? profile.manufacturer,
    modelName: readTrimmedParam(searchParams, ["modelName"]) ?? profile.modelName,
    weightGrams:
      readPositiveNumberParam(searchParams, ["weightGrams"]) ?? profile.weightGrams,
    classLabel: readTrimmedParam(searchParams, ["classLabel"]) ?? profile.classLabel,
    category: readTrimmedParam(searchParams, ["category"]) ?? profile.category,
    operationPurpose:
      operationPurpose === "business"
        ? "business"
        : operationPurpose === "recreational"
          ? "recreational"
          : profile.operationPurpose,
    licenses: parseLicenses(searchParams.get("licenses")),
    operatorCountry:
      readTrimmedParam(searchParams, ["operatorCountry"]) ?? profile.operatorCountry,
  };
}

function readCoordinate(
  searchParams: URLSearchParams,
  keys: string[],
): number | undefined {
  return readFiniteNumberParam(searchParams, keys);
}

function readPlaceQuery(searchParams: URLSearchParams): string | undefined {
  const value = readTrimmedParam(searchParams, [
    "place",
    "location",
    "query",
    "q",
    "address",
  ]);

  if (!value) {
    return undefined;
  }

  return value.slice(0, MAX_PLACE_QUERY_LENGTH);
}

function hasValidCoordinates(latitude: number, longitude: number) {
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export async function resolveLocationContext(
  searchParams: URLSearchParams,
): Promise<LocationResolutionResult> {
  const explicitCountry = readTrimmedParam(searchParams, ["country"])?.toUpperCase();
  const placeQuery = readPlaceQuery(searchParams);
  const latitude = readCoordinate(searchParams, ["lat", "latitude"]);
  const longitude = readCoordinate(searchParams, ["lng", "lon", "longitude"]);

  if (latitude === undefined || longitude === undefined) {
    if (!placeQuery) {
      return {
        ok: false,
        status: 400,
        error: "lat/lng or a place query is required.",
      };
    }

    let resolvedPlace: NominatimSearchResult | null;

    try {
      resolvedPlace = await geocodePlace(placeQuery);
    } catch {
      return {
        ok: false,
        status: 502,
        error: "Location search is temporarily unavailable.",
      };
    }

    if (!resolvedPlace?.lat || !resolvedPlace?.lon) {
      return {
        ok: false,
        status: 404,
        error: "The requested place could not be resolved to coordinates.",
      };
    }

    const resolvedLatitude = Number(resolvedPlace.lat);
    const resolvedLongitude = Number(resolvedPlace.lon);

    if (
      !Number.isFinite(resolvedLatitude) ||
      !Number.isFinite(resolvedLongitude) ||
      !hasValidCoordinates(resolvedLatitude, resolvedLongitude)
    ) {
      return {
        ok: false,
        status: 404,
        error: "The requested place could not be resolved to coordinates.",
      };
    }

    const reversePayload = await reverseGeocodeLocation(
      resolvedLatitude,
      resolvedLongitude,
    );
    const countryCode = (
      explicitCountry ||
      resolvedPlace.address?.country_code ||
      reversePayload?.address?.country_code ||
      ""
    ).toUpperCase();
    const countryName =
      reversePayload?.address?.country ||
      resolvedPlace.address?.country ||
      countryCode ||
      "Unknown area";

    return {
      ok: true,
      location: {
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        countryCode,
        countryName,
        locationLabel: buildLabel(
          countryName,
          resolvedPlace.address ?? reversePayload?.address,
          placeQuery,
          resolvedPlace.display_name ?? reversePayload?.display_name,
        ),
      },
    };
  }

  if (!hasValidCoordinates(latitude, longitude)) {
    return {
      ok: false,
      status: 400,
      error: "lat/lng must be valid geographic coordinates.",
    };
  }

  const reversePayload = await reverseGeocodeLocation(latitude, longitude);
  const countryCode = (
    explicitCountry ||
    reversePayload?.address?.country_code ||
    ""
  ).toUpperCase();
  const countryName =
    reversePayload?.address?.country || countryCode || "Unknown area";

  return {
    ok: true,
    location: {
      latitude,
      longitude,
      countryCode,
      countryName,
      locationLabel: buildLabel(
        countryName,
        reversePayload?.address,
        placeQuery,
        reversePayload?.display_name,
      ),
    },
  };
}
