"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PatientProfile, TrialMatch, MissingInfoItem } from "@/lib/llm";
import type { Trial, TrialLocation } from "@/lib/clinicaltrials";
import { snapshotFromTrial } from "@/lib/trialDiff";
import { trackTrial, getTrackedTrials } from "@/lib/tracking";
import { HelpLink } from "@/components/HelpLink";
import { findNearbyLocation, applyTrialFilters, DEFAULT_FILTERS, type TrialFilters } from "@/lib/trialFilters";

type MatchResult = { condition: string; profile: PatientProfile; stubbed: boolean };
type EligibilityResult = { trial: Trial; match: TrialMatch };

function formatLocation(loc: TrialLocation): string {
  return [loc.city, loc.state || loc.country].filter(Boolean).join(", ");
}

const VERDICT_META: Record<TrialMatch["verdict"], { label: string; color: string }> = {
  PASS: { label: "Likely match", color: "#0ca30c" },
  UNKNOWN: { label: "Possible match", color: "#fab219" },
  FAIL: { label: "Unlikely match", color: "#d03b3b" },
};

const CRITERION_STATUS_META: Record<TrialMatch["criteria"][number]["status"], { label: string; color: string }> = {
  met: { label: "Met", color: "#0ca30c" },
  not_met: { label: "Not met", color: "#d03b3b" },
  unknown: { label: "Unknown", color: "#898781" },
};

const PROFILE_FIELD_LABELS: Record<keyof PatientProfile, string> = {
  age: "Age",
  diagnosis: "Diagnosis",
  stage: "Stage",
  priorTreatments: "Prior treatments",
  biomarkers: "Biomarkers",
  comorbidities: "Comorbidities",
  location: "Location",
};

function formatFieldValue(value: PatientProfile[keyof PatientProfile]): string {
  if (value === null) return "not mentioned";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "not mentioned";
  return String(value);
}

type LanguageMode = "original" | "standard" | "simple";
type SimplifyResult = { criteria: string[]; standard: string[]; simple: string[] };
type CacheEntry<T> = T | "loading" | "error";

function resolveText(mode: LanguageMode, originalText: string, cache: CacheEntry<SimplifyResult> | undefined): string {
  if (mode === "original" || !cache || cache === "loading" || cache === "error") return originalText;
  const idx = cache.criteria.indexOf(originalText);
  if (idx === -1) return originalText;
  return mode === "simple" ? cache.simple[idx] : cache.standard[idx];
}

