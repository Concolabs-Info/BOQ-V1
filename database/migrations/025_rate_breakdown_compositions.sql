DELETE FROM rate_breakdown_item;

ALTER TABLE rate_breakdown_item
  ADD COLUMN IF NOT EXISTS norm_group_id uuid,
  ADD COLUMN IF NOT EXISTS rate_file_id uuid,
  ADD COLUMN IF NOT EXISTS main_item_name text,
  ADD COLUMN IF NOT EXISTS analysis_quantity numeric(12, 4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS analysis_unit text NOT NULL DEFAULT 'cube',
  ALTER COLUMN title DROP NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'rate_breakdown_item'::regclass
      AND contype IN ('c', 'f')
      AND conname IN (
        'rate_breakdown_item_title_check',
        'rate_breakdown_item_norm_group_id_fkey',
        'rate_breakdown_item_rate_file_id_fkey',
        'rate_breakdown_item_main_item_name_check',
        'rate_breakdown_item_analysis_quantity_check',
        'rate_breakdown_item_analysis_unit_check'
      )
  LOOP
    EXECUTE format('ALTER TABLE rate_breakdown_item DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE rate_breakdown_item
  ADD CONSTRAINT rate_breakdown_item_norm_group_id_fkey FOREIGN KEY (norm_group_id) REFERENCES norm_group(id) ON DELETE SET NULL,
  ADD CONSTRAINT rate_breakdown_item_rate_file_id_fkey FOREIGN KEY (rate_file_id) REFERENCES rate_file(id) ON DELETE SET NULL,
  ADD CONSTRAINT rate_breakdown_item_main_item_name_check CHECK (length(trim(COALESCE(main_item_name, title, ''))) > 0),
  ADD CONSTRAINT rate_breakdown_item_analysis_quantity_check CHECK (analysis_quantity > 0),
  ADD CONSTRAINT rate_breakdown_item_analysis_unit_check CHECK (length(trim(analysis_unit)) > 0);

CREATE TABLE IF NOT EXISTS rate_breakdown_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_breakdown_item_id uuid NOT NULL REFERENCES rate_breakdown_item(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  description text NOT NULL,
  unit text,
  quantity numeric(12, 4) NOT NULL,
  rate_item_id uuid REFERENCES rate_item(id) ON DELETE SET NULL,
  selected_rate_label text,
  selected_rate numeric(14, 4),
  amount numeric(14, 4),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (item_type IN ('material', 'labor', 'machinery', 'percentage')),
  CHECK (length(trim(description)) > 0),
  CHECK (quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_rate_breakdown_row_parent_order
  ON rate_breakdown_row(rate_breakdown_item_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_rate_breakdown_row_project
  ON rate_breakdown_row(project_id, item_type);
