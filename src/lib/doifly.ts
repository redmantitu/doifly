import { DRONE_CATALOG } from "@/lib/drone-catalog";

export const FREE_FORECAST_HOURS = 120;
export const MAX_FORECAST_HOURS = 120;

export type AssessmentStatus =
  | "safe"
  | "caution"
  | "do_not_fly"
  | "limited_data";

export type AssessmentConfidence = "high" | "medium" | "limited";

export type AssessmentMode = "personalized" | "generic";

export type LocationPermissionState = "unknown" | "granted" | "denied";
export type StorageConsentState = "unknown" | "accepted" | "declined";
export type OperationPurpose = "recreational" | "business";

const DEFAULT_CUSTOM_PROFILE = {
  manufacturer: "Custom",
  modelName: "",
  weightGrams: 250,
  classLabel: "C0",
  category: "Open",
} as const;

export interface UserConsentState {
  locationPermission: LocationPermissionState;
  storageConsent: StorageConsentState;
}

export interface DroneProfile {
  modelId: string;
  manufacturer: string;
  modelName: string;
  weightGrams: number;
  classLabel: string;
  category: string;
  operationPurpose: OperationPurpose;
  licenses: string[];
  operatorCountry: string;
}

export interface CurrentWeather {
  temperatureC: number;
  windSpeedKph: number;
  windDirectionDeg: number;
  windDirectionLabel: string;
  gustKph: number;
}

export interface ForecastPoint {
  time: string;
  temperatureC: number;
  windSpeedKph: number;
  windDirectionDeg: number;
  windDirectionLabel: string;
  gustKph: number;
  status: AssessmentStatus;
}

export interface RegulatorySummary {
  countryCode: string;
  countryName: string;
  summary: string;
  requiredCredentials: string[];
  missingCredentials: string[];
  localAirspaceStatus: "not_checked" | "country_level_only";
}

export interface GenericAdvisoryCard {
  id: string;
  title: string;
  subtitle: string;
  status: AssessmentStatus;
  summary: string;
}

export interface FlightAssessment {
  status: AssessmentStatus;
  headline: string;
  reasons: string[];
  warnings: string[];
  mode: AssessmentMode;
  forecastHours: number;
  confidence: AssessmentConfidence;
  weather?: {
    current: CurrentWeather;
    forecast: ForecastPoint[];
  };
  regulatory?: RegulatorySummary;
  genericCards?: GenericAdvisoryCard[];
  locationLabel?: string;
  sources: string[];
  updatedAt: string;
}

export interface ScheduledFlightAssessment {
  status: AssessmentStatus;
  headline: string;
  reasons: string[];
  warnings: string[];
  confidence: AssessmentConfidence;
  locationLabel: string;
  scheduledFor: string;
  forecastFor: string;
  weather?: CurrentWeather;
  regulatory?: RegulatorySummary;
  sources: string[];
  updatedAt: string;
}

const WIND_DIRECTIONS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

const EEA_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IS",
  "IE",
  "IT",
  "LV",
  "LI",
  "LT",
  "LU",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
]);

function clampStatus(
  statuses: AssessmentStatus[],
  fallback: AssessmentStatus = "limited_data",
): AssessmentStatus {
  if (statuses.includes("do_not_fly")) {
    return "do_not_fly";
  }

  if (statuses.includes("limited_data")) {
    return "limited_data";
  }

  if (statuses.includes("caution")) {
    return "caution";
  }

  if (statuses.includes("safe")) {
    return "safe";
  }

  return fallback;
}

export function directionToLabel(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return WIND_DIRECTIONS[index];
}

export function createProfileFromCatalog(
  modelId = DRONE_CATALOG[0].modelId,
): DroneProfile {
  const entry = DRONE_CATALOG.find((candidate) => candidate.modelId === modelId);

  if (!entry) {
    return {
      modelId,
      manufacturer: DEFAULT_CUSTOM_PROFILE.manufacturer,
      modelName: DEFAULT_CUSTOM_PROFILE.modelName,
      weightGrams: DEFAULT_CUSTOM_PROFILE.weightGrams,
      classLabel: DEFAULT_CUSTOM_PROFILE.classLabel,
      category: DEFAULT_CUSTOM_PROFILE.category,
      operationPurpose: "recreational",
      licenses: [],
      operatorCountry: "",
    };
  }

  return {
    modelId: entry.modelId,
    manufacturer: entry.manufacturer,
    modelName: entry.modelName,
    weightGrams: entry.weightGrams,
    classLabel: entry.classLabel,
    category: entry.category,
    operationPurpose: "recreational",
    licenses: [],
    operatorCountry: "",
  };
}

