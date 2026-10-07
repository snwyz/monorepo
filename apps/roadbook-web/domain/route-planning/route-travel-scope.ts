import type { DrivingRoute, DrivingRouteLeg } from "@roadbook/map/web";

export function appendReturnLeg(
  oneWayRoute: DrivingRoute,
  returnLeg: DrivingRouteLeg,
): DrivingRoute {
  const firstLeg = oneWayRoute.legs[0];
  const lastLeg = oneWayRoute.legs[oneWayRoute.legs.length - 1];
  if (
    oneWayRoute.scope !== "one-way"
    || !firstLeg
    || !lastLeg
    || returnLeg.fromControlPointId !== lastLeg.toControlPointId
    || returnLeg.toControlPointId !== firstLeg.fromControlPointId
  ) throw new Error("返程路段与当前单程路线不匹配");

  return {
    ...oneWayRoute,
    scope: "round-trip",
    legs: [...oneWayRoute.legs, returnLeg],
    distanceMeters: oneWayRoute.distanceMeters + returnLeg.distanceMeters,
    durationMinutes: oneWayRoute.durationMinutes + returnLeg.durationMinutes,
    trafficLightCount: oneWayRoute.trafficLightCount !== null && returnLeg.trafficLightCount !== null
      ? oneWayRoute.trafficLightCount + returnLeg.trafficLightCount
      : null,
  };
}
