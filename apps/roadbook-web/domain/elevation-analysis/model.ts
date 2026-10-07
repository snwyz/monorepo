import type { MapCoordinate } from "@roadbook/map/web";

export interface RouteElevationPosition {
  distanceMeters: number;
  legId: string;
  legDistanceMeters: number;
  passageIndex: number;
  coordinate: MapCoordinate;
}
export interface RouteElevationRange { startMeters: number; endMeters: number }
export type ElevationQuality = "surface-estimate" | "missing" | "low-confidence";
export interface ElevationSample extends RouteElevationPosition {
  rawElevationMeters: number | null;
  elevationMeters: number | null;
  quality: ElevationQuality;
  breakBefore?: boolean;
}
export interface ElevationControlPoint extends RouteElevationPosition { id: string; name: string }
export interface ElevationGeometry {
  signature: string;
  samplingVersion: string;
  sampleSpacingMeters: number;
  vertices: RouteElevationPosition[];
  samples: ElevationSample[];
  controlPoints: ElevationControlPoint[];
  distanceMeters: number;
  providerDistanceMeters: number;
}
export interface ElevationAnalysisPolicy {
  algorithmVersion: string;
  sampleSpacingMeters: number;
  noiseToleranceMeters: number;
  maximumSampleGapMeters: number;
  connectionToleranceMeters: number;
  localWindowMeters: number;
  trendWindowMeters: number;
  directionGradePercent: number;
  localDetectionGradePercent: number;
  trendDetectionGradePercent: number;
  anomalousGradePercent: number;
  bridgeDistanceMeters: number;
  reverseDistanceMeters: number;
  reverseHeightMeters: number;
  minimumSectionMeters: number;
  minimumNetHeightMeters: number;
}
export const ELEVATION_POLICY: ElevationAnalysisPolicy = {
  algorithmVersion: "experimental-v1",
  sampleSpacingMeters: 100,
  noiseToleranceMeters: 5,
  maximumSampleGapMeters: 150,
  connectionToleranceMeters: 1,
  localWindowMeters: 500,
  trendWindowMeters: 2000,
  directionGradePercent: 0.1,
  localDetectionGradePercent: 0.5,
  trendDetectionGradePercent: 0.1,
  anomalousGradePercent: 35,
  bridgeDistanceMeters: 500,
  reverseDistanceMeters: 200,
  reverseHeightMeters: 5,
  minimumSectionMeters: 5000,
  minimumNetHeightMeters: 100,
};
export interface ElevationRangeSummary {
  ascentMeters: number;
  descentMeters: number;
  netHeightMeters: number | null;
  coveredMeters: number;
  coverage: number;
  highest: ElevationSample | null;
  lowest: ElevationSample | null;
}
export interface SustainedSlopeSection extends RouteElevationRange {
  id: string;
  direction: "ascent" | "descent";
  startElevationMeters: number;
  endElevationMeters: number;
  lengthMeters: number;
  netHeightMeters: number;
  ascentMeters: number;
  descentMeters: number;
  averageGradePercent: number;
  localGrade: { percent: number; startMeters: number; endMeters: number } | null;
  trendGrade: { percent: number; startMeters: number; endMeters: number } | null;
  quality: "surface-estimate";
}
export interface ElevationProfile {
  rawSamples: ElevationSample[];
  samples: ElevationSample[];
  sections: SustainedSlopeSection[];
  algorithmVersion: string;
  sourceVersion: string;
}
export interface ElevationBatch { elevations: Array<number | null>; sourceVersion: string }
export interface ElevationProvider {
  query(coordinates: MapCoordinate[], signal: AbortSignal): Promise<ElevationBatch>;
}
export const ELEVATION_SOURCE = {
  version: "opentopodata-srtm30m-v3-bilinear-gcj-inverse-v1",
  name: "Open Topo Data · SRTM v3",
  coordinateSystem: "WGS84",
  mapCoordinateSystem: "GCJ-02",
  verticalDatum: "EGM96",
  resolutionMeters: 30,
  unit: "m",
} as const;
