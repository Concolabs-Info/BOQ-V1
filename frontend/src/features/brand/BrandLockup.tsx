import { QuantoMark } from "@/features/onboarding/components/formBits";

export function BrandLockup() {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <QuantoMark className="size-7 shrink-0 sm:size-8" />
      <div className="grid min-w-0 text-left text-sm leading-tight">
        <span className="truncate font-medium text-slate-950">Quanto</span>
        <span className="hidden truncate text-xs text-slate-500 sm:block">BOQ production workspace</span>
      </div>
    </div>
  );
}
