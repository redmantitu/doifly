export type DroneClassLabel = "C0" | "C1" | "C2" | "C3" | "C4" | "C5" | "C6";

export interface OfficialWindRating {
  label: string;
  sourceName: string;
  sourceUrl: string;
  maxWindResistanceMs?: number;
  note?: string;
}

export interface DroneCatalogEntry {
  modelId: string;
  manufacturer: string;
  modelName: string;
  weightGrams: number;
  classLabel: DroneClassLabel;
  category: string;
  officialWindRating?: OfficialWindRating;
}

interface RawDroneGroup {
  classLabel: DroneClassLabel;
  entries: Array<{
    model: string;
    manufacturer: string;
  }>;
}

const CLASS_WEIGHT_GRAMS: Record<DroneClassLabel, number> = {
  C0: 249,
  C1: 900,
  C2: 3999,
  C3: 24999,
  C4: 24999,
  C5: 24999,
  C6: 24999,
};

const CLASS_CATEGORY: Record<DroneClassLabel, string> = {
  C0: "Open",
  C1: "Open",
  C2: "Open",
  C3: "Specific",
  C4: "Specific",
  C5: "Specific",
  C6: "Specific",
};

const MANUFACTURER_ALIASES: Record<string, string> = {
  "DJI GmbH": "DJI",
  "Yuneec Europe Gmbh": "Yuneec",
  "Sensefly SA": "SenseFly",
  "CAVOK UAS": "Cavok UAS",
  "INNOVADRONE LLC": "Innovadrone LLC",
  "OBJECTIF DRONE PRODUCTION": "Objectif Drone Production",
  DRONAVIA: "Dronavia",
  "Flying Eye": "Flyingeye",
  "Houssard, Francois": "Houssard, François",
};

const MODEL_PREFIXES: Record<string, string[]> = {
  DJI: ["DJI "],
  Delair: ["Delair "],
  SenseFly: ["SenseFly ", "Sensefly "],
  Wingtra: ["Wingtra "],
  Yuneec: ["Yuneec "],
};

