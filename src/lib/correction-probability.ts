import type { Bar } from "./market-data";

/** Rolling ~52-week peak lookback (trading days). */
const PEAK_LOOKBACK = 252;
const CORRECTION_PCT = 10;
const CORRECTION_RATIO = 1 - CORRECTION_PCT / 100;

/** Forward windows in trading days (~63 / ~126 / ~252). */
export const CORRECTION_HORIZONS = {
  "3mo": 63,
  "6mo": 126,
  "12mo": 252,
} as const;

export type CorrectionHorizon = keyof typeof CORRECTION_HORIZONS;

export type DrawdownBucketId = "ath" | "mild" | "moderate" | "in_correction";

export type VixBucketId = "low" | "normal" | "elevated" | "high";

export type BucketRate = {
  hits: number;
  total: number;
  pct: number | null;
};

export type CorrectionOdds = {
  /** SPY sample used for historical frequencies. */
  sampleDays: number;
  sampleLabel: string;
  /** Current distance from rolling 52w high (negative = below peak). */
  drawdownPct: number;
  peak52w: number;
  lastClose: number;
  drawdownBucket: DrawdownBucketId;
  drawdownBucketLabel: string;
  /** Days since SPY last closed ≥10% below its then-52w high (0 if currently in correction). */
  daysSinceCorrection: number | null;
  vixLast: number | null;
  vixBucket: VixBucketId | null;
  vixBucketLabel: string | null;
  alreadyInCorrection: boolean;
  horizons: Record<
    CorrectionHorizon,
    {
      unconditional: BucketRate;
      /** P(hit) given drawdown bucket (excludes days already in correction). */
      conditionalDrawdown: BucketRate;
      /** P(hit) given drawdown + VIX bucket when VIX history aligns. */
      conditionalCombined: BucketRate;
    }
  >;
  interpretation: string;
  caveat: string;
};

function rollingPeak(closes: number[], i: number): number {
  const start = Math.max(0, i - PEAK_LOOKBACK + 1);
  let peak = closes[start];
  for (let j = start + 1; j <= i; j++) {
    if (closes[j] > peak) peak = closes[j];
  }
  return peak;
}

function drawdownPct(close: number, peak: number): number {
  if (peak <= 0) return 0;
  return ((close / peak - 1) * 100);
}

export function classifyDrawdown(dd: number): { id: DrawdownBucketId; label: string } {
  if (dd >= -2) return { id: "ath", label: "Within 2% of 52w high" };
  if (dd >= -5) return { id: "mild", label: "−2% to −5% off 52w high" };
  if (dd >= -10) return { id: "moderate", label: "−5% to −10% off 52w high" };
  return { id: "in_correction", label: "Already ≥10% off 52w high" };
}

export function classifyVix(vix: number): { id: VixBucketId; label: string } {
  if (!Number.isFinite(vix)) return { id: "normal", label: "VIX unavailable" };
  if (vix < 15) return { id: "low", label: "VIX below 15" };
  if (vix < 20) return { id: "normal", label: "VIX 15–20" };
  if (vix < 25) return { id: "elevated", label: "VIX 20–25" };
  return { id: "high", label: "VIX above 25" };
}

function validBars(bars: Bar[]): Bar[] {
  return bars.filter(
    (b) => b?.date && typeof b.close === "number" && Number.isFinite(b.close) && b.close > 0,
  );
}

function vixByDate(bars: Bar[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of bars) m.set(b.date, b.close);
  return m;
}

function rate(hits: number, total: number): BucketRate {
  return {
    hits,
    total,
    pct: total > 0 ? Math.round((hits / total) * 1000) / 10 : null,
  };
}

/**
 * True when min(close[i..i+horizon]) falls to ≤90% of the 52w peak at day i.
 * Uses forward window including the start day (correction may deepen from here).
 */
function hitsCorrection(closes: number[], peaks: number[], i: number, horizon: number): boolean {
  const threshold = peaks[i] * CORRECTION_RATIO;
  const end = Math.min(closes.length - 1, i + horizon);
  for (let j = i; j <= end; j++) {
    if (closes[j] <= threshold) return true;
  }
  return false;
}

function daysSinceLastCorrection(
  drawdowns: number[],
  fromIndex: number,
): number | null {
  if (drawdowns[fromIndex] <= -CORRECTION_PCT) return 0;
  for (let j = fromIndex - 1; j >= 0; j--) {
    if (drawdowns[j] <= -CORRECTION_PCT) return fromIndex - j;
  }
  return null;
}

