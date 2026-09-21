ALTER TABLE rate_item
  ADD COLUMN IF NOT EXISTS specification text,
  ADD COLUMN IF NOT EXISTS size text;

UPDATE rate_item
SET specification = specification_size
WHERE specification IS NULL
  AND specification_size IS NOT NULL;

ALTER TABLE rate_item
  DROP COLUMN IF EXISTS specification_size;
