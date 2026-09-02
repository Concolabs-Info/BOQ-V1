-- Only one Scope manifest is current for an element, even after the Project Frame changes.
DROP INDEX IF EXISTS uq_takeoff_scope_current;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY project_id, element
           ORDER BY frame_version DESC, run_revision DESC, created_at DESC
         ) AS position
  FROM takeoff_scope_manifest
  WHERE is_stale = false
)
UPDATE takeoff_scope_manifest AS manifest
SET is_stale = true,
    superseded_at = coalesce(manifest.superseded_at, now())
FROM ranked
WHERE manifest.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX uq_takeoff_scope_current
  ON takeoff_scope_manifest(project_id, element)
  WHERE is_stale = false;
