# Concrete Roof and Derived Materials — Measurement and Rules

## 1. Concrete

### Horizontal slab

When slab thickness is confirmed:

`concrete volume = net structural slab area × slab thickness`

Use metres for thickness in the calculation.

Example:

- 100 m²
- 0.15 m thick
- concrete = 15 m³

For sloping concrete roofs, store how thickness is defined. If thickness is normal to the slab plane, use actual sloped slab surface area × thickness. If the structural detail defines thickness differently, follow that evidence or ask the user.

Do not use a simple factor when exact geometry/thickness exists.

## 2. Reinforcement

Preferred order:

1. reinforcement schedule/BBS/structural model or explicit drawing data
2. calculated bars from a validated reinforcement plan/detail
3. user/project factor (kg/m²) as a derived estimate

If a factor is used:

`reinforcement estimate = roof/slab basis area × kg/m² factor`

Store the result in kg internally; BOQ rules may convert to tonnes.

The factor must have:

- value
- unit
- source
- status
- user who confirmed it

## 3. Soffit formwork

For a simple suspended horizontal roof slab, soffit formwork basis is normally the relevant slab soffit area, then NRM2/project rules control deductions and classifications.

Do not blindly hard-code `1 m² per 1 m²` for every case. Beams, coffers, ribs, slopes and voids can change the measured formwork.

## 4. Edge formwork

Where edge formwork is required:

`edge formwork area = qualifying edge length × formed depth`

Store which edges qualify. Do not assume parapet/wall-supported edges need the same treatment as free slab edges.

## 5. Sloping/top formwork

Use the measurement-rule engine for sloping surfaces and special top formwork. Do not let a generic factor override an explicit NRM2/project rule.

## 6. Openings

Store opening geometry regardless of deduction threshold. The active ruleset decides whether an opening is deducted from concrete/formwork.

## 7. Derived hidden materials

For non-concrete systems, allow editable material factors such as:

- timber framing m/m² or m³/m²
- steel framing kg/m²
- battens m/m²
- boarding/decking m²/m²
- fixings nr/m²

These are estimates unless supported by details/schedules.

## 8. Confidence/status

Every quantity must be one of:

- measured_from_geometry
- measured_from_schedule
- derived_from_factor
- user_entered

Do not mix these silently.
