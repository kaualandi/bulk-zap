import { cn } from "@/lib/cn";
import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";

export function Table({
  className,
  ...rest
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
      <table className={cn("w-full text-sm", className)} {...rest} />
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
      {children}
    </thead>
  );
}

export function Th({
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("text-left font-medium px-4 py-3", className)}
      {...rest}
    />
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-zinc-100">{children}</tbody>;
}

export function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="hover:bg-zinc-50/60 transition-colors">{children}</tr>;
}

export function Td({
  className,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 text-zinc-700", className)} {...rest} />;
}

export function EmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-12 text-center text-sm text-zinc-500"
      >
        {children}
      </td>
    </tr>
  );
}
