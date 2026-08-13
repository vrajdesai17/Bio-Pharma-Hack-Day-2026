"use client";

import type { TrialSnapshot, TrialChange } from "@/lib/trialDiff";

const STORAGE_KEY = "trial-compass:tracked-trials";

export type ChangeFeedEntry = {
  checkedAt: string;
  changes: (TrialChange & { message: string })[];
  simulated: boolean;
};

export type TrackedTrial = {
  nctId: string;
  condition: string;
  snapshot: TrialSnapshot;
  history: ChangeFeedEntry[];
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getTrackedTrials(): TrackedTrial[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TrackedTrial[]) : [];
  } catch {
    return [];
  }
}

function saveTrackedTrials(items: TrackedTrial[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function isTracked(nctId: string): boolean {
  return getTrackedTrials().some((t) => t.nctId === nctId);
}

export function trackTrial(nctId: string, condition: string, snapshot: TrialSnapshot): void {
  const items = getTrackedTrials();
  if (items.some((t) => t.nctId === nctId)) return;
  items.push({ nctId, condition, snapshot, history: [] });
  saveTrackedTrials(items);
}

export function untrackTrial(nctId: string): void {
  saveTrackedTrials(getTrackedTrials().filter((t) => t.nctId !== nctId));
}

export function recordCheck(nctId: string, newSnapshot: TrialSnapshot, entry: ChangeFeedEntry): void {
  const items = getTrackedTrials();
  const item = items.find((t) => t.nctId === nctId);
  if (!item) return;
  item.snapshot = newSnapshot;
  if (entry.changes.length > 0) item.history.unshift(entry);
  saveTrackedTrials(items);
}
