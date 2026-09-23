DELETE FROM rate_item;

ALTER TABLE rate_item
  DROP COLUMN IF EXISTS specification,
  DROP COLUMN IF EXISTS size,
  DROP COLUMN IF EXISTS unit_cost,
  DROP COLUMN IF EXISTS markup_percent,
  DROP COLUMN IF EXISTS custom_unit,
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'material',
  ADD COLUMN IF NOT EXISTS main_item text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS material_type text,
  ADD COLUMN IF NOT EXISTS labour_name text,
  ADD COLUMN IF NOT EXISTS labour_group text,
  ADD COLUMN IF NOT EXISTS machinery_name text,
  ADD COLUMN IF NOT EXISTS machinery_source text,
  ADD COLUMN IF NOT EXISTS unit_detail text,
  ADD COLUMN IF NOT EXISTS rate numeric(14, 4) NOT NULL DEFAULT 0;

ALTER TABLE rate_item
  ALTER COLUMN material_name DROP NOT NULL,
  ALTER COLUMN item_type DROP DEFAULT,
  ALTER COLUMN main_item DROP DEFAULT,
  ALTER COLUMN rate DROP DEFAULT;

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
        'rate_item_rate_check',
        'rate_item_material_name_check',
        'rate_item_labour_name_check',
        'rate_item_machinery_name_check',
        'rate_item_main_item_check',
        'rate_item_unit_type_check'
      )
  LOOP
    EXECUTE format('ALTER TABLE rate_item DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE rate_item
  ADD CONSTRAINT rate_item_type_check CHECK (item_type IN ('material', 'labour', 'machinery')),
  ADD CONSTRAINT rate_item_rate_check CHECK (rate >= 0),
  ADD CONSTRAINT rate_item_material_name_check CHECK (item_type <> 'material' OR length(trim(material_name)) > 0),
  ADD CONSTRAINT rate_item_labour_name_check CHECK (item_type <> 'labour' OR length(trim(labour_name)) > 0),
  ADD CONSTRAINT rate_item_machinery_name_check CHECK (item_type <> 'machinery' OR length(trim(machinery_name)) > 0),
  ADD CONSTRAINT rate_item_main_item_check CHECK (length(trim(main_item)) > 0),
  ADD CONSTRAINT rate_item_unit_type_check CHECK (length(trim(unit_type)) > 0);

DELETE FROM rate_option
WHERE option_type NOT IN (
  'main_item',
  'material_name',
  'supplier',
  'brand',
  'material_type',
  'labour_name',
  'labour_group',
  'machinery_name',
  'machinery_source',
  'unit_type'
);

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
      'material_type',
      'labour_name',
      'labour_group',
      'machinery_name',
      'machinery_source',
      'unit_type'
    )
  );

DROP INDEX IF EXISTS idx_rate_item_rate_file;
CREATE INDEX IF NOT EXISTS idx_rate_item_rate_file
  ON rate_item(rate_file_id, main_item, item_type);

CREATE INDEX IF NOT EXISTS idx_rate_item_material_boq
  ON rate_item(rate_file_id, item_type, material_name, unit_type);
