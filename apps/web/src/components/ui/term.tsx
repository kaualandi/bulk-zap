import { glossary, type GlossaryEntry } from "@/lib/glossary";
import { cn } from "@/lib/cn";

type Props = {
  /** Key in the glossary (e.g. "jitter", "warmup"). */
  k: keyof typeof glossary;
  /** Optional override for the rendered text. Defaults to the entry title. */
  children?: React.ReactNode;
  className?: string;
};

export function Term({ k, children, className }: Props) {
  const entry: GlossaryEntry = glossary[k];
  if (!entry) return <>{children}</>;

  return (
    <span className={cn("relative inline-block group", className)}>
      <button
        type="button"
        tabIndex={0}
        className="inline-flex items-baseline gap-0.5 underline decoration-dotted decoration-zinc-400 underline-offset-2 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 rounded"
      >
        {children ?? entry.title}
        <span className="text-zinc-400 text-[10px] leading-none translate-y-[-2px] select-none">
          ⓘ
        </span>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full mt-1 z-50 hidden group-hover:block group-focus-within:block w-72 bg-zinc-900 text-white text-xs leading-relaxed rounded-lg shadow-lg p-3 normal-case font-normal"
      >
        <strong className="block text-[11px] uppercase tracking-wide text-zinc-300 mb-1">
          {entry.title}
        </strong>
        {entry.description}
      </span>
    </span>
  );
}
