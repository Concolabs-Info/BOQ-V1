"use client";

import { FormEvent, useRef, useState } from "react";
import { useReverification } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { Button } from "@/shared/components/Button";
import { AuthField } from "@/features/auth/components/AuthField";
import { SecuredByClerk } from "@/features/auth/components/SecuredByClerk";
import { thrownErrText } from "@/features/auth/clerk-errors";
import { LoadingState } from "@/shared/components/LoadingState";
import { SettingsCard, SettingsStack } from "./SettingsCard";
import { useClerkAccount } from "./useClerkAccount";
import { useReverificationPrompt } from "./useReverificationPrompt";
import { ClerkAvatar } from "@/features/platform/components/NavUser";
import { useAccess } from "@/features/platform/hooks/useAccess";

export function AccountProfileForm() {
  const { user, loaded, refresh } = useClerkAccount();
  const { roleLabel, roleDescription } = useAccess();
  const fileRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [syncedUserId, setSyncedUserId] = useState(user?.id);
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);

  // Adding, removing, or changing the primary email is a sensitive action -
  // Clerk requires the session to be freshly reverified before allowing it,
  // and rejects the call outright if it isn't wrapped like this. Each gets
  // its own prompt (with its own explanation) instead of Clerk's default
  // modal, since only one of these can ever be in flight at a time.
  const addEmailReverify = useReverificationPrompt("add this email address");
  const primaryEmailReverify = useReverificationPrompt("change your primary email");
  const removeEmailReverify = useReverificationPrompt("remove this email address");
  const createEmailAddress = useReverification((email: string) => user?.createEmailAddress({ email }), addEmailReverify.options);
  const setPrimaryEmail = useReverification(
    (emailAddressId: string) => user?.update({ primaryEmailAddressId: emailAddressId }),
    primaryEmailReverify.options,
  );
  const destroyEmailAddress = useReverification((emailAddressId: string) => {
    const address = user?.emailAddresses.find((item) => item.id === emailAddressId);
    return address?.destroy();
  }, removeEmailReverify.options);

  if (user && user.id !== syncedUserId) {
    setSyncedUserId(user.id);
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
  }

  const displayName = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "Your profile";
  const emails = user?.emailAddresses ?? [];
  const ready = loaded && Boolean(user);

  async function run(action: () => Promise<unknown>) {
    if (!user) return;
    setBusy(true);
    try {
      await action();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setProfileError(null);
    try {
      await run(() =>
        user.update({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      );
    } catch (err) {
      setProfileError(thrownErrText(err));
    }
  }

  async function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;
    const preview = URL.createObjectURL(file);
    setProfileError(null);
    setLocalPhoto(preview);
    try {
      await run(() => user.setProfileImage({ file }));
    } catch (err) {
      setProfileError(thrownErrText(err));
    } finally {
      URL.revokeObjectURL(preview);
      setLocalPhoto(null);
    }
  }

  async function removePhoto() {
    if (!user) return;
    setProfileError(null);
    setLocalPhoto(null);
    try {
      await run(() => user.setProfileImage({ file: null }));
    } catch (err) {
      setProfileError(thrownErrText(err));
    }
  }

  function reportEmailError(err: unknown) {
    if (isReverificationCancelledError(err)) return;
    setEmailError(thrownErrText(err));
  }

  async function startAddEmail(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setEmailError(null);
    const email = newEmail.trim();
    if (!email) return;
    try {
      const created = await createEmailAddress(email);
      if (!created) return;
      await created.prepareVerification({ strategy: "email_code" });
      setVerifyId(created.id);
      setCode("");
      await refresh();
    } catch (err) {
      reportEmailError(err);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!user || !verifyId) return;
    setEmailError(null);
    const address = user.emailAddresses.find((item) => item.id === verifyId);
    if (!address) return;
    try {
      await address.attemptVerification({ code: code.trim() });
      setVerifyId(null);
      setNewEmail("");
      setAdding(false);
      setCode("");
      await refresh();
    } catch (err) {
      setEmailError(thrownErrText(err));
    }
  }

  async function resendCode(id: string) {
    if (!user) return;
    setEmailError(null);
    const address = user.emailAddresses.find((item) => item.id === id);
    if (!address) return;
    try {
      await address.prepareVerification({ strategy: "email_code" });
      setVerifyId(id);
      setCode("");
    } catch (err) {
      setEmailError(thrownErrText(err));
    }
  }

  async function makePrimary(id: string) {
    if (!user) return;
    setEmailError(null);
    try {
      await run(() => setPrimaryEmail(id));
    } catch (err) {
      reportEmailError(err);
    }
  }

  async function removeEmail(id: string) {
    if (!user) return;
    setEmailError(null);
    const address = user.emailAddresses.find((item) => item.id === id);
    if (!address) return;
    try {
      await destroyEmailAddress(id);
      if (verifyId === id) {
        setVerifyId(null);
        setCode("");
      }
      await refresh();
    } catch (err) {
      reportEmailError(err);
    }
  }

  if (!loaded) return <LoadingState label="Loading account" />;
  if (!user) return <p className="text-sm text-slate-500">Sign in to manage your account.</p>;

  return (
    <SettingsStack>
      <SettingsCard
        title="Profile photo"
        description="Shown on the sidebar and to people in your company."
        footerHint="Square images work best."
        footer={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="rounded-xl" disabled={!ready || busy} onClick={() => fileRef.current?.click()}>
              Update photo
            </Button>
            {user.hasImage ? (
              <Button type="button" variant="danger" className="rounded-xl" disabled={!ready || busy} onClick={() => void removePhoto()}>
                Remove
              </Button>
            ) : null}
          </div>
        }
      >
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onPickPhoto} />
        {profileError ? <p className="mb-3 text-sm text-red-600">{profileError}</p> : null}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <ClerkAvatar
              imageUrl={localPhoto ?? (user.hasImage ? user.imageUrl : null)}
              cacheKey={localPhoto ? null : user.updatedAt}
              name={displayName}
              email={user.primaryEmailAddress?.emailAddress}
              className="size-14 text-base"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-950">{displayName}</p>
              <p className="truncate text-xs text-slate-500">{user.primaryEmailAddress?.emailAddress}</p>
            </div>
          </div>
          {roleLabel ? (
            <div className="min-w-0 sm:max-w-sm sm:text-right">
              <p className="truncate font-medium text-slate-950">{roleLabel}</p>
              {roleDescription ? <p className="mt-0.5 text-sm leading-6 text-slate-500">{roleDescription}</p> : null}
            </div>
          ) : null}
        </div>
      </SettingsCard>

      <form onSubmit={(event) => void saveProfile(event)}>
        <SettingsCard
          title="Name"
          description="Your first and last name on Quanto."
          footerHint="This is how members will see you."
          footer={
            <Button type="submit" className="rounded-xl" disabled={!ready || busy} pending={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <AuthField
              id="acct-first"
              label="First name"
              autoComplete="given-name"
              required
              value={firstName}
              disabled={!ready || busy}
              onChange={(event) => setFirstName(event.target.value)}
            />
            <AuthField
              id="acct-last"
              label="Last name"
              autoComplete="family-name"
              required
              value={lastName}
              disabled={!ready || busy}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
        </SettingsCard>
      </form>

      <SettingsCard title="Email addresses" description="Used to sign in and for account recovery." footerHint="Keep at least one verified address.">
        {emailError ? <p className="mb-3 text-sm text-red-600">{emailError}</p> : null}
        <ul className="flex flex-col gap-2">
          {emails.map((item) => {
            const primary = item.id === user.primaryEmailAddressId;
            const verified = item.verification?.status === "verified";
            return (
              <li key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {primary ? (
                    <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-slate-600">
                      Primary
                    </span>
                  ) : null}
                  {!verified ? (
                    <span className="shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-slate-500">
                      Unverified
                    </span>
                  ) : null}
                  <p className="min-w-0 truncate text-sm text-slate-950">{item.emailAddress}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {!verified ? (
                    <button type="button" className="text-xs font-medium text-blue-700 hover:text-blue-800" onClick={() => void resendCode(item.id)}>
                      Send code
                    </button>
                  ) : null}
                  {!primary && verified ? (
                    <button type="button" className="text-xs font-medium text-blue-700 hover:text-blue-800" onClick={() => void makePrimary(item.id)}>
                      Set as primary
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-40"
                    disabled={primary && emails.length === 1}
                    onClick={() => void removeEmail(item.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {verifyId ? (
          <form className="mt-4 flex flex-col gap-4" onSubmit={(event) => void submitCode(event)}>
            <AuthField
              id="acct-email-code"
              label="Verification code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="rounded-xl" disabled={code.trim().length < 6}>
                Verify email
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                onClick={() => {
                  setVerifyId(null);
                  setCode("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : adding ? (
          <form className="mt-4 flex flex-col gap-4" onSubmit={(event) => void startAddEmail(event)}>
            <AuthField
              id="acct-new-email"
              label="New email"
              type="email"
              autoComplete="email"
              required
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="rounded-xl" disabled={!newEmail.trim()}>
                Send code
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                onClick={() => {
                  setAdding(false);
                  setNewEmail("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="mt-4 self-start text-sm font-medium text-blue-700 underline underline-offset-2 hover:no-underline"
            onClick={() => setAdding(true)}
          >
            + Add email address
          </button>
        )}
      </SettingsCard>

      <SecuredByClerk />
      {addEmailReverify.dialog}
      {primaryEmailReverify.dialog}
      {removeEmailReverify.dialog}
    </SettingsStack>
  );
}
