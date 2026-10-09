import type { RouteTravelMode } from "@roadbook/map/web";
import { Bike, CarFront, Footprints } from "lucide-react";

export function RouteTravelModeIcon({ mode }: { mode: RouteTravelMode }) {
  const Icon = mode === "cycling" ? Bike : mode === "walking" ? Footprints : CarFront;
  return <Icon aria-hidden="true" />;
}
