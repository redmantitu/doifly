"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import styles from "./doifly-app.module.css";
import { DRONE_CATALOG, type DroneClassLabel } from "@/lib/drone-catalog";
import {
  type AssessmentConfidence,
  FREE_FORECAST_HOURS,
  createProfileFromCatalog,
  getGenericCards,
  mergeProfileFromCatalog,
  type DroneProfile,
  type FlightAssessment,
  type GenericAdvisoryCard,
  type OperationPurpose,
  type ScheduledFlightAssessment,
  type UserConsentState,
} from "@/lib/doifly";
import { WindCanvas } from "./wind-canvas";
import {
  clearRememberedUsername,
  getRememberedUsername,
  hashUsername,
  loadSession,
  rememberUsername,
  saveProfile,
  signIn,
  signOut,
  signUp,
  type AppSessionUser,
} from "@/lib/supabase-client";

const CUSTOM_DRONE_MODEL_ID = "custom-other";
const CUSTOM_CATEGORY_OPTIONS = ["Open", "Specific", "Certified", "Other"] as const;
const DRONE_CLASS_OPTIONS: DroneClassLabel[] = ["C0", "C1", "C2", "C3", "C4", "C5", "C6"];
const FORECAST_WINDOW_DAYS = Math.max(1, Math.round(FREE_FORECAST_HOURS / 24));
const MAX_SCHEDULE_AHEAD_DAYS = 365;
const LOCATION_REQUEST_TIMEOUT_MS = 26000;
const AUTO_REFRESH_DEBOUNCE_MS = 4000;
const SCHEDULE_REMINDER_OPTIONS = [
  { label: "No reminder", value: 0 },
  { label: "30 minutes before", value: 30 },
  { label: "2 hours before", value: 120 },
  { label: "6 hours before", value: 360 },
  { label: "1 day before", value: 1440 },
  { label: "3 days before", value: 4320 },
  { label: "7 days before", value: 10080 },
] as const;

interface LicenseOption {
  value: string;
  label: string;
  region: string;
  validFor: string;
  purpose: string;
  description: string;
}

const LICENSE_OPTIONS = [
  {
    value: "trust",
    label: "FAA TRUST",
    region: "United States",
    validFor: "Recreational flights",
    purpose: "Pilot competency",
    description:
      "The Recreational UAS Safety Test is the baseline proof of knowledge for U.S. recreational drone pilots.",
  },
  {
    value: "faa-registration",
    label: "FAA Registration",
    region: "United States",
    validFor: "Registered aircraft and operators",
    purpose: "Aircraft registration",
    description:
      "Used when the aircraft must be registered with the FAA, especially for heavier drones and most non-recreational operations.",
  },
  {
    value: "part107",
    label: "FAA Part 107",
    region: "United States",
    validFor: "Business and other non-recreational flights",
    purpose: "Remote pilot certificate",
    description:
      "Required for most commercial or non-recreational drone work in the U.S. under FAA Part 107 rules.",
  },
  {
    value: "a1-a3",
    label: "EASA A1/A3",
    region: "EU / EEA",
    validFor: "Open category operations",
    purpose: "Pilot competency",
    description:
      "The baseline EU remote pilot competency for open-category flying, especially common for C0, C1, and general A3 operations.",
  },
  {
    value: "a2",
    label: "EASA A2",
    region: "EU / EEA",
    validFor: "Closer-to-people open-category flights",
    purpose: "Additional competency",
    description:
      "An extra EU competency that expands what you can do in the open category, especially for certain C2 operations.",
  },
  {
    value: "uk-operator-id",
    label: "UK Operator ID",
    region: "United Kingdom",
    validFor: "Aircraft/operator registration",
    purpose: "Operator registration",
    description:
      "The UK operator registration used to identify the person or organization responsible for the drone.",
  },
  {
    value: "uk-flyer-id",
    label: "UK Flyer ID",
    region: "United Kingdom",
    validFor: "Pilot competency",
    purpose: "Flyer competency",
    description:
      "The UK proof that the remote pilot passed the required basic knowledge test for eligible drone flights.",
  },
] satisfies LicenseOption[];

interface Coordinates {
  lat: number;
  lng: number;
}

interface ScheduledFlightPlan {
  id: string;
  title: string;
  scheduledAt: string;
  notifyOffsetMinutes: number;
  createdAt: string;
}

interface ScheduledFlightDraft {
  title: string;
  scheduledAt: string;
  notifyOffsetMinutes: number;
}

interface ScheduledFlightReportState {
  state: "idle" | "loading" | "ready" | "pending" | "error";
  report?: ScheduledFlightAssessment;
  error?: string;
}

interface LocationSearchResult {
  latitude: number;
  longitude: number;
  countryCode: string;
  countryName: string;
  locationLabel: string;
}

interface ApproximateLocationResult {
  latitude: number;
  longitude: number;
  countryCode: string;
  countryName: string;
  locationLabel: string;
}

type LocationSource = "device" | "manual" | "approximate";
type LocationCapability = "available" | "unsupported" | "insecure_origin";
type LocationIssueKind =
  | "none"
  | "browser_denied"
  | "insecure_context"
  | "timeout"
  | "unavailable"
  | "unsupported"
  | "prompt_blocked";

interface LocationIssueState {
  kind: LocationIssueKind;
  message: string;
}

type VisualMode = "night" | "day";

type BrowserFamily =
  | "chrome"
  | "edge"
  | "firefox"
  | "safari"
  | "opera"
  | "samsung"
  | "unknown";

type PlatformFamily = "ios" | "android" | "macos" | "windows" | "linux" | "unknown";

interface BrowserProfile {
  browserFamily: BrowserFamily;
  platformFamily: PlatformFamily;
  browserLabel: string;
}

function formatStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function formatConfidenceLabel(confidence: AssessmentConfidence | undefined) {
  if (confidence === "high") {
    return "High";
  }

  if (confidence === "medium") {
    return "Medium";
  }

  return "Limited";
}

