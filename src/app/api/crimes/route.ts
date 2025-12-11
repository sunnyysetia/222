import { NextResponse } from "next/server";
import db from "@/db";
import { crimes } from "@/db/schema";

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

    // Basic validation
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

    const [inserted] = await db
      .insert(crimes)
      .values({
        priorityLevel: prio,
        latitude: lat,
        longitude: lng,
        description,
      })
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
