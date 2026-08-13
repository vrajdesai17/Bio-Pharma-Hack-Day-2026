import Link from "next/link";
import { FAQ_ENTRIES, HOW_IT_WORKS_SECTION, FAQ_SECTION, RESOURCES } from "@/lib/faq";

export const metadata = {
  title: "Help & FAQ — Trial Compass",
};

function EntryList({ ids }: { ids: (keyof typeof FAQ_ENTRIES)[] }) {
  return (
    <dl className="flex flex-col gap-6">
      {ids.map((key) => {
        const entry = FAQ_ENTRIES[key];
        return (
          <div key={entry.id} id={entry.id} className="scroll-mt-20">
            <dt className="font-medium text-emerald-950 dark:text-emerald-50">{entry.question}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-emerald-950/70 dark:text-emerald-200/70">
              {entry.answer}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-12 px-6 py-16">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-emerald-800/70 hover:text-emerald-700 hover:underline dark:text-emerald-300/70 dark:hover:text-emerald-200">
          ← Back
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-emerald-950 dark:text-emerald-50">
          Help &amp; FAQ
        </h1>
        <p className="text-emerald-950/70 dark:text-emerald-200/70">
          What Trial Compass does, how it works under the hood, and where its data comes from.
        </p>
      </div>

      <section className="flex flex-col gap-6 rounded-2xl border border-emerald-100 bg-white/70 p-6 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <h2 className="text-xl font-semibold text-emerald-950 dark:text-emerald-50">
          How Trial Compass Works
        </h2>
        <EntryList ids={HOW_IT_WORKS_SECTION} />
      </section>

      <section className="flex flex-col gap-6 rounded-2xl border border-emerald-100 bg-white/70 p-6 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <h2 className="text-xl font-semibold text-emerald-950 dark:text-emerald-50">
          Frequently Asked Questions
        </h2>
        <EntryList ids={FAQ_SECTION} />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-emerald-100 bg-white/70 p-6 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <h2 className="text-xl font-semibold text-emerald-950 dark:text-emerald-50">Resources</h2>
        <ul className="flex flex-col gap-4">
          {RESOURCES.map((r) => (
            <li key={r.url}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-700 hover:underline dark:text-emerald-300"
              >
                {r.label} ↗
              </a>
              <p className="text-sm text-emerald-950/70 dark:text-emerald-200/70">{r.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-emerald-900/40 dark:text-emerald-300/40">
        Trial Compass is an informational tool, not medical advice. It does not decide eligibility
        — only a trial&apos;s own study team can do that.
      </p>
    </div>
  );
}
