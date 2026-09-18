"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { CloseIcon } from "@/components/ui/icons";

interface MapControlPointDeleteActionProps {
  pointName: string | null;
  onDelete: () => void;
}

export function MapControlPointDeleteAction({
  pointName,
  onDelete,
}: MapControlPointDeleteActionProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {pointName ? (
        <motion.button
          key="map-control-point-delete-action"
          type="button"
          className="map-control-point-delete-action"
          aria-label={`删除点位：${pointName}`}
          aria-keyshortcuts="Backspace Delete"
          title="删除点位（Backspace / Delete）"
          initial={prefersReducedMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.72, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={prefersReducedMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.72, y: 8 }}
          transition={prefersReducedMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 480, damping: 30 }}
          onClick={onDelete}
        >
          <CloseIcon />
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
