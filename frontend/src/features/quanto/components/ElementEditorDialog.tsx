"use client";

import { useEffect, useMemo, useState } from "react";

export type ElementFormValue = string | number;
export type ElementFormValues = Record<string, ElementFormValue>;

export type ElementFormField = {
  key: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  min?: number;
  step?: number | "any";
  help?: string;
  section?: "General" | "Location" | "Properties";
};

export function ElementEditorDialog({
  open,
  title,
  description,
  fields,
  initialValues,
  submitLabel = "Add element",
  validate,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  fields: ElementFormField[];
  initialValues: ElementFormValues;
  submitLabel?: string;
  validate?: (values: ElementFormValues) => Record<string, string>;
  onClose: () => void;
  onSubmit: (values: ElementFormValues) => void;
}) {
  const [values, setValues] = useState<ElementFormValues>(initialValues);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setSubmitted(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const errors = useMemo(() => {
    const next: Record<string, string> = {};
    for (const field of fields) {
      const value = values[field.key];
      if (field.required && String(value ?? "").trim() === "")
        next[field.key] = `${field.label} is required`;
      if (
        field.type === "number" &&
        field.min !== undefined &&
        Number(value) < field.min
      )
        next[field.key] = `${field.label} must be at least ${field.min}`;
    }
    return { ...next, ...(validate?.(values) || {}) };
  }, [fields, values, validate]);

  if (!open) return null;
  const sections = (["General", "Location", "Properties"] as const).filter(
    (section) =>
      fields.some((field) => (field.section || "General") === section),
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    onSubmit(values);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="element-dialog-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
              Element data
            </p>
            <h2
              id="element-dialog-title"
              className="mt-1 text-xl font-semibold text-slate-950"
            >
              {title}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-lg text-slate-500 hover:bg-slate-50"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {sections.map((section) => (
            <section key={section}>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {section}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {fields
                  .filter((field) => (field.section || "General") === section)
                  .map((field) => {
                    const error = submitted ? errors[field.key] : "";
                    return (
                      <label
                        key={field.key}
                        className="block text-xs font-semibold text-slate-600"
                      >
                        <span>
                          {field.label}
                          {field.required ? (
                            <span className="text-red-500"> *</span>
                          ) : null}
                        </span>
                        {field.type === "select" ? (
                          <select
                            className={`input mt-1 w-full ${error ? "border-red-300 bg-red-50" : ""}`}
                            value={String(values[field.key] ?? "")}
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                          >
                            {(field.options || []).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type === "number" ? "number" : "text"}
                            min={field.min}
                            step={field.step}
                            className={`input mt-1 w-full ${error ? "border-red-300 bg-red-50" : ""}`}
                            value={values[field.key] ?? ""}
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [field.key]:
                                  field.type === "number"
                                    ? Number(event.target.value)
                                    : event.target.value,
                              }))
                            }
                          />
                        )}
                        {error ? (
                          <span className="mt-1 block font-medium text-red-600">
                            {error}
                          </span>
                        ) : field.help ? (
                          <span className="mt-1 block font-normal leading-4 text-slate-400">
                            {field.help}
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
              </div>
            </section>
          ))}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
            The saved element uses a stable ID. Its geometry and properties will
            feed Dimension, Workbook, 3D, Review and BOQ when those views read
            the same project data.
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="h-10 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
