# Floor + Ceiling Production Integration

This implementation preserves the supplied Quanto demo UI. It replaces the Floor and Ceiling demo datasets with project-backed PostgreSQL entities and drawing images produced by Pre.

## Data flow

```text
Frozen Pre Project Frame
  -> confirmed storeys / plan viewports / scale / height / specification evidence
  -> Floor analysis
     -> FloorSpace + finish zones + floor works + evidence + deterministic quantities
     -> user review/edit/confirm in the existing Dimension + Workbook UI
  -> Ceiling analysis
     -> dedicated RCP when available, otherwise confirmed FloorSpace geometry
     -> section/elevation evidence for special ceiling conditions when required
     -> ceiling zones/features + evidence + deterministic quantities where geometry supports them
     -> user review/edit/confirm in the existing UI
```

## Measurement rule

The model reads and classifies drawing evidence. It returns source-pixel geometry only. Official areas/lengths are calculated by backend code using the confirmed Pre scale. Model-calculated quantity values are not accepted as measurement authority.

## Persistence

- Original PDFs/renders/crops remain in `STORAGE_ROOT`.
- Canonical Floor/Ceiling entities, geometry, evidence, confidence, confirmations and UI review state are stored in PostgreSQL.
- User-confirmed Floor geometry is protected from automatic reruns.
- Ceiling fallback is blocked until FloorSpace geometry has been reviewed/confirmed.
- Special/sloped ceilings remain review-required when the drawing evidence is insufficient to calculate a true surface area.

## OpenAI

Set the key only in the server `.env`; never place it in frontend code. Floor/Ceiling analysis uses strict Pydantic structured outputs and bounded retry/validation. The exact source crop dimensions are part of the schema contract; coordinate-space mismatches are rejected rather than silently rescaled.
