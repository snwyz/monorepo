import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs, promisify } from "node:util";

// 在 PATH 中提供同一版本 Lighthouse；报告目录必须放在仓库外。
const { values } = parseArgs({ options: {
  before: { type: "string" }, after: { type: "string" }, output: { type: "string" },
  runs: { type: "string", default: "3" },
} });
const runs = Number(values.runs);
if (!values.before || !values.after || !values.output || !Number.isInteger(runs) || runs < 1) {
  throw new Error("需要 --before URL --after URL --output 绝对目录 [--runs 3]");
}
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const execute = promisify(execFile);
const results = [];
const metrics = ["first-contentful-paint", "largest-contentful-paint", "speed-index", "total-blocking-time", "cumulative-layout-shift"];
function redact(value) {
  return value.replace(/([?&](?:key|jscode|signature|securityJsCode)=)[^&\s"'<>\\]+/gi, "$1REDACTED");
}
for (const device of ["desktop", "mobile"]) {
  for (let run = 1; run <= runs; run++) {
    // 轮换先后顺序，避免所有基线和所有优化样本集中在不同网络时段。
    for (const variant of run % 2 ? ["before", "after"] : ["after", "before"]) {
      const name = `${device}-${variant}-${run}`;
      console.log(`开始 ${name}`);
      const path = resolve(output, name);
      const args = [values[variant], "--quiet", "--only-categories=performance,accessibility,best-practices,seo",
        "--chrome-flags=--headless=new --window-size=1440,900", "--output=json", "--output=html", `--output-path=${path}`];
      if (device === "desktop") args.push("--preset=desktop");
      await execute("lighthouse", args, { timeout: 180_000, maxBuffer: 2_000_000 });
      const jsonPath = `${path}.report.json`;
      const raw = await readFile(jsonPath, "utf8");
      const report = JSON.parse(raw);
      if (report.runtimeError) throw new Error(`${name}: ${report.runtimeError.code}`);
      const network = report.audits["network-requests"].details.items;
      const sdk = network.filter((item) => item.url.startsWith("https://webapi.amap.com/maps?"));
      const ip = network.find((item) => item.url.includes("/api/amap/ip-location"));
      const tiles = network.filter((item) => /\.amap\.com\/tile\//.test(item.url));
      const row = {
        name, device, variant, run, version: report.lighthouseVersion,
        chrome: report.environment.hostUserAgent,
        score: Math.round(report.categories.performance.score * 100),
        metrics: Object.fromEntries(metrics.map((key) => [key, report.audits[key].numericValue])),
        sdkRequests: sdk.length, sdkStart: sdk[0]?.rendererStartTime, sdkEnd: sdk[0]?.networkEndTime,
        ipStart: ip?.rendererStartTime, ipEnd: ip?.networkEndTime, ipStatus: ip?.statusCode,
        tileRequests: tiles.length,
        lastTileEnd: tiles.length ? Math.max(...tiles.map((item) => item.networkEndTime)) : null,
        warnings: report.runWarnings,
      };
      results.push(row);
      // 报告只在本地保存，并移除地图 Key 等查询参数。
      await writeFile(jsonPath, redact(raw));
      const htmlPath = `${path}.report.html`;
      await writeFile(htmlPath, redact(await readFile(htmlPath, "utf8")));
      await writeFile(resolve(output, "summary.json"), JSON.stringify(results, null, 2));
      console.log(JSON.stringify(row));
    }
  }
}
