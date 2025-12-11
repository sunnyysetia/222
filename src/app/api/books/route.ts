import { NextResponse } from "next/server";
import db from "@/db";
import { books } from "@/db/schema";

export async function GET() {
  try {
    const rows = await db.select().from(books);

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
