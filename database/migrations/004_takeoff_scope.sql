CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Generic deterministic Takeoff Scope layer.
-- Scope sits between the frozen Pre Project Frame and element-specific Bind/Detect work.
CREATE TABLE IF NOT EXISTS takeoff_scope_manifest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  element text NOT NULL,
  frame_version int NOT NULL,
  status text NOT NULL CHECK (status IN ('ready','partial','blocked')),
  manifest_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  run_revision int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, element, frame_version)
);
CREATE INDEX IF NOT EXISTS idx_takeoff_scope_project
  ON takeoff_scope_manifest(project_id, element, frame_version DESC);

CREATE TABLE IF NOT EXISTS takeoff_scope_question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  element text NOT NULL,
  frame_version int NOT NULL,
  scope_ref text,
  code text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('guidance','single_choice','anomaly','dependency')),
  prompt text NOT NULL,
  effect text NOT NULL DEFAULT 'hold',
  options_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  entity_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','dismissed')),
  answer_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  UNIQUE(project_id, element, frame_version, scope_ref, code)
);
CREATE INDEX IF NOT EXISTS idx_takeoff_scope_question_open
  ON takeoff_scope_question(project_id, element, frame_version, status);

-- Future Bind/Detect/Resolve nodes publish confirmed facts here. Scope reads only the
-- fact types declared by the element. The table exists now so dependency handling is
-- stable before the later Takeoff nodes are implemented.
CREATE TABLE IF NOT EXISTS takeoff_fact_set (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  publisher_element text NOT NULL,
  fact_type text NOT NULL,
  scope_ref text NOT NULL DEFAULT 'project',
  frame_version int NOT NULL,
  status text NOT NULL CHECK (status IN ('complete','complete_empty','pending','absent')),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  fact_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, publisher_element, fact_type, scope_ref, frame_version)
);
CREATE INDEX IF NOT EXISTS idx_takeoff_fact_lookup
  ON takeoff_fact_set(project_id, fact_type, frame_version, scope_ref);
