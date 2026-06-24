import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const inputBase =
  "w-full h-10 px-3 text-sm bg-white border border-zinc-300 rounded-md text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-400";

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputBase, "pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(inputBase, "h-auto min-h-24 py-2 resize-y", className)}
      {...rest}
    />
  );
}

type FieldProps = {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
};

export function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-zinc-800">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
