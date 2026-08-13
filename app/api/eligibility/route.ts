import { NextRequest, NextResponse } from "next/server";
import { fetchTrials } from "@/lib/clinicaltrials";
import { evaluateTrialMatch, isLLMConfigured, PatientProfileSchema } from "@/lib/llm";

const TRIALS_CONSIDERED = 12;
const VERDICT_RANK = { match: 0, possible: 1, unclear: 2, no_match: 3 } as const;

export async function POST(req: NextRequest) {
  if (!isLLMConfigured()) {
    return NextResponse.json({ error: "LLM not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const condition = body?.condition;
  const profileText = body?.profileText;
  const parsedProfile = PatientProfileSchema.safeParse(body?.profile);

  if (typeof condition !== "string" || typeof profileText !== "string" || !condition.trim() || !parsedProfile.success) {
    return NextResponse.json({ error: "condition, profileText, and profile are required" }, { status: 400 });
  }

  try {
    const trials = await fetchTrials(condition, { status: "RECRUITING", pageSize: TRIALS_CONSIDERED });

    const results = await Promise.all(
      trials.map(async (trial) => {
        const match = await evaluateTrialMatch(parsedProfile.data, profileText, trial);
        return match ? { trial, match } : null;
      })
    );

    const ranked = results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => {
        const rankDiff = VERDICT_RANK[a.match.verdict] - VERDICT_RANK[b.match.verdict];
        return rankDiff !== 0 ? rankDiff : b.match.confidence - a.match.confidence;
      });

    return NextResponse.json({ results: ranked, trialsConsidered: trials.length });
  } catch (err) {
    console.error("eligibility matching failed:", err);
    return NextResponse.json({ error: "Failed to evaluate trial matches" }, { status: 502 });
  }
}
