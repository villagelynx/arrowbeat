import type { Bar } from "./market-data";
import type { Bias, DailySignal } from "./signal";

const STORAGE_KEY = "arrowbeat.scorecard.v1";

export type PredictionRecord = {
  date: string;
  bias: Bias;
  probabilityHigher: number;
  probabilityLower: number;
  confidence: number;
  recordedAt: string;
  /** Set once SPY close for that date is known. */
  outcome?: Bias | "flat";
  changePct?: number;
  correct?: boolean | null;
  settledAt?: string;
};

export type ScorecardSummary = {
  settled: number;
  hits: number;
  hitRate: number | null;
  /** Mean Brier score on P(higher); lower is better. Coin flip ≈ 0.25. */
  brier: number | null;
  pending: PredictionRecord | null;
  recent: PredictionRecord[];
  records: PredictionRecord[];
};

function weekdayIndex(iso: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(new Date(`${iso}T12:00:00-04:00`));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}

function isWeekday(iso: string): boolean {
  const d = weekdayIndex(iso);
  return d >= 1 && d <= 5;
}

function dailyReturns(bars: Bar[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const cur = bars[i].close;
    if (prev > 0) map.set(bars[i].date, (cur - prev) / prev);
  }
  return map;
}

function loadRecords(): PredictionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PredictionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecords(records: PredictionRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Quota / private mode — scorecard stays in-memory for this session only.
  }
}

function settleRecords(records: PredictionRecord[], returns: Map<string, number>): PredictionRecord[] {
  const now = new Date().toISOString();
  return records.map((rec) => {
    if (rec.outcome != null) return rec;
    const ret = returns.get(rec.date);
    if (ret == null) return rec;
    const changePct = Math.round(ret * 10000) / 100;
    if (ret === 0) {
      return {
        ...rec,
        outcome: "flat" as const,
        changePct,
        correct: null,
        settledAt: now,
      };
    }
    const outcome: Bias = ret > 0 ? "up" : "down";
    return {
      ...rec,
      outcome,
      changePct,
      correct: rec.bias === outcome,
      settledAt: now,
    };
  });
}

function summarize(records: PredictionRecord[], asOfDate: string): ScorecardSummary {
  const graded = records.filter((r) => r.outcome === "up" || r.outcome === "down");
  const hits = graded.filter((r) => r.correct === true).length;
  const settled = graded.length;
  const hitRate = settled ? Math.round((hits / settled) * 1000) / 10 : null;

  let brier: number | null = null;
  if (settled) {
    const sum = graded.reduce((acc, r) => {
      const p = r.probabilityHigher / 100;
      const y = r.outcome === "up" ? 1 : 0;
      return acc + (p - y) ** 2;
    }, 0);
    brier = Math.round((sum / settled) * 1000) / 1000;
  }

  const pending =
    records.find((r) => r.date === asOfDate && r.outcome == null) ??
    records.filter((r) => r.outcome == null).sort((a, b) => b.date.localeCompare(a.date))[0] ??
    null;

  const recent = [...records]
    .filter((r) => r.outcome != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  return {
    settled,
    hits,
    hitRate,
    brier,
    pending,
    recent,
    records: [...records].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/**
 * Persist today's live lean (Mon–Fri only) and settle any past days once SPY closes exist.
 * Skips recording after that session's close is already in the bar series (no look-ahead).
 */
export function syncScorecard(signal: DailySignal, spyBars: Bar[]): ScorecardSummary {
  if (signal.dataMode !== "live") {
    return summarize(loadRecords(), signal.asOfDate);
  }

  const returns = dailyReturns(spyBars);
  let records = settleRecords(loadRecords(), returns);

  const date = signal.asOfDate;
  const sessionClosed = returns.has(date);

  if (isWeekday(date) && !sessionClosed) {
    const existing = records.find((r) => r.date === date);
    const next: PredictionRecord = {
      date,
      bias: signal.bias,
      probabilityHigher: signal.probabilityHigher,
      probabilityLower: signal.probabilityLower,
      confidence: signal.confidence,
      recordedAt: existing?.recordedAt ?? new Date().toISOString(),
    };
    // Update lean until the session closes so the scorecard matches what you last saw.
    records = [...records.filter((r) => r.date !== date), next];
  }

  // If today's bar just appeared, settle after optionally locking the last pre-close lean.
  records = settleRecords(records, returns);
  saveRecords(records);
  return summarize(records, date);
}

export function emptyScorecard(_asOfDate = ""): ScorecardSummary {
  return {
    settled: 0,
    hits: 0,
    hitRate: null,
    brier: null,
    pending: null,
    recent: [],
    records: [],
  };
}
