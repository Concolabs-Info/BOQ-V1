"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/shared/components/Button";
import { ModalDialog } from "@/shared/components/ModalDialog";
import { BoqDrawer } from "@/features/boq/components/BoqDrawer";
import { createMaterialAttribute, createMaterialAttributeValue } from "./api";
import { rateFileKeys, useMaterialAttributes } from "./hooks";
import type { RateItem, RateItemInput, RateItemType, RateOptionType, RateOptions } from "./types";
import { DEFAULT_UNIT_TYPES_BY_ITEM_TYPE, RATE_ITEM_TYPE_LABELS, RATE_OPTION_LABELS, UNIT_TYPE_LABELS } from "./types";

const UNIT_OPTION_TYPE_BY_ITEM_TYPE: Record<RateItemType, RateOptionType> = {
  material: "material_unit_type",
  labour: "labour_unit_type",
  machinery: "machinery_unit_type",
};

const DEFAULT_UNIT_TYPE_BY_ITEM_TYPE: Record<RateItemType, string> = {
  material: "m2",
  labour: "hour",
  machinery: "hour",
};

function defaultUnitType(itemType: RateItemType) {
  return DEFAULT_UNIT_TYPE_BY_ITEM_TYPE[itemType] || DEFAULT_UNIT_TYPES_BY_ITEM_TYPE[itemType][0] || "";
}

const defaultForm = (itemType: RateItemType): RateItemInput => ({
  item_type: itemType,
  main_item: "",
  material_name: null,
  supplier: null,
  brand: null,
  material_attributes: [],
  labour_name: null,
  labour_group: null,
  machinery_name: null,
  machinery_source: null,
  unit_type: defaultUnitType(itemType),
  unit_detail: defaultUnitDetail(itemType, defaultUnitType(itemType)),
  rate: 0,
});

function trimValue(value: string | null | undefined) {
  return String(value || "").trim() || null;
}

function defaultUnitDetail(_itemType: RateItemType, unitType: string | null | undefined) {
  const unit = trimValue(unitType);
  return unit ? `1 ${UNIT_TYPE_LABELS[unit] || unit}` : null;
}

function unitDetailPlaceholder(itemType: RateItemType, unitType: string | null | undefined) {
  const unit = trimValue(unitType);
  if (itemType === "material") {
    if (unit === "bag") return "50kg bag";
    if (unit === "kg") return "1 kg";
    if (unit === "ton") return "1 ton";
    return unit ? `1 ${UNIT_TYPE_LABELS[unit] || unit}` : "1 m3, 1 bag, 50kg bag";
  }
  if (itemType === "labour") {
    if (unit === "minute") return "30 minutes";
    if (unit === "day") return "8-hour day";
    return unit ? `1 ${UNIT_TYPE_LABELS[unit] || unit}` : "1 hour, 30 minutes, 8-hour day";
  }
  if (unit === "trip") return "1 trip";
  if (unit === "shift") return "1 shift";
  return unit ? `1 ${UNIT_TYPE_LABELS[unit] || unit}` : "1 hour, 1 day, 1 trip";
}

function unitTypePlaceholder(itemType: RateItemType) {
  if (itemType === "material") return "m3";
  if (itemType === "labour") return "hour";
  return "shift";
}

function deleteTargetLabel(target: DeleteTarget | null) {
  if (!target) return "dropdown value";
  return target.value || "dropdown value";
}

type DropdownOption = {
  value: string;
  label?: string;
  deleteLabel?: string;
};

