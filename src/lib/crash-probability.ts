import type { Bar } from "./market-data";
import {
  buildDrawdownOdds,
  type BucketRate,
  type DrawdownHorizon,
  type VixBucketId,
} from "./drawdown-probability";

export { DRAWDOWN_HORIZONS as CRASH_HORIZONS } from "./drawdown-probability";

export type CrashHorizon = DrawdownHorizon;

export type CrashDrawdownBucketId =
  | "ath"
  | "mild"
  | "moderate"
  | "in_correction"
  | "in_crash";

export type { VixBucketId, BucketRate };

const CRASH_PCT = 20;

export function classifyCrashDrawdown(dd: number): {
  id: CrashDrawdownBucketId;
  label: string;
} {
  if (dd >= -2) return { id: "ath", label: "Within 2% of 52w high" };
  if (dd >= -5) return { id: "mild", label: "−2% to −5% off 52w high" };
  if (dd >= -10) return { id: "moderate", label: "−5% to −10% off 52w high" };
  if (dd >= -20) return { id: "in_correction", label: "−10% to −20% off 52w high" };
  return {
    id: "in_crash",
    label: "Already ≥20% off 52w high (crash / bear threshold)",
  };
}

export { classifyVix } from "./drawdown-probability";

export type CrashOdds = {
  sampleDays: number;
  sampleLabel: string;
  drawdownPct: number;
  peak52w: number;
  lastClose: number;
  drawdownBucket: CrashDrawdownBucketId;
  drawdownBucketLabel: string;
  daysSinceCrash: number | null;
  vixLast: number | null;
  vixBucket: VixBucketId | null;
  vixBucketLabel: string | null;
  alreadyInCrash: boolean;
  horizons: Record<
    CrashHorizon,
    {
      unconditional: BucketRate;
      conditionalDrawdown: BucketRate;
      conditionalCombined: BucketRate;
    }
  >;
  interpretation: string;
  caveat: string;
};

function buildInterpretation(
  dd: number,
  bucketLabel: string,
  vixLabel: string | null,
  h6: BucketRate,
  baseline6: BucketRate,
  alreadyInCrash: boolean,
): string {
  if (alreadyInCrash) {
    return `SPY is already ${Math.abs(dd).toFixed(1)}% below its rolling 52-week high — at or past the common crash / bear-market threshold (≥20%). History below compares how often similar setups led to deeper drawdowns vs recovery; this is descriptive, not a forecast.`;
  }
  const cond = h6.pct;
  const base = baseline6.pct;
  if (cond == null || base == null) {
    return `With SPY ${bucketLabel.toLowerCase()}${vixLabel ? ` and ${vixLabel.toLowerCase()}` : ""}, historical samples are too thin for a stable 6-month crash-rate estimate.`;
  }
  const diff = cond - base;
  const diffWord =
    Math.abs(diff) < 2
      ? "about in line with"
      : diff > 0
        ? "somewhat above"
        : "somewhat below";
  return `With SPY ${bucketLabel.toLowerCase()}${vixLabel ? ` and ${vixLabel.toLowerCase()}` : ""}, a ≥20% drawdown from the 52w high (crash / bear-market threshold) showed up within the next ~6 months about ${cond.toFixed(0)}% of the time in this sample — ${diffWord} the ${base.toFixed(0)}% baseline for any random day.`;
}

/**
 * Historical crash / bear-market drawdown frequencies from aligned SPY (+ optional VIX) daily bars.
 * Crash = close falls to ≥20% below the rolling ~52-week high (common bear-market threshold, not a precise crash definition).
 */
export function buildCrashOdds(
  spyBars: Bar[],
  vixBars: Bar[] = [],
  vixLast: number | null = null,
): CrashOdds | null {
  const result = buildDrawdownOdds(
    spyBars,
    {
      thresholdPct: CRASH_PCT,
      inThresholdBucketId: "in_crash",
      classifyDrawdown: classifyCrashDrawdown,
      buildInterpretation: ({
        dd,
        bucketLabel,
        vixLabel,
        h6,
        baseline6,
        alreadyAtThreshold,
      }) => buildInterpretation(dd, bucketLabel, vixLabel, h6, baseline6, alreadyAtThreshold),
      caveat:
        "Historical frequency only — not a prediction. The ≥20% threshold is a common crash / bear-market reference, not a precise crash definition. Past drawdown and VIX regimes do not guarantee future outcomes. Free delayed quotes; sample length and bucket counts limit precision.",
    },
    vixBars,
    vixLast,
  );
  if (!result) return null;

  return {
    sampleDays: result.sampleDays,
    sampleLabel: result.sampleLabel,
    drawdownPct: result.drawdownPct,
    peak52w: result.peak52w,
    lastClose: result.lastClose,
    drawdownBucket: result.drawdownBucket,
    drawdownBucketLabel: result.drawdownBucketLabel,
    daysSinceCrash: result.daysSinceThreshold,
    vixLast: result.vixLast,
    vixBucket: result.vixBucket,
    vixBucketLabel: result.vixBucketLabel,
    alreadyInCrash: result.alreadyAtThreshold,
    horizons: result.horizons,
    interpretation: result.interpretation,
    caveat: result.caveat,
  };
}
