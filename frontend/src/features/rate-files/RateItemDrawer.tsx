"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/Button";
import { ModalDialog } from "@/shared/components/ModalDialog";
import { BoqDrawer } from "@/features/boq/components/BoqDrawer";
import type { RateItem, RateItemInput, RateOptions } from "./types";
import { DEFAULT_SPECIFICATIONS, DEFAULT_UNIT_TYPES, UNIT_TYPE_LABELS } from "./types";

const ADD_SPECIFICATION_VALUE = "__add_specification__";
const ADD_UNIT_TYPE_VALUE = "__add_unit_type__";

const defaultForm: RateItemInput = {
  material_name: "",
  specification: null,
  size: null,
  unit_cost: 0,
  markup_percent: 0,
  unit_type: "m2",
  custom_unit: null,
};

export function RateItemDrawer({
  open,
  item,
  saving,
  error,
  options,
  onClose,
  onAddOption,
  onSave,
}: {
  open: boolean;
  item: RateItem | null;
  saving: boolean;
  error: string | null;
  options: RateOptions | null;
  onClose: () => void;
  onAddOption: (optionType: "unit_type" | "specification", value: string) => Promise<void>;
  onSave: (payload: RateItemInput) => Promise<void>;
}) {
  const [form, setForm] = useState<RateItemInput>(defaultForm);
  const [localError, setLocalError] = useState<string | null>(null);
  const [optionModalType, setOptionModalType] = useState<"unit_type" | "specification" | null>(null);
  const [optionValue, setOptionValue] = useState("");
  const [optionError, setOptionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setOptionModalType(null);
    setOptionValue("");
    setOptionError(null);
    setForm(item ? {
      material_name: item.material_name,
      specification: item.specification,
      size: item.size,
      unit_cost: item.unit_cost,
      markup_percent: item.markup_percent,
      unit_type: item.unit_type,
      custom_unit: item.custom_unit,
    } : defaultForm);
  }, [item, open]);

  const unitOptions = options?.unit_type?.length ? options.unit_type : [...DEFAULT_UNIT_TYPES];
  const specificationOptions = options?.specification?.length ? options.specification : [...DEFAULT_SPECIFICATIONS];

  function openOptionModal(optionType: "unit_type" | "specification") {
    setOptionModalType(optionType);
    setOptionValue("");
    setOptionError(null);
  }

  async function saveOption() {
    if (!optionModalType) return;
    const trimmed = optionValue.trim();
    if (!trimmed) {
      setOptionError(optionModalType === "unit_type" ? "Unit type is required." : "Specification is required.");
      return;
    }
    try {
      setOptionError(null);
      await onAddOption(optionModalType, trimmed);
      setForm((current) => optionModalType === "unit_type" ? { ...current, unit_type: trimmed, custom_unit: null } : { ...current, specification: trimmed });
      setOptionModalType(null);
      setOptionValue("");
    } catch (caught) {
      setOptionError(caught instanceof Error ? caught.message : "This value could not be saved.");
    }
  }

  function closeOptionModal() {
    setOptionModalType(null);
    setOptionValue("");
    setOptionError(null);
  }

  async function submit() {
    const materialName = form.material_name.trim();
    if (!materialName) {
      setLocalError("Material name is required.");
      return;
    }
    if (form.unit_cost < 0 || form.markup_percent < 0) {
      setLocalError("Unit cost and markup must be zero or greater.");
      return;
    }
    const unitType = form.unit_type.trim();
    if (!unitType) {
      setLocalError("Unit type is required.");
      return;
    }
    const specification = (form.specification || "").trim() || null;
    const size = (form.size || "").trim() || null;
    setLocalError(null);
    await onSave({ ...form, material_name: materialName, specification, size, unit_type: unitType, custom_unit: null });
  }

  return (
    <BoqDrawer open={open} title={item ? "Edit material rate" : "Add material rate"} subtitle="Material-only project rate item." onClose={onClose}>
      <div className="space-y-5 p-6">
        {localError || error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{localError || error}</p> : null}
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Material name</span>
          <input className="input mt-1" placeholder="RCC concrete" value={form.material_name} onChange={(event) => setForm((current) => ({ ...current, material_name: event.target.value }))} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Specification</span>
          <select
            className="input mt-1"
            value={form.specification || ""}
            onChange={(event) => {
              if (event.target.value === ADD_SPECIFICATION_VALUE) {
                openOptionModal("specification");
                return;
              }
              setForm((current) => ({ ...current, specification: event.target.value || null }));
            }}
          >
            <option value="">No specification</option>
            {specificationOptions.map((value) => <option key={value} value={value}>{value}</option>)}
            <option value={ADD_SPECIFICATION_VALUE}>+ Add another specification</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Size(mm)</span>
          <input className="input mt-1" placeholder="610*305" value={form.size || ""} onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Unit cost</span>
            <input className="input mt-1" type="number" min="0" step="0.01" value={form.unit_cost} onChange={(event) => setForm((current) => ({ ...current, unit_cost: Number(event.target.value) }))} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Markup %</span>
            <input className="input mt-1" type="number" min="0" step="0.01" value={form.markup_percent} onChange={(event) => setForm((current) => ({ ...current, markup_percent: Number(event.target.value) }))} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Unit type</span>
          <select
            className="input mt-1"
            value={form.unit_type}
            onChange={(event) => {
              if (event.target.value === ADD_UNIT_TYPE_VALUE) {
                openOptionModal("unit_type");
                return;
              }
              setForm((current) => ({ ...current, unit_type: event.target.value, custom_unit: null }));
            }}
          >
            {unitOptions.map((unit) => <option key={unit} value={unit}>{UNIT_TYPE_LABELS[unit] || unit}</option>)}
            <option value={ADD_UNIT_TYPE_VALUE}>+ Add another unit type</option>
          </select>
        </label>
      </div>
      <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={saving} onClick={() => void submit()}>{saving ? "Saving..." : "Save"}</Button>
      </footer>
      <ModalDialog
        open={Boolean(optionModalType)}
        title={optionModalType === "unit_type" ? "Add unit type" : "Add specification"}
        description={optionModalType === "unit_type" ? "Create a project unit that will appear in this dropdown." : "Create a project specification that will appear in this dropdown."}
        ariaLabel={optionModalType === "unit_type" ? "Add unit type" : "Add specification"}
        onClose={closeOptionModal}
        footer={(
          <>
            <Button variant="secondary" disabled={saving} onClick={closeOptionModal}>Cancel</Button>
            <Button disabled={saving || !optionValue.trim()} onClick={() => void saveOption()}>{saving ? "Saving..." : "Save value"}</Button>
          </>
        )}
      >
        {optionError ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optionError}</p> : null}
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{optionModalType === "unit_type" ? "Unit type" : "Specification"}</span>
          <input
            className="input mt-2 w-full"
            autoFocus
            placeholder={optionModalType === "unit_type" ? "box" : "Grade C30/37"}
            value={optionValue}
            onChange={(event) => setOptionValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void saveOption();
            }}
          />
        </label>
      </ModalDialog>
    </BoqDrawer>
  );
}
