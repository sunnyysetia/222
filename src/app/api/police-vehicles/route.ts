import { NextResponse } from "next/server";
import db from "@/db";
import { crimes } from "@/db/schema";
import {
  getAllBaseUnits,
  getBaseUnitStateAtTime,
  haversineDistanceMetres,
  Point,
  PoliceVehicleStatus,
} from "@/lib/patrolSimulation";

export type PoliceVehicle = {
  id: string;
  lat: number;
  lng: number;
  routeId: string;
  status: PoliceVehicleStatus;
  lastUpdated: string;
  assignedCrimeId?: number | string;
};

type CrimeRow = {
  id: number | string;
  latitude: number;
  longitude: number;
  priorityLevel: number;
  description: string;
  assignedUnitId: string | null;
  assignedAt: string | Date | null;
};

export async function GET() {
  const nowMs = Date.now();

  // 1) Base patrol state for all units at current time
  const baseUnits = getAllBaseUnits(nowMs);

  // 2) Read crimes and build assignment map
  const rows = (await db.select().from(crimes)) as CrimeRow[];

  type Assignment = {
    crimeId: number | string;
    target: Point;
    assignedAtMs: number;
  };

  const assignmentsByUnit = new Map<string, Assignment>();

  for (const row of rows) {
    if (!row.assignedUnitId) continue;

    const assignedAtDate =
      row.assignedAt instanceof Date
        ? row.assignedAt
        : row.assignedAt
        ? new Date(row.assignedAt)
        : null;

    const assignedAtMs = assignedAtDate ? assignedAtDate.getTime() : nowMs;

    const existing = assignmentsByUnit.get(row.assignedUnitId);

    // If a unit somehow has multiple crimes, keep the latest assignment
    if (!existing || assignedAtMs > existing.assignedAtMs) {
      assignmentsByUnit.set(row.assignedUnitId, {
        crimeId: row.id,
        target: { lat: row.latitude, lng: row.longitude },
        assignedAtMs,
      });
    }
  }

  // 3) Produce vehicle list, adjusting busy units so they travel to their crime
  const vehicles: PoliceVehicle[] = baseUnits.map((unit) => {
    const assignment = assignmentsByUnit.get(unit.id);

    if (!assignment) {
      return {
        id: unit.id,
        lat: unit.lat,
        lng: unit.lng,
        routeId: unit.routeId,
        status: "available",
        lastUpdated: new Date(nowMs).toISOString(),
      };
    }

    const { target, assignedAtMs, crimeId } = assignment;

    // Where was this unit on its patrol route at assignment time?
    const baseAtAssign = getBaseUnitStateAtTime(unit.index, assignedAtMs);

    const from: Point = {
      lat: baseAtAssign.lat,
      lng: baseAtAssign.lng,
    };

    const distance = haversineDistanceMetres(from, target);

    let lat = target.lat;
    let lng = target.lng;

    if (distance > 1) {
      const timeSinceAssign = Math.max(0, nowMs - assignedAtMs);
      const travelled = Math.min(distance, timeSinceAssign * unit.speedMS);
      const t = travelled / distance;
      lat = from.lat + (target.lat - from.lat) * t;
      lng = from.lng + (target.lng - from.lng) * t;
    }

    return {
      id: unit.id,
      lat,
      lng,
      routeId: unit.routeId,
      status: "busy",
      lastUpdated: new Date(nowMs).toISOString(),
      assignedCrimeId: crimeId,
    };
  });

  return NextResponse.json(
    { vehicles },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
