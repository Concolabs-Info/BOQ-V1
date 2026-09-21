-- Custom roles live in Postgres. Clerk is auth + application invitations only.
CREATE TABLE IF NOT EXISTS company_role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (btrim(key) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permissions) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, key)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_role_name_ci
  ON company_role (company_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_company_role_company ON company_role(company_id);
