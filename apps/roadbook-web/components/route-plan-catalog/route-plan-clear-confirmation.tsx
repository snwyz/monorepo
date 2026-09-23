"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RoutePlanClearConfirmationProps {
  open: boolean;
  routeCount: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function RoutePlanClearConfirmation({
  open,
  routeCount,
  onOpenChange,
  onConfirm,
}: RoutePlanClearConfirmationProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认要清除全部规划路线吗？</AlertDialogTitle>
          <AlertDialogDescription>
            当前浏览器中的 {routeCount} 条暂存路线将被全部移除，清除后无法恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            className="text-destructive hover:border-destructive hover:bg-accent hover:text-destructive"
            onClick={onConfirm}
          >
            全部清除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
