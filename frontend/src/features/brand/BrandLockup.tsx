import { QuantoMark } from "@/features/onboarding/components/formBits";
import { cn } from "@/shared/lib/cn";

export function BrandLockup({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <QuantoMark className="size-8" />
      <div className="grid text-left text-sm leading-tight">
        <span className={cn("font-medium", dark ? "text-white" : "text-slate-950")}>Quanto</span>
        <span className={cn("text-xs", dark ? "text-slate-400" : "text-slate-500")}>BOQ production workspace</span>
      </div>
    </div>
  );
}
