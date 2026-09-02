CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared runtime for Floor, Ceiling, Walls, Doors/Windows, Roof and Stairs/Ramps.
-- Beams, Columns, Slab and Foundation keep their existing implementations.
CREATE TABLE IF NOT EXISTS takeoff_harness_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  element text NOT NULL,
  quality text NOT NULL DEFAULT 'medium',
  force boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','needs_review','failed')),
  current_stage text NOT NULL DEFAULT 'scope',
  progress int NOT NULL DEFAULT 0,
  message text,
  checkpoint_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluator_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_takeoff_harness_run_project
  ON takeoff_harness_run(project_id,element,created_at DESC);

CREATE TABLE IF NOT EXISTS takeoff_harness_event (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES takeoff_harness_run(id) ON DELETE CASCADE,
  stage text NOT NULL,
  event_kind text NOT NULL,
  message text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_takeoff_harness_event_run
  ON takeoff_harness_event(run_id,id);

-- A raw FloorSpace is geometry/evidence, not a BOQ item. BOQ quantities are created by
-- finish_assignment and floor_work_assignment (finish, screed, waterproofing, skirting, etc.).
ALTER TABLE floor_space ALTER COLUMN include_in_boq SET DEFAULT false;
UPDATE floor_space SET include_in_boq=false WHERE user_confirmed=false;

-- Explain deterministic cross-element deductions such as door widths removed from skirting.
ALTER TABLE floor_work_assignment ADD COLUMN IF NOT EXISTS measurement_reason text;
