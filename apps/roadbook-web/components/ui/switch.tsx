"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface SwitchProps extends Omit<React.ComponentProps<"button">, "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function Switch({
  checked,
  className,
  disabled,
  onCheckedChange,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      data-slot="switch"
      className={cn("ui-switch", className)}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span className="ui-switch__thumb" aria-hidden="true" />
    </button>
  );
}
