/**
 * $500/mo DCA — lowest vs highest close each month (oracle), plus day-2 vs month-end.
 * Mag7-style liquid names, Yahoo 10y adjusted close.
 */
import { isNyseTradingDay } from "../src/lib/market-hours.ts";

type Bar = { date: string; close: number };

const MONTHLY = 500;
const TICKERS = ["SPY", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA"] as const;
const MIN_BARS = 100;
const MIN_MONTHS = 60;

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
  pickDate: (year: number, month: number, monthBars: Bar[]) => string | null,
  months: Array<{ year: number; month: number; key: string }>,
) {
  const priceByDate = new Map(bars.map((b) => [b.date, b.close]));
  let shares = 0;
  let invested = 0;
  const buys: Buy[] = [];

  for (const { year, month } of months) {
    const monthBars = barsInMonth(bars, year, month);
    const buyDate = pickDate(year, month, monthBars);
    if (buyDate == null) continue;
    const price = priceByDate.get(buyDate);
    if (price == null) continue;
    const sh = MONTHLY / price;
    shares += sh;
    invested += MONTHLY;
    buys.push({ month: ymdKey(year, month, 1).slice(0, 7), buyDate, price, shares: sh });
  }

  const finalPrice = bars[bars.length - 1]!.close;
  const avgBuyPrice = buys.length ? buys.reduce((s, b) => s + b.price, 0) / buys.length : 0;
  return { invested, shares, endingValue: shares * finalPrice, avgBuyPrice, buys };
}

function pickExtreme(monthBars: Bar[], mode: "low" | "high"): string | null {
  if (!monthBars.length) return null;
  let best = monthBars[0]!;
  for (const b of monthBars) {
    if (mode === "low" ? b.close < best.close : b.close > best.close) best = b;
  }
  return best.date;
}

async function fetchYahooBars(ticker: string, range: string): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${encodeURIComponent(range)}`;
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

type TickerResult = {
  ticker: string;
  period: string;
  months: number;
  invested: number;
  lowEnding: number;
  highEnding: number;
  gap: number;
  gapPctInvested: number;
  lowAvgBuy: number;
  highAvgBuy: number;
  day2Ending: number;
  monthEndEnding: number;
  day2VsMonthEnd: number;
  finalClose: number;
};

function analyzeTicker(ticker: string, bars: Bar[]): TickerResult | null {
  const first = parseYmd(bars[0]!.date);
  const last = parseYmd(bars[bars.length - 1]!.date);
  const months = monthRange(first, last);

  const pickLow = (_y: number, _m: number, monthBars: Bar[]) => pickExtreme(monthBars, "low");
  const pickHigh = (_y: number, _m: number, monthBars: Bar[]) => pickExtreme(monthBars, "high");
  const pickDay2 = (y: number, m: number) => tradingDayOnOrAfter(y, m, 2);
  const pickMonthEnd = (y: number, m: number) =>
    tradingDayOnOrBefore(y, m, lastCalendarDay(y, m));

  const priceByDate = new Map(bars.map((b) => [b.date, b.close]));

  const alignedMonths = months.filter(({ year, month }) => {
    const monthBars = barsInMonth(bars, year, month);
    if (!monthBars.length) return false;
    const low = pickLow(year, month, monthBars);
    const high = pickHigh(year, month, monthBars);
    const d2 = pickDay2(year, month);
    const me = pickMonthEnd(year, month);
    return low != null && high != null && priceByDate.has(d2) && priceByDate.has(me);
  });

  if (alignedMonths.length < MIN_MONTHS) return null;

  const lowDay = simulateAligned(bars, pickLow, alignedMonths);
  const highDay = simulateAligned(bars, pickHigh, alignedMonths);
  const day2 = simulateAligned(bars, (y, m) => pickDay2(y, m), alignedMonths);
  const monthEnd = simulateAligned(bars, (y, m) => pickMonthEnd(y, m), alignedMonths);

  const gap = lowDay.endingValue - highDay.endingValue;
  const firstBuy = alignedMonths[0]!.key;
  const lastBuy = alignedMonths[alignedMonths.length - 1]!.key;

  return {
    ticker,
    period: `${bars[0]!.date} → ${bars[bars.length - 1]!.date} (${firstBuy} → ${lastBuy})`,
    months: lowDay.buys.length,
    invested: lowDay.invested,
    lowEnding: lowDay.endingValue,
    highEnding: highDay.endingValue,
    gap,
    gapPctInvested: (gap / lowDay.invested) * 100,
    lowAvgBuy: lowDay.avgBuyPrice,
    highAvgBuy: highDay.avgBuyPrice,
    day2Ending: day2.endingValue,
    monthEndEnding: monthEnd.endingValue,
    day2VsMonthEnd: day2.endingValue - monthEnd.endingValue,
    finalClose: bars[bars.length - 1]!.close,
  };
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtPrecise(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

console.log(`\n=== $${MONTHLY}/mo DCA — oracle low vs high close (Yahoo 10y) ===\n`);

const results: TickerResult[] = [];
const skipped: string[] = [];

for (const ticker of TICKERS) {
  try {
    const bars = await fetchYahooBars(ticker, "10y");
    if (bars.length < MIN_BARS) {
      skipped.push(`${ticker}: only ${bars.length} bars`);
      continue;
    }
    const r = analyzeTicker(ticker, bars);
    if (!r) {
      skipped.push(`${ticker}: insufficient aligned months`);
      continue;
    }
    results.push(r);
  } catch (e) {
    skipped.push(`${ticker}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

