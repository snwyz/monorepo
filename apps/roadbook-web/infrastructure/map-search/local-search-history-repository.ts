const STORAGE_KEY = "roadbook:search-history:v1";
const HISTORY_LIMIT = 8;

function normalize(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const unique = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string") continue;
    const value = item.trim();
    if (!value || unique.has(value)) continue;
    unique.add(value);
    if (unique.size >= HISTORY_LIMIT) break;
  }
  return [...unique];
}

export class LocalSearchHistoryRepository {
  list() {
    if (typeof window === "undefined") return [];
    try {
      return normalize(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]"));
    } catch {
      return [];
    }
  }

  record(query: string) {
    if (typeof window === "undefined") return this.list();
    const value = query.trim();
    if (!value) return this.list();
    const next = normalize([value, ...this.list()]);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  clear() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
}

