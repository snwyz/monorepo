import { RoadbookMark } from "@/components/branding/roadbook-mark";
import type { RoutePlanThumbnail as Thumbnail } from "@/domain/route-planning/model";

export function RoutePlanThumbnail({ thumbnail }: { thumbnail?: Thumbnail }) {
  if (!thumbnail) return <RoadbookMark />;
  return (
    <svg className="plan-row__thumbnail" viewBox="0 0 36 36" width="36" height="36" fill="none" aria-hidden="true" focusable="false">
      {thumbnail.paths.map((path, index) => (
        <polyline key={index} points={path.map((point) => point.join(",")).join(" ")}
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
