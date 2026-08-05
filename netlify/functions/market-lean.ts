import { buildMarketSnapshot } from "../../server/market-snapshot";
import {
  buildLiveSignal,
  buildMag7Signals,
  type TomorrowSignal,
} from "../../src/lib/signal";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type NetlifyEvent = {
  httpMethod?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
  headers?: Record<string, string | undefined>;
};

type NetlifyResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type LeanCard = {
  symbol: string;
  name: string;
  bias: "up" | "down";
  probabilityHigher: number;
  probabilityLower: number;
  lead: number;
  confidenceLabel: string;
  available: boolean;
  /** Next-session calendar date (YYYY-MM-DD). */
  sessionDate: string | null;
  /** e.g. "Tomorrow's lean" / "Next session lean" */
  horizonLabel: string;
  /** e.g. "Into tomorrow" / "Into Monday" */
  kicker: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Function deadline ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function loadStaticSnapshotFallback() {
  const path = join(process.cwd(), "public", "market-snapshot.json");
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as Awaited<ReturnType<typeof buildMarketSnapshot>>;
}

function corsResult(statusCode: number, body: unknown): NetlifyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": statusCode === 200 ? "public, max-age=60" : "no-store",
      ...CORS_HEADERS,
    },
    body: JSON.stringify(body),
  };
}

function cardFromTomorrow(
  symbol: string,
  name: string,
  tomorrow: TomorrowSignal | null | undefined,
): LeanCard | null {
  if (!tomorrow) return null;
  const lead =
    tomorrow.bias === "up" ? tomorrow.probabilityHigher : tomorrow.probabilityLower;
  return {
    symbol,
    name,
    bias: tomorrow.bias,
    probabilityHigher: tomorrow.probabilityHigher,
    probabilityLower: tomorrow.probabilityLower,
    lead,
    confidenceLabel: tomorrow.confidenceLabel,
    available: true,
    sessionDate: tomorrow.asOfDate,
    horizonLabel: tomorrow.label,
    kicker: tomorrow.kicker,
  };
}

/**
 * Compact SPY + Mag7 next-session lean cards for embeds / Sports in 60 promo.
 * GET /api/market/lean
 * Default horizon = next (tomorrow / next session predicted probability).
 */
export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  if ((event.httpMethod || "GET").toUpperCase() === "OPTIONS") {
    return { statusCode: 204, headers: { ...CORS_HEADERS }, body: "" };
  }

  try {
    let snapshot: Awaited<ReturnType<typeof buildMarketSnapshot>>;
    try {
      snapshot = await withDeadline(buildMarketSnapshot(), 8000);
    } catch {
      snapshot = await loadStaticSnapshotFallback();
    }

    const live = buildLiveSignal(snapshot);
    const mag7 = buildMag7Signals(snapshot);

    const spyCard = cardFromTomorrow("SPY", "S&P 500", live.tomorrow);
    if (!spyCard) {
      return corsResult(502, { error: "Next-session lean unavailable" });
    }

    const leans: LeanCard[] = [
      spyCard,
      ...mag7
        .map((row) => cardFromTomorrow(row.symbol, row.name, row.tomorrow))
        .filter((row): row is LeanCard => Boolean(row && row.available)),
    ];

    // Mag7 without tomorrow still list as unavailable so the picker can show icons.
    for (const row of mag7) {
      if (leans.some((l) => l.symbol === row.symbol)) continue;
      leans.push({
        symbol: row.symbol,
        name: row.name,
        bias: "up",
        probabilityHigher: 50,
        probabilityLower: 50,
        lead: 50,
        confidenceLabel: row.confidenceLabel,
        available: false,
        sessionDate: null,
        horizonLabel: "Next session lean",
        kicker: "Into next session",
      });
    }

    const requested = (event.queryStringParameters?.symbol || "SPY")
      .trim()
      .toUpperCase();
    const selected =
      leans.find((row) => row.symbol === requested && row.available) ||
      leans.find((row) => row.symbol === "SPY" && row.available) ||
      spyCard;

    return corsResult(200, {
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
      delayNote: snapshot.delayNote ?? "~15m delayed",
      horizon: "next",
      asOfDate: live.asOfDate,
      sessionLabel: live.sessionLabel,
      nextSessionDate: selected.sessionDate,
      selected,
      leans,
    });
  } catch (error) {
    return corsResult(502, {
      error: error instanceof Error ? error.message : "Lean fetch failed",
    });
  }
}
