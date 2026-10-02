ALTER TABLE rate_item
  ALTER COLUMN rate DROP NOT NULL;

UPDATE rate_item
SET rate = NULL
WHERE item_type = 'percentage';

ALTER TABLE rate_item
  DROP CONSTRAINT IF EXISTS rate_item_rate_check;

ALTER TABLE rate_item
  ADD CONSTRAINT rate_item_rate_check CHECK (
    (item_type = 'percentage' AND rate IS NULL)
    OR (item_type <> 'percentage' AND rate IS NOT NULL AND rate >= 0)
  );
