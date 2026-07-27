import type { MarketSnapshot, Bar, Mag7Symbol } from "./market-data";
import { buildCpiWindowInsight, type CpiWindowInsight } from "./cpi-calendar";

export type Bias = "up" | "down";

export const MAG7_META: { symbol: Mag7Symbol; name: string }[] = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "META", name: "Meta" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "TSLA", name: "Tesla" },
];

export type Mag7Signal = {
  symbol: Mag7Symbol;
  name: string;
  bias: Bias;
  probabilityHigher: number;
  probabilityLower: number;
  confidence: 1 | 2 | 3 | 4 | 5;
  confidenceLabel: string;
  last: number | null;
  /** Day change vs prior close, in percent points (e.g. 1.25 = +1.25%). */
  changePct: number | null;
  /** False when Yahoo soft-failed or history is too thin. */
  available: boolean;
};

export type Factor = {
  id: string;
  label: string;
  supports: Bias;
  detail: string;
};

export type SessionDay = {
  date: string;
  weekday: string;
  bias: Bias;
  changePct: number;
  /** Historical P(higher close) for this weekday from ~10y SPY. */
  histUpPct: number | null;
  histRank: number | null;
};

export type WeekdayOdds = {
  weekday: string; // Mon … Fri
  weekdayIndex: number;
  upPct: number;
  downPct: number;
  avgMovePct: number;
  n: number;
  rank: number; // 1 = highest historical up%
};

export type MonthOdds = {
  month: string; // Jan … Dec
  monthIndex: number; // 1–12
  upPct: number;
  downPct: number;
  avgMovePct: number;
  n: number;
  rank: number;
};

export type DayOfMonthOdds = {
  day: number; // 1–31
  label: string; // 1st, 2nd, …
  upPct: number;
  downPct: number;
  avgMovePct: number;
  n: number;
  rank: number;
};

/** Paycheck vs bill-cycle lens on day-of-month odds. */
export type CashflowCycleInsight = {
  paydayDays: number[];
  rentPressureDays: number[];
  paydayAvgUpPct: number;
  rentAvgUpPct: number;
  spreadPts: number;
  paydayBestRank: number;
  rentWorstRank: number;
  paydayRows: DayOfMonthOdds[];
  rentRows: DayOfMonthOdds[];
  todayKind: "payday" | "rent" | null;
};

/** March tax run-up vs April filing deadline (US). */
export type TaxSeasonInsight = {
  march: MonthOdds;
  april: MonthOdds;
  /** March up% minus April up% (negative ⇒ March softer). */
  spreadPts: number;
  todayKind: "march" | "april" | null;
};

export type CalendarEdgeSlice = {
  label: string;
  upPct: number;
  edgePts: number; // vs 50% coin flip
  rank: number;
  of: number;
};

/** Today's weekday / month / day-of-month edges vs a 50% coin flip. */
export type CalendarEdge = {
  weekday: CalendarEdgeSlice | null;
  month: CalendarEdgeSlice | null;
  dayOfMonth: CalendarEdgeSlice | null;
  /** Simple average of available calendar edges (pts vs 50%). */
  blendPts: number | null;
};

export type DailySignal = {
  asOfDate: string;
  sessionLabel: string;
  bias: Bias;
  probabilityHigher: number;
  probabilityLower: number;
  confidence: 1 | 2 | 3 | 4 | 5;
  confidenceLabel: string;
  factors: Factor[];
  /** Most recent completed SPY sessions, newest → oldest (usually 10). */
  lastSessions: SessionDay[];
  /** Weekdays ranked by historical higher-close rate (~10y SPY). */
  weekdayOdds: WeekdayOdds[];
  /** Calendar months ranked by historical higher-close rate (~10y SPY). */
  monthOdds: MonthOdds[];
  /** Day-of-month (1–31) ranked by historical higher-close rate (~10y SPY). */
  dayOfMonthOdds: DayOfMonthOdds[];
  /** 1st/15th payday window vs late-month rent/mortgage pressure. */
  cashflowCycle: CashflowCycleInsight | null;
  /** March soft run-up vs April tax deadline. */
  taxSeason: TaxSeasonInsight | null;
  /** Today's calendar edges vs 50%. */
  calendarEdge: CalendarEdge | null;
  /** Mid-month CPI release window odds (approx. nearest weekday to the 12th). */
  cpiWindow: CpiWindowInsight | null;
  historical: {
    sampleLabel: string;
    winRate: number;
    avgMovePct: number;
    n: number;
  };
  decadeStats: {
    upPct: number;
    downPct: number;
    upDays: string;
    downDays: string;
    avgUpPct: number;
    avgDownPct: number;
  };
  marketStat: string;
  disclaimer: string;
  dataMode: "live" | "demo";
  quotes?: {
    spy: number | null;
    es: number | null;
    vix: number | null;
    tnx: number | null;
    breakeven10y: number | null;
    realYield10y: number | null;
    oil: number | null;
    gold: number | null;
  };
  /** Magnificent 7 per-name ArrowBeat leans (always 7; soft-fail → available:false). */
  mag7: Mag7Signal[];
};

