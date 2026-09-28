import { chargingStationBoltPath, chargingStationPinPath } from "@roadbook/map/web";

export function ChargingPinIcon({ className }: { className?: string }) {
  return <svg className={className} width="32" height="40" viewBox="0 0 44 54" fill="none" aria-hidden="true">
    <path d={chargingStationPinPath} fill="#ff3b40" />
    <path d={chargingStationBoltPath} fill="white" />
  </svg>;
}
