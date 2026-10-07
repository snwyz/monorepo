export const kilometers = (meters: number) => (meters / 1000).toFixed(1);
export const elevation = (meters: number | null) => meters === null ? "不可用" : `${Math.round(meters)}m`;
export const grade = (percent: number) => `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
