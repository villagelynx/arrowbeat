import { useEffect, useMemo, useState } from "react";
import { fetchStockQuote, MAG7_SYMBOLS, type Bar } from "../lib/market-data";
import {
  buildEquitySignal,
  type DailySignal,
  type EquitySignal,
  type TomorrowSignal,
} from "../lib/signal";
import {
  formatCountdown,
  getMorningBriefGate,
  type MorningBriefGate,
} from "../lib/morning-brief";
import { resolveDisplayedTomorrowLean } from "../lib/tomorrow-lean-publish";
import { CompanyIcon } from "./CompanyIcon";

type MorningBriefPageProps = {
  signal: DailySignal | null;
  loading?: boolean;
  /** SPY daily bars for relative stock tone when building non-Mag7 leans. */
  spyBars?: Bar[];
  /** Seed from home desk when opening the brief. */
  initialSymbol?: string;
  onGoHome?: () => void;
};

type BriefDesk = {
  symbol: string;
  name: string;
  bias: "up" | "down";
  probabilityHigher: number;
  probabilityLower: number;
  confidence: 1 | 2 | 3 | 4 | 5;
  confidenceLabel: string;
  factors: EquitySignal["factors"] | DailySignal["factors"];
  forwardLeans: TomorrowSignal[];
  tomorrow: TomorrowSignal | null;
  sessionLabel: string;
  asOfDate: string;
  kind: "spy" | "equity";
};

