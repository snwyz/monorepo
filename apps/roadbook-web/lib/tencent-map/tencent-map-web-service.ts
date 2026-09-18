import { createHash } from "node:crypto";

interface TencentMapWebServiceResult {
  data: unknown;
  ok: boolean;
}

export async function requestTencentMapWebService(
  path: string,
  params: Record<string, string | undefined>,
): Promise<TencentMapWebServiceResult> {
  const key = process.env.TENCENT_MAP_KEY ?? process.env.NEXT_PUBLIC_TENCENT_MAP_KEY;
  const secretKey = process.env.TENCENT_MAP_SK;
  if (!key) throw new Error("缺少 TENCENT_MAP_KEY");

  const entries = Object.entries({ ...params, key })
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([left], [right]) => left.localeCompare(right));
  const rawQuery = entries.map(([name, value]) => `${name}=${value}`).join("&");
  const url = new URL(`https://apis.map.qq.com${path}`);
  for (const [name, value] of entries) url.searchParams.set(name, value);

  if (secretKey) {
    const signature = createHash("md5")
      .update(`${path}?${rawQuery}${secretKey}`)
      .digest("hex");
    url.searchParams.set("sig", signature);
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: { "x-legacy-url-decode": "no" },
    signal: AbortSignal.timeout(10_000),
  });
  return { data: await response.json(), ok: response.ok };
}
