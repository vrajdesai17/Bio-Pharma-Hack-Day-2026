import Link from "next/link";
import { FAQ_ENTRIES, type FaqEntryKey } from "@/lib/faq";

export function HelpLink({ entry }: { entry: FaqEntryKey }) {
  const { id, question } = FAQ_ENTRIES[entry];
  return (
    <Link
      href={`/help#${id}`}
      title={question}
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-black/[.15] text-[10px] leading-none text-zinc-500 hover:border-black/30 hover:text-zinc-800 dark:border-white/[.2] dark:text-zinc-400 dark:hover:border-white/40 dark:hover:text-zinc-200"
    >
      ?
    </Link>
  );
}
