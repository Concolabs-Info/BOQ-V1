CREATE TABLE IF NOT EXISTS boq_rate_file_selection (
  project_id uuid PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
  rate_file_id uuid REFERENCES rate_file(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS boq_rate_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  rate_file_id uuid NOT NULL REFERENCES rate_file(id) ON DELETE CASCADE,
  rate_item_id uuid NOT NULL REFERENCES rate_item(id) ON DELETE CASCADE,
  row_signature text NOT NULL,
  source text NOT NULL CHECK (source IN ('auto', 'manual', 'suggested')),
  status text NOT NULL CHECK (status IN ('applied', 'suggested', 'conflict', 'unmatched')),
  score int NOT NULL DEFAULT 0 CHECK (score >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, rate_file_id, row_signature)
);

CREATE INDEX IF NOT EXISTS idx_boq_rate_mapping_project_file
  ON boq_rate_mapping(project_id, rate_file_id, updated_at DESC);
