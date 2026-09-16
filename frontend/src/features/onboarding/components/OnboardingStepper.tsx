import { FLOW_STEPS } from "../types";

type StepState = "done" | "active" | "upcoming";

export function OnboardingStepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-col">
      {FLOW_STEPS.map((step, index) => {
        const state: StepState = index < current ? "done" : index === current ? "active" : "upcoming";
        const last = index === FLOW_STEPS.length - 1;
        return (
          <li key={step.title} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`relative grid size-[18px] shrink-0 place-items-center rounded-full border ${
                  state === "upcoming" ? "border-slate-600" : "border-blue-500"
                } ${state === "done" ? "bg-blue-600" : ""}`}
              >
                {state === "done" ? (
                  <svg viewBox="0 0 12 12" className="size-2.5 text-white">
                    <path d="M2.5 6.2 4.8 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
                {state === "active" ? <span className="size-1.5 rounded-full bg-blue-500" /> : null}
              </span>
              {last ? null : (
                <div className="relative my-1 w-px flex-1 bg-slate-700">
                  <div className={`absolute inset-x-0 top-0 h-full origin-top bg-blue-600 ${index < current ? "scale-y-100" : "scale-y-0"}`} />
                </div>
              )}
            </div>
            <div className={last ? "pb-0" : "pb-7"}>
              <p className={`text-sm font-medium leading-none ${state === "upcoming" ? "text-slate-500" : "text-white"}`}>
                {step.title}
              </p>
              <p className="mt-1.5 text-xs text-slate-500">{step.blurb}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function BrandRailNote() {
  return (
    <div className="flex max-w-[19rem] flex-col gap-3">
      <p className="text-lg font-medium leading-snug tracking-tight text-slate-100">
        Automated BOQ takeoff for construction estimating teams.
      </p>
      <p className="text-sm leading-6 text-slate-400">
        Upload drawings, run the takeoff, price the bill. One workspace per project.
      </p>
    </div>
  );
}
