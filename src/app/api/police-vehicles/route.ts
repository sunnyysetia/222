// app/api/police-vehicles/route.ts
import { NextResponse } from "next/server";

export type PoliceVehicleStatus = "available" | "busy";

export type PoliceVehicle = {
  id: string;
  lat: number;
  lng: number;
  routeId: string;
  status: PoliceVehicleStatus;
  lastUpdated: string;
};

type Point = { lat: number; lng: number };

type PatrolRoute = {
  id: string;
  points: Point[];
};

type SuburbBox = {
  id: string;
  centre: Point;
  dLat: number;
  dLng: number;
};

/**
 * Helper: build a simple rectangular patrol loop around a centre.
 * Cars will drive this loop continually.
 */
function makeBoxRoute(box: SuburbBox): PatrolRoute {
  const { id, centre, dLat, dLng } = box;
  const { lat, lng } = centre;

  const points: Point[] = [
    { lat: lat + dLat, lng: lng - dLng },
    { lat: lat + dLat, lng: lng + dLng },
    { lat: lat - dLat, lng: lng + dLng },
    { lat: lat - dLat, lng: lng - dLng },
    { lat: lat + dLat, lng: lng - dLng }, // close loop
  ];

  return { id, points };
}

/**
 * Approximate patrol zones covering major Auckland suburbs / clusters.
 * Coords are suburb centres with small offsets to make a patrol box.
 */
const SUBURB_BOXES: SuburbBox[] = [
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

// Build patrol routes from suburb boxes
const PATROL_ROUTES: PatrolRoute[] = SUBURB_BOXES.map(makeBoxRoute);

// Number of simulated units across all routes
const VEHICLE_COUNT = 80;

// --- Helpers for geometry ---

const EARTH_RADIUS_M = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineDistanceMetres(a: Point, b: Point): number {
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

type RouteSegment = {
  start: Point;
  end: Point;
  length: number;
};

type RouteMeta = {
  route: PatrolRoute;
  segments: RouteSegment[];
  totalLength: number;
};

function buildRouteMeta(route: PatrolRoute): RouteMeta {
  const segments: RouteSegment[] = [];
  let total = 0;
  for (let i = 0; i < route.points.length - 1; i += 1) {
    const start = route.points[i];
    const end = route.points[i + 1];
    const length = haversineDistanceMetres(start, end);
    segments.push({ start, end, length });
    total += length;
  }
  return { route, segments, totalLength: total };
}

const ROUTE_META: RouteMeta[] = PATROL_ROUTES.map(buildRouteMeta);

// Simple deterministic hash so things do not jump about
function hashInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Get position for a vehicle index at a given time
function getVehiclePosition(
  index: number,
  nowMs: number
): { lat: number; lng: number; routeId: string } {
  const routeMeta = ROUTE_META[index % ROUTE_META.length];

  const baseId = `UNIT-${index.toString().padStart(2, "0")}`;
  const h = hashInt(baseId);

  // Speed between 25 and 40 km/h
  const speedKmH = 25 + (h % 16); // 25..40
  const speedMS = (speedKmH * 1000) / 3600;

  // Offset so cars on same route are spread out
  const offsetMetres = h % routeMeta.totalLength;

  const elapsedSeconds = nowMs / 1000;
  const travelledMetres =
    (offsetMetres + elapsedSeconds * speedMS) % routeMeta.totalLength;

  let remaining = travelledMetres;

  for (const seg of routeMeta.segments) {
    if (seg.length === 0) continue;
    if (remaining <= seg.length) {
      const t = remaining / seg.length;
      const lat = seg.start.lat + (seg.end.lat - seg.start.lat) * t;
      const lng = seg.start.lng + (seg.end.lng - seg.start.lng) * t;
      return { lat, lng, routeId: routeMeta.route.id };
    }
    remaining -= seg.length;
  }

  // Fallback (should rarely happen)
  const lastPoint = routeMeta.route.points[routeMeta.route.points.length - 1];
  return {
    lat: lastPoint.lat,
    lng: lastPoint.lng,
    routeId: routeMeta.route.id,
  };
}

function getStatusForVehicle(
  index: number,
  nowMs: number
): PoliceVehicleStatus {
  // Flip status every ~30 seconds per vehicle in a staggered way.
  const tickLengthMs = 30_000;
  const tick = Math.floor(nowMs / tickLengthMs);
  // About 1 in 4 cars appear "busy" at any given tick
  return (tick + index) % 4 === 0 ? "busy" : "available";
}

// --- Route handler ---

export async function GET() {
  const nowMs = Date.now();
  const vehicles: PoliceVehicle[] = [];

  for (let i = 0; i < VEHICLE_COUNT; i += 1) {
    const id = `UNIT-${i.toString().padStart(2, "0")}`;
    const pos = getVehiclePosition(i, nowMs);
    const status = getStatusForVehicle(i, nowMs);

    vehicles.push({
      id,
      lat: pos.lat,
      lng: pos.lng,
      routeId: pos.routeId,
      status,
      lastUpdated: new Date(nowMs).toISOString(),
    });
  }

  return NextResponse.json({ vehicles });
}
