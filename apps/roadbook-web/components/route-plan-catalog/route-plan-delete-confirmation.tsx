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

interface RoutePlanDeleteConfirmationProps {
  open: boolean;
  planLabel: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function RoutePlanDeleteConfirmation({
  open,
  planLabel,
  onOpenChange,
  onConfirm,
}: RoutePlanDeleteConfirmationProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认要删除此规划路线吗？</AlertDialogTitle>
          <AlertDialogDescription>
            {planLabel ? `“${planLabel}”` : "此规划路线"}删除后将从当前浏览器移除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            className="text-destructive hover:border-destructive hover:bg-accent hover:text-destructive"
            onClick={onConfirm}
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