const RAW_DRONE_GROUPS: RawDroneGroup[] = [
  {
    classLabel: "C0",
    entries: [
      { model: "DJI Mini 2 SE", manufacturer: "DJI" },
      { model: "DJI Mini 3 & Mini 3 Pro", manufacturer: "DJI" },
      {
        model: "DJI Mini 4 Pro (Fly More Combo version 249 g)",
        manufacturer: "DJI",
      },
      { model: "DJI Mini 4K", manufacturer: "DJI" },
      { model: "DJI Mini 5 Pro", manufacturer: "DJI" },
      { model: "DJI Flip", manufacturer: "DJI" },
      {
        model: "ATOM",
        manufacturer: "Shenzhen Potensic Intelligent Co., Ltd",
      },
      {
        model: "ATOM LT",
        manufacturer: "Shenzhen Potensic Intelligent Co., Ltd",
      },
      {
        model: "ATOM SE",
        manufacturer: "Shenzhen Potensic Intelligent Co., Ltd",
      },
      {
        model: "ATOM 2",
        manufacturer: "Shenzhen Potensic Intelligent Co., Ltd",
      },
      {
        model: "Wipkviey T28",
        manufacturer: "Shantou Tianyi Intelligent Technology Co., Ltd.",
      },
      {
        model: "Wipkviey B12",
        manufacturer: "Shantou Tianyi Intelligent Technology Co., Ltd.",
      },
      {
        model: "Wipkviey T25",
        manufacturer: "Shantou Tianyi Intelligent Technology Co., Ltd.",
      },
      {
        model: "Wipkviey T26",
        manufacturer: "Shantou Tianyi Intelligent Technology Co., Ltd.",
      },
      {
        model: "Wipkviey TY-B15",
        manufacturer: "Shantou Tianyi Intelligent Technology Co., Ltd.",
      },
      {
        model: "Wipkviey TY-T18",
        manufacturer: "Shantou Tianyi Intelligent Technology Co., Ltd.",
      },
      {
        model: "Wipkviey TY-T6",
        manufacturer: "Shantou Tianyi Intelligent Technology Co., Ltd.",
      },
      { model: "DJI Neo", manufacturer: "DJI GmbH" },
      { model: "EVO Nano+", manufacturer: "Autel Robotics" },
      { model: "EVO Nano", manufacturer: "Autel Robotics" },
      {
        model: "2.4Ghz Radio Control Toy Mini Drone",
        manufacturer: "GREAT GATEWAY INTERNATIONAL LTD",
      },
      {
        model: "2.4Ghz Radio Control Toy Drone",
        manufacturer: "GREAT GATEWAY INTERNATIONAL LTD",
      },
      {
        model: "2.4Ghz Radio Control Toy Drone with camera",
        manufacturer: "GREAT GATEWAY INTERNATIONAL LTD",
      },
    ],
  },
  {
    classLabel: "C1",
    entries: [
      {
        model: "DJI Mavic 3 Classic, Mavic 3 v2.0, & Mavic 3 Cine v2.0",
        manufacturer: "DJI",
      },
      { model: "DJI Air 2S", manufacturer: "DJI" },
      { model: "DJI Air 3", manufacturer: "DJI" },
      { model: "DJI Air 3S", manufacturer: "DJI" },
      {
        model: "DJI Mini 4 Pro (Fly More Combo version 342 g)",
        manufacturer: "DJI",
      },
      { model: "DJI Avata 2", manufacturer: "DJI" },
      { model: "EVO Lite 640T Enterprise", manufacturer: "Autel Robotics" },
      { model: "EVO Lite 6K Enterprise", manufacturer: "Autel Robotics" },
      { model: "EVO Lite +", manufacturer: "Autel Robotics" },
      { model: "EVO Lite", manufacturer: "Autel Robotics" },
    ],
  },
  {
    classLabel: "C2",
    entries: [
      { model: "Sensefly eBee", manufacturer: "AgEagle" },
      {
        model: "DJI Mavic 3E EU, Mavic 3T EU & Mavic 3M EU",
        manufacturer: "DJI",
      },
      {
        model: "DJI Matrice M30 EU & Matrice M30T EU",
        manufacturer: "DJI",
      },
      { model: "DJI Mavic 3 Pro", manufacturer: "DJI" },
      { model: "DJI Matrice 4E", manufacturer: "DJI" },
      { model: "DJI Matrice 4T", manufacturer: "DJI" },
      { model: "DJI Mavic 4 Pro", manufacturer: "DJI" },
      { model: "DJI Dock 3 and Matrice 4D Series", manufacturer: "DJI" },
      { model: "DJI Matrice 4T (C2 – low-speed mode)", manufacturer: "DJI" },
      { model: "DJI Matrice 4E (C2 – low-speed mode)", manufacturer: "DJI" },
      { model: "DJI Mavic 4 Pro (C2 – low-speed mode)", manufacturer: "DJI" },
      { model: "EVO II v3", manufacturer: "Autel Robotics" },
      { model: "EVO MAX 4T Xe", manufacturer: "Autel Robotics" },
      { model: "EVO Max 4N", manufacturer: "Autel Robotics" },
      { model: "EVO Max 4N V2", manufacturer: "Autel Robotics" },
      { model: "EVO Max 4T V2", manufacturer: "Autel Robotics" },
      { model: "EVO Max 4T", manufacturer: "Autel Robotics" },
      { model: "EVO II Pro v3", manufacturer: "Autel Robotics" },
      { model: "EVO II Pro Enterprise V3", manufacturer: "Autel Robotics" },
      {
        model: "EVO II Dual 640T Enterprise V3",
        manufacturer: "Autel Robotics",
      },
      {
        model: "EVO II Dual 640T RTK V3",
        manufacturer: "Autel Robotics",
      },
      { model: "EVO II Dual 640T V3", manufacturer: "Autel Robotics" },
      { model: "EVO Max 4NZ V2", manufacturer: "Autel Robotics" },
      { model: "Yuneec H520E", manufacturer: "Yuneec Europe Gmbh" },
      { model: "Yuneec H520E-RTK", manufacturer: "Yuneec Europe Gmbh" },
      { model: "SenseFly eBeeX", manufacturer: "Sensefly SA" },
      { model: "AQUILA", manufacturer: "ARGOSDYNE Co., Ltd." },
    ],
  },
  {
    classLabel: "C3",
    entries: [
      { model: "Trinity F90+", manufacturer: "Quantum System" },
      { model: "Trinity R10", manufacturer: "Quantum System" },
      { model: "DJI Inspire 3", manufacturer: "DJI" },
      { model: "DJI Matrice 350 RTK", manufacturer: "DJI" },
      { model: "WingtraOne GenII", manufacturer: "Wingtra" },
      {
        model: "UX 11 (Camera AG,IR,RGB) & UX 11 Longue (Elongation Camera AG,IR,RGB)",
        manufacturer: "Delair",
      },
      { model: "Autel Alpha", manufacturer: "Autel Robotics" },
      { model: "Dragonfish Standard", manufacturer: "Autel Robotics" },
      { model: "Dragonfish Lite", manufacturer: "Autel Robotics" },
      { model: "HIGHDRA", manufacturer: "starcopter GmbH" },
      { model: "AQUILA3 (AL-300FM)", manufacturer: "ARGOSDYNE Co., Ltd." },
    ],
  },
  {
    classLabel: "C4",
    entries: [{ model: "ABZ Innovation M12", manufacturer: "ABZ Innovation Kft." }],
  },
  {
    classLabel: "C5",
    entries: [
      {
        model: "M350 RTK Failsafe (through kit developed by Flyingeye)",
        manufacturer: "DJI",
      },
      {
        model: "Matrice 350 RTK (through kit developed by Dronavia)",
        manufacturer: "DJI",
      },
      { model: "Chronos", manufacturer: "Objectif Drone Production" },
      { model: "Chronos Mini+", manufacturer: "Objectif Drone Production" },
      { model: "Agry X", manufacturer: "Aerobotic" },
      { model: "Spray – L", manufacturer: "Aerobotic" },
      { model: "Spray – S", manufacturer: "Aerobotic" },
      { model: "Kronos AD Matrice 4E", manufacturer: "Dronavia" },
      { model: "Kronos AD Matrice 4T", manufacturer: "Dronavia" },
      { model: "Kronos AD Mavic 3E", manufacturer: "Dronavia" },
      { model: "Kronos AD Mavic 3T", manufacturer: "Dronavia" },
      { model: "Kronos AD Mavic 3M", manufacturer: "Dronavia" },
      { model: "Mavic 3E Flysafe C5", manufacturer: "Flyingeye" },
      { model: "Mavic 3T Flysafe C5", manufacturer: "Flyingeye" },
      { model: "Mavic 3 Pro Cine Flysafe C5", manufacturer: "Flyingeye" },
      { model: "Mavic 3 Pro Flysafe C5", manufacturer: "Flyingeye" },
      { model: "Matrice 30T Flysafe C5", manufacturer: "Flyingeye" },
      { model: "Matrice 30 Flysafe C5", manufacturer: "Flyingeye" },
      { model: "Mavic 3M Flysafe", manufacturer: "Flyingeye" },
      { model: "Mavic 3M Flysafe C5CK-9", manufacturer: "Flyingeye" },
      { model: "CK-25 Cleaning", manufacturer: "Cavok UAS" },
      { model: "ATLAS", manufacturer: "Cavok UAS" },
      { model: "Ares", manufacturer: "Objectif Drone Production" },
      { model: "Innovadrone 410", manufacturer: "Objectif Drone Production" },
      { model: "Aeotic S-R", manufacturer: "Innovadrone LLC" },
      { model: "SafeAir M350 Pro", manufacturer: "Aeotic" },
      { model: "Skynnov AQ3F", manufacturer: "ParaZero Technologies Ltd" },
      { model: "Ck9 C5/C6", manufacturer: "Aeromapping Solutions" },
      { model: "CK9 Cleaning/pulverisation", manufacturer: "Cavok UAS" },
      { model: "Kronos AD Mavic 3 Pro Cine", manufacturer: "Cavok UAS" },
      { model: "Kronos AD Mavic 3 Pro", manufacturer: "Dronavia" },
      { model: "Kronos AD Matrice 4T / 4E", manufacturer: "Dronavia" },
      { model: "Kronos AD Matrice 30 / 30T", manufacturer: "Dronavia" },
      { model: "Inspire 3 C5", manufacturer: "Dronavia" },
      { model: "Matrice 350 RTK C5", manufacturer: "Dronavia" },
      { model: "Surveyor Tethered", manufacturer: "Innovadrone LLC" },
      { model: "NDN Electric Drone", manufacturer: "NOKIA Solutions and Networks" },
      {
        model: "AVSS PRS- M3DTEX",
        manufacturer: "AVSS – Aerial Vehicle Safety Solutions Inc.",
      },
      {
        model: "AVSS PRS- M350EX",
        manufacturer: "AVSS – Aerial Vehicle Safety Solutions Inc.",
      },
      { model: "MANTA", manufacturer: "OBJECTIF DRONE PRODUCTION" },
      { model: "AD405 Spray", manufacturer: "Artech’Drone" },
      { model: "AD405", manufacturer: "Artech’Drone" },
      { model: "AD410 Spray", manufacturer: "Artech’Drone" },
      { model: "AD410", manufacturer: "Artech’Drone" },
      { model: "DEN-S Spray", manufacturer: "Artech’Drone" },
      { model: "SafeAir Mavic 3", manufacturer: "ParaZero Technologies Ltd" },
      { model: "Kronos AD Matrice 30", manufacturer: "DRONAVIA" },
      { model: "Kronos AD Matrice 30T", manufacturer: "DRONAVIA" },
      { model: "SURVEYOR XL C5", manufacturer: "INNOVADRONE LLC" },
      { model: "AD420 Tethered", manufacturer: "Artech’Drone" },
      { model: "Servidrone1000 C5", manufacturer: "Houssard, Francois" },
      { model: "Servidrone900 C5", manufacturer: "Houssard, Francois" },
      { model: "Matrice 4T Flysafe C5", manufacturer: "Flying Eye" },
      { model: "Matrice 4 Flysafe C5", manufacturer: "Flying Eye" },
      { model: "SURVEYOR C5", manufacturer: "INNOVADRONE LLC" },
      { model: "Inspire 3 Flysafe C5", manufacturer: "Flying Eye" },
      { model: "CK-25 cleaning", manufacturer: "CAVOK UAS" },
      { model: "INNOVADRONE 410", manufacturer: "INNOVADRONE LLC" },
      { model: "SERVIDRONE1000 C5 Captive", manufacturer: "Houssard, François" },
      { model: "SERVIDRONE900 C5 Captive", manufacturer: "Houssard, François" },
      { model: "Eurosafe Mavic 3M / 3T / 3E", manufacturer: "EUROSAFE SYSTEMS, S.L." },
    ],
  },
  {
    classLabel: "C6",
    entries: [
      { model: "UX11 (camera RGB, AG, IR)", manufacturer: "Delair" },
      {
        model: "Delair UX11 Longue Elongation Caméra (AG, IR, RGB, IR Radiométrique)",
        manufacturer: "Delair",
      },
      { model: "Agry X", manufacturer: "Aerobotic" },
      { model: "Spray – L", manufacturer: "Aerobotic" },
      { model: "Spray – S", manufacturer: "Aerobotic" },
      { model: "FireHound | FH-0", manufacturer: "Vector Robotics" },
      { model: "Guardian", manufacturer: "Vector Robotics" },
      { model: "Aeotic S-R", manufacturer: "Aeotic" },
      { model: "CK25 C6", manufacturer: "Cavok UAS" },
      { model: "CK23VE SW C6", manufacturer: "Cavok UAS" },
      { model: "Ck9 C5/C6", manufacturer: "Cavok UAS" },
      { model: "NDN Electric Drone", manufacturer: "NOKIA Solutions and Networks" },
      {
        model: "AVSS PRS- M3DTEX",
        manufacturer: "AVSS – Aerial Vehicle Safety Solutions Inc.",
      },
      { model: "SenseFly eBeeX", manufacturer: "Sensefly SA" },
      { model: "CK4 C6", manufacturer: "CAVOK UAS" },
      { model: "CK7 C6", manufacturer: "CAVOK UAS" },
      { model: "Guardian 4K", manufacturer: "Vector Robotics Srl" },
      { model: "FireHound | FH-0", manufacturer: "Vector Robotics Srl" },
      { model: "DEN-S", manufacturer: "Artech’Drone" },
      {
        model: "AD410 / AD405 / AD410 Spray / AD405 Spray",
        manufacturer: "Artech’Drone",
      },
      { model: "INNOVADRONE 410", manufacturer: "INNOVADRONE LLC" },
      { model: "MANTA", manufacturer: "Objectif Drone Production" },
    ],
  },
];

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeManufacturer(manufacturer: string): string {
  return MANUFACTURER_ALIASES[manufacturer] ?? manufacturer;
}