function nyDateIso(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function weekdayInNy(iso: string): number {
  const d = new Date(`${iso}T12:00:00-04:00`);
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}

function formatSession(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00-04:00`));
}

function dailyReturns(bars: Bar[]): { date: string; ret: number }[] {
  const out: { date: string; ret: number }[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const cur = bars[i].close;
    if (prev > 0) out.push({ date: bars[i].date, ret: (cur - prev) / prev });
  }
  return out;
}

function lastSessionsFromReturns(
  returns: { date: string; ret: number }[],
  n = 10,
  weekdayMap?: Map<number, WeekdayOdds>,
): SessionDay[] {
  return returns
    .slice(-n)
    .map((r) => {
      const weekdayIndex = weekdayInNy(r.date);
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
      }).format(new Date(`${r.date}T12:00:00-04:00`));
      const odds = weekdayMap?.get(weekdayIndex);
      return {
        date: r.date,
        weekday,
        bias: (r.ret >= 0 ? "up" : "down") as Bias,
        changePct: Math.round(r.ret * 10000) / 100,
        histUpPct: odds?.upPct ?? null,
        histRank: odds?.rank ?? null,
      };
    })
    .reverse(); // newest trading day first
}

type OddsCore = {
  upPct: number;
  downPct: number;
  avgMovePct: number;
  n: number;
};

function oddsFromRets(rets: number[]): OddsCore {
  const n = rets.length || 1;
  const up = rets.filter((x) => x > 0).length;
  const down = rets.filter((x) => x < 0).length;
  return {
    upPct: Math.round((up / n) * 1000) / 10,
    downPct: Math.round((down / n) * 1000) / 10,
    avgMovePct: Math.round(mean(rets) * 10000) / 100,
    n: rets.length,
  };
}

function rankByUpPct<T extends OddsCore>(rows: T[]): (T & { rank: number })[] {
  return [...rows]
    .sort((a, b) => b.upPct - a.upPct || b.avgMovePct - a.avgMovePct)
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

function monthIndexFromIso(iso: string): number {
  return Number(iso.slice(5, 7));
}

function dayOfMonthFromIso(iso: string): number {
  return Number(iso.slice(8, 10));
}

function ordinalDay(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/** ~10y SPY higher-close rate by weekday, ranked best → worst. */
function weekdayOddsFromReturns(returns: { date: string; ret: number }[]): WeekdayOdds[] {
  const sample = returns.slice(-2520);
  const buckets = new Map<number, number[]>();
  for (const r of sample) {
    const dow = weekdayInNy(r.date);
    if (dow < 1 || dow > 5) continue; // Mon–Fri only
    const list = buckets.get(dow) || [];
    list.push(r.ret);
    buckets.set(dow, list);
  }
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const rows: Omit<WeekdayOdds, "rank">[] = [];
  for (let dow = 1; dow <= 5; dow++) {
    rows.push({
      weekday: names[dow],
      weekdayIndex: dow,
      ...oddsFromRets(buckets.get(dow) || []),
    });
  }
  return rankByUpPct(rows);
}

/** ~10y SPY higher-close rate by calendar month, ranked best → worst. */
function monthOddsFromReturns(returns: { date: string; ret: number }[]): MonthOdds[] {
  const sample = returns.slice(-2520);
  const buckets = new Map<number, number[]>();
  for (const r of sample) {
    const m = monthIndexFromIso(r.date);
    if (m < 1 || m > 12) continue;
    const list = buckets.get(m) || [];
    list.push(r.ret);
    buckets.set(m, list);
  }
  const names = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const rows: Omit<MonthOdds, "rank">[] = [];
  for (let m = 1; m <= 12; m++) {
    rows.push({
      month: names[m],
      monthIndex: m,
      ...oddsFromRets(buckets.get(m) || []),
    });
  }
  return rankByUpPct(rows);
}

/** ~10y SPY higher-close rate by day-of-month (1–31), ranked best → worst. */
function dayOfMonthOddsFromReturns(returns: { date: string; ret: number }[]): DayOfMonthOdds[] {
  const sample = returns.slice(-2520);
  const buckets = new Map<number, number[]>();
  for (const r of sample) {
    const d = dayOfMonthFromIso(r.date);
    if (d < 1 || d > 31) continue;
    const list = buckets.get(d) || [];
    list.push(r.ret);
    buckets.set(d, list);
  }
  const rows: Omit<DayOfMonthOdds, "rank">[] = [];
  for (let d = 1; d <= 31; d++) {
    const rets = buckets.get(d) || [];
    if (!rets.length) continue; // skip empty (rare for 29–31 in thin samples)
    rows.push({
      day: d,
      label: ordinalDay(d),
      ...oddsFromRets(rets),
    });
  }
  return rankByUpPct(rows);
}

/** Classic biweekly paycheck days vs late-month rent/mortgage pressure window. */
const PAYDAY_DAYS = [1, 15];
const RENT_PRESSURE_DAYS = [28, 29, 30, 31];

export function cashflowKindForDay(day: number): "payday" | "rent" | null {
  if (PAYDAY_DAYS.includes(day)) return "payday";
  if (RENT_PRESSURE_DAYS.includes(day)) return "rent";
  return null;
}

function weightedAvgUp(rows: DayOfMonthOdds[]): number {
  const n = rows.reduce((a, r) => a + r.n, 0);
  if (!n) return 50;
  return Math.round((rows.reduce((a, r) => a + r.upPct * r.n, 0) / n) * 10) / 10;
}

export function buildCashflowCycleInsight(
  dayOdds: DayOfMonthOdds[],
  asOfDate: string,
): CashflowCycleInsight | null {
  if (!dayOdds.length) return null;
  const byDay = new Map(dayOdds.map((r) => [r.day, r]));
  const paydayRows = PAYDAY_DAYS.map((d) => byDay.get(d)).filter(Boolean) as DayOfMonthOdds[];
  const rentRows = RENT_PRESSURE_DAYS.map((d) => byDay.get(d)).filter(Boolean) as DayOfMonthOdds[];
  if (!paydayRows.length || !rentRows.length) return null;

  const paydayAvgUpPct = weightedAvgUp(paydayRows);
  const rentAvgUpPct = weightedAvgUp(rentRows);
  return {
    paydayDays: PAYDAY_DAYS,
    rentPressureDays: RENT_PRESSURE_DAYS,
    paydayAvgUpPct,
    rentAvgUpPct,
    spreadPts: Math.round((paydayAvgUpPct - rentAvgUpPct) * 10) / 10,
    paydayBestRank: Math.min(...paydayRows.map((r) => r.rank)),
    rentWorstRank: Math.max(...rentRows.map((r) => r.rank)),
    paydayRows: [...paydayRows].sort((a, b) => a.rank - b.rank),
    rentRows: [...rentRows].sort((a, b) => b.rank - a.rank),
    todayKind: cashflowKindForDay(dayOfMonthFromIso(asOfDate)),
  };
}

export function taxSeasonKindForMonth(monthIndex: number): "march" | "april" | null {
  if (monthIndex === 3) return "march";
  if (monthIndex === 4) return "april";
  return null;
}

export function buildTaxSeasonInsight(
  monthOdds: MonthOdds[],
  asOfDate: string,
): TaxSeasonInsight | null {
  const march = monthOdds.find((m) => m.monthIndex === 3);
  const april = monthOdds.find((m) => m.monthIndex === 4);
  if (!march || !april) return null;
  return {
    march,
    april,
    spreadPts: Math.round((march.upPct - april.upPct) * 10) / 10,
    todayKind: taxSeasonKindForMonth(monthIndexFromIso(asOfDate)),
  };
}

function edgePtsFromUp(upPct: number): number {
  return Math.round((upPct - 50) * 10) / 10;
}

export function buildCalendarEdge(
  asOfDate: string,
  weekdayOdds: WeekdayOdds[],
  monthOdds: MonthOdds[],
  dayOfMonthOdds: DayOfMonthOdds[],
): CalendarEdge | null {
  const dow = weekdayInNy(asOfDate);
  const weekdayRow = weekdayOdds.find((w) => w.weekdayIndex === dow) ?? null;
  const monthRow = monthOdds.find((m) => m.monthIndex === monthIndexFromIso(asOfDate)) ?? null;
  const domRow = dayOfMonthOdds.find((d) => d.day === dayOfMonthFromIso(asOfDate)) ?? null;

  const weekday: CalendarEdgeSlice | null = weekdayRow
    ? {
        label: weekdayRow.weekday,
        upPct: weekdayRow.upPct,
        edgePts: edgePtsFromUp(weekdayRow.upPct),
        rank: weekdayRow.rank,
        of: weekdayOdds.length,
      }
    : null;
  const month: CalendarEdgeSlice | null = monthRow
    ? {
        label: monthRow.month.slice(0, 3),
        upPct: monthRow.upPct,
        edgePts: edgePtsFromUp(monthRow.upPct),
        rank: monthRow.rank,
        of: monthOdds.length,
      }
    : null;
  const dayOfMonth: CalendarEdgeSlice | null = domRow
    ? {
        label: domRow.label,
        upPct: domRow.upPct,
        edgePts: edgePtsFromUp(domRow.upPct),
        rank: domRow.rank,
        of: dayOfMonthOdds.length,
      }
    : null;

  const parts = [weekday, month, dayOfMonth].filter(Boolean) as CalendarEdgeSlice[];
  if (!parts.length) return null;
  const blendPts =
    Math.round((parts.reduce((a, p) => a + p.edgePts, 0) / parts.length) * 10) / 10;

  return { weekday, month, dayOfMonth, blendPts };
}

function streakFromReturns(returns: { ret: number }[]): { up: number; down: number } {
  let up = 0;
  let down = 0;
  for (let i = returns.length - 1; i >= 0; i--) {
    if (returns[i].ret < 0) {
      if (up > 0) break;
      down += 1;
    } else if (returns[i].ret > 0) {
      if (down > 0) break;
      up += 1;
    } else break;
  }
  return { up, down };
}

function pctChange(latest: number | null, previous: number | null): number | null {
  if (latest == null || previous == null || previous === 0) return null;
  return (latest - previous) / previous;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function decadeStatsFromSpy(bars: Bar[]) {
  const rets = dailyReturns(bars);
  const last10y = rets.slice(-2520);
  const up = last10y.filter((r) => r.ret > 0);
  const down = last10y.filter((r) => r.ret < 0);
  const n = last10y.length || 1;
  return {
    upPct: Math.round((up.length / n) * 1000) / 10,
    downPct: Math.round((down.length / n) * 1000) / 10,
    upDays: up.length.toLocaleString(),
    downDays: down.length.toLocaleString(),
    avgUpPct: Math.round(mean(up.map((r) => r.ret)) * 10000) / 100,
    avgDownPct: Math.round(mean(down.map((r) => r.ret)) * 10000) / 100,
    sampleDays: last10y.length,
  };
}

/** Conditional next-day stats after a down day (mean-reversion check). */
function afterDownDayStats(bars: Bar[]) {
  const rets = dailyReturns(bars).slice(-2520);
  const next: number[] = [];
  for (let i = 0; i < rets.length - 1; i++) {
    if (rets[i].ret < 0) next.push(rets[i + 1].ret);
  }
  const wins = next.filter((r) => r > 0);
  return {
    n: next.length,
    winRate: next.length ? Math.round((wins.length / next.length) * 1000) / 10 : 50,
    avgMovePct: Math.round(mean(next) * 10000) / 100,
  };
}

function confidenceFrom(edge: number, aligned: number): {
  confidence: 1 | 2 | 3 | 4 | 5;
  confidenceLabel: string;
} {
  let confidence: 1 | 2 | 3 | 4 | 5 = 3;
  if (edge > 12 && aligned >= 5) confidence = 5;
  else if (edge > 8 && aligned >= 4) confidence = 4;
  else if (edge > 5 && aligned >= 3) confidence = 3;
  else if (edge > 3) confidence = 2;
  else confidence = 1;

  const confidenceLabel =
    confidence >= 5
      ? "Very high"
      : confidence === 4
        ? "High"
        : confidence === 3
          ? "Moderate"
          : confidence === 2
            ? "Low"
            : "Tentative";
  return { confidence, confidenceLabel };
}

export function buildLiveSignal(snapshot: MarketSnapshot, dateIso = nyDateIso()): DailySignal {
  const dow = weekdayInNy(dateIso);
  const spyBars = snapshot.spy.bars.length ? snapshot.spy.bars : snapshot.spy.recentBars;
  if (spyBars.length < 30) {
    throw new Error("Not enough SPY history returned from the market feed.");
  }
  const spyRets = dailyReturns(spyBars);
  const weekdayOdds = weekdayOddsFromReturns(spyRets);
  const monthOdds = monthOddsFromReturns(spyRets);
  const dayOfMonthOdds = dayOfMonthOddsFromReturns(spyRets);
  const cashflowCycle = buildCashflowCycleInsight(dayOfMonthOdds, dateIso);
  const taxSeason = buildTaxSeasonInsight(monthOdds, dateIso);
  const calendarEdge = buildCalendarEdge(dateIso, weekdayOdds, monthOdds, dayOfMonthOdds);
  const cpiWindow = buildCpiWindowInsight(spyRets, dateIso);
  const weekdayMap = new Map(weekdayOdds.map((w) => [w.weekdayIndex, w]));
  const lastSessions = lastSessionsFromReturns(spyRets, 10, weekdayMap);
  const streaks = streakFromReturns(spyRets);
  const decade = decadeStatsFromSpy(spyBars);
  const afterDown = afterDownDayStats(spyBars);

  const monthNum = monthIndexFromIso(dateIso);
  const dayNum = dayOfMonthFromIso(dateIso);
  const thisMonth = monthOdds.find((m) => m.monthIndex === monthNum);
  const thisDom = dayOfMonthOdds.find((d) => d.day === dayNum);

  const esPrev =
    snapshot.futures.previousClose ??
    (snapshot.futures.bars.length > 1
      ? snapshot.futures.bars[snapshot.futures.bars.length - 2].close
      : null);
  const futuresChg = pctChange(snapshot.futures.last, esPrev);
  const futuresPositive = (futuresChg ?? 0) > 0;

  const vixBars = snapshot.vix.bars;
  const vixPrev = vixBars.length > 1 ? vixBars[vixBars.length - 2].close : null;
  const vixChg = pctChange(snapshot.vix.last, vixPrev);
  const vixFalling = (vixChg ?? 0) < 0;

  // Breadth proxy: RSP 5-day return vs SPY 5-day return
  const spy5 = snapshot.breadth.spyBars;
  const rsp5 = snapshot.breadth.rspBars;
  const spy5chg =
    spy5.length >= 2 ? (spy5[spy5.length - 1].close - spy5[0].close) / spy5[0].close : 0;
  const rsp5chg =
    rsp5.length >= 2 ? (rsp5[rsp5.length - 1].close - rsp5[0].close) / rsp5[0].close : 0;
  const breadthImproving = rsp5chg >= spy5chg - 0.001;

  const tnxBars = snapshot.yields.bars;
  const tnxPrev = tnxBars.length > 5 ? tnxBars[tnxBars.length - 6].close : null;
  const yieldsChg = pctChange(snapshot.yields.last, tnxPrev);
  const yieldsHigher = (yieldsChg ?? 0) > 0.01; // ~1% relative rise in yield level over ~5 sessions

  const beBars = snapshot.inflation?.breakeven10y.bars ?? [];
  const beLast = snapshot.inflation?.breakeven10y.last ?? null;
  const bePrev = beBars.length > 5 ? beBars[beBars.length - 6].close : null;
  const beChg = pctChange(beLast, bePrev);
  const breakevenRising = (beChg ?? 0) > 0.015; // ~1.5% relative rise in breakeven level

  const ryBars = snapshot.inflation?.realYield10y.bars ?? [];
  const ryLast = snapshot.inflation?.realYield10y.last ?? null;
  const ryPrev = ryBars.length > 5 ? ryBars[ryBars.length - 6].close : null;
  // Absolute pts for yields already in percent units (e.g. 2.43 → 2.35)
  const realYieldRising =
    ryLast != null && ryPrev != null ? ryLast - ryPrev > 0.05 : false;

  const oilBars = snapshot.commodities?.oil.bars ?? [];
  const oilLast = snapshot.commodities?.oil.last ?? null;
  const oilPrev = oilBars.length > 5 ? oilBars[oilBars.length - 6].close : null;
  const oilChg = pctChange(oilLast, oilPrev);
  const oilHot = oilChg != null && Math.abs(oilChg) >= 0.025;

  const goldBars = snapshot.commodities?.gold.bars ?? [];
  const goldLast = snapshot.commodities?.gold.last ?? null;
  const goldPrev = goldBars.length > 5 ? goldBars[goldBars.length - 6].close : null;
  const goldChg = pctChange(goldLast, goldPrev);
  const goldHot = goldChg != null && Math.abs(goldChg) >= 0.015;

  const seasonalityPositive = (thisMonth?.upPct ?? 50) >= 50;

  // Base rate from live decade sample
  let score = decade.upPct / 100;
  if (dow === 1) score -= 0.025;
  if (dow === 5) score += 0.01;
  if (streaks.down >= 3) score += 0.055;
  else if (streaks.down === 2) score += 0.03;
  if (streaks.up >= 4) score -= 0.035;
  if (futuresPositive) score += Math.min(0.05, Math.abs(futuresChg ?? 0) * 8 + 0.02);
  else score -= Math.min(0.05, Math.abs(futuresChg ?? 0) * 8 + 0.02);
  if (vixFalling) score += 0.025;
  else score -= 0.02;
  if (breadthImproving) score += 0.02;
  else score -= 0.015;
  if (seasonalityPositive) score += 0.01;
  else score -= 0.01;
  if ((thisDom?.upPct ?? 50) >= 52) score += 0.01;
  else if ((thisDom?.upPct ?? 50) <= 48) score -= 0.01;
  if (yieldsHigher) score -= 0.02;
  if (realYieldRising) score -= 0.025;
  else if (ryLast != null && ryPrev != null && ryLast - ryPrev < -0.05) score += 0.015;
  if (breakevenRising) score -= 0.015;
  if (oilHot && (oilChg ?? 0) > 0) score -= 0.02;
  else if (oilHot && (oilChg ?? 0) < 0) score += 0.01;
  if (goldHot && (goldChg ?? 0) > 0) score -= 0.01;
  else if (goldHot && (goldChg ?? 0) < 0) score += 0.01;
  if (cpiWindow && cpiWindow.todayKind !== "quiet") {
    const row = cpiWindow.odds.find((o) => o.kind === cpiWindow.todayKind);
    if (row) {
      if (row.upPct >= 52) score += 0.01;
      else if (row.upPct <= 48) score -= 0.01;
    }
  }

  score = Math.min(0.78, Math.max(0.28, score));

  const bias: Bias = score >= 0.5 ? "up" : "down";
  const probabilityHigher = Math.round(score * 1000) / 10;
  const probabilityLower = Math.round((100 - probabilityHigher) * 10) / 10;

  const factors: Factor[] = [];
  if (streaks.down >= 2) {
    factors.push({
      id: "streak-down",
      label: `${streaks.down} consecutive SPY down day${streaks.down > 1 ? "s" : ""}`,
      supports: "up",
      detail: `After down days over the last decade, the next session finished higher about ${afterDown.winRate}% of the time (n=${afterDown.n.toLocaleString()}).`,
    });
  }
  if (streaks.up >= 3) {
    factors.push({
      id: "streak-up",
      label: `${streaks.up}-day SPY winning streak into the open`,
      supports: "down",
      detail: "Extended upside streaks often cool; next-day average returns can soften.",
    });
  }
  factors.push({
    id: "futures",
    label:
      futuresChg == null
        ? "ES futures quote unavailable"
        : `ES futures ${futuresChg >= 0 ? "+" : ""}${(futuresChg * 100).toFixed(2)}% vs prior`,
    supports: futuresPositive ? "up" : "down",
    detail: "CME E-mini S&P 500 futures (ES=F) vs prior session reference.",
  });
  factors.push({
    id: "vix",
    label:
      vixChg == null
        ? "VIX quote unavailable"
        : `VIX ${vixChg >= 0 ? "+" : ""}${(vixChg * 100).toFixed(2)}% day-over-day`,
    supports: vixFalling ? "up" : "down",
    detail: "Cboe Volatility Index (^VIX) — falling vol often accompanies calmer risk appetite.",
  });
  factors.push({
    id: "breadth",
    label: breadthImproving
      ? "Equal-weight S&P keeping up (RSP vs SPY)"
      : "Equal-weight S&P lagging (narrow leadership)",
    supports: breadthImproving ? "up" : "down",
    detail: "Free breadth proxy: RSP 5-session change versus SPY.",
  });
  factors.push({
    id: "seasonality",
    label: thisMonth
      ? `${thisMonth.month} historically ${thisMonth.upPct.toFixed(1)}% higher (#${thisMonth.rank}/12)`
      : "Seasonality neutral",
    supports: seasonalityPositive ? "up" : "down",
    detail: (() => {
      const bits: string[] = [];
      if (thisDom) {
        bits.push(
          `Day-of-month ${thisDom.label}: historically higher ${thisDom.upPct.toFixed(1)}% (#${thisDom.rank} of ${dayOfMonthOdds.length}).`,
        );
      }
      if (cashflowCycle?.todayKind === "payday") bits.push("Classic payday window (1st/15th).");
      if (cashflowCycle?.todayKind === "rent")
        bits.push("Late-month rent/mortgage pressure window.");
      if (taxSeason?.todayKind === "march")
        bits.push(
          `Tax run-up: March ${taxSeason.march.upPct.toFixed(1)}% higher (#${taxSeason.march.rank}/12) vs April ${taxSeason.april.upPct.toFixed(1)}% (#${taxSeason.april.rank}/12).`,
        );
      if (taxSeason?.todayKind === "april")
        bits.push(
          `Tax deadline month: April ${taxSeason.april.upPct.toFixed(1)}% higher (#${taxSeason.april.rank}/12) vs March ${taxSeason.march.upPct.toFixed(1)}% (#${taxSeason.march.rank}/12).`,
        );
      bits.push("Mild calendar tendency only.");
      return bits.join(" ");
    })(),
  });
  if (yieldsHigher) {
    factors.push({
      id: "yields",
      label: `10Y yield rising (${snapshot.yields.last?.toFixed(2) ?? "—"}%)`,
      supports: "down",
      detail: "Cboe 10-year yield index (^TNX) higher over recent sessions.",
    });
  }
  if (ryLast != null && ryPrev != null && Math.abs(ryLast - ryPrev) >= 0.05) {
    factors.push({
      id: "real-yield",
      label: `10Y real yield ${realYieldRising ? "rising" : "falling"} (${ryLast.toFixed(2)}%)`,
      supports: realYieldRising ? "down" : "up",
      detail: "FRED DFII10 — inflation-indexed 10Y. Rising real rates often pressure equities.",
    });
  }
  if (beLast != null && beChg != null && Math.abs(beChg) >= 0.015) {
    factors.push({
      id: "breakeven",
      label: `10Y breakeven ${breakevenRising ? "rising" : "easing"} (${beLast.toFixed(2)}%)`,
      supports: breakevenRising ? "down" : "up",
      detail: "FRED T10YIE — market-implied average inflation over the next decade.",
    });
  }
  if (oilHot && oilChg != null && oilLast != null) {
    factors.push({
      id: "oil",
      label: `Oil ${oilChg >= 0 ? "+" : ""}${(oilChg * 100).toFixed(1)}% (~5 sessions) · $${oilLast.toFixed(0)}`,
      supports: oilChg > 0 ? "down" : "up",
      detail: "WTI crude (CL=F) — only flagged on larger swings as an inflation impulse.",
    });
  }
  if (goldHot && goldChg != null && goldLast != null) {
    factors.push({
      id: "gold",
      label: `Gold ${goldChg >= 0 ? "+" : ""}${(goldChg * 100).toFixed(1)}% (~5 sessions)`,
      supports: goldChg > 0 ? "down" : "up",
      detail: "COMEX gold (GC=F) — sparse factor; sharp moves often track real-rate / risk tone.",
    });
  }
  if (cpiWindow && cpiWindow.todayKind !== "quiet") {
    const row = cpiWindow.odds.find((o) => o.kind === cpiWindow.todayKind);
    if (row) {
      factors.push({
        id: "cpi-window",
        label: `${row.label}: historically ${row.upPct.toFixed(1)}% higher (#${row.rank}/5)`,
        supports: row.upPct >= 50 ? "up" : "down",
        detail: `Approx. CPI window (weekday nearest the 12th). Next proxy ${cpiWindow.nextCpi ?? "—"}. Not official BLS dates.`,
      });
    }
  }
  if (dow === 1) {
    factors.push({
      id: "monday",
      label: "Monday open historically softer",
      supports: "down",
      detail: "Across long equity samples, Mondays have carried a slightly weaker average bias.",
    });
  }

  const aligned = factors.filter((f) => f.supports === bias).length;
  const edge = Math.abs(probabilityHigher - 50);
  const { confidence, confidenceLabel } = confidenceFrom(edge, aligned);

  const histWin =
    streaks.down >= 2
      ? afterDown.winRate
      : Math.round((decade.upPct + (bias === "up" ? 2 : -2)) * 10) / 10;
  const histAvg =
    streaks.down >= 2
      ? afterDown.avgMovePct
      : bias === "up"
        ? decade.avgUpPct
        : decade.avgDownPct;

  return {
    asOfDate: dateIso,
    sessionLabel: formatSession(dateIso),
    bias,
    probabilityHigher,
    probabilityLower,
    confidence,
    confidenceLabel,
    factors,
    lastSessions,
    weekdayOdds,
    monthOdds,
    dayOfMonthOdds,
    cashflowCycle,
    taxSeason,
    calendarEdge,
    cpiWindow,
    historical: {
      sampleLabel:
        streaks.down >= 2
          ? "After a SPY down day over the past decade"
          : "Long-run SPY daily sample (live history)",
      winRate: histWin,
      avgMovePct: histAvg,
      n: streaks.down >= 2 ? afterDown.n : decade.sampleDays,
    },
    decadeStats: {
      upPct: decade.upPct,
      downPct: decade.downPct,
      upDays: decade.upDays,
      downDays: decade.downDays,
      avgUpPct: decade.avgUpPct,
      avgDownPct: decade.avgDownPct,
    },
    marketStat: `Over ~${decade.sampleDays.toLocaleString()} SPY sessions (~10y), closes were higher on ${decade.upPct}% of days and lower on ${decade.downPct}%. Average up day ${decade.avgUpPct > 0 ? "+" : ""}${decade.avgUpPct.toFixed(2)}% vs average down day ${decade.avgDownPct.toFixed(2)}% — a small frequency edge plus larger upside moves.`,
    disclaimer:
      "ArrowBeat uses free public market quotes (Yahoo Finance) and FRED series for education. Not investment advice, not a guarantee, and not a broker. Quotes can be delayed; futures trade nearly 24 hours.",
    dataMode: "live",
    quotes: {
      spy: snapshot.spy.last,
      es: snapshot.futures.last,
      vix: snapshot.vix.last,
      tnx: snapshot.yields.last,
      breakeven10y: snapshot.inflation?.breakeven10y.last ?? null,
      realYield10y: snapshot.inflation?.realYield10y.last ?? null,
      oil: snapshot.commodities?.oil.last ?? null,
      gold: snapshot.commodities?.gold.last ?? null,
    },
    mag7: buildMag7Signals(snapshot, dateIso),
  };
}

