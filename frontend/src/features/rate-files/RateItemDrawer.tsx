"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/shared/components/Button";
import { ModalDialog } from "@/shared/components/ModalDialog";
import { BoqDrawer } from "@/features/boq/components/BoqDrawer";
import { createMaterialAttribute, createMaterialAttributeValue } from "./api";
import { rateFileKeys, useMaterialAttributes } from "./hooks";
import type { RateItem, RateItemInput, RateItemType, RateOptionType, RateOptions } from "./types";
import { DEFAULT_UNIT_TYPES, RATE_ITEM_TYPE_LABELS, RATE_OPTION_LABELS, UNIT_TYPE_LABELS } from "./types";

const ADD_PREFIX = "__add__";

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
  unit_type: "m2",
  unit_detail: null,
  rate: 0,
});

function trimValue(value: string | null | undefined) {
  return String(value || "").trim() || null;
}

function defaultUnitDetail(unitType: string | null | undefined) {
  const unit = trimValue(unitType);
  return unit ? `1 ${UNIT_TYPE_LABELS[unit] || unit}` : null;
}

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

  const materialName = trimValue(form.material_name);
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
    unit_type: options?.unit_type?.length ? options.unit_type : [...DEFAULT_UNIT_TYPES],
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
    setForm((current) => ({ ...current, unit_type: value || "", unit_detail: defaultUnitDetail(value) }));
  }

  function setMaterialName(value: string | null) {
    setForm((current) => ({ ...current, material_name: value, material_attributes: [] }));
  }

  function updateMaterialAttribute(index: number, patch: { attribute?: string; value?: string }) {
    setForm((current) => ({
      ...current,
      material_attributes: current.material_attributes.map((row, rowIndex) => rowIndex === index ? {
        attribute: patch.attribute ?? row.attribute,
        value: patch.attribute && patch.attribute !== row.attribute ? "" : patch.value ?? row.value,
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
    const addValue = `${ADD_PREFIX}${optionType}`;
    return (
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        <select
          className="input mt-1"
          value={String(form[field] || "")}
          onChange={(event) => {
            if (event.target.value === addValue) {
              openOptionModal(optionType);
              return;
            }
            if (field === "material_name") setMaterialName(event.target.value || null);
            else if (field === "unit_type") setUnitType(event.target.value || null);
            else updateField(field, event.target.value || null);
          }}
        >
          <option value="">No {RATE_OPTION_LABELS[optionType]}</option>
          {optionValues[optionType].map((value) => <option key={value} value={value}>{optionType === "unit_type" ? UNIT_TYPE_LABELS[value] || value : value}</option>)}
          <option value={addValue}>+ Add another {RATE_OPTION_LABELS[optionType]}</option>
        </select>
      </label>
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
                    const addAttributeValue = `${ADD_PREFIX}material_attribute`;
                    const addValueValue = `${ADD_PREFIX}material_attribute_value`;
                    return (
                      <div key={index} className="grid gap-2 rounded-md border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto]">
                        <select
                          className="input bg-white"
                          value={attributeRow.attribute}
                          onChange={(event) => {
                            if (event.target.value === addAttributeValue) {
                              setAttributeModal("attribute");
                              setAttributeModalRow(index);
                              setAttributeValue("");
                              setAttributeError(null);
                              return;
                            }
                            updateMaterialAttribute(index, { attribute: event.target.value });
                          }}
                        >
                          <option value="">Attribute name</option>
                          {materialAttributes.map((attribute) => <option key={attribute.id} value={attribute.name}>{attribute.name}</option>)}
                          <option value={addAttributeValue}>+ Add new attribute</option>
                        </select>
                        <select
                          className="input bg-white"
                          disabled={!selected}
                          value={attributeRow.value}
                          onChange={(event) => {
                            if (event.target.value === addValueValue) {
                              setAttributeModal("value");
                              setAttributeModalRow(index);
                              setAttributeValue("");
                              setAttributeError(null);
                              return;
                            }
                            updateMaterialAttribute(index, { value: event.target.value });
                          }}
                        >
                          <option value="">Attribute value</option>
                          {(selected?.values || []).map((value) => <option key={value.id} value={value.value}>{value.value}</option>)}
                          {selected ? <option value={addValueValue}>+ Add new value</option> : null}
                        </select>
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
        <SelectField label="Unit type" field="unit_type" optionType="unit_type" />
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Unit</span>
          <input className="input mt-1" placeholder="50kg bag, 8-hour day, trip" value={form.unit_detail || ""} onChange={(event) => updateField("unit_detail", event.target.value)} />
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
            placeholder={optionModalType === "unit_type" ? "day" : "Concrete"}
            value={optionValue}
            onChange={(event) => setOptionValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void saveOption();
            }}
          />
        </label>
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
