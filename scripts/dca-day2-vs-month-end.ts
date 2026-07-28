/**
 * One-off: $500/mo SPY DCA — buy on calendar day 2 vs last calendar day of month.
 * Uses ArrowBeat cached snapshot + NYSE trading-day rules from market-hours.
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

/** First NYSE session on or after calendar day. */
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

/** Last NYSE session on or before calendar day. */
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

function simulateAligned(
  bars: Bar[],
  label: string,
  pickDate: (year: number, month: number) => string,
  months: Array<{ year: number; month: number; key: string }>,
): {
  label: string;
  invested: number;
  shares: number;
  endingValue: number;
  buys: Buy[];
  skipped: string[];
} {
  const priceByDate = new Map(bars.map((b) => [b.date, b.close]));
  let shares = 0;
  let invested = 0;
  const buys: Buy[] = [];
  const skipped: string[] = [];

  for (const { year, month, key } of months) {
    const buyDate = pickDate(year, month);
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
  return {
    label,
    invested,
    shares,
    endingValue: shares * finalPrice,
    buys,
    skipped,
  };
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
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

function report(bars: Bar[], source: string) {
  const first = parseYmd(bars[0]!.date);
  const last = parseYmd(bars[bars.length - 1]!.date);
  const months = monthRange(first, last);
  const priceByDate = new Map(bars.map((b) => [b.date, b.close]));

  const pickDay2 = (y: number, m: number) => tradingDayOnOrAfter(y, m, 2);
  const pickMonthEnd = (y: number, m: number) =>
    tradingDayOnOrBefore(y, m, lastCalendarDay(y, m));

  // Only months where BOTH strategies have a valid close in our bar set.
  const alignedMonths = months.filter(({ year, month, key }) => {
    const d2 = pickDay2(year, month);
    const me = pickMonthEnd(year, month);
    return priceByDate.has(d2) && priceByDate.has(me);
  });

  const day2 = simulateAligned(bars, "Day 2 (on/after 2nd)", pickDay2, alignedMonths);
  const monthEnd = simulateAligned(
    bars,
    "Month-end (on/before last day)",
    pickMonthEnd,
    alignedMonths,
  );

  const diff = monthEnd.endingValue - day2.endingValue;
  const diffPctInvested = (diff / day2.invested) * 100;
  const diffPctEnding = (diff / day2.endingValue) * 100;

  console.log(`\n=== SPY $${MONTHLY}/mo DCA — ${source} ===`);
  const firstBuy = alignedMonths[0]?.key ?? "?";
  const lastBuy = alignedMonths[alignedMonths.length - 1]?.key ?? "?";
  console.log(
    `Period: ${bars[0]!.date} → ${bars[bars.length - 1]!.date} | DCA months ${firstBuy} → ${lastBuy} (${day2.buys.length} buys each)`,
  );
  console.log(`Final SPY close (${bars[bars.length - 1]!.date}): ${fmt(bars[bars.length - 1]!.close)}`);
  console.log("");
  console.log(`Strategy A — buy on calendar day 2 (next trading day if closed):`);
  console.log(`  Total invested:  ${fmt(day2.invested)}`);
  console.log(`  Shares held:     ${day2.shares.toFixed(4)}`);
  console.log(`  Ending value:    ${fmt(day2.endingValue)}`);
  console.log(`  Gain vs cost:    ${fmt(day2.endingValue - day2.invested)} (${fmtPct(((day2.endingValue - day2.invested) / day2.invested) * 100)})`);
  console.log("");
  console.log(`Strategy B — buy on last calendar day (prior trading day if closed):`);
  console.log(`  Total invested:  ${fmt(monthEnd.invested)}`);
  console.log(`  Shares held:     ${monthEnd.shares.toFixed(4)}`);
  console.log(`  Ending value:    ${fmt(monthEnd.endingValue)}`);
  console.log(`  Gain vs cost:    ${fmt(monthEnd.endingValue - monthEnd.invested)} (${fmtPct(((monthEnd.endingValue - monthEnd.invested) / monthEnd.invested) * 100)})`);
  console.log("");
  console.log(`Month-end vs day-2:`);
  console.log(`  Absolute:        ${diff >= 0 ? "+" : ""}${fmt(diff)}`);
  console.log(`  vs total invested: ${fmtPct(diffPctInvested)}`);
  console.log(`  vs day-2 ending:   ${fmtPct(diffPctEnding)}`);

  if (day2.skipped.length || monthEnd.skipped.length) {
    console.log("\nSkipped months (missing bar):");
    for (const s of [...new Set([...day2.skipped, ...monthEnd.skipped])].slice(0, 8)) {
      console.log(`  ${s}`);
    }
  }

  // Show a few side-by-side buy dates where prices differ most
  if (day2.buys.length) {
    const avgDay2 = day2.buys.reduce((s, p) => s + p.price, 0) / day2.buys.length;
    const avgEnd = monthEnd.buys.reduce((s, p) => s + p.price, 0) / monthEnd.buys.length;
    console.log(`\nAvg buy price — day 2: ${fmt(avgDay2)} | month-end: ${fmt(avgEnd)}`);
    const monthEndCheaper = monthEnd.buys.filter((b, i) => b.price < day2.buys[i]!.price).length;
    console.log(
      `Months where month-end price < day-2 price: ${monthEndCheaper} of ${day2.buys.length}`,
    );
  }

  return { day2, monthEnd, diff };
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
