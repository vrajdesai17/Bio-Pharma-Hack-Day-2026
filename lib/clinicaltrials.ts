const BASE_URL = "https://clinicaltrials.gov/api/v2/studies";

export type TrialLocation = {
  city: string;
  state: string;
  country: string;
};

export type Trial = {
  nctId: string;
  title: string;
  status: string;
  phases: string[];
  conditions: string[];
  briefSummary: string;
  eligibilityCriteria: string;
  locations: TrialLocation[];
  enrollmentCount: number | null;
  startDate: string | null;
  primaryCompletionDate: string | null;
  lastUpdatePostDate: string | null;
  url: string;
};

function parseStudy(study: Record<string, any>): Trial {
  const section = study.protocolSection ?? {};
  const id = section.identificationModule ?? {};
  const status = section.statusModule ?? {};
  const design = section.designModule ?? {};
  const conditions = section.conditionsModule ?? {};
  const description = section.descriptionModule ?? {};
  const eligibility = section.eligibilityModule ?? {};
  const contactsLocations = section.contactsLocationsModule ?? {};

  const seen = new Set<string>();
  const locations: TrialLocation[] = [];
  for (const loc of contactsLocations.locations ?? []) {
    const city = loc.city ?? "";
    const state = loc.state ?? "";
    const country = loc.country ?? "";
    if (!city && !state && !country) continue;
    const key = `${city}|${state}|${country}`;
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push({ city, state, country });
  }

  return {
    nctId: id.nctId ?? "",
    title: id.briefTitle ?? "Untitled study",
    status: status.overallStatus ?? "UNKNOWN",
    phases: design.phases ?? [],
    conditions: conditions.conditions ?? [],
    briefSummary: description.briefSummary ?? "",
    eligibilityCriteria: eligibility.eligibilityCriteria ?? "",
    locations,
    enrollmentCount: design.enrollmentInfo?.count ?? null,
    startDate: status.startDateStruct?.date ?? null,
    primaryCompletionDate: status.primaryCompletionDateStruct?.date ?? null,
    lastUpdatePostDate: status.lastUpdatePostDateStruct?.date ?? null,
    url: `https://clinicaltrials.gov/study/${id.nctId}`,
  };
}

export async function fetchTrials(
  condition: string,
  opts: { status?: string; pageSize?: number } = {}
): Promise<Trial[]> {
  const params = new URLSearchParams({
    "query.cond": condition,
    pageSize: String(opts.pageSize ?? 30),
  });
  if (opts.status) params.set("filter.overallStatus", opts.status);

  const res = await fetch(`${BASE_URL}?${params}`, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov request failed: ${res.status}`);
  }
  const data = await res.json();

  return (data.studies ?? []).map(parseStudy);
}

export async function fetchTrialById(nctId: string): Promise<Trial | null> {
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(nctId)}`, { cache: "no-store" });
  if (!res.ok) return null;
  const study = await res.json();
  return parseStudy(study);
}

export const STATUSES = [
  "RECRUITING",
  "ACTIVE_NOT_RECRUITING",
  "COMPLETED",
  "TERMINATED",
  "NOT_YET_RECRUITING",
] as const;

export type TrialStats = {
  total: number;
  byStatus: Record<(typeof STATUSES)[number], number>;
};

export async function fetchTrialStats(condition: string): Promise<TrialStats> {
  const counts = await Promise.all(
    STATUSES.map(async (status) => {
      const params = new URLSearchParams({
        "query.cond": condition,
        "filter.overallStatus": status,
        pageSize: "1",
        countTotal: "true",
      });
      const res = await fetch(`${BASE_URL}?${params}`, { next: { revalidate: 3600 } });
      if (!res.ok) return 0;
      const data = await res.json();
      return data.totalCount ?? 0;
    })
  );

  const byStatus = Object.fromEntries(STATUSES.map((status, i) => [status, counts[i]])) as TrialStats["byStatus"];
  const total = counts.reduce((sum, n) => sum + n, 0);
  return { total, byStatus };
}
