# Element Harness Implementation Report

## Scope completed

Implemented a shared production harness for:

- Floors
- Ceilings
- Walls
- Doors
- Windows
- Roofs
- Stairs
- Ramps

Protected and intentionally unchanged:

- Beams
- Columns
- Slabs
- Foundations

## Major additions

- Shared harness lifecycle with durable stage artifacts and heartbeat recovery, element registry, prompt builder, account-backed model adapter, fact publishing, dependency/ownership gates, evaluator, derived-quantity helpers and production BOQ candidate bridge.
- Eight separate expert profiles and eight separate super prompts.
- Database migration/schema 011 for harness run/event persistence and Floor geometry/derived-work semantics.
- Generic harness status/event/BOQ API routes.
- Frontend production BOQ bridge with fail-visible refresh/export safety and live lifecycle/evaluator/event display.
- Interrupted-run recovery for every target element.
- Separately queryable Door, Window, Stair and Ramp outcomes after their shared source-analysis passes.
- Additional harness/ownership/BOQ regression tests.
- Immutable Scope refreshes now supersede the prior current manifest with a new audited revision, matching migrations 005/006.
- Account-backed structured outputs are normalized to the strict Responses JSON Schema contract before model execution.
- Repeated typical floors receive separate editor viewport identities, human-readable family marks and an explicit fresh-detection action.

## Important quantity behaviour

- FloorSpace is detected/measured geometry only. Confirmed floor finishes and related work (screed, waterproofing, underlay, insulation, membranes, sealer, skirting) become BOQ candidates.
- Ceiling reuses confirmed Floor geometry when appropriate and only overrides it when ceiling evidence requires a different geometry/condition. Unconfirmed Floor geometry may seed visible review-only Ceiling candidates, but those candidates remain excluded from BOQ.
- Wall openings and Door/Window data feed dependent deductions without making those dependencies hard blockers.
- Roof-specific quantities enter the Roof BOQ path; structural slab concrete/reinforcement/formwork remain owned by the existing protected Slab implementation.
- Stair/Ramp quantities are derived from confirmed multi-view geometry and deterministic calculations.

## Verification performed

- Backend Python compilation passes.
- Full backend suite: 113 tests pass, including Beam lifecycle coverage.
- Frontend TypeScript typecheck passes.
- Frontend TypeScript/TSX syntax scan: 324 source files checked, 0 syntax errors.
- Next.js optimized production build passes.

The active backend environment includes LangGraph and the protected Beam lifecycle tests pass. Beam, Column, Slab and Foundation execution paths were not routed into the shared element harness.
