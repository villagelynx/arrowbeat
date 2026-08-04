import type { StockCorrectionsScan } from "./stock-corrections";

export type Bar = { date: string; close: number };

export type IntradayBar = {
  date: string;
  label: string;
  close: number;
  ts: number;
};

export type Series = { last: number | null; bars: Bar[] };

export const MAG7_SYMBOLS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "META",
  "GOOGL",
  "TSLA",
] as const;

export type Mag7Symbol = (typeof MAG7_SYMBOLS)[number];

export const MAG7_LABELS: Record<Mag7Symbol, string> = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  AMZN: "Amazon",
  META: "Meta",
  GOOGL: "Alphabet",
  TSLA: "Tesla",
};

export type Mag7Series = {
  last: number | null;
  previousClose: number | null;
  bars: Bar[];
};

export type MarketSnapshot = {
  source: string;
  fetchedAt: string;
  delayNote?: string;
  symbols: Record<string, string>;
  spy: {
    last: number | null;
    bars: Bar[];
    recentBars: Bar[];
    dayBars?: IntradayBar[];
    dayPrevClose?: number | null;
  };
  futures: { last: number | null; bars: Bar[]; previousClose: number | null };
  vix: { last: number | null; bars: Bar[] };
  breadth: { spyBars: Bar[]; rspBars: Bar[] };
  yields: { last: number | null; bars: Bar[] };
  inflation?: {
    breakeven10y: Series;
    realYield10y: Series;
  };
  commodities?: {
    oil: Mag7Series;
    gold: Mag7Series;
    btc?: Mag7Series;
    silver?: Mag7Series;
    eth?: Mag7Series;
  };
  /** Soft-fetched Mag7 daily history — may be empty or partial. */
  mag7?: Partial<Record<Mag7Symbol, Mag7Series>>;
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

export type StockQuote = {
  source: string;
  fetchedAt: string;
  delayNote: string;
  symbol: string;
  last: number | null;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  /** ~1y daily closes when available (for per-ticker ArrowBeat lean). */
  bars?: Bar[];
  error?: string;
};

/** On-demand delayed Yahoo quote + history via Netlify / Vite proxy. */
export async function fetchStockQuote(symbol: string): Promise<StockQuote> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker) throw new Error("Enter a ticker symbol.");
  const controller = new AbortController();
  // Quote now pulls ~1y bars for equity signals — give Yahoo more time.
  const timer = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`/api/market/quote?symbol=${encodeURIComponent(ticker)}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await res.json()) as StockQuote & { error?: string };
    if (!res.ok || data.last == null) {
      throw new Error(data.error || `No quote for ${ticker}.`);
    }
    return {
      ...data,
      bars: Array.isArray(data.bars) ? data.bars : [],
    };
  } finally {
    window.clearTimeout(timer);
  }
}

/** Curated watchlist vs rolling ~52-week peak (≥10% = correction). */
export async function fetchStockCorrectionsScan(): Promise<StockCorrectionsScan> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch("/api/market/corrections", {
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await res.json()) as StockCorrectionsScan & { error?: string };
    if (!res.ok || !Array.isArray(data.rows)) {
      throw new Error(data.error || `Corrections scan unavailable (${res.status}).`);
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}
