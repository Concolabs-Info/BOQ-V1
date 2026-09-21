"use client"

import * as React from "react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"

function LoadingButton({
  pending,
  children,
  className,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pending?: boolean }) {
  return (
    <Button
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cn("gap-2", className)}
      {...props}
    >
      {pending ? (
        <span
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : null}
      {children}
    </Button>
  )
}

export { LoadingButton }