export function mergeProfileFromCatalog(
  profile: DroneProfile,
  modelId: string,
): DroneProfile {
  const entry = DRONE_CATALOG.find((candidate) => candidate.modelId === modelId);

  if (!entry) {
    return {
      ...profile,
      modelId,
    };
  }

  return {
    ...profile,
    modelId: entry.modelId,
    manufacturer: entry.manufacturer,
    modelName: entry.modelName,
    weightGrams: entry.weightGrams,
    classLabel: entry.classLabel,
    category: entry.category,
  };
}

interface WindAssessmentBands {
  comfortKph: number;
  cautionKph: number;
  method: "official_numeric" | "official_label_only" | "heuristic";
  officialLabel?: string;
  sourceName?: string;
  sourceUrl?: string;
  note?: string;
}

function getHeuristicWindBands(weightGrams: number) {
  if (weightGrams <= 249) {
    return { safe: 22, caution: 32 };
  }

  if (weightGrams <= 900) {
    return { safe: 18, caution: 28 };
  }

  return { safe: 14, caution: 22 };
}

function metersPerSecondToKph(value: number) {
  return Math.round(value * 3.6 * 10) / 10;
}

function getWindAssessmentBands(profile: DroneProfile): WindAssessmentBands {
  const catalogEntry = DRONE_CATALOG.find((entry) => entry.modelId === profile.modelId);
  const heuristicBands = getHeuristicWindBands(profile.weightGrams);
  const officialWindRating = catalogEntry?.officialWindRating;

  if (officialWindRating?.maxWindResistanceMs) {
    const cautionKph = Math.round(metersPerSecondToKph(officialWindRating.maxWindResistanceMs));

    return {
      comfortKph: Math.max(12, Math.round(cautionKph * 0.75)),
      cautionKph,
      method: "official_numeric",
      officialLabel: officialWindRating.label,
      sourceName: officialWindRating.sourceName,
      sourceUrl: officialWindRating.sourceUrl,
      note: officialWindRating.note,
    };
  }

  if (officialWindRating) {
    return {
      comfortKph: heuristicBands.safe,
      cautionKph: heuristicBands.caution,
      method: "official_label_only",
      officialLabel: officialWindRating.label,
      sourceName: officialWindRating.sourceName,
      sourceUrl: officialWindRating.sourceUrl,
      note: officialWindRating.note,
    };
  }

  return {
    comfortKph: heuristicBands.safe,
    cautionKph: heuristicBands.caution,
    method: "heuristic",
  };
}

function assessWeatherStatus(
  bands: WindAssessmentBands,
  windSpeedKph: number,
  gustKph: number,
  temperatureC: number,
): AssessmentStatus {
  if (gustKph >= bands.cautionKph + 4 || windSpeedKph > bands.cautionKph) {
    return "do_not_fly";
  }

  if (temperatureC <= -8) {
    return "do_not_fly";
  }

  if (
    gustKph >= bands.comfortKph + 6 ||
    windSpeedKph > bands.comfortKph ||
    temperatureC < 0
  ) {
    return "caution";
  }

  return "safe";
}

