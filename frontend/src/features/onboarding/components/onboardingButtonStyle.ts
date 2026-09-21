/**
 * "3D" look for primary CTA buttons in the onboarding flow (sign-in,
 * sign-up, and every onboarding step) — a top-lit gradient with a soft
 * colored glow underneath, keeping the button's normal (non-pill) corner
 * radius. `active:` (built into the shared Button component) already
 * nudges the button down a pixel on press; this dims it and softens the
 * glow to match.
 */
export const onboarding3dButton =
  "bg-gradient-to-b from-[color-mix(in_oklch,var(--primary),white_18%)] to-[color-mix(in_oklch,var(--primary),black_8%)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-1px_0_0_rgba(0,0,0,0.08),0_3px_8px_-4px_color-mix(in_oklch,var(--primary),transparent_60%)] transition-[filter,box-shadow] hover:brightness-105 active:translate-y-px active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)] active:brightness-95";

/**
 * Same idea, toned down for secondary/outline buttons — a faint white-to-
 * off-white gradient and a much softer shadow, so it reads as subtly
 * raised next to a primary button without competing with it.
 */
export const onboarding3dButtonSecondary =
  "bg-gradient-to-b from-[color-mix(in_oklch,var(--background),white_60%)] to-[color-mix(in_oklch,var(--background),black_3%)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_1px_2px_rgba(15,23,42,0.05)] transition-[filter,box-shadow] hover:brightness-[0.98] active:translate-y-px active:shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)] active:brightness-95";
