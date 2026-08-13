import { NextRequest, NextResponse } from "next/server";
import { fetchTrialById } from "@/lib/clinicaltrials";
import { snapshotFromTrial, diffTrialSnapshots, describeChange, type TrialSnapshot, type TrialChange } from "@/lib/trialDiff";
import { summarizeEligibilityChange } from "@/lib/llm";

function isValidSnapshot(s: unknown): s is TrialSnapshot {
  if (!s || typeof s !== "object") return false;
  const snap = s as Record<string, unknown>;
  return typeof snap.nctId === "string" && typeof snap.status === "string" && Array.isArray(snap.locations);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nctId = body?.nctId;
  const previousSnapshot = body?.previousSnapshot;
  const simulatedAfter = body?.simulatedAfter;

  if (typeof nctId !== "string" || !isValidSnapshot(previousSnapshot)) {
    return NextResponse.json({ error: "nctId and previousSnapshot are required" }, { status: 400 });
  }

  try {
    let afterSnapshot: TrialSnapshot;

    if (simulatedAfter) {
      if (!isValidSnapshot(simulatedAfter)) {
        return NextResponse.json({ error: "simulatedAfter is malformed" }, { status: 400 });
      }
      afterSnapshot = { ...simulatedAfter, capturedAt: new Date().toISOString() };
    } else {
      const trial = await fetchTrialById(nctId);
      if (!trial) {
        return NextResponse.json({ error: "Trial not found" }, { status: 404 });
      }
      afterSnapshot = snapshotFromTrial(trial, new Date().toISOString());
    }

    // The diff itself is always deterministic — same function, real or simulated "after" state.
    const changes: TrialChange[] = diffTrialSnapshots(previousSnapshot, afterSnapshot);

    const messages = await Promise.all(
      changes.map(async (change) => {
        if (change.type === "eligibility_changed") {
          const summary = await summarizeEligibilityChange(change.before, change.after);
          return summary ? `⚠️ ${summary}` : describeChange(change);
        }
        return describeChange(change);
      })
    );

    return NextResponse.json({
      snapshot: afterSnapshot,
      changes: changes.map((change, i) => ({ ...change, message: messages[i] })),
    });
  } catch (err) {
    console.error("track/check failed:", err);
    return NextResponse.json({ error: "Failed to check for updates" }, { status: 502 });
  }
}
