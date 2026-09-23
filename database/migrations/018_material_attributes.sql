ALTER TABLE rate_item
  DROP COLUMN IF EXISTS material_type,
  ADD COLUMN IF NOT EXISTS material_attributes jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS rate_material_attribute (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  material_name text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, material_name, name),
  CHECK (length(trim(material_name)) > 0),
  CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS rate_material_attribute_value (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id uuid NOT NULL REFERENCES rate_material_attribute(id) ON DELETE CASCADE,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(attribute_id, value),
  CHECK (length(trim(value)) > 0)
);

DELETE FROM rate_option
WHERE option_type = 'material_type';

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'rate_option'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%option_type%'
  LOOP
    EXECUTE format('ALTER TABLE rate_option DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE rate_option
  ADD CONSTRAINT rate_option_type_check CHECK (
    option_type IN (
      'main_item',
      'material_name',
      'supplier',
      'brand',
      'labour_name',
      'labour_group',
      'machinery_name',
      'machinery_source',
      'unit_type'
    )
  );

DROP INDEX IF EXISTS idx_rate_item_material_boq;
CREATE INDEX IF NOT EXISTS idx_rate_item_material_boq
  ON rate_item(rate_file_id, item_type, material_name, unit_type);

CREATE INDEX IF NOT EXISTS idx_rate_material_attribute_project_material
  ON rate_material_attribute(project_id, material_name, name);

CREATE INDEX IF NOT EXISTS idx_rate_material_attribute_value_attribute
  ON rate_material_attribute_value(attribute_id, value);
