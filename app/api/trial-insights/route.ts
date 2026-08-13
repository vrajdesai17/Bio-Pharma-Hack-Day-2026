import { NextRequest, NextResponse } from "next/server";
import {
  getMissingInformation,
  simplifyCriteria,
  isCitationVerified,
  isLLMConfigured,
  PatientProfileSchema,
} from "@/lib/llm";

type ClientCriterion = { criterion?: unknown; status?: unknown };

export async function POST(req: NextRequest) {
  if (!isLLMConfigured()) {
    return NextResponse.json({ error: "LLM not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const type = body?.type;
  const trial = body?.trial;
  const criteria = body?.criteria;

  if (
    (type !== "missing_info" && type !== "simplify") ||
    typeof trial?.title !== "string" ||
    typeof trial?.eligibilityCriteria !== "string" ||
    !Array.isArray(criteria)
  ) {
    return NextResponse.json(
      { error: "type ('missing_info' | 'simplify'), trial, and criteria are required" },
      { status: 400 }
    );
  }

  // Re-verify independently rather than trusting the client's claimed criteria/status — a stale or
  // tampered array shouldn't be able to make something look "unknown" or "real" that isn't.
  const eligibilityCriteria: string = trial.eligibilityCriteria;
  const verifiedAll = (criteria as ClientCriterion[])
    .filter((c): c is { criterion: string; status: string } => typeof c.criterion === "string")
    .filter((c) => isCitationVerified(c.criterion, eligibilityCriteria));
  const verifiedUnknown = verifiedAll.filter((c) => c.status === "unknown").map((c) => c.criterion);
  const verifiedCriteriaTexts = verifiedAll.map((c) => c.criterion);

  try {
    if (type === "missing_info") {
      const parsedProfile = PatientProfileSchema.safeParse(body?.profile);
      if (!parsedProfile.success) {
        return NextResponse.json({ error: "profile is required" }, { status: 400 });
      }
      const items = await getMissingInformation(parsedProfile.data, { title: trial.title }, verifiedUnknown);
      return NextResponse.json({ items });
    }

    const simplified = await simplifyCriteria(verifiedCriteriaTexts);
    if (simplified === null) {
      return NextResponse.json({ error: "Failed to simplify criteria" }, { status: 502 });
    }
    return NextResponse.json({ criteria: verifiedCriteriaTexts, ...simplified });
  } catch (err) {
    console.error("trial-insights failed:", err);
    return NextResponse.json({ error: "Failed to generate trial insights" }, { status: 502 });
  }
}
