/**
 * Writes a static snapshot for Netlify when the live function can't reach Yahoo.
 * Runs during `npm run build` on Netlify's build machines (Yahoo usually works there).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildMarketSnapshot } from "../server/market-snapshot";

async function main() {
  const outDir = path.join(process.cwd(), "public");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "market-snapshot.json");

  try {
    const snapshot = await buildMarketSnapshot();
    writeFileSync(outPath, `${JSON.stringify(snapshot)}\n`);
    const mag7Count = Object.keys(snapshot.mag7 ?? {}).length;
    console.log(
      `[market-snapshot] wrote ${outPath} (SPY last=${snapshot.spy.last}, bars=${snapshot.spy.bars.length}, dayBars=${snapshot.spy.dayBars?.length ?? 0}, mag7=${mag7Count}/7)`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[market-snapshot] live fetch failed: ${message}`);
    // Keep a minimal stub so the client still gets JSON instead of a 404.
    writeFileSync(
      outPath,
      `${JSON.stringify({
        source: "build-stub",
        fetchedAt: new Date().toISOString(),
        error: message,
        symbols: {},
        spy: { last: null, bars: [], recentBars: [] },
        futures: { last: null, bars: [], previousClose: null },
        vix: { last: null, bars: [] },
        breadth: { spyBars: [], rspBars: [] },
        yields: { last: null, bars: [] },
        inflation: {
          breakeven10y: { last: null, bars: [] },
          realYield10y: { last: null, bars: [] },
        },
        commodities: {
          oil: { last: null, bars: [] },
          gold: { last: null, bars: [] },
        },
        mag7: {},
      })}\n`,
    );
  }
}

main();
