/**
 * Approximate US CPI release calendar for historical SPY window odds.
 * BLS CPI usually prints mid-month (~10th–14th). We use the weekday nearest
 * the 12th each month as a stable proxy (not official BLS dates).
 */

export type CpiWindowKind = "cpi-eve" | "cpi-day" | "cpi-plus1" | "cpi-plus2" | "quiet";

export type CpiWindowOdds = {
  kind: CpiWindowKind;
  label: string;
  upPct: number;
  downPct: number;
  avgMovePct: number;
  n: number;
  rank: number;
};

export type CpiWindowInsight = {
  odds: CpiWindowOdds[];
  todayKind: CpiWindowKind;
  nextCpi: string | null;
  /** CPI-window avg up% (eve/day/+1/+2) minus quiet days. */
  windowVsQuietPts: number;
};

function weekdayNy(iso: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(new Date(`${iso}T12:00:00-04:00`));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00-04:00`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Weekday nearest the 12th (Sun→Mon, Sat→Fri). */
export function approximateCpiReleaseIso(year: number, month: number): string {
  const base = `${year}-${String(month).padStart(2, "0")}-12`;
  const dow = weekdayNy(base);
  if (dow === 0) return shiftIso(base, 1);
  if (dow === 6) return shiftIso(base, -1);
  return base;
}

export function buildCpiReleaseSet(fromYear: number, toYear: number): Set<string> {
  const set = new Set<string>();
  for (let y = fromYear; y <= toYear; y++) {
    for (let m = 1; m <= 12; m++) {
      set.add(approximateCpiReleaseIso(y, m));
    }
  }
  return set;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function oddsFromRets(rets: number[]) {
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

const LABELS: Record<CpiWindowKind, string> = {
  "cpi-eve": "CPI eve",
  "cpi-day": "CPI day",
  "cpi-plus1": "CPI +1",
  "cpi-plus2": "CPI +2",
  quiet: "Quiet days",
};

export function classifyCpiKindForDate(
  asOfDate: string,
  tradingDates: string[],
  cpiSet: Set<string>,
): CpiWindowKind {
  const dates =
    tradingDates.includes(asOfDate) || weekdayNy(asOfDate) < 1 || weekdayNy(asOfDate) > 5
      ? tradingDates
      : [...tradingDates, asOfDate].sort();
  const i = dates.indexOf(asOfDate);
  if (i < 0) return "quiet";
  if (cpiSet.has(asOfDate)) return "cpi-day";

  for (let j = i + 1; j < dates.length; j++) {
    if (cpiSet.has(dates[j])) {
      if (j === i + 1) return "cpi-eve";
      break;
    }
  }
  for (let j = i - 1; j >= 0; j--) {
    if (cpiSet.has(dates[j])) {
      if (j === i - 1) return "cpi-plus1";
      if (j === i - 2) return "cpi-plus2";
      break;
    }
  }
  return "quiet";
}

export function buildCpiWindowInsight(
  returns: { date: string; ret: number }[],
  asOfDate: string,
): CpiWindowInsight | null {
  const sample = returns.slice(-2520);
  if (sample.length < 60) return null;

  const firstYear = Number(sample[0].date.slice(0, 4)) - 1;
  const lastYear = Number(sample[sample.length - 1].date.slice(0, 4)) + 1;
  const cpiSet = buildCpiReleaseSet(firstYear, lastYear);
  const tradingDates = sample.map((r) => r.date);

  const kinds = sample.map((_, i) =>
    classifyCpiKindForDate(sample[i].date, tradingDates, cpiSet),
  );

  const buckets = new Map<CpiWindowKind, number[]>();
  for (const k of Object.keys(LABELS) as CpiWindowKind[]) buckets.set(k, []);
  for (let i = 0; i < sample.length; i++) {
    buckets.get(kinds[i])!.push(sample[i].ret);
  }

  const order: CpiWindowKind[] = ["cpi-eve", "cpi-day", "cpi-plus1", "cpi-plus2", "quiet"];
  const rows = order.map((kind) => ({
    kind,
    label: LABELS[kind],
    ...oddsFromRets(buckets.get(kind) || []),
  }));
  rows.sort((a, b) => b.upPct - a.upPct || b.avgMovePct - a.avgMovePct);
  const odds = rows.map((row, i) => ({ ...row, rank: i + 1 }));

  const quiet = odds.find((o) => o.kind === "quiet");
  const windowRows = odds.filter((o) => o.kind !== "quiet");
  const windowN = windowRows.reduce((a, r) => a + r.n, 0);
  const windowAvg = windowN
    ? windowRows.reduce((a, r) => a + r.upPct * r.n, 0) / windowN
    : 50;
  const windowVsQuietPts =
    Math.round((windowAvg - (quiet?.upPct ?? 50)) * 10) / 10;

  let nextCpi: string | null = null;
  const y = Number(asOfDate.slice(0, 4));
  outer: for (let yy = y; yy <= y + 1; yy++) {
    for (let m = 1; m <= 12; m++) {
      const d = approximateCpiReleaseIso(yy, m);
      if (d >= asOfDate) {
        nextCpi = d;
        break outer;
      }
    }
  }

  return {
    odds,
    todayKind: classifyCpiKindForDate(asOfDate, tradingDates, cpiSet),
    nextCpi,
    windowVsQuietPts,
  };
}
