"use client";

import { useSyncExternalStore } from "react";

export type ToastVariant = "info" | "success" | "loading" | "fail";
export type ToastId = string;

export interface ToastOptions {
  description?: string;
  duration?: number;
  id?: ToastId;
}

export interface ToastRecord {
  id: ToastId;
  message: string;
  description?: string;
  duration?: number;
  variant: ToastVariant;
}

const TOAST_LIMIT = 4;
const listeners = new Set<() => void>();
let sequence = 0;
let records: ToastRecord[] = [];

function notify() {
  listeners.forEach((listener) => listener());
}

function showToast(
  variant: ToastVariant,
  message: string,
  options: ToastOptions = {},
) {
  const id = options.id ?? `toast-${Date.now()}-${sequence += 1}`;
  const record: ToastRecord = {
    id,
    message,
    description: options.description,
    duration: options.duration,
    variant,
  };
  const existingIndex = records.findIndex((item) => item.id === id);
  records = existingIndex >= 0
    ? records.map((item) => item.id === id ? record : item)
    : [...records, record].slice(-TOAST_LIMIT);
  notify();
  return id;
}

function dismissToast(id?: ToastId) {
  records = id ? records.filter((item) => item.id !== id) : [];
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return records;
}

const emptyServerSnapshot: ToastRecord[] = [];

export function useToastRecords() {
  return useSyncExternalStore(subscribe, getSnapshot, () => emptyServerSnapshot);
}

export const appToast = {
  info: (message: string, options?: ToastOptions) => showToast("info", message, options),
  success: (message: string, options?: ToastOptions) => showToast("success", message, options),
  loading: (message: string, options?: ToastOptions) => showToast("loading", message, options),
  fail: (message: string, options?: ToastOptions) => showToast("fail", message, options),
  dismiss: dismissToast,
};
