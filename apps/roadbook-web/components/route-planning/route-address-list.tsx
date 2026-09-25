"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WebMapProvider } from "@roadbook/map/web";
import { GripVerticalIcon } from "lucide-react";
import { type CSSProperties, useState } from "react";

import { ChevronDownIcon, CloseIcon, NavigationIcon } from "@/components/ui/icons";
import { useMobileSwipeRemoval } from "@/components/ui/use-mobile-swipe-removal";
import type { ControlPoint } from "@/domain/route-planning/model";
import { createMapNavigationUri } from "@/lib/map-navigation/map-navigation-uri";

interface RouteAddressListProps {
  provider: WebMapProvider;
  controlPoints: ControlPoint[];
  selectedControlPointId: string | null;
  selectedRouteLegId: string | null;
  pendingControlPointId: string | null;
  onSelectControlPoint: (id: string) => void;
  onSelectRouteLeg: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onRemove: (id: string) => void;
}

interface SortableAddressSequenceProps {
  provider: WebMapProvider;
  point: ControlPoint;
  index: number;
  controlPointCount: number;
  nextPoint: ControlPoint | undefined;
  isSelected: boolean;
  isLegSelected: boolean;
  isPending: boolean;
  onSelectControlPoint: (id: string) => void;
  onSelectRouteLeg: (id: string) => void;
  onRemove: (id: string) => void;
}

function SortableAddressSequence({
  provider,
  point,
  index,
  controlPointCount,
  nextPoint,
  isSelected,
  isLegSelected,
  isPending,
  onSelectControlPoint,
  onSelectRouteLeg,
  onRemove,
}: SortableAddressSequenceProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: point.id });
  const legId = nextPoint ? `${point.id}:${nextPoint.id}` : null;
  const isUnresolved = point.address === "未识别地址" || point.address === "地址解析中…";
  const verticalTransform = transform ? { ...transform, x: 0 } : null;
  const {
    swipeOffset,
    isSwipeDeleteReady,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleLostPointerCapture,
    shouldSuppressClick,
  } = useMobileSwipeRemoval({
    onRequestRemoval: () => onRemove(point.id),
    ignoredTargetSelector: ".address-row__navigation",
  });

  const handleSelectClick = () => {
    if (shouldSuppressClick()) return;
    onSelectControlPoint(point.id);
  };

  return (
    <div
      ref={setNodeRef}
      className={`address-sequence${isDragging ? " is-dragging" : ""}`}
      style={{
        transform: CSS.Transform.toString(verticalTransform),
        transition,
      }}
    >
      <div
        className={`address-row__swipe-action${isSwipeDeleteReady ? " is-ready" : ""}`}
        aria-hidden="true"
      >
        {isSwipeDeleteReady ? "松开删除" : "左滑删除"}
      </div>
      <div
        className={`address-row ${isSelected ? "is-selected" : ""} ${isUnresolved ? "is-unresolved" : ""}${swipeOffset < 0 ? " is-swiping" : ""}`}
        style={{ "--address-swipe-offset": `${swipeOffset}px` } as CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handleLostPointerCapture}
      >
        <button
          type="button"
          className="address-row__select"
          {...attributes}
          {...listeners}
          onClick={handleSelectClick}
          aria-pressed={isSelected}
          title="点击定位，长按拖拽排序"
        >
          <span className="point-number">{index + 1}</span>
          <span className="address-row__copy">
            <span className="address-row__title"><strong>{point.name}</strong></span>
            <small>{point.address}</small>
          </span>
          <span className="address-row__drag" aria-hidden="true"><GripVerticalIcon /></span>
        </button>
        <a
          className="address-row__navigation"
          href={createMapNavigationUri({ provider, to: point })}
          aria-label={`使用${provider === "amap" ? "高德" : "腾讯"}地图导航到${point.name}`}
          title={`在${provider === "amap" ? "高德" : "腾讯"}地图中导航到此点`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onSelectControlPoint(point.id)}
        >
          <NavigationIcon />
        </a>
        <button
          type="button"
          className="address-row__delete"
          title={isPending ? "取消本次选点" : "删除点位"}
          aria-label={`${isPending ? "取消" : "删除"}${point.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onRemove(point.id)}
        >
          <CloseIcon />
        </button>
      </div>
      {controlPointCount > 1 && nextPoint && legId ? (
        <div className={`leg-row ${isLegSelected ? "is-selected" : ""}`}>
          <button
            type="button"
            className="leg-link"
            onClick={() => onSelectRouteLeg(legId)}
            aria-label={`选择第 ${index + 1} 路段`}
          >
            <span /><small>{index === controlPointCount - 1 ? "返回起点" : `路段 ${index + 1}`}</small>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function RouteAddressList({
  provider,
  controlPoints,
  selectedControlPointId,
  selectedRouteLegId,
  pendingControlPointId,
  onSelectControlPoint,
  onSelectRouteLeg,
  onReorder,
  onRemove,
}: RouteAddressListProps) {
  const [collapsed, setCollapsed] = useState(true);
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  return (
    <aside className={`address-list widget${collapsed ? " is-collapsed" : ""}`} aria-label="路线顺序">
      <header className="widget-title address-list__header address-list__header--desktop">
        <div><small>路线顺序</small></div>
        <span className="count-badge">{controlPoints.length}/20</span>
      </header>
      <button
        type="button"
        className="widget-title address-list__header address-list__toggle"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "展开" : "收起"}路线顺序`}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span><small>路线顺序</small></span>
        <span className="address-list__toggle-summary">
          <span className="count-badge">{controlPoints.length}/20</span>
          <ChevronDownIcon className={collapsed ? undefined : "is-rotated"} />
        </span>
      </button>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={controlPoints.map((point) => point.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="address-list__body">
            {controlPoints.map((point, index) => {
              const nextPoint = controlPoints[(index + 1) % controlPoints.length];
              const legId = nextPoint ? `${point.id}:${nextPoint.id}` : null;
              return (
                <SortableAddressSequence
                  key={point.id}
                  provider={provider}
                  point={point}
                  index={index}
                  controlPointCount={controlPoints.length}
                  nextPoint={nextPoint}
                  isSelected={selectedControlPointId === point.id}
                  isLegSelected={Boolean(legId && selectedRouteLegId === legId)}
                  isPending={pendingControlPointId === point.id}
                  onSelectControlPoint={onSelectControlPoint}
                  onSelectRouteLeg={onSelectRouteLeg}
                  onRemove={onRemove}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
      <footer className="address-list__hint">点击点位可定位；长按拖拽即可调整顺序，首项自动作为起点。</footer>
    </aside>
  );
}
