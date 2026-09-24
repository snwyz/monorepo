import { CloseIcon, RouteIcon } from "@/components/ui/icons";

interface FeaturedRouteModeBadgeProps {
  routeName: string;
  onExit: () => void;
}

export function FeaturedRouteModeBadge({ routeName, onExit }: FeaturedRouteModeBadgeProps) {
  return (
    <div className="featured-route-mode widget">
      <RouteIcon />
      <span><small>热门路线专题</small><strong>{routeName}</strong></span>
      <button type="button" onClick={onExit} aria-label="退出热门路线专题" title="返回我的规划">
        <CloseIcon />
      </button>
    </div>
  );
}

