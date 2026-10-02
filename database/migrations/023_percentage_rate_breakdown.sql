ALTER TABLE rate_item
  ADD COLUMN IF NOT EXISTS percentage_name text,
  ADD COLUMN IF NOT EXISTS percentage numeric(10, 4),
  ALTER COLUMN unit_type DROP NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'rate_item'::regclass
      AND contype = 'c'
      AND conname IN (
        'rate_item_type_check',
        'rate_item_material_name_check',
        'rate_item_labour_name_check',
        'rate_item_machinery_name_check',
        'rate_item_percentage_name_check',
        'rate_item_percentage_check',
        'rate_item_unit_type_check'
      )
  LOOP
    EXECUTE format('ALTER TABLE rate_item DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE rate_item
  ADD CONSTRAINT rate_item_type_check CHECK (item_type IN ('material', 'labour', 'machinery', 'percentage')),
  ADD CONSTRAINT rate_item_material_name_check CHECK (item_type <> 'material' OR length(trim(COALESCE(material_name, ''))) > 0),
  ADD CONSTRAINT rate_item_labour_name_check CHECK (item_type <> 'labour' OR length(trim(COALESCE(labour_name, ''))) > 0),
  ADD CONSTRAINT rate_item_machinery_name_check CHECK (item_type <> 'machinery' OR length(trim(COALESCE(machinery_name, ''))) > 0),
  ADD CONSTRAINT rate_item_percentage_name_check CHECK (item_type <> 'percentage' OR length(trim(COALESCE(percentage_name, ''))) > 0),
  ADD CONSTRAINT rate_item_percentage_check CHECK (item_type <> 'percentage' OR (percentage IS NOT NULL AND percentage >= 0)),
  ADD CONSTRAINT rate_item_unit_type_check CHECK (item_type = 'percentage' OR length(trim(COALESCE(unit_type, ''))) > 0);

ALTER TABLE norm_item
  ALTER COLUMN unit DROP NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'norm_item'::regclass
      AND contype = 'c'
      AND conname IN (
        'norm_item_item_type_check',
        'norm_item_unit_check'
      )
  LOOP
    EXECUTE format('ALTER TABLE norm_item DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE norm_item
  ADD CONSTRAINT norm_item_item_type_check CHECK (item_type IN ('material', 'labor', 'machinery', 'percentage')),
  ADD CONSTRAINT norm_item_unit_check CHECK (item_type = 'percentage' OR length(trim(COALESCE(unit, ''))) > 0);

CREATE TABLE IF NOT EXISTS rate_breakdown_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code text,
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_rate_breakdown_project
  ON rate_breakdown_item(project_id, updated_at DESC);

DROP INDEX IF EXISTS idx_rate_item_rate_file;
CREATE INDEX IF NOT EXISTS idx_rate_item_rate_file
  ON rate_item(rate_file_id, item_type, material_name, labour_name, machinery_name, percentage_name);
