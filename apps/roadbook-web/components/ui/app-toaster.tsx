"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import {
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";

import {
  appToast,
  type ToastRecord,
  useToastRecords,
} from "@/components/ui/toast-store";
import { cn } from "@/lib/utils";

const DEFAULT_DURATION_MS = 4_500;
const PERSISTENT_DURATION_MS = 2_147_483_647;

const variantIcon = {
  info: InfoIcon,
  success: CircleCheckIcon,
  loading: LoaderCircleIcon,
  fail: CircleXIcon,
} satisfies Record<ToastRecord["variant"], typeof InfoIcon>;

const variantLabel = {
  info: "提示",
  success: "成功",
  loading: "处理中",
  fail: "失败",
} satisfies Record<ToastRecord["variant"], string>;

function AppToast({ record }: { record: ToastRecord }) {
  const Icon = variantIcon[record.variant];
  const loading = record.variant === "loading";

  return (
    <ToastPrimitive.Root data-glass="overlay"
      className={cn(
        "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border border-border bg-background p-4 pr-10 text-foreground shadow-lg",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80",
        "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=end]:animate-out data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]",
        "data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full",
      )}
      duration={
        record.duration ??
        (loading ? PERSISTENT_DURATION_MS : DEFAULT_DURATION_MS)
      }
      open
      onOpenChange={(open) => {
        if (!open) appToast.dismiss(record.id);
      }}
      type={record.variant === "fail" ? "foreground" : "background"}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-5",
          record.variant === "success" && "text-[var(--rb-color-success)]",
          record.variant === "fail" && "text-destructive",
          record.variant === "info" && "text-muted-foreground",
          loading && "animate-spin text-muted-foreground",
        )}
      />
      <div className="grid min-w-0 flex-1 gap-1">
        <ToastPrimitive.Title className="text-sm font-medium leading-5">
          <span className="sr-only">{variantLabel[record.variant]}：</span>
          {record.message}
        </ToastPrimitive.Title>
        {record.description ? (
          <ToastPrimitive.Description className="text-xs leading-5 text-muted-foreground">
            {record.description}
          </ToastPrimitive.Description>
        ) : null}
      </div>
      <ToastPrimitive.Close
        aria-label="关闭通知"
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-muted hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <XIcon className="size-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

export function AppToaster() {
  const records = useToastRecords();

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {records.map((record) => (
        <AppToast key={record.id} record={record} />
      ))}
      <ToastPrimitive.Viewport
        className="fixed left-1/2 top-[10%] z-[2147483647] flex max-h-[calc(100dvh-32px)] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2"
        aria-label="通知"
      />
    </ToastPrimitive.Provider>
  );
}
