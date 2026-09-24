"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import { RoadbookMark } from "@/components/branding/roadbook-mark";
import { CloseIcon } from "@/components/ui/icons";
import type { FeaturedDrivingRoute } from "@/domain/featured-driving-route/model";

interface FeaturedRoutePreviewDialogProps {
  route: FeaturedDrivingRoute;
  onClose: () => void;
  onLoad: () => void | Promise<void>;
}

export function FeaturedRoutePreviewDialog({
  route,
  onClose,
  onLoad,
}: FeaturedRoutePreviewDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadRoute = async () => {
    if (loading) return;
    setLoading(true);
    setLoadError("");
    try {
      await onLoad();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "热门路线加载失败");
      setLoading(false);
    }
  };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex='-1'])",
    );
    focusable?.[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="featured-preview-layer">
      <button
        type="button"
        className="featured-preview-layer__backdrop"
        aria-label="关闭热门路线预览"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="featured-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="featured-preview-title"
        aria-describedby="featured-preview-description"
      >
        <button
          type="button"
          className="featured-preview-dialog__close"
          aria-label="关闭路线预览"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
        <div className="featured-preview-dialog__visual">
          <Image
            src={route.previewImageSrc}
            alt=""
            width={264}
            height={264}
            loading="lazy"
            unoptimized
          />
        </div>
        <div className="featured-preview-dialog__body">
          <span className="featured-preview-dialog__eyebrow">
            <RoadbookMark />
            {route.eyebrow}
          </span>
          <h2 id="featured-preview-title">{route.name}</h2>
          <p id="featured-preview-description">{route.description}</p>
          <div className="featured-preview-dialog__roads" aria-label="包含国道">
            {route.roadCodes.map((code) => <span key={code}>{code}</span>)}
          </div>
          <p className="featured-preview-dialog__notice">{route.dataNotice}</p>
          {loadError ? (
            <p className="featured-preview-dialog__error" role="alert">{loadError}</p>
          ) : null}
          <button
            type="button"
            className="featured-preview-dialog__load"
            disabled={loading}
            onClick={() => void loadRoute()}
          >
            {loading ? "正在加载路线…" : "在地图中查看"}
          </button>
        </div>
      </div>
    </div>
  );
}
