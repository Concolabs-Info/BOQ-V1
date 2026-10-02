DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'rate_item'
      AND column_name = 'name'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'rate_item'
      AND column_name = 'material_name'
  ) THEN
    ALTER TABLE rate_item RENAME COLUMN name TO material_name;
  END IF;
END $$;

ALTER TABLE rate_item
  ADD COLUMN IF NOT EXISTS specification_size text;

DROP INDEX IF EXISTS idx_rate_item_rate_file;
CREATE INDEX IF NOT EXISTS idx_rate_item_rate_file ON rate_item(rate_file_id, element_category, material_name);
