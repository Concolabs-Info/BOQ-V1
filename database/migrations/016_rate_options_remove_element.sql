DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'rate_item'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%unit_type%'
  LOOP
    EXECUTE format('ALTER TABLE rate_item DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

UPDATE rate_item
SET unit_type = custom_unit
WHERE unit_type = 'custom'
  AND custom_unit IS NOT NULL
  AND length(trim(custom_unit)) > 0;

ALTER TABLE rate_item
  ALTER COLUMN unit_type TYPE text,
  DROP COLUMN IF EXISTS element_category;

DROP INDEX IF EXISTS idx_rate_item_rate_file;
CREATE INDEX IF NOT EXISTS idx_rate_item_rate_file
  ON rate_item(rate_file_id, material_name, specification, size);

CREATE TABLE IF NOT EXISTS rate_option (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  option_type text NOT NULL CHECK (option_type IN ('unit_type', 'specification')),
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, option_type, value)
);

CREATE INDEX IF NOT EXISTS idx_rate_option_project_type
  ON rate_option(project_id, option_type, value);
