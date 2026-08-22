# Production checklist

## Before merge

- [ ] Backend tests pass.
- [ ] Python compile pass succeeds.
- [ ] Frontend typecheck, syntax check and Next build pass.
- [ ] Database migration is tested on a blank database and an existing development database.
- [ ] Upload, render, triage, manual viewport edit and confirmation are tested with vector and raster PDFs.
- [ ] X/Y scale agreement, anisotropy refusal and manual calibration are tested.
- [ ] Height selection, mismatch handling, typed correction, dragged correction and whole-stack confirmation are tested.
- [ ] Specification extraction, not-found records and confirmation staleness are tested.
- [ ] Freeze refuses every incomplete/stale condition and succeeds only when readiness is clean.
- [ ] Frozen Pre rejects every write endpoint.
- [ ] Source storage is persistent and backed up with the database.
- [ ] Authentication/tenant enforcement is connected at the existing Quanto gateway before public exposure.
- [ ] API key is server-side only.

## Before adding Takeoff

- [ ] Takeoff reads `project-frame-v1` only.
- [ ] No Takeoff module writes to frozen Pre tables.
- [ ] New frontend code is added under `features/takeoff/`, not inside Pre.
- [ ] Shared PDF, geometry, AI and storage services are reused rather than copied into an element module.
