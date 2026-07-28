/**
 * One-off: $500/mo SPY DCA — buy on lowest vs highest close each month (oracle).
 * Also reports day-2 and month-end anchors for context.
 * Uses Yahoo 10y SPY adjusted close (same window as ArrowBeat calendar stats).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isNyseTradingDay } from "../src/lib/market-hours.ts";

type Bar = { date: string; close: number };

const MONTHLY = 500;

function ymdKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(year: number, month: number, day: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function isTradingDay(year: number, month: number, day: number): boolean {
  return isNyseTradingDay(new Date(`${ymdKey(year, month, day)}T12:00:00-04:00`));
}

function tradingDayOnOrAfter(year: number, month: number, day: number): string {
  let y = year;
  let m = month;
  let d = day;
  for (let i = 0; i < 14; i++) {
    if (isTradingDay(y, m, d)) return ymdKey(y, m, d);
    ({ year: y, month: m, day: d } = addDays(y, m, d, 1));
  }
  throw new Error(`No trading day on/after ${ymdKey(year, month, day)}`);
}

function tradingDayOnOrBefore(year: number, month: number, day: number): string {
  let y = year;
  let m = month;
  let d = day;
  for (let i = 0; i < 14; i++) {
    if (isTradingDay(y, m, d)) return ymdKey(y, m, d);
    ({ year: y, month: m, day: d } = addDays(y, m, d, -1));
  }
  throw new Error(`No trading day on/before ${ymdKey(year, month, day)}`);
}

function lastCalendarDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseYmd(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y!, month: m!, day: d! };
}

type Buy = { month: string; buyDate: string; price: number; shares: number };

function monthRange(first: ReturnType<typeof parseYmd>, last: ReturnType<typeof parseYmd>) {
  const out: Array<{ year: number; month: number; key: string }> = [];
  let y = first.year;
  let m = first.month;
  while (y < last.year || (y === last.year && m <= last.month)) {
    out.push({ year: y, month: m, key: ymdKey(y, m, 1).slice(0, 7) });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function barsInMonth(bars: Bar[], year: number, month: number): Bar[] {
  const prefix = ymdKey(year, month, 1).slice(0, 7);
  return bars.filter((b) => b.date.startsWith(prefix));
}

function simulateAligned(
  bars: Bar[],
  label: string,
  pickDate: (year: number, month: number, monthBars: Bar[]) => string | null,
  months: Array<{ year: number; month: number; key: string }>,
) {
  const priceByDate = new Map(bars.map((b) => [b.date, b.close]));
  let shares = 0;
  let invested = 0;
  const buys: Buy[] = [];
  const skipped: string[] = [];

  for (const { year, month, key } of months) {
    const monthBars = barsInMonth(bars, year, month);
    const buyDate = pickDate(year, month, monthBars);
    if (buyDate == null) {
      skipped.push(`${key} (no pick)`);
      continue;
    }
    const price = priceByDate.get(buyDate);
    if (price == null) {
      skipped.push(`${key} → ${buyDate} (no bar)`);
      continue;
    }
    const sh = MONTHLY / price;
    shares += sh;
    invested += MONTHLY;
    buys.push({ month: key, buyDate, price, shares: sh });
  }

  const finalPrice = bars[bars.length - 1]!.close;
  const avgBuyPrice = buys.length ? buys.reduce((s, b) => s + b.price, 0) / buys.length : 0;
  return {
    label,
    invested,
    shares,
    endingValue: shares * finalPrice,
    avgBuyPrice,
    buys,
    skipped,
  };
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtPrecise(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

async function fetchYahooSpy(range: string): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 ArrowBeat/1.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const data = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
    };
  };
  const result = data.chart?.result?.[0];
  if (!result?.timestamp?.length) throw new Error("No Yahoo bars");
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const out: Bar[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close)) continue;
    const date = new Date(result.timestamp[i]! * 1000).toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    out.push({ date, close: Number(close) });
  }
  return out;
}

function loadSnapshotBars(): Bar[] {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const snapPath = path.join(dir, "../public/market-snapshot.json");
  const raw = JSON.parse(fs.readFileSync(snapPath, "utf8")) as { spy: { bars: Bar[] } };
  return raw.spy.bars;
}

function pickExtreme(monthBars: Bar[], mode: "low" | "high"): string | null {
  if (!monthBars.length) return null;
  let best = monthBars[0]!;
  for (const b of monthBars) {
    if (mode === "low" ? b.close < best.close : b.close > best.close) best = b;
  }
  return best.date;
}

function pickAvgClose(monthBars: Bar[]): string | null {
  if (!monthBars.length) return null;
  const avg = monthBars.reduce((s, b) => s + b.close, 0) / monthBars.length;
  let best = monthBars[0]!;
  let bestDiff = Math.abs(best.close - avg);
  for (const b of monthBars) {
    const diff = Math.abs(b.close - avg);
    if (diff < bestDiff) {
      best = b;
      bestDiff = diff;
    }
  }
  return best.date;
}

function report(bars: Bar[], source: string) {
  const first = parseYmd(bars[0]!.date);
  const last = parseYmd(bars[bars.length - 1]!.date);
  const months = monthRange(first, last);

  const pickLow = (_y: number, _m: number, monthBars: Bar[]) => pickExtreme(monthBars, "low");
  const pickHigh = (_y: number, _m: number, monthBars: Bar[]) => pickExtreme(monthBars, "high");
  const pickDay2 = (y: number, m: number) => tradingDayOnOrAfter(y, m, 2);
  const pickMonthEnd = (y: number, m: number) =>
    tradingDayOnOrBefore(y, m, lastCalendarDay(y, m));
  const pickAvg = (_y: number, _m: number, monthBars: Bar[]) => pickAvgClose(monthBars);

  const priceByDate = new Map(bars.map((b) => [b.date, b.close]));

  const alignedMonths = months.filter(({ year, month }) => {
    const monthBars = barsInMonth(bars, year, month);
    if (!monthBars.length) return false;
    const low = pickLow(year, month, monthBars);
    const high = pickHigh(year, month, monthBars);
    const d2 = pickDay2(year, month);
    const me = pickMonthEnd(year, month);
    const avg = pickAvg(year, month, monthBars);
    return (
      low != null &&
      high != null &&
      avg != null &&
      priceByDate.has(d2) &&
      priceByDate.has(me)
    );
  });

  const lowDay = simulateAligned(bars, "Lowest close (oracle)", pickLow, alignedMonths);
  const highDay = simulateAligned(bars, "Highest close (oracle)", pickHigh, alignedMonths);
  const day2 = simulateAligned(
    bars,
    "Day 2 (anchor)",
    (y, m) => pickDay2(y, m),
    alignedMonths,
  );
  const monthEnd = simulateAligned(
    bars,
    "Month-end (anchor)",
    (y, m) => pickMonthEnd(y, m),
    alignedMonths,
  );
  const avgDay = simulateAligned(bars, "Nearest-to-avg close (anchor)", pickAvg, alignedMonths);

  const diff = lowDay.endingValue - highDay.endingValue;
  const diffPctInvested = (diff / lowDay.invested) * 100;
  const diffPctEnding = (diff / highDay.endingValue) * 100;

  console.log(`\n=== SPY $${MONTHLY}/mo DCA — lowest vs highest day — ${source} ===`);
  console.log(`Ticker: SPY (Yahoo adjusted close)`);
  const firstBuy = alignedMonths[0]?.key ?? "?";
  const lastBuy = alignedMonths[alignedMonths.length - 1]?.key ?? "?";
  console.log(
    `Period: ${bars[0]!.date} → ${bars[bars.length - 1]!.date} | DCA months ${firstBuy} → ${lastBuy}`,
  );
  console.log(`Months invested: ${lowDay.buys.length} | Total invested: ${fmt(lowDay.invested)} each`);
  console.log(`Final SPY close (${bars[bars.length - 1]!.date}): ${fmtPrecise(bars[bars.length - 1]!.close)}`);
  console.log("");

  const rows = [lowDay, highDay, day2, monthEnd, avgDay];
  for (const r of rows) {
    console.log(`${r.label}:`);
    console.log(`  Ending value:    ${fmt(r.endingValue)}`);
    console.log(`  Shares held:     ${r.shares.toFixed(4)}`);
    console.log(`  Avg buy price:   ${fmtPrecise(r.avgBuyPrice)}`);
    console.log("");
  }

  console.log(`Headline — lowest-day vs highest-day (perfect foresight within each month):`);
  console.log(`  Low-day ending:  ${fmt(lowDay.endingValue)}`);
  console.log(`  High-day ending: ${fmt(highDay.endingValue)}`);
  console.log(`  Absolute gap:    ${diff >= 0 ? "+" : ""}${fmt(diff)} (low-day wins)`);
  console.log(`  vs total invested: ${fmtPct(diffPctInvested)}`);
  console.log(`  vs high-day ending wealth: ${fmtPct(diffPctEnding)}`);

  const lowVsDay2 = lowDay.endingValue - day2.endingValue;
  const lowVsMonthEnd = lowDay.endingValue - monthEnd.endingValue;
  console.log("");
  console.log(`Context — how much oracle timing beats realistic anchors:`);
  console.log(`  Low-day vs day-2:      ${lowVsDay2 >= 0 ? "+" : ""}${fmt(lowVsDay2)} (${fmtPct((lowVsDay2 / day2.invested) * 100)} of invested)`);
  console.log(`  Low-day vs month-end:  ${lowVsMonthEnd >= 0 ? "+" : ""}${fmt(lowVsMonthEnd)} (${fmtPct((lowVsMonthEnd / monthEnd.invested) * 100)} of invested)`);
  console.log(`  Day-2 vs month-end:    ${day2.endingValue - monthEnd.endingValue >= 0 ? "+" : ""}${fmt(day2.endingValue - monthEnd.endingValue)}`);

  const gapPctOfInvested = diffPctInvested;
  let significance: string;
  if (Math.abs(gapPctOfInvested) >= 20) {
    significance = "Large — timing within the month would materially change a decade of DCA wealth.";
  } else if (Math.abs(gapPctOfInvested) >= 5) {
    significance = "Moderate — meaningful but not life-changing over this horizon.";
  } else {
    significance = "Modest — a few percent of capital over ~10 years; real but smaller than long-run market drift.";
  }
  console.log("");
  console.log(`Significance: ${significance}`);
  console.log(
    `Caveat: Lowest/highest picks use perfect foresight — an upper bound on within-month timing skill, not achievable in practice.`,
  );

  return { lowDay, highDay, day2, monthEnd, diff, diffPctInvested };
}

const snapshotBars = loadSnapshotBars();
report(snapshotBars, "ArrowBeat cached snapshot (~5y Yahoo)");

try {
  const tenYBars = await fetchYahooSpy("10y");
  if (tenYBars.length > 100) {
    report(tenYBars, "Yahoo SPY 10y (matches ArrowBeat calendar stats window)");
  }
} catch (e) {
  console.error("\n(Yahoo 10y fetch skipped:", e instanceof Error ? e.message : e, ")");
}
