import type { Trial, TrialLocation } from "@/lib/clinicaltrials";

// A snapshot is the subset of a Trial worth tracking over time. Deliberately excludes fields that
// change on every fetch for uninteresting reasons (briefSummary wording tweaks, conditions list
// reordering) — tracking those would generate change-feed noise that isn't meaningful to a patient.
export type TrialSnapshot = {
  nctId: string;
  title: string;
  status: string;
  locations: TrialLocation[];
  eligibilityCriteria: string;
  enrollmentCount: number | null;
  startDate: string | null;
  primaryCompletionDate: string | null;
  capturedAt: string;
};

export function snapshotFromTrial(trial: Trial, capturedAt: string): TrialSnapshot {
  return {
    nctId: trial.nctId,
    title: trial.title,
    status: trial.status,
    locations: trial.locations,
    eligibilityCriteria: trial.eligibilityCriteria,
    enrollmentCount: trial.enrollmentCount,
    startDate: trial.startDate,
    primaryCompletionDate: trial.primaryCompletionDate,
    capturedAt,
  };
}

export type TrialChange =
  | { type: "status"; before: string; after: string }
  | { type: "location_added"; location: TrialLocation }
  | { type: "location_removed"; location: TrialLocation }
  | { type: "eligibility_changed"; before: string; after: string }
  | { type: "enrollment_changed"; before: number | null; after: number | null }
  | { type: "date_changed"; field: "startDate" | "primaryCompletionDate"; before: string | null; after: string | null };

function locationKey(loc: TrialLocation): string {
  return `${loc.city}|${loc.state}|${loc.country}`;
}

// Pure, deterministic comparison — no LLM involved in detecting what changed, only (elsewhere) in
// phrasing the one change type (eligibility text) that's genuinely free-form enough to benefit from it.
export function diffTrialSnapshots(before: TrialSnapshot, after: TrialSnapshot): TrialChange[] {
  const changes: TrialChange[] = [];

  if (before.status !== after.status) {
    changes.push({ type: "status", before: before.status, after: after.status });
  }

  const beforeKeys = new Set(before.locations.map(locationKey));
  const afterKeys = new Set(after.locations.map(locationKey));
  for (const loc of after.locations) {
    if (!beforeKeys.has(locationKey(loc))) changes.push({ type: "location_added", location: loc });
  }
  for (const loc of before.locations) {
    if (!afterKeys.has(locationKey(loc))) changes.push({ type: "location_removed", location: loc });
  }

  if (before.eligibilityCriteria.trim() !== after.eligibilityCriteria.trim()) {
    changes.push({ type: "eligibility_changed", before: before.eligibilityCriteria, after: after.eligibilityCriteria });
  }

  if (before.enrollmentCount !== after.enrollmentCount) {
    changes.push({ type: "enrollment_changed", before: before.enrollmentCount, after: after.enrollmentCount });
  }

  if (before.startDate !== after.startDate) {
    changes.push({ type: "date_changed", field: "startDate", before: before.startDate, after: after.startDate });
  }
  if (before.primaryCompletionDate !== after.primaryCompletionDate) {
    changes.push({
      type: "date_changed",
      field: "primaryCompletionDate",
      before: before.primaryCompletionDate,
      after: after.primaryCompletionDate,
    });
  }

  return changes;
}

// Deterministic, template-based phrasing for every change type except eligibility text — these are
// simple structured facts (a status word, a place name, a number, a date) that don't need an LLM to
// state plainly. Only eligibility_changed is free-form enough to be worth summarizing with one.
export function describeChange(change: TrialChange): string {
  switch (change.type) {
    case "status":
      return `🟢 Trial status changed from ${change.before.replaceAll("_", " ")} to ${change.after.replaceAll("_", " ")}`;
    case "location_added": {
      const place = [change.location.city, change.location.state || change.location.country].filter(Boolean).join(", ");
      return `📍 New site added: ${place}`;
    }
    case "location_removed": {
      const place = [change.location.city, change.location.state || change.location.country].filter(Boolean).join(", ");
      return `📍 Site removed: ${place}`;
    }
    case "enrollment_changed":
      return `📊 Enrollment target changed from ${change.before ?? "unknown"} to ${change.after ?? "unknown"}`;
    case "date_changed": {
      const label = change.field === "startDate" ? "Start date" : "Primary completion date";
      return `📅 ${label} changed from ${change.before ?? "unknown"} to ${change.after ?? "unknown"}`;
    }
    case "eligibility_changed":
      return "⚠️ Eligibility criteria changed";
  }
}
