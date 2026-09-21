-- Company profile photo, uploaded from Settings only.
ALTER TABLE company ADD COLUMN IF NOT EXISTS logo_storage_key text;
