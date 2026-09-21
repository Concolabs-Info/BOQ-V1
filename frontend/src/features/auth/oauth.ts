import { appRoutes } from "@/shared/constants/appRoutes";

export const OAUTH_GOOGLE = "oauth_google" as const;
export const OAUTH_MICROSOFT = "oauth_microsoft" as const;

export type OAuthStrategy = typeof OAUTH_GOOGLE | typeof OAUTH_MICROSOFT;

export const OFFERED_OAUTH_STRATEGIES: OAuthStrategy[] = [OAUTH_GOOGLE, OAUTH_MICROSOFT];

export const oauthPaths = {
  signInCallback: "/sign-in/sso-callback",
  signUpCallback: "/sign-up/sso-callback",
  continueSignUp: "/sign-up/continue",
} as const;

type ClerkLike = {
  client: {
    signIn: { authenticateWithRedirect: (params: OAuthRedirectParams) => Promise<void> };
    signUp: { authenticateWithRedirect: (params: OAuthRedirectParams) => Promise<void> };
  };
};

type OAuthRedirectParams = {
  strategy: OAuthStrategy;
  redirectUrl: string;
  redirectUrlComplete: string;
  legalAccepted: boolean;
  oidcPrompt?: string;
};

/**
 * Start Google or Microsoft SSO. Clerk copies name, email, and photo from
 * the provider. After the IdP returns, `/sign-in/sso-callback` or
 * `/sign-up/sso-callback` finishes the attempt and sends new users to
 * onboarding (company creation) and returning users to the app.
 */
export async function startOAuthRedirect(
  clerk: ClerkLike,
  options: {
    strategy: OAuthStrategy;
    intent: "sign-in" | "sign-up";
    completePath?: string;
    selectAccount?: boolean;
  },
): Promise<void> {
  const redirectUrl = options.intent === "sign-up" ? oauthPaths.signUpCallback : oauthPaths.signInCallback;
  const redirectUrlComplete =
    options.intent === "sign-up" ? appRoutes.onboarding : (options.completePath ?? appRoutes.projects);

  const params: OAuthRedirectParams = {
    strategy: options.strategy,
    redirectUrl,
    redirectUrlComplete,
    legalAccepted: true,
    ...(options.selectAccount ? { oidcPrompt: "select_account" } : {}),
  };

  if (options.intent === "sign-up") {
    await clerk.client.signUp.authenticateWithRedirect(params);
    return;
  }
  await clerk.client.signIn.authenticateWithRedirect(params);
}

export function oauthCallbackHadError(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const error = params.get("error") ?? params.get("clerk_error");
  if (!error) return null;
  const denied = /access_denied|cancelled|canceled|user_denied/i.test(error);
  return denied ? "cancelled" : "failed";
}

type SocialProvider = {
  enabled?: boolean;
  authenticatable?: boolean;
  strategy?: string;
};

type ClerkSocialEnv = {
  __unstable__environment?: {
    userSettings?: {
      social?: Record<string, SocialProvider>;
      authenticatableSocialStrategies?: string[];
    };
  };
  environment?: {
    userSettings?: {
      social?: Record<string, SocialProvider>;
      authenticatableSocialStrategies?: string[];
    };
  };
};

/**
 * Clerk can list a provider as enabled without allowing it as a sign-in
 * strategy. Calling authenticateWithRedirect then returns "does not match
 * one of the allowed values for parameter strategy". Buttons stay visible;
 * this check only blocks the API call until the instance allows the provider.
 */
export function isOAuthStrategyAllowed(clerk: object, strategy: OAuthStrategy): boolean {
  const settings =
    (clerk as ClerkSocialEnv).__unstable__environment?.userSettings ??
    (clerk as ClerkSocialEnv).environment?.userSettings;
  if (!settings) return true;

  if (settings.authenticatableSocialStrategies?.length) {
    return settings.authenticatableSocialStrategies.includes(strategy);
  }

  const provider = settings.social?.[strategy];
  if (!provider) return true;
  return Boolean(provider.enabled && provider.authenticatable);
}

export function isOauthSignUpAttempt(signUp: {
  verifications?: { externalAccount?: { status?: string | null } | null };
}): boolean {
  const status = signUp.verifications?.externalAccount?.status;
  return Boolean(status && status !== "expired");
}
