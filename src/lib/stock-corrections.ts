import type { Bar } from "./market-data.js";
import {
  CORRECTION_THRESHOLD_PCT,
  CRASH_THRESHOLD_PCT,
} from "./correction-history.js";
import {
  PEAK_LOOKBACK,
  drawdownPct,
  rollingPeak,
  validBars,
} from "./drawdown-probability.js";

export { CORRECTION_THRESHOLD_PCT, CRASH_THRESHOLD_PCT };

export type StockCorrectionStatus = "near-high" | "pullback" | "correction" | "crash";

export type StockCorrectionRow = {
  symbol: string;
  name: string;
  last: number;
  peak52w: number;
  drawdownPct: number;
  status: StockCorrectionStatus;
  inCorrection: boolean;
  inCrash: boolean;
  asOfDate: string;
  /** Trading days of history used for the rolling peak. */
  sampleDays: number;
};

export type StockCorrectionsScan = {
  fetchedAt: string;
  delayNote: string;
  source: string;
  universeLabel: string;
  scanned: number;
  inCorrection: number;
  inCrash: number;
  rows: StockCorrectionRow[];
};

/** Curated liquid names + Mag7 + major indexes — soft-fetched for the corrections desk. */
export const STOCK_CORRECTION_WATCHLIST: ReadonlyArray<{ symbol: string; name: string }> = [
  { symbol: "SPY", name: "S&P 500 ETF" },
  { symbol: "QQQ", name: "Nasdaq-100 ETF" },
  { symbol: "IWM", name: "Russell 2000 ETF" },
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "META", name: "Meta" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "NFLX", name: "Netflix" },
  { symbol: "AMD", name: "AMD" },
  { symbol: "AVGO", name: "Broadcom" },
  { symbol: "JPM", name: "JPMorgan" },
  { symbol: "XOM", name: "Exxon Mobil" },
  { symbol: "UNH", name: "UnitedHealth" },
  { symbol: "BA", name: "Boeing" },
  { symbol: "DIS", name: "Disney" },
  { symbol: "COIN", name: "Coinbase" },
  { symbol: "SMCI", name: "Super Micro" },
];

export function classifyStockDrawdown(ddPct: number): StockCorrectionStatus {
  if (ddPct <= -CRASH_THRESHOLD_PCT) return "crash";
  if (ddPct <= -CORRECTION_THRESHOLD_PCT) return "correction";
  if (ddPct <= -5) return "pullback";
  return "near-high";
}

/**
 * Distance from rolling ~252-session peak — same rule as SPY correction odds.
 * Returns null when history is too thin.
 */
export function scanSeriesForCorrection(
  symbol: string,
  name: string,
  bars: Bar[],
  lastOverride?: number | null,
): StockCorrectionRow | null {
  const clean = validBars(bars);
  if (clean.length < 40) return null;

  const closes = clean.map((b) => b.close);
  const tip = closes.length - 1;
  const last =
    lastOverride != null && Number.isFinite(lastOverride) ? lastOverride : closes[tip];
  if (!Number.isFinite(last) || last <= 0) return null;

  const peak = rollingPeak(closes, tip);
  if (!(peak > 0)) return null;
  const dd = drawdownPct(last, peak);
  const status = classifyStockDrawdown(dd);

  return {
    symbol,
    name,
    last: Math.round(last * 100) / 100,
    peak52w: Math.round(peak * 100) / 100,
    drawdownPct: Math.round(dd * 100) / 100,
    status,
    inCorrection: dd <= -CORRECTION_THRESHOLD_PCT,
    inCrash: dd <= -CRASH_THRESHOLD_PCT,
    asOfDate: clean[tip].date,
    sampleDays: Math.min(clean.length, PEAK_LOOKBACK),
  };
}

export function sortCorrectionRows(rows: StockCorrectionRow[]): StockCorrectionRow[] {
  return [...rows].sort(
    (a, b) =>
      a.drawdownPct - b.drawdownPct ||
      a.symbol.localeCompare(b.symbol),
  );
}

export function summarizeCorrectionRows(
  rows: StockCorrectionRow[],
  meta: {
    fetchedAt: string;
    delayNote?: string;
    source?: string;
    universeLabel?: string;
  },
): StockCorrectionsScan {
  const sorted = sortCorrectionRows(rows);
  return {
    fetchedAt: meta.fetchedAt,
    delayNote: meta.delayNote ?? "~15m delayed (Yahoo free quotes)",
    source: meta.source ?? "yahoo-finance",
    universeLabel:
      meta.universeLabel ??
      `${STOCK_CORRECTION_WATCHLIST.length} liquid names · Mag7 + indexes`,
    scanned: sorted.length,
    inCorrection: sorted.filter((r) => r.inCorrection).length,
    inCrash: sorted.filter((r) => r.inCrash).length,
    rows: sorted,
  };
}
