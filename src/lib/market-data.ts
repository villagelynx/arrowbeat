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

export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  const res = await fetch("/api/market/snapshot");
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Market data unavailable (${res.status}). ${detail}`);
  }
  return (await res.json()) as MarketSnapshot;
}
