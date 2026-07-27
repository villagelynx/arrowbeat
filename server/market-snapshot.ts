/**
 * Shared market snapshot builder for Vite dev middleware + Netlify Functions.
 * Free Yahoo Finance + FRED CSV — no API keys.
 *
 * Tuned for Netlify free-tier ~10s function limit: short per-request timeouts
 * and soft failures so the UI always gets a usable payload.
 */

export type Bar = { date: string; close: number };

/** Intraday session bar (Yahoo 15m — typically ~15 min delayed, free). */
export type IntradayBar = {
  date: string;
  label: string;
  close: number;
  ts: number;
};

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

/** Magnificent 7 Yahoo tickers (soft-fetched; may be empty on timeout). */
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

export type Mag7Series = {
  last: number | null;
  previousClose: number | null;
  /** ~1y daily closes when Yahoo responds in time. */
  bars: Bar[];
};

export type MarketSnapshotPayload = {
  source: string;
  fetchedAt: string;
  /** Free Yahoo quotes are typically ~15 minutes delayed. */
  delayNote?: string;
  symbols: Record<string, string>;
  spy: {
    last: number | null;
    bars: Bar[];
    recentBars: Bar[];
    /** Free Yahoo 15-minute session bars (~15 min delayed). */
    dayBars?: IntradayBar[];
    dayPrevClose?: number | null;
  };
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
  /** Mag7 daily series — soft-fail empty object if Yahoo is slow. */
  mag7: Partial<Record<Mag7Symbol, Mag7Series>>;
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

async function softYahoo(
  symbol: string,
  range: string,
  interval = "1d",
): Promise<YahooChart> {
  try {
    return await fetchYahooChart(symbol, range, interval);
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

function intradayBarsFromChart(data: YahooChart): IntradayBar[] {
  const result = data.chart?.result?.[0];
  if (!result?.timestamp?.length) return [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const out: IntradayBar[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close)) continue;
    const at = new Date(result.timestamp[i] * 1000);
    const date = at.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    }).format(at);
    out.push({ date, label, close: Number(close), ts: result.timestamp[i] });
  }
  return out;
}

/** Keep daily series tip current with delayed last print when Yahoo has today. */
function withDelayedLast(bars: Bar[], last: number | null, asOfDate: string): Bar[] {
  if (last == null || !Number.isFinite(last) || !bars.length) return bars;
  const next = bars.slice();
  const tip = next[next.length - 1];
  if (tip.date === asOfDate) {
    next[next.length - 1] = { ...tip, close: last };
  } else if (tip.date < asOfDate) {
    next.push({ date: asOfDate, close: last });
  }
  return next;
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

function mag7FromChart(data: YahooChart): Mag7Series {
  const bars = barsFromChart(data);
  const last = lastPrice(data, bars);
  const previousClose =
    Number(data.chart?.result?.[0]?.meta?.chartPreviousClose) ||
    Number(data.chart?.result?.[0]?.meta?.previousClose) ||
    (bars.length > 1 ? bars[bars.length - 2].close : null);
  return {
    last,
    previousClose: previousClose && Number.isFinite(previousClose) ? previousClose : null,
    bars,
  };
}

export type StockQuotePayload = {
  symbol: string;
  last: number | null;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  delayNote: string;
  fetchedAt: string;
  source: string;
};

/** Normalize user ticker input for Yahoo chart paths. */
export function sanitizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "").slice(0, 16);
}

/**
 * On-demand delayed quote for an arbitrary ticker (single soft Yahoo call).
 * Fast enough for Netlify free-tier; returns nulls when Yahoo fails.
 */
