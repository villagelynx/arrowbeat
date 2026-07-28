/**
 * Writes long-run S&P 500 daily history for correction charts.
 * Yahoo ^GSPC with range=100y (~1928–present). Runs at build time.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type Bar = { date: string; close: number };

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

async function fetchGspc100y(): Promise<Bar[]> {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  for (const host of hosts) {
    const url = new URL(`https://${host}/v8/finance/chart/%5EGSPC`);
    url.searchParams.set("interval", "1d");
    url.searchParams.set("range", "100y");
    try {
      const res = await fetch(url.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 ArrowBeat/1.0", Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as YahooChart;
      const result = data.chart?.result?.[0];
      const ts = result?.timestamp ?? [];
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      const out: Bar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const close = closes[i];
        if (close == null || !Number.isFinite(close) || close <= 0) continue;
        const date = new Date(ts[i] * 1000).toLocaleDateString("en-CA", {
          timeZone: "America/New_York",
        });
        out.push({ date, close: Number(close) });
      }
      if (out.length > 1000) return out;
    } catch {
      // try next host
    }
  }
  throw new Error("Yahoo ^GSPC 100y fetch failed");
}

function rangeLabel(start: string, end: string): string {
  const y0 = start.slice(0, 4);
  const y1 = end.slice(0, 4);
  return y0 === y1 ? y0 : `${y0}–${y1}`;
}

async function main() {
  const outDir = path.join(process.cwd(), "public");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "sp500-history.json");

  try {
    const bars = await fetchGspc100y();
    const startDate = bars[0].date;
    const endDate = bars[bars.length - 1].date;
    const payload = {
      source: "yahoo-finance",
      symbol: "^GSPC",
      label: "S&P 500",
      fetchedAt: new Date().toISOString(),
      startDate,
      endDate,
      rangeLabel: rangeLabel(startDate, endDate),
      bars,
    };
    writeFileSync(outPath, `${JSON.stringify(payload)}\n`);
    console.log(
      `[sp500-history] wrote ${outPath} (${bars.length} bars, ${payload.rangeLabel})`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[sp500-history] live fetch failed: ${message}`);
    console.warn("[sp500-history] keeping existing public/sp500-history.json if present");
  }
}

main();
