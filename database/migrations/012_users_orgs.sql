-- Clerk is authentication only. Company/membership/role/invitation data lives
-- entirely here — no Clerk Organizations calls anywhere in the app.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_user (
  id text PRIMARY KEY,               -- Clerk user id, used as-is everywhere
  email text NOT NULL CHECK (btrim(email) <> ''),
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  domain text,
  registration_type text CHECK (registration_type IN ('PV','BR','NONE')),
  registration_number text,
  tax_id text,
  country text NOT NULL DEFAULT 'Sri Lanka',
  currency text NOT NULL DEFAULT 'LKR',
  phone text,
  founder_user_id text NOT NULL REFERENCES app_user(id),
  needs_duplicate_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Case-insensitive: "Acme.com" and "acme.com" are the same domain for the
-- duplicate-company review this table exists to support.
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_domain_ci
  ON company (lower(domain)) WHERE domain IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_registration_number_ci
  ON company (lower(registration_number)) WHERE registration_number IS NOT NULL;

-- One company per user (spec decision: no org switcher) is enforced here,
-- not just in application code — UNIQUE(user_id) alone, not
-- UNIQUE(company_id, user_id), so a user cannot hold membership rows in two
-- companies at once.
CREATE TABLE IF NOT EXISTS company_member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_user(id),
  role text NOT NULL CHECK (btrim(role) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_company_member_company ON company_member(company_id);

CREATE TABLE IF NOT EXISTS former_member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  removed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_former_member_user ON former_member(user_id);

-- token_hash, not the raw token: the plaintext token only ever exists in the
-- emailed invite link, never at rest. Accepting an invite hashes the
-- incoming token the same way and looks up by the hash, the same pattern as
-- a password-reset token.
CREATE TABLE IF NOT EXISTS invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (btrim(email) <> ''),
  role text NOT NULL CHECK (btrim(role) <> ''),
  workspace_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(workspace_ids) = 'array'),
  invited_by_user_id text NOT NULL REFERENCES app_user(id),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitation_company ON invitation(company_id);

ALTER TABLE project ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES company(id);
ALTER TABLE project ADD COLUMN IF NOT EXISTS created_by_user_id text REFERENCES app_user(id);
CREATE INDEX IF NOT EXISTS idx_project_company ON project(company_id);

CREATE TABLE IF NOT EXISTS project_member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_user(id),
  role_override text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
