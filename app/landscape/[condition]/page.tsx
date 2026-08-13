import Link from "next/link";
import { fetchTrials, fetchTrialStats, STATUSES } from "@/lib/clinicaltrials";
import { fetchRecentLabels } from "@/lib/openfda";
import { fetchRecentNovelApprovals } from "@/lib/novelApprovals";

const STATUS_META: Record<(typeof STATUSES)[number], { label: string; color: string }> = {
  RECRUITING: { label: "Recruiting", color: "#0ca30c" },
  ACTIVE_NOT_RECRUITING: { label: "Active, not recruiting", color: "#fab219" },
  COMPLETED: { label: "Completed", color: "#2a78d6" },
  TERMINATED: { label: "Terminated", color: "#d03b3b" },
  NOT_YET_RECRUITING: { label: "Not yet recruiting", color: "#898781" },
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
const PHASE_COLOR = ["#b7d3f6", "#6da7ec", "#2a78d6", "#1c5cab", "#104281", "#898781"];

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
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Back
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            {decoded}
          </h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">Treatment landscape overview</p>
        </div>
        <Link
          href={`/match?condition=${encodeURIComponent(decoded)}`}
          className="shrink-0 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
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
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          All trials by status
        </h2>
        <div className="mt-3 flex h-6 w-full overflow-hidden rounded-[4px] bg-zinc-100 dark:bg-zinc-900">
          {STATUSES.map((status) => {
            const count = stats.byStatus[status];
            if (count === 0 || stats.total === 0) return null;
            const widthPct = (count / stats.total) * 100;
            return (
              <div
                key={status}
                style={{ width: `${widthPct}%`, backgroundColor: STATUS_META[status].color }}
                className="h-full border-r-2 border-white last:border-r-0 dark:border-black"
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
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
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Recruiting trials by phase
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
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
                  <span className="w-32 shrink-0 text-xs text-zinc-600 dark:text-zinc-400">
                    {PHASE_LABEL[phase]}
                  </span>
                  <div className="h-4 flex-1 rounded-r-[4px] bg-zinc-100 dark:bg-zinc-900">
                    <div
                      style={{ width: `${widthPct}%`, backgroundColor: color }}
                      className="h-full rounded-r-[4px]"
                    />
                  </div>
                  <span className="w-6 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
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
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Recently FDA-approved treatments
        </h2>
        <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
          Genuine new approvals from FDA&apos;s own novel drug approvals list, last two years —
          not a label-update proxy.
        </p>
        {novelApprovals.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No newly approved treatments found for this condition in the last two years.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {novelApprovals.map((approval) => (
              <li
                key={approval.drugName}
                className="rounded-2xl border border-black/[.08] p-4 dark:border-white/[.145]"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-black dark:text-zinc-50">
                    {approval.drugName}
                    {approval.activeIngredient && (
                      <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
                        ({approval.activeIngredient})
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    Approved {approval.approvalDate}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{approval.use}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* openFDA recent labels */}
      <section className="mt-10">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Recently updated FDA drug labels mentioning this condition
        </h2>
        {recentLabels.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No matching FDA labels found.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {recentLabels.map((label, i) => (
              <li
                key={`${label.brandName}-${i}`}
                className="rounded-2xl border border-black/[.08] p-4 dark:border-white/[.145]"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-black dark:text-zinc-50">
                    {label.brandName}
                    {label.genericName && label.genericName !== label.brandName && (
                      <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
                        ({label.genericName})
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(label.effectiveTime)}
                  </span>
                </div>
                {label.manufacturer && (
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {label.manufacturer}
                  </p>
                )}
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  {label.indicationSnippet}…
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Raw recruiting trial list */}
      <section className="mt-10">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Recruiting trials
        </h2>
        <ul className="mt-3 flex flex-col gap-4">
          {recruitingTrials.map((trial) => (
            <li
              key={trial.nctId}
              className="rounded-2xl border border-black/[.08] p-5 dark:border-white/[.145]"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="rounded-full bg-black/[.06] px-2.5 py-0.5 text-xs font-medium dark:bg-white/[.08]">
                  {trial.status.replaceAll("_", " ")}
                </span>
                {trial.phases.length > 0 && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {trial.phases.join(", ")}
                  </span>
                )}
              </div>
              <h3 className="mt-2 font-medium text-black dark:text-zinc-50">{trial.title}</h3>
              <a
                href={trial.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-zinc-500 hover:underline dark:text-zinc-400"
              >
                {trial.nctId} on ClinicalTrials.gov ↗
              </a>
            </li>
          ))}
        </ul>

        {recruitingTrials.length === 0 && (
          <p className="mt-4 text-zinc-500 dark:text-zinc-400">
            No recruiting trials found for this condition.
          </p>
        )}
      </section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-black/[.08] p-4 dark:border-white/[.145]">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
