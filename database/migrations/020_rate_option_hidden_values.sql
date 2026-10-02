CREATE TABLE IF NOT EXISTS rate_option_hidden (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  option_type text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, option_type, value),
  CHECK (length(trim(value)) > 0),
  CHECK (
    option_type IN (
      'main_item',
      'material_name',
      'supplier',
      'brand',
      'labour_name',
      'labour_group',
      'machinery_name',
      'machinery_source',
      'material_unit_type',
      'labour_unit_type',
      'machinery_unit_type'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_rate_option_hidden_project_type
  ON rate_option_hidden(project_id, option_type, value);
