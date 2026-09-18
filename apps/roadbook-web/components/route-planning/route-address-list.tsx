"use client";

import { ChevronDownIcon, ChevronUpIcon, CloseIcon, MoreIcon } from "@/components/ui/icons";
import type { ControlPoint } from "@/domain/route-planning/model";

interface RouteAddressListProps {
  controlPoints: ControlPoint[];
  selectedControlPointId: string | null;
  selectedRouteLegId: string | null;
  pendingControlPointId: string | null;
  onSelectControlPoint: (id: string) => void;
  onSelectRouteLeg: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onSetAsStart: (id: string) => void;
}

export function RouteAddressList({
  controlPoints,
  selectedControlPointId,
  selectedRouteLegId,
  pendingControlPointId,
  onSelectControlPoint,
  onSelectRouteLeg,
  onMove,
  onRemove,
  onSetAsStart,
}: RouteAddressListProps) {
  return (
    <aside className="address-list widget" aria-label="路线控制点">
      <header className="widget-title">
        <div><small>路线顺序</small><h2>控制点</h2></div>
        <span className="count-badge">{controlPoints.length}/20</span>
      </header>
      <div className="address-list__body">
        {controlPoints.map((point, index) => {
          const next = controlPoints[(index + 1) % controlPoints.length];
          const legId = next ? `${point.id}:${next.id}` : null;
          const isUnresolved = point.address === "未识别地址" || point.address === "地址解析中…";
          return (
            <div className="address-sequence" key={point.id}>
              <button
                type="button"
                className={`address-row ${selectedControlPointId === point.id ? "is-selected" : ""} ${isUnresolved ? "is-unresolved" : ""}`}
                onClick={() => onSelectControlPoint(point.id)}
              >
                <span className={`point-number ${index === 0 ? "is-start" : ""}`}>{index + 1}</span>
                <span className="address-row__copy">
                  <span className="address-row__title"><strong>{point.name}</strong>{index === 0 ? <em>起点</em> : null}</span>
                  <small>{point.address}</small>
                </span>
                <span className="address-row__actions">
                  <span role="button" tabIndex={0} title="上移" aria-label={`上移${point.name}`} onClick={(event) => { event.stopPropagation(); onMove(point.id, -1); }}><ChevronUpIcon /></span>
                  <span role="button" tabIndex={0} title="下移" aria-label={`下移${point.name}`} onClick={(event) => { event.stopPropagation(); onMove(point.id, 1); }}><ChevronDownIcon /></span>
                  {index > 0 ? <span role="button" tabIndex={0} title="设为起点" aria-label={`将${point.name}设为起点`} onClick={(event) => { event.stopPropagation(); onSetAsStart(point.id); }}><MoreIcon /></span> : null}
                  <span
                    className="address-row__delete"
                    role="button"
                    tabIndex={0}
                    title={pendingControlPointId === point.id ? "取消本次选点（Esc）" : "删除选点"}
                    aria-label={`删除${point.name}`}
                    onClick={(event) => { event.stopPropagation(); onRemove(point.id); }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onRemove(point.id);
                      }
                    }}
                  ><CloseIcon /><small>{pendingControlPointId === point.id ? "取消" : "删除"}</small></span>
                </span>
              </button>
              {controlPoints.length > 1 && legId ? (
                <button
                  type="button"
                  className={`leg-link ${selectedRouteLegId === legId ? "is-selected" : ""}`}
                  onClick={() => onSelectRouteLeg(legId)}
                  aria-label={`选择第 ${index + 1} 路段`}
                >
                  <span /><small>{index === controlPoints.length - 1 ? "返回起点" : `路段 ${index + 1}`}</small>
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <footer className="address-list__hint">拖动地图点位或调整列表顺序后，路线会自动更新。</footer>
    </aside>
  );
}
