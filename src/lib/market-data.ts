export type Bar = { date: string; close: number };

export type Series = { last: number | null; bars: Bar[] };

export type MarketSnapshot = {
  source: string;
  fetchedAt: string;
  symbols: Record<string, string>;
  spy: { last: number | null; bars: Bar[]; recentBars: Bar[] };
  futures: { last: number | null; bars: Bar[]; previousClose: number | null };
  vix: { last: number | null; bars: Bar[] };
  breadth: { spyBars: Bar[]; rspBars: Bar[] };
  yields: { last: number | null; bars: Bar[] };
  inflation?: {
    breakeven10y: Series;
    realYield10y: Series;
  };
  commodities?: {
    oil: Series;
    gold: Series;
  };
};

async function fetchJson(url: string, timeoutMs: number): Promise<MarketSnapshot> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Market data unavailable (${res.status}). ${detail}`);
    }
    const data = (await res.json()) as MarketSnapshot & { error?: string };
    if (!data?.spy || (!data.spy.bars?.length && !data.spy.recentBars?.length)) {
      throw new Error(data.error || "Market snapshot missing SPY history.");
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Prefer live Netlify function; fall back to build-time JSON if Yahoo is blocked
 * from function IPs (common on free Netlify).
 */
export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  try {
    return await fetchJson("/api/market/snapshot", 9000);
  } catch {
    return await fetchJson("/market-snapshot.json", 8000);
  }
}
