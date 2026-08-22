"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/shared/components/Button";
import { ROOF_BOQ_ELEMENT_TYPES } from "../types";
import type { BoqPlaceholder, BoqTemplateItem } from "../types";
import { BoqAdvancedTemplateSettings } from "./BoqAdvancedTemplateSettings";
import { PlaceholderPicker } from "./PlaceholderPicker";
import { TemplatePreview } from "./TemplatePreview";

const defaults: Partial<Record<BoqTemplateItem["element_type"], Omit<BoqTemplateItem, "id" | "template_id">>> = {
  door: { name: "Doors", element_type: "door", section_code: "5D", section_name: "Doors", unit: "nr", description_template: "[TYPE_CODE] – [MATERIAL] door, size [WIDTH] × [HEIGHT] mm, including [FRAME_MATERIAL] frame and [FINISH].", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 100, is_active: true },
  window: { name: "Windows", element_type: "window", section_code: "5E", section_name: "Windows", unit: "nr", description_template: "[TYPE_CODE] – [FRAME_MATERIAL] framed window, size [WIDTH] × [HEIGHT] mm, including [GLASS_TYPE] glazing and [FINISH].", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 200, is_active: true },
  wall_external: { name: "External walls", element_type: "wall_external", section_code: "5A", section_name: "External walls", unit: "m²", description_template: "[THICKNESS] mm thick [MATERIAL] external wall construction.", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 300, is_active: true },
  wall_internal: { name: "Internal walls", element_type: "wall_internal", section_code: "5B", section_name: "Internal walls", unit: "m²", description_template: "[THICKNESS] mm thick [MATERIAL] internal wall construction.", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 400, is_active: true },
  floor: { name: "Legacy floor finishes", element_type: "floor", section_code: "5J", section_name: "Floor finishes", unit: "m²", description_template: "[FLOOR_FINISH] floor finish to [ROOM_NAME] on [FLOOR_NAMES].", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 500, is_active: true },
  floor_finish: { name: "Floor finishes", element_type: "floor_finish", section_code: "5J", section_name: "Floor finishes", unit: "m²", description_template: "[FLOOR_FINISH] floor finish to [ROOM_NAME] on [FLOOR_NAMES].", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 500, is_active: true },
  floor_work_screed: { name: "Floor screeds", element_type: "floor_work_screed", section_code: "28/1", section_name: "Screeds", unit: "m²", description_template: "[THICKNESS] mm [FLOOR_WORK] to [ROOM_NAME].", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 510, is_active: true },
  floor_work_waterproofing: { name: "Floor waterproofing", element_type: "floor_work_waterproofing", section_code: "19", section_name: "Waterproofing", unit: "m²", description_template: "[FLOOR_WORK] to [ROOM_NAME], including upturns.", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 511, is_active: true },
  floor_work_underlay: { name: "Floor underlays", element_type: "floor_work_underlay", section_code: "28/34", section_name: "Underlays", unit: "m²", description_template: "[FLOOR_WORK] underlay to [ROOM_NAME].", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 512, is_active: true },
  floor_work_board_insulation: { name: "Board insulation", element_type: "floor_work_board_insulation", section_code: "28/32", section_name: "Board insulation", unit: "m²", description_template: "[THICKNESS] mm [FLOOR_WORK] to [ROOM_NAME].", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 513, is_active: true },
  floor_work_quilt_insulation: { name: "Quilt insulation", element_type: "floor_work_quilt_insulation", section_code: "28/33", section_name: "Quilt insulation", unit: "m²", description_template: "[THICKNESS] mm [FLOOR_WORK] to [ROOM_NAME].", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 514, is_active: true },
  floor_work_isolation_membrane: { name: "Isolation membranes", element_type: "floor_work_isolation_membrane", section_code: "28/34", section_name: "Isolation membranes", unit: "m²", description_template: "[FLOOR_WORK] to [ROOM_NAME].", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 515, is_active: true },
  floor_work_sealer: { name: "Floor sealers", element_type: "floor_work_sealer", section_code: "28/24", section_name: "Floor sealers", unit: "m²", description_template: "[FLOOR_WORK] to [ROOM_NAME], [LAYER_COUNT] coat(s).", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 516, is_active: true },
  floor_work_skirting: { name: "Floor skirtings", element_type: "floor_work_skirting", section_code: "28/14", section_name: "Floor skirtings", unit: "m", description_template: "[HEIGHT] mm high [FLOOR_WORK] skirting to [ROOM_NAME].", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 517, is_active: true },
  wall_finish: { name: "Wall finishes", element_type: "wall_finish", section_code: "28", section_name: "28 Floor, wall, ceiling finishes", unit: "m²", description_template: "[LAYER]: [WALL_FINISH] to [ROOM_NAME] ([DIRECTION]).", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 560, is_active: true },
  wall_decoration: { name: "Wall decoration", element_type: "wall_decoration", section_code: "29", section_name: "29 Decoration", unit: "m²", description_template: "[LAYER]: [WALL_FINISH], [COLOUR], to [ROOM_NAME] ([DIRECTION]).", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 570, is_active: true },
  manual: { name: "Manual items", element_type: "manual", section_code: "9Z", section_name: "Other items", unit: "item", description_template: "Manual BOQ item", keywords: [], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 900, is_active: true },
};

