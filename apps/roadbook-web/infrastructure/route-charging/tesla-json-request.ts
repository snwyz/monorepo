import "server-only";

export async function requestTeslaJson(url: string, maxBytes: number): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok || !response.body) throw new Error("特斯拉站点服务响应异常");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let json = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("特斯拉站点数据超过大小限制");
      json += decoder.decode(value, { stream: true });
    }
    return JSON.parse(json + decoder.decode());
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
