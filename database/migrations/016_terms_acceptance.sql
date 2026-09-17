-- Terms acceptance is per Clerk user, not per company. Invited people agree
-- after creating an account; founders agree after the invite-team step.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS terms_version text;
