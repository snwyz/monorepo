import { describe, expect, it } from "vitest";
import { createRoutePlan, insertControlPointIntoRouteLeg } from "./model";
import { changeRouteLegTravelMode, getRouteLegTravelMode, inheritInsertedRouteLegTravelMode, normalizeRouteLegTravelModes } from "./route-leg-travel-mode";
import { routeCalculationIdentity } from "./calculation-context";

const points = ["a", "b", "c"].map((id, index) => ({ id, name: id, address: "", latitude: 30 + index, longitude: 104 }));
const plan = { ...createRoutePlan("plan"), controlPoints: points };

describe("有向路段的出行方式", () => {
  it("旧方案与非法值回退为汽车；非相邻配置被清理", () => {
    expect(getRouteLegTravelMode(plan, "a:b")).toBe("driving");
    expect(normalizeRouteLegTravelModes({ ...plan, legTravelModes: { "a:b": "cycling", "b:a": "walking" } })).toEqual({ "a:b": "cycling" });
  });
  it("只改目标段，去返程独立，恢复汽车保留旧格式身份", () => {
    const initial = routeCalculationIdentity(plan, "amap");
    const cycling = changeRouteLegTravelMode(plan, "a:b", "cycling");
    expect(getRouteLegTravelMode(cycling, "b:c")).toBe("driving");
    expect(getRouteLegTravelMode(cycling, "c:a")).toBe("driving");
    expect(routeCalculationIdentity(cycling, "amap")).not.toBe(initial);
    expect(routeCalculationIdentity(changeRouteLegTravelMode(cycling, "a:b", "driving"), "amap")).toBe(initial);
    expect(changeRouteLegTravelMode(cycling, "a:b", "cycling")).toBe(cycling);
  });
  it("普通段与返程段插点均继承原方式；旧连接不复活", () => {
    const point = { ...points[0], id: "inserted" };
    for (const [from, to] of [["a", "b"], ["c", "a"]]) {
      const modePlan = changeRouteLegTravelMode(plan, `${from}:${to}`, "walking");
      const next = inheritInsertedRouteLegTravelMode(modePlan, from, to, point, insertControlPointIntoRouteLeg(points, from, to, point)!);
      expect(getRouteLegTravelMode(next, `${from}:inserted`)).toBe("walking");
      expect(getRouteLegTravelMode(next, `inserted:${to}`)).toBe("walking");
      expect(next.legTravelModes?.[`${from}:${to}`]).toBeUndefined();
    }
  });
});
