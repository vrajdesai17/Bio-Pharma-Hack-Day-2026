import Link from "next/link";
import { FAQ_ENTRIES, type FaqEntryKey } from "@/lib/faq";

export function HelpLink({ entry }: { entry: FaqEntryKey }) {
  const { id, question } = FAQ_ENTRIES[entry];
  return (
    <Link
      href={`/help#${id}`}
      title={question}
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-[10px] leading-none text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100 hover:text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:border-emerald-500 dark:hover:bg-emerald-900/60 dark:hover:text-emerald-100"
    >
      ?
    </Link>
  );
}
