"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TrialSnapshot, TrialChange } from "@/lib/trialDiff";
import { getTrackedTrials, untrackTrial, recordCheck, type TrackedTrial, type ChangeFeedEntry } from "@/lib/tracking";
import { HelpLink } from "@/components/HelpLink";

function buildSimulatedSnapshot(current: TrialSnapshot): TrialSnapshot {
  const nextStatus = current.status === "RECRUITING" ? "ACTIVE_NOT_RECRUITING" : "RECRUITING";
  const fakeLocation = { city: "Cambridge", state: "Massachusetts", country: "United States" };
  const hasFakeLocation = current.locations.some((l) => l.city === fakeLocation.city && l.state === fakeLocation.state);

  return {
    ...current,
    status: nextStatus,
    locations: hasFakeLocation ? current.locations : [...current.locations, fakeLocation],
    eligibilityCriteria:
      current.eligibilityCriteria +
      "\n\n* Note: Extended 6-month follow-up visit now required after treatment completion.",
    enrollmentCount: current.enrollmentCount !== null ? current.enrollmentCount + 25 : 100,
  };
}

function formatChangeType(change: TrialChange): string {
  switch (change.type) {
    case "status":
      return "Status";
    case "location_added":
    case "location_removed":
      return "Location";
    case "eligibility_changed":
      return "Eligibility";
    case "enrollment_changed":
      return "Enrollment";
    case "date_changed":
      return "Dates";
  }
}

export default function TrackedPage() {
  const [items, setItems] = useState<TrackedTrial[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [checkError, setCheckError] = useState<Record<string, string>>({});

  useEffect(() => {
    setItems(getTrackedTrials());
  }, []);

  async function runCheck(item: TrackedTrial, simulated: boolean) {
    setBusy((prev) => ({ ...prev, [item.nctId]: true }));
    setCheckError((prev) => ({ ...prev, [item.nctId]: "" }));
    try {
      const body: { nctId: string; previousSnapshot: TrialSnapshot; simulatedAfter?: TrialSnapshot } = {
        nctId: item.nctId,
        previousSnapshot: item.snapshot,
      };
      if (simulated) body.simulatedAfter = buildSimulatedSnapshot(item.snapshot);

      const res = await fetch("/api/track/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const data: { snapshot: TrialSnapshot; changes: ChangeFeedEntry["changes"] } = await res.json();

      const entry: ChangeFeedEntry = { checkedAt: new Date().toISOString(), changes: data.changes, simulated };
      recordCheck(item.nctId, data.snapshot, entry);
      setItems(getTrackedTrials());
    } catch {
      setCheckError((prev) => ({ ...prev, [item.nctId]: "Something went wrong checking for updates. Try again." }));
    } finally {
      setBusy((prev) => ({ ...prev, [item.nctId]: false }));
    }
  }

  function handleUntrack(nctId: string) {
    untrackTrial(nctId);
    setItems(getTrackedTrials());
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-emerald-800/70 hover:text-emerald-700 hover:underline dark:text-emerald-300/70 dark:hover:text-emerald-200">
          ← Back
        </Link>
        <Link href="/help" className="text-sm text-emerald-800/70 hover:text-emerald-700 hover:underline dark:text-emerald-300/70 dark:hover:text-emerald-200">
          Help
        </Link>
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-emerald-950 dark:text-emerald-50">
        Tracked trials
      </h1>
      <p className="mt-2 flex items-center gap-1 text-emerald-900/60 dark:text-emerald-200/60">
        Trial Compass doesn&apos;t just show you trials today — check back here to see what&apos;s
        changed since you last looked. Tracking is stored in this browser only.
        <HelpLink entry="howTrackingWorks" />
      </p>

      {items.length === 0 && (
        <p className="mt-8 text-sm text-emerald-900/60 dark:text-emerald-200/60">
          No trials tracked yet. Find a trial on the{" "}
          <Link href="/match" className="text-emerald-700 underline dark:text-emerald-300">
            match page
          </Link>{" "}
          and click &ldquo;Track this trial.&rdquo;
        </p>
      )}

      <ul className="mt-8 flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.nctId} className="rounded-2xl border border-emerald-100 bg-white/70 p-5 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-medium text-emerald-950 dark:text-emerald-50">{item.snapshot.title}</h2>
                <p className="mt-0.5 text-xs text-emerald-900/60 dark:text-emerald-200/60">
                  {item.condition} · {item.nctId} · last checked{" "}
                  {new Date(item.snapshot.capturedAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => handleUntrack(item.nctId)}
                className="shrink-0 text-xs text-emerald-900/40 hover:underline dark:text-emerald-300/40"
              >
                Untrack
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4">
              <button
                onClick={() => runCheck(item, false)}
                disabled={busy[item.nctId]}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
              >
                {busy[item.nctId] ? "Checking…" : "Check for updates"}
              </button>
              <button
                onClick={() => runCheck(item, true)}
                disabled={busy[item.nctId]}
                className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-950/85 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800/60 dark:text-emerald-100/85 dark:hover:bg-emerald-900/30"
              >
                Fast-forward (simulate changes)
              </button>
            </div>

            {checkError[item.nctId] && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{checkError[item.nctId]}</p>
            )}

            {item.history.length === 0 ? (
              <p className="mt-3 text-xs text-emerald-900/40 dark:text-emerald-300/40">
                No changes detected yet — check back later, or use fast-forward to see how this
                works.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {item.history.map((entry, i) => (
                  <div key={i} className="border-l-2 border-emerald-100 pl-3 dark:border-emerald-800/60">
                    <p className="text-xs text-emerald-900/40 dark:text-emerald-300/40">
                      {new Date(entry.checkedAt).toLocaleString()}
                      {entry.simulated && " · simulated"}
                    </p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {entry.changes.map((change, j) => (
                        <li key={j} className="text-sm text-emerald-950/85 dark:text-emerald-100/85">
                          <span className="text-xs text-emerald-900/40 dark:text-emerald-300/40">
                            [{formatChangeType(change)}]
                          </span>{" "}
                          {change.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
