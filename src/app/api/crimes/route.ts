import { NextResponse } from "next/server";
import db from "@/db";
import { crimes } from "@/db/schema";
import {
  getAllBaseUnits,
  haversineDistanceMetres,
  Point,
} from "@/lib/patrolSimulation";

type CrimeRow = typeof crimes.$inferSelect;

async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{ formatted_address?: string }>;
    };
    return data.results?.[0]?.formatted_address ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const rows = await db.select().from(crimes);

    return NextResponse.json(
      { data: rows },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch records: ${error}` },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { priorityLevel, latitude, longitude, description } = body;

    const prio = Number(priorityLevel);
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!description || typeof description !== "string") {
      return NextResponse.json(
        { error: "Description is required." },
        { status: 400, headers: { "cache-control": "no-store" } }
      );
    }

    if (!Number.isFinite(prio) || prio < 1 || prio > 10) {
      return NextResponse.json(
        { error: "priorityLevel must be a number between 1 and 10." },
        { status: 400, headers: { "cache-control": "no-store" } }
      );
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { error: "latitude and longitude must be valid numbers." },
        { status: 400, headers: { "cache-control": "no-store" } }
      );
    }

    const nowMs = Date.now();

    // Determine which units are already assigned
    const existingCrimes = (await db.select().from(crimes)) as CrimeRow[];
    const busyUnitIds = new Set<string>();
    for (const row of existingCrimes) {
      const unitId = row.assignedUnitId;
      if (unitId) {
        busyUnitIds.add(unitId);
      }
    }

    // Calculate nearest available unit to the crime location
    const baseUnits = getAllBaseUnits(nowMs);
    const target: Point = { lat, lng };

    let assignedUnitId: string | null = null;

    const availableUnits = baseUnits.filter(
      (unit) => !busyUnitIds.has(unit.id)
    );

    if (availableUnits.length > 0) {
      let bestUnit = availableUnits[0];
      let bestDistance = haversineDistanceMetres(target, {
        lat: bestUnit.lat,
        lng: bestUnit.lng,
      });

      for (let i = 1; i < availableUnits.length; i += 1) {
        const unit = availableUnits[i];
        const d = haversineDistanceMetres(target, {
          lat: unit.lat,
          lng: unit.lng,
        });
        if (d < bestDistance) {
          bestDistance = d;
          bestUnit = unit;
        }
      }

      assignedUnitId = bestUnit.id;
    }

    const address = await reverseGeocode(lat, lng);

    const [inserted] = await db
      .insert(crimes)
      .values({
        priorityLevel: prio,
        latitude: lat,
        longitude: lng,
        description,
        address,
        assignedUnitId,
        assignedAt: assignedUnitId ? new Date(nowMs) : null,
      } satisfies typeof crimes.$inferInsert)
      .returning();

    return NextResponse.json(
      { data: inserted },
      { status: 201, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to create record: ${error}` },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
