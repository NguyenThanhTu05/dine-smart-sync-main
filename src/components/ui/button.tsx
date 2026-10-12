import { touchFeedback } from "@/lib/motion";
import { Loader2 } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
import { type VariantProps } from "class-variance-authority";
import * as React from "react";
import { buttonVariants } from "./button-variants";

import { cn } from "@/lib/utils";



export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  busy?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, busy = false, children, onPointerDown, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} disabled={disabled || busy} aria-busy={busy || props["aria-busy"]} onPointerDown={event => { onPointerDown?.(event); if (!event.defaultPrevented) touchFeedback(event); }}>
      {asChild ? children : <><span className="motion-button-label">{children}</span>{busy && <span className="motion-button-spinner"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/></span>}</>}
    </Comp>;
  },
);
Button.displayName = "Button";

export { Button };
