import { NextRequest, NextResponse } from "next/server";
import { fetchTrials } from "@/lib/clinicaltrials";

export async function GET(req: NextRequest) {
  const condition = req.nextUrl.searchParams.get("condition");
  if (!condition) {
    return NextResponse.json({ error: "condition query param is required" }, { status: 400 });
  }

  const status = req.nextUrl.searchParams.get("status") ?? undefined;

  try {
    const trials = await fetchTrials(condition, { status });
    return NextResponse.json({ trials });
  } catch {
    return NextResponse.json({ error: "Failed to fetch trials from ClinicalTrials.gov" }, { status: 502 });
  }
}
