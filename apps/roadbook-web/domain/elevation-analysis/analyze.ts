import { findPosition, interpolatePosition } from "./geometry";
import { ELEVATION_POLICY, ELEVATION_SOURCE, type ElevationAnalysisPolicy, type ElevationProfile, type ElevationRangeSummary, type ElevationSample, type RouteElevationRange, type SustainedSlopeSection } from "./model";

export function isKnown(sample: ElevationSample) {
  return sample.quality === "surface-estimate" && sample.elevationMeters !== null && Number.isFinite(sample.elevationMeters);
}
export function isContinuous(a: ElevationSample, b: ElevationSample, policy = ELEVATION_POLICY) {
  return isKnown(a) && isKnown(b) && !b.breakBefore && b.distanceMeters > a.distanceMeters && b.distanceMeters - a.distanceMeters <= policy.maximumSampleGapMeters;
}
export function sampleAt(samples: ElevationSample[], distance: number, afterBoundary = false): ElevationSample | null {
  if (!samples.length || distance < samples[0].distanceMeters || distance > samples[samples.length - 1].distanceMeters) return null;
  let index = findPosition(samples, distance);
  if (afterBoundary) while (index + 1 < samples.length && samples[index + 1].distanceMeters === distance) index++;
  const b = samples[index];
  if (Math.abs(b.distanceMeters - distance) < 0.000001) return b;
  const a = samples[index - 1];
  if (!a || !isContinuous(a, b)) return { ...b, distanceMeters: distance, elevationMeters: null, rawElevationMeters: null, quality: "missing" };
  const fraction = (distance - a.distanceMeters) / (b.distanceMeters - a.distanceMeters);
  return { ...a, ...interpolatePosition(a, b, distance), rawElevationMeters: a.rawElevationMeters !== null && b.rawElevationMeters !== null ? a.rawElevationMeters + (b.rawElevationMeters - a.rawElevationMeters) * fraction : null, elevationMeters: a.elevationMeters! + (b.elevationMeters! - a.elevationMeters!) * fraction };
}
export function clipSamples(samples: ElevationSample[], range: RouteElevationRange) {
  const start = sampleAt(samples, range.startMeters, true); const end = sampleAt(samples, range.endMeters);
  if (!start || !end || range.startMeters >= range.endMeters) return [];
  return [start, ...samples.slice(findPosition(samples, range.startMeters)).filter((sample) => sample.distanceMeters > range.startMeters && sample.distanceMeters < range.endMeters), end];
}
export function summarizeElevation(samples: ElevationSample[], range: RouteElevationRange): ElevationRangeSummary {
  const clipped = clipSamples(samples, range);
  let ascentMeters = 0; let descentMeters = 0; let coveredMeters = 0;
  let highest: ElevationSample | null = null; let lowest: ElevationSample | null = null;
  clipped.forEach((sample, index) => {
    if (isKnown(sample)) {
      if (!highest || sample.elevationMeters! > highest.elevationMeters!) highest = sample;
      if (!lowest || sample.elevationMeters! < lowest.elevationMeters!) lowest = sample;
    }
    const previous = clipped[index - 1];
    if (!previous || !isContinuous(previous, sample)) return;
    const delta = sample.elevationMeters! - previous.elevationMeters!;
    ascentMeters += Math.max(0, delta); descentMeters += Math.max(0, -delta);
    coveredMeters += sample.distanceMeters - previous.distanceMeters;
  });
  const start = clipped[0]; const end = clipped[clipped.length - 1];
  return { ascentMeters, descentMeters, coveredMeters, coverage: coveredMeters / Math.max(1, range.endMeters - range.startMeters), highest, lowest, netHeightMeters: start && end && isKnown(start) && isKnown(end) ? end.elevationMeters! - start.elevationMeters! : null };
}

