import Link from "next/link";
import { fetchTrials, fetchTrialStats, STATUSES } from "@/lib/clinicaltrials";
import { fetchRecentLabels } from "@/lib/openfda";
import { fetchRecentNovelApprovals } from "@/lib/novelApprovals";

const STATUS_META: Record<(typeof STATUSES)[number], { label: string; color: string }> = {
  RECRUITING: { label: "Recruiting", color: "#059669" },
  ACTIVE_NOT_RECRUITING: { label: "Active, not recruiting", color: "#f59e0b" },
  COMPLETED: { label: "Completed", color: "#60a5fa" },
  TERMINATED: { label: "Terminated", color: "#e11d48" },
  NOT_YET_RECRUITING: { label: "Not yet recruiting", color: "#8ba397" },
};

const PHASE_ORDER = ["EARLY_PHASE1", "PHASE1", "PHASE2", "PHASE3", "PHASE4", "NA"];
const PHASE_LABEL: Record<string, string> = {
  EARLY_PHASE1: "Early phase 1",
  PHASE1: "Phase 1",
  PHASE2: "Phase 2",
  PHASE3: "Phase 3",
  PHASE4: "Phase 4",
  NA: "Not applicable",
};
const PHASE_COLOR = ["#bbf1d6", "#7ee3b0", "#34d399", "#059669", "#065f46", "#8ba397"];

