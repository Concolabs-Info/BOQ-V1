# Takeoff Scope — production implementation

## Meaning

Scope is the first Takeoff node. It reads the frozen Pre Project Frame and creates the approved evidence set for one element. It does not detect or measure the element and it makes no model/API call.

```text
Pre frozen frame
  → Scope
  → Bind
  → Detect
  → Verify
  → Resolve
  → Dimension
  → Quantify
  → Check
```

## Generic API, separate element logic

The HTTP contract is generic:

```text
GET  /api/v1/projects/{project_id}/takeoff/{element}/scope
POST /api/v1/projects/{project_id}/takeoff/{element}/scope/run
POST /api/v1/projects/{project_id}/takeoff/{element}/scope/questions/{question_id}/answer
```

Internally the registry selects one element-specific `ElementScopeSpec` for:

- Columns
- Beams
- Slab
- Floor
- Ceiling
- Doors & Windows
- Walls
- Roof
- Stairs & Ramps
- Foundation

## Scope reads

- included sheets and exact viewport boxes from Pre
- view kind, discipline and subject tags
- confirmed level/storey mapping
- confirmed viewport scale/calibration
- storey heights/datums where required
- registered schedules, details, sections/elevations and specification evidence
- published fact-set status from other elements where declared

## Scope writes

- selected primary/supporting viewport IDs
- per-level/per-scope mapping
- source roles
- vertical evidence coverage
- consumed fact/dependency status
- coverage gaps and holds
- user-actionable questions
- a persisted `takeoff-scope-v1` manifest tied to the frozen `frame_version`

## Persistence

`004_takeoff_scope.sql` adds:

- `takeoff_scope_manifest`
- `takeoff_scope_question`
- `takeoff_fact_set`

A newer frozen Pre frame creates a newer Scope manifest. Older manifests remain available as audit history.

## UI

Scope is intentionally not a main Takeoff tab. `ScopeStatus` appears below the existing Dimension / Workbook / 3D tabs and shows only Ready / Partial / Blocked status, evidence counts, and actions that require the surveyor. Pre-owned problems route back to Pre.

## Current integration

Floor, Ceiling and Roof production source selection now consumes the Scope manifest. Their existing analysis/editing APIs and UI remain intact. The other seven planned elements already have production Scope definitions and can consume the same manifest when their later stages are implemented.
