DELETE FROM norm_item;

CREATE TABLE IF NOT EXISTS norm_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  main_item_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(main_item_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_norm_group_project_updated
  ON norm_group(project_id, updated_at DESC, created_at DESC);

ALTER TABLE norm_item
  ADD COLUMN IF NOT EXISTS norm_group_id uuid,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ALTER COLUMN unit DROP NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'norm_item'::regclass
      AND contype IN ('c', 'f')
      AND conname IN (
        'norm_item_item_type_check',
        'norm_item_unit_check',
        'norm_item_quantity_check',
        'norm_item_norm_group_id_fkey'
      )
  LOOP
    EXECUTE format('ALTER TABLE norm_item DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE norm_item
  ALTER COLUMN norm_group_id SET NOT NULL,
  ADD CONSTRAINT norm_item_norm_group_id_fkey FOREIGN KEY (norm_group_id) REFERENCES norm_group(id) ON DELETE CASCADE,
  ADD CONSTRAINT norm_item_item_type_check CHECK (item_type IN ('material', 'labor', 'machinery', 'percentage')),
  ADD CONSTRAINT norm_item_quantity_check CHECK (quantity >= 0),
  ADD CONSTRAINT norm_item_unit_check CHECK (item_type = 'percentage' OR length(trim(COALESCE(unit, ''))) > 0);

DROP INDEX IF EXISTS idx_norm_item_project_type;
CREATE INDEX IF NOT EXISTS idx_norm_item_group_order
  ON norm_item(norm_group_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_norm_item_project_type
  ON norm_item(project_id, item_type, sort_order);
