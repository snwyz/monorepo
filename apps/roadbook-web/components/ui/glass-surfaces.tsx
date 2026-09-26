"use client";

import { useEffect } from "react";

/** 所有声明了 data-glass 的表面共用一组被动监听，包含 Portal 和懒加载卡片。 */
export function GlassSurfaces() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)");
    let active: HTMLElement | null = null;
    let frame: number | null = null;
    let pending: { target: Element; x: number; y: number } | null = null;

    const clearActive = () => {
      active?.style.removeProperty("--highlight-opacity");
      active = null;
    };
    const clear = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      pending = null;
      clearActive();
    };
    const track = (event: PointerEvent) => {
      if (!event.isPrimary || reduced.matches || !(event.target instanceof Element)) return;
      pending = { target: event.target, x: event.clientX, y: event.clientY };
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const point = pending;
        if (!point) return;
        let surface = point.target.closest<HTMLElement>("[data-glass]");
        // H5 中被展平的业务容器将反馈交给任务面板，只有最近一个可见表面发光。
        while (surface && getComputedStyle(surface).getPropertyValue("--glass-enabled").trim() !== "1") {
          surface = surface.parentElement?.closest<HTMLElement>("[data-glass]") ?? null;
        }
        if (surface !== active) clearActive();
        active = surface;
        if (!surface) return;
        const bounds = surface.getBoundingClientRect();
        surface.style.setProperty("--highlight-x", `${point.x - bounds.left}px`);
        surface.style.setProperty("--highlight-y", `${point.y - bounds.top}px`);
        surface.style.setProperty("--highlight-opacity", "1");
      });
    };
    const leave = (event: PointerEvent) => {
      if (event.isPrimary && !event.relatedTarget) clear();
    };
    const release = (event: PointerEvent) => {
      if (event.isPrimary && event.pointerType !== "mouse") clear();
    };
    const options = { capture: true, passive: true };
    document.addEventListener("pointerover", track, options);
    document.addEventListener("pointermove", track, options);
    document.addEventListener("pointerdown", track, options);
    document.addEventListener("pointerout", leave, options);
    document.addEventListener("pointerup", release, options);
    document.addEventListener("pointercancel", clear, options);
    document.addEventListener("scroll", clear, options);
    window.addEventListener("blur", clear);
    reduced.addEventListener("change", clear);
    return () => {
      clear();
      document.removeEventListener("pointerover", track, options);
      document.removeEventListener("pointermove", track, options);
      document.removeEventListener("pointerdown", track, options);
      document.removeEventListener("pointerout", leave, options);
      document.removeEventListener("pointerup", release, options);
      document.removeEventListener("pointercancel", clear, options);
      document.removeEventListener("scroll", clear, options);
      window.removeEventListener("blur", clear);
      reduced.removeEventListener("change", clear);
    };
  }, []);
  return null;
}
