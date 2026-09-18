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
import { GripVerticalIcon } from "lucide-react";

import { CloseIcon } from "@/components/ui/icons";
import type { ControlPoint } from "@/domain/route-planning/model";

interface RouteAddressListProps {
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

  return (
    <div
      ref={setNodeRef}
      className={`address-sequence${isDragging ? " is-dragging" : ""}`}
      style={{
        transform: CSS.Transform.toString(verticalTransform),
        transition,
      }}
    >
      <div className={`address-row ${isSelected ? "is-selected" : ""} ${isUnresolved ? "is-unresolved" : ""}`}>
        <button
          type="button"
          className="address-row__select"
          {...attributes}
          {...listeners}
          onClick={() => onSelectControlPoint(point.id)}
          aria-pressed={isSelected}
          title="点击定位，长按拖拽排序"
        >
          <span className={`point-number ${index === 0 ? "is-start" : ""}`}>{index + 1}</span>
          <span className="address-row__copy">
            <span className="address-row__title"><strong>{point.name}</strong></span>
            <small>{point.address}</small>
          </span>
          <span className="address-row__drag" aria-hidden="true"><GripVerticalIcon /></span>
        </button>
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
      {controlPointCount > 1 && legId ? (
        <button
          type="button"
          className={`leg-link ${isLegSelected ? "is-selected" : ""}`}
          onClick={() => onSelectRouteLeg(legId)}
          aria-label={`选择第 ${index + 1} 路段`}
        >
          <span /><small>{index === controlPointCount - 1 ? "返回起点" : `路段 ${index + 1}`}</small>
        </button>
      ) : null}
    </div>
  );
}

export function RouteAddressList({
  controlPoints,
  selectedControlPointId,
  selectedRouteLegId,
  pendingControlPointId,
  onSelectControlPoint,
  onSelectRouteLeg,
  onReorder,
  onRemove,
}: RouteAddressListProps) {
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
    <aside className="address-list widget" aria-label="路线控制点">
      <header className="widget-title">
        <div><small>路线顺序</small><h2>控制点</h2></div>
        <span className="count-badge">{controlPoints.length}/20</span>
      </header>
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
