import type { Trial, TrialLocation } from "./clinicaltrials";
import type { TrialMatch } from "./llm";

export type ConfidenceFilter = "high" | "highMedium" | "all";
export type RecruitmentFilter = "recruiting" | "notYetRecruiting" | "all";
export type RecentUpdateFilter = "30" | "90" | "180" | "any";
export type StudyStartFilter = "30" | "90" | "started" | "any";

export type TrialFilters = {
  confidence: ConfidenceFilter;
  nearbyOnly: boolean;
  recruitment: RecruitmentFilter;
  recentUpdate: RecentUpdateFilter;
  studyStart: StudyStartFilter;
};

export const DEFAULT_FILTERS: TrialFilters = {
  confidence: "all",
  nearbyOnly: false,
  recruitment: "all",
  recentUpdate: "any",
  studyStart: "any",
};

function daysBetween(dateStr: string | null, now: number): number | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr).getTime();
  if (Number.isNaN(parsed)) return null;
  return (now - parsed) / (1000 * 60 * 60 * 24);
}

export function passesConfidenceFilter(match: TrialMatch, filter: ConfidenceFilter): boolean {
  if (filter === "all") return true;
  if (filter === "highMedium") return match.confidence >= 50;
  return match.confidence >= 75; // "high"
}

export function passesRecruitmentFilter(trial: Trial, filter: RecruitmentFilter): boolean {
  if (filter === "all") return true;
  if (filter === "recruiting") return trial.status === "RECRUITING";
  return trial.status === "NOT_YET_RECRUITING";
}

export function passesRecentUpdateFilter(trial: Trial, filter: RecentUpdateFilter, now: number): boolean {
  if (filter === "any") return true;
  const days = daysBetween(trial.lastUpdatePostDate, now);
  if (days === null) return false;
  return days <= Number(filter);
}

export function passesStudyStartFilter(trial: Trial, filter: StudyStartFilter, now: number): boolean {
  if (filter === "any") return true;
  const days = daysBetween(trial.startDate, now);
  if (days === null) return false;
  if (filter === "started") return days >= 0;
  // "within N days" — either upcoming (negative days-until, i.e. start is in the future) or
  // already started within the last N days. Keep it simple: |days since start| <= N.
  return Math.abs(days) <= Number(filter);
}

// Deliberately not run through the LLM — whether a site is near the patient is a plain string
// comparison, not a medical judgment call, so it stays out of the verdict/confidence logic.
export function findNearbyLocation(
  patientLocation: string | null,
  locations: TrialLocation[]
): TrialLocation | null {
  if (!patientLocation) return null;
  const words = patientLocation.toLowerCase().split(/[\s,]+/).filter((w) => w.length >= 3);
  if (words.length === 0) return null;
  return (
    locations.find((loc) => {
      const haystack = `${loc.city} ${loc.state} ${loc.country}`.toLowerCase();
      return words.some((w) => haystack.includes(w));
    }) ?? null
  );
}

export function hasNearbySite(patientLocation: string | null, locations: TrialLocation[]): boolean {
  return findNearbyLocation(patientLocation, locations) !== null;
}

export function applyTrialFilters(
  results: { trial: Trial; match: TrialMatch }[],
  filters: TrialFilters,
  patientLocation: string | null,
  now: number
): { trial: Trial; match: TrialMatch }[] {
  return results.filter(({ trial, match }) => {
    if (!passesConfidenceFilter(match, filters.confidence)) return false;
    if (!passesRecruitmentFilter(trial, filters.recruitment)) return false;
    if (!passesRecentUpdateFilter(trial, filters.recentUpdate, now)) return false;
    if (!passesStudyStartFilter(trial, filters.studyStart, now)) return false;
    if (filters.nearbyOnly && !hasNearbySite(patientLocation, trial.locations)) return false;
    return true;
  });
}
