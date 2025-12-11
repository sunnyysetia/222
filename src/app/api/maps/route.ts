import axios from "axios";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const address = body.address;

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "Address is required." },
        { status: 400 }
      );
    }

    const apiKey = process.env.MAPS_PLATFORM_KEY;
    if (!apiKey) {
      console.error("MAPS_PLATFORM_KEY is not set");
      return NextResponse.json(
        { error: "Server misconfiguration: missing API key." },
        { status: 500 }
      );
    }

    const url = "https://maps.googleapis.com/maps/api/geocode/json";

    const { data } = await axios.get(url, {
      params: {
        address,
        key: apiKey,
      },
    });

    if (!data || data.status !== "OK" || !Array.isArray(data.results)) {
      return NextResponse.json(
        {
          suggestions: [],
          googleStatus: data?.status ?? "UNKNOWN_ERROR",
          googleErrorMessage: data?.error_message ?? null,
        },
        { status: 200 }
      );
    }

    // 🔍 Filter results so we only keep ones in Auckland
    const aucklandResults = data.results.filter((result: any) => {
      const components = result.address_components ?? [];
      return components.some((c: any) => {
        const longName = (c.long_name || "").toLowerCase();
        const shortName = (c.short_name || "").toLowerCase();
        return longName === "auckland" || shortName === "auckland";
      });
    });

    // If you want to *only* return Auckland matches:
    const resultsToUse = aucklandResults;

    // If you prefer a fallback to all results when none in Auckland, use:
    // const resultsToUse = aucklandResults.length > 0 ? aucklandResults : data.results;

    const suggestions = resultsToUse.map((result: any) => {
      const location = result.geometry?.location;
      const components = result.address_components ?? [];

      const streetNumberComponent = components.find((c: any) =>
        Array.isArray(c.types) && c.types.includes("street_number")
      );
      const streetNumber = streetNumberComponent?.long_name ?? null;

      return {
        streetNumber,
        fullAddress: result.formatted_address,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
      };
    });

    return NextResponse.json(
      {
        suggestions,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error(
      "Geocoding error:",
      error?.response?.data || error?.message || error
    );
    return NextResponse.json(
      { error: "Failed to fetch geocode data." },
      { status: 500 }
    );
  }
}
