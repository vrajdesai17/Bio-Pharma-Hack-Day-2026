"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PatientProfile, TrialMatch } from "@/lib/llm";
import type { Trial, TrialLocation } from "@/lib/clinicaltrials";

type MatchResult = { condition: string; profile: PatientProfile; stubbed: boolean };
type EligibilityResult = { trial: Trial; match: TrialMatch };

function formatLocation(loc: TrialLocation): string {
  return [loc.city, loc.state || loc.country].filter(Boolean).join(", ");
}

// Deliberately not run through the LLM — whether a site is near the patient is a plain string
// comparison, not a medical judgment call, so it stays out of the verdict/confidence logic.
function findNearbyLocation(patientLocation: string | null, locations: TrialLocation[]): TrialLocation | null {
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

const VERDICT_META: Record<TrialMatch["verdict"], { label: string; color: string }> = {
  match: { label: "Likely match", color: "#0ca30c" },
  possible: { label: "Possible match", color: "#fab219" },
  unclear: { label: "Unclear", color: "#898781" },
  no_match: { label: "Unlikely match", color: "#898781" },
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

function MatchForm() {
  const searchParams = useSearchParams();
  const [condition, setCondition] = useState(searchParams.get("condition") ?? "");
  const [profile, setProfile] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [eligibility, setEligibility] = useState<{ results: EligibilityResult[]; trialsConsidered: number } | null>(
    null
  );
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [expandedTrials, setExpandedTrials] = useState<Set<string>>(new Set());

  function toggleExpanded(nctId: string) {
    setExpandedTrials((prev) => {
      const next = new Set(prev);
      if (next.has(nctId)) next.delete(nctId);
      else next.add(nctId);
      return next;
    });
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
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Back
      </Link>
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
            checked individually against the trial&apos;s own eligibility criteria. AI-generated —
            verify with your care team before acting on any result below.
          </p>

          <ul className="mt-4 flex flex-col gap-4">
            {eligibility.results.map(({ trial, match }) => {
              const meta = VERDICT_META[match.verdict];
              const patientLocation = result?.profile.location ?? null;
              const nearby = findNearbyLocation(patientLocation, trial.locations);
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
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {match.confidence}% confidence
                    </span>
                  </div>

                  <h3 className="mt-2 font-medium text-black dark:text-zinc-50">{trial.title}</h3>

                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{match.reasoning}</p>

                  <blockquote className="mt-3 border-l-2 border-black/[.15] pl-3 text-sm italic text-zinc-500 dark:border-white/[.2] dark:text-zinc-400">
                    &ldquo;{match.citedCriteria}&rdquo;
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

                  <div className="mt-3 flex items-center gap-4">
                    <a
                      href={trial.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-sm text-zinc-500 hover:underline dark:text-zinc-400"
                    >
                      {trial.nctId} on ClinicalTrials.gov ↗
                    </a>
                    <button
                      onClick={() => toggleExpanded(trial.nctId)}
                      className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
                    >
                      {expandedTrials.has(trial.nctId) ? "Hide full criteria" : "Show full eligibility criteria"}
                    </button>
                  </div>

                  {expandedTrials.has(trial.nctId) && (
                    <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/[.03] p-3 font-sans text-xs text-zinc-600 dark:bg-white/[.06] dark:text-zinc-300">
                      {trial.eligibilityCriteria || "No eligibility criteria text is available for this trial."}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
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