const CONFIDENCE_LEGEND: Array<{
  key: AssessmentConfidence;
  label: string;
  description: string;
}> = [
  {
    key: "high",
    label: "High",
    description:
      "Personalized check with a supported country rule pack, current weather, and an official numeric wind rating for the selected drone.",
  },
  {
    key: "medium",
    label: "Medium",
    description:
      "Personalized check with a supported country rule pack, but the wind limits are based on class guidance or conservative heuristics, or the result is forecast-based rather than current.",
  },
  {
    key: "limited",
    label: "Limited",
    description:
      "Generic mode or country-level-only rule coverage. Useful for orientation, but not enough to treat as a verified go decision.",
  },
];

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatForecastDayLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatForecastDayTabLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getForecastDayKey(value: string) {
  const date = new Date(value);

  return Number.isFinite(date.getTime())
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`
    : value.slice(0, 10);
}

function formatAircraftSearchLabel(
  entry: (typeof DRONE_CATALOG)[number],
) {
  return `${entry.modelName} · ${entry.manufacturer} · ${entry.classLabel}`;
}

function formatOfficialWindRating(
  entry: (typeof DRONE_CATALOG)[number],
) {
  const rating = entry.officialWindRating;

  if (!rating) {
    return "Conservative fallback";
  }

  if (typeof rating.maxWindResistanceMs === "number") {
    const kph = Math.round(rating.maxWindResistanceMs * 3.6);
    return `${rating.label} · ${kph} km/h`;
  }

  return rating.label;
}

function LocationIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s6-4.8 6-11a6 6 0 1 0-12 0c0 6.2 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function BrandIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 160"
      width="64"
      height="64"
      fill="none"
    >
      <defs>
        <linearGradient id="doifly-brand-ring" x1="28" y1="28" x2="130" y2="132">
          <stop offset="0%" stopColor="#84E3DA" />
          <stop offset="100%" stopColor="#4CA8FF" />
        </linearGradient>
      </defs>
      <circle cx="80" cy="80" r="72" fill="rgba(8,17,28,0.86)" />
      <circle
        cx="80"
        cy="80"
        r="71"
        stroke="url(#doifly-brand-ring)"
        strokeOpacity="0.32"
        strokeWidth="2"
      />
      <path
        d="M28 74C42 62 58 58 74 61C89 64 101 74 116 75C126 76 135 73 142 68"
        stroke="#84E3DA"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M22 92C36 82 53 78 70 81C86 84 99 93 115 95C124 96 132 94 138 90"
        stroke="#4CA8FF"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M52 56L68 68M108 56L92 68M52 104L68 92M108 104L92 92"
        stroke="#DDF8FF"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <rect x="62" y="68" width="36" height="24" rx="11" fill="#DDF8FF" />
      <circle cx="80" cy="80" r="6" fill="#16324A" />
      <circle cx="46" cy="50" r="12" stroke="#DDF8FF" strokeWidth="5" />
      <circle cx="114" cy="50" r="12" stroke="#DDF8FF" strokeWidth="5" />
      <circle cx="46" cy="110" r="12" stroke="#DDF8FF" strokeWidth="5" />
      <circle cx="114" cy="110" r="12" stroke="#DDF8FF" strokeWidth="5" />
      <path
        d="M94 43C102 39 111 39 118 43M94 117C102 121 111 121 118 117"
        stroke="#84E3DA"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function heroSupportCopy(
  coords: Coordinates | null,
  locationSource: LocationSource | null,
  locationIssue: LocationIssueState,
  locationLabel: string,
) {
  if (coords && locationSource === "approximate") {
    return `Using approximate network location (${locationLabel}) for wind and local checks.`;
  }

  if (coords && locationSource === "manual") {
    return `Using ${locationLabel} as a custom location for live wind and local checks.`;
  }

  if (coords) {
    return `Using ${locationLabel} for live wind and local checks.`;
  }

  if (locationIssue.kind !== "none") {
    return locationIssue.message;
  }

  return "Use device location or enter a custom place for local wind, weather, and rule checks.";
}

function getLocationSourceTitle(
  coords: Coordinates | null,
  locationSource: LocationSource | null,
) {
  if (!coords) {
    return "No location selected";
  }

  if (locationSource === "manual") {
    return "Manual location";
  }

  if (locationSource === "approximate") {
    return "Approximate network/IP location";
  }

  return "Device location";
}

function getLocationSourceDescription(
  coords: Coordinates | null,
  locationSource: LocationSource | null,
  locationIssue: LocationIssueState,
  locationLabel: string,
) {
  if (!coords) {
    return locationIssue.kind !== "none"
      ? locationIssue.message
      : "No active location source yet. The app stays generic until you use device location or set a place manually.";
  }

  if (locationSource === "manual") {
    return `Using the place you selected manually: ${locationLabel}.`;
  }

  if (locationSource === "approximate") {
    return `Using approximate network/IP location for ${locationLabel} because precise device location is unavailable.`;
  }

  return `Using browser-reported device location for ${locationLabel}.`;
}

function detectBrowserProfile(): BrowserProfile {
  if (typeof window === "undefined") {
    return {
      browserFamily: "unknown",
      platformFamily: "unknown",
      browserLabel: "this browser",
    };
  }

  const userAgent = window.navigator.userAgent;
  const ua = userAgent.toLowerCase();

  const platformFamily: PlatformFamily = /iphone|ipad|ipod/.test(ua)
    ? "ios"
    : /android/.test(ua)
      ? "android"
      : /macintosh|mac os x/.test(ua)
        ? "macos"
        : /windows/.test(ua)
          ? "windows"
          : /linux/.test(ua)
            ? "linux"
            : "unknown";

  const browserFamily: BrowserFamily = /edg\//.test(ua)
    ? "edge"
    : /opr\/|opera/.test(ua)
      ? "opera"
      : /samsungbrowser/.test(ua)
        ? "samsung"
        : /firefox|fxios/.test(ua)
          ? "firefox"
          : /crios|chrome|chromium/.test(ua)
            ? "chrome"
            : /safari/.test(ua)
              ? "safari"
              : "unknown";

  const browserLabel =
    browserFamily === "edge"
      ? "Microsoft Edge"
      : browserFamily === "opera"
        ? "Opera"
        : browserFamily === "samsung"
          ? "Samsung Internet"
          : browserFamily === "firefox"
            ? "Firefox"
            : browserFamily === "chrome"
              ? "Chrome"
              : browserFamily === "safari"
                ? "Safari"
                : "this browser";

  return {
    browserFamily,
    platformFamily,
    browserLabel,
  };
}

function getLocationSettingsInstructions(profile: BrowserProfile) {
  if (profile.platformFamily === "ios") {
    return "On iPhone/iPad: open Settings -> Privacy & Security -> Location Services, allow location for your browser, then reopen this page.";
  }

  if (profile.browserFamily === "safari" && profile.platformFamily === "macos") {
    return "In Safari on macOS: Safari -> Settings for This Website -> Location -> Allow.";
  }

  if (profile.browserFamily === "firefox") {
    return "In Firefox: click the site info icon near the address bar, then set Location permission to Allow.";
  }

  return "Click the lock/location icon in the address bar, open site settings, and set Location to Allow.";
}

function getInstallGuide(profile: BrowserProfile) {
  if (profile.platformFamily === "ios" && profile.browserFamily === "safari") {
    return {
      title: "Install on iPhone or iPad",
      intro: "Safari can save this app to your Home Screen so it opens like a standalone app.",
      steps: [
        "Tap the Share button in Safari.",
        "Scroll down and tap Add to Home Screen.",
        "Tap Add to finish.",
      ],
    };
  }

  if (profile.platformFamily === "ios") {
    return {
      title: `Install from ${profile.browserLabel} on iPhone or iPad`,
      intro:
        "iPhone and iPad install flows work best through Safari, even if you opened the app in another browser.",
      steps: [
        "Open this page in Safari.",
        "Tap the Share button.",
        "Choose Add to Home Screen, then tap Add.",
      ],
    };
  }

  if (
    profile.platformFamily === "android" &&
    ["chrome", "edge", "opera", "samsung"].includes(profile.browserFamily)
  ) {
    return {
      title: `Install from ${profile.browserLabel}`,
      intro: "This browser can save the app to your device so it launches outside a normal tab.",
      steps: [
        "Open the browser menu.",
        "Choose Install app or Add to Home screen.",
        "Confirm the install when prompted.",
      ],
    };
  }

  if (profile.platformFamily === "android" && profile.browserFamily === "firefox") {
    return {
      title: "Add to Home Screen on Android",
      intro: "Firefox on Android usually offers a Home Screen shortcut rather than a full install prompt.",
      steps: [
        "Open the Firefox menu.",
        "Tap Add to Home screen.",
        "Confirm the shortcut name and add it.",
      ],
    };
  }

  if (
    ["macos", "windows", "linux"].includes(profile.platformFamily) &&
    ["chrome", "edge"].includes(profile.browserFamily)
  ) {
    return {
      title: `Install from ${profile.browserLabel}`,
      intro: "Desktop Chromium browsers can install this app as a separate windowed application.",
      steps: [
        "Open the browser menu.",
        "Choose Install Do.I.Fly? or Apps -> Install this site.",
        "Confirm the install in the dialog.",
      ],
    };
  }

  if (profile.platformFamily === "macos" && profile.browserFamily === "safari") {
    return {
      title: "Install from Safari on Mac",
      intro: "Safari can add this web app to your Dock so it launches like an app.",
      steps: [
        "Open the File menu in Safari.",
        "Choose Add to Dock.",
        "Confirm the app name and add it.",
      ],
    };
  }

  if (profile.browserFamily === "firefox") {
    return {
      title: `Install support in ${profile.browserLabel}`,
      intro:
        "Firefox has limited app-install support for this experience on desktop. A Chromium browser or Safari on Mac will give a more app-like install flow.",
      steps: [
        "If you want an installed app, open this page in Chrome, Edge, or Safari on Mac.",
        "Use that browser's Install app, Install this site, or Add to Dock option.",
        "Otherwise keep this page pinned for quick access.",
      ],
    };
  }

  return {
    title: `Install from ${profile.browserLabel}`,
    intro: "Most supported browsers expose install actions in the main browser menu.",
    steps: [
      "Open the browser menu.",
      "Look for Install app, Add to Home Screen, or a similar option.",
      "Confirm the install if your browser offers it.",
    ],
  };
}

function isPotentiallyTrustworthyDevHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("127.") ||
    hostname === "::1"
  );
}

function createLocationIssue(
  kind: LocationIssueKind,
  siteOrigin: string,
  browserProfile: BrowserProfile,
): LocationIssueState {
  if (kind === "insecure_context") {
    const secureContextHelp =
      browserProfile.platformFamily === "ios"
        ? "On iPhone/iPad, open this app on HTTPS or install it to the Home Screen."
        : "Open this app on HTTPS or localhost.";

    return {
      kind,
      message: `Device location in ${browserProfile.browserLabel} needs HTTPS, localhost, or an installed app. ${siteOrigin || "This address"} is not a secure context. ${secureContextHelp}`,
    };
  }

  if (kind === "unsupported") {
    return {
      kind,
      message: "This browser does not expose device geolocation. Enter a custom location instead.",
    };
  }

  if (kind === "browser_denied") {
    return {
      kind,
      message: `Device location is blocked in ${browserProfile.browserLabel}. ${getLocationSettingsInstructions(browserProfile)} After allowing, reload this page or use a custom location.`,
    };
  }

  if (kind === "timeout") {
    return {
      kind,
      message: "Device location timed out before the browser could finish the request. Try again or enter a custom location instead.",
    };
  }

  if (kind === "unavailable") {
    return {
      kind,
      message: "The browser could not get a usable location fix yet. Try again in a better signal area or enter a custom location instead.",
    };
  }

  if (kind === "prompt_blocked") {
    return {
      kind,
      message: `The location request was blocked before ${browserProfile.browserLabel} could show a permission prompt. Use HTTPS/localhost for ${siteOrigin || "this site"}, then try again.`,
    };
  }

  return {
    kind: "none",
    message: "",
  };
}

function getLocationCapability(): LocationCapability {
  if (typeof window === "undefined") {
    return "available";
  }

  if (!("geolocation" in navigator)) {
    return "unsupported";
  }

  if (
    !window.isSecureContext &&
    !isPotentiallyTrustworthyDevHost(window.location.hostname)
  ) {
    return "insecure_origin";
  }

  return "available";
}

function resolveLocationFailure(
  error: GeolocationPositionError | DOMException | Error | unknown,
  siteOrigin: string,
  browserProfile: BrowserProfile,
): LocationIssueState {
  if (getLocationCapability() === "insecure_origin") {
    return createLocationIssue("insecure_context", siteOrigin, browserProfile);
  }

  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "SecurityError"
  ) {
    return createLocationIssue("prompt_blocked", siteOrigin, browserProfile);
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as GeolocationPositionError).code === 1
  ) {
    return createLocationIssue("browser_denied", siteOrigin, browserProfile);
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as GeolocationPositionError).code === 2
  ) {
    return createLocationIssue("unavailable", siteOrigin, browserProfile);
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as GeolocationPositionError).code === 3
  ) {
    return createLocationIssue("timeout", siteOrigin, browserProfile);
  }

  return createLocationIssue("prompt_blocked", siteOrigin, browserProfile);
}

function getCurrentPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not available."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function loadAssessment(params: URLSearchParams) {
  const response = await fetch("/api/assessment", {
    cache: "no-store",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(Object.fromEntries(params.entries())),
  });

  if (!response.ok) {
    throw new Error("Could not load an updated assessment.");
  }

  return (await response.json()) as FlightAssessment;
}

async function loadScheduledFlightReport(params: URLSearchParams) {
  const response = await fetch("/api/scheduled-flight", {
    cache: "no-store",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(Object.fromEntries(params.entries())),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; code?: string }
      | null;
    const error = new Error(
      payload?.error ?? "Could not load the scheduled-flight report.",
    ) as Error & { code?: string };
    if (payload?.code) {
      error.code = payload.code;
      error.name = payload.code;
    }
    throw error;
  }

  return (await response.json()) as ScheduledFlightAssessment;
}

async function searchLocation(place: string) {
  const response = await fetch("/api/location-search", {
    cache: "no-store",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ place }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; location?: LocationSearchResult }
    | null;

  if (!response.ok || !payload?.location) {
    throw new Error(payload?.error ?? "That place could not be resolved yet.");
  }

  return payload.location;
}

async function loadApproximateLocation() {
  const response = await fetch("/api/ip-location", {
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; location?: ApproximateLocationResult }
    | null;

  if (!response.ok || !payload?.location) {
    throw new Error(payload?.error ?? "Approximate location is not available right now.");
  }

  return payload.location;
}

function createScheduledFlightId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `scheduled-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultScheduledAt() {
  const target = new Date(Date.now() + 2 * 60 * 60 * 1000);
  target.setMinutes(0, 0, 0);

  return formatDateTimeLocalValue(target);
}

function formatDateTimeLocalValue(value: Date) {
  const target = new Date(value);

  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  const hours = String(target.getHours()).padStart(2, "0");
  const minutes = String(target.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatScheduledDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function isScheduledReportApiError(value: unknown): value is Error & { code?: string } {
  return value instanceof Error;
}

function hasScheduledReportChanged(
  previous: ScheduledFlightAssessment | undefined,
  next: ScheduledFlightAssessment,
) {
  if (!previous) {
    return true;
  }

  return (
    previous.status !== next.status ||
    previous.forecastFor !== next.forecastFor ||
    Math.round(previous.weather?.windSpeedKph ?? 0) !==
      Math.round(next.weather?.windSpeedKph ?? 0) ||
    Math.round(previous.weather?.gustKph ?? 0) !== Math.round(next.weather?.gustKph ?? 0) ||
    Math.round(previous.weather?.temperatureC ?? 0) !==
      Math.round(next.weather?.temperatureC ?? 0)
  );
}

function normalizeStoredScheduledReports(
  value: unknown,
): Record<string, ScheduledFlightReportState> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const input = value as Record<string, unknown>;
  const next: Record<string, ScheduledFlightReportState> = {};

  for (const [flightId, rawState] of Object.entries(input)) {
    if (!rawState || typeof rawState !== "object") {
      continue;
    }

    const stateCandidate = rawState as ScheduledFlightReportState;
    if (stateCandidate.state !== "ready") {
      continue;
    }

    if (
      !stateCandidate.report ||
      typeof stateCandidate.report !== "object" ||
      typeof stateCandidate.report.updatedAt !== "string" ||
      typeof stateCandidate.report.forecastFor !== "string" ||
      typeof stateCandidate.report.status !== "string"
    ) {
      continue;
    }

    next[flightId] = {
      state: "ready",
      report: stateCandidate.report,
    };
  }

  return next;
}

function getPersistableScheduledReports(
  reports: Record<string, ScheduledFlightReportState>,
) {
  const next: Record<string, ScheduledFlightReportState> = {};

  for (const [flightId, reportState] of Object.entries(reports)) {
    if (reportState.state !== "ready" || !reportState.report) {
      continue;
    }

    next[flightId] = {
      state: "ready",
      report: reportState.report,
    };
  }

  return next;
}

function getLatestScheduledReportUpdateAt(
  reports: Record<string, ScheduledFlightReportState>,
  flightIds: Set<string>,
) {
  let latestTime = 0;

  for (const [flightId, reportState] of Object.entries(reports)) {
    if (!flightIds.has(flightId) || !reportState.report?.updatedAt) {
      continue;
    }

    const parsed = Date.parse(reportState.report.updatedAt);
    if (Number.isFinite(parsed) && parsed > latestTime) {
      latestTime = parsed;
    }
  }

  return latestTime > 0 ? new Date(latestTime).toISOString() : "";
}

function normalizeLoadedDroneProfile(value: unknown): DroneProfile {
  if (!value || typeof value !== "object") {
    return createProfileFromCatalog();
  }

  const candidate = value as Partial<DroneProfile>;
  const baseProfile = createProfileFromCatalog(
    typeof candidate.modelId === "string" && candidate.modelId
      ? candidate.modelId
      : DRONE_CATALOG[0].modelId,
  );

  return {
    ...baseProfile,
    ...candidate,
    operationPurpose:
      candidate.operationPurpose === "business" ? "business" : "recreational",
    licenses: Array.isArray(candidate.licenses)
      ? candidate.licenses.filter((item): item is string => typeof item === "string")
      : [],
    operatorCountry:
      typeof candidate.operatorCountry === "string" ? candidate.operatorCountry : "",
  };
}

export function DoIflyApp() {
  const aircraftPickerRef = useRef<HTMLDivElement | null>(null);
  const aircraftSearchInputRef = useRef<HTMLInputElement | null>(null);
  const locationRequestTimeoutRef = useRef<number | null>(null);
  const lastAutoRefreshAtRef = useRef(0);
  const activeLocationRequestIdRef = useRef(0);
  const inlineManualLocationInputRef = useRef<HTMLInputElement | null>(null);
  const manualLocationInputRef = useRef<HTMLInputElement | null>(null);
  const forecastDayScrollerRef = useRef<HTMLDivElement | null>(null);
  const forecastDaySectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const scheduledReportsRef = useRef<Record<string, ScheduledFlightReportState>>({});
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<AppSessionUser | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(true);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authUsernameHash, setAuthUsernameHash] = useState("");
  const [authError, setAuthError] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [visualMode, setVisualMode] = useState<VisualMode>("night");
  const [consent, setConsent] = useState<UserConsentState>({
    locationPermission: "unknown",
    storageConsent: "accepted",
  });
  const [profile, setProfile] = useState<DroneProfile>(() =>
    createProfileFromCatalog(),
  );
  const [onboardingModelId, setOnboardingModelId] = useState<string>(
    profile.modelId,
  );
  const [onboardingOperationPurpose, setOnboardingOperationPurpose] =
    useState<OperationPurpose>(profile.operationPurpose ?? "recreational");
  const [onboardingAllowLocation, setOnboardingAllowLocation] = useState<boolean>(
    true,
  );
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource | null>(null);
  const [selectedLocationLabel, setSelectedLocationLabel] = useState("");
  const [browserProfile, setBrowserProfile] = useState<BrowserProfile>({
    browserFamily: "unknown",
    platformFamily: "unknown",
    browserLabel: "this browser",
  });
  const [locationCapability, setLocationCapability] = useState<LocationCapability>("available");
  const [locationIssue, setLocationIssue] = useState<LocationIssueState>({
    kind: "none",
    message: "",
  });
  const [assessment, setAssessment] = useState<FlightAssessment | null>(null);
  const [sessionGenericCards, setSessionGenericCards] = useState<
    GenericAdvisoryCard[]
  >(() => getGenericCards());
  const [isAssessmentLoading, setIsAssessmentLoading] = useState(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [hasRequestedLocation, setHasRequestedLocation] = useState(false);
  const [hasDismissedLocationPrompt, setHasDismissedLocationPrompt] = useState(false);
  const [isManualLocationOpen, setIsManualLocationOpen] = useState(false);
  const [manualLocationQuery, setManualLocationQuery] = useState("");
  const [manualLocationSearchState, setManualLocationSearchState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [manualLocationCandidate, setManualLocationCandidate] =
    useState<LocationSearchResult | null>(null);
  const [manualLocationError, setManualLocationError] = useState("");
  const [isStandalone, setIsStandalone] = useState(false);
  const [siteOrigin, setSiteOrigin] = useState("");
  const [aircraftQuery, setAircraftQuery] = useState("");
  const [isAircraftPickerOpen, setIsAircraftPickerOpen] = useState(false);
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
  const [activeForecastDayKey, setActiveForecastDayKey] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState<ScheduledFlightDraft>({
    title: "",
    scheduledAt: getDefaultScheduledAt(),
    notifyOffsetMinutes: 120,
  });
  const [scheduledFlights, setScheduledFlights] = useState<ScheduledFlightPlan[]>([]);
  const [scheduledReports, setScheduledReports] = useState<
    Record<string, ScheduledFlightReportState>
  >({});
  const [scheduleBadgeSeenAt, setScheduleBadgeSeenAt] = useState("");
  const [scheduleNotice, setScheduleNotice] = useState("");
  const [activeReminderId, setActiveReminderId] = useState<string | null>(null);
  const [assessmentRefreshKey, setAssessmentRefreshKey] = useState(0);
  const [scheduledReportRefreshKey, setScheduledReportRefreshKey] = useState(0);
  const [hasDismissedInstallGuide, setHasDismissedInstallGuide] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const mode = coords ? "personalized" : "generic";

  useEffect(() => {
    let isCancelled = false;

    async function hydrate() {
      try {
        const rememberedUsername = getRememberedUsername();
        if (rememberedUsername.username) {
          setAuthUsername(rememberedUsername.username);
          setAuthUsernameHash(rememberedUsername.usernameHash);
        }

        const session = await loadSession();

        if (isCancelled) {
          return;
        }

        setLocationCapability(getLocationCapability());
        setBrowserProfile(detectBrowserProfile());
        setSiteOrigin(window.location.origin);
        setHasHydrated(true);
        setIsAuthReady(true);

        if (!session.authenticated || !session.user) {
          setIsAuthModalOpen(true);
          return;
        }

        setAuthUser(session.user);
        const resolvedUsernameHash = await hashUsername(session.user.username);
        setAuthUsernameHash(resolvedUsernameHash);
        setAuthUsername(session.user.username);
        rememberUsername(session.user.username, resolvedUsernameHash);
        setIsAuthModalOpen(false);

        if (session.profile) {
          setProfile(normalizeLoadedDroneProfile(session.profile.droneProfile));

          if (session.profile.visualMode === "day" || session.profile.visualMode === "night") {
            setVisualMode(session.profile.visualMode);
          }

          if (Array.isArray(session.profile.scheduledFlights)) {
            setScheduledFlights(
              (session.profile.scheduledFlights as ScheduledFlightPlan[]).filter(
                (flight) =>
                  flight &&
                  typeof flight.id === "string" &&
                  typeof flight.scheduledAt === "string" &&
                  Date.parse(flight.scheduledAt) > Date.now() - 60 * 60 * 1000,
              ),
            );
          }

          if (session.profile.scheduledReports) {
            setScheduledReports(
              normalizeStoredScheduledReports(session.profile.scheduledReports),
            );
          }
        }
      } catch {
        if (isCancelled) {
          return;
        }

        setLocationCapability(getLocationCapability());
        setBrowserProfile(detectBrowserProfile());
        setSiteOrigin(window.location.origin);
        setIsAuthModalOpen(true);
        setHasHydrated(true);
        setIsAuthReady(true);
      }
    }

    void hydrate();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    scheduledReportsRef.current = scheduledReports;
  }, [scheduledReports]);

  useEffect(() => {
    if (!hasHydrated || !authUser || !authUsernameHash) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveProfile({
        id: authUser.id,
        username: authUser.username,
        usernameHash: authUsernameHash,
        visualMode,
        droneProfile: profile,
        scheduledFlights,
        scheduledReports: getPersistableScheduledReports(scheduledReports),
      }).catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not sync the profile.",
        );
      });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [authUser, authUsernameHash, hasHydrated, profile, scheduledFlights, scheduledReports, visualMode]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const standaloneMediaQuery = window.matchMedia("(display-mode: standalone)");
    const syncInstallState = () => {
      const navigatorWithStandalone = navigator as Navigator & {
        standalone?: boolean;
      };
      setIsStandalone(
        standaloneMediaQuery.matches || Boolean(navigatorWithStandalone.standalone),
      );
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setHasDismissedInstallGuide(true);
    };

    syncInstallState();
    standaloneMediaQuery.addEventListener?.("change", syncInstallState);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      standaloneMediaQuery.removeEventListener?.("change", syncInstallState);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [hasHydrated]);

  const requestLocation = useCallback(() => {
    const capability = getLocationCapability();
    setLocationCapability(capability);
    setHasRequestedLocation(true);

    if (capability === "unsupported") {
      setConsent((current) => ({ ...current, locationPermission: "unknown" }));
      setLocationIssue(createLocationIssue("unsupported", siteOrigin, browserProfile));
      setErrorMessage("");
      setIsRequestingLocation(false);
      return;
    }

    if (capability === "insecure_origin") {
      setConsent((current) => ({ ...current, locationPermission: "unknown" }));
      setLocationIssue(createLocationIssue("insecure_context", siteOrigin, browserProfile));
      setErrorMessage("");
      setIsRequestingLocation(false);
      return;
    }

    const requestId = activeLocationRequestIdRef.current + 1;
    activeLocationRequestIdRef.current = requestId;

    setErrorMessage("");
    setLocationIssue({ kind: "none", message: "" });
    setIsRequestingLocation(true);

    if (locationRequestTimeoutRef.current) {
      window.clearTimeout(locationRequestTimeoutRef.current);
    }

    locationRequestTimeoutRef.current = window.setTimeout(() => {
      if (activeLocationRequestIdRef.current !== requestId) {
        return;
      }

      activeLocationRequestIdRef.current += 1;
      setIsRequestingLocation(false);
      setLocationIssue(createLocationIssue("timeout", siteOrigin, browserProfile));
    }, LOCATION_REQUEST_TIMEOUT_MS);

    const applySuccessfulDeviceLocation = (position: GeolocationPosition) => {
      if (activeLocationRequestIdRef.current !== requestId) {
        return false;
      }

      if (locationRequestTimeoutRef.current) {
        window.clearTimeout(locationRequestTimeoutRef.current);
        locationRequestTimeoutRef.current = null;
      }

      setCoords({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      setLocationSource("device");
      setSelectedLocationLabel("");
      setConsent((current) => ({
        ...current,
        locationPermission: "granted",
      }));
      setLocationIssue({ kind: "none", message: "" });
      setIsRequestingLocation(false);
      setErrorMessage("");
      return true;
    };

    const applyApproximateFallback = async (issue: LocationIssueState) => {
      if (issue.kind !== "timeout" && issue.kind !== "unavailable" && issue.kind !== "prompt_blocked") {
        return false;
      }

      try {
        const approximateLocation = await loadApproximateLocation();

        if (activeLocationRequestIdRef.current !== requestId) {
          return false;
        }

        setCoords({
          lat: approximateLocation.latitude,
          lng: approximateLocation.longitude,
        });
        setLocationSource("approximate");
        setSelectedLocationLabel(approximateLocation.locationLabel);
        setLocationIssue({ kind: "none", message: "" });
        setErrorMessage(
          `Using approximate network location (${approximateLocation.locationLabel}) because precise device location is unavailable in ${browserProfile.browserLabel}.`,
        );
        setIsRequestingLocation(false);
        return true;
      } catch {
        return false;
      }
    };

    const applyLocationFailure = async (error: unknown) => {
      if (activeLocationRequestIdRef.current !== requestId) {
        return;
      }

      if (locationRequestTimeoutRef.current) {
        window.clearTimeout(locationRequestTimeoutRef.current);
        locationRequestTimeoutRef.current = null;
      }

      const issue = resolveLocationFailure(error, siteOrigin, browserProfile);
      const usedFallback = await applyApproximateFallback(issue);

      if (activeLocationRequestIdRef.current !== requestId) {
        return;
      }

      setConsent((current) => ({
        ...current,
        locationPermission:
          issue.kind === "browser_denied" ? "denied" : current.locationPermission,
      }));

      if (usedFallback) {
        return;
      }

      setLocationIssue(issue);
      setIsRequestingLocation(false);
    };

    void (async () => {
      try {
        const coarsePosition = await getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 600000,
        });

        if (applySuccessfulDeviceLocation(coarsePosition)) {
          return;
        }

        return;
      } catch (coarseError) {
        const coarseIssue = resolveLocationFailure(coarseError, siteOrigin, browserProfile);

        if (coarseIssue.kind !== "timeout" && coarseIssue.kind !== "unavailable") {
          await applyLocationFailure(coarseError);
          return;
        }
      }

      try {
        const precisePosition = await getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        });

        applySuccessfulDeviceLocation(precisePosition);
      } catch (preciseError) {
        await applyLocationFailure(preciseError);
      }
    })();
  }, [siteOrigin, browserProfile]);

  useEffect(() => {
    return () => {
      if (locationRequestTimeoutRef.current) {
        window.clearTimeout(locationRequestTimeoutRef.current);
      }
    };
  }, []);

  const refreshAssessment = useCallback(() => {
    setAssessmentRefreshKey((current) => current + 1);
  }, []);

  const refreshLocationAndAssessment = useCallback(() => {
    if (!hasHydrated || consent.storageConsent === "unknown" || isRequestingLocation) {
      return;
    }

    if (locationSource === "approximate") {
      setErrorMessage("");

      void loadApproximateLocation()
        .then((approximateLocation) => {
          setCoords({
            lat: approximateLocation.latitude,
            lng: approximateLocation.longitude,
          });
          setLocationSource("approximate");
          setSelectedLocationLabel(approximateLocation.locationLabel);
          setLocationIssue({ kind: "none", message: "" });
        })
        .catch(() => {
          refreshAssessment();
        });

      return;
    }

    if (
      locationCapability === "available" &&
      consent.locationPermission !== "denied" &&
      (locationSource === "device" || !coords)
    ) {
      requestLocation();
      return;
    }

    if (coords) {
      refreshAssessment();
    }
  }, [
    consent.locationPermission,
    consent.storageConsent,
    coords,
    hasHydrated,
    isRequestingLocation,
    locationCapability,
    locationSource,
    refreshAssessment,
    requestLocation,
  ]);

  useEffect(() => {
    if (!hasHydrated || consent.storageConsent === "unknown") {
      return;
    }

    const triggerRefresh = () => {
      const now = Date.now();

      if (now - lastAutoRefreshAtRef.current < AUTO_REFRESH_DEBOUNCE_MS) {
        return;
      }

      lastAutoRefreshAtRef.current = now;
      refreshLocationAndAssessment();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerRefresh();
      }
    };

    triggerRefresh();
    window.addEventListener("focus", triggerRefresh);
    window.addEventListener("pageshow", triggerRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", triggerRefresh);
      window.removeEventListener("pageshow", triggerRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [consent.storageConsent, hasHydrated, refreshLocationAndAssessment]);

  useEffect(() => {
    if (!hasHydrated || consent.storageConsent === "unknown") {
      return;
    }

    const capability = getLocationCapability();
    setLocationCapability(capability);

    if (capability === "unsupported") {
      setConsent((current) => ({ ...current, locationPermission: "unknown" }));
      setLocationIssue(createLocationIssue("unsupported", siteOrigin, browserProfile));
      return;
    }

    if (capability === "insecure_origin") {
      setConsent((current) => ({ ...current, locationPermission: "unknown" }));
      setLocationIssue(createLocationIssue("insecure_context", siteOrigin, browserProfile));
      return;
    }

    const permissions = navigator.permissions;

    if (!permissions?.query) {
      setConsent((current) => ({ ...current, locationPermission: "unknown" }));
      return;
    }

    let isCancelled = false;
    let removePermissionListener: (() => void) | undefined;

    permissions
      .query({ name: "geolocation" as PermissionName })
      .then((result) => {
        if (isCancelled) {
          return;
        }

        const applyPermissionState = (state: PermissionState) => {
          if (isCancelled) {
            return;
          }

          if (state === "granted") {
            setConsent((current) => ({
              ...current,
              locationPermission: "granted",
            }));
            setLocationIssue((current) =>
              current.kind === "browser_denied" ? { kind: "none", message: "" } : current,
            );

            return;
          }

          if (state === "denied") {
            // Don't pre-mark as denied until the user actually asks for location.
            // Browsers can store a persisted deny decision from earlier sessions.
            if (hasRequestedLocation) {
              setConsent((current) => ({
                ...current,
                locationPermission: "denied",
              }));
              setLocationIssue(createLocationIssue("browser_denied", siteOrigin, browserProfile));
            } else {
              setConsent((current) => ({
                ...current,
                locationPermission: "unknown",
              }));
            }
            return;
          }

          setConsent((current) => ({
            ...current,
            locationPermission: "unknown",
          }));
          setLocationIssue((current) =>
            current.kind === "browser_denied" ? { kind: "none", message: "" } : current,
          );
        };

        applyPermissionState(result.state);

        const handlePermissionChange = () => {
          applyPermissionState(result.state);
        };

        result.addEventListener?.("change", handlePermissionChange);
        result.onchange = handlePermissionChange;
        removePermissionListener = () => {
          result.removeEventListener?.("change", handlePermissionChange);
          result.onchange = null;
        };
      })
      .catch(() => {
        setConsent((current) => ({
          ...current,
          locationPermission: "unknown",
        }));
      });

    return () => {
      isCancelled = true;
      removePermissionListener?.();
    };
  }, [
    hasHydrated,
    consent.storageConsent,
    siteOrigin,
    hasRequestedLocation,
    coords,
    isRequestingLocation,
    requestLocation,
    browserProfile,
  ]);

  useEffect(() => {
    if (!coords) {
      return;
    }

    const params = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      hours: String(FREE_FORECAST_HOURS),
      mode,
    });

    if (mode === "personalized") {
      params.set("modelId", profile.modelId);
      params.set("manufacturer", profile.manufacturer);
      params.set("modelName", profile.modelName);
      params.set("weightGrams", String(profile.weightGrams));
      params.set("classLabel", profile.classLabel);
      params.set("category", profile.category);
      params.set("operationPurpose", profile.operationPurpose);
      params.set("licenses", profile.licenses.join(","));
      if (profile.operatorCountry) {
        params.set("operatorCountry", profile.operatorCountry);
      }
    }

    let isCancelled = false;

    queueMicrotask(() => {
      if (isCancelled) {
        return;
      }

      setIsAssessmentLoading(true);
      setErrorMessage("");

      loadAssessment(params)
        .then((nextAssessment) => {
          if (isCancelled) {
            return;
          }

          setAssessment(nextAssessment);
          setSessionGenericCards(nextAssessment.genericCards ?? getGenericCards());

          if (
            mode === "personalized" &&
            !profile.operatorCountry &&
            nextAssessment.regulatory?.countryCode
          ) {
            setProfile((current) => ({
              ...current,
              operatorCountry: nextAssessment.regulatory?.countryCode ?? "",
            }));
          }
        })
        .catch((error: unknown) => {
          if (isCancelled) {
            return;
          }

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not load a fresh assessment.",
          );
        })
        .finally(() => {
          if (isCancelled) {
            return;
          }

          setIsAssessmentLoading(false);
        });
    });

    return () => {
      isCancelled = true;
    };
  }, [assessmentRefreshKey, coords, mode, profile]);

  async function handleAuthSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const username = authUsername.trim();

    if (!username || authPassword.length < 8) {
      setAuthError("Enter a username and a password with at least 8 characters.");
      return;
    }

    setIsAuthSubmitting(true);
    setAuthError("");

    try {
      const usernameHash = await hashUsername(username);

      if (authMode === "signup") {
        await signUp(username, authPassword);
        setProfile((current) =>
          mergeProfileFromCatalog(
            { ...current, operationPurpose: onboardingOperationPurpose },
            onboardingModelId,
          ),
        );
      } else {
        await signIn(username, authPassword);
      }

      rememberUsername(username, usernameHash);
      setAuthUsernameHash(usernameHash);

      const session = await loadSession();

      if (!session.authenticated || !session.user) {
        throw new Error("Could not load the signed-in session.");
      }

      setAuthUser(session.user);
      setIsAuthModalOpen(false);

      if (session.profile) {
        setProfile(normalizeLoadedDroneProfile(session.profile.droneProfile));

        if (session.profile.visualMode === "day" || session.profile.visualMode === "night") {
          setVisualMode(session.profile.visualMode);
        }

        if (Array.isArray(session.profile.scheduledFlights)) {
          setScheduledFlights(
            (session.profile.scheduledFlights as ScheduledFlightPlan[]).filter(
              (flight) =>
                flight &&
                typeof flight.id === "string" &&
                typeof flight.scheduledAt === "string" &&
                Date.parse(flight.scheduledAt) > Date.now() - 60 * 60 * 1000,
            ),
          );
        }

        if (session.profile.scheduledReports) {
          setScheduledReports(
            normalizeStoredScheduledReports(session.profile.scheduledReports),
          );
        }
      }

      if (onboardingAllowLocation) {
        try {
          requestLocation();
        } catch {
          // ignore
        }
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
    } finally {
      clearRememberedUsername();
      setAuthUser(null);
      setIsAuthModalOpen(true);
      setProfile(createProfileFromCatalog());
      setVisualMode("night");
      setCoords(null);
      setLocationSource(null);
      setSelectedLocationLabel("");
      setScheduledFlights([]);
      setScheduledReports({});
      setScheduleBadgeSeenAt("");
      setScheduleNotice("");
      setActiveReminderId(null);
      setAuthUsername("");
      setAuthPassword("");
      setAuthError("");
      setAuthUsernameHash("");
      setErrorMessage("Signed out.");
    }
  }

  function dismissInstallGuide() {
    setHasDismissedInstallGuide(true);
  }

  function rememberLocationPromptSeen() {
    setHasDismissedLocationPrompt(true);
  }

  function openManualLocationModal() {
    setIsManualLocationOpen(true);
    setManualLocationSearchState("idle");
    setManualLocationCandidate(null);
    setManualLocationError("");
  }

  async function handleManualLocationSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const query = manualLocationQuery.trim();

    if (!query) {
      setManualLocationSearchState("error");
      setManualLocationCandidate(null);
      setManualLocationError("Enter a city, park, beach, or address to search.");
      return;
    }

    setManualLocationSearchState("loading");
    setManualLocationCandidate(null);
    setManualLocationError("");

    try {
      const match = await searchLocation(query);
      setManualLocationCandidate(match);
      setManualLocationSearchState("ready");
    } catch (error) {
      setManualLocationSearchState("error");
      setManualLocationCandidate(null);
      setManualLocationError(
        error instanceof Error
          ? error.message
          : "That place could not be resolved yet.",
      );
    }
  }

  function applyManualLocation(location: LocationSearchResult) {
    setCoords({
      lat: location.latitude,
      lng: location.longitude,
    });
    setLocationSource("manual");
    setSelectedLocationLabel(location.locationLabel);
    setLocationIssue({ kind: "none", message: "" });
    setAssessment(null);
    setIsManualLocationOpen(false);
    rememberLocationPromptSeen();
  }

  function clearLocationSelection() {
    setCoords(null);
    setLocationSource(null);
    setSelectedLocationLabel("");
    setAssessment(null);
  }

  function toggleLicense(license: string) {
    setProfile((current) => ({
      ...current,
      licenses: current.licenses.includes(license)
        ? current.licenses.filter((item) => item !== license)
        : [...current.licenses, license],
    }));
  }

  const genericCards = useMemo(() => {
    if (assessment?.genericCards?.length) {
      return assessment.genericCards;
    }

    return sessionGenericCards.length ? sessionGenericCards : getGenericCards();
  }, [assessment?.genericCards, sessionGenericCards]);

  const normalizedAircraftQuery = aircraftQuery.trim().toLowerCase();

  const filteredDroneCatalog = useMemo(() => {
    if (!normalizedAircraftQuery) {
      return DRONE_CATALOG;
    }

    return DRONE_CATALOG.filter((entry) =>
      [
        entry.modelName,
        entry.manufacturer,
        entry.classLabel,
        entry.category,
        formatAircraftSearchLabel(entry),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedAircraftQuery),
    );
  }, [normalizedAircraftQuery]);

  const groupedDroneCatalog = useMemo(() => {
    const groups = new Map<string, typeof DRONE_CATALOG>();

    filteredDroneCatalog.forEach((entry) => {
      const key = entry.manufacturer;
      const existing = groups.get(key) ?? [];
      groups.set(key, [...existing, entry]);
    });

    return Array.from(groups.entries());
  }, [filteredDroneCatalog]);

  const isCustomAircraft = profile.modelId === CUSTOM_DRONE_MODEL_ID;
  const selectedCatalogEntry = isCustomAircraft
    ? null
    : DRONE_CATALOG.find((entry) => entry.modelId === profile.modelId) ?? DRONE_CATALOG[0];
  const selectedAircraftInFilteredList = selectedCatalogEntry
    ? filteredDroneCatalog.some((entry) => entry.modelId === profile.modelId)
    : false;
  const aircraftSummaryLabel = isCustomAircraft
    ? profile.modelName || "Other / custom aircraft"
    : selectedCatalogEntry
      ? formatAircraftSearchLabel(selectedCatalogEntry)
      : "Choose an aircraft";
  const aircraftGroupLabel = isCustomAircraft
    ? "Custom aircraft"
    : selectedCatalogEntry?.manufacturer ?? "Drone catalog";
  const aircraftSpecManufacturer = isCustomAircraft
    ? profile.manufacturer || "Custom"
    : selectedCatalogEntry?.manufacturer ?? profile.manufacturer;
  const aircraftSpecClass = isCustomAircraft
    ? profile.classLabel
    : selectedCatalogEntry?.classLabel ?? profile.classLabel;
  const aircraftSpecWeight = isCustomAircraft
    ? profile.weightGrams
    : selectedCatalogEntry?.weightGrams ?? profile.weightGrams;
  const aircraftSpecCategory = isCustomAircraft
    ? profile.category
    : selectedCatalogEntry?.category ?? profile.category;

  const primaryStatus = assessment?.status ?? "limited_data";
  const profileDisplayName = `${profile.manufacturer} ${profile.modelName}`.trim() || "Custom aircraft";
  const profileSummary = `${profileDisplayName}, ${profile.weightGrams} g, ${profile.operationPurpose}`;
  const currentWeather = assessment?.weather?.current;
  const hasLiveWeather = Boolean(currentWeather);
  const locationLabel =
    assessment?.locationLabel ??
    selectedLocationLabel ??
    (locationSource === "manual"
      ? "Custom location selected"
      : locationSource === "approximate"
        ? "Approximate location selected"
        : "Awaiting location");
  const locationChipLabel =
    locationSource === "manual"
      ? "Custom location"
      : locationSource === "approximate"
        ? "Approximate location"
        : "Using location";
  const locationSourceTitle = getLocationSourceTitle(coords, locationSource);
  const locationSourceDescription = getLocationSourceDescription(
    coords,
    locationSource,
    locationIssue,
    locationLabel,
  );
  const locationActionLabel = isRequestingLocation
    ? "Requesting location..."
    : locationCapability === "insecure_origin"
      ? "Needs HTTPS"
      : locationCapability === "unsupported"
        ? "Location unavailable"
        : consent.locationPermission === "denied"
          ? "Location blocked"
          : "Use my location";
  const installGuide = getInstallGuide(browserProfile);
  const shouldShowLocationPrompt =
    hasHydrated &&
    isAuthReady &&
    !isAuthModalOpen &&
    !coords &&
    !hasDismissedLocationPrompt &&
    !isManualLocationOpen &&
    !isSchedulerOpen;
  const shouldShowInstallGuide =
    hasHydrated &&
    isAuthReady &&
    !isAuthModalOpen &&
    !isStandalone &&
    !hasDismissedInstallGuide &&
    !shouldShowLocationPrompt &&
    !isManualLocationOpen &&
    !isProfileOpen;
  const isAnyModalOpen =
    hasHydrated &&
    (isAuthModalOpen ||
      isProfileOpen ||
      shouldShowInstallGuide ||
      shouldShowLocationPrompt ||
      isManualLocationOpen ||
      isSchedulerOpen);
  const profileReviewSnapshot = useMemo(() => {
    return {
      username: authUser?.username ?? "Not signed in",
      profileLabel: profileDisplayName,
      profileDetail: `${profile.weightGrams} g · ${profile.operationPurpose} · ${profile.classLabel}`,
      themeLabel: visualMode === "night" ? "Night mode" : "Day mode",
      droneCount: scheduledFlights.length,
      reportCount: Object.keys(getPersistableScheduledReports(scheduledReports)).length,
      locationPromptState: hasDismissedLocationPrompt ? "Dismissed once" : "Not dismissed",
      scheduleBadgeState: scheduleBadgeSeenAt ? new Date(scheduleBadgeSeenAt).toLocaleString() : "Nothing stored",
    };
  }, [
    authUser?.username,
    hasDismissedLocationPrompt,
    profile.classLabel,
    profile.operationPurpose,
    profile.weightGrams,
    profileDisplayName,
    scheduleBadgeSeenAt,
    scheduledFlights.length,
    scheduledReports,
    visualMode,
  ]);
  const focusNotes = assessment
    ? [...assessment.reasons, ...assessment.warnings].slice(0, 3)
    : [
        "Use device location or a custom place to switch from generic mode to a precise local wind and regulation check.",
        `This build focuses on current conditions plus the next ${FORECAST_WINDOW_DAYS} forecast days.`,
      ];
  const forecastByDay = useMemo(() => {
    const forecastPoints = assessment?.weather?.forecast ?? [];
    const grouped = new Map<string, typeof forecastPoints>();

    forecastPoints.forEach((point) => {
      const dateKey = getForecastDayKey(point.time);
      const existing = grouped.get(dateKey) ?? [];
      grouped.set(dateKey, [...existing, point]);
    });

    return Array.from(grouped.entries())
      .slice(0, FORECAST_WINDOW_DAYS)
      .map(([dateKey, points]) => ({
        dateKey,
        label: formatForecastDayLabel(points[0]?.time ?? `${dateKey}T00:00:00`),
        points,
      }));
  }, [assessment?.weather?.forecast]);

  useEffect(() => {
    if (!forecastByDay.length) {
      setActiveForecastDayKey("");
      return;
    }

    setActiveForecastDayKey((current) =>
      current && forecastByDay.some((day) => day.dateKey === current)
        ? current
        : forecastByDay[0].dateKey,
    );
  }, [forecastByDay]);

  useEffect(() => {
    if (!isAircraftPickerOpen) {
      return;
    }

    aircraftSearchInputRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!aircraftPickerRef.current?.contains(event.target as Node)) {
        setIsAircraftPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isAircraftPickerOpen]);

  useEffect(() => {
    if (!isManualLocationOpen) {
      return;
    }

    manualLocationInputRef.current?.focus();
  }, [isManualLocationOpen]);

  useEffect(() => {
    if (!isAnyModalOpen) {
      return;
    }

    const { body, documentElement } = document;
    const scrollY = window.scrollY;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyLeft = body.style.left;
    const previousBodyRight = body.style.right;
    const previousBodyWidth = body.style.width;
    const previousBodyOverflow = body.style.overflow;
    const previousRootOverflow = documentElement.style.overflow;

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";

    return () => {
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.left = previousBodyLeft;
      body.style.right = previousBodyRight;
      body.style.width = previousBodyWidth;
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousRootOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [isAnyModalOpen]);

  function selectCatalogAircraft(modelId: string) {
    setProfile((current) => mergeProfileFromCatalog(current, modelId));
    setAircraftQuery("");
    setIsAircraftPickerOpen(false);
  }

  function scrollToForecastDay(dateKey: string) {
    const container = forecastDayScrollerRef.current;
    const section = forecastDaySectionRefs.current[dateKey];

    if (!container || !section) {
      setActiveForecastDayKey(dateKey);
      return;
    }

    const targetTop = section.offsetTop - container.offsetTop;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth",
    });
    setActiveForecastDayKey(dateKey);
  }

  function selectCustomAircraft() {
    setProfile((current) => ({
      ...current,
      modelId: CUSTOM_DRONE_MODEL_ID,
      manufacturer: "Custom",
      modelName: current.modelId === CUSTOM_DRONE_MODEL_ID ? current.modelName : "",
      weightGrams: current.modelId === CUSTOM_DRONE_MODEL_ID ? current.weightGrams : 250,
      classLabel: current.modelId === CUSTOM_DRONE_MODEL_ID ? current.classLabel : "C0",
      category: current.modelId === CUSTOM_DRONE_MODEL_ID ? current.category : "Open",
    }));
    setAircraftQuery("");
    setIsAircraftPickerOpen(false);
  }

  const maxScheduledAt = useMemo(() => {
    return formatDateTimeLocalValue(
      new Date(Date.now() + MAX_SCHEDULE_AHEAD_DAYS * 24 * 60 * 60 * 1000),
    );
  }, []);

  const scheduledFlightsSorted = useMemo(
    () =>
      [...scheduledFlights].sort(
        (left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt),
      ),
    [scheduledFlights],
  );

  const scheduledFlightIds = useMemo(
    () => new Set(scheduledFlightsSorted.map((flight) => flight.id)),
    [scheduledFlightsSorted],
  );

  const latestScheduledReportUpdateAt = useMemo(
    () => getLatestScheduledReportUpdateAt(scheduledReports, scheduledFlightIds),
    [scheduledReports, scheduledFlightIds],
  );

  const hasUnseenScheduledReportUpdates = useMemo(() => {
    if (!latestScheduledReportUpdateAt) {
      return false;
    }

    if (!scheduleBadgeSeenAt) {
      return true;
    }

    return Date.parse(latestScheduledReportUpdateAt) > Date.parse(scheduleBadgeSeenAt);
  }, [latestScheduledReportUpdateAt, scheduleBadgeSeenAt]);

  useEffect(() => {
    setScheduledReports((current) => {
      const entries = Object.entries(current).filter(([flightId]) =>
        scheduledFlightIds.has(flightId),
      );

      if (entries.length === Object.keys(current).length) {
        return current;
      }

      return Object.fromEntries(entries);
    });
  }, [scheduledFlightIds]);

  const nextReminderFlight = useMemo(() => {
    const now = Date.now();

    return scheduledFlightsSorted.find((flight) => {
      if (flight.notifyOffsetMinutes <= 0 || activeReminderId === flight.id) {
        return false;
      }

      const scheduledTime = Date.parse(flight.scheduledAt);
      const reminderTime = scheduledTime - flight.notifyOffsetMinutes * 60 * 1000;

      return now >= reminderTime && now <= scheduledTime + 60 * 60 * 1000;
    });
  }, [activeReminderId, scheduledFlightsSorted]);

  const activeReminderReport = nextReminderFlight
    ? scheduledReports[nextReminderFlight.id]?.report
    : undefined;

  useEffect(() => {
    if (!coords || scheduledFlightsSorted.length === 0) {
      return;
    }

    const activeCoords = coords;
    let isCancelled = false;

    async function refreshScheduledReports() {
      await Promise.all(
        scheduledFlightsSorted.map(async (flight) => {
          const params = new URLSearchParams({
            lat: String(activeCoords.lat),
            lng: String(activeCoords.lng),
            targetAt: new Date(flight.scheduledAt).toISOString(),
            mode,
          });

          if (mode === "personalized") {
            params.set("modelId", profile.modelId);
            params.set("manufacturer", profile.manufacturer);
            params.set("modelName", profile.modelName);
            params.set("weightGrams", String(profile.weightGrams));
            params.set("classLabel", profile.classLabel);
            params.set("category", profile.category);
            params.set("operationPurpose", profile.operationPurpose);
            params.set("licenses", profile.licenses.join(","));
            if (profile.operatorCountry) {
              params.set("operatorCountry", profile.operatorCountry);
            }
          }

          if (!isCancelled) {
            setScheduledReports((current) => ({
              ...current,
              [flight.id]: {
                state: current[flight.id]?.report ? "ready" : "loading",
                report: current[flight.id]?.report,
              },
            }));
          }

          try {
            const report = await loadScheduledFlightReport(params);
            const previousReport = scheduledReportsRef.current[flight.id]?.report;
            const reportChanged = hasScheduledReportChanged(previousReport, report);
            const effectiveReport = reportChanged ? report : previousReport ?? report;

            if (!isCancelled) {
              setScheduledReports((current) => ({
                ...current,
                [flight.id]: {
                  state: "ready",
                  report: effectiveReport,
                },
              }));

              if (reportChanged) {
                setScheduleNotice(
                  previousReport
                    ? `Updated forecast data for ${flight.title}.`
                    : `Forecast data is now available for ${flight.title}.`,
                );
              }
            }
          } catch (error) {
            if (!isCancelled) {
              const isPendingForecast =
                isScheduledReportApiError(error) &&
                (error.code === "forecast_not_available_yet" ||
                  error.name === "forecast_not_available_yet");

              setScheduledReports((current) => ({
                ...current,
                [flight.id]: {
                  state: isPendingForecast ? "pending" : "error",
                  report: current[flight.id]?.report,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Could not load the scheduled-flight report.",
                },
              }));
            }
          }
        }),
      );
    }

    void refreshScheduledReports();

    return () => {
      isCancelled = true;
    };
  }, [
    coords,
    mode,
    profile.category,
    profile.classLabel,
    profile.licenses,
    profile.manufacturer,
    profile.modelId,
    profile.modelName,
    profile.operationPurpose,
    profile.operatorCountry,
    profile.weightGrams,
    scheduledFlightsSorted,
    scheduledReportRefreshKey,
  ]);

  useEffect(() => {
    if (!nextReminderFlight) {
      return;
    }

    const report = scheduledReports[nextReminderFlight.id]?.report;

    setScheduleNotice(
      report
        ? `Reminder: ${nextReminderFlight.title} is coming up at ${formatScheduledDateTime(nextReminderFlight.scheduledAt)}. Latest forecast: ${Math.round(report.weather?.windSpeedKph ?? 0)} km/h wind, ${Math.round(report.weather?.temperatureC ?? 0)}°C.`
        : `Reminder: ${nextReminderFlight.title} is coming up at ${formatScheduledDateTime(nextReminderFlight.scheduledAt)}.`,
    );
  }, [nextReminderFlight, scheduledReports]);

  function refreshScheduledReports() {
    setScheduledReportRefreshKey((current) => current + 1);
  }

  function markScheduledUpdatesSeen() {
    setScheduleBadgeSeenAt(new Date().toISOString());
  }

  function handleSaveScheduledFlight() {
    if (!coords) {
      setScheduleNotice("Choose a device or custom location before creating a scheduled flight.");
      return;
    }

    const scheduledTime = Date.parse(scheduleDraft.scheduledAt);
    const leadMs = scheduledTime - Date.now();

    if (!Number.isFinite(scheduledTime) || leadMs <= 0) {
      setScheduleNotice("Choose a future date and time for the scheduled flight.");
      return;
    }

    if (leadMs > MAX_SCHEDULE_AHEAD_DAYS * 24 * 60 * 60 * 1000) {
      setScheduleNotice(
        `Choose a time within the next ${MAX_SCHEDULE_AHEAD_DAYS} days.`,
      );
      return;
    }

    const title =
      scheduleDraft.title.trim() ||
      `${profile.modelName || "Flight"} · ${formatScheduledDateTime(scheduleDraft.scheduledAt)}`;

    const newFlight: ScheduledFlightPlan = {
      id: createScheduledFlightId(),
      title,
      scheduledAt: new Date(scheduleDraft.scheduledAt).toISOString(),
      notifyOffsetMinutes: Math.min(
        scheduleDraft.notifyOffsetMinutes,
        Math.floor(leadMs / (60 * 1000)),
      ),
      createdAt: new Date().toISOString(),
    };

    setScheduledFlights((current) =>
      [...current, newFlight].filter(
        (flight) => Date.parse(flight.scheduledAt) > Date.now() - 60 * 60 * 1000,
      ),
    );
    setScheduledReports((current) => ({
      ...current,
      [newFlight.id]: { state: "loading" },
    }));
    setScheduleDraft({
      title: "",
      scheduledAt: getDefaultScheduledAt(),
      notifyOffsetMinutes: 120,
    });
    setIsSchedulerOpen(false);
    setScheduleNotice(
      `Scheduled ${title} for ${formatScheduledDateTime(newFlight.scheduledAt)}.`,
    );
    refreshScheduledReports();
  }

  function handleDeleteScheduledFlight(flightId: string) {
    setScheduledFlights((current) => current.filter((flight) => flight.id !== flightId));
    setScheduledReports((current) => {
      const next = { ...current };
      delete next[flightId];
      return next;
    });
    if (activeReminderId === flightId) {
      setActiveReminderId(null);
    }
  }

  if (!hasHydrated) {
    return <div className={styles.pageShell} data-theme={visualMode} suppressHydrationWarning />;
  }

  return (
    <div className={styles.pageShell} data-theme={visualMode}>
      {hasHydrated && isAuthModalOpen ? (
        <div className={styles.modalBackdrop}>
          <section className={styles.modal}>
            <p className={styles.modalEyebrow}>Supabase account</p>
            <h2>{authMode === "signup" ? "Create your Do.I.Fly? account" : "Sign in to sync your profile"}</h2>
            <p>
              Your username and password are handled through Supabase Auth. Your drone
              profile, saved flights, and theme follow the same account on every device.
            </p>
            <form className={styles.schedulerForm} onSubmit={handleAuthSubmit}>
              <label className={styles.field}>
                <span>Username</span>
                <input
                  type="text"
                  autoComplete="username"
                  value={authUsername}
                  onChange={(event) => setAuthUsername(event.target.value)}
                  placeholder="Example: skypilot"
                />
              </label>

              <label className={styles.field}>
                <span>Password</span>
                <input
                  type="password"
                  autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="At least 8 characters"
                />
              </label>

              <label className={styles.field}>
                <span>Drone model</span>
                <select
                  value={onboardingModelId}
                  onChange={(e) => setOnboardingModelId(e.target.value)}
                >
                  {DRONE_CATALOG.map((entry) => (
                    <option key={entry.modelId} value={entry.modelId}>
                      {entry.manufacturer} {entry.modelName}
                    </option>
                  ))}
                  <option value={CUSTOM_DRONE_MODEL_ID}>Other / custom</option>
                </select>
              </label>

              <label className={styles.field}>
                <span>Operation type</span>
                <select
                  value={onboardingOperationPurpose}
                  onChange={(e) =>
                    setOnboardingOperationPurpose(e.target.value as OperationPurpose)
                  }
                >
                  <option value="recreational">Recreational</option>
                  <option value="business">Business / professional</option>
                </select>
              </label>

              <label className={styles.field}>
                <span>Allow location services</span>
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    className={
                      onboardingAllowLocation ? styles.primaryButton : styles.secondaryButton
                    }
                    onClick={() => setOnboardingAllowLocation(true)}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className={
                      !onboardingAllowLocation ? styles.primaryButton : styles.secondaryButton
                    }
                    onClick={() => setOnboardingAllowLocation(false)}
                  >
                    No
                  </button>
                </div>
              </label>

              {authError ? <p className={styles.errorText}>{authError}</p> : null}

              <div className={styles.modalActions}>
                <button className={styles.primaryButton} type="submit" disabled={isAuthSubmitting}>
                  {isAuthSubmitting
                    ? "Working..."
                    : authMode === "signup"
                      ? "Create account"
                      : "Sign in"}
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => setAuthMode((current) => (current === "signup" ? "login" : "signup"))}
                >
                  {authMode === "signup" ? "Use existing account" : "Create new account"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {isProfileOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => {
            setIsProfileOpen(false);
          }}
        >
          <section
            className={`${styles.modal} ${styles.storageReviewModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-review-title"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className={styles.modalTopBar}>
              <p className={styles.modalEyebrow}>Supabase profile</p>
              <button
                className={styles.modalCloseButton}
                type="button"
                onClick={() => {
                  setIsProfileOpen(false);
                }}
              >
                Close
              </button>
            </div>
            <h2 id="profile-review-title">Review what Do.I.Fly? syncs across devices</h2>
            <p>
              Your signed-in account keeps the drone profile, scheduled flights, and
              theme preference in Supabase. Any device using the same account will pull
              the same saved profile.
            </p>

            <div className={styles.storageReviewGrid}>
              <article className={styles.storageReviewCard}>
                <span className={styles.storageReviewLabel}>Account</span>
                <strong>{profileReviewSnapshot.username}</strong>
                <ul className={styles.storageReviewList}>
                  <li>
                    <span>Theme preference</span>
                    <strong>{profileReviewSnapshot.themeLabel}</strong>
                  </li>
                  <li>
                    <span>Location prompt</span>
                    <strong>{profileReviewSnapshot.locationPromptState}</strong>
                  </li>
                  <li>
                    <span>Schedule badge</span>
                    <strong>{profileReviewSnapshot.scheduleBadgeState}</strong>
                  </li>
                </ul>
              </article>

              <article className={styles.storageReviewCard}>
                <span className={styles.storageReviewLabel}>Aircraft profile</span>
                <strong>{profileReviewSnapshot.profileLabel}</strong>
                <p>{profileReviewSnapshot.profileDetail}</p>
                <span className={styles.storageReviewStatus}>Synced with account</span>
              </article>

              <article className={styles.storageReviewCard}>
                <span className={styles.storageReviewLabel}>Scheduled flights</span>
                <strong>{profileReviewSnapshot.droneCount} saved</strong>
                <p>These follow the same account on every device.</p>
                <span className={styles.storageReviewStatus}>Synced with account</span>
              </article>

              <article className={styles.storageReviewCard}>
                <span className={styles.storageReviewLabel}>Flight reports</span>
                <strong>{profileReviewSnapshot.reportCount} snapshots</strong>
                <p>Forecast snapshots are synced with the profile too.</p>
                <span className={styles.storageReviewStatus}>Synced with account</span>
              </article>
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => {
                  setIsProfileOpen(false);
                }}
              >
                Close
              </button>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={() => {
                  void handleSignOut();
                }}
              >
                Sign out
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {shouldShowInstallGuide ? (
        <div className={styles.modalBackdrop}>
          <section className={`${styles.modal} ${styles.installGuideModal}`}>
            <p className={styles.modalEyebrow}>Install Do.I.Fly?</p>
            <h2>{installGuide.title}</h2>
            <p>{installGuide.intro}</p>
            <ol className={styles.installGuideList}>
              {installGuide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className={styles.mutedText}>
              These steps are based on {browserProfile.browserLabel} on{" "}
              {browserProfile.platformFamily === "ios"
                ? "iPhone or iPad"
                : browserProfile.platformFamily === "android"
                  ? "Android"
                  : browserProfile.platformFamily === "macos"
                    ? "macOS"
                    : browserProfile.platformFamily === "windows"
                      ? "Windows"
                      : browserProfile.platformFamily === "linux"
                        ? "Linux"
                        : "this device"}
              .
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={dismissInstallGuide}
              >
                Got it
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {shouldShowLocationPrompt ? (
        <div className={styles.modalBackdrop}>
          <section className={`${styles.modal} ${styles.locationModal}`}>
            <p className={styles.modalEyebrow}>Location services</p>
            <h2>Choose how Do.I.Fly? should find your flight area.</h2>
            <p>
              Do.I.Fly? refreshes location automatically whenever the page or installed
              app is opened. If the browser blocks it, or this page is not running on
              HTTPS, you can still enter a place manually.
            </p>
            {locationCapability !== "available" || locationIssue.kind !== "none" ? (
              <p className={styles.errorText}>{locationIssue.message}</p>
            ) : null}
            <div className={styles.modalActions}>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={() => {
                  rememberLocationPromptSeen();
                  requestLocation();
                }}
                disabled={isRequestingLocation}
              >
                {locationActionLabel}
              </button>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => {
                  rememberLocationPromptSeen();
                  openManualLocationModal();
                }}
              >
                Enter location manually
              </button>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => {
                  rememberLocationPromptSeen();
                }}
              >
                Not now
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isManualLocationOpen ? (
        <div className={styles.modalBackdrop}>
          <section className={`${styles.modal} ${styles.locationModal}`}>
            <p className={styles.modalEyebrow}>Custom location</p>
            <h2>Enter the place you want Do.I.Fly? to check.</h2>
            <p>
              Do.I.Fly? will use the best match from the geocoder. If the result looks
              wrong, edit the query and search again.
            </p>
            <form className={styles.locationSearchForm} onSubmit={handleManualLocationSearch}>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span>Place</span>
                <input
                  ref={manualLocationInputRef}
                  type="text"
                  value={manualLocationQuery}
                  onChange={(event) => {
                    setManualLocationQuery(event.target.value);
                  }}
                  placeholder="Example: Central Park, New York"
                />
              </label>
              <div className={styles.modalActions}>
                <button
                  className={styles.primaryButton}
                  type="submit"
                  disabled={manualLocationSearchState === "loading"}
                >
                  {manualLocationSearchState === "loading" ? "Searching..." : "Search place"}
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    setIsManualLocationOpen(false);
                  }}
                >
                  Close
                </button>
              </div>
            </form>
            {manualLocationCandidate ? (
              <button
                type="button"
                className={styles.locationResultCard}
                onClick={() => {
                  applyManualLocation(manualLocationCandidate);
                }}
              >
                <span className={styles.locationResultLabel}>Use this location</span>
                <strong>{manualLocationCandidate.locationLabel}</strong>
                <span>
                  {manualLocationCandidate.latitude.toFixed(4)}, {manualLocationCandidate.longitude.toFixed(4)}
                </span>
              </button>
            ) : null}
            {manualLocationError ? <p className={styles.errorText}>{manualLocationError}</p> : null}
          </section>
        </div>
      ) : null}
      {isSchedulerOpen ? (
        <div className={styles.modalBackdrop}>
          <section className={`${styles.modal} ${styles.schedulerModal}`}>
            <p className={styles.modalEyebrow}>Scheduled flight</p>
            <h2>Create a planned flight and let forecast data auto-populate</h2>
            <p>
              Save a flight date and time in advance. Forecast data appears
              automatically once that slot enters the next {FORECAST_WINDOW_DAYS}-day weather window.
            </p>
            <div className={styles.schedulerForm}>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span>Flight name</span>
                <input
                  type="text"
                  value={scheduleDraft.title}
                  onChange={(event) => {
                    setScheduleDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }));
                  }}
                  placeholder="Example: Golden hour shoreline pass"
                />
              </label>
              <label className={styles.field}>
                <span>Date and time</span>
                <input
                  type="datetime-local"
                  value={scheduleDraft.scheduledAt}
                  min={formatDateTimeLocalValue(new Date())}
                  max={maxScheduledAt}
                  onChange={(event) => {
                    setScheduleDraft((current) => ({
                      ...current,
                      scheduledAt: event.target.value,
                    }));
                  }}
                />
              </label>
              <label className={styles.field}>
                <span>Reminder</span>
                <select
                  value={String(scheduleDraft.notifyOffsetMinutes)}
                  onChange={(event) => {
                    setScheduleDraft((current) => ({
                      ...current,
                      notifyOffsetMinutes: Number(event.target.value) || 0,
                    }));
                  }}
                >
                  {SCHEDULE_REMINDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.schedulerMeta}>
              <p>
                {coords && assessment?.locationLabel
                  ? `Flight location: ${assessment.locationLabel}`
                  : "Choose a location first so scheduled flights stay tied to the correct place."}
              </p>
              <p>
                Scheduled forecasts refresh whenever the app is opened, and you can use Update data to pull the latest changes.
              </p>
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={handleSaveScheduledFlight}
                disabled={!coords}
              >
                Save scheduled flight
              </button>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => {
                  setIsSchedulerOpen(false);
                }}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <header className={styles.masthead}>
        <div className={styles.brandBlock}>
          <div className={styles.brandTopRow}>
            <div className={styles.brandHeading}>
              <div className={styles.brandSignature}>
                <span className={styles.brandIcon}>
                  <BrandIcon />
                </span>
                <h1>
                  <span className={styles.brandWordmarkPrimary}>Do.I.</span>
                  <span className={styles.brandWordmarkAccent}>Fly?</span>
                </h1>
              </div>
              <p className={styles.brandTagline}>
                Wind-first drone flight guidance.
              </p>
              <p className={styles.brandPronunciation}>Read it as: Do I fly?</p>
            </div>

            <div className={styles.mastheadActions}>
              <button
                className={`${styles.secondaryButton} ${styles.scheduleTrigger}`}
                type="button"
                onClick={() => {
                  markScheduledUpdatesSeen();
                  setIsSchedulerOpen(true);
                }}
                aria-label={
                  hasUnseenScheduledReportUpdates
                    ? "Scheduled flight, new forecast data available"
                    : "Scheduled flight"
                }
              >
                Scheduled flight
                {hasUnseenScheduledReportUpdates ? (
                  <span className={styles.scheduleUpdateDot} aria-hidden="true" />
                ) : null}
              </button>
              <button
                className={styles.themeToggle}
                type="button"
                onClick={() => {
                  setVisualMode((current) => (current === "night" ? "day" : "night"));
                }}
                aria-label={`Switch to ${visualMode === "night" ? "day" : "night"} mode`}
              >
                <span className={styles.themeToggleLabel}>Theme</span>
                <strong>{visualMode === "night" ? "Night" : "Day"}</strong>
              </button>

              {authUser ? (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(true);
                  }}
                >
                  <span className={styles.themeToggleLabel}>Profile</span>
                  <strong>{authUser.username}</strong>
                </button>
              ) : null}

              {authUser ? (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    void handleSignOut();
                  }}
                >
                  Sign out
                </button>
              ) : null}

              {coords ? (
                <div className={styles.locationChip} aria-label={`Using location: ${locationLabel}`}>
                  <span className={styles.locationIcon}>
                    <LocationIcon />
                  </span>
                  <span className={styles.locationChipText}>
                    <span className={styles.locationChipLabel}>{locationChipLabel}</span>
                    <strong>{locationLabel}</strong>
                  </span>
                </div>
              ) : (
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => {
                    requestLocation();
                  }}
                  disabled={isRequestingLocation}
                >
                  <span className={styles.locationButtonContent}>
                    <span className={styles.locationIcon}>
                      <LocationIcon />
                    </span>
                    <span>
                      {isRequestingLocation ? "Requesting location..." : locationActionLabel}
                    </span>
                  </span>
                </button>
              )}
            </div>
          </div>
          <p className={styles.heroText}>
            Assess current wind, near-term conditions, and drone-specific constraints in one view.
          </p>
          <p className={styles.heroSupport}>
            {heroSupportCopy(coords, locationSource, locationIssue, locationLabel)}
          </p>
        </div>
      </header>
      {nextReminderFlight ? (
        <section className={`${styles.card} ${styles.reminderBanner} ${styles[activeReminderReport?.status ?? "limited_data"]}`}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Upcoming reminder</p>
              <h2>{nextReminderFlight.title}</h2>
            </div>
            <span className={styles.infoPill}>
              {formatScheduledDateTime(nextReminderFlight.scheduledAt)}
            </span>
          </div>
          <p className={styles.bodyText}>
            {activeReminderReport
              ? `${activeReminderReport.headline} Wind ${Math.round(activeReminderReport.weather?.windSpeedKph ?? 0)} km/h, gusts ${Math.round(activeReminderReport.weather?.gustKph ?? 0)} km/h, ${Math.round(activeReminderReport.weather?.temperatureC ?? 0)}°C.`
              : "This reminder is active. Use Update data to pull the latest forecast snapshot."}
          </p>
          <div className={styles.inlineActions}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => {
                refreshScheduledReports();
              }}
            >
              Update data
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => {
                setActiveReminderId(nextReminderFlight.id);
              }}
            >
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      <section className={styles.focusGrid}>
        <section className={`${styles.spotlightCard} ${styles.verdictSpotlight} ${styles[primaryStatus]}`}>
          <div className={styles.statusHalo} />
          <div className={styles.spotlightTop}>
            <div>
              <p className={styles.sectionEyebrow}>Fly / no-fly recommendation</p>
              <h2>{assessment?.headline ?? "Waiting for a precise location check."}</h2>
              <p className={styles.spotlightLead}>
                {mode === "personalized"
                  ? "Your drone profile, the local wind, and the active rule pack are being read together."
                  : "Generic mode stays conservative until local checks are available."}
              </p>
            </div>
            <div className={styles.verdictOrb}>
              <span>{formatStatusLabel(primaryStatus)}</span>
            </div>
          </div>

          <div className={styles.spotlightMetrics}>
            <article className={styles.metricCard}>
              <span>Aircraft</span>
              <strong>
                {mode === "personalized" ? profileSummary : `${profileSummary} · generic mode`}
              </strong>
            </article>
            <article className={styles.metricCard}>
              <span>Location</span>
              <strong>{assessment?.locationLabel ?? "Awaiting permission"}</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Confidence</span>
              <strong>{formatConfidenceLabel(assessment?.confidence)}</strong>
            </article>
          </div>

          <div className={styles.focusList}>
            {focusNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </section>

        <section className={`${styles.spotlightCard} ${styles.windSpotlight}`}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Wind focus</p>
              <h2>Read the air before you read the rest.</h2>
            </div>
            <span
              className={`${styles.infoPill} ${styles.windPill} ${
                currentWeather ? styles.windPillLive : styles.windPillWaiting
              }`}
            >
              {!currentWeather ? <span className={styles.windPillDot} /> : null}
              {currentWeather ? `${Math.round(currentWeather.windSpeedKph)} km/h` : "Stand by"}
            </span>
          </div>

          <div className={styles.windFocus}>
            <div className={styles.windStatsGrid}>
              <article className={styles.statCard}>
                <span>Wind speed</span>
                <strong>
                  {currentWeather ? `${Math.round(currentWeather.windSpeedKph)} km/h` : "--"}
                </strong>
              </article>
              <article className={styles.statCard}>
                <span>Direction</span>
                <strong>{currentWeather ? currentWeather.windDirectionLabel : "--"}</strong>
              </article>
              <article className={styles.statCard}>
                <span>Gusts</span>
                <strong>
                  {currentWeather ? `${Math.round(currentWeather.gustKph)} km/h` : "--"}
                </strong>
              </article>
              <article className={styles.statCard}>
                <span>Temperature</span>
                <strong>
                  {currentWeather ? `${Math.round(currentWeather.temperatureC)}°C` : "--"}
                </strong>
              </article>
            </div>

            <div className={styles.windCanvasStage}>
              <WindCanvas
                windSpeedKph={assessment?.weather?.current.windSpeedKph ?? 12}
                windDirectionDeg={assessment?.weather?.current.windDirectionDeg ?? 85}
                isPlaceholder={!hasLiveWeather}
                coordinates={coords ?? undefined}
                locationLabel={assessment?.locationLabel}
              />
            </div>
          </div>

          <p className={styles.windNarrative}>
            {currentWeather
              ? `Wind is currently flowing from ${currentWeather.windDirectionLabel}, with gusts up to ${Math.round(currentWeather.gustKph)} km/h.`
              : "Use device location or a custom place to animate live local flow lines and surface the current wind picture."}
          </p>

          <div className={styles.windForecastSection}>
            <div className={styles.windForecastHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Forecast window</p>
                <h3>Next {FORECAST_WINDOW_DAYS} days</h3>
              </div>
              <span className={styles.infoPill}>
                {FREE_FORECAST_HOURS}-hour hourly outlook
              </span>
            </div>
            {forecastByDay.length ? (
              <div className={styles.forecastDayTabs} role="tablist" aria-label="Forecast days">
                {forecastByDay.map((day) => (
                  <button
                    key={day.dateKey}
                    type="button"
                    role="tab"
                    aria-selected={activeForecastDayKey === day.dateKey}
                    className={`${styles.forecastDayTab} ${
                      activeForecastDayKey === day.dateKey ? styles.forecastDayTabActive : ""
                    }`}
                    onClick={() => {
                      scrollToForecastDay(day.dateKey);
                    }}
                  >
                    {formatForecastDayTabLabel(day.points[0]?.time ?? `${day.dateKey}T00:00:00`)}
                  </button>
                ))}
              </div>
            ) : null}
            <div
              className={styles.forecastDayScroller}
              ref={forecastDayScrollerRef}
              onScroll={(event) => {
                const container = event.currentTarget;
                const scrollCenter = container.scrollTop + container.clientHeight * 0.25;
                let closestDayKey = activeForecastDayKey;
                let smallestDelta = Number.POSITIVE_INFINITY;

                forecastByDay.forEach((day) => {
                  const section = forecastDaySectionRefs.current[day.dateKey];
                  if (!section) {
                    return;
                  }

                  const sectionTop = section.offsetTop - container.offsetTop;
                  const delta = Math.abs(sectionTop - scrollCenter);

                  if (delta < smallestDelta) {
                    smallestDelta = delta;
                    closestDayKey = day.dateKey;
                  }
                });

                if (closestDayKey && closestDayKey !== activeForecastDayKey) {
                  setActiveForecastDayKey(closestDayKey);
                }
              }}
            >
              {forecastByDay.length ? (
                forecastByDay.map((day) => (
                  <section
                    key={day.dateKey}
                    className={styles.forecastDaySection}
                    ref={(node) => {
                      forecastDaySectionRefs.current[day.dateKey] = node;
                    }}
                  >
                    <div className={styles.forecastDayHeader}>
                      <h4>{day.label}</h4>
                      <span>{day.points.length} points</span>
                    </div>
                    <div className={styles.forecastDayGrid}>
                      {day.points.map((point) => (
                        <article
                          key={point.time}
                          className={`${styles.forecastPoint} ${styles[point.status]}`}
                        >
                          <span className={styles.forecastTime}>{formatTime(point.time)}</span>
                          <strong>{Math.round(point.windSpeedKph)} km/h</strong>
                          <p>
                            {point.windDirectionLabel} wind, {Math.round(point.temperatureC)}°C
                          </p>
                          <span className={styles.forecastBadge}>
                            {formatStatusLabel(point.status)}
                          </span>
                        </article>
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <article className={styles.forecastPlaceholder}>
                  <h3>No live {FORECAST_WINDOW_DAYS}-day forecast yet</h3>
                  <p>
                    Use device location or a custom place to load the forecast and animate local wind currents.
                  </p>
                </article>
              )}
            </div>
          </div>
        </section>
      </section>

      <main className={styles.grid}>
        <section className={`${styles.card} ${styles.profileCard}`}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Aircraft setup</p>
              <h2>Choose your drone</h2>
            </div>
            <span
              className={`${styles.infoPill} ${styles.storagePill} ${
                authUser ? styles.storagePillAccepted : styles.storagePillDeclined
              }`}
            >
              <span className={styles.storagePillDot} />
              {authUser ? "Synced" : "Not signed in"}
            </span>
          </div>
          <p className={styles.bodyText}>
            Pick the aircraft model once. Do.I.Fly? fills the manufacturer, class,
            category, and reference weight automatically.
          </p>
          <div className={styles.formGrid}>
            <div className={`${styles.field} ${styles.fieldWide}`} ref={aircraftPickerRef}>
              <span>Aircraft model</span>
              <button
                type="button"
                className={styles.comboTrigger}
                aria-expanded={isAircraftPickerOpen}
                aria-haspopup="dialog"
                onClick={() => {
                  setIsAircraftPickerOpen((current) => !current);
                }}
              >
                <span className={styles.comboTriggerText}>
                  <strong>{aircraftSummaryLabel}</strong>
                  <span>{aircraftGroupLabel}</span>
                </span>
                <span className={styles.comboTriggerChevron} aria-hidden="true">
                  {isAircraftPickerOpen ? "−" : "+"}
                </span>
              </button>
              <span className={styles.fieldHint}>
                Tap to browse the catalog. Search opens inside the list.
              </span>

              {isAircraftPickerOpen ? (
                <div className={styles.comboPanel} role="dialog" aria-label="Aircraft model picker">
                  <div className={styles.comboPanelHeader}>
                    <div>
                      <strong>Choose an aircraft</strong>
                      <span>
                        {normalizedAircraftQuery
                          ? `${filteredDroneCatalog.length} matching aircraft`
                          : "Search by model, manufacturer, class, or category"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.comboClose}
                      onClick={() => {
                        setIsAircraftPickerOpen(false);
                      }}
                      aria-label="Close aircraft picker"
                    >
                      Close
                    </button>
                  </div>
                  <input
                    ref={aircraftSearchInputRef}
                    className={styles.comboSearch}
                    type="search"
                    value={aircraftQuery}
                    onChange={(event) => {
                      setAircraftQuery(event.target.value);
                    }}
                    placeholder="Search aircraft"
                  />
                  <div className={styles.comboList}>
                    {selectedCatalogEntry && !selectedAircraftInFilteredList ? (
                      <button
                        type="button"
                        className={`${styles.comboOption} ${styles.comboOptionSelected}`}
                        onClick={() => {
                          selectCatalogAircraft(selectedCatalogEntry.modelId);
                        }}
                      >
                        <strong>{selectedCatalogEntry.modelName}</strong>
                        <span>{selectedCatalogEntry.manufacturer} · {selectedCatalogEntry.classLabel}</span>
                      </button>
                    ) : null}
                    {groupedDroneCatalog.length ? (
                      groupedDroneCatalog.map(([groupLabel, entries]) => (
                        <section key={groupLabel} className={styles.comboGroup}>
                          <p>{groupLabel}</p>
                          <div className={styles.comboGroupList}>
                            {entries.map((entry) => (
                              <button
                                key={entry.modelId}
                                type="button"
                                className={`${styles.comboOption} ${
                                  profile.modelId === entry.modelId ? styles.comboOptionSelected : ""
                                }`}
                                onClick={() => {
                                  selectCatalogAircraft(entry.modelId);
                                }}
                              >
                                <strong>{entry.modelName}</strong>
                                <span>{entry.manufacturer} · {entry.classLabel} · {entry.category}</span>
                              </button>
                            ))}
                          </div>
                        </section>
                      ))
                    ) : (
                      <div className={styles.comboEmpty}>
                        No aircraft match this search. You can use Other for a custom build.
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className={styles.comboCustomAction}
                    onClick={() => {
                      selectCustomAircraft();
                    }}
                  >
                    Other / custom FPV drone
                  </button>
                </div>
              ) : null}
            </div>

              <label className={styles.field}>
                <span>Operation</span>
                <select
                  value={profile.operationPurpose}
                  onChange={(event) => {
                    setProfile((current) => ({
                      ...current,
                      operationPurpose:
                        event.target.value === "business" ? "business" : "recreational",
                    }));
                  }}
                >
                  <option value="recreational">Recreational</option>
                  <option value="business">Business</option>
                </select>
              </label>
              {isCustomAircraft ? (
                <>
                  <label className={`${styles.field} ${styles.fieldWide}`}>
                    <span>Custom drone name</span>
                    <input
                      type="text"
                      value={profile.modelName}
                      onChange={(event) => {
                        setProfile((current) => ({
                          ...current,
                          manufacturer: "Custom",
                          modelName: event.target.value,
                        }));
                      }}
                      placeholder="Example: 5-inch FPV freestyle build"
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Class</span>
                    <select
                      value={profile.classLabel}
                      onChange={(event) => {
                        setProfile((current) => ({
                          ...current,
                          classLabel: event.target.value as DroneClassLabel,
                        }));
                      }}
                    >
                      {DRONE_CLASS_OPTIONS.map((classLabel) => (
                        <option key={classLabel} value={classLabel}>
                          {classLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Weight (g)</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={String(profile.weightGrams)}
                      onChange={(event) => {
                        setProfile((current) => ({
                          ...current,
                          weightGrams: Math.max(1, Number(event.target.value) || 1),
                        }));
                      }}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Category</span>
                    <select
                      value={profile.category}
                      onChange={(event) => {
                        setProfile((current) => ({
                          ...current,
                          category: event.target.value,
                        }));
                      }}
                    >
                      {CUSTOM_CATEGORY_OPTIONS.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
          </div>
          <div className={styles.profileSpecs}>
            <article className={styles.specCard}>
              <span>Manufacturer</span>
              <strong>{aircraftSpecManufacturer}</strong>
            </article>
            <article className={styles.specCard}>
              <span>Class</span>
              <strong>{aircraftSpecClass}</strong>
            </article>
            <article className={styles.specCard}>
              <span>Weight</span>
              <strong>{aircraftSpecWeight} g</strong>
            </article>
            <article className={styles.specCard}>
              <span>Category</span>
              <strong>{aircraftSpecCategory}</strong>
            </article>
            <article className={styles.specCard}>
              <span>Official wind rating</span>
              <strong>
                {selectedCatalogEntry
                  ? formatOfficialWindRating(selectedCatalogEntry)
                  : "Manual aircraft"}
              </strong>
            </article>
          </div>
          {selectedCatalogEntry?.officialWindRating ? (
            <p className={styles.specMeta}>
              Source:{" "}
              <a
                href={selectedCatalogEntry?.officialWindRating.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {selectedCatalogEntry?.officialWindRating.sourceName}
              </a>
              {selectedCatalogEntry?.officialWindRating.note
                ? ` · ${selectedCatalogEntry.officialWindRating.note}`
                : ""}
            </p>
          ) : isCustomAircraft ? (
            <p className={styles.specMeta}>
              Custom aircraft use your manual class, weight, and category values. Add the
              closest official wind rating yourself outside the app if the build has no
              published manufacturer limit.
            </p>
          ) : (
            <p className={styles.specMeta}>
              No verified manufacturer wind rating is stored for this model yet. Do.I.Fly?
              will use its conservative weight-based advisory band instead.
            </p>
          )}
          <p className={styles.catalogNote}>
            {mode === "personalized"
              ? "Certified drone catalog sourced from the EU Drone Port list and grouped by EASA class label and manufacturer."
              : "You can still select a drone in generic mode. The choice stays in this session unless you allow device storage."}
          </p>

          <div className={styles.licenseBlock}>
            <p>Licenses and registrations</p>
            <div className={styles.licenseList}>
              {LICENSE_OPTIONS.map((license) => (
                <label key={license.value} className={styles.licenseCard}>
                  <input
                    type="checkbox"
                    checked={profile.licenses.includes(license.value)}
                    onChange={() => toggleLicense(license.value)}
                  />
                  <div className={styles.licenseCardBody}>
                    <div className={styles.licenseCardTop}>
                      <strong>{license.label}</strong>
                      <span className={styles.licensePurpose}>{license.purpose}</span>
                    </div>
                    <p>{license.description}</p>
                    <div className={styles.licenseMeta}>
                      <span>{license.region}</span>
                      <span>{license.validFor}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </section>

        {mode === "generic" ? (
          <section className={`${styles.card} ${styles.genericCard}`}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Generic advisory mode</p>
                <h2>Broad guidance when consent or location is missing</h2>
              </div>
              <span className={styles.infoPill}>Non-personalized</span>
            </div>
            <p className={styles.bodyText}>
              These cards are conservative examples only. They are not location-verified
              and they are not a substitute for a local airspace check.
            </p>
            <div className={styles.genericList}>
              {genericCards.map((card) => (
                <article key={card.id} className={`${styles.genericAdvisory} ${styles[card.status]}`}>
                  <div className={styles.genericHeader}>
                    <div>
                      <h3>{card.title}</h3>
                      <p>{card.subtitle}</p>
                    </div>
                    <span className={styles.statusBadge}>
                      {formatStatusLabel(card.status)}
                    </span>
                  </div>
                  <p>{card.summary}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section
          className={`${styles.card} ${
            mode === "generic" ? styles.localCheckCardWithGeneric : styles.localCheckCardStandalone
          } ${styles.localCheckCard}`}
        >
          <div className={`${styles.sectionHeader} ${styles.localChecksHeader}`}>
            <div className={styles.localChecksTitleBlock}>
              <p className={styles.sectionEyebrow}>Local checks</p>
              <h2>Permission check and what Do.I.Fly? checked</h2>
            </div>
            <div className={`${styles.headerPills} ${styles.localChecksPills}`}>
              <span className={styles.infoPill}>
                {coords
                  ? locationSource === "manual"
                    ? "Manual location"
                    : locationSource === "approximate"
                      ? "Approximate location"
                    : "Location ready"
                  : locationCapability === "insecure_origin"
                    ? "HTTPS needed"
                  : consent.locationPermission === "denied"
                    ? "Blocked"
                    : "Waiting"}
              </span>
              <span className={styles.infoPill}>
                {assessment?.regulatory?.countryCode || "Country pack pending"}
              </span>
            </div>
          </div>
          <div className={styles.localCheckGrid}>
            <section className={styles.localCheckPanel}>
              <h3>Location access</h3>
              <p className={`${styles.bodyText} ${styles.localCheckIntro}`}>
                Device location only runs after you tap the button. If the browser blocks
                it, or the page is not in a secure context, you can still enter a custom
                place instead.
              </p>
              <div className={styles.locationSourcePanel}>
                <span className={styles.locationSourceLabel}>Source in use</span>
                <strong>{locationSourceTitle}</strong>
                <p className={styles.helperText}>{locationSourceDescription}</p>
              </div>
              <div className={styles.locationActionButtons}>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    rememberLocationPromptSeen();
                    requestLocation();
                  }}
                  disabled={isRequestingLocation}
                >
                  {locationActionLabel}
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    rememberLocationPromptSeen();
                    inlineManualLocationInputRef.current?.focus();
                  }}
                >
                  Use custom location
                </button>
                {coords ? (
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={clearLocationSelection}
                  >
                    Clear location
                  </button>
                ) : null}
              </div>
              <p className={styles.helperText}>
                {coords
                  ? `Current area: ${locationLabel}.`
                  : locationIssue.kind !== "none"
                    ? locationIssue.message
                    : "Without location, the app stays generic and non-verified."}
              </p>
              <form
                className={styles.inlineManualLocationForm}
                onSubmit={(event) => {
                  rememberLocationPromptSeen();
                  void handleManualLocationSearch(event);
                }}
              >
                <label className={styles.inlineManualField}>
                  <span>Enter place manually</span>
                  <div className={styles.inlineManualInputWrap}>
                    <input
                      ref={inlineManualLocationInputRef}
                      type="text"
                      value={manualLocationQuery}
                      onChange={(event) => {
                        setManualLocationQuery(event.target.value);
                      }}
                      placeholder="Example: Central Park, New York"
                    />
                    <button
                      className={`${styles.secondaryButton} ${styles.inlineSearchButton}`}
                      type="submit"
                      disabled={manualLocationSearchState === "loading"}
                    >
                      {manualLocationSearchState === "loading" ? "Searching..." : "Search"}
                    </button>
                  </div>
                </label>
              </form>
              {manualLocationCandidate ? (
                <button
                  type="button"
                  className={styles.locationResultCard}
                  onClick={() => {
                    applyManualLocation(manualLocationCandidate);
                  }}
                >
                  <span className={styles.locationResultLabel}>Use this location</span>
                  <strong>{manualLocationCandidate.locationLabel}</strong>
                  <span>
                    {manualLocationCandidate.latitude.toFixed(4)}, {manualLocationCandidate.longitude.toFixed(4)}
                  </span>
                </button>
              ) : manualLocationError ? (
                <p className={styles.errorText}>{manualLocationError}</p>
              ) : (
                <p className={styles.inlineManualHint}>
                  Search by city, park, beach, or full address to set a custom flight area.
                </p>
              )}
            </section>
            <section className={styles.localCheckPanel}>
              <h3>What Do.I.Fly? checked</h3>
              <p className={styles.bodyText}>
                {assessment?.regulatory?.summary ??
                  "Country-specific rule packs appear once location is available."}
              </p>
              {assessment?.reasons?.length ? (
                <ul className={styles.reasonList}>
                  {assessment.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
              {assessment?.warnings?.length ? (
                <ul className={styles.warningList}>
                  {assessment.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          </div>
        </section>

        <section className={`${styles.card} ${styles.wideCard} ${styles.scheduleCard}`}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Scheduled flights</p>
              <h2>Plan ahead and auto-sync scheduled forecasts</h2>
            </div>
            <div className={styles.headerPills}>
              <span className={styles.infoPill}>
                {scheduledFlightsSorted.length} saved
              </span>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => {
                  refreshScheduledReports();
                }}
                disabled={!coords || scheduledFlightsSorted.length === 0}
              >
                Update data
              </button>
            </div>
          </div>
          <p className={styles.bodyText}>
            Scheduled flights stay on-device when storage is enabled and refresh their forecast report whenever the app is open.
          </p>
          {scheduledFlightsSorted.length ? (
            <div className={styles.scheduledFlightList}>
              {scheduledFlightsSorted.map((flight) => {
                const reportState = scheduledReports[flight.id];

                return (
                  <article
                    key={flight.id}
                    className={`${styles.scheduledFlightCard} ${
                      styles[reportState?.report?.status ?? "limited_data"]
                    }`}
                  >
                    <div className={styles.scheduledFlightTop}>
                      <div>
                        <h3>{flight.title}</h3>
                        <p>
                          {formatScheduledDateTime(flight.scheduledAt)}
                          {flight.notifyOffsetMinutes > 0
                            ? ` · reminder ${flight.notifyOffsetMinutes} min before`
                            : " · no reminder"}
                        </p>
                      </div>
                      <span className={styles.statusBadge}>
                        {reportState?.report
                          ? formatStatusLabel(reportState.report.status)
                          : reportState?.state === "pending"
                            ? "Pending data"
                          : reportState?.state === "error"
                            ? "Unavailable"
                            : "Loading"}
                      </span>
                    </div>

                    {reportState?.state === "ready" && reportState.report ? (
                      <>
                        <p className={styles.bodyText}>{reportState.report.headline}</p>
                        <div className={styles.scheduleMetrics}>
                          <article className={styles.metricCard}>
                            <span>Forecast hour</span>
                            <strong>{formatScheduledDateTime(reportState.report.forecastFor)}</strong>
                          </article>
                          <article className={styles.metricCard}>
                            <span>Wind</span>
                            <strong>{Math.round(reportState.report.weather?.windSpeedKph ?? 0)} km/h</strong>
                          </article>
                          <article className={styles.metricCard}>
                            <span>Gusts</span>
                            <strong>{Math.round(reportState.report.weather?.gustKph ?? 0)} km/h</strong>
                          </article>
                          <article className={styles.metricCard}>
                            <span>Temperature</span>
                            <strong>{Math.round(reportState.report.weather?.temperatureC ?? 0)}°C</strong>
                          </article>
                        </div>
                      </>
                    ) : reportState?.state === "error" ? (
                      <p className={styles.errorText}>{reportState.error}</p>
                    ) : reportState?.state === "pending" ? (
                      <p className={styles.bodyText}>
                        {reportState.error ??
                          `Forecast data will appear automatically once this flight is within the next ${FORECAST_WINDOW_DAYS} days.`}
                      </p>
                    ) : (
                      <p className={styles.bodyText}>Loading the scheduled-flight forecast report…</p>
                    )}

                    <div className={styles.inlineActions}>
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() => {
                          refreshScheduledReports();
                        }}
                      >
                        Update data
                      </button>
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() => {
                          handleDeleteScheduledFlight(flight.id);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <article className={styles.forecastPlaceholder}>
              <h3>No scheduled flights yet</h3>
              <p>
                Use the Scheduled flight button in the top bar to save a planned takeoff and generate a forecast report card.
              </p>
            </article>
          )}
        </section>
      </main>

      <section className={styles.legendPanel}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Legend</p>
            <h2>How confidence is calculated</h2>
          </div>
        </div>
        <p className={styles.bodyText}>
          Confidence measures how complete and specific the app&apos;s inputs are, not how
          favorable the recommendation is. In this build it combines the assessment mode,
          whether the selected country has a supported rule pack, how strong the drone wind
          rating source is, and whether the result is based on current conditions or a future
          forecast.
        </p>
        <div className={styles.legendGrid}>
          {CONFIDENCE_LEGEND.map((item) => (
            <article key={item.key} className={styles.legendCard}>
              <span className={`${styles.legendBadge} ${styles[`legend${item.label}`]}`}>
                {item.label}
              </span>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className={styles.footerDisclaimer}>
        <div className={styles.footerDisclaimerMain}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setIsProfileOpen(true)}
            >
              Review synced profile
            </button>
            {authUser ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  void handleSignOut();
                }}
              >
                Sign out
              </button>
            ) : null}
          </div>
          <p>
            {authUser
              ? `Signed in as ${authUser.username}. Any changes to the drone profile, scheduled flights, drone certification, and theme preference sync through your Supabase profile.`
              : "Sign in to sync your drone profile, scheduled flights, certification, and theme preference across devices."}
          </p>
        </div>
        <div className={styles.footerDisclaimerMeta}>
          <p>
            The live wind view covers current conditions plus the next {FORECAST_WINDOW_DAYS} days.
          </p>
          <p>
            {isAssessmentLoading
              ? "Refreshing live assessment..."
              : assessment?.updatedAt
                ? `Last updated ${new Date(assessment.updatedAt).toLocaleTimeString()}`
                : "No live assessment yet."}
          </p>
        </div>
        {assessment?.sources?.length ? (
          <ul className={styles.footerSources}>
            {assessment.sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        ) : null}
        {scheduleNotice ? <p className={styles.updatedText}>{scheduleNotice}</p> : null}
        {errorMessage ? <p className={styles.errorText}>{errorMessage}</p> : null}
      </footer>
    </div>
  );
}