function DeletableDropdown({
  label,
  value,
  options,
  emptyLabel,
  addLabel,
  disabled = false,
  onChange,
  onAdd,
  onDelete,
}: {
  label?: string;
  value: string;
  options: DropdownOption[];
  emptyLabel: string;
  addLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onAdd: () => void;
  onDelete: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {label ? <span className="text-sm font-semibold text-slate-700">{label}</span> : null}
      <button
        type="button"
        className="input mt-1 flex w-full items-center justify-between gap-2 bg-white text-left disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected || value ? "truncate text-slate-900" : "truncate text-slate-400"}>{selected?.label || value || emptyLabel}</span>
        <span className="shrink-0 text-xs text-slate-500">{open ? "^" : "v"}</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            {emptyLabel}
          </button>
          {options.map((option) => (
            <div
              key={option.value}
              role="option"
              tabIndex={0}
              aria-selected={option.value === value}
              className={option.value === value ? "flex w-full cursor-pointer items-center gap-2 bg-blue-50 px-3 py-2 text-left text-sm font-semibold text-blue-700" : "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onChange(option.value);
                  setOpen(false);
                }
              }}
            >
              <span className="min-w-0 flex-1 truncate">{option.label || option.value}</span>
              <button
                type="button"
                title={option.deleteLabel || `Delete ${option.label || option.value}`}
                aria-label={option.deleteLabel || `Delete ${option.label || option.value}`}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm font-bold text-red-500 hover:bg-red-50 hover:text-red-700"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onDelete(option.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                    onDelete(option.value);
                  }
                }}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M6 6l1 15h10l1-15" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </div>
          ))}
          <button
            type="button"
            className="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50"
            onClick={() => {
              setOpen(false);
              onAdd();
            }}
          >
            {addLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

type DeleteTarget =
  | { kind: "option"; optionType: RateOptionType; field: keyof RateItemInput; value: string }
  | { kind: "attribute"; rowIndex: number; attributeId: string; value: string }
  | { kind: "attribute_value"; rowIndex: number; attributeId: string; valueId: string; value: string };

export function RateItemDrawer({
  open,
  item,
  itemType,
  saving,
  error,
  options,
  projectId,
  onClose,
  onAddOption,
  onDeleteOption,
  onDeleteMaterialAttribute,
  onDeleteMaterialAttributeValue,
  onSave,
}: {
  open: boolean;
  item: RateItem | null;
  itemType: RateItemType;
  saving: boolean;
  error: string | null;
  options: RateOptions | null;
  projectId: string;
  onClose: () => void;
  onAddOption: (optionType: RateOptionType, value: string) => Promise<void>;
  onDeleteOption: (optionType: RateOptionType, value: string) => Promise<void>;
  onDeleteMaterialAttribute: (attributeId: string, materialName: string) => Promise<void>;
  onDeleteMaterialAttributeValue: (attributeId: string, valueId: string, materialName: string) => Promise<void>;
  onSave: (payload: RateItemInput) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const effectiveType = item?.item_type || itemType;
  const [form, setForm] = useState<RateItemInput>(defaultForm(effectiveType));
  const [localError, setLocalError] = useState<string | null>(null);
  const [optionModalType, setOptionModalType] = useState<RateOptionType | null>(null);
  const [optionValue, setOptionValue] = useState("");
  const [optionError, setOptionError] = useState<string | null>(null);
  const [attributeModal, setAttributeModal] = useState<"attribute" | "value" | null>(null);
  const [attributeModalRow, setAttributeModalRow] = useState<number | null>(null);
  const [attributeValue, setAttributeValue] = useState("");
  const [attributeError, setAttributeError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const materialName = trimValue(form.material_name);
  const unitOptionType = UNIT_OPTION_TYPE_BY_ITEM_TYPE[form.item_type];
  const materialAttributesQuery = useMaterialAttributes(projectId, materialName);
  const materialAttributes = materialAttributesQuery.data || [];

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setOptionModalType(null);
    setOptionValue("");
    setOptionError(null);
    setAttributeModal(null);
    setAttributeModalRow(null);
    setAttributeValue("");
    setAttributeError(null);
    setDeleteTarget(null);
    setDeleteError(null);
    setForm(item ? {
      item_type: item.item_type,
      main_item: item.main_item,
      material_name: item.material_name,
      supplier: item.supplier,
      brand: item.brand,
      material_attributes: item.material_attributes || [],
      labour_name: item.labour_name,
      labour_group: item.labour_group,
      machinery_name: item.machinery_name,
      machinery_source: item.machinery_source,
      unit_type: item.unit_type,
      unit_detail: item.unit_detail,
      rate: item.rate,
    } : defaultForm(itemType));
  }, [item, itemType, open]);

  const optionValues = useMemo(() => ({
    main_item: options?.main_item || [],
    material_name: options?.material_name || [],
    supplier: options?.supplier || [],
    brand: options?.brand || [],
    labour_name: options?.labour_name || [],
    labour_group: options?.labour_group || [],
    machinery_name: options?.machinery_name || [],
    machinery_source: options?.machinery_source || [],
    material_unit_type: options?.material_unit_type?.length ? options.material_unit_type : [...DEFAULT_UNIT_TYPES_BY_ITEM_TYPE.material],
    labour_unit_type: options?.labour_unit_type?.length ? options.labour_unit_type : [...DEFAULT_UNIT_TYPES_BY_ITEM_TYPE.labour],
    machinery_unit_type: options?.machinery_unit_type?.length ? options.machinery_unit_type : [...DEFAULT_UNIT_TYPES_BY_ITEM_TYPE.machinery],
  }), [options]);

  function openOptionModal(optionType: RateOptionType) {
    setOptionModalType(optionType);
    setOptionValue("");
    setOptionError(null);
  }

  function updateField(field: keyof RateItemInput, value: string | number | null) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setUnitType(value: string | null) {
    setForm((current) => ({ ...current, unit_type: value || "", unit_detail: defaultUnitDetail(current.item_type, value) }));
  }

  function setMaterialName(value: string | null) {
    setForm((current) => ({ ...current, material_name: value, material_attributes: [] }));
  }

  function updateMaterialAttribute(index: number, patch: { attribute?: string; value?: string }) {
    setForm((current) => ({
      ...current,
      material_attributes: current.material_attributes.map((row, rowIndex) => rowIndex === index ? {
        attribute: patch.attribute ?? row.attribute,
        value: Object.prototype.hasOwnProperty.call(patch, "attribute") && patch.attribute !== row.attribute ? "" : patch.value ?? row.value,
      } : row),
    }));
  }

  function addMaterialAttributeRow() {
    setForm((current) => ({ ...current, material_attributes: [...current.material_attributes, { attribute: "", value: "" }] }));
  }

  function removeMaterialAttributeRow(index: number) {
    setForm((current) => ({ ...current, material_attributes: current.material_attributes.filter((_, rowIndex) => rowIndex !== index) }));
  }

  function selectedAttribute(index: number) {
    const name = form.material_attributes[index]?.attribute;
    return materialAttributes.find((attribute) => attribute.name === name) || null;
  }

  async function saveOption() {
    if (!optionModalType) return;
    const trimmed = optionValue.trim();
    if (!trimmed) {
      setOptionError(`${RATE_OPTION_LABELS[optionModalType]} is required.`);
      return;
    }
    try {
      setOptionError(null);
      await onAddOption(optionModalType, trimmed);
      if (optionModalType === "material_name") setMaterialName(trimmed);
      else if (Object.values(UNIT_OPTION_TYPE_BY_ITEM_TYPE).includes(optionModalType)) setUnitType(trimmed);
      else updateField(optionModalType as keyof RateItemInput, trimmed);
      setOptionModalType(null);
      setOptionValue("");
    } catch (caught) {
      setOptionError(caught instanceof Error ? caught.message : "This value could not be saved.");
    }
  }

  async function saveMaterialAttributeCatalogValue() {
    const trimmed = attributeValue.trim();
    if (!trimmed) {
      setAttributeError(attributeModal === "attribute" ? "Attribute name is required." : "Attribute value is required.");
      return;
    }
    if (attributeModalRow == null) return;
    if (!materialName) {
      setAttributeError("Select a material name first.");
      return;
    }
    try {
      setAttributeError(null);
      if (attributeModal === "attribute") {
        const created = await createMaterialAttribute(projectId, materialName, trimmed);
        await queryClient.invalidateQueries({ queryKey: rateFileKeys.materialAttributes(projectId, materialName) });
        updateMaterialAttribute(attributeModalRow, { attribute: created.name, value: "" });
      } else if (attributeModal === "value") {
        const attribute = selectedAttribute(attributeModalRow);
        if (!attribute) {
          setAttributeError("Select an attribute first.");
          return;
        }
        const created = await createMaterialAttributeValue(projectId, attribute.id, trimmed);
        await queryClient.invalidateQueries({ queryKey: rateFileKeys.materialAttributes(projectId, materialName) });
        updateMaterialAttribute(attributeModalRow, { value: created.value });
      }
      closeAttributeModal();
    } catch (caught) {
      setAttributeError(caught instanceof Error ? caught.message : "This material attribute could not be saved.");
    }
  }

  function closeOptionModal() {
    setOptionModalType(null);
    setOptionValue("");
    setOptionError(null);
  }

  function closeAttributeModal() {
    setAttributeModal(null);
    setAttributeModalRow(null);
    setAttributeValue("");
    setAttributeError(null);
  }

  async function confirmDeleteDropdownValue() {
    if (!deleteTarget) return;
    try {
      setDeleteError(null);
      if (deleteTarget.kind === "option") {
        await onDeleteOption(deleteTarget.optionType, deleteTarget.value);
        setForm((current) => {
          if (String(current[deleteTarget.field] || "") !== deleteTarget.value) return current;
          if (deleteTarget.field === "material_name") return { ...current, material_name: null, material_attributes: [] };
          if (deleteTarget.field === "unit_type") return { ...current, unit_type: "", unit_detail: null };
          return { ...current, [deleteTarget.field]: null };
        });
      } else if (deleteTarget.kind === "attribute") {
        if (!materialName) throw new Error("Select a material name first.");
        await onDeleteMaterialAttribute(deleteTarget.attributeId, materialName);
        setForm((current) => ({
          ...current,
          material_attributes: current.material_attributes.map((row) => row.attribute === deleteTarget.value ? { attribute: "", value: "" } : row),
        }));
      } else {
        if (!materialName) throw new Error("Select a material name first.");
        await onDeleteMaterialAttributeValue(deleteTarget.attributeId, deleteTarget.valueId, materialName);
        setForm((current) => ({
          ...current,
          material_attributes: current.material_attributes.map((row, rowIndex) => rowIndex === deleteTarget.rowIndex && row.value === deleteTarget.value ? { ...row, value: "" } : row),
        }));
      }
      setDeleteTarget(null);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "This value could not be deleted.");
    }
  }

  async function submit() {
    const mainItem = trimValue(form.main_item);
    const unitType = trimValue(form.unit_type);
    if (!mainItem) {
      setLocalError("Main item is required.");
      return;
    }
    if (!unitType) {
      setLocalError("Unit type is required.");
      return;
    }
    if (form.rate < 0) {
      setLocalError("Rate must be zero or greater.");
      return;
    }
    if (form.item_type === "material" && !trimValue(form.material_name)) {
      setLocalError("Material name is required.");
      return;
    }
    if (form.item_type === "labour" && !trimValue(form.labour_name)) {
      setLocalError("Labour name is required.");
      return;
    }
    if (form.item_type === "machinery" && !trimValue(form.machinery_name)) {
      setLocalError("Machinery name is required.");
      return;
    }
    setLocalError(null);
    await onSave({
      ...form,
      main_item: mainItem,
      material_name: trimValue(form.material_name),
      supplier: trimValue(form.supplier),
      brand: trimValue(form.brand),
      material_attributes: form.item_type === "material" ? form.material_attributes
        .map((attribute) => ({ attribute: String(attribute.attribute || "").trim(), value: String(attribute.value || "").trim() }))
        .filter((attribute) => attribute.attribute && attribute.value) : [],
      labour_name: trimValue(form.labour_name),
      labour_group: trimValue(form.labour_group),
      machinery_name: trimValue(form.machinery_name),
      machinery_source: trimValue(form.machinery_source),
      unit_type: unitType,
      unit_detail: trimValue(form.unit_detail),
      rate: Number(form.rate),
    });
  }

  function SelectField({ label, field, optionType }: { label: string; field: keyof RateItemInput; optionType: RateOptionType }) {
    return (
      <DeletableDropdown
        label={label}
        value={String(form[field] || "")}
        emptyLabel={`No ${RATE_OPTION_LABELS[optionType]}`}
        addLabel={`+ Add another ${RATE_OPTION_LABELS[optionType]}`}
        options={optionValues[optionType].map((value) => ({
          value,
          label: field === "unit_type" ? UNIT_TYPE_LABELS[value] || value : value,
          deleteLabel: `Delete ${field === "unit_type" ? UNIT_TYPE_LABELS[value] || value : value}`,
        }))}
        onAdd={() => openOptionModal(optionType)}
        onDelete={(value) => setDeleteTarget({ kind: "option", optionType, field, value })}
        onChange={(value) => {
            if (field === "material_name") setMaterialName(value || null);
            else if (field === "unit_type") setUnitType(value || null);
            else updateField(field, value || null);
          }}
      />
    );
  }

  return (
    <BoqDrawer open={open} title={item ? `Edit ${RATE_ITEM_TYPE_LABELS[effectiveType].toLowerCase()} rate` : `Add ${RATE_ITEM_TYPE_LABELS[itemType].toLowerCase()} rate`} subtitle="Build a project rate composition under a main item." onClose={onClose}>
      <div className="space-y-5 p-6">
        {localError || error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{localError || error}</p> : null}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
          {RATE_ITEM_TYPE_LABELS[form.item_type]}
        </div>
        <SelectField label="Main item" field="main_item" optionType="main_item" />
        {form.item_type === "material" ? (
          <>
            <SelectField label="Material name" field="material_name" optionType="material_name" />
            <SelectField label="Supplier" field="supplier" optionType="supplier" />
            <SelectField label="Brand" field="brand" optionType="brand" />
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Material attributes</h3>
                  <p className="mt-1 text-xs text-slate-500">Add material-specific details such as Diameter or Appearance.</p>
                </div>
                <Button variant="secondary" className="h-8 px-2 text-xs" disabled={!materialName} onClick={addMaterialAttributeRow}>+ Add attribute</Button>
              </div>
              {!materialName ? (
                <p className="mt-3 rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">Select a material name before adding attributes.</p>
              ) : form.material_attributes.length ? (
                <div className="mt-4 space-y-3">
                  {form.material_attributes.map((attributeRow, index) => {
                    const selected = selectedAttribute(index);
                    return (
                      <div key={index} className="grid gap-2 rounded-md border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto]">
                        <DeletableDropdown
                          value={attributeRow.attribute}
                          emptyLabel="Attribute name"
                          addLabel="+ Add new attribute"
                          options={materialAttributes.map((attribute) => ({ value: attribute.name, deleteLabel: `Delete ${attribute.name}` }))}
                          onAdd={() => {
                            setAttributeModal("attribute");
                            setAttributeModalRow(index);
                            setAttributeValue("");
                            setAttributeError(null);
                          }}
                          onDelete={(value) => {
                            const attribute = materialAttributes.find((item) => item.name === value);
                            if (attribute) setDeleteTarget({ kind: "attribute", rowIndex: index, attributeId: attribute.id, value });
                          }}
                          onChange={(value) => updateMaterialAttribute(index, { attribute: value })}
                        />
                        <DeletableDropdown
                          disabled={!selected}
                          value={attributeRow.value}
                          emptyLabel="Attribute value"
                          addLabel="+ Add new value"
                          options={(selected?.values || []).map((value) => ({ value: value.value, deleteLabel: `Delete ${value.value}` }))}
                          onAdd={() => {
                            setAttributeModal("value");
                            setAttributeModalRow(index);
                            setAttributeValue("");
                            setAttributeError(null);
                          }}
                          onDelete={(value) => {
                            const attributeValue = selected?.values.find((item) => item.value === value);
                            if (selected && attributeValue) setDeleteTarget({ kind: "attribute_value", rowIndex: index, attributeId: selected.id, valueId: attributeValue.id, value });
                          }}
                          onChange={(value) => updateMaterialAttribute(index, { value })}
                        />
                        <Button variant="ghost" className="h-10 px-2 text-xs" onClick={() => removeMaterialAttributeRow(index)}>Remove</Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">No material attributes selected.</p>
              )}
              {materialAttributesQuery.isLoading ? <p className="mt-2 text-xs text-slate-400">Loading attributes...</p> : null}
            </div>
          </>
        ) : null}
        {form.item_type === "labour" ? (
          <>
            <SelectField label="Name" field="labour_name" optionType="labour_name" />
            <SelectField label="Group" field="labour_group" optionType="labour_group" />
          </>
        ) : null}
        {form.item_type === "machinery" ? (
          <>
            <SelectField label="Name" field="machinery_name" optionType="machinery_name" />
            <SelectField label="Source" field="machinery_source" optionType="machinery_source" />
          </>
        ) : null}
        <SelectField label="Unit type" field="unit_type" optionType={unitOptionType} />
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Unit</span>
          <input className="input mt-1" placeholder={unitDetailPlaceholder(form.item_type, form.unit_type)} value={form.unit_detail || ""} onChange={(event) => updateField("unit_detail", event.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Rate</span>
          <input className="input mt-1" type="number" min="0" step="0.01" value={form.rate} onChange={(event) => updateField("rate", Number(event.target.value))} />
        </label>
      </div>
      <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={saving} onClick={() => void submit()}>{saving ? "Saving..." : "Save"}</Button>
      </footer>
      <ModalDialog
        open={Boolean(optionModalType)}
        title={optionModalType ? `Add ${RATE_OPTION_LABELS[optionModalType]}` : "Add value"}
        description="Create a project value that will appear in this dropdown."
        ariaLabel="Add dropdown value"
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
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{optionModalType ? RATE_OPTION_LABELS[optionModalType] : "Value"}</span>
          <input
            className="input mt-2 w-full"
            autoFocus
            placeholder={optionModalType && Object.values(UNIT_OPTION_TYPE_BY_ITEM_TYPE).includes(optionModalType) ? unitTypePlaceholder(form.item_type) : "Concrete"}
            value={optionValue}
            onChange={(event) => setOptionValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void saveOption();
            }}
          />
        </label>
      </ModalDialog>
      <ModalDialog
        open={Boolean(deleteTarget)}
        title="Delete dropdown value"
        description="This removes the value from the reusable dropdown list. Existing saved rate rows will keep their current text."
        ariaLabel="Delete dropdown value"
        onClose={() => { setDeleteTarget(null); setDeleteError(null); }}
        footer={(
          <>
            <Button variant="secondary" disabled={saving} onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>Cancel</Button>
            <Button variant="danger" disabled={saving} onClick={() => void confirmDeleteDropdownValue()}>{saving ? "Deleting..." : "Delete value"}</Button>
          </>
        )}
      >
        {deleteError ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p> : null}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">{deleteTargetLabel(deleteTarget)}</p>
          <p className="mt-1 text-sm text-slate-500">It will no longer appear as a reusable option for this project.</p>
        </div>
      </ModalDialog>
      <ModalDialog
        open={Boolean(attributeModal)}
        title={attributeModal === "attribute" ? "Add material attribute" : "Add attribute value"}
        description={attributeModal === "attribute" ? `Create an attribute for ${materialName || "this material"}.` : `Create a value for ${attributeModalRow != null ? selectedAttribute(attributeModalRow)?.name || "this attribute" : "this attribute"}.`}
        ariaLabel={attributeModal === "attribute" ? "Add material attribute" : "Add attribute value"}
        onClose={closeAttributeModal}
        footer={(
          <>
            <Button variant="secondary" disabled={saving} onClick={closeAttributeModal}>Cancel</Button>
            <Button disabled={saving || !attributeValue.trim()} onClick={() => void saveMaterialAttributeCatalogValue()}>{saving ? "Saving..." : "Save value"}</Button>
          </>
        )}
      >
        {attributeError ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{attributeError}</p> : null}
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{attributeModal === "attribute" ? "Attribute name" : "Attribute value"}</span>
          <input
            className="input mt-2 w-full"
            autoFocus
            placeholder={attributeModal === "attribute" ? "Diameter" : "12mm"}
            value={attributeValue}
            onChange={(event) => setAttributeValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void saveMaterialAttributeCatalogValue();
            }}
          />
        </label>
      </ModalDialog>
    </BoqDrawer>
  );
}
