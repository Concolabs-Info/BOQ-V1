# Ceiling Takeoff frontend boundary

The visible Ceiling screens remain in the supplied `features/quanto/TakeoffPage.tsx` demo-derived shell so the UI is unchanged. Production Ceiling data is loaded/persisted through `../shared/useRealFloorCeilingTakeoff.ts`. Backend authority is `/api/v1/projects/{projectId}/takeoff/ceiling/*`.
