export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-8 pb-6 border-b border-zinc-200">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-zinc-500 mt-1 max-w-2xl">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