function normalizeModelName(model: string, manufacturer: string): string {
  const canonicalManufacturer = normalizeManufacturer(manufacturer);
  const prefixes = MODEL_PREFIXES[canonicalManufacturer] ?? [];

  for (const prefix of prefixes) {
    if (model.startsWith(prefix)) {
      return model.slice(prefix.length).trim();
    }
  }

  return model.trim();
}

function createCatalogKey(manufacturer: string, modelName: string): string {
  return `${manufacturer}::${modelName}`;
}

function createOfficialWindRating(
  label: string,
  sourceName: string,
  sourceUrl: string,
  maxWindResistanceMs?: number,
  note?: string,
): OfficialWindRating {
  return {
    label,
    sourceName,
    sourceUrl,
    maxWindResistanceMs,
    note,
  };
}

const OFFICIAL_WIND_RATINGS = new Map<string, OfficialWindRating>([
  [
    createCatalogKey("DJI", "Mini 2 SE"),
    createOfficialWindRating(
      "10.7 m/s (Level 5)",
      "DJI Mini 2 SE / Mini 4K official specs",
      "https://www.dji.com/mini-2-se/specs",
      10.7,
    ),
  ],
  [
    createCatalogKey("DJI", "Mini 3 & Mini 3 Pro"),
    createOfficialWindRating(
      "10.7 m/s (Level 5)",
      "DJI Mini 3 Pro official support specs",
      "https://www.dji.com/support/product/mini-3-pro",
      10.7,
    ),
  ],
  [
    createCatalogKey("DJI", "Mini 4 Pro (Fly More Combo version 249 g)"),
    createOfficialWindRating(
      "10.7 m/s",
      "DJI Mini 4 Pro official specs",
      "https://www.dji.com/mini-4-pro/specs",
      10.7,
    ),
  ],
  [
    createCatalogKey("DJI", "Mini 4K"),
    createOfficialWindRating(
      "10.7 m/s (Level 5)",
      "DJI Mini 2 SE / Mini 4K official FAQ",
      "https://www.dji.com/mini-2-se/faq",
      10.7,
    ),
  ],
  [
    createCatalogKey("DJI", "Flip"),
    createOfficialWindRating(
      "10.7 m/s (Level 5)",
      "DJI Flip official specs",
      "https://www.dji.com/flip/specs",
      10.7,
    ),
  ],
  [
    createCatalogKey("DJI", "Neo"),
    createOfficialWindRating(
      "8 m/s (Level 4)",
      "DJI Neo official support specs",
      "https://www.dji.com/support/product/neo",
      8,
    ),
  ],
  [
    createCatalogKey(
      "DJI",
      "Mavic 3 Classic, Mavic 3 v2.0, & Mavic 3 Cine v2.0",
    ),
    createOfficialWindRating(
      "12 m/s",
      "DJI Mavic 3 Classic official support specs",
      "https://www.dji.com/support/product/mavic-3-classic",
      12,
    ),
  ],
  [
    createCatalogKey("DJI", "Air 2S"),
    createOfficialWindRating(
      "10.7 m/s",
      "DJI Air 2S official support specs",
      "https://www.dji.com/support/product/air-2s",
      10.7,
    ),
  ],
  [
    createCatalogKey("DJI", "Air 3"),
    createOfficialWindRating(
      "12 m/s",
      "DJI Air 3 official specs",
      "https://www.dji.com/air-3/specs",
      12,
    ),
  ],
  [
    createCatalogKey("DJI", "Air 3S"),
    createOfficialWindRating(
      "12 m/s",
      "DJI Air 3S official specs",
      "https://www.dji.com/air-3s/specs",
      12,
    ),
  ],
  [
    createCatalogKey("DJI", "Mini 4 Pro (Fly More Combo version 342 g)"),
    createOfficialWindRating(
      "10.7 m/s",
      "DJI Mini 4 Pro official specs",
      "https://www.dji.com/mini-4-pro/specs",
      10.7,
    ),
  ],
  [
    createCatalogKey("DJI", "Avata 2"),
    createOfficialWindRating(
      "10.7 m/s (Level 5)",
      "DJI Avata 2 official specs",
      "https://www.dji.com/avata-2/specs",
      10.7,
    ),
  ],
  [
    createCatalogKey("Autel Robotics", "EVO Lite 640T Enterprise"),
    createOfficialWindRating(
      "Fresh breeze",
      "Autel EVO Lite Enterprise Series brochure",
      "https://www.autelrobotics.com/wp-content/uploads/2024/08/EVO-Lite-Enterprise-Series-Brochure_EN.pdf",
      undefined,
      "Autel publishes this as a wind class label rather than a single numeric ceiling.",
    ),
  ],
  [
    createCatalogKey("Autel Robotics", "EVO Lite 6K Enterprise"),
    createOfficialWindRating(
      "Fresh breeze",
      "Autel EVO Lite Enterprise Series brochure",
      "https://www.autelrobotics.com/wp-content/uploads/2024/08/EVO-Lite-Enterprise-Series-Brochure_EN.pdf",
      undefined,
      "Autel publishes this as a wind class label rather than a single numeric ceiling.",
    ),
  ],
  [
    createCatalogKey("Autel Robotics", "EVO Lite +"),
    createOfficialWindRating(
      "Class 7 (14 to 16.5 m/s)",
      "Autel EVO Lite Series FAQ",
      "https://www.autelrobotics.com/faq/evo-lite/",
      undefined,
      "Autel gives a class/range here, so Do.I.Fly? still uses its conservative fallback band for the verdict.",
    ),
  ],
  [
    createCatalogKey("Autel Robotics", "EVO Lite"),
    createOfficialWindRating(
      "Class 7 (14 to 16.5 m/s)",
      "Autel EVO Lite Series FAQ",
      "https://www.autelrobotics.com/faq/evo-lite/",
      undefined,
      "Autel gives a class/range here, so Do.I.Fly? still uses its conservative fallback band for the verdict.",
    ),
  ],
  [
    createCatalogKey("Autel Robotics", "EVO Nano+"),
    createOfficialWindRating(
      "Level 5 (8.5 to 10.5 m/s)",
      "Autel EVO Nano Series FAQ",
      "https://www.autelrobotics.com/faq/evo-nano/",
      undefined,
      "Autel gives a range/class here, so Do.I.Fly? still uses its conservative fallback band for the verdict.",
    ),
  ],
  [
    createCatalogKey("Autel Robotics", "EVO Nano"),
    createOfficialWindRating(
      "Level 5 (8.5 to 10.5 m/s)",
      "Autel EVO Nano Series FAQ",
      "https://www.autelrobotics.com/faq/evo-nano/",
      undefined,
      "Autel gives a range/class here, so Do.I.Fly? still uses its conservative fallback band for the verdict.",
    ),
  ],
  [
    createCatalogKey("DJI", "Mavic 3E EU, Mavic 3T EU & Mavic 3M EU"),
    createOfficialWindRating(
      "12 m/s",
      "DJI Mavic 3 Enterprise Series official support specs",
      "https://www.dji.com/support/product/mavic-3-enterprise",
      12,
    ),
  ],
  [
    createCatalogKey("DJI", "Mavic 3 Pro"),
    createOfficialWindRating(
      "12 m/s",
      "DJI Mavic 3 Pro official specs",
      "https://www.dji.com/mavic-3-pro/specs",
      12,
    ),
  ],
  [
    createCatalogKey("DJI", "Matrice 4E"),
    createOfficialWindRating(
      "12 m/s during takeoff and landing",
      "DJI Matrice 4 Series official specs",
      "https://enterprise.dji.com/matrice-4-series/specs",
      12,
      "DJI publishes this as the takeoff and landing wind resistance for the Matrice 4 series.",
    ),
  ],
  [
    createCatalogKey("DJI", "Matrice 4T"),
    createOfficialWindRating(
      "12 m/s during takeoff and landing",
      "DJI Matrice 4 Series official specs",
      "https://enterprise.dji.com/matrice-4-series/specs",
      12,
      "DJI publishes this as the takeoff and landing wind resistance for the Matrice 4 series.",
    ),
  ],
  [
    createCatalogKey("DJI", "Dock 3 and Matrice 4D Series"),
    createOfficialWindRating(
      "12 m/s",
      "DJI Dock 3 official specs",
      "https://enterprise.dji.com/dock-3/specs",
      12,
    ),
  ],
  [
    createCatalogKey("DJI", "Matrice 350 RTK"),
    createOfficialWindRating(
      "12 m/s",
      "DJI Matrice 350 RTK official specs",
      "https://enterprise.dji.com/matrice-350-rtk/specs",
      12,
    ),
  ],
]);