for (const r of results) {
  console.log(`--- ${r.ticker} ---`);
  console.log(`Period: ${r.period}`);
  console.log(`Months: ${r.months} | Invested: ${fmt(r.invested)} each`);
  console.log(`Final close: ${fmtPrecise(r.finalClose)}`);
  console.log(`Low-day ending:   ${fmt(r.lowEnding)}  (avg buy ${fmtPrecise(r.lowAvgBuy)})`);
  console.log(`High-day ending:  ${fmt(r.highEnding)}  (avg buy ${fmtPrecise(r.highAvgBuy)})`);
  console.log(`Oracle gap:       ${r.gap >= 0 ? "+" : ""}${fmt(r.gap)} (${fmtPct(r.gapPctInvested)} of invested)`);
  console.log(`Day-2 ending:     ${fmt(r.day2Ending)}`);
  console.log(`Month-end ending: ${fmt(r.monthEndEnding)}`);
  console.log(`Day-2 vs month-end: ${r.day2VsMonthEnd >= 0 ? "+" : ""}${fmt(r.day2VsMonthEnd)}`);
  console.log("");
}

if (skipped.length) {
  console.log(`Skipped: ${skipped.join("; ")}`);
  console.log("");
}

const stocks = results.filter((r) => r.ticker !== "SPY");
const spy = results.find((r) => r.ticker === "SPY");

if (stocks.length) {
  const avgGap = stocks.reduce((s, r) => s + r.gap, 0) / stocks.length;
  const avgGapPct = stocks.reduce((s, r) => s + r.gapPctInvested, 0) / stocks.length;
  const minGap = stocks.reduce((a, r) => (r.gap < a.gap ? r : a));
  const maxGap = stocks.reduce((a, r) => (r.gap > a.gap ? r : a));

  console.log("=== Summary (individual stocks, ex-SPY) ===");
  console.log(`Average oracle gap: ${fmt(avgGap)} (${fmtPct(avgGapPct)} of invested)`);
  console.log(`Range: ${minGap.ticker} ${fmt(minGap.gap)} (${fmtPct(minGap.gapPctInvested)}) → ${maxGap.ticker} ${fmt(maxGap.gap)} (${fmtPct(maxGap.gapPctInvested)})`);
  if (spy) {
    console.log(`SPY benchmark: ${fmt(spy.gap)} (${fmtPct(spy.gapPctInvested)} of invested)`);
    console.log(
      `Stocks avg vs SPY: ${avgGap > spy.gap ? "larger" : "smaller"} gap by ${fmt(Math.abs(avgGap - spy.gap))}`,
    );
  }
}
