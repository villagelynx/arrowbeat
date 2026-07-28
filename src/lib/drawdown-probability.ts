import type { Bar } from "./market-data";

/** Rolling ~52-week peak lookback (trading days). */
export const PEAK_LOOKBACK = 252;

/** Forward windows in trading days (~63 / ~126 / ~252). */
export const DRAWDOWN_HORIZONS = {
  "3mo": 63,
  "6mo": 126,
  "12mo": 252,
} as const;

export type DrawdownHorizon = keyof typeof DRAWDOWN_HORIZONS;

export type VixBucketId = "low" | "normal" | "elevated" | "high";

export type BucketRate = {
  hits: number;
  total: number;
  pct: number | null;
};

export type DrawdownOddsHorizons = Record<
  DrawdownHorizon,
  {
    unconditional: BucketRate;
    /** P(hit) given drawdown bucket (excludes days already at/ past threshold). */
    conditionalDrawdown: BucketRate;
    /** P(hit) given drawdown + VIX bucket when VIX history aligns. */
    conditionalCombined: BucketRate;
  }
>;

export function rollingPeak(closes: number[], i: number): number {
  const start = Math.max(0, i - PEAK_LOOKBACK + 1);
  let peak = closes[start];
  for (let j = start + 1; j <= i; j++) {
    if (closes[j] > peak) peak = closes[j];
  }
  return peak;
}

export function drawdownPct(close: number, peak: number): number {
  if (peak <= 0) return 0;
  return (close / peak - 1) * 100;
}

export function classifyVix(vix: number): { id: VixBucketId; label: string } {
  if (!Number.isFinite(vix)) return { id: "normal", label: "VIX unavailable" };
  if (vix < 15) return { id: "low", label: "VIX below 15" };
  if (vix < 20) return { id: "normal", label: "VIX 15–20" };
  if (vix < 25) return { id: "elevated", label: "VIX 20–25" };
  return { id: "high", label: "VIX above 25" };
}

export function validBars(bars: Bar[]): Bar[] {
  return bars.filter(
    (b) => b?.date && typeof b.close === "number" && Number.isFinite(b.close) && b.close > 0,
  );
}

export function vixByDate(bars: Bar[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of bars) m.set(b.date, b.close);
  return m;
}

export function rate(hits: number, total: number): BucketRate {
  return {
    hits,
    total,
    pct: total > 0 ? Math.round((hits / total) * 1000) / 10 : null,
  };
}

/**
 * True when min(close[i..i+horizon]) falls to ≤ thresholdRatio × the 52w peak at day i.
 * Uses forward window including the start day (drawdown may deepen from here).
 */
export function hitsDrawdown(
  closes: number[],
  peaks: number[],
  i: number,
  horizon: number,
  thresholdRatio: number,
): boolean {
  const threshold = peaks[i] * thresholdRatio;
  const end = Math.min(closes.length - 1, i + horizon);
  for (let j = i; j <= end; j++) {
    if (closes[j] <= threshold) return true;
  }
  return false;
}

export function daysSinceThreshold(
  drawdowns: number[],
  fromIndex: number,
  thresholdPct: number,
): number | null {
  if (drawdowns[fromIndex] <= -thresholdPct) return 0;
  for (let j = fromIndex - 1; j >= 0; j--) {
    if (drawdowns[j] <= -thresholdPct) return fromIndex - j;
  }
  return null;
}

export type DrawdownOddsBuildConfig<TBucketId extends string> = {
  thresholdPct: number;
  /** Bucket id for days already at or past the drawdown threshold. */
  inThresholdBucketId: TBucketId;
  classifyDrawdown: (dd: number) => { id: TBucketId; label: string };
  buildInterpretation: (args: {
    dd: number;
    bucketLabel: string;
    vixLabel: string | null;
    h6: BucketRate;
    baseline6: BucketRate;
    alreadyAtThreshold: boolean;
    thresholdPct: number;
  }) => string;
  caveat: string;
};

export type DrawdownOddsResult<TBucketId extends string> = {
  sampleDays: number;
  sampleLabel: string;
  drawdownPct: number;
  peak52w: number;
  lastClose: number;
  drawdownBucket: TBucketId;
  drawdownBucketLabel: string;
  daysSinceThreshold: number | null;
  vixLast: number | null;
  vixBucket: VixBucketId | null;
  vixBucketLabel: string | null;
  alreadyAtThreshold: boolean;
  thresholdPct: number;
  horizons: DrawdownOddsHorizons;
  interpretation: string;
  caveat: string;
};

