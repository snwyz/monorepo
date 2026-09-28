import "server-only";

import { createChargingStationCache } from "./charging-station-cache";
import { parseTeslaSuperchargers } from "./tesla-supercharger-parser";
import { requestTeslaJson } from "./tesla-json-request";
import { parseTeslaStationDetails } from "./tesla-station-details-parser";
import { createTeslaStationDetailsCache } from "./tesla-station-details-cache";

const TESLA_DIRECTORY_URL = "https://apigateway-socialconnect-api.tesla.cn/ext/v2/findus/get";
const MAX_DIRECTORY_BYTES = 8 * 1024 * 1024;

async function loadTeslaSuperchargers() {
  return parseTeslaSuperchargers(await requestTeslaJson(TESLA_DIRECTORY_URL, MAX_DIRECTORY_BYTES));
}

export const getTeslaSuperchargers = createChargingStationCache(loadTeslaSuperchargers);

export const getTeslaStationDetails = createTeslaStationDetailsCache(async (sourceSiteId) => {
  if (!/^\d{1,12}$/.test(sourceSiteId)) throw new Error("特斯拉站点标识无效");
  const url = new URL("https://apigateway-socialconnect-api.tesla.cn/ext/v1/site/details");
  url.searchParams.set("trtid", sourceSiteId);
  url.searchParams.set("ctype", "s");
  return parseTeslaStationDetails(await requestTeslaJson(url.toString(), 256 * 1024), sourceSiteId);
});
