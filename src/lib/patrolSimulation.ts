// lib/patrolSimulation.ts

export type PoliceVehicleStatus = "available" | "busy";

export type Point = { lat: number; lng: number };

export type BaseUnitState = {
  id: string;
  index: number;
  lat: number;
  lng: number;
  routeId: string; // logical region / route
  speedMS: number;
};

type Region = {
  id: string;
  centre: Point;
  dLat: number;
  dLng: number;
};

export const VEHICLE_COUNT = 80;
const EARTH_RADIUS_M = 6371000;

/**
 * Regions roughly covering major Auckland areas.
 * Units will orbit each region on an ellipse.
 */
const REGIONS: Region[] = [
  // Central city
  {
    id: "CBD",
    centre: { lat: -36.8485, lng: 174.763 },
    dLat: 0.006,
    dLng: 0.008,
  },
  {
    id: "PONSONBY_GREYLYNN",
    centre: { lat: -36.855, lng: 174.75 },
    dLat: 0.006,
    dLng: 0.01,
  },
  {
    id: "MT_EDEN_EPSOM",
    centre: { lat: -36.885, lng: 174.765 },
    dLat: 0.007,
    dLng: 0.008,
  },
  {
    id: "NEWMARKET_PARNELL_GRAFTON",
    centre: { lat: -36.858, lng: 174.776 },
    dLat: 0.006,
    dLng: 0.008,
  },

  // Inner south / isthmus
  {
    id: "ONEHUNGA_ROYAL_OAK",
    centre: { lat: -36.915, lng: 174.785 },
    dLat: 0.008,
    dLng: 0.01,
  },
  {
    id: "MT_ROSKILL_BLOCKHOUSE_BAY",
    centre: { lat: -36.906, lng: 174.729 },
    dLat: 0.007,
    dLng: 0.009,
  },

  // West
  {
    id: "NEW_LYNN",
    centre: { lat: -36.9055, lng: 174.686 },
    dLat: 0.007,
    dLng: 0.01,
  },
  {
    id: "HENDERSON",
    centre: { lat: -36.8801, lng: 174.6198 },
    dLat: 0.008,
    dLng: 0.01,
  },
  {
    id: "TE_ATATU",
    centre: { lat: -36.845, lng: 174.65 },
    dLat: 0.006,
    dLng: 0.01,
  },

  // North Shore
  {
    id: "TAKAPUNA_DEVONPORT",
    centre: { lat: -36.7917, lng: 174.7758 },
    dLat: 0.006,
    dLng: 0.01,
  },
  {
    id: "NORTHCOTE_GLENFIELD",
    centre: { lat: -36.8, lng: 174.74 },
    dLat: 0.007,
    dLng: 0.01,
  },
  {
    id: "ALBANY_ROSEDALE",
    centre: { lat: -36.7167, lng: 174.7 },
    dLat: 0.01,
    dLng: 0.013,
  },
  {
    id: "BROWNS_BAY_TORBAY",
    centre: { lat: -36.72, lng: 174.75 },
    dLat: 0.008,
    dLng: 0.01,
  },

  // Central / east
  {
    id: "PANMURE_MT_WELLINGTON",
    centre: { lat: -36.8833, lng: 174.8667 },
    dLat: 0.007,
    dLng: 0.01,
  },
  {
    id: "SYLVIA_PARK_ELLERSLIE",
    centre: { lat: -36.9015, lng: 174.816 },
    dLat: 0.006,
    dLng: 0.01,
  },

  // East Auckland
  {
    id: "HOWICK",
    centre: { lat: -36.8936, lng: 174.9317 },
    dLat: 0.007,
    dLng: 0.01,
  },
  {
    id: "BOTANY_DOWNS",
    centre: { lat: -36.908, lng: 174.9199 },
    dLat: 0.007,
    dLng: 0.01,
  },
  {
    id: "EAST_TAMAKI_PAKURANGA",
    centre: { lat: -36.91, lng: 174.89 },
    dLat: 0.009,
    dLng: 0.011,
  },

  // South Auckland
  {
    id: "PAPATOETOE",
    centre: { lat: -36.9682, lng: 174.8402 },
    dLat: 0.007,
    dLng: 0.01,
  },
  {
    id: "OTAHUHU",
    centre: { lat: -36.9382, lng: 174.8402 },
    dLat: 0.007,
    dLng: 0.01,
  },
  {
    id: "MANUKAU",
    centre: { lat: -36.9928, lng: 174.8799 },
    dLat: 0.009,
    dLng: 0.011,
  },
  {
    id: "MANGERE",
    centre: { lat: -36.96, lng: 174.78 },
    dLat: 0.01,
    dLng: 0.012,
  },
  {
    id: "AIRPORT",
    centre: { lat: -37.01, lng: 174.78 },
    dLat: 0.008,
    dLng: 0.012,
  },
];

// Basic hash for per-unit randomness
function hashInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMetres(a: Point, b: Point): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const aa =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));

  return EARTH_RADIUS_M * c;
}

function getSpeedMSForIndex(index: number): number {
  const baseId = `UNIT-${index.toString().padStart(2, "0")}`;
  const h = hashInt(baseId);
  const speedKmH = 25 + (h % 16); // 25..40 km/h
  return (speedKmH * 1000) / 3600;
}

/**
 * Smooth elliptical patrol path around a region.
 * Each unit has its own phase, radius multipliers and angle speed.
 */
export function getBaseUnitStateAtTime(
  index: number,
  nowMs: number
): BaseUnitState {
  const region = REGIONS[index % REGIONS.length];
  const id = `UNIT-${index.toString().padStart(2, "0")}`;
  const h = hashInt(id);

  const speedMS = getSpeedMSForIndex(index);

  // Ellipse radii slightly different per unit
  const ampFactorLat = 0.6 + ((h >> 3) % 40) / 100; // 0.6..1.0
  const ampFactorLng = 0.6 + ((h >> 7) % 40) / 100; // 0.6..1.0
  const ampLat = region.dLat * ampFactorLat;
  const ampLng = region.dLng * ampFactorLng;

  // Per-unit phase and angular speed
  const phase = ((h % 360) * Math.PI) / 180;
  const loopsPerMinute = 1 / (4 + (h % 3)); // between 1 loop per 4–6 minutes
  const angularSpeed = (2 * Math.PI * loopsPerMinute) / 60_000; // rad per ms

  const angle = angularSpeed * nowMs + phase;

  const lat =
    region.centre.lat + ampLat * Math.sin(angle) + 0.0003 * Math.sin(angle * 3); // tiny wobble
  const lng =
    region.centre.lng + ampLng * Math.cos(angle) + 0.0003 * Math.cos(angle * 2);

  return {
    id,
    index,
    lat,
    lng,
    routeId: region.id,
    speedMS,
  };
}

/**
 * Base patrol state for all units at a given time.
 */
export function getAllBaseUnits(nowMs: number): BaseUnitState[] {
  const result: BaseUnitState[] = [];
  for (let i = 0; i < VEHICLE_COUNT; i += 1) {
    result.push(getBaseUnitStateAtTime(i, nowMs));
  }
  return result;
}

/**
 * Convenience: get a base unit state by id at a given time.
 */
export function getBaseUnitByIdAtTime(
  id: string,
  nowMs: number
): BaseUnitState | null {
  const parts = id.split("-");
  const raw = parts[1];
  const idx = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(idx) || idx < 0 || idx >= VEHICLE_COUNT) {
    return null;
  }
  return getBaseUnitStateAtTime(idx, nowMs);
}
