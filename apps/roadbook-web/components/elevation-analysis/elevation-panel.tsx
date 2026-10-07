"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { MapCoordinate } from "@roadbook/map/web";
import { ChevronDownIcon, MountainIcon } from "@/components/ui/icons";
import type { RouteElevationContext } from "@/hooks/use-route-elevation-analysis";
import { ElevationAnalysisStatus } from "./elevation-analysis-status";
import { RouteElevationHelp } from "./route-elevation-help";

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
  const trigger = useRef<HTMLButtonElement>(null);
  const { onBrowse } = props;
  useEffect(() => {
    const query = window.matchMedia("(min-width: 761px)");
    const update = () => setDesktop(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => { if (!open || !desktop) onBrowse(null); }, [open, desktop, onBrowse]);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  return <section data-glass="desktop" className={`elevation-panel widget ${open ? "is-open" : ""}`} aria-label="路线海拔" onKeyDown={(event) => {
    if (event.key === "Escape" && open && !event.defaultPrevented) { event.stopPropagation(); event.preventDefault(); close(); }
  }}>
    <div className="elevation-panel__header">
      <button ref={trigger} type="button" className="elevation-panel__trigger" onClick={() => { setLoaded(true); setOpen((value) => !value); }} aria-expanded={open} aria-controls="route-elevation-content">
      <span className="elevation-panel__icon"><MountainIcon /></span>
      <span className="elevation-panel__heading"><strong>路线海拔</strong></span>
      <span className="elevation-panel__status">{props.updating ? "更新中" : "估算"}</span>
      <ChevronDownIcon className={open ? "is-rotated" : ""} />
      </button>
      {desktop ? <RouteElevationHelp key={open ? "expanded" : "collapsed"} /> : null}
    </div>
    <div id="route-elevation-content" className="elevation-panel__content" inert={!open} aria-hidden={!open}>
      {loaded ? <Suspense fallback={<ElevationAnalysisStatus kind="loading" title="正在分析沿线海拔" />}>
        <ElevationAnalysisView {...props} enabled={open && desktop} />
      </Suspense> : null}
    </div>
  </section>;
}
