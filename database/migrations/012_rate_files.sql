CREATE TABLE IF NOT EXISTS rate_file (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS rate_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_file_id uuid NOT NULL REFERENCES rate_file(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit_cost numeric(14, 4) NOT NULL CHECK (unit_cost >= 0),
  markup_percent numeric(7, 3) NOT NULL DEFAULT 0 CHECK (markup_percent >= 0),
  unit_type text NOT NULL CHECK (unit_type IN ('m', 'm2', 'm3', 'nr', 'kg', 'ton', 'bag', 'sheet', 'litre', 'custom')),
  custom_unit text,
  element_category text NOT NULL CHECK (element_category IN ('columns', 'beams', 'slab', 'floor', 'ceiling', 'doors_windows', 'walls', 'roof', 'stairs_ramps', 'foundation')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((unit_type = 'custom' AND custom_unit IS NOT NULL AND length(trim(custom_unit)) > 0) OR (unit_type <> 'custom' AND custom_unit IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_rate_file_project ON rate_file(project_id, updated_at DESC);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'rate_item'
      AND column_name = 'name'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_rate_item_rate_file ON rate_item(rate_file_id, element_category, name);
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'rate_item'
      AND column_name = 'material_name'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_rate_item_rate_file ON rate_item(rate_file_id, element_category, material_name);
  END IF;
END $$;
