import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/Button";

export function RoofJsonImportPanel({
  visible,
  busy,
  onApply,
  status = "idle",
  message,
  completedJobId,
}: {
  visible: boolean;
  busy: boolean;
  onApply: (result: Record<string, unknown>) => Promise<string | null>;
  status?: "idle" | "queued" | "processing" | "failed";
  message?: string | null;
  completedJobId?: string | null;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submittedJobId = useRef<string | null>(null);
  useEffect(() => {
    if (completedJobId && completedJobId === submittedJobId.current) {
      setValue("");
      setError(null);
      submittedJobId.current = null;
    }
  }, [completedJobId]);
  if (!visible) return null;
  async function apply() {
    setError(null);
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      submittedJobId.current = await onApply(parsed as Record<string, unknown>);
    } catch {
      setError("Paste one valid roof-detection-v2 JSON object.");
    }
  }
  return (
    <details className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <summary className="cursor-pointer text-xs font-semibold text-slate-600">JSON test import</summary>
      <div className="mt-3 grid gap-2">
        <textarea
          className="min-h-36 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Paste roof-detection-v2 JSON returned for the downloaded crop"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">The JSON dimensions must match the exact downloaded crop.</p>
          <Button variant="secondary" disabled={busy || !value.trim()} onClick={() => void apply()}>
            {status === "queued" ? "Queued…" : status === "processing" ? "Applying…" : "Validate and apply"}
          </Button>
        </div>
        {error ? <p className="text-xs font-medium text-red-700">{error}</p> : null}
        {!error && message ? <p className={`text-xs font-medium ${status === "failed" ? "text-red-700" : "text-emerald-700"}`}>{message}</p> : null}
      </div>
    </details>
  );
}
