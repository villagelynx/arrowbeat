import type { Bar } from "./market-data";
import {
  PEAK_LOOKBACK,
  drawdownPct,
  rollingPeak,
  validBars,
} from "./drawdown-probability";

/** Matches site correction / crash thresholds (rolling ~52-week peak). */
export const CORRECTION_THRESHOLD_PCT = 10;
export const CRASH_THRESHOLD_PCT = 20;

export type CorrectionSeverity = "correction" | "crash";

export type CorrectionEpisode = {
  startDate: string;
  troughDate: string;
  /** null when the episode is still open. */
  endDate: string | null;
  maxDepthPct: number;
  severity: CorrectionSeverity;
  /** Trading sessions from start to trough. */
  declineDays: number;
  /** Trading sessions from start to recovery (null if ongoing). */
  durationDays: number | null;
  /** Trading sessions from trough to recovery (null if ongoing). */
  recoveryDays: number | null;
};

export type CorrectionHistoryPoint = {
  date: string;
  close: number;
  drawdownPct: number;
  inCorrection: boolean;
  inCrash: boolean;
};

export type CorrectionHistory = {
  startDate: string;
  endDate: string;
  rangeLabel: string;
  sampleDays: number;
  totalEpisodes: number;
  crashEpisodes: number;
  /** Currently in ≥10% drawdown vs rolling 52w high, if any. */
  ongoing: CorrectionEpisode | null;
  /** Newest first. */
  episodes: CorrectionEpisode[];
  /** Downsampled index + drawdown for charts (~400 points). */
  chartSeries: CorrectionHistoryPoint[];
};

function tradingDaysBetween(dates: string[], fromIdx: number, toIdx: number): number {
  if (toIdx <= fromIdx) return 0;
  return toIdx - fromIdx;
}

function buildEpisode(
  dates: string[],
  closes: number[],
  startIdx: number,
  troughIdx: number,
  endIdx: number | null,
  maxDepth: number,
): CorrectionEpisode {
  const severity: CorrectionSeverity =
    maxDepth <= -CRASH_THRESHOLD_PCT ? "crash" : "correction";
  const endDate = endIdx != null ? dates[endIdx] : null;
  const durationDays =
    endIdx != null ? tradingDaysBetween(dates, startIdx, endIdx) : null;
  const recoveryDays =
    endIdx != null ? tradingDaysBetween(dates, troughIdx, endIdx) : null;

  return {
    startDate: dates[startIdx],
    troughDate: dates[troughIdx],
    endDate,
    maxDepthPct: Math.round(maxDepth * 100) / 100,
    severity,
    declineDays: tradingDaysBetween(dates, startIdx, troughIdx),
    durationDays,
    recoveryDays,
  };
}

/**
 * Detect ≥10% drawdown episodes vs rolling ~252-session peak (^GSPC / SPY definition).
 */
export function detectCorrectionEpisodes(bars: Bar[]): CorrectionEpisode[] {
  const series = validBars(bars);
  if (series.length < PEAK_LOOKBACK + 2) return [];

  const closes = series.map((b) => b.close);
  const dates = series.map((b) => b.date);
  const n = closes.length;
  const drawdowns = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const peak = rollingPeak(closes, i);
    drawdowns[i] = drawdownPct(closes[i], peak);
  }

  const episodes: CorrectionEpisode[] = [];
  let inEpisode = false;
  let startIdx = 0;
  let troughIdx = 0;
  let maxDepth = 0;

  for (let i = PEAK_LOOKBACK; i < n; i++) {
    const dd = drawdowns[i];
    const prevDd = drawdowns[i - 1];
    const entered = dd <= -CORRECTION_THRESHOLD_PCT && prevDd > -CORRECTION_THRESHOLD_PCT;
    const exited = inEpisode && dd > -CORRECTION_THRESHOLD_PCT;

    if (!inEpisode && entered) {
      inEpisode = true;
      startIdx = i;
      troughIdx = i;
      maxDepth = dd;
      continue;
    }

    if (inEpisode) {
      if (dd < maxDepth) {
        maxDepth = dd;
        troughIdx = i;
      }
      if (exited) {
        episodes.push(buildEpisode(dates, closes, startIdx, troughIdx, i, maxDepth));
        inEpisode = false;
      }
    }
  }

  if (inEpisode) {
    episodes.push(
      buildEpisode(dates, closes, startIdx, troughIdx, null, maxDepth),
    );
  }

  return episodes;
}

function downsampleSeries(
  dates: string[],
  closes: number[],
  drawdowns: number[],
  targetPoints = 420,
): CorrectionHistoryPoint[] {
  const n = dates.length;
  if (n <= targetPoints) {
    return dates.map((date, i) => ({
      date,
      close: closes[i],
      drawdownPct: Math.round(drawdowns[i] * 100) / 100,
      inCorrection: drawdowns[i] <= -CORRECTION_THRESHOLD_PCT,
      inCrash: drawdowns[i] <= -CRASH_THRESHOLD_PCT,
    }));
  }
  const step = (n - 1) / (targetPoints - 1);
  const out: CorrectionHistoryPoint[] = [];
  for (let k = 0; k < targetPoints; k++) {
    const i = Math.min(n - 1, Math.round(k * step));
    out.push({
      date: dates[i],
      close: closes[i],
      drawdownPct: Math.round(drawdowns[i] * 100) / 100,
      inCorrection: drawdowns[i] <= -CORRECTION_THRESHOLD_PCT,
      inCrash: drawdowns[i] <= -CRASH_THRESHOLD_PCT,
    });
  }
  return out;
}

export function buildCorrectionHistory(
  bars: Bar[],
  rangeLabel: string,
): CorrectionHistory | null {
  const series = validBars(bars);
  if (series.length < PEAK_LOOKBACK + 2) return null;

  const closes = series.map((b) => b.close);
  const dates = series.map((b) => b.date);
  const n = closes.length;
  const drawdowns = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    drawdowns[i] = drawdownPct(closes[i], rollingPeak(closes, i));
  }

  const episodes = detectCorrectionEpisodes(series);
  const ongoing = episodes.length && episodes[episodes.length - 1].endDate == null
    ? episodes[episodes.length - 1]
    : null;
  const completed = ongoing ? episodes.slice(0, -1) : episodes;
  const ordered = [...completed].reverse();

  return {
    startDate: dates[PEAK_LOOKBACK],
    endDate: dates[n - 1],
    rangeLabel,
    sampleDays: n - PEAK_LOOKBACK,
    totalEpisodes: episodes.length,
    crashEpisodes: episodes.filter((e) => e.severity === "crash").length,
    ongoing,
    episodes: ordered,
    chartSeries: downsampleSeries(
      dates.slice(PEAK_LOOKBACK),
      closes.slice(PEAK_LOOKBACK),
      drawdowns.slice(PEAK_LOOKBACK),
    ),
  };
}

export function formatEpisodeRange(ep: CorrectionEpisode): string {
  const start = ep.startDate.slice(0, 7);
  const end = ep.endDate ? ep.endDate.slice(0, 7) : "ongoing";
  return `${start} → ${end}`;
}

export function formatDurationDays(days: number | null): string {
  if (days == null) return "—";
  if (days < 63) return `~${days} sessions`;
  const months = Math.round((days / 21) * 10) / 10;
  return `~${months} mo (${days} sessions)`;
}