export async function buildStockQuote(rawSymbol: string): Promise<StockQuotePayload> {
  const symbol = sanitizeTicker(rawSymbol);
  if (!symbol || !/^[A-Z0-9.^*=-]{1,16}$/.test(symbol)) {
    throw new Error("Enter a valid ticker (letters, numbers, . ^ = -).");
  }

  const chart = await softYahoo(symbol, "5d");
  const series = mag7FromChart(chart);
  const last = series.last;
  const previousClose = series.previousClose;
  const change =
    last != null && previousClose != null && Number.isFinite(last) && Number.isFinite(previousClose)
      ? last - previousClose
      : null;
  const changePct =
    change != null && previousClose != null && previousClose !== 0
      ? (change / previousClose) * 100
      : null;

  if (last == null && !series.bars.length) {
    throw new Error(`No quote returned for ${symbol}.`);
  }

  return {
    symbol,
    last,
    previousClose,
    change: change != null ? Math.round(change * 100) / 100 : null,
    changePct: changePct != null ? Math.round(changePct * 100) / 100 : null,
    delayNote: "Yahoo free quotes ~15 minutes delayed",
    fetchedAt: new Date().toISOString(),
    source: "yahoo-finance",
  };
}

/** Soft Mag7 history after core SPY/FRED — keeps SPY usable if Mag7 is slow. */
async function softFetchMag7(): Promise<Partial<Record<Mag7Symbol, Mag7Series>>> {
  const charts = await Promise.all(MAG7_SYMBOLS.map((symbol) => softYahoo(symbol, "1y")));
  const out: Partial<Record<Mag7Symbol, Mag7Series>> = {};
  for (let i = 0; i < MAG7_SYMBOLS.length; i++) {
    const series = mag7FromChart(charts[i]);
    if (series.bars.length || series.last != null) {
      out[MAG7_SYMBOLS[i]] = series;
    }
  }
  return out;
}

export async function buildMarketSnapshot(): Promise<MarketSnapshotPayload> {
  // Soft fetches so one slow Yahoo call can't 502 the whole Netlify function.
  // Use 5y SPY history (fits free-tier time limits better than 10y).
  // SPY 15m/1d is free delayed (~15 min) intraday for the day chart.
  // Mag7 1y daily runs in parallel (soft-fail) — same wall-clock budget as core.
  const [
    spyLong,
    spyShort,
    spyDay,
    vix,
    es,
    rsp,
    tnx,
    oil,
    gold,
    breakevenBars,
    realYieldBars,
    mag7,
  ] = await Promise.all([
    softYahoo("SPY", "5y"),
    softYahoo("SPY", "3mo"),
    softYahoo("SPY", "1d", "15m"),
    softYahoo("^VIX", "3mo"),
    softYahoo("ES=F", "5d"),
    softYahoo("RSP", "1mo"),
    softYahoo("^TNX", "1mo"),
    softYahoo("CL=F", "1mo"),
    softYahoo("GC=F", "1mo"),
    softFred("T10YIE"),
    softFred("DFII10"),
    softFetchMag7(),
  ]);

  const dayBars = intradayBarsFromChart(spyDay);
  const delayedLast =
    lastPrice(spyDay, []) ??
    (dayBars.length ? dayBars[dayBars.length - 1].close : null);
  const asOfDate =
    dayBars.length > 0
      ? dayBars[dayBars.length - 1].date
      : new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  let spyBars = barsFromChart(spyLong);
  let spyRecent = barsFromChart(spyShort);
  spyBars = withDelayedLast(spyBars, delayedLast, asOfDate);
  spyRecent = withDelayedLast(spyRecent, delayedLast, asOfDate);

  const dayPrevClose =
    Number(spyDay.chart?.result?.[0]?.meta?.chartPreviousClose) ||
    Number(spyDay.chart?.result?.[0]?.meta?.previousClose) ||
    (spyRecent.length > 1 ? spyRecent[spyRecent.length - 2].close : null);

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
    delayNote: "Yahoo free quotes ~15 minutes delayed",
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
      mag7: MAG7_SYMBOLS.join(","),
    },
    spy: {
      last:
        delayedLast ??
        lastPrice(spyShort, spyRecent.length ? spyRecent : spyBars),
      bars: spyBars.length ? spyBars : spyRecent,
      recentBars: spyRecent.length ? spyRecent : spyBars.slice(-60),
      dayBars,
      dayPrevClose: dayPrevClose && Number.isFinite(dayPrevClose) ? dayPrevClose : null,
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
    mag7,
  };
}
