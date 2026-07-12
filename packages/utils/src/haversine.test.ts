// AI [2026-07-13]: 验证地理距离与半径判断工具的计算结果
import { describe, expect, it } from "vitest";
import { haversineKm, isWithinRadius } from "./haversine";

describe("haversineKm", () => {
  it("returns 0 for same point", () => {
    expect(haversineKm(30, 120, 30, 120)).toBe(0);
  });

  it("calculates distance between Beijing and Shanghai (~1068km)", () => {
    const dist = haversineKm(39.9042, 116.4074, 31.2304, 121.4737);
    expect(dist).toBeGreaterThan(1060);
    expect(dist).toBeLessThan(1080);
  });
});

describe("isWithinRadius", () => {
  it("returns true when point is within radius", () => {
    expect(isWithinRadius(30, 120, 30.001, 120.001, 1)).toBe(true);
  });

  it("returns false when point is outside radius", () => {
    expect(isWithinRadius(30, 120, 31, 121, 10)).toBe(false);
  });
});
