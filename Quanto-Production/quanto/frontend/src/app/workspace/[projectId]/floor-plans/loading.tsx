export default function FloorPlansLoading() {
  return (
    <div className="space-y-5 p-5 sm:p-7" aria-label="Loading floor plans">
      <div className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
    </div>
  );
}
