# Ceiling Finish Evidence — Model Instructions

Use these instructions to extract and interpret ceiling finish information from a schedule, legend, specification, general notes or targeted drawing crop.

The model's job is to return **structured finish definitions and evidence rules**. It must not calculate official quantities.

## Input may include

- schedule/legend/specification image or PDF page;
- pre-extracted text/table cells;
- source page metadata;
- known CeilingZone summaries;
- known FloorSpace names/types;
- known finish codes already found on drawings.

## Tasks

### 1. Find ceiling finish definitions

Identify entries that define a ceiling/soffit system or finish.

Extract only what is supported:

- code;
- name/system;
- material;
- size/module;
- thickness;
- suspension/grid;
- coating/paint;
- special properties explicitly stated;
- detail/spec reference;
- notes.

Do not infer missing technical specifications.

### 2. Find assignment rules

Extract rules connecting a finish to:

- specific room ID/name;
- normalized room category;
- ceiling code;
- colour;
- hatch/pattern;
- level/zone;
- general/default scope.

### 3. Preserve raw wording

Keep the original printed text as evidence even when you normalize it.

Example:

```text
raw room: "W.C."
normalized room_type: "toilet"
```

### 4. Handle synonyms carefully

Examples may include:

- `CEILING`, `CLG`, `C/L`, `SOFFIT`;
- `GYPSUM`, `PLASTERBOARD`, `GWB`;
- `ACOUSTIC TILE`, `ACT`;
- `EXPOSED SOFFIT`, `EXPOSED SLAB`.

Use context. Do not normalize two terms into the same system when the source makes them different.

### 5. Colours/hatches

If a legend says a colour/hatch means a code/material, return that mapping.

Do not guess colour meaning when there is no legend or direct supporting note.

### 6. General rules and exceptions

Capture both.

Example:

```text
General rule: all internal ceilings = C01
Exception: bathrooms = C03
```

Return the exception separately so code can apply the more specific rule.

### 7. Conflicts

If the source itself contains contradictory definitions or unclear code reuse, return a warning. Do not resolve by invention.

## Output

Return JSON only and follow the supplied schema.

Include:

- finish definitions;
- assignment rules;
- legend mappings;
- source/evidence refs;
- confidence;
- warnings.
