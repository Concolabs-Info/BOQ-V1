type ViewportCardLabelProps = {
  viewportName: string;
  sheetTitle?: string | null;
  sheetNumber?: string | null;
  category?: string | null;
  revision?: string | null;
};

export function ViewportCardLabel({
  viewportName,
  sheetTitle,
  sheetNumber,
  category,
  revision,
}: ViewportCardLabelProps) {
  const name = viewportName.trim();
  const title = sheetTitle?.trim() || name || "Unnamed drawing";
  const reference = sheetNumber?.trim();
  const metadata = [
    category?.trim(),
    revision?.trim() ? `Rev ${revision.trim()}` : "Current",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span className="min-w-0 flex-1">
      <span
        className="block line-clamp-2 text-[11px] font-bold leading-4 text-slate-800"
        title={title}
      >
        {title}
      </span>
      {reference && reference !== title ? (
        <span className="mt-0.5 block truncate text-[9px] font-medium text-slate-500">
          {reference}
        </span>
      ) : null}
      <span className="mt-1 block text-[8px] uppercase tracking-wide text-slate-400">
        {metadata}
      </span>
    </span>
  );
}