function useBriefGate(): MorningBriefGate {
  const [gate, setGate] = useState(() => getMorningBriefGate());
  useEffect(() => {
    const id = window.setInterval(() => setGate(getMorningBriefGate()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return gate;
}

function stars(n: 1 | 2 | 3 | 4 | 5): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00-04:00`));
}

function ForwardMini({ days }: { days: TomorrowSignal[] }) {
  if (!days.length) return null;
  return (
    <ol className="brief-forward" aria-label="Next five sessions">
      {days.slice(0, 5).map((day, idx) => {
        const up = day.bias === "up";
        const lead = up ? day.probabilityHigher : day.probabilityLower;
        const label = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          weekday: "short",
        }).format(new Date(`${day.asOfDate}T12:00:00-04:00`));
        return (
          <li key={day.asOfDate} className={up ? "is-up" : "is-down"}>
            <span>{idx === 0 ? "Next" : label}</span>
            <strong>
              {up ? "▲" : "▼"} {lead.toFixed(0)}%
            </strong>
          </li>
        );
      })}
    </ol>
  );
}

function SymbolPicker({
  symbol,
  onPick,
  disabled,
}: {
  symbol: string;
  onPick: (sym: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="brief-picker">
      <p className="brief-picker__label">Brief for</p>
      <div className="brief-picker__chips" role="group" aria-label="Morning brief symbol">
        <button
          type="button"
          className={`quote-chip${symbol === "SPY" ? " is-on" : ""}`}
          disabled={disabled}
          onClick={() => onPick("SPY")}
        >
          <CompanyIcon symbol="SPY" size={15} />
          <span>SPY</span>
        </button>
        {MAG7_SYMBOLS.map((sym) => (
          <button
            key={sym}
            type="button"
            className={`quote-chip${symbol === sym ? " is-on" : ""}`}
            disabled={disabled}
            onClick={() => onPick(sym)}
          >
            <CompanyIcon symbol={sym} size={15} />
            <span>{sym}</span>
          </button>
        ))}
      </div>
      <form
        className="brief-picker__form"
        onSubmit={(e) => {
          e.preventDefault();
          const next = draft.trim().toUpperCase();
          if (next) onPick(next);
        }}
      >
        <label className="brief-picker__ticker-label" htmlFor="brief-ticker">
          Other ticker
        </label>
        <div className="brief-picker__row">
          <input
            id="brief-ticker"
            className="widget-form__input"
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            placeholder="e.g. NFLX"
            maxLength={16}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="quote-lookup__btn" disabled={disabled || !draft.trim()}>
            Load
          </button>
        </div>
      </form>
    </div>
  );
}

export function MorningBriefPage({
  signal,
  loading,
  spyBars = [],
  initialSymbol = "SPY",
  onGoHome,
}: MorningBriefPageProps) {
  const gate = useBriefGate();
  const [briefSymbol, setBriefSymbol] = useState(() =>
    (initialSymbol || "SPY").trim().toUpperCase() || "SPY",
  );
  const [equity, setEquity] = useState<EquitySignal | null>(null);
  const [equityLoading, setEquityLoading] = useState(false);
  const [equityError, setEquityError] = useState<string | null>(null);

  useEffect(() => {
    const seed = (initialSymbol || "SPY").trim().toUpperCase();
    if (seed) setBriefSymbol(seed);
  }, [initialSymbol]);

  useEffect(() => {
    const sym = briefSymbol.trim().toUpperCase();
    if (!sym || sym === "SPY" || !signal) {
      setEquity(null);
      setEquityError(null);
      setEquityLoading(false);
      return;
    }

    let cancelled = false;
    const mag = signal.mag7.find((r) => r.symbol === sym);
    if (mag?.available) {
      setEquity(mag);
      setEquityError(null);
      setEquityLoading(false);
      return;
    }

    setEquityLoading(true);
    setEquityError(null);

    void (async () => {
      try {
        let input: {
          symbol: string;
          name: string;
          last: number | null;
          previousClose: number | null;
          bars: Bar[];
        };

        if (mag && mag.bars.length >= 40) {
          input = {
            symbol: mag.symbol,
            name: mag.name,
            last: mag.last,
            previousClose: null,
            bars: mag.bars,
          };
        } else {
          const q = await fetchStockQuote(sym);
          if (cancelled) return;
          input = {
            symbol: q.symbol,
            name: mag?.name ?? q.symbol,
            last: q.last,
            previousClose: q.previousClose,
            bars: q.bars ?? [],
          };
        }

        if (cancelled) return;
        const lean = buildEquitySignal(input, signal.asOfDate, {
          futuresPositive: signal.bias === "up",
          futuresChg: null,
          vixFalling: false,
          vixChg: null,
          spyBars,
        });
        if (cancelled) return;
        if (!lean.available) {
          setEquity(null);
          setEquityError(`Not enough history for ${sym} yet.`);
        } else {
          setEquity(lean);
          setEquityError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setEquity(null);
          setEquityError(e instanceof Error ? e.message : "Could not load ticker brief.");
        }
      } finally {
        if (!cancelled) setEquityLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [briefSymbol, signal, spyBars]);

  const desk: BriefDesk | null = useMemo(() => {
    if (!signal) return null;
    const sym = briefSymbol.trim().toUpperCase() || "SPY";
    if (sym === "SPY") {
      return {
        symbol: "SPY",
        name: "S&P 500",
        bias: signal.bias,
        probabilityHigher: signal.probabilityHigher,
        probabilityLower: signal.probabilityLower,
        confidence: signal.confidence,
        confidenceLabel: signal.confidenceLabel,
        factors: signal.factors,
        forwardLeans: signal.forwardLeans ?? [],
        tomorrow: signal.tomorrow,
        sessionLabel: signal.sessionLabel,
        asOfDate: signal.asOfDate,
        kind: "spy",
      };
    }
    if (!equity?.available) return null;
    return {
      symbol: equity.symbol,
      name: equity.name,
      bias: equity.bias,
      probabilityHigher: equity.probabilityHigher,
      probabilityLower: equity.probabilityLower,
      confidence: equity.confidence,
      confidenceLabel: equity.confidenceLabel,
      factors: equity.factors,
      forwardLeans: equity.forwardLeans ?? [],
      tomorrow: equity.tomorrow,
      sessionLabel: signal.sessionLabel,
      asOfDate: signal.asOfDate,
      kind: "equity",
    };
  }, [signal, briefSymbol, equity]);

  const tomorrowDisplay = resolveDisplayedTomorrowLean(
    desk?.kind === "spy" ? desk.tomorrow : desk?.tomorrow ?? null,
    new Date(),
  );

  const picker = <SymbolPicker symbol={briefSymbol} onPick={setBriefSymbol} />;

  if (!gate.released) {
    return (
      <article className="about brief" aria-labelledby="brief-title">
        <header className="about__hero">
          <p className="about__kicker">ArrowBeat · morning brief</p>
          <h1 id="brief-title" className="about__title">
            Brief drops at {gate.releaseLabel}
          </h1>
          <p className="about__lede">
            Each trading day&apos;s written lean unlocks at <strong>5:00 AM Eastern</strong> — for
            S&amp;P 500 (SPY) or any Mag7 / ticker brief. Until then, Home stays live.
          </p>
          <p className="brief-countdown" aria-live="polite">
            Unlocks in <strong>{formatCountdown(gate.msUntilRelease)}</strong>
          </p>
          <p className="about__disclaimer">
            {formatDay(gate.sessionDate)} · America/New_York calendar
          </p>
          {onGoHome ? (
            <button type="button" className="about__cta" onClick={onGoHome}>
              Open live desk
            </button>
          ) : null}
        </header>

        <section className="panel about__panel">
          <h2>Pick a name for when it unlocks</h2>
          <p className="panel-lede">Your choice is remembered on this page until you change it.</p>
          {picker}
        </section>

        <section className="panel about__panel">
          <h2>What unlocks at 5 AM ET</h2>
          <ul className="about__list">
            <li>Higher-close lean and probability for SPY or the selected stock</li>
            <li>Top factors behind that lean</li>
            <li>Next five session calendar path for that name</li>
            <li>Tomorrow&apos;s thinner lean when available</li>
          </ul>
        </section>
      </article>
    );
  }

  if (loading || !signal) {
    return (
      <article className="about brief">
        <header className="about__hero">
          <p className="about__kicker">ArrowBeat · morning brief</p>
          <h1 className="about__title">Loading today&apos;s brief…</h1>
        </header>
      </article>
    );
  }

  const waitingEquity =
    briefSymbol.trim().toUpperCase() !== "SPY" && (equityLoading || (!desk && !equityError));

  if (waitingEquity) {
    return (
      <article className="about brief">
        <header className="about__hero">
          <p className="about__kicker">Morning brief · unlocked {gate.releaseLabel}</p>
          <h1 className="about__title">Loading {briefSymbol}…</h1>
        </header>
        <section className="panel about__panel">{picker}</section>
      </article>
    );
  }

  if (!desk) {
    return (
      <article className="about brief" aria-labelledby="brief-title">
        <header className="about__hero">
          <p className="about__kicker">Morning brief · unlocked {gate.releaseLabel}</p>
          <h1 id="brief-title" className="about__title">
            {formatDay(signal.asOfDate)}
          </h1>
          <p className="about__lede">
            {equityError || `Could not build a brief for ${briefSymbol}. Try SPY or another Mag7 name.`}
          </p>
        </header>
        <section className="panel about__panel">{picker}</section>
        {onGoHome ? (
          <button type="button" className="about__cta" onClick={onGoHome}>
            Open live desk
          </button>
        ) : null}
      </article>
    );
  }

  const up = desk.bias === "up";
  const lead = up ? desk.probabilityHigher : desk.probabilityLower;
  const topFactors = desk.factors.slice(0, 5);
  const tmr = desk.kind === "spy" ? tomorrowDisplay?.lean ?? desk.tomorrow : desk.tomorrow;
  const tmrUp = tmr?.bias === "up";
  const tmrLead = tmr
    ? tmrUp
      ? tmr.probabilityHigher
      : tmr.probabilityLower
    : null;

  return (
    <article className="about brief" aria-labelledby="brief-title">
      <header className="about__hero">
        <p className="about__kicker">Morning brief · unlocked {gate.releaseLabel}</p>
        <h1 id="brief-title" className="about__title">
          {formatDay(desk.asOfDate)}
        </h1>
        <p className="about__lede">
          {desk.kind === "spy"
            ? "S&P 500 (SPY) higher-close lean for the session — educational probability, not advice."
            : `${desk.name} (${desk.symbol}) higher-close lean from this name’s own history — educational probability, not advice.`}
        </p>
        {onGoHome ? (
          <button type="button" className="about__cta" onClick={onGoHome}>
            Open live desk
          </button>
        ) : null}
      </header>

      <section className="panel about__panel">{picker}</section>

      <section className={`panel about__panel brief-hero ${up ? "is-up" : "is-down"}`}>
        <p className="brief-hero__kicker">
          {desk.symbol}
          {desk.name !== desk.symbol ? ` · ${desk.name}` : ""} · {desk.sessionLabel}
        </p>
        <p className="brief-hero__arrow" aria-hidden="true">
          {up ? "▲" : "▼"}
        </p>
        <p className="brief-hero__pct">
          {lead.toFixed(1)}
          <span>%</span>
        </p>
        <p className="brief-hero__chip">{up ? "Higher-close lean" : "Lower-close lean"}</p>
        <p className="brief-hero__conf">
          {stars(desk.confidence)} · {desk.confidenceLabel}
        </p>
      </section>

      {topFactors.length ? (
        <section className="panel about__panel" aria-labelledby="brief-factors">
          <h2 id="brief-factors">Why this lean · {desk.symbol}</h2>
          <ul className="about__list">
            {topFactors.map((f) => (
              <li key={f.id}>
                <strong>{f.label}</strong>
                <span className="brief-factor-detail"> — {f.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {desk.forwardLeans.length ? (
        <section className="panel about__panel" aria-labelledby="brief-forward">
          <h2 id="brief-forward">Next 5 sessions · {desk.symbol}</h2>
          <p className="panel-lede">
            Calendar / historical path for this name — thinner than today&apos;s live lean.
          </p>
          <ForwardMini days={desk.forwardLeans} />
        </section>
      ) : null}

      {tmr && tmrLead != null ? (
        <section className="panel about__panel" aria-labelledby="brief-tmr">
          <h2 id="brief-tmr">
            {tmr.skippedWeekend ? "Next session lean" : "Tomorrow&apos;s lean"} · {desk.symbol}
          </h2>
          <p className="panel-lede">
            {tmrUp ? "Higher" : "Lower"} {tmrLead.toFixed(1)}% · {tmr.confidenceLabel}
          </p>
        </section>
      ) : null}

      <p className="about__disclaimer">
        Free delayed Yahoo data · educational only · not investment advice. Live desk may refresh
        intraday after this morning pack.
      </p>
    </article>
  );
}