// 高程容差简化只用于去噪；分析仍回填到全部采样位置，未知区间单独断开。
function denoiseRun(samples: ElevationSample[], start: number, end: number, tolerance: number) {
  const anchors = new Set([start, end]);
  const stack = [[start, end]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maximum = tolerance; let selected = -1;
    for (let i = a + 1; i < b; i++) {
      const t = (samples[i].distanceMeters - samples[a].distanceMeters) / (samples[b].distanceMeters - samples[a].distanceMeters);
      const expected = samples[a].rawElevationMeters! + (samples[b].rawElevationMeters! - samples[a].rawElevationMeters!) * t;
      const error = Math.abs(samples[i].rawElevationMeters! - expected);
      if (error > maximum) { maximum = error; selected = i; }
    }
    if (selected !== -1) { anchors.add(selected); stack.push([a, selected], [selected, b]); }
  }
  const ordered = [...anchors].sort((a, b) => a - b);
  for (let n = 1; n < ordered.length; n++) {
    const a = ordered[n - 1]; const b = ordered[n];
    for (let i = a; i <= b; i++) {
      const t = b === a ? 0 : (samples[i].distanceMeters - samples[a].distanceMeters) / (samples[b].distanceMeters - samples[a].distanceMeters);
      samples[i].elevationMeters = samples[a].rawElevationMeters! + (samples[b].rawElevationMeters! - samples[a].rawElevationMeters!) * t;
    }
  }
}
export function windowGrade(samples: ElevationSample[], windowMeters: number) {
  let result: SustainedSlopeSection["localGrade"] = null;
  if (!samples.length) return result;
  for (const start of samples) {
    const endMeters = start.distanceMeters + windowMeters;
    if (endMeters > samples[samples.length - 1].distanceMeters) break;
    const end = sampleAt(samples, endMeters);
    if (!end || !isKnown(start) || !isKnown(end)) continue;
    const percent = (end.elevationMeters! - start.elevationMeters!) / windowMeters * 100;
    if (!result || Math.abs(percent) > Math.abs(result.percent)) result = { percent, startMeters: start.distanceMeters, endMeters };
  }
  return result;
}
export function describeSlope(samples: ElevationSample[], range: RouteElevationRange, direction: SustainedSlopeSection["direction"], id: string, policy = ELEVATION_POLICY): SustainedSlopeSection {
  const clipped = clipSamples(samples, range);
  const summary = summarizeElevation(samples, range);
  const startElevationMeters = clipped[0].elevationMeters!;
  const endElevationMeters = clipped[clipped.length - 1].elevationMeters!;
  const lengthMeters = range.endMeters - range.startMeters;
  return { ...range, id, direction, startElevationMeters, endElevationMeters, lengthMeters, netHeightMeters: endElevationMeters - startElevationMeters, ascentMeters: summary.ascentMeters, descentMeters: summary.descentMeters, averageGradePercent: (endElevationMeters - startElevationMeters) / lengthMeters * 100, localGrade: windowGrade(clipped, policy.localWindowMeters), trendGrade: windowGrade(clipped, policy.trendWindowMeters), quality: "surface-estimate" };
}
function detectSections(samples: ElevationSample[], policy: ElevationAnalysisPolicy) {
  const sections: SustainedSlopeSection[] = [];
  let start = -1; let end = -1; let direction = 0;
  let pending = -1; let reverseDistance = 0; let reverseHeight = 0;
  let scaleConfirmed = false;
  const bounds: Array<[number, number]> = [];
  for (let start = 0; start < samples.length;) {
    let end = start;
    while (end + 1 < samples.length && isContinuous(samples[end], samples[end + 1], policy)) end++;
    for (let i = start; i <= end; i++) bounds[i] = [start, end];
    start = end + 1;
  }
  const trendAt = (index: number, center: number, window: number) => {
    const [first, last] = bounds[index];
    const begin = Math.max(samples[first].distanceMeters, center - window / 2);
    const finish = Math.min(samples[last].distanceMeters, center + window / 2);
    const a = sampleAt(samples, begin, true); const b = sampleAt(samples, finish);
    return a && b && isKnown(a) && isKnown(b) && finish > begin ? (b.elevationMeters! - a.elevationMeters!) / (finish - begin) * 100 : 0;
  };
  const finish = () => {
    if (start >= 0 && end > start) {
      const range = { startMeters: samples[start].distanceMeters, endMeters: samples[end].distanceMeters };
      const net = samples[end].elevationMeters! - samples[start].elevationMeters!;
      if (scaleConfirmed && range.endMeters - range.startMeters >= policy.minimumSectionMeters && Math.abs(net) >= policy.minimumNetHeightMeters) {
        sections.push(describeSlope(samples, range, direction > 0 ? "ascent" : "descent", `slope:${start}:${end}`, policy));
      }
    }
    start = -1; end = -1; direction = 0; pending = -1; reverseDistance = 0; reverseHeight = 0; scaleConfirmed = false;
  };
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]; const b = samples[i];
    if (!isContinuous(a, b, policy)) { finish(); continue; }
    const length = b.distanceMeters - a.distanceMeters;
    const delta = b.elevationMeters! - a.elevationMeters!;
    const grade = delta / length * 100;
    const physicalDirection = Math.sign(delta);
    const center = (a.distanceMeters + b.distanceMeters) / 2;
    const local = trendAt(i, center, policy.localWindowMeters);
    const trend = trendAt(i, center, policy.trendWindowMeters);
    const confirmed = local * physicalDirection >= policy.localDetectionGradePercent || trend * physicalDirection >= policy.trendDetectionGradePercent;
    // 窗口确认整个方向候选，不逐样本截掉转折附近的真实坡段边界。
    const nextDirection = Math.abs(grade) >= policy.directionGradePercent ? physicalDirection : 0;
    if (!direction) { if (nextDirection) { start = i - 1; end = i; direction = nextDirection; scaleConfirmed = confirmed; } continue; }
    if (nextDirection === direction) { end = i; pending = -1; reverseDistance = 0; reverseHeight = 0; scaleConfirmed ||= confirmed; continue; }
    if (pending < 0) pending = i - 1;
    if (physicalDirection === -direction) { reverseDistance += length; reverseHeight += Math.abs(delta); }
    if (b.distanceMeters - samples[pending].distanceMeters > policy.bridgeDistanceMeters || reverseDistance > policy.reverseDistanceMeters || reverseHeight > policy.reverseHeightMeters) {
      const restart = pending;
      finish();
      if (nextDirection) { start = restart; end = i; direction = nextDirection; scaleConfirmed = confirmed; }
    }
  }
  finish();
  return sections;
}
export function analyzeElevation(rawSamples: ElevationSample[], policy = ELEVATION_POLICY): ElevationProfile {
  const samples = rawSamples.map((sample) => ({ ...sample, elevationMeters: sample.rawElevationMeters }));
  for (let i = 1; i < samples.length; i++) {
    const a = rawSamples[i - 1]; const b = rawSamples[i];
    if (a.quality !== "surface-estimate" || b.quality !== "surface-estimate" || a.rawElevationMeters === null || b.rawElevationMeters === null || b.breakBefore) continue;
    const distance = b.distanceMeters - a.distanceMeters;
    if (distance > 0 && Math.abs(b.rawElevationMeters - a.rawElevationMeters) / distance * 100 > policy.anomalousGradePercent) {
      samples[i - 1].quality = "low-confidence"; samples[i].quality = "low-confidence";
    }
  }
  let runStart = 0;
  for (let i = 1; i <= samples.length; i++) {
    if (i < samples.length && isContinuous(samples[i - 1], samples[i], policy)) continue;
    if (i - 1 > runStart) denoiseRun(samples, runStart, i - 1, policy.noiseToleranceMeters);
    runStart = i;
  }
  return { rawSamples, samples, sections: detectSections(samples, policy), algorithmVersion: policy.algorithmVersion, sourceVersion: ELEVATION_SOURCE.version };
}
export function sectionsInRange(profile: ElevationProfile, range: RouteElevationRange) {
  return profile.sections.filter((section) => section.endMeters > range.startMeters && section.startMeters < range.endMeters).map((section) => describeSlope(profile.samples, { startMeters: Math.max(range.startMeters, section.startMeters), endMeters: Math.min(range.endMeters, section.endMeters) }, section.direction, section.id));
}

// 画布抽稀只影响展示，保留峰谷、质量断点、控制点和坡段边界。
export function simplifyChartSamples(samples: ElevationSample[], important: number[], width = 280) {
  if (samples.length <= width * 2) return samples;
  const keep = new Set([0, samples.length - 1]);
  for (const distance of important) { const i = findPosition(samples, distance); keep.add(i); if (i) keep.add(i - 1); }
  const bucketSize = Math.ceil(samples.length / width);
  for (let start = 0; start < samples.length; start += bucketSize) {
    let min = start; let max = start;
    for (let i = start; i < Math.min(samples.length, start + bucketSize); i++) {
      if (samples[i].elevationMeters !== null && samples[i].elevationMeters! < (samples[min].elevationMeters ?? Infinity)) min = i;
      if (samples[i].elevationMeters !== null && samples[i].elevationMeters! > (samples[max].elevationMeters ?? -Infinity)) max = i;
      if (i && (!isContinuous(samples[i - 1], samples[i]) || samples[i].quality !== samples[i - 1].quality)) { keep.add(i); keep.add(i - 1); }
    }
    keep.add(min); keep.add(max);
  }
  return [...keep].sort((a, b) => a - b).map((index) => samples[index]);
}
