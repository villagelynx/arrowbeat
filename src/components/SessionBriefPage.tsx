import { useEffect, useMemo, useState } from "react";
import { fetchStockQuote, MAG7_SYMBOLS, type Bar } from "../lib/market-data";
import {
  buildEquitySignal,
  type DailySignal,
  type EquitySignal,
} from "../lib/signal";
import { buildSessionBrief } from "../lib/session-brief";
import type { ScorecardSummary } from "../lib/scorecard";

type SessionBriefPageProps = {
  signal: DailySignal | null;
  scorecard?: ScorecardSummary | null;
  loading?: boolean;
  spyBars?: Bar[];
  initialSymbol?: string;
  onGoHome?: () => void;
  onGoScorecard?: () => void;
};

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00-04:00`));
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
      <div className="brief-picker__chips" role="group" aria-label="Session brief symbol">
        <button
          type="button"
          className={`quote-chip${symbol === "SPY" ? " is-on" : ""}`}
          disabled={disabled}
          onClick={() => onPick("SPY")}
        >
          SPY
        </button>
        {MAG7_SYMBOLS.map((sym) => (
          <button
            key={sym}
            type="button"
            className={`quote-chip${symbol === sym ? " is-on" : ""}`}
            disabled={disabled}
            onClick={() => onPick(sym)}
          >
            {sym}
          </button>
        ))}
      </div>
      <form
        className="brief-picker__form"
        onSubmit={(e) => {
          e.preventDefault();
          const next = draft.trim().toUpperCase();
          if (!next) return;
          onPick(next);
          setDraft("");
        }}
      >
        <input
          className="widget-form__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          placeholder="Ticker"
          maxLength={16}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          aria-label="Type a ticker for session brief"
        />
        <button type="submit" className="about__cta" disabled={disabled || !draft.trim()}>
          Load
        </button>
      </form>
    </div>
  );
}

export function SessionBriefPage({
  signal,
  scorecard,
  loading,
  spyBars = [],
  initialSymbol = "SPY",
  onGoHome,
  onGoScorecard,
}: SessionBriefPageProps) {
  const [briefSymbol, setBriefSymbol] = useState(() =>
    (initialSymbol || "SPY").trim().toUpperCase() || "SPY",
  );
  const [equity, setEquity] = useState<EquitySignal | null>(null);
  const [equityLoading, setEquityLoading] = useState(false);
  const [equityError, setEquityError] = useState<string | null>(null);

  useEffect(() => {
    const seed = (initialSymbol || "SPY").trim().toUpperCase() || "SPY";
    setBriefSymbol(seed);
  }, [initialSymbol]);

  useEffect(() => {
    const sym = briefSymbol.trim().toUpperCase() || "SPY";
    if (sym === "SPY" || !signal) {
      setEquity(null);
      setEquityError(null);
      setEquityLoading(false);
      return;
    }

    let cancelled = false;
    setEquityLoading(true);
    setEquityError(null);

    (async () => {
      try {
        const mag = signal.mag7.find((r) => r.symbol === sym);
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

  const brief = useMemo(() => {
    if (!signal) return null;
    const sym = briefSymbol.trim().toUpperCase() || "SPY";
    if (sym === "SPY") {
      return buildSessionBrief({
        symbol: "SPY",
        name: "S&P 500",
        sessionLabel: signal.sessionLabel,
        asOfDate: signal.asOfDate,
        bias: signal.bias,
        probabilityHigher: signal.probabilityHigher,
        probabilityLower: signal.probabilityLower,
        confidence: signal.confidence,
        confidenceLabel: signal.confidenceLabel,
        factors: signal.factors,
        tomorrow: signal.tomorrow,
        hitRate10: scorecard?.hitRate10 ?? null,
        dataMode: signal.dataMode,
      });
    }
    if (!equity?.available) return null;
    return buildSessionBrief({
      symbol: equity.symbol,
      name: equity.name,
      sessionLabel: signal.sessionLabel,
      asOfDate: signal.asOfDate,
      bias: equity.bias,
      probabilityHigher: equity.probabilityHigher,
      probabilityLower: equity.probabilityLower,
      confidence: equity.confidence,
      confidenceLabel: equity.confidenceLabel,
      factors: equity.factors,
      tomorrow: equity.tomorrow,
      dataMode: signal.dataMode,
    });
  }, [signal, briefSymbol, equity, scorecard]);

  const picker = (
    <SymbolPicker symbol={briefSymbol} onPick={setBriefSymbol} disabled={Boolean(loading)} />
  );

  if (loading || !signal) {
    return (
      <article className="about session-brief">
        <header className="about__hero">
          <p className="about__kicker">ArrowBeat · stock session brief</p>
          <h1 className="about__title">Loading session brief…</h1>
          <p className="about__lede">Pulling the live lean and factors.</p>
        </header>
      </article>
    );
  }

  const waitingEquity =
    briefSymbol.trim().toUpperCase() !== "SPY" && (equityLoading || (!brief && !equityError));

  return (
    <article className="about session-brief" aria-labelledby="session-brief-title">
      <header className="about__hero">
        <p className="about__kicker">ArrowBeat · stock session brief</p>
        <h1 id="session-brief-title" className="about__title">
          Stock session brief
        </h1>
        <p className="about__lede">
          ArrowBeat&apos;s lean in plain English — assembled on-device from the same factors as the
          desk. No chat API. Educational probability only.
        </p>
        <div className="score-history__actions">
          {onGoHome ? (
            <button type="button" className="about__cta" onClick={onGoHome}>
              Back to home
            </button>
          ) : null}
          {onGoScorecard ? (
            <button type="button" className="score-history__secondary" onClick={onGoScorecard}>
              Scorecard
            </button>
          ) : null}
        </div>
      </header>

      <section className="panel about__panel" aria-labelledby="session-brief-pick">
        <h2 id="session-brief-pick">Choose a name</h2>
        <p className="panel-lede">SPY, Mag7, or type any ticker with enough daily history.</p>
        {picker}
      </section>

      {equityError ? (
        <section className="panel about__panel" role="alert">
          <h2>Couldn’t build this brief</h2>
          <p className="panel-lede">{equityError}</p>
        </section>
      ) : null}

      {waitingEquity ? (
        <section className="panel about__panel">
          <h2>Building {briefSymbol} brief…</h2>
          <p className="panel-lede">Fetching history and scoring the lean.</p>
        </section>
      ) : null}

      {brief ? (
        <section
          className={`panel about__panel session-brief__card is-${brief.bias}`}
          aria-labelledby="session-brief-headline"
        >
          <p className="session-brief__date">{formatDay(brief.asOfDate)}</p>
          <h2 id="session-brief-headline" className="session-brief__headline">
            {brief.headline}
          </h2>
          <p className="session-brief__lede">{brief.lede}</p>

          <h3 className="session-brief__sub">What’s driving it</h3>
          <ul className="about__list session-brief__drivers">
            {brief.drivers.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          {brief.counterpoint ? (
            <p className="session-brief__counter">{brief.counterpoint}</p>
          ) : null}

          {brief.tomorrowLine ? (
            <>
              <h3 className="session-brief__sub">Next session</h3>
              <p className="session-brief__body">{brief.tomorrowLine}</p>
            </>
          ) : null}

          {brief.trackRecordLine ? (
            <>
              <h3 className="session-brief__sub">Track record</h3>
              <p className="session-brief__body">{brief.trackRecordLine}</p>
            </>
          ) : null}

          <p className="about__disclaimer session-brief__closing">{brief.closing}</p>
        </section>
      ) : null}
    </article>
  );
}