const droneIdCounts = new Map<string, number>();

export const DRONE_CATALOG: DroneCatalogEntry[] = RAW_DRONE_GROUPS.flatMap((group) =>
  group.entries.map((entry) => {
    const manufacturer = normalizeManufacturer(entry.manufacturer);
    const modelName = normalizeModelName(entry.model, entry.manufacturer);
    const baseModelId = slugify(`${group.classLabel}-${manufacturer}-${modelName}`);
    const duplicateCount = (droneIdCounts.get(baseModelId) ?? 0) + 1;

    droneIdCounts.set(baseModelId, duplicateCount);

    return {
      modelId:
        duplicateCount === 1 ? baseModelId : `${baseModelId}-${duplicateCount}`,
      manufacturer,
      modelName,
      weightGrams: CLASS_WEIGHT_GRAMS[group.classLabel],
      classLabel: group.classLabel,
      category: CLASS_CATEGORY[group.classLabel],
      officialWindRating: OFFICIAL_WIND_RATINGS.get(
        createCatalogKey(manufacturer, modelName),
      ),
    };
  }),
).sort((left, right) => {
  const classOrder = left.classLabel.localeCompare(right.classLabel);

  if (classOrder !== 0) {
    return classOrder;
  }

  const manufacturerOrder = left.manufacturer.localeCompare(right.manufacturer);

  if (manufacturerOrder !== 0) {
    return manufacturerOrder;
  }

  return left.modelName.localeCompare(right.modelName);
});

export const DRONE_CLASS_OPTIONS = Array.from(
  new Set(DRONE_CATALOG.map((entry) => entry.classLabel)),
);

export const DRONE_MANUFACTURER_OPTIONS = Array.from(
  new Set(DRONE_CATALOG.map((entry) => entry.manufacturer)),
).sort((left, right) => left.localeCompare(right));
