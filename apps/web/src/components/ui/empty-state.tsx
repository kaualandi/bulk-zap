export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-dashed border-zinc-300 rounded-xl p-10 text-center">
      <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
      {description && (
        <p className="text-sm text-zinc-500 mt-1 max-w-md mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
