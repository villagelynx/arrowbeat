import type { Bias, Factor, TomorrowSignal } from "./signal";
import type { HitWindow } from "./scorecard";

export type SessionBriefInput = {
  symbol: string;
  name: string;
  sessionLabel: string;
  asOfDate: string;
  bias: Bias;
  probabilityHigher: number;
  probabilityLower: number;
  confidence: 1 | 2 | 3 | 4 | 5;
  confidenceLabel: string;
  factors: Factor[];
  tomorrow: TomorrowSignal | null;
  /** Optional SPY scorecard window (shown on SPY briefs). */
  hitRate10?: HitWindow | null;
  dataMode?: "live" | "demo";
};

export type SessionBrief = {
  symbol: string;
  name: string;
  sessionLabel: string;
  asOfDate: string;
  bias: Bias;
  headline: string;
  lede: string;
  drivers: string[];
  counterpoint: string | null;
  tomorrowLine: string | null;
  trackRecordLine: string | null;
  closing: string;
  leadPct: number;
  confidenceLabel: string;
};

function leadPct(bias: Bias, higher: number, lower: number): number {
  return bias === "up" ? higher : lower;
}

function directionWord(bias: Bias): string {
  return bias === "up" ? "higher" : "lower";
}

function pickDrivers(factors: Factor[], bias: Bias, limit = 3): Factor[] {
  const aligned = factors.filter((f) => f.supports === bias);
  const pool = aligned.length ? aligned : factors;
  return pool.slice(0, limit);
}

function pickCounter(factors: Factor[], bias: Bias): Factor | null {
  const opposed = factors.filter((f) => f.supports !== bias);
  return opposed[0] ?? null;
}

/**
 * Template desk brief from ArrowBeat leans — no LLM / API.
 * Pure functions over factors you already compute.
 */
export function buildSessionBrief(input: SessionBriefInput): SessionBrief {
  const {
    symbol,
    name,
    sessionLabel,
    asOfDate,
    bias,
    probabilityHigher,
    probabilityLower,
    confidenceLabel,
    factors,
    tomorrow,
    hitRate10,
    dataMode,
  } = input;

  const lead = leadPct(bias, probabilityHigher, probabilityLower);
  const dir = directionWord(bias);
  const displayName = symbol === "SPY" ? "S&P 500 (SPY)" : `${name} (${symbol})`;

  const headline = `${displayName} leans ${dir} at ${lead.toFixed(1)}%`;

  const lede = `${sessionLabel}: ArrowBeat’s session brief puts ${displayName} at a ${dir}-close lean of ${lead.toFixed(1)}% (${confidenceLabel.toLowerCase()} confidence). This is a written read of the same probability desk — not a chat model and not advice.`;

  const drivers = pickDrivers(factors, bias, 3).map((f) => {
    const tip = f.detail?.trim();
    return tip ? `${f.label} — ${tip}` : f.label;
  });

  const counter = pickCounter(factors, bias);
  const counterpoint = counter
    ? `Watch item: ${counter.label}${counter.detail ? ` (${counter.detail})` : ""} pulls the other way.`
    : null;

  let tomorrowLine: string | null = null;
  if (tomorrow) {
    const tLead = leadPct(tomorrow.bias, tomorrow.probabilityHigher, tomorrow.probabilityLower);
    const tDir = directionWord(tomorrow.bias);
    const into = tomorrow.skippedWeekend
      ? `Into ${tomorrow.sessionLabel}`
      : tomorrow.kicker || "Into the next session";
    tomorrowLine = `${into}: thinner calendar lean is ${tDir} at ${tLead.toFixed(1)}% (${tomorrow.confidenceLabel.toLowerCase()}).`;
  }

  let trackRecordLine: string | null = null;
  if (symbol === "SPY" && hitRate10 && hitRate10.settled > 0 && hitRate10.hitRate != null) {
    trackRecordLine = `Scorecard (SPY): ${hitRate10.hits}/${hitRate10.settled} hits over the last ${hitRate10.settled} settled sessions (${hitRate10.hitRate.toFixed(1)}% hit rate).`;
  }

  const closing =
    dataMode === "demo"
      ? "Demo mode — connect live market data for a live brief."
      : "Built on-device from ArrowBeat factors and delayed public quotes. Educational probability only — not investment advice.";

  return {
    symbol,
    name,
    sessionLabel,
    asOfDate,
    bias,
    headline,
    lede,
    drivers:
      drivers.length > 0
        ? drivers
        : [
            bias === "up"
              ? "Base rates and calendar edges currently tilt toward a higher close."
              : "Base rates and calendar edges currently tilt toward a lower close.",
          ],
    counterpoint,
    tomorrowLine,
    trackRecordLine,
    closing,
    leadPct: lead,
    confidenceLabel,
  };
}
