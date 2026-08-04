import { useEffect, useMemo, useState } from "react";
import { fetchMarketSnapshot, fetchStockQuote, MAG7_SYMBOLS } from "../lib/market-data";
import { buildDemoSignal, buildEquitySignal, buildLiveSignal, type DailySignal, type EquitySignal } from "../lib/signal";
import "./EmbedWidget.css";

function readEmbedParams() {
  if (typeof window === "undefined") {
    return { symbol: "SPY", compact: false };
  }
  const q = new URLSearchParams(window.location.search);
  const symbol = (q.get("symbol") || q.get("s") || "SPY").trim().toUpperCase() || "SPY";
  const compact = q.get("compact") === "1" || q.get("size") === "sm";
  return { symbol: symbol.slice(0, 16), compact };
}

function originLink(symbol: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://arrowbeat.com";
  return symbol === "SPY" ? `${origin}/` : `${origin}/#?focus=${encodeURIComponent(symbol)}`;
}

/**
 * Standalone embed surface: lean + % for SPY or a single ticker.
 * Loaded via `?embed=1&symbol=SPY` (no full site chrome).
 */
export function EmbedWidgetApp() {
  const { symbol, compact } = useMemo(() => readEmbedParams(), []);
  const [signal, setSignal] = useState<DailySignal | null>(null);
  const [equity, setEquity] = useState<EquitySignal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const snap = await fetchMarketSnapshot();
        if (cancelled) return;
        const live = buildLiveSignal(snap);
        setSignal(live);
        if (symbol === "SPY") {
          setEquity(null);
          return;
        }
        const mag = live.mag7.find((r) => r.symbol === symbol);
        if (mag?.available) {
          setEquity(mag);
          return;
        }
        try {
          const q = await fetchStockQuote(symbol);
          if (cancelled) return;
          const spyBars = snap.spy.bars.length ? snap.spy.bars : snap.spy.recentBars;
          const lean = buildEquitySignal(
            {
              symbol: q.symbol,
              name: q.symbol,
              last: q.last,
              previousClose: q.previousClose,
              bars: q.bars ?? [],
            },
            live.asOfDate,
            {
              futuresPositive: live.bias === "up",
              futuresChg: null,
              vixFalling: false,
              vixChg: null,
              spyBars,
            },
          );
          setEquity(lean.available ? lean : null);
          if (!lean.available) setError("Not enough history for this ticker lean.");
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Quote unavailable");
          }
        }
      } catch {
        if (!cancelled) {
          setSignal(buildDemoSignal());
          setError("Live feed soft-failed — demo lean.");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const desk: {
    name: string;
    bias: "up" | "down";
    lead: number;
    confidenceLabel: string;
  } | null = useMemo(() => {
    if (symbol === "SPY" && signal) {
      const up = signal.bias === "up";
      return {
        name: "S&P 500 · SPY",
        bias: signal.bias,
        lead: up ? signal.probabilityHigher : signal.probabilityLower,
        confidenceLabel: signal.confidenceLabel,
      };
    }
    if (equity) {
      const up = equity.bias === "up";
      return {
        name: `${equity.name} · ${equity.symbol}`,
        bias: equity.bias,
        lead: up ? equity.probabilityHigher : equity.probabilityLower,
        confidenceLabel: equity.confidenceLabel,
      };
    }
    return null;
  }, [symbol, signal, equity]);

  const up = desk?.bias === "up";

  return (
    <div className={`embed-widget${up ? " is-up" : " is-down"}${compact ? " is-compact" : ""}`}>
      <a className="embed-widget__brand" href={originLink(symbol)} target="_blank" rel="noopener noreferrer">
        Arrow<span>Beat</span>
      </a>
      {desk ? (
        <>
          <p className="embed-widget__name">{desk.name}</p>
          <div className="embed-widget__lean">
            <span className="embed-widget__arrow" aria-hidden="true">
              {up ? "▲" : "▼"}
            </span>
            <span className="embed-widget__pct">
              {desk.lead.toFixed(1)}
              <span>%</span>
            </span>
          </div>
          <p className="embed-widget__chip">
            {up ? "Higher-close lean" : "Lower-close lean"} · {desk.confidenceLabel}
          </p>
        </>
      ) : (
        <p className="embed-widget__loading">{error || "Loading lean…"}</p>
      )}
      {error && desk ? <p className="embed-widget__note">{error}</p> : null}
      <p className="embed-widget__disc">
        Educational · ~15m delayed · not advice ·{" "}
        <a href={originLink(symbol)} target="_blank" rel="noopener noreferrer">
          arrowbeat.com
        </a>
      </p>
    </div>
  );
}

/** Doc helpers for Mag7 list on widget page. */
export const WIDGET_PRESET_SYMBOLS = ["SPY", ...MAG7_SYMBOLS] as const;
