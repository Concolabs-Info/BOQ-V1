"use client"

import * as React from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"

function PasswordInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  const [reveal, setReveal] = React.useState(false)

  return (
    <div className="relative">
      <Input type={reveal ? "text" : "password"} className={cn("pr-9", className)} {...props} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setReveal((value) => !value)}
        aria-label={reveal ? "Hide password" : "Show password"}
        aria-pressed={reveal}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {reveal ? <EyeOffIcon className="size-4" aria-hidden /> : <EyeIcon className="size-4" aria-hidden />}
      </button>
    </div>
  )
}

export { PasswordInput }
