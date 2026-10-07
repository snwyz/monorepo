"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

const placements = {
  top: ["top", "center"], topLeft: ["top", "start"], topRight: ["top", "end"],
  bottom: ["bottom", "center"], bottomLeft: ["bottom", "start"], bottomRight: ["bottom", "end"],
  left: ["left", "center"], leftTop: ["left", "start"], leftBottom: ["left", "end"],
  right: ["right", "center"], rightTop: ["right", "start"], rightBottom: ["right", "end"],
} as const;

export type PopoverPlacement = keyof typeof placements;
type PopoverContentProps = Omit<ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>, "side" | "align"> & {
  placement?: PopoverPlacement;
};

// 通用浮层只负责锚点、碰撞避让和交互生命周期，不依赖业务领域。
export const PopoverContent = forwardRef<ElementRef<typeof PopoverPrimitive.Content>, PopoverContentProps>(
  function PopoverContent({ placement = "bottom", sideOffset = 8, collisionPadding = 16, children, ...props }, ref) {
    const [side, align] = placements[placement];
    return <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content ref={ref} side={side} align={align} sideOffset={sideOffset} collisionPadding={collisionPadding} {...props}>
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>;
  },
);
