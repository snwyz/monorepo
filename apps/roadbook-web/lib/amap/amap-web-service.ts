import { createHash } from "node:crypto";

interface AmapWebServiceResult {
  data: unknown;
  ok: boolean;
}

interface AmapErrorPayload {
  info?: unknown;
  infocode?: unknown;
}

type AmapAuthenticationMode = "jscode" | "signature";

interface AmapCredentials {
  key: string;
  securityCode: string;
}

let preferredAuthenticationMode: AmapAuthenticationMode = "jscode";

export function getAmapJsCredentials(): AmapCredentials {
  const key = process.env.NEXT_PUBLIC_AMAP_KEY;
  const securityCode = process.env.AMAP_SK;
  if (!key) throw new Error("缺少 NEXT_PUBLIC_AMAP_KEY");
  if (!securityCode) throw new Error("缺少 AMAP_SK");
  return { key, securityCode };
}

export function createAmapAuthenticatedUrl(
  origin: string,
  path: string,
  params: URLSearchParams,
  mode: AmapAuthenticationMode,
  credentials: AmapCredentials = getAmapJsCredentials(),
) {
  const { key, securityCode } = credentials;
  const url = new URL(path, origin);
  for (const [name, value] of params) {
    if (!["key", "jscode", "sig"].includes(name)) url.searchParams.append(name, value);
  }
  url.searchParams.set("key", key);
  if (mode === "jscode") {
    url.searchParams.set("jscode", securityCode);
    return url;
  }
  const signatureSource = [...url.searchParams.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  url.searchParams.set(
    "sig",
    createHash("md5").update(`${signatureSource}${securityCode}`, "utf8").digest("hex"),
  );
  return url;
}

export function hasInvalidAmapSignature(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const result = payload as AmapErrorPayload;
  return result.info === "INVALID_USER_SIGNATURE" || String(result.infocode) === "10007";
}

export async function requestAmapWebService(
  path: string,
  params: Record<string, string | undefined>,
): Promise<AmapWebServiceResult> {
  const searchParams = new URLSearchParams();
  for (const [name, value] of Object.entries({
    ...params,
    output: "json",
  })) {
    if (typeof value === "string") searchParams.set(name, value);
  }
  const request = async (mode: AmapAuthenticationMode) => {
    const response = await fetch(createAmapAuthenticatedUrl(
      "https://restapi.amap.com",
      path,
      searchParams,
      mode,
    ), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return { data: await response.json(), ok: response.ok };
  };
  const result = await request(preferredAuthenticationMode);
  if (preferredAuthenticationMode === "jscode" && hasInvalidAmapSignature(result.data)) {
    const signedResult = await request("signature");
    if (!hasInvalidAmapSignature(signedResult.data)) preferredAuthenticationMode = "signature";
    return signedResult;
  }
  return result;
}
