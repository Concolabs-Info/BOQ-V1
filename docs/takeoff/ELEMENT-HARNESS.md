# Quanto Shared Element Harness

This runtime applies only to Floors, Ceilings, Walls, Doors, Windows, Roofs, Stairs and Ramps.
Beams, Columns, Slabs and Foundations remain on their existing implementations.

## Runtime

Each target element is executed through the same durable lifecycle:

`Scope -> Bind -> Detect -> Verify -> Resolve -> Dimension -> Quantify -> Check`

Scope remains deterministic and selects trusted frozen Pre evidence. The Detect/Resolve stages may use the signed-in ChatGPT/Codex account through `HarnessModelClient`. Geometry and arithmetic are validated/calculated by code. The Check stage runs an element-specific evaluator after facts and derived quantities are persisted.

The shared runtime records progress/events and a compact artifact for every completed stage in PostgreSQL when migration 011 is available, and mirrors the checkpoint to project-local storage. A heartbeat protects long model calls from false interruption detection. Runs whose worker heartbeat disappears become recoverable instead of remaining `running` forever; the element engines reuse their content-addressed evidence/model caches during retry.

Verify, Resolve and Dimension are database-backed gates. They inspect the normalized saved geometry, current-frame dependency facts and unresolved deterministic measurements. Check remains a separately executed completeness evaluator.

## Expert profiles

Every target element has a separate profile in `backend/app/modules/takeoff/experts/profiles/` and a separate versioned super prompt in `backend/app/modules/takeoff/experts/prompts/`.

- Floor: FloorSpace, finish zones, doorway connectors, under-stair/external-floor exceptions and derived work such as finishes, screed, waterproofing and skirting. FloorSpace itself is not a BOQ line.
- Ceiling: inherits confirmed Floor geometry when no controlling RCP changes it; unconfirmed Floor geometry is exposed only as review candidates and remains outside BOQ; detects RCP overrides, bulkheads, drops, slopes, no-ceiling/open-to-sky conditions and ceiling features.
- Walls: supports paired faces, centreline, filled/poche, raster and mixed representations; resolves wall type/thickness/height and finishes without inventing unsupported data.
- Doors: plan location + type/tag + schedule + host-wall reconciliation, including common operation/leaf/fire/glazing conditions.
- Windows: plan/elevation/schedule reconciliation, including groups, corner/high-level/clerestory/louvre cases.
- Roof: classifies flat/pitched/mixed/canopy/curved/terrace conditions; resolves plane topology/pitch/openings and roof-specific work. Protected Slab owns structural slab concrete/reinforcement/formwork.
- Stairs: plan/section/detail/level multi-view reasoning, flight/landing/riser/tread/waist geometry and finish derivation.
- Ramps: plan/section/level reasoning, run/rise/true length/gradient/landing/kerb geometry and finish derivation.

Doors+Windows and Stairs+Ramps retain one shared source interpretation pass for backward compatibility and to avoid charging twice for the same drawing. After that pass, Door, Window, Stair and Ramp receive separately queryable run identities and element-filtered evaluator results, in addition to the combined workspace result.

## Shared facts and dependencies

The new elements publish reusable facts after analysis. Dependencies are soft where possible so an element can complete its independent geometry while a dependent sub-quantity waits for another element.

Examples:

- Floor publishes `floor_geometry`; Ceiling consumes it.
- Doors/Windows publish openings; Wall quantities and Floor skirting can consume opening facts.
- Walls publish wall geometry; Doors/Windows consume it for host binding.
- Roof can consume existing Slab facts but does not take ownership of structural slab BOQ quantities.

## BOQ ownership

`backend/app/modules/takeoff/harness/ownership.py` prevents the same physical work being owned by multiple target elements.

`backend/app/modules/takeoff/harness/boq.py` exposes only confirmed/review-safe derived work for the eight new harness elements. Raw Floor/Ceiling geometry is evidence, not a bill item. Structural roof slab concrete/reinforcement/formwork is intentionally omitted because Slab remains the owner.

The frontend BOQ bridge loads these production candidates and replaces only the corresponding demo-derived target rows; existing Beam/Column/Slab/Foundation rows are preserved. Database/schema failures are fail-visible: the UI keeps the previous rows, shows the error and blocks refresh/export instead of treating an unavailable query as zero measured work.

## Model calls

The harness uses the existing account-backed Codex/ChatGPT authentication. Each element has a bounded structured retry policy (normal attempt plus one targeted repair for a malformed structured result). Element engines retain their own semantic/deterministic repair rules; the Roof engine, for example, keeps its one targeted semantic repair approach.

## Review behaviour

A completed run is still shown to the user even when the independent evaluator finds non-fatal issues. `harness_status`, `harness_issues` and `harness_stats` are returned with analysis status. The Takeoff UI shows a live lifecycle panel, evaluator issues, dependency flow and recent durable events while keeping detected geometry visible and editable. Unsafe or unsupported quantities are left unresolved rather than guessed.

When no reflected ceiling plan exists, valid detected Floor geometry can seed visible Ceiling review candidates before Floor confirmation. The source confirmation state is retained in each candidate's evidence, and the production BOQ query continues to require explicit Ceiling confirmation.
