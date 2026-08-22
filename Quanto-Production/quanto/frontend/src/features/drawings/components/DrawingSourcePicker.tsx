"use client";

import type { FloorPlanDocument } from "@/features/floor-plans/types";

export function DrawingSourcePicker({
  documents,
  documentId,
  uploading,
  uploadProgress,
  processing,
  onSelect,
  onUpload,
}: {
  documents: FloorPlanDocument[];
  documentId: string;
  uploading: boolean;
  uploadProgress: number;
  processing: boolean;
  onSelect: (documentId: string) => void;
  onUpload: (file: File) => void;
}) {
  return (
    <section>
      <label className="text-sm font-semibold text-slate-700">Source file</label>
      <select
        value={documentId}
        onChange={(event) => onSelect(event.target.value)}
        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
      >
        <option value="">Select an existing project file</option>
        {documents.map((document) => (
          <option key={document.id} value={document.id}>{document.file_name}</option>
        ))}
      </select>
      <div className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" />
      </div>
      <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700 hover:bg-blue-100">
        {uploading ? `Uploading ${uploadProgress}%` : processing ? "Preparing pages…" : "Upload new PDF or image"}
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
          className="hidden"
          disabled={uploading || processing}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.target.value = "";
          }}
        />
      </label>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        The uploaded file is kept as this drawing&apos;s independent source. Your architectural floor-plan crop is not changed.
      </p>
    </section>
  );
}
