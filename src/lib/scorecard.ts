import type { Bar } from "./market-data";
import type { Bias, DailySignal } from "./signal";
import { reconstructSessionLean } from "./signal";

const STORAGE_KEY = "arrowbeat.scorecard.v2";
const LEGACY_STORAGE_KEY = "arrowbeat.scorecard.v1";
/** Enough SPY sessions for a last-100 hit rate (+ buffer for today / flats). */
const BACKFILL_SESSIONS = 110;
const HIT_WINDOW_10 = 10;
const HIT_WINDOW_100 = 100;

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

export type HitWindow = {
  settled: number;
  hits: number;
  hitRate: number | null;
};

export type ScorecardSummary = {
  /** @deprecated Prefer hitRate10 — kept for share / older UI paths. */
  settled: number;
  hits: number;
  hitRate: number | null;
  hitRate10: HitWindow;
  hitRate100: HitWindow;
  /** Mean Brier score on P(higher) over last-100 graded days; lower is better. Coin flip ≈ 0.25. */
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
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
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
    // Keep v1 in sync so older tabs don't resurrect a stale wrong grade list.
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Quota / private mode — scorecard stays in-memory for this session only.
  }
}

/** Drop settlement fields so a provisional intraday grade can be reopened. */
function clearSettlement(rec: PredictionRecord): PredictionRecord {
  return {
    date: rec.date,
    bias: rec.bias,
    probabilityHigher: rec.probabilityHigher,
    probabilityLower: rec.probabilityLower,
    confidence: rec.confidence,
    recordedAt: rec.recordedAt,
  };
}

/**
 * Grade only after a later SPY daily bar exists.
 * Yahoo often publishes an unfinished “today” bar during RTH — treating that as a final
 * close permanently marked wrong hits/misses. Wait for the next session’s bar so the prior
 * close is frozen before we score.
 */
function isSessionReadyToSettle(dateIso: string, bars: Bar[]): boolean {
  return bars.some((b) => b.date > dateIso);
}

function settleRecords(
  records: PredictionRecord[],
  returns: Map<string, number>,
  bars: Bar[],
): PredictionRecord[] {
  const now = new Date().toISOString();
  return records.map((rec) => {
    if (!isSessionReadyToSettle(rec.date, bars)) {
      // Strip any grade that was frozen from an unfinished same-day bar.
      return rec.outcome != null ? clearSettlement(rec) : rec;
    }

    const ret = returns.get(rec.date);
    if (ret == null) {
      return rec.outcome != null ? clearSettlement(rec) : rec;
    }

    const changePct = Math.round(ret * 10000) / 100;
    // Always recompute — even previously settled rows — so official closes overwrite bad grades.
    if (ret === 0) {
      return {
        ...rec,
        outcome: "flat" as const,
        changePct,
        correct: null,
        settledAt: rec.settledAt ?? now,
      };
    }
    const outcome: Bias = ret > 0 ? "up" : "down";
    return {
      ...rec,
      outcome,
      changePct,
      correct: rec.bias === outcome,
      settledAt: rec.settledAt ?? now,
    };
  });
}

function emptyHitWindow(): HitWindow {
  return { settled: 0, hits: 0, hitRate: null };
}

function hitWindow(gradedNewestFirst: PredictionRecord[], n: number): HitWindow {
  const slice = gradedNewestFirst.slice(0, n);
  const settled = slice.length;
  if (!settled) return emptyHitWindow();
  const hits = slice.filter((r) => r.correct === true).length;
  return {
    settled,
    hits,
    hitRate: Math.round((hits / settled) * 1000) / 10,
  };
}

function brierFor(gradedNewestFirst: PredictionRecord[], n: number): number | null {
  const slice = gradedNewestFirst.slice(0, n);
  if (!slice.length) return null;
  const sum = slice.reduce((acc, r) => {
    const p = r.probabilityHigher / 100;
    const y = r.outcome === "up" ? 1 : 0;
    return acc + (p - y) ** 2;
  }, 0);
  return Math.round((sum / slice.length) * 1000) / 1000;
}

