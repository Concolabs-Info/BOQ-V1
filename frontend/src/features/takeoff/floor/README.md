# Floor Takeoff frontend boundary

The visible Floor screens remain in the supplied `features/quanto/TakeoffPage.tsx` demo-derived shell so the UI is unchanged. Production Floor data is loaded/persisted through `../shared/useRealFloorCeilingTakeoff.ts`. Backend authority is `/api/v1/projects/{projectId}/takeoff/floor/*`.