function MatchForm() {
  const searchParams = useSearchParams();
  const [condition, setCondition] = useState(searchParams.get("condition") ?? "");
  const [profile, setProfile] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(
    () => new Set(getTrackedTrials().map((t) => t.nctId))
  );

  function handleTrack(trial: Trial, forCondition: string) {
    trackTrial(trial.nctId, forCondition, snapshotFromTrial(trial, new Date().toISOString()));
    setTrackedIds((prev) => new Set(prev).add(trial.nctId));
  }

  const [eligibility, setEligibility] = useState<{ results: EligibilityResult[]; trialsConsidered: number } | null>(
    null
  );
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [expandedTrials, setExpandedTrials] = useState<Set<string>>(new Set());
  const [expandedCriteria, setExpandedCriteria] = useState<Set<string>>(new Set());
  const [expandedMissingInfo, setExpandedMissingInfo] = useState<Set<string>>(new Set());
  const [languageMode, setLanguageMode] = useState<Record<string, LanguageMode>>({});
  const [simplifiedCache, setSimplifiedCache] = useState<Record<string, CacheEntry<SimplifyResult>>>({});
  const [missingInfoCache, setMissingInfoCache] = useState<Record<string, CacheEntry<MissingInfoItem[]>>>({});
  const [filters, setFilters] = useState<TrialFilters>(DEFAULT_FILTERS);

  function toggleInSet(set: Set<string>, setSet: (s: Set<string>) => void, key: string) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSet(next);
  }

  async function selectLanguage(nctId: string, mode: LanguageMode, trial: Trial, criteria: TrialMatch["criteria"]) {
    setLanguageMode((prev) => ({ ...prev, [nctId]: mode }));
    if (mode === "original" || simplifiedCache[nctId]) return;
    setSimplifiedCache((prev) => ({ ...prev, [nctId]: "loading" }));
    try {
      const res = await fetch("/api/trial-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "simplify",
          trial: { title: trial.title, eligibilityCriteria: trial.eligibilityCriteria },
          criteria,
        }),
      });
      if (!res.ok) throw new Error();
      const data: SimplifyResult = await res.json();
      setSimplifiedCache((prev) => ({ ...prev, [nctId]: data }));
    } catch {
      setSimplifiedCache((prev) => ({ ...prev, [nctId]: "error" }));
    }
  }

  async function toggleMissingInfo(
    nctId: string,
    trial: Trial,
    criteria: TrialMatch["criteria"],
    patientProfile: PatientProfile | null | undefined
  ) {
    const wasExpanded = expandedMissingInfo.has(nctId);
    toggleInSet(expandedMissingInfo, setExpandedMissingInfo, nctId);
    if (wasExpanded || missingInfoCache[nctId] || !patientProfile) return;

    setMissingInfoCache((prev) => ({ ...prev, [nctId]: "loading" }));
    try {
      const res = await fetch("/api/trial-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "missing_info",
          trial: { title: trial.title, eligibilityCriteria: trial.eligibilityCriteria },
          criteria,
          profile: patientProfile,
        }),
      });
      if (!res.ok) throw new Error();
      const data: { items: MissingInfoItem[] } = await res.json();
      setMissingInfoCache((prev) => ({ ...prev, [nctId]: data.items }));
    } catch {
      setMissingInfoCache((prev) => ({ ...prev, [nctId]: "error" }));
    }
  }

  const canSubmit = condition.trim().length > 0 && profile.trim().length > 0 && !loading;

  async function findMatchingTrials() {
    if (!result || result.stubbed) return;
    setEligibilityLoading(true);
    setEligibilityError(null);
    try {
      const res = await fetch("/api/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condition: result.condition, profileText: profile.trim(), profile: result.profile }),
      });
      if (!res.ok) throw new Error();
      setEligibility(await res.json());
    } catch {
      setEligibilityError("Something went wrong checking trial eligibility. Try again.");
    } finally {
      setEligibilityLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Back
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/help" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            Help
          </Link>
          <Link href="/tracked" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            Tracked trials →
          </Link>
        </div>
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Find trials that match you
      </h1>
      <p className="mt-2 text-zinc-500 dark:text-zinc-400">
        Describe yourself in your own words. We&apos;ll check what you say against the actual
        eligibility criteria of real trials — and show you exactly why each one matched or
        didn&apos;t.
      </p>

      <p className="mt-4 rounded-xl border-l-2 border-[#fab219] bg-black/[.02] px-4 py-3 text-sm text-zinc-600 dark:bg-white/[.04] dark:text-zinc-300">
        This is AI-assisted information, not medical advice. Match results can be wrong or
        incomplete — always confirm eligibility with your doctor or the trial&apos;s own study team
        before acting on anything shown here.
      </p>

      <form
        className="mt-8 flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canSubmit) return;
          setLoading(true);
          setError(null);
          try {
            const res = await fetch("/api/match", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ condition: condition.trim(), profileText: profile.trim() }),
            });
            if (!res.ok) throw new Error();
            const data: MatchResult = await res.json();
            setResult(data);
          } catch {
            setError("Something went wrong extracting your profile. Try again.");
          } finally {
            setLoading(false);
          }
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Condition</span>
          <input
            type="text"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            placeholder="e.g. pancreatic cancer"
            className="rounded-xl border border-black/[.08] bg-white px-4 py-2.5 text-base outline-none focus:border-black/30 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Tell us about your situation
          </span>
          <textarea
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            rows={6}
            placeholder="e.g. I'm 62, diagnosed with stage 3 pancreatic cancer, had one round of chemo (FOLFIRINOX), no diabetes, based in Boston."
            className="resize-none rounded-xl border border-black/[.08] bg-white px-4 py-2.5 text-base outline-none focus:border-black/30 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50"
          />
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            Age, diagnosis details, stage, prior treatments, and anything else you think matters —
            plain language is fine.
          </span>
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="self-start rounded-full bg-foreground px-6 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-[#ccc]"
        >
          {loading ? "Extracting…" : "Find my matches"}
        </button>
      </form>

      {error && <p className="mt-6 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {result && (
        <div className="mt-8 rounded-2xl border border-black/[.08] p-5 dark:border-white/[.145]">
          {result.stubbed ? (
            <>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                LLM not configured yet
              </p>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                No <code>OPENAI_API_KEY</code> is set, so the profile below is an empty
                placeholder — the request path is wired up and ready, it just has nothing to call.
              </p>
            </>
          ) : (
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Structured profile for {result.condition}
            </p>
          )}
          <dl className="mt-3 flex flex-col gap-2">
            {(Object.keys(PROFILE_FIELD_LABELS) as (keyof PatientProfile)[]).map((key) => (
              <div key={key} className="flex gap-2 text-sm">
                <dt className="w-36 shrink-0 text-zinc-500 dark:text-zinc-400">
                  {PROFILE_FIELD_LABELS[key]}
                </dt>
                <dd className="text-zinc-800 dark:text-zinc-200">
                  {formatFieldValue(result.profile[key])}
                </dd>
              </div>
            ))}
          </dl>

          {!result.stubbed && (
            <button
              onClick={findMatchingTrials}
              disabled={eligibilityLoading}
              className="mt-5 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-[#ccc]"
            >
              {eligibilityLoading ? "Checking trials…" : "See matching trials →"}
            </button>
          )}
        </div>
      )}

      {eligibilityError && (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400">{eligibilityError}</p>
      )}

      {eligibility && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Trial matches
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            Based on the {eligibility.trialsConsidered} recruiting trials for this condition — each
            argued for and against by two independent agents, then judged against the trial&apos;s
            own eligibility criteria. AI-generated — verify with your care team before acting on any
            result below. Confidence reflects how sure the judge is in <em>this assessment</em>, not
            the odds of enrolling or a treatment working.
          </p>

          {(() => {
            const patientLocation = result?.profile.location ?? null;
            const filtered = applyTrialFilters(eligibility.results, filters, patientLocation, Date.now());
            return (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-black/[.08] p-3 text-xs dark:border-white/[.145]">
                  <label className="flex items-center gap-1.5">
                    Confidence
                    <select
                      value={filters.confidence}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, confidence: e.target.value as TrialFilters["confidence"] }))
                      }
                      className="rounded-md border border-black/[.08] bg-transparent px-1.5 py-1 dark:border-white/[.145]"
                    >
                      <option value="all">All</option>
                      <option value="highMedium">High + Medium (≥50%)</option>
                      <option value="high">High only (≥75%)</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-1.5">
                    Recruitment
                    <select
                      value={filters.recruitment}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, recruitment: e.target.value as TrialFilters["recruitment"] }))
                      }
                      className="rounded-md border border-black/[.08] bg-transparent px-1.5 py-1 dark:border-white/[.145]"
                    >
                      <option value="all">All</option>
                      <option value="recruiting">Recruiting</option>
                      <option value="notYetRecruiting">Not yet recruiting</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-1.5">
                    Updated within
                    <select
                      value={filters.recentUpdate}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, recentUpdate: e.target.value as TrialFilters["recentUpdate"] }))
                      }
                      className="rounded-md border border-black/[.08] bg-transparent px-1.5 py-1 dark:border-white/[.145]"
                    >
                      <option value="any">Any time</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="180">180 days</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-1.5">
                    Study start
                    <select
                      value={filters.studyStart}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, studyStart: e.target.value as TrialFilters["studyStart"] }))
                      }
                      className="rounded-md border border-black/[.08] bg-transparent px-1.5 py-1 dark:border-white/[.145]"
                    >
                      <option value="any">Any time</option>
                      <option value="30">Within 30 days</option>
                      <option value="90">Within 90 days</option>
                      <option value="started">Already started</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={filters.nearbyOnly}
                      disabled={!patientLocation}
                      onChange={(e) => setFilters((f) => ({ ...f, nearbyOnly: e.target.checked }))}
                    />
                    Has a nearby site{!patientLocation && " (no location given)"}
                  </label>

                  {filters !== DEFAULT_FILTERS && (
                    <button
                      onClick={() => setFilters(DEFAULT_FILTERS)}
                      className="text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                      Reset filters
                    </button>
                  )}
                </div>

                <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                  Showing {filtered.length} of {eligibility.results.length} trials
                </p>

                <ul className="mt-4 flex flex-col gap-4">
                  {filtered.map(({ trial, match }) => {
                    const meta = VERDICT_META[match.verdict];
                    const nearby = findNearbyLocation(patientLocation, trial.locations);
              const mode = languageMode[trial.nctId] ?? "original";
              const langCache = simplifiedCache[trial.nctId];
              const missingInfo = missingInfoCache[trial.nctId];
              return (
                <li
                  key={trial.nctId}
                  className="rounded-2xl border border-black/[.08] p-5 dark:border-white/[.145]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="text-zinc-700 dark:text-zinc-300">{meta.label}</span>
                      <HelpLink entry="whyUnknown" />
                    </span>
                    <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {match.confidence}% confidence
                      <HelpLink entry="whatConfidenceMeans" />
                    </span>
                  </div>
                  {match.verdictAdjusted && (
                    <p className="mt-1.5 text-xs text-[#d03b3b]">
                      Adjusted from the judge&apos;s original verdict — it didn&apos;t logically
                      follow from its own criterion-by-criterion breakdown below.
                    </p>
                  )}

                  <h3 className="mt-2 font-medium text-black dark:text-zinc-50">{trial.title}</h3>

                  <div className="mt-3 flex flex-col gap-1.5 text-sm">
                    <p className="text-zinc-600 dark:text-zinc-300">
                      <span className="font-medium text-[#0ca30c]">FOR: </span>
                      {match.forArgument}
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-300">
                      <span className="font-medium text-[#d03b3b]">AGAINST: </span>
                      {match.againstArgument}
                    </p>
                    <p className="text-zinc-700 dark:text-zinc-200">
                      <span className="font-medium">JUDGE: </span>
                      {match.reasoning}
                      <span className="ml-1 inline-flex align-middle">
                        <HelpLink entry="howForAgainstJudgeWorks" />
                      </span>
                    </p>
                  </div>

                  <p className="mt-2 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Evidence coverage: {match.evidenceCoverage.checkable}/{match.evidenceCoverage.total} criteria
                    checkable from what you said
                    <HelpLink entry="howSourcesShown" />
                  </p>

                  <div className="mt-3 flex items-center gap-1 text-xs">
                    {(["original", "standard", "simple"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => selectLanguage(trial.nctId, m, trial, match.criteria)}
                        className={`rounded-full px-2.5 py-1 capitalize transition-colors ${
                          mode === m
                            ? "bg-foreground text-background"
                            : "text-zinc-500 hover:bg-black/[.05] dark:text-zinc-400 dark:hover:bg-white/[.08]"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                    {langCache === "loading" && <span className="text-zinc-400">Rewriting…</span>}
                    {langCache === "error" && <span className="text-[#d03b3b]">Couldn&apos;t rewrite — showing original</span>}
                  </div>

                  <blockquote className="mt-2 border-l-2 border-black/[.15] pl-3 text-sm italic text-zinc-500 dark:border-white/[.2] dark:text-zinc-400">
                    &ldquo;{resolveText(mode, match.citedCriteria, langCache)}&rdquo;
                  </blockquote>
                  {!match.citationVerified && (
                    <p className="mt-1.5 pl-3 text-xs text-[#d03b3b]">
                      Could not automatically verify this quote appears in the trial&apos;s
                      criteria text — check the full criteria below before relying on it.
                    </p>
                  )}

                  <div className="mt-3 text-sm">
                    {trial.locations.length === 0 ? (
                      <span className="text-zinc-400 dark:text-zinc-500">
                        No site location data available for this trial.
                      </span>
                    ) : nearby ? (
                      <span className="font-medium text-[#0ca30c]">
                        Has a site near &ldquo;{patientLocation}&rdquo;: {formatLocation(nearby)}
                      </span>
                    ) : (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {trial.locations.length} site{trial.locations.length === 1 ? "" : "s"}
                        {patientLocation && `, none matching "${patientLocation}"`}
                      </span>
                    )}
                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                      {trial.locations.slice(0, 6).map(formatLocation).join(" · ")}
                      {trial.locations.length > 6 && ` +${trial.locations.length - 6} more`}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <a
                      href={trial.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-sm text-zinc-500 hover:underline dark:text-zinc-400"
                    >
                      {trial.nctId} on ClinicalTrials.gov ↗
                    </a>
                    <button
                      onClick={() => toggleInSet(expandedTrials, setExpandedTrials, trial.nctId)}
                      className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
                    >
                      {expandedTrials.has(trial.nctId) ? "Hide full criteria" : "Show full eligibility criteria"}
                    </button>
                    <button
                      onClick={() => toggleInSet(expandedCriteria, setExpandedCriteria, trial.nctId)}
                      className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
                    >
                      {expandedCriteria.has(trial.nctId) ? "Hide criterion breakdown" : "Show criterion-by-criterion breakdown"}
                    </button>
                    <button
                      onClick={() => toggleMissingInfo(trial.nctId, trial, match.criteria, result?.profile)}
                      className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
                    >
                      {expandedMissingInfo.has(trial.nctId) ? "Hide what's missing" : "What's still missing?"}
                    </button>
                    {trackedIds.has(trial.nctId) ? (
                      <span className="text-sm text-[#0ca30c]">✓ Tracking</span>
                    ) : (
                      <button
                        onClick={() => handleTrack(trial, result?.condition ?? condition)}
                        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
                      >
                        Track this trial
                      </button>
                    )}
                  </div>

                  {expandedMissingInfo.has(trial.nctId) && (
                    <div className="mt-3 rounded-lg bg-black/[.03] p-3 dark:bg-white/[.06]">
                      {missingInfo === "loading" && (
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">Checking what matters most…</p>
                      )}
                      {missingInfo === "error" && (
                        <p className="text-xs text-[#d03b3b]">Couldn&apos;t load this — try again.</p>
                      )}
                      {Array.isArray(missingInfo) && missingInfo.length === 0 && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Nothing unknown here stands out as especially critical to this assessment.
                        </p>
                      )}
                      {Array.isArray(missingInfo) && missingInfo.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Here&apos;s what we still need to know:
                          </p>
                          <ul className="mt-1.5 flex flex-col gap-1.5">
                            {missingInfo.map((item, i) => (
                              <li key={i} className="text-xs text-zinc-600 dark:text-zinc-400">
                                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                  {item.criterion}
                                </span>{" "}
                                — {item.whyItMatters}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}

                  {expandedTrials.has(trial.nctId) && (
                    <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/[.03] p-3 font-sans text-xs text-zinc-600 dark:bg-white/[.06] dark:text-zinc-300">
                      {trial.eligibilityCriteria || "No eligibility criteria text is available for this trial."}
                    </pre>
                  )}

                  {expandedCriteria.has(trial.nctId) && (
                    <ul className="mt-3 flex flex-col gap-2 rounded-lg bg-black/[.03] p-3 dark:bg-white/[.06]">
                      {match.criteria.length === 0 ? (
                        <li className="text-xs text-zinc-500 dark:text-zinc-400">
                          The judge didn&apos;t break this trial into individual criteria.
                        </li>
                      ) : (
                        match.criteria.map((c, i) => {
                          const statusMeta = CRITERION_STATUS_META[c.status];
                          return (
                            <li key={i} className="flex items-start gap-2 text-xs">
                              <span
                                className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: statusMeta.color }}
                              />
                              <span>
                                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                  {statusMeta.label}:
                                </span>{" "}
                                <span className="text-zinc-600 dark:text-zinc-400">
                                  {resolveText(mode, c.criterion, langCache)}
                                </span>
                              </span>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  )}
                </li>
              );
                  })}
                </ul>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default function MatchPage() {
  return (
    <Suspense>
      <MatchForm />
    </Suspense>
  );
}
