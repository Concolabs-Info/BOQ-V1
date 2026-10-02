BEGIN;

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

INSERT INTO rate_option(project_id, option_type, value)
SELECT rate_option.project_id, target.option_type, rate_option.value
FROM rate_option
CROSS JOIN (
  VALUES
    ('material_unit_type'),
    ('labour_unit_type'),
    ('machinery_unit_type')
) AS target(option_type)
WHERE rate_option.option_type = 'unit_type'
ON CONFLICT(project_id, option_type, value) DO NOTHING;

DELETE FROM rate_option
WHERE option_type = 'unit_type';

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
      'material_unit_type',
      'labour_unit_type',
      'machinery_unit_type'
    )
  );

COMMIT;
