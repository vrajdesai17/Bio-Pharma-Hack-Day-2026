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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-8 px-6 py-24 text-center">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Trial Compass
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
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
            className="flex-1 rounded-full border border-black/[.08] bg-white px-5 py-3 text-base outline-none focus:border-black/30 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            className="rounded-full bg-foreground px-6 py-3 font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Explore
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <span>Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => goToLandscape(example)}
              className="rounded-full border border-black/[.08] px-3 py-1 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.08]"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Link href="/tracked" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            View tracked trials →
          </Link>
          <Link href="/help" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            Help &amp; FAQ
          </Link>
        </div>
      </main>
    </div>
  );
}
