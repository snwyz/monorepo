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

interface ControlPointDeleteConfirmationProps {
  open: boolean;
  pointName: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ControlPointDeleteConfirmation({
  open,
  pointName,
  onOpenChange,
  onConfirm,
}: ControlPointDeleteConfirmationProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认要删除此定位吗？</AlertDialogTitle>
          <AlertDialogDescription>
            {pointName ? `“${pointName}”` : "此定位"}删除后将重新规划路线。
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
