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
            <dt className="font-medium text-black dark:text-zinc-50">{entry.question}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
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
        <Link href="/" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          ← Back
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Help &amp; FAQ
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          What Trial Compass does, how it works under the hood, and where its data comes from.
        </p>
      </div>

      <section className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          How Trial Compass Works
        </h2>
        <EntryList ids={HOW_IT_WORKS_SECTION} />
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          Frequently Asked Questions
        </h2>
        <EntryList ids={FAQ_SECTION} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">Resources</h2>
        <ul className="flex flex-col gap-4">
          {RESOURCES.map((r) => (
            <li key={r.url}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-black hover:underline dark:text-zinc-50"
              >
                {r.label} ↗
              </a>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{r.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        Trial Compass is an informational tool, not medical advice. It does not decide eligibility
        — only a trial&apos;s own study team can do that.
      </p>
    </div>
  );
}
