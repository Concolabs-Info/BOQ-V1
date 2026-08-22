# Frontend structure

The uploaded Quanto demo UI is the visual/product source of truth. Production work must not redesign its navigation, options, layout, panels or workspace behavior.

`src/app/` owns routes. `src/features/` owns product modules. `src/shared/` owns reusable UI/runtime infrastructure.

Pre is the only production-connected feature in this release. Its explicit stage boundaries are:

- `features/pre/upload/`
- `features/pre/plans/`
- `features/pre/scale/`
- `features/pre/height/`
- `features/pre/specifications/`
- `features/pre/start-takeoff/`
- `features/pre/project-frame/`

The existing `features/pre/components/PrePage.tsx` remains the exact demo-derived visual composition so the UI is not accidentally changed during the production conversion. Stage folders are stable boundaries for future extraction/refactoring without changing the user experience.

Takeoff, Review and BOQ UI/code from the demo remain available as product boundaries, but their production backend/data flows are intentionally deferred.
