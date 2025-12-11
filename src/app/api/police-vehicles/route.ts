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

// Rough patrol loops around central Auckland.
// These do not need to be perfect, just plausible.
const PATROL_ROUTES: PatrolRoute[] = [
  {
    id: "CBD_LOOP",
    points: [
      { lat: -36.8466, lng: 174.763 }, // Britomart-ish
      { lat: -36.8487, lng: 174.758 }, // Commercial Bay / lower Queen
      { lat: -36.8528, lng: 174.757 }, // Sky Tower area
      { lat: -36.8555, lng: 174.7605 }, // Victoria Park
      { lat: -36.853, lng: 174.7665 }, // Grafton bridge
      { lat: -36.8495, lng: 174.7685 }, // University area
      { lat: -36.8466, lng: 174.763 }, // back to Britomart
    ],
  },
  {
    id: "PONSONBY_LOOP",
    points: [
      { lat: -36.8545, lng: 174.7425 }, // Westmere-ish
      { lat: -36.854, lng: 174.7485 }, // Grey Lynn
      { lat: -36.855, lng: 174.7525 }, // Ponsonby central
      { lat: -36.8585, lng: 174.7535 }, // Ponsonby Rd south
      { lat: -36.86, lng: 174.75 }, // College Hill
      { lat: -36.858, lng: 174.7445 }, // Herne Bay
      { lat: -36.8545, lng: 174.7425 }, // back
    ],
  },
  {
    id: "PARNELL_LOOP",
    points: [
      { lat: -36.848, lng: 174.776 }, // Parnell rise
      { lat: -36.851, lng: 174.78 }, // Parnell village
      { lat: -36.856, lng: 174.7805 }, // Judges Bay
      { lat: -36.8585, lng: 174.7765 }, // Strand area
      { lat: -36.855, lng: 174.7725 }, // Grafton
      { lat: -36.8505, lng: 174.772 }, // back towards CBD fringe
      { lat: -36.848, lng: 174.776 },
    ],
  },
  {
    id: "NEWMARKET_LOOP",
    points: [
      { lat: -36.866, lng: 174.7755 }, // Newmarket
      { lat: -36.8695, lng: 174.775 }, // Broadway south
      { lat: -36.8715, lng: 174.7705 }, // Epsom-ish
      { lat: -36.869, lng: 174.7665 }, // Gillies Ave
      { lat: -36.8645, lng: 174.765 }, // Grafton / Domain
      { lat: -36.862, lng: 174.7705 }, // back to Newmarket side
      { lat: -36.866, lng: 174.7755 },
    ],
  },
];

// Number of simulated units
const VEHICLE_COUNT = 24;

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

  // Speed between 25–40 km/h
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

  // Fallback (should not normally hit)
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
  // About 1 in 4 cars "busy" at any given tick
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