function fromItem(item: BoqTemplateItem | null, elementType: BoqTemplateItem["element_type"]): Omit<BoqTemplateItem, "id" | "template_id"> {
  if (!item) { const fallback = defaultFor(elementType); return { ...fallback, conditional_rules: [], keywords: [], formula: { ...fallback.formula } }; }
  return {
    name: item.name,
    element_type: item.element_type,
    section_code: item.section_code,
    section_name: item.section_name,
    unit: item.unit,
    description_template: item.description_template,
    keywords: [...item.keywords],
    template_mode: item.template_mode,
    conditional_rules: Array.isArray(item.conditional_rules) ? item.conditional_rules.map((rule) => ({ ...rule })) : { branches: item.conditional_rules.branches.map((branch) => ({ ...branch, conditions: branch.conditions.map((condition) => ({ ...condition })), output: { ...branch.output, amount_formula: { ...branch.output.amount_formula, variables: [...branch.output.amount_formula.variables] } } })) },
    formula: { ...item.formula },
    sort_order: item.sort_order,
    is_active: item.is_active,
  };
}

function defaultFor(elementType: BoqTemplateItem["element_type"]): Omit<BoqTemplateItem, "id" | "template_id"> {
  const saved = defaults[elementType];
  if (saved) return saved;
  if ((ROOF_BOQ_ELEMENT_TYPES as readonly string[]).includes(elementType)) {
    const isNumber = ["roof_outlet", "rooflight", "skylight", "roof_access_hatch", "roof_vent", "roof_truss", "roof_fall_arrest", "roof_component"].includes(elementType);
    const isLength = ["roof_ridge", "roof_hip", "roof_valley", "roof_eave", "roof_verge", "roof_abutment", "roof_flashing", "roof_capping", "roof_upstand", "roof_downstand", "roof_gutter", "roof_channel", "roof_downpipe", "roof_rafter", "roof_purlin", "roof_joist", "roof_wall_plate", "roof_fascia", "roof_bargeboard"].includes(elementType);
    return { name: elementType.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase()), element_type: elementType, section_code: "18", section_name: "Roof work", unit: isNumber ? "nr" : isLength ? "m" : "m²", description_template: "[ROOF_LEVEL] – Provide [ROOF_ITEM] for [ROOF_SYSTEM]; [MATERIAL]; [PITCH]; including fixings and completion.", keywords: ["roof"], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 575, is_active: true };
  }
  const isNumber = ["ceiling_access_panel", "ceiling_service_collar", "ceiling_fitting"].includes(elementType);
  const isLength = ["ceiling_strip", "ceiling_upstand", "ceiling_edge_trim", "ceiling_angle_trim", "ceiling_fire_barrier", "ceiling_shadow_gap", "ceiling_cornice"].includes(elementType);
  const sectionCode = elementType === "ceiling_decoration" ? "29" : elementType === "ceiling_insulation" ? "31" : ["ceiling_finish", "ceiling_cornice", "ceiling_repair"].includes(elementType) ? "28" : "30";
  return { name: elementType.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase()), element_type: elementType, section_code: sectionCode, section_name: `${sectionCode} Ceiling work`, unit: isNumber ? "nr" : isLength ? "m" : "m²", description_template: "Provide and install [CEILING_ITEM] for [CEILING_SYSTEM]; [MATERIAL]; [FINISH]; [SUSPENSION_BAND]; [HEIGHT_BAND].", keywords: ["ceiling"], template_mode: "standard", conditional_rules: [], formula: { type: "quantity_x_rate" }, sort_order: 580, is_active: true };
}

function localPreview(template: string, placeholders: BoqPlaceholder[]) {
  let result = template;
  for (const placeholder of placeholders) result = result.replaceAll(`[${placeholder.key}]`, placeholder.example || placeholder.label);
  return result;
}