function buildInterpretation(
  dd: number,
  bucketLabel: string,
  vixLabel: string | null,
  h6: BucketRate,
  baseline6: BucketRate,
  alreadyInCorrection: boolean,
): string {
  if (alreadyInCorrection) {
    return `SPY is already ${Math.abs(dd).toFixed(1)}% below its rolling 52-week high — a ≥10% correction by the usual definition. History below compares how often similar setups led to deeper drawdowns vs recovery; this is descriptive, not a forecast.`;
  }
  const cond = h6.pct;
  const base = baseline6.pct;
  if (cond == null || base == null) {
    return `With SPY ${bucketLabel.toLowerCase()}${vixLabel ? ` and ${vixLabel.toLowerCase()}` : ""}, historical samples are too thin for a stable 6-month correction rate.`;
  }
  const diff = cond - base;
  const diffWord =
    Math.abs(diff) < 2
      ? "about in line with"
      : diff > 0
        ? "somewhat above"
        : "somewhat below";
  return `With SPY ${bucketLabel.toLowerCase()}${vixLabel ? ` and ${vixLabel.toLowerCase()}` : ""}, a ≥10% drawdown from the 52w high showed up within the next ~6 months about ${cond.toFixed(0)}% of the time in this sample — ${diffWord} the ${base.toFixed(0)}% baseline for any random day.`;
}

/**
 * Historical correction frequencies from aligned SPY (+ optional VIX) daily bars.
 * Correction = close falls to ≥10% below the rolling ~52-week high.
 */
export function buildCorrectionOdds(
  spyBars: Bar[],
  vixBars: Bar[] = [],
  vixLast: number | null = null,
): CorrectionOdds | null {
  const spy = validBars(spyBars);
  const vix = validBars(vixBars);
  if (spy.length < PEAK_LOOKBACK + CORRECTION_HORIZONS["6mo"] + 10) return null;

  const closes = spy.map((b) => b.close);
  const dates = spy.map((b) => b.date);
  const n = closes.length;
  const peaks = new Array<number>(n);
  const drawdowns = new Array<number>(n);
  const ddBuckets = new Array<DrawdownBucketId>(n);
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
  const alreadyInCorrection = currentDd <= -CORRECTION_PCT;

  const horizons = {} as CorrectionOdds["horizons"];

  for (const [key, horizon] of Object.entries(CORRECTION_HORIZONS) as [
    CorrectionHorizon,
    number,
  ][]) {
    let uncondHits = 0;
    let uncondTotal = 0;
    let ddHits = 0;
    let ddTotal = 0;
    let comboHits = 0;
    let comboTotal = 0;

    const start = PEAK_LOOKBACK - 1;
    const end = n - horizon - 1;

    for (let i = start; i <= end; i++) {
      const hit = hitsCorrection(closes, peaks, i, horizon);
      uncondTotal++;
      if (hit) uncondHits++;

      if (ddBuckets[i] === currentBucket.id && ddBuckets[i] !== "in_correction") {
        ddTotal++;
        if (hit) ddHits++;
      }

      if (
        currentVixBucket &&
        ddBuckets[i] === currentBucket.id &&
        ddBuckets[i] !== "in_correction" &&
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

  return {
    sampleDays: n,
    sampleLabel: `~${years}y SPY daily closes`,
    drawdownPct: Math.round(currentDd * 100) / 100,
    peak52w: Math.round(peaks[tip] * 100) / 100,
    lastClose: Math.round(closes[tip] * 100) / 100,
    drawdownBucket: currentBucket.id,
    drawdownBucketLabel: currentBucket.label,
    daysSinceCorrection: daysSinceLastCorrection(drawdowns, tip),
    vixLast: currentVix != null ? Math.round(currentVix * 100) / 100 : null,
    vixBucket: currentVixBucket?.id ?? null,
    vixBucketLabel: currentVixBucket?.label ?? null,
    alreadyInCorrection,
    horizons,
    interpretation: buildInterpretation(
      currentDd,
      currentBucket.label,
      currentVixBucket?.label ?? null,
      h6.conditionalDrawdown.total >= 8 ? h6.conditionalDrawdown : h6.conditionalCombined,
      h6.unconditional,
      alreadyInCorrection,
    ),
    caveat:
      "Historical frequency only — not a prediction. Past drawdown and VIX regimes do not guarantee future corrections. Free delayed quotes; sample length and bucket counts limit precision.",
  };
}
