/**
 * Shared market snapshot builder for Vite dev middleware + Netlify Functions.
 * Free Yahoo Finance + FRED CSV — no API keys.
 *
 * Tuned for Netlify free-tier ~10s function limit: short per-request timeouts
 * and soft failures so the UI always gets a usable payload.
 */

export type Bar = { date: string; close: number };

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        previousClose?: string | number;
        chartPreviousClose?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
      };
    }>;
    error?: { description?: string };
  };
};

export type MarketSnapshotPayload = {
  source: string;
  fetchedAt: string;
  symbols: Record<string, string>;
  spy: { last: number | null; bars: Bar[]; recentBars: Bar[] };
  futures: { last: number | null; bars: Bar[]; previousClose: number | null };
  vix: { last: number | null; bars: Bar[] };
  breadth: { spyBars: Bar[]; rspBars: Bar[] };
  yields: { last: number | null; bars: Bar[] };
  inflation: {
    breakeven10y: { last: number | null; bars: Bar[] };
    realYield10y: { last: number | null; bars: Bar[] };
  };
  commodities: {
    oil: { last: number | null; bars: Bar[] };
    gold: { last: number | null; bars: Bar[] };
  };
};

const FETCH_MS = 2800;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYahooChart(symbol: string, range: string, interval = "1d"): Promise<YahooChart> {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  const attempts = hosts.map(async (host) => {
    const url = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.searchParams.set("interval", interval);
    url.searchParams.set("range", range);
    const res = await fetchWithTimeout(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 ArrowBeat/1.0",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`);
    return (await res.json()) as YahooChart;
  });
  try {
    return await Promise.any(attempts);
  } catch {
    throw new Error(`Yahoo ${symbol} failed`);
  }
}

/** Free FRED CSV (no API key) — used for TIPS real yield + 10Y breakeven. */
async function fetchFredBars(seriesId: string): Promise<Bar[]> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
  const res = await fetchWithTimeout(url, {
    headers: { Accept: "text/csv", "User-Agent": "Mozilla/5.0 ArrowBeat/1.0" },
  });
  if (!res.ok) throw new Error(`FRED ${seriesId} HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/).slice(1);
  const out: Bar[] = [];
  for (const line of lines) {
    const [date, raw] = line.split(",");
    if (!date || !raw || raw === ".") continue;
    const close = Number(raw);
    if (!Number.isFinite(close)) continue;
    out.push({ date, close });
  }
  return out.slice(-280);
}

async function softFred(seriesId: string): Promise<Bar[]> {
  try {
    return await fetchFredBars(seriesId);
  } catch {
    return [];
  }
}

async function softYahoo(symbol: string, range: string): Promise<YahooChart> {
  try {
    return await fetchYahooChart(symbol, range);
  } catch {
    return {};
  }
}

function barsFromChart(data: YahooChart): Bar[] {
  const result = data.chart?.result?.[0];
  if (!result?.timestamp?.length) return [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const metaPrice = result.meta?.regularMarketPrice;
  const out: Bar[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    let close = closes[i];
    if (
      (close == null || !Number.isFinite(close)) &&
      i === result.timestamp.length - 1 &&
      metaPrice != null &&
      Number.isFinite(metaPrice)
    ) {
      close = metaPrice;
    }
    if (close == null || !Number.isFinite(close)) continue;
    const date = new Date(result.timestamp[i] * 1000).toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    out.push({ date, close: Number(close) });
  }
  return out;
}

function lastPrice(data: YahooChart, bars: Bar[]): number | null {
  const meta = data.chart?.result?.[0]?.meta;
  if (meta?.regularMarketPrice != null && Number.isFinite(meta.regularMarketPrice)) {
    return Number(meta.regularMarketPrice);
  }
  return bars.length ? bars[bars.length - 1].close : null;
}

function lastFromBars(bars: Bar[]): number | null {
  return bars.length ? bars[bars.length - 1].close : null;
}

export async function buildMarketSnapshot(): Promise<MarketSnapshotPayload> {
  // Soft fetches so one slow Yahoo call can't 502 the whole Netlify function.
  // Use 5y SPY history (fits free-tier time limits better than 10y).
  const [spyLong, spyShort, vix, es, rsp, tnx, oil, gold, breakevenBars, realYieldBars] =
    await Promise.all([
      softYahoo("SPY", "5y"),
      softYahoo("SPY", "3mo"),
      softYahoo("^VIX", "3mo"),
      softYahoo("ES=F", "5d"),
      softYahoo("RSP", "1mo"),
      softYahoo("^TNX", "1mo"),
      softYahoo("CL=F", "1mo"),
      softYahoo("GC=F", "1mo"),
      softFred("T10YIE"),
      softFred("DFII10"),
    ]);

  const spyBars = barsFromChart(spyLong);
  const spyRecent = barsFromChart(spyShort);
  const vixBars = barsFromChart(vix);
  const esBars = barsFromChart(es);
  const rspBars = barsFromChart(rsp);
  const tnxBars = barsFromChart(tnx);
  const oilBars = barsFromChart(oil);
  const goldBars = barsFromChart(gold);

  if (!spyBars.length && !spyRecent.length) {
    throw new Error("Yahoo Finance returned no SPY history from this host.");
  }

  return {
    source: "yahoo-finance+fred",
    fetchedAt: new Date().toISOString(),
    symbols: {
      spy: "SPY",
      futures: "ES=F",
      vix: "^VIX",
      breadthProxy: "RSP",
      yields: "^TNX",
      breakeven10y: "T10YIE",
      realYield10y: "DFII10",
      oil: "CL=F",
      gold: "GC=F",
    },
    spy: {
      last: lastPrice(spyShort, spyRecent.length ? spyRecent : spyBars),
      bars: spyBars.length ? spyBars : spyRecent,
      recentBars: spyRecent.length ? spyRecent : spyBars.slice(-60),
    },
    futures: {
      last: lastPrice(es, esBars),
      bars: esBars,
      previousClose:
        Number(es.chart?.result?.[0]?.meta?.chartPreviousClose) ||
        (esBars.length > 1 ? esBars[esBars.length - 2].close : null),
    },
    vix: {
      last: lastPrice(vix, vixBars),
      bars: vixBars,
    },
    breadth: {
      spyBars: (spyRecent.length ? spyRecent : spyBars).slice(-15),
      rspBars: rspBars.slice(-15),
    },
    yields: {
      last: lastPrice(tnx, tnxBars),
      bars: tnxBars,
    },
    inflation: {
      breakeven10y: {
        last: lastFromBars(breakevenBars),
        bars: breakevenBars,
      },
      realYield10y: {
        last: lastFromBars(realYieldBars),
        bars: realYieldBars,
      },
    },
    commodities: {
      oil: {
        last: lastPrice(oil, oilBars),
        bars: oilBars,
      },
      gold: {
        last: lastPrice(gold, goldBars),
        bars: goldBars,
      },
    },
  };
}
