import { RoadbookMark } from "@/components/branding/roadbook-mark";
import { CloseIcon } from "@/components/ui/icons";

interface FeaturedRouteModeBadgeProps {
  routeName: string;
  onExit: () => void;
}

export function FeaturedRouteModeBadge({ routeName, onExit }: FeaturedRouteModeBadgeProps) {
  return (
    <div data-glass="desktop" className="featured-route-mode widget">
      <RoadbookMark />
      <span><small>热门路线专题</small><strong>{routeName}</strong></span>
      <button type="button" onClick={onExit} aria-label="退出热门路线专题" title="返回我的规划">
        <CloseIcon />
      </button>
    </div>
  );
}