/** Offline fallback if the market API is unreachable. */
export function buildDemoSignal(dateIso = nyDateIso()): DailySignal {
  return {
    asOfDate: dateIso,
    sessionLabel: formatSession(dateIso),
    bias: "up",
    probabilityHigher: 54,
    probabilityLower: 46,
    confidence: 1,
    confidenceLabel: "Tentative",
    factors: [
      {
        id: "offline",
        label: "Waiting on live SPY / ES / VIX feed",
        supports: "up",
        detail: "Start `npm run dev` so /api/market/snapshot can proxy free Yahoo Finance data.",
      },
    ],
    lastSessions: [],
    weekdayOdds: [],
    monthOdds: [],
    dayOfMonthOdds: [],
    cashflowCycle: null,
    taxSeason: null,
    calendarEdge: null,
    cpiWindow: null,
    historical: {
      sampleLabel: "Demo placeholder",
      winRate: 54,
      avgMovePct: 0.2,
      n: 0,
    },
    decadeStats: {
      upPct: 54,
      downPct: 46,
      upDays: "—",
      downDays: "—",
      avgUpPct: 0.6,
      avgDownPct: -0.55,
    },
    marketStat:
      "Live market feed unavailable — showing a conservative placeholder. Refresh once the local market API is running (`npm run dev`).",
    disclaimer:
      "Demo mode — not live quotes. ArrowBeat is educational only, not investment advice.",
    dataMode: "demo",
    mag7: [],
  };
}

