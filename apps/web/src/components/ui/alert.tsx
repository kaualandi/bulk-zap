import { cn } from "@/lib/cn";

type Tone = "info" | "warning" | "danger" | "success";

const toneClasses: Record<Tone, string> = {
  info: "bg-blue-50 border-blue-200 text-blue-900",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-900",
  danger: "bg-red-50 border-red-200 text-red-900",
  success: "bg-green-50 border-green-200 text-green-900",
};

const toneIcon: Record<Tone, string> = {
  info: "ℹ",
  warning: "⚠",
  danger: "✕",
  success: "✓",
};

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 flex gap-3 items-start",
        toneClasses[tone]
      )}
    >
      <span className="font-bold leading-none mt-0.5">{toneIcon[tone]}</span>
      <div className="text-sm flex-1">
        {title && <div className="font-semibold mb-1">{title}</div>}
        {children}
      </div>
    </div>
  );
}