function formatDate(yyyymmdd: string) {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export default async function LandscapePage({
  params,
}: {
  params: Promise<{ condition: string }>;
}) {
  const { condition } = await params;
  const decoded = decodeURIComponent(condition);

  const [stats, recruitingTrials, recentLabels, novelApprovals] = await Promise.all([
    fetchTrialStats(decoded),
    fetchTrials(decoded, { status: "RECRUITING" }),
    fetchRecentLabels(decoded),
    fetchRecentNovelApprovals(decoded),
  ]);

  const phaseCounts = new Map<string, number>();
  for (const trial of recruitingTrials) {
    const phases = trial.phases.length > 0 ? trial.phases : ["NA"];
    for (const phase of phases) {
      phaseCounts.set(phase, (phaseCounts.get(phase) ?? 0) + 1);
    }
  }
  const maxPhaseCount = Math.max(1, ...phaseCounts.values());

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-emerald-800/70 hover:text-emerald-700 hover:underline dark:text-emerald-300/70 dark:hover:text-emerald-200">
          ← Back
        </Link>
        <Link href="/help" className="text-sm text-emerald-800/70 hover:text-emerald-700 hover:underline dark:text-emerald-300/70 dark:hover:text-emerald-200">
          Help
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-emerald-950 dark:text-emerald-50">
            {decoded}
          </h1>
          <p className="mt-1 text-emerald-900/60 dark:text-emerald-200/60">Treatment landscape overview</p>
        </div>
        <Link
          href={`/match?condition=${encodeURIComponent(decoded)}`}
          className="shrink-0 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-600 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
        >
          Find trials that match you →
        </Link>
      </div>

      {/* Stat tiles */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total trials found" value={stats.total} />
        {(["RECRUITING", "COMPLETED", "TERMINATED"] as const).map((status) => (
          <StatTile key={status} label={STATUS_META[status].label} value={stats.byStatus[status]} />
        ))}
      </div>

      {/* Status breakdown bar */}
      <section className="mt-10">
        <h2 className="text-sm font-medium text-emerald-900/60 dark:text-emerald-200/60">
          All trials by status
        </h2>
        <div className="mt-3 flex h-6 w-full overflow-hidden rounded-[4px] bg-emerald-50 dark:bg-emerald-950/40">
          {STATUSES.map((status) => {
            const count = stats.byStatus[status];
            if (count === 0 || stats.total === 0) return null;
            const widthPct = (count / stats.total) * 100;
            return (
              <div
                key={status}
                style={{ width: `${widthPct}%`, backgroundColor: STATUS_META[status].color }}
                className="h-full border-r-2 border-emerald-50 last:border-r-0 dark:border-emerald-950"
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-emerald-950/70 dark:text-emerald-200/70">
          {STATUSES.map((status) => (
            <span key={status} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: STATUS_META[status].color }}
              />
              {STATUS_META[status].label} ({stats.byStatus[status]})
            </span>
          ))}
        </div>
      </section>

      {/* Phase breakdown */}
      {phaseCounts.size > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-emerald-900/60 dark:text-emerald-200/60">
            Recruiting trials by phase
          </h2>
          <p className="mt-0.5 text-xs text-emerald-900/40 dark:text-emerald-300/40">
            Based on the {recruitingTrials.length} recruiting trials listed below, not all{" "}
            {stats.byStatus.RECRUITING.toLocaleString()} recruiting trials.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {PHASE_ORDER.filter((p) => phaseCounts.has(p)).map((phase) => {
              const count = phaseCounts.get(phase) ?? 0;
              const widthPct = (count / maxPhaseCount) * 100;
              const color = PHASE_COLOR[PHASE_ORDER.indexOf(phase)];
              return (
                <div key={phase} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-xs text-emerald-950/70 dark:text-emerald-200/70">
                    {PHASE_LABEL[phase]}
                  </span>
                  <div className="h-4 flex-1 rounded-r-[4px] bg-emerald-50 dark:bg-emerald-950/40">
                    <div
                      style={{ width: `${widthPct}%`, backgroundColor: color }}
                      className="h-full rounded-r-[4px]"
                    />
                  </div>
                  <span className="w-6 shrink-0 text-xs text-emerald-900/60 dark:text-emerald-200/60">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* FDA novel drug approvals — real approval dates, from FDA.gov's own list */}
      <section className="mt-10">
        <h2 className="text-sm font-medium text-emerald-900/60 dark:text-emerald-200/60">
          Recently FDA-approved treatments
        </h2>
        <p className="mt-0.5 text-xs text-emerald-900/40 dark:text-emerald-300/40">
          Genuine new approvals from FDA&apos;s own novel drug approvals list, last two years —
          not a label-update proxy.
        </p>
        {novelApprovals.length === 0 ? (
          <p className="mt-3 text-sm text-emerald-900/60 dark:text-emerald-200/60">
            No newly approved treatments found for this condition in the last two years.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {novelApprovals.map((approval) => (
              <li
                key={approval.drugName}
                className="rounded-2xl border border-emerald-100 bg-white/70 p-4 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-emerald-950 dark:text-emerald-50">
                    {approval.drugName}
                    {approval.activeIngredient && (
                      <span className="ml-1.5 font-normal text-emerald-900/60 dark:text-emerald-200/60">
                        ({approval.activeIngredient})
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-emerald-900/60 dark:text-emerald-200/60">
                    Approved {approval.approvalDate}
                  </span>
                </div>
                <p className="mt-2 text-sm text-emerald-950/70 dark:text-emerald-100/70">{approval.use}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* openFDA recent labels */}
      <section className="mt-10">
        <h2 className="text-sm font-medium text-emerald-900/60 dark:text-emerald-200/60">
          Recently updated FDA drug labels mentioning this condition
        </h2>
        {recentLabels.length === 0 ? (
          <p className="mt-3 text-sm text-emerald-900/60 dark:text-emerald-200/60">
            No matching FDA labels found.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {recentLabels.map((label, i) => (
              <li
                key={`${label.brandName}-${i}`}
                className="rounded-2xl border border-emerald-100 bg-white/70 p-4 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-emerald-950 dark:text-emerald-50">
                    {label.brandName}
                    {label.genericName && label.genericName !== label.brandName && (
                      <span className="ml-1.5 font-normal text-emerald-900/60 dark:text-emerald-200/60">
                        ({label.genericName})
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-emerald-900/60 dark:text-emerald-200/60">
                    {formatDate(label.effectiveTime)}
                  </span>
                </div>
                {label.manufacturer && (
                  <p className="mt-0.5 text-xs text-emerald-900/60 dark:text-emerald-200/60">
                    {label.manufacturer}
                  </p>
                )}
                <p className="mt-2 text-sm text-emerald-950/70 dark:text-emerald-100/70">
                  {label.indicationSnippet}…
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Raw recruiting trial list */}
      <section className="mt-10">
        <h2 className="text-sm font-medium text-emerald-900/60 dark:text-emerald-200/60">
          Recruiting trials
        </h2>
        <ul className="mt-3 flex flex-col gap-4">
          {recruitingTrials.map((trial) => (
            <li
              key={trial.nctId}
              className="rounded-2xl border border-emerald-100 bg-white/70 p-5 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                  {trial.status.replaceAll("_", " ")}
                </span>
                {trial.phases.length > 0 && (
                  <span className="text-xs text-emerald-900/60 dark:text-emerald-200/60">
                    {trial.phases.join(", ")}
                  </span>
                )}
              </div>
              <h3 className="mt-2 font-medium text-emerald-950 dark:text-emerald-50">{trial.title}</h3>
              <a
                href={trial.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-emerald-800/70 hover:text-emerald-700 hover:underline dark:text-emerald-300/70 dark:hover:text-emerald-200"
              >
                {trial.nctId} on ClinicalTrials.gov ↗
              </a>
            </li>
          ))}
        </ul>

        {recruitingTrials.length === 0 && (
          <p className="mt-4 text-emerald-900/60 dark:text-emerald-200/60">
            No recruiting trials found for this condition.
          </p>
        )}
      </section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white/70 p-4 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <p className="text-xs text-emerald-900/60 dark:text-emerald-200/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-emerald-950 dark:text-emerald-50">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
