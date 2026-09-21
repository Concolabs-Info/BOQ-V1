import { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  pending?: boolean;
};

export function Button({ className = "", variant = "primary", pending = false, disabled, children, ...props }: ButtonProps) {
  const variants = {
    primary: "bg-primary text-white hover:bg-blue-700",
    secondary: "border border-border bg-white text-ink hover:bg-slate-50",
    ghost: "text-ink hover:bg-slate-100",
    danger: "bg-red-600 text-white hover:bg-red-700"
  };
  return (
    <button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`}
    >
      {pending ? (
        <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}
