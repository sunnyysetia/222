import { NextResponse } from "next/server";

// AT have moved realtime to the "legacy" compat endpoint.
// See https://api.at.govt.nz/realtime/legacy/
const AT_REALTIME_URL = "https://api.at.govt.nz/realtime/legacy/";

type PoliceVehicleStatus = "available" | "busy";

export type PoliceVehicle = {
  id: string;
  lat: number;
  lng: number;
  routeId?: string;
  status: PoliceVehicleStatus;
  lastUpdated: string;
};

function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function inferStatusFromId(id: string): PoliceVehicleStatus {
  const h = hashStringToInt(id);
  // Roughly one third "busy", two thirds "available"
  return h % 3 === 0 ? "busy" : "available";
}

export async function GET() {
  const apiKey = process.env.AT_SUBSCRIPTION_KEY;

  if (!apiKey) {
    console.error("[police-vehicles] missing AT_SUBSCRIPTION_KEY env");
    return NextResponse.json(
      { error: "AT_SUBSCRIPTION_KEY is not configured" },
      { status: 500 }
    );
  }

  try {
    console.log(
      "[police-vehicles] fetching AT realtime vehicles from",
      AT_REALTIME_URL
    );
    const res = await fetch(AT_REALTIME_URL, {
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    console.log(
      "[police-vehicles] fetch completed",
      res.status,
      res.statusText
    );

    if (!res.ok) {
      console.error("AT realtime error", res.status, await res.text());
      return NextResponse.json(
        { error: "Failed to fetch realtime vehicles from AT" },
        { status: 502 }
      );
    }

    console.log("[police-vehicles] parsing json body");
    const raw = await res.json();
    const rawEntities = raw?.entity ?? raw?.response?.entity ?? [];
    console.log("[police-vehicles] raw entity count", rawEntities?.length);

    // The AT realtime API is GTFS realtime compatible, so we expect something like:
    // { entity: [ { id, vehicle: { vehicle: { id }, position: { latitude, longitude }, trip: { route_id }, timestamp } } ] }
    const vehicles: PoliceVehicle[] = rawEntities
      .map(
        (entity: {
          id: string;
          vehicle: {
            id: string;
            position: { latitude: string; longitude: string };
            trip: { route_id: string };
            vehicle: { id: string };
            timestamp: number;
          };
        }) => {
          const vehicle = entity.vehicle ?? {};
          const position = vehicle.position ?? {};
          const trip = vehicle.trip ?? {};
          const vehicleDesc = vehicle.vehicle ?? {};

          const id: string =
            vehicleDesc.id ?? entity.id ?? Math.random().toString(36);
          const lat = Number(position.latitude);
          const lng = Number(position.longitude);

          if (
            Number.isNaN(lat) ||
            Number.isNaN(lng) ||
            lat === 0 ||
            lng === 0
          ) {
            console.warn(
              "[police-vehicles] skipping invalid coords",
              entity?.id,
              position
            );
            return null;
          }

          const routeId: string | undefined = trip.route_id;
          const status = inferStatusFromId(id);

          const timestampSeconds: number | undefined = vehicle.timestamp;
          const lastUpdated = timestampSeconds
            ? new Date(timestampSeconds * 1000).toISOString()
            : new Date().toISOString();

          return {
            id,
            lat,
            lng,
            routeId,
            status,
            lastUpdated,
          } as PoliceVehicle;
        }
      )
      .filter(Boolean)
      .slice(0, 300); // keep a sensible upper limit

    console.log("[police-vehicles] mapped vehicles", vehicles.length);

    return NextResponse.json({ vehicles });
  } catch (err) {
    console.error("AT realtime exception", err);
    return NextResponse.json(
      { error: "Unexpected error fetching AT realtime data" },
      { status: 500 }
    );
  }
}
