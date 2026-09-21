import { QuantoMark } from "@/features/onboarding/components/formBits";

export function BrandLockup() {
  return (
    <div className="flex items-center gap-2">
      <QuantoMark className="size-8" />
      <div className="grid text-left text-sm leading-tight">
        <span className="font-medium text-slate-950">Quanto</span>
        <span className="text-xs text-slate-500">BOQ production workspace</span>
      </div>
    </div>
  );
}
