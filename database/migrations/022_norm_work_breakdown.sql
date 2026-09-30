DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'rate_item'::regclass
      AND contype = 'c'
      AND conname = 'rate_item_main_item_check'
  LOOP
    EXECUTE format('ALTER TABLE rate_item DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE rate_item
  ALTER COLUMN main_item DROP NOT NULL;

DROP INDEX IF EXISTS idx_rate_item_rate_file;
CREATE INDEX IF NOT EXISTS idx_rate_item_rate_file
  ON rate_item(rate_file_id, item_type, material_name, labour_name, machinery_name);

CREATE TABLE IF NOT EXISTS norm_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  name text NOT NULL,
  quantity numeric(14, 4) NOT NULL DEFAULT 0,
  unit text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (item_type IN ('material', 'labor', 'machinery')),
  CHECK (length(trim(name)) > 0),
  CHECK (quantity >= 0),
  CHECK (length(trim(unit)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_norm_item_project_type
  ON norm_item(project_id, item_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS norm_option (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  option_type text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, option_type, value),
  CHECK (option_type IN ('norm_material_unit', 'norm_labor_unit', 'norm_machinery_unit')),
  CHECK (length(trim(value)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_norm_option_project_type
  ON norm_option(project_id, option_type, value);

CREATE TABLE IF NOT EXISTS work_breakdown_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code text,
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_work_breakdown_project
  ON work_breakdown_item(project_id, updated_at DESC);
