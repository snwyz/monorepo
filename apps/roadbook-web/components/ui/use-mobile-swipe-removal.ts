"use client";

import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";

interface SwipeGesture {
  pointerId: number;
  startX: number;
  startY: number;
  isHorizontal: boolean;
}

interface UseMobileSwipeRemovalOptions {
  onRequestRemoval: () => void;
  ignoredTargetSelector?: string;
}

const MOBILE_MEDIA_QUERY = "(max-width: 760px)";
const SWIPE_DELETE_MAX_OFFSET = 96;
const SWIPE_DELETE_TRIGGER_OFFSET = 72;
const SWIPE_DIRECTION_THRESHOLD = 8;

export function useMobileSwipeRemoval({
  onRequestRemoval,
  ignoredTargetSelector,
}: UseMobileSwipeRemovalOptions) {
  const swipeGestureRef = useRef<SwipeGesture | null>(null);
  const suppressClickUntilRef = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const isSwipeDeleteReady = swipeOffset <= -SWIPE_DELETE_TRIGGER_OFFSET;

  const resetSwipe = () => {
    swipeGestureRef.current = null;
    setSwipeOffset(0);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      !event.isPrimary
      || event.button !== 0
      || !window.matchMedia(MOBILE_MEDIA_QUERY).matches
      || (ignoredTargetSelector && (event.target as Element).closest(ignoredTargetSelector))
    ) return;

    swipeGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      isHorizontal: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = swipeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (!gesture.isHorizontal) {
      const horizontalDistance = Math.abs(deltaX);
      const verticalDistance = Math.abs(deltaY);

      if (Math.max(horizontalDistance, verticalDistance) < SWIPE_DIRECTION_THRESHOLD) return;
      if (verticalDistance > horizontalDistance) {
        resetSwipe();
        return;
      }
      if (deltaX >= 0) {
        resetSwipe();
        return;
      }
      gesture.isHorizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    setSwipeOffset(Math.max(deltaX, -SWIPE_DELETE_MAX_OFFSET));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = swipeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const shouldRequestRemoval = gesture.isHorizontal
      && event.clientX - gesture.startX <= -SWIPE_DELETE_TRIGGER_OFFSET;
    suppressClickUntilRef.current = gesture.isHorizontal ? Date.now() + 400 : 0;
    resetSwipe();
    if (shouldRequestRemoval) onRequestRemoval();
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    if (swipeGestureRef.current?.pointerId !== event.pointerId) return;
    suppressClickUntilRef.current = 0;
    resetSwipe();
  };

  const handleLostPointerCapture = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (swipeGestureRef.current?.pointerId !== event.pointerId) return;
    suppressClickUntilRef.current = 0;
    resetSwipe();
  };

  const shouldSuppressClick = () => Date.now() < suppressClickUntilRef.current;

  return {
    swipeOffset,
    isSwipeDeleteReady,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleLostPointerCapture,
    shouldSuppressClick,
  };
}