/**
 * Per-ticker ArrowBeat lean for Mag7 — lighter cousin of buildLiveSignal:
 * own price action + streaks + relative vs SPY, plus a mild shared risk tone
 * (ES / VIX) from the market snapshot. Always returns all 7 names (soft-fail → available:false).
 */
export function buildMag7Signals(
  snapshot: MarketSnapshot,
  dateIso = nyDateIso(),
): Mag7Signal[] {
  const dow = weekdayInNy(dateIso);
  const spyBars = snapshot.spy.bars.length ? snapshot.spy.bars : snapshot.spy.recentBars;
  const spy5 =
    spyBars.length >= 6
      ? (spyBars[spyBars.length - 1].close - spyBars[spyBars.length - 6].close) /
        spyBars[spyBars.length - 6].close
      : 0;

  const esPrev =
    snapshot.futures.previousClose ??
    (snapshot.futures.bars.length > 1
      ? snapshot.futures.bars[snapshot.futures.bars.length - 2].close
      : null);
  const futuresChg = pctChange(snapshot.futures.last, esPrev);
  const futuresPositive = (futuresChg ?? 0) > 0;

  const vixBars = snapshot.vix.bars;
  const vixPrev = vixBars.length > 1 ? vixBars[vixBars.length - 2].close : null;
  const vixChg = pctChange(snapshot.vix.last, vixPrev);
  const vixFalling = (vixChg ?? 0) < 0;

  return MAG7_META.map((meta) => {
    const series = snapshot.mag7?.[meta.symbol];
    const changeRaw = series ? pctChange(series.last, series.previousClose) : null;
    const changePct = changeRaw != null ? Math.round(changeRaw * 10000) / 100 : null;

    if (!series || series.bars.length < 20) {
      return {
        symbol: meta.symbol,
        name: meta.name,
        bias: "up" as Bias,
        probabilityHigher: 50,
        probabilityLower: 50,
        confidence: 1 as const,
        confidenceLabel: "Tentative",
        last: series?.last ?? null,
        changePct,
        available: false,
      };
    }

    const bars = series.bars;
    const rets = dailyReturns(bars);
    if (rets.length < 15) {
      return {
        symbol: meta.symbol,
        name: meta.name,
        bias: "up" as Bias,
        probabilityHigher: 50,
        probabilityLower: 50,
        confidence: 1 as const,
        confidenceLabel: "Tentative",
        last: series.last,
        changePct,
        available: false,
      };
    }

    const sample = rets.slice(-252);
    const upShare = sample.filter((r) => r.ret > 0).length / (sample.length || 1);
    const streaks = streakFromReturns(rets);
    const afterDown = afterDownDayStats(bars);

    const tip = bars[bars.length - 1].close;
    const fiveAgo = bars.length >= 6 ? bars[bars.length - 6].close : null;
    const mom5 = fiveAgo && fiveAgo > 0 ? (tip - fiveAgo) / fiveAgo : 0;
    const vsSpy = mom5 - spy5;

    let score = upShare;
    if (dow === 1) score -= 0.02;
    if (dow === 5) score += 0.01;
    if (streaks.down >= 3) score += 0.055;
    else if (streaks.down === 2) score += 0.03;
    if (streaks.up >= 4) score -= 0.035;
    // Mild momentum: short-term strength helps slightly; overheat fades
    if (mom5 > 0.02) score += 0.02;
    else if (mom5 < -0.02) score += 0.015; // mild mean-reversion after a soft week
    if (vsSpy > 0.01) score += 0.015;
    else if (vsSpy < -0.01) score -= 0.015;
    // Shared market tone (lighter weight than SPY hero signal)
    if (futuresChg != null) {
      if (futuresPositive) score += 0.02;
      else score -= 0.02;
    }
    if (vixChg != null) {
      if (vixFalling) score += 0.015;
      else score -= 0.012;
    }

    score = Math.min(0.78, Math.max(0.28, score));
    const bias: Bias = score >= 0.5 ? "up" : "down";
    const probabilityHigher = Math.round(score * 1000) / 10;
    const probabilityLower = Math.round((100 - probabilityHigher) * 10) / 10;

    let aligned = 0;
    if ((streaks.down >= 2 && bias === "up") || (streaks.up >= 3 && bias === "down")) aligned += 1;
    if ((mom5 >= 0 && bias === "up") || (mom5 < 0 && bias === "down")) aligned += 1;
    if ((vsSpy >= 0 && bias === "up") || (vsSpy < 0 && bias === "down")) aligned += 1;
    if ((futuresPositive && bias === "up") || (!futuresPositive && bias === "down")) aligned += 1;
    if ((vixFalling && bias === "up") || (!vixFalling && bias === "down")) aligned += 1;
    if (streaks.down >= 2 && afterDown.winRate >= 52 && bias === "up") aligned += 1;

    const edge = Math.abs(probabilityHigher - 50);
    const { confidence, confidenceLabel } = confidenceFrom(edge, aligned);

    return {
      symbol: meta.symbol,
      name: meta.name,
      bias,
      probabilityHigher,
      probabilityLower,
      confidence,
      confidenceLabel,
      last: series.last,
      changePct,
      available: true,
    };
  });
}

export function nyTradingDateIso(): string {
  return nyDateIso();
}

export function weekdayIndexForIso(iso: string): number {
  return weekdayInNy(iso);
}

export function monthIndexForIso(iso: string): number {
  return monthIndexFromIso(iso);
}

export function dayOfMonthForIso(iso: string): number {
  return dayOfMonthFromIso(iso);
}
