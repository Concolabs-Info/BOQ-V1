-- Keep a record when a company is deleted so leftover Clerk accounts can still
-- be invited, or set up a new company, instead of looking like first-time users.
ALTER TABLE former_member
  ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE former_member
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT 'removed';

ALTER TABLE former_member DROP CONSTRAINT IF EXISTS former_member_reason_check;
ALTER TABLE former_member ADD CONSTRAINT former_member_reason_check
  CHECK (reason IN ('removed', 'company_deleted', 'left'));

ALTER TABLE former_member DROP CONSTRAINT IF EXISTS former_member_company_id_fkey;
ALTER TABLE former_member
  ADD CONSTRAINT former_member_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE SET NULL;

UPDATE former_member fm
SET company_name = c.name
FROM company c
WHERE fm.company_id = c.id
  AND (fm.company_name IS NULL OR btrim(fm.company_name) = '');

-- Soft-delete so inviting that email later can create a fresh Clerk invite
-- instead of treating a deleted account as an in-app leftover.
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- One open invite per email across the product (one company per person).
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY lower(email) ORDER BY created_at DESC) AS rn
  FROM invitation
  WHERE status = 'pending'
)
UPDATE invitation
SET status = 'revoked'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invitation_pending_email
  ON invitation (lower(email)) WHERE status = 'pending';
