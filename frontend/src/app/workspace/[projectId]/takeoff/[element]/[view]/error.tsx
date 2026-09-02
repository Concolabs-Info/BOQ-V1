"use client";

import { useEffect } from "react";

export default function TakeoffRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Takeoff workspace render failed", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-xl" aria-hidden="true">↻</div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Takeoff workspace needs to reload</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Your detected data and saved edits are safe. Reload the workspace to reconnect to the current project state.</p>
        <div className="mt-5 flex justify-center gap-3">
          <button type="button" onClick={reset} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Try again</button>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reload workspace</button>
        </div>
      </section>
    </main>
  );
}
