import type { Bar } from "./market-data";
import {
  buildDrawdownOdds,
  type BucketRate,
  type DrawdownHorizon,
  type VixBucketId,
} from "./drawdown-probability";

export { DRAWDOWN_HORIZONS as CORRECTION_HORIZONS } from "./drawdown-probability";

export type CorrectionHorizon = DrawdownHorizon;

export type DrawdownBucketId = "ath" | "mild" | "moderate" | "in_correction";

export type { VixBucketId, BucketRate };

const CORRECTION_PCT = 10;

export function classifyDrawdown(dd: number): { id: DrawdownBucketId; label: string } {
  if (dd >= -2) return { id: "ath", label: "Within 2% of 52w high" };
  if (dd >= -5) return { id: "mild", label: "−2% to −5% off 52w high" };
  if (dd >= -10) return { id: "moderate", label: "−5% to −10% off 52w high" };
  return { id: "in_correction", label: "Already ≥10% off 52w high" };
}

export { classifyVix } from "./drawdown-probability";

export type CorrectionOdds = {
  sampleDays: number;
  sampleLabel: string;
  drawdownPct: number;
  peak52w: number;
  lastClose: number;
  drawdownBucket: DrawdownBucketId;
  drawdownBucketLabel: string;
  daysSinceCorrection: number | null;
  vixLast: number | null;
  vixBucket: VixBucketId | null;
  vixBucketLabel: string | null;
  alreadyInCorrection: boolean;
  horizons: Record<
    CorrectionHorizon,
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
  const result = buildDrawdownOdds(
    spyBars,
    {
      thresholdPct: CORRECTION_PCT,
      inThresholdBucketId: "in_correction",
      classifyDrawdown,
      buildInterpretation: ({
        dd,
        bucketLabel,
        vixLabel,
        h6,
        baseline6,
        alreadyAtThreshold,
      }) => buildInterpretation(dd, bucketLabel, vixLabel, h6, baseline6, alreadyAtThreshold),
      caveat:
        "Historical frequency only — not a prediction. Past drawdown and VIX regimes do not guarantee future corrections. Free delayed quotes; sample length and bucket counts limit precision.",
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
    daysSinceCorrection: result.daysSinceThreshold,
    vixLast: result.vixLast,
    vixBucket: result.vixBucket,
    vixBucketLabel: result.vixBucketLabel,
    alreadyInCorrection: result.alreadyAtThreshold,
    horizons: result.horizons,
    interpretation: result.interpretation,
    caveat: result.caveat,
  };
}