function getRequiredCredentials(
  profile: DroneProfile,
  countryCode: string,
): { summary: string; requiredCredentials: string[] } {
  if (countryCode === "US") {
    if (profile.operationPurpose === "business") {
      return {
        summary:
          "Business operations in the United States typically require a Part 107 certificate and registration when applicable.",
        requiredCredentials: ["part107"],
      };
    }

    const credentials = ["trust"];
    if (profile.weightGrams >= 250) {
      credentials.push("faa-registration");
    }

    return {
      summary:
        "Recreational U.S. flights generally require TRUST, and drones at or above 250 g usually need FAA registration.",
      requiredCredentials: credentials,
    };
  }

  if (countryCode === "GB") {
    const credentials =
      profile.weightGrams < 250
        ? ["uk-operator-id"]
        : ["uk-operator-id", "uk-flyer-id"];

    return {
      summary:
        "UK flights usually require an Operator ID, and heavier drones typically also need a Flyer ID before flying.",
      requiredCredentials: credentials,
    };
  }

  if (EEA_COUNTRIES.has(countryCode)) {
    const credentials =
      profile.weightGrams < 250
        ? []
        : profile.weightGrams < 900
          ? ["a1-a3"]
          : ["a2"];

    return {
      summary:
        "EU and EEA open-category flights often require operator registration and A1/A3 or A2 competency depending on weight and class.",
      requiredCredentials: credentials,
    };
  }

  return {
    summary:
      "Do.I.Fly? does not yet have a complete rule pack for this country, so this is advisory only.",
    requiredCredentials: [],
  };
}

function assessRegulatoryStatus(
  profile: DroneProfile,
  countryCode: string,
  countryName: string,
): RegulatorySummary & { status: AssessmentStatus } {
  const supported =
    EEA_COUNTRIES.has(countryCode) || countryCode === "GB" || countryCode === "US";
  const pack = getRequiredCredentials(profile, countryCode);
  const missingCredentials = pack.requiredCredentials.filter(
    (credential) => !profile.licenses.includes(credential),
  );

  if (!supported) {
    return {
      countryCode,
      countryName,
      summary: pack.summary,
      requiredCredentials: [],
      missingCredentials: [],
      localAirspaceStatus: "country_level_only",
      status: "limited_data",
    };
  }

  if (missingCredentials.length > 0) {
    return {
      countryCode,
      countryName,
      summary: pack.summary,
      requiredCredentials: pack.requiredCredentials,
      missingCredentials,
      localAirspaceStatus: "not_checked",
      status: "do_not_fly",
    };
  }

  return {
    countryCode,
    countryName,
    summary: pack.summary,
    requiredCredentials: pack.requiredCredentials,
    missingCredentials,
    localAirspaceStatus: "not_checked",
    status: profile.weightGrams >= 900 ? "caution" : "safe",
  };
}

function calculateConfidence(input: {
  mode: AssessmentMode;
  regulatory: RegulatorySummary;
  windMethod: "official_numeric" | "official_label_only" | "heuristic";
  isForecastOnly?: boolean;
}): AssessmentConfidence {
  if (
    input.mode === "generic" ||
    input.regulatory.localAirspaceStatus === "country_level_only"
  ) {
    return "limited";
  }

  let score = 1;

  if (input.windMethod === "official_numeric") {
    score += 2;
  } else {
    score += 1;
  }

  if (!input.isForecastOnly) {
    score += 1;
  }

  return score >= 4 ? "high" : "medium";
}

export function getGenericCards(
  currentWeather?: CurrentWeather,
): GenericAdvisoryCard[] {
  const currentWind = currentWeather?.windSpeedKph ?? 0;
  const currentGust = currentWeather?.gustKph ?? currentWind;
  const currentTemperature = currentWeather?.temperatureC ?? 8;

  const evaluate = (weightGrams: number) => {
    if (!currentWeather) {
      return "limited_data";
    }

    const heuristicBands = getHeuristicWindBands(weightGrams);

    return assessWeatherStatus(
      {
        comfortKph: heuristicBands.safe,
        cautionKph: heuristicBands.caution,
        method: "heuristic",
      },
      currentWind,
      currentGust,
      currentTemperature,
    );
  };

  return [
    {
      id: "mini-class",
      title: "DJI Mini class",
      subtitle: "Light sub-250 g drones",
      status: evaluate(249),
      summary: currentWeather
        ? "Light drones tolerate more wind, but precise legality and nearby airspace still need checking."
        : "Usually best in calmer conditions, but this app cannot verify your local wind or restrictions without location.",
    },
    {
      id: "air-class",
      title: "DJI Air / Mavic Air class",
      subtitle: "Mid-weight consumer drones",
      status: evaluate(720),
      summary: currentWeather
        ? "A balanced class for moderate wind, but gusts can quickly push this into caution territory."
        : "Often suitable only in moderate conditions; this view is generic and not location-verified.",
    },
    {
      id: "prosumer-class",
      title: "Heavier prosumer class",
      subtitle: "Mavic 3 / Inspire style aircraft",
      status: evaluate(1300),
      summary: currentWeather
        ? "Heavier rigs can be powerful, but they still need stricter wind discipline and verified permissions."
        : "Expect tighter operational limits, and never treat this generic card as legal clearance to fly.",
    },
  ];
}

