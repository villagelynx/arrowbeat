/**
 * Soft-fetch a curated watchlist and score each name vs a rolling ~52-week peak.
 * Separate from the dashboard snapshot so Mag7 timeouts don't block the home desk.
 */

import {
  STOCK_CORRECTION_WATCHLIST,
  scanSeriesForCorrection,
  summarizeCorrectionRows,
  type StockCorrectionsScan,
} from "../src/lib/stock-corrections";
import { barsFromChart, lastPrice, softYahoo } from "./market-snapshot";

export async function buildStockCorrectionsScan(): Promise<StockCorrectionsScan> {
  const charts = await Promise.all(
    STOCK_CORRECTION_WATCHLIST.map(({ symbol }) => softYahoo(symbol, "1y")),
  );

  const rows = STOCK_CORRECTION_WATCHLIST.flatMap((item, i) => {
    const chart = charts[i];
    const bars = barsFromChart(chart);
    const last = lastPrice(chart, bars);
    const row = scanSeriesForCorrection(item.symbol, item.name, bars, last);
    return row ? [row] : [];
  });

  return summarizeCorrectionRows(rows, {
    fetchedAt: new Date().toISOString(),
    delayNote: "~15m delayed (Yahoo free quotes)",
    source: "yahoo-finance",
    universeLabel: `${STOCK_CORRECTION_WATCHLIST.length} liquid names · Mag7 + indexes`,
  });
}
