-- Clerk application invitation id so we can resend/revoke without Organizations or Resend.
ALTER TABLE invitation ADD COLUMN IF NOT EXISTS clerk_invitation_id text;