/**
 * Historical drawdown hit frequencies from aligned SPY (+ optional VIX) daily bars.
 */
export function buildDrawdownOdds<TBucketId extends string>(
  spyBars: Bar[],
  config: DrawdownOddsBuildConfig<TBucketId>,
  vixBars: Bar[] = [],
  vixLast: number | null = null,
): DrawdownOddsResult<TBucketId> | null {
  const { thresholdPct, inThresholdBucketId, classifyDrawdown, buildInterpretation, caveat } =
    config;
  const thresholdRatio = 1 - thresholdPct / 100;

  const spy = validBars(spyBars);
  const vix = validBars(vixBars);
  if (spy.length < PEAK_LOOKBACK + DRAWDOWN_HORIZONS["6mo"] + 10) return null;

  const closes = spy.map((b) => b.close);
  const dates = spy.map((b) => b.date);
  const n = closes.length;
  const peaks = new Array<number>(n);
  const drawdowns = new Array<number>(n);
  const ddBuckets = new Array<TBucketId>(n);
  const vixMap = vixByDate(vix);
  const vixBucketAt = new Array<VixBucketId | null>(n);

  for (let i = 0; i < n; i++) {
    peaks[i] = rollingPeak(closes, i);
    drawdowns[i] = drawdownPct(closes[i], peaks[i]);
    ddBuckets[i] = classifyDrawdown(drawdowns[i]).id;
    const vx = vixMap.get(dates[i]);
    vixBucketAt[i] = vx != null ? classifyVix(vx).id : null;
  }

  const tip = n - 1;
  const currentDd = drawdowns[tip];
  const currentBucket = classifyDrawdown(currentDd);
  const currentVix =
    vixLast != null && Number.isFinite(vixLast) ? vixLast : vixMap.get(dates[tip]) ?? null;
  const currentVixBucket = currentVix != null ? classifyVix(currentVix) : null;
  const alreadyAtThreshold = currentDd <= -thresholdPct;

  const horizons = {} as DrawdownOddsHorizons;

  for (const [key, horizon] of Object.entries(DRAWDOWN_HORIZONS) as [DrawdownHorizon, number][]) {
    let uncondHits = 0;
    let uncondTotal = 0;
    let ddHits = 0;
    let ddTotal = 0;
    let comboHits = 0;
    let comboTotal = 0;

    const start = PEAK_LOOKBACK - 1;
    const end = n - horizon - 1;

    for (let i = start; i <= end; i++) {
      const hit = hitsDrawdown(closes, peaks, i, horizon, thresholdRatio);
      uncondTotal++;
      if (hit) uncondHits++;

      if (ddBuckets[i] === currentBucket.id && ddBuckets[i] !== inThresholdBucketId) {
        ddTotal++;
        if (hit) ddHits++;
      }

      if (
        currentVixBucket &&
        ddBuckets[i] === currentBucket.id &&
        ddBuckets[i] !== inThresholdBucketId &&
        vixBucketAt[i] === currentVixBucket.id
      ) {
        comboTotal++;
        if (hit) comboHits++;
      }
    }

    horizons[key] = {
      unconditional: rate(uncondHits, uncondTotal),
      conditionalDrawdown: rate(ddHits, ddTotal),
      conditionalCombined: rate(comboHits, comboTotal),
    };
  }

  const h6 = horizons["6mo"];
  const years = Math.round((n / 252) * 10) / 10;
  const cond6 =
    h6.conditionalDrawdown.total >= 8 ? h6.conditionalDrawdown : h6.conditionalCombined;

  return {
    sampleDays: n,
    sampleLabel: `~${years}y SPY daily closes`,
    drawdownPct: Math.round(currentDd * 100) / 100,
    peak52w: Math.round(peaks[tip] * 100) / 100,
    lastClose: Math.round(closes[tip] * 100) / 100,
    drawdownBucket: currentBucket.id,
    drawdownBucketLabel: currentBucket.label,
    daysSinceThreshold: daysSinceThreshold(drawdowns, tip, thresholdPct),
    vixLast: currentVix != null ? Math.round(currentVix * 100) / 100 : null,
    vixBucket: currentVixBucket?.id ?? null,
    vixBucketLabel: currentVixBucket?.label ?? null,
    alreadyAtThreshold,
    thresholdPct,
    horizons,
    interpretation: buildInterpretation({
      dd: currentDd,
      bucketLabel: currentBucket.label,
      vixLabel: currentVixBucket?.label ?? null,
      h6: cond6,
      baseline6: h6.unconditional,
      alreadyAtThreshold,
      thresholdPct,
    }),
    caveat,
  };
}
