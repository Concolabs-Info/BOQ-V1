-- Preserve immutable Scope runs for audit instead of overwriting one row per frame.
ALTER TABLE takeoff_scope_manifest
  ADD COLUMN IF NOT EXISTS is_stale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

ALTER TABLE takeoff_scope_manifest
  DROP CONSTRAINT IF EXISTS takeoff_scope_manifest_project_id_element_frame_version_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_takeoff_scope_run_revision
  ON takeoff_scope_manifest(project_id, element, frame_version, run_revision);

CREATE UNIQUE INDEX IF NOT EXISTS uq_takeoff_scope_current
  ON takeoff_scope_manifest(project_id, element)
  WHERE is_stale = false;

CREATE INDEX IF NOT EXISTS idx_takeoff_scope_history
  ON takeoff_scope_manifest(project_id, element, frame_version DESC, run_revision DESC);
