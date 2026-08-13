"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const EXAMPLES = ["Pancreatic cancer", "ALS", "Cystic fibrosis", "Multiple sclerosis"];

export default function Home() {
  const router = useRouter();
  const [condition, setCondition] = useState("");

  function goToLandscape(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/landscape/${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <main className="flex w-full max-w-xl flex-col items-center gap-8 px-6 py-24 text-center">
        <div className="flex flex-col gap-3">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl dark:bg-emerald-900/40">
            🧭
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-emerald-950 dark:text-emerald-50">
            Trial Compass
          </h1>
          <p className="text-lg text-emerald-900/60 dark:text-emerald-200/70">
            See every active trial and recently approved treatment for a condition, in plain
            language.
          </p>
        </div>

        <form
          className="flex w-full flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            goToLandscape(condition);
          }}
        >
          <input
            type="text"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            placeholder="Enter a condition (e.g. pancreatic cancer)"
            className="flex-1 rounded-full border border-emerald-200 bg-white px-5 py-3 text-base text-emerald-950 shadow-sm outline-none placeholder:text-emerald-900/35 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-50 dark:placeholder:text-emerald-100/30 dark:focus:ring-emerald-900/50"
          />
          <button
            type="submit"
            className="rounded-full bg-emerald-500 px-6 py-3 font-medium text-white shadow-sm transition-colors hover:bg-emerald-600 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
          >
            Explore
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-emerald-900/60 dark:text-emerald-200/60">
          <span>Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => goToLandscape(example)}
              className="rounded-full border border-emerald-200 bg-white/60 px-3 py-1 text-emerald-900/80 transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-100/80 dark:hover:bg-emerald-900/40"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/tracked"
            className="text-sm text-emerald-800/70 hover:text-emerald-700 hover:underline dark:text-emerald-300/70 dark:hover:text-emerald-200"
          >
            View tracked trials →
          </Link>
          <Link
            href="/help"
            className="text-sm text-emerald-800/70 hover:text-emerald-700 hover:underline dark:text-emerald-300/70 dark:hover:text-emerald-200"
          >
            Help &amp; FAQ
          </Link>
        </div>
      </main>
    </div>
  );
}
