import { NextResponse } from "next/server";

export type CrimeSeverity = "low" | "medium" | "high";

export type CrimeReport = {
  id: string;
  latitude: number;
  longitude: number;
  description: string;
  severity: CrimeSeverity;
  reportedAt: string; // ISO string
};

export async function GET() {
  const now = new Date();

  const minutesAgo = (mins: number) =>
    new Date(now.getTime() - mins * 60 * 1000).toISOString();

  const crimes: CrimeReport[] = [
    {
      id: "c1",
      latitude: -36.847,
      longitude: 174.763,
      description: "Reported armed robbery near Britomart.",
      severity: "high",
      reportedAt: minutesAgo(3),
    },
    {
      id: "c2",
      latitude: -36.861,
      longitude: 174.76,
      description: "Noise complaint at apartment block.",
      severity: "low",
      reportedAt: minutesAgo(45),
    },
    {
      id: "c3",
      latitude: -36.852,
      longitude: 174.776,
      description: "Possible assault reported on Queen Street.",
      severity: "medium",
      reportedAt: minutesAgo(15),
    },
    {
      id: "c4",
      latitude: -36.873,
      longitude: 174.753,
      description: "Suspicious vehicle circling residential area.",
      severity: "medium",
      reportedAt: minutesAgo(120),
    },
  ];

  return NextResponse.json({ crimes });
}