export function BoqTemplateEditor({
  item,
  initialElementType,
  placeholders,
  serverPreview,
  saving,
  onSave,
  onDelete,
  onPreview,
}: {
  item: BoqTemplateItem | null;
  initialElementType: BoqTemplateItem["element_type"];
  placeholders: BoqPlaceholder[];
  serverPreview: string;
  saving: boolean;
  onSave: (payload: Omit<BoqTemplateItem, "id" | "template_id">) => Promise<void>;
  onDelete?: () => Promise<void>;
  onPreview: () => Promise<void>;
}) {
  const [form, setForm] = useState(() => fromItem(item, initialElementType));
  const [advanced, setAdvanced] = useState(false);
  const textarea = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setForm(fromItem(item, initialElementType));
    setAdvanced(false);
  }, [initialElementType, item]);

  const preview = useMemo(() => serverPreview || localPreview(form.description_template, placeholders), [form.description_template, placeholders, serverPreview]);

  function insertToken(token: string) {
    const node = textarea.current;
    const start = node?.selectionStart ?? form.description_template.length;
    const end = node?.selectionEnd ?? start;
    setForm({ ...form, description_template: `${form.description_template.slice(0, start)}${token}${form.description_template.slice(end)}` });
    window.setTimeout(() => node?.focus(), 0);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Template name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
        <label>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Element type</span>
          <select className="input mt-2 w-full" value={form.element_type} onChange={(event) => {
            const elementType = event.target.value as BoqTemplateItem["element_type"];
            setForm({ ...defaultFor(elementType) });
          }}>
            <option value="door">Door</option>
            <option value="window">Window</option>
            <option value="wall_external">External wall</option>
            <option value="wall_internal">Internal wall</option>
            <option value="floor_finish">Floor finish</option>
            <option value="floor_work_screed">Floor screed</option>
            <option value="floor_work_waterproofing">Floor waterproofing</option>
            <option value="floor_work_underlay">Floor underlay</option>
            <option value="floor_work_board_insulation">Board insulation</option>
            <option value="floor_work_quilt_insulation">Quilt insulation</option>
            <option value="floor_work_isolation_membrane">Isolation membrane</option>
            <option value="floor_work_sealer">Floor sealer</option>
            <option value="floor_work_skirting">Floor skirting</option>
            <option value="wall_finish">Wall finish</option>
            <option value="wall_decoration">Wall decoration</option>
            {ROOF_BOQ_ELEMENT_TYPES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ").replace(/\b\w/g, (part) => part.toUpperCase())}</option>)}
            <option value="ceiling_system">Ceiling system</option>
            <option value="ceiling_finish">Ceiling finish</option>
            <option value="ceiling_decoration">Ceiling decoration</option>
            <option value="ceiling_bulkhead">Ceiling bulkhead</option>
            <option value="ceiling_beam">Ceiling beam</option>
            <option value="ceiling_strip">Ceiling strip</option>
            <option value="ceiling_upstand">Ceiling upstand</option>
            <option value="ceiling_access_panel">Ceiling access panel</option>
            <option value="ceiling_edge_trim">Ceiling edge trim</option>
            <option value="ceiling_angle_trim">Ceiling angle trim</option>
            <option value="ceiling_fire_barrier">Ceiling fire barrier</option>
            <option value="ceiling_service_collar">Ceiling service collar</option>
            <option value="ceiling_fitting">Ceiling fitting</option>
            <option value="ceiling_shadow_gap">Ceiling shadow gap</option>
            <option value="ceiling_cornice">Ceiling cornice</option>
            <option value="ceiling_insulation">Ceiling insulation</option>
            <option value="ceiling_repair">Ceiling repair</option>
            <option value="manual">Manual item</option>
          </select>
        </label>
        <Field label="Section" value={form.section_name} onChange={(value) => setForm({ ...form, section_name: value })} />
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="Section code" value={form.section_code || ""} onChange={(value) => setForm({ ...form, section_code: value })} />
          <Field label="Unit" value={form.unit} onChange={(value) => setForm({ ...form, unit: value })} />
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</span>
        <textarea ref={textarea} className="input mt-2 min-h-36 w-full resize-y text-sm leading-6" value={form.description_template} onChange={(event) => setForm({ ...form, description_template: event.target.value })} />
      </label>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Insert project data</p>
        <div className="mt-2"><PlaceholderPicker placeholders={placeholders} onPick={insertToken} /></div>
      </div>

      <TemplatePreview description={preview} />

      <section className="border-t border-slate-200 pt-5">
        <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setAdvanced((value) => !value)}>
          <span>
            <span className="block text-sm font-semibold text-slate-900">Advanced template rules</span>
            <span className="mt-1 block text-xs text-slate-500">Conditions, keywords, sort order and activation.</span>
          </span>
          <span className="text-lg text-slate-400">{advanced ? "−" : "+"}</span>
        </button>
        {advanced ? <div className="mt-4"><BoqAdvancedTemplateSettings value={form} placeholders={placeholders} onChange={setForm} /></div> : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
        <div>{onDelete ? <Button variant="danger" disabled={saving} onClick={() => void onDelete()}>Delete item</Button> : null}</div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={saving || !item} onClick={() => void onPreview()}>Refresh preview</Button>
          <Button disabled={saving || !form.name.trim() || !form.description_template.trim()} onClick={() => void onSave(form)}>{saving ? "Saving…" : item ? "Save template" : "Create template"}</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span><input className="input mt-2 w-full" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