function summarize(records: PredictionRecord[], asOfDate: string): ScorecardSummary {
  const gradedNewestFirst = [...records]
    .filter((r) => r.outcome === "up" || r.outcome === "down")
    .sort((a, b) => b.date.localeCompare(a.date));

  const hitRate10 = hitWindow(gradedNewestFirst, HIT_WINDOW_10);
  const hitRate100 = hitWindow(gradedNewestFirst, HIT_WINDOW_100);
  const brier = brierFor(gradedNewestFirst, HIT_WINDOW_100);

  const pending =
    records.find((r) => r.date === asOfDate && r.outcome == null) ??
    records.filter((r) => r.outcome == null).sort((a, b) => b.date.localeCompare(a.date))[0] ??
    null;

  const recent = [...records]
    .filter((r) => r.outcome != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, HIT_WINDOW_10);

  return {
    // Primary headline = last 10 (what the list below shows).
    settled: hitRate10.settled,
    hits: hitRate10.hits,
    hitRate: hitRate10.hitRate,
    hitRate10,
    hitRate100,
    brier,
    pending,
    recent,
    records: [...records].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/**
 * Ensure recent SPY sessions have a lean even if nobody opened ArrowBeat that day.
 * Uses prior-close reconstruction (no same-day peek). Does not overwrite existing rows.
 */
function backfillMissingSessions(
  records: PredictionRecord[],
  spyBars: Bar[],
  asOfDate: string,
): PredictionRecord[] {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const sessionDates = spyBars
    .map((b) => b.date)
    .filter((d) => isWeekday(d) && d <= asOfDate)
    .slice(-BACKFILL_SESSIONS);

  // Also cover today before Yahoo publishes today's bar.
  if (isWeekday(asOfDate) && !sessionDates.includes(asOfDate)) {
    sessionDates.push(asOfDate);
  }

  const now = new Date().toISOString();
  for (const date of sessionDates) {
    if (byDate.has(date)) continue;
    const lean = reconstructSessionLean(date, spyBars);
    if (!lean) continue;
    byDate.set(date, {
      date,
      bias: lean.bias,
      probabilityHigher: lean.probabilityHigher,
      probabilityLower: lean.probabilityLower,
      confidence: lean.confidence,
      recordedAt: now,
    });
  }
  return [...byDate.values()];
}

/**
 * Persist today's live lean (Mon–Fri only), backfill recent sessions from SPY history,
 * and settle days once a *later* SPY bar exists (official close is frozen).
 * Never grade unfinished same-day Yahoo bars.
 */
export function syncScorecard(signal: DailySignal, spyBars: Bar[]): ScorecardSummary {
  if (signal.dataMode !== "live") {
    return summarize(loadRecords(), signal.asOfDate);
  }

  const returns = dailyReturns(spyBars);
  let records = settleRecords(loadRecords(), returns, spyBars);

  const date = signal.asOfDate;
  const readyToSettle = isSessionReadyToSettle(date, spyBars);

  // Fill gaps for recent sessions (visit not required).
  records = backfillMissingSessions(records, spyBars, date);

  // Keep updating the open session lean from the live desk until the close is final.
  if (isWeekday(date) && !readyToSettle) {
    const existing = records.find((r) => r.date === date);
    const next: PredictionRecord = {
      date,
      bias: signal.bias,
      probabilityHigher: signal.probabilityHigher,
      probabilityLower: signal.probabilityLower,
      confidence: signal.confidence,
      recordedAt: existing?.recordedAt ?? new Date().toISOString(),
    };
    records = [...records.filter((r) => r.date !== date), next];
  }

  records = settleRecords(records, returns, spyBars);
  saveRecords(records);
  return summarize(records, date);
}

export function emptyScorecard(_asOfDate = ""): ScorecardSummary {
  return {
    settled: 0,
    hits: 0,
    hitRate: null,
    hitRate10: emptyHitWindow(),
    hitRate100: emptyHitWindow(),
    brier: null,
    pending: null,
    recent: [],
    records: [],
  };
}

/** Compact row for URL-encoded share snapshots (keep hash short). */
export type SharedScoreRow = {
  d: string;
  b: "u" | "d";
  /** 1 hit, 0 miss, null flat / unset */
  ok: 0 | 1 | null;
  /** Absolute error vs P(higher), rounded; null if flat */
  e: number | null;
};

/** Compact snapshot: hitRate `h`, settled `s`, hits `i`, recent `n`. */
export type SharedScoreSnapshot = {
  h: number | null;
  s: number;
  i: number;
  n: SharedScoreRow[];
};

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const pad = encoded.length % 4 === 0 ? "" : "=".repeat(4 - (encoded.length % 4));
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function rowErrorPct(row: PredictionRecord): number | null {
  if (row.outcome !== "up" && row.outcome !== "down") return null;
  return Math.round(Math.abs(row.probabilityHigher - (row.outcome === "up" ? 100 : 0)));
}

/** Compact base64url JSON for `?view=score#s=…` share links. */
export function encodeShareSnapshot(summary: ScorecardSummary): string {
  const payload: SharedScoreSnapshot = {
    h: summary.hitRate,
    s: summary.settled,
    i: summary.hits,
    n: summary.recent.slice(0, 10).map((row) => ({
      d: row.date,
      b: row.bias === "up" ? "u" : "d",
      ok: row.correct === true ? 1 : row.correct === false ? 0 : null,
      e: rowErrorPct(row),
    })),
  };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeShareSnapshot(encoded: string): SharedScoreSnapshot | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as SharedScoreSnapshot;
    if (typeof parsed !== "object" || parsed == null) return null;
    if (typeof parsed.s !== "number" || !Array.isArray(parsed.n)) return null;
    const h =
      parsed.h == null
        ? null
        : typeof parsed.h === "number" && Number.isFinite(parsed.h)
          ? parsed.h
          : null;
    const i = typeof parsed.i === "number" && Number.isFinite(parsed.i) ? parsed.i : 0;
    const n: SharedScoreRow[] = [];
    for (const row of parsed.n.slice(0, 10)) {
      if (!row || typeof row.d !== "string") continue;
      if (row.b !== "u" && row.b !== "d") continue;
      const ok = row.ok === 1 || row.ok === 0 ? row.ok : null;
      const e = typeof row.e === "number" && Number.isFinite(row.e) ? row.e : null;
      n.push({ d: row.d, b: row.b, ok, e });
    }
    return { h, s: parsed.s, i, n };
  } catch {
    return null;
  }
}

/** Canonical public host for share links (not netlify.app / localhost). */
export const SCORE_SHARE_ORIGIN = "https://arrowbeat.com";

/** Share URL: `https://arrowbeat.com/?view=score` with optional `#s=<snapshot>`. */
export function buildScoreShareUrl(summary: ScorecardSummary): string {
  const url = new URL("/", SCORE_SHARE_ORIGIN);
  url.searchParams.set("view", "score");
  if (summary.settled > 0 || summary.recent.length > 0) {
    url.hash = `s=${encodeShareSnapshot(summary)}`;
  } else {
    url.hash = "scorecard";
  }
  return url.toString();
}
