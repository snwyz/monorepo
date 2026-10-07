"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { MapCoordinate } from "@roadbook/map/web";
import { ChevronDownIcon, MountainIcon } from "@/components/ui/icons";
import type { RouteElevationContext } from "@/hooks/use-route-elevation-analysis";

const ElevationAnalysisView = lazy(() => import("./elevation-analysis-view").then((module) => ({ default: module.ElevationAnalysisView })));
export interface ElevationPanelProps extends RouteElevationContext {
  updating: boolean;
  selectedLegId: string | null;
  onHighlight: (paths: MapCoordinate[][]) => void;
  onBrowse: (coordinate: MapCoordinate | null) => void;
  onFocus: (paths: MapCoordinate[][]) => void;
}
export function ElevationPanel(props: ElevationPanelProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [preview, setPreview] = useState<{ route: ElevationPanelProps["route"]; planId: string | null; mapProvider: string; text: string } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { route, planId, mapProvider, onBrowse } = props;
  const handlePreview = useCallback((text: string) => setPreview({ route, planId, mapProvider, text }), [route, planId, mapProvider]);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 761px)");
    const update = () => setDesktop(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => { if (!open || !desktop) onBrowse(null); }, [open, desktop, onBrowse]);
  const summary = preview?.route === props.route && preview?.planId === props.planId && preview?.mapProvider === props.mapProvider ? preview.text : null;
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  return <section data-glass="desktop" className={`elevation-panel widget ${open ? "is-open" : ""}`} aria-label="路线起伏与持续坡段分析" onKeyDown={(event) => {
    if (event.key === "Escape" && open && !event.defaultPrevented) { event.stopPropagation(); event.preventDefault(); close(); }
  }}>
    <button ref={trigger} type="button" className="elevation-panel__trigger" onClick={() => { setLoaded(true); setOpen((value) => !value); }} aria-expanded={open} aria-controls="route-elevation-content">
      <span className="elevation-panel__icon"><MountainIcon /></span>
      <span className="elevation-panel__heading"><strong>路线起伏</strong><small title={summary ?? undefined}>{props.updating ? "路线更新后可用" : summary ?? (props.route ? "展开查看路线起伏" : "路线生成后可用")}</small></span>
      <span className="elevation-panel__status">{summary ? "估算" : "地形分析"}</span>
      <ChevronDownIcon className={open ? "is-rotated" : ""} />
    </button>
    <div id="route-elevation-content" className="elevation-panel__content" inert={!open} aria-hidden={!open}>
      {loaded ? <Suspense fallback={<div className="elevation-placeholder" role="status">正在加载地形分析…</div>}>
        <ElevationAnalysisView {...props} enabled={open && desktop} onPreview={handlePreview} />
      </Suspense> : null}
    </div>
  </section>;
}