export function evaluateAssessment(input: {
  profile: DroneProfile;
  mode: AssessmentMode;
  currentWeather: CurrentWeather;
  forecast: Omit<ForecastPoint, "status">[];
  forecastHours: number;
  countryCode: string;
  countryName: string;
  locationLabel: string;
  sources?: string[];
}): FlightAssessment {
  const windAssessmentBands = getWindAssessmentBands(input.profile);
  const regulatory = assessRegulatoryStatus(
    input.profile,
    input.countryCode,
    input.countryName,
  );

  const currentWeatherStatus = assessWeatherStatus(
    windAssessmentBands,
    input.currentWeather.windSpeedKph,
    input.currentWeather.gustKph,
    input.currentWeather.temperatureC,
  );

  const forecast = input.forecast.map((point) => ({
    ...point,
    status: assessWeatherStatus(
      windAssessmentBands,
      point.windSpeedKph,
      point.gustKph,
      point.temperatureC,
    ),
  }));

  const forecastStatus = clampStatus(forecast.map((point) => point.status), "safe");
  const computedStatus =
    input.mode === "generic"
      ? "limited_data"
      : clampStatus([currentWeatherStatus, forecastStatus, regulatory.status], "caution");

  const reasons = [
    `${input.profile.modelName} is assessed in ${input.countryName} using a ${input.forecastHours}-hour forecast window.`,
    `Current wind is ${Math.round(input.currentWeather.windSpeedKph)} km/h from ${input.currentWeather.windDirectionLabel}.`,
  ];

  if (windAssessmentBands.method === "official_numeric") {
    reasons.push(
      `Manufacturer wind rating on file: ${windAssessmentBands.officialLabel}. Do.I.Fly? treats about ${windAssessmentBands.comfortKph} km/h as the comfort band and ${windAssessmentBands.cautionKph} km/h as the steady-wind ceiling for this model.`,
    );
  } else if (windAssessmentBands.method === "official_label_only") {
    reasons.push(
      `Manufacturer wind guidance on file: ${windAssessmentBands.officialLabel}. Because the source is a class or range rather than one exact numeric ceiling, Do.I.Fly? still falls back to its conservative ${windAssessmentBands.comfortKph} to ${windAssessmentBands.cautionKph} km/h advisory band for the verdict.`,
    );
  } else {
    reasons.push(
      `No official manufacturer wind rating is stored for this model, so Do.I.Fly? is using a conservative weight-based band of ${windAssessmentBands.comfortKph} to ${windAssessmentBands.cautionKph} km/h.`,
    );
  }

  if (regulatory.requiredCredentials.length > 0) {
    reasons.push(
      `Required credentials checked: ${regulatory.requiredCredentials.join(", ")}.`,
    );
  }

  const warnings = [
    "Nearby controlled airspace is not yet cross-checked in this build.",
  ];

  if (regulatory.missingCredentials.length > 0) {
    warnings.push(
      `Missing credentials: ${regulatory.missingCredentials.join(", ")}.`,
    );
  }

  if (forecastStatus === "do_not_fly") {
    warnings.push(
      `One or more forecast points in the next ${input.forecastHours} hours exceed this drone's wind comfort band.`,
    );
  }

  if (windAssessmentBands.note) {
    warnings.push(windAssessmentBands.note);
  }

  return {
    status: computedStatus,
    headline:
      computedStatus === "safe"
        ? "Weather and profile look workable right now."
        : computedStatus === "caution"
          ? "Fly only with extra care and a final local check."
          : computedStatus === "do_not_fly"
            ? "This setup should stay grounded for now."
            : "There is not enough verified data to clear this flight.",
    reasons,
    warnings,
    mode: input.mode,
    forecastHours: input.forecastHours,
    confidence: calculateConfidence({
      mode: input.mode,
      regulatory,
      windMethod: windAssessmentBands.method,
    }),
    weather: {
      current: input.currentWeather,
      forecast,
    },
    regulatory,
    genericCards:
      input.mode === "generic" ? getGenericCards(input.currentWeather) : undefined,
    locationLabel: input.locationLabel,
    sources: [
      ...(input.sources ?? []),
      "OpenStreetMap Nominatim reverse geocoding",
      "Encoded advisory rule packs for EU/EEA, UK, and US",
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function evaluateScheduledFlight(input: {
  profile: DroneProfile;
  mode: AssessmentMode;
  scheduledFor: string;
  forecastFor: string;
  weather: CurrentWeather;
  countryCode: string;
  countryName: string;
  locationLabel: string;
  sources?: string[];
}): ScheduledFlightAssessment {
  const windAssessmentBands = getWindAssessmentBands(input.profile);
  const regulatory = assessRegulatoryStatus(
    input.profile,
    input.countryCode,
    input.countryName,
  );
  const weatherStatus = assessWeatherStatus(
    windAssessmentBands,
    input.weather.windSpeedKph,
    input.weather.gustKph,
    input.weather.temperatureC,
  );
  const computedStatus =
    input.mode === "generic"
      ? "limited_data"
      : clampStatus([weatherStatus, regulatory.status], "caution");

  const reasons = [
    `${input.profile.modelName} is scheduled for ${new Date(input.scheduledFor).toLocaleString()}.`,
    `Nearest forecast hour is ${new Date(input.forecastFor).toLocaleString()} for ${input.locationLabel}.`,
    `Expected wind is ${Math.round(input.weather.windSpeedKph)} km/h from ${input.weather.windDirectionLabel}, with gusts up to ${Math.round(input.weather.gustKph)} km/h.`,
  ];

  if (windAssessmentBands.method === "official_numeric") {
    reasons.push(
      `Manufacturer wind rating on file: ${windAssessmentBands.officialLabel}. Do.I.Fly? treats about ${windAssessmentBands.comfortKph} km/h as the comfort band and ${windAssessmentBands.cautionKph} km/h as the steady-wind ceiling for this model.`,
    );
  } else if (windAssessmentBands.method === "official_label_only") {
    reasons.push(
      `Manufacturer wind guidance on file: ${windAssessmentBands.officialLabel}. Because the source is a class or range rather than one exact numeric ceiling, Do.I.Fly? still falls back to its conservative ${windAssessmentBands.comfortKph} to ${windAssessmentBands.cautionKph} km/h advisory band for the verdict.`,
    );
  } else {
    reasons.push(
      `No official manufacturer wind rating is stored for this model, so Do.I.Fly? is using a conservative weight-based band of ${windAssessmentBands.comfortKph} to ${windAssessmentBands.cautionKph} km/h.`,
    );
  }

  const warnings = [
    "Nearby controlled airspace is not yet cross-checked in this build.",
    "Scheduled-flight reports are forecast-based and can change before takeoff.",
  ];

  if (regulatory.missingCredentials.length > 0) {
    warnings.push(`Missing credentials: ${regulatory.missingCredentials.join(", ")}.`);
  }

  if (windAssessmentBands.note) {
    warnings.push(windAssessmentBands.note);
  }

  return {
    status: computedStatus,
    headline:
      computedStatus === "safe"
        ? "Forecast looks workable for this scheduled flight."
        : computedStatus === "caution"
          ? "Keep this flight tentative and review closer to takeoff."
          : computedStatus === "do_not_fly"
            ? "This scheduled flight looks grounded under the current forecast."
            : "There is not enough verified data to clear this scheduled flight.",
    reasons,
    warnings,
    confidence: calculateConfidence({
      mode: input.mode,
      regulatory,
      windMethod: windAssessmentBands.method,
      isForecastOnly: true,
    }),
    locationLabel: input.locationLabel,
    scheduledFor: input.scheduledFor,
    forecastFor: input.forecastFor,
    weather: input.weather,
    regulatory,
    sources: [
      ...(input.sources ?? []),
      "OpenStreetMap Nominatim reverse geocoding",
      "Encoded advisory rule packs for EU/EEA, UK, and US",
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function parseLicenses(rawValue: string | null): string[] {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
