import { useEffect, useRef, useState } from "react";
import { AboutPage } from "./components/AboutPage";
import { AppNav, type AppView } from "./components/AppNav";
import { MarketArrow } from "./components/MarketArrow";
import { SportsBulletinPromo } from "./components/SportsBulletinPromo";
import { SpyDayChart } from "./components/SpyDayChart";
import { SpyYearChart } from "./components/SpyYearChart";
import {
  fetchMarketSnapshot,
  fetchStockQuote,
  MAG7_SYMBOLS,
  type Bar,
  type IntradayBar,
  type StockQuote,
} from "./lib/market-data";
import {
  buildDemoSignal,
  buildLiveSignal,
  weekdayIndexForIso,
  monthIndexForIso,
  dayOfMonthForIso,
  cashflowKindForDay,
  taxSeasonKindForMonth,
  type DailySignal,
  type CalendarEdgeSlice,
} from "./lib/signal";
import { applySignalFavicon } from "./lib/favicon";
import { getMarketClock, type MarketClock } from "./lib/market-hours";
import {
  resolveDisplayedTomorrowLean,
  type DisplayedTomorrowLean,
} from "./lib/tomorrow-lean-publish";
import { emptyScorecard, syncScorecard, type ScorecardSummary } from "./lib/scorecard";
import { yearFromIso } from "./lib/spy-ytd";
import "./App.css";

/** Aligns with Yahoo free delayed quotes (~15 minutes). */
const REFRESH_MS = 15 * 60 * 1000;

function useMarketClock(): MarketClock {
  const [clock, setClock] = useState(() => getMarketClock());
  useEffect(() => {
    const id = window.setInterval(() => setClock(getMarketClock()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return clock;
}

/** Re-resolve when the live signal changes or we cross a 1:15 ET publish boundary. */
function useDisplayedTomorrowLean(
  live: DailySignal["tomorrow"],
): DisplayedTomorrowLean | null {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return resolveDisplayedTomorrowLean(live, new Date(nowMs));
}

function edgeLabel(pts: number) {
  const sign = pts > 0 ? "+" : "";
  return `${sign}${pts.toFixed(1)}`;
}

function CalendarEdgeChip({ slice, kind }: { slice: CalendarEdgeSlice; kind: string }) {
  const lean = slice.edgePts >= 0 ? "is-up" : "is-down";
  return (
    <li className={lean}>
      <span className="cal-edge__kind">{kind}</span>
      <span className="cal-edge__label">{slice.label}</span>
      <span className="cal-edge__pts">{edgeLabel(slice.edgePts)} pts</span>
      <span className="cal-edge__rank">
        #{slice.rank}/{slice.of}
      </span>
    </li>
  );
}

function stars(n: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={i < n ? "star is-on" : "star"} aria-hidden="true">
      ★
    </span>
  ));
}

export default function App() {
  const [signal, setSignal] = useState<DailySignal | null>(null);
  const [spyBars, setSpyBars] = useState<Bar[]>([]);
  const [dayBars, setDayBars] = useState<IntradayBar[]>([]);
  const [dayPrevClose, setDayPrevClose] = useState<number | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardSummary>(() => emptyScorecard(""));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quoteInput, setQuoteInput] = useState("");
  const [quoteResult, setQuoteResult] = useState<StockQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [view, setView] = useState<AppView>("home");
  const marketClock = useMarketClock();
  const tomorrowDisplay = useDisplayedTomorrowLean(signal?.tomorrow ?? null);
  const lastFetchAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // Local to this effect instance so React Strict Mode remounts can still load
    // (a shared ref + cancelled first mount used to leave the UI stuck on loading).
    let inFlight = false;

    async function load(opts: { silent?: boolean } = {}) {
      const silent = opts.silent === true;
      if (inFlight) return;
      inFlight = true;
      if (silent) setRefreshing(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const snap = await fetchMarketSnapshot();
        if (cancelled) return;
        const live = buildLiveSignal(snap);
        const bars = snap.spy.bars.length ? snap.spy.bars : snap.spy.recentBars;
        setSignal(live);
        setSpyBars(bars);
        setDayBars(snap.spy.dayBars ?? []);
        setDayPrevClose(snap.spy.dayPrevClose ?? null);
        setScorecard(syncScorecard(live, bars));
        setError(null);
        lastFetchAt.current = Date.now();
      } catch (e) {
        if (cancelled) return;
        if (!silent) {
          setError(e instanceof Error ? e.message : "Could not load market data.");
          const demo = buildDemoSignal();
          setSignal(demo);
          setSpyBars([]);
          setDayBars([]);
          setDayPrevClose(null);
          setScorecard(syncScorecard(demo, []));
        }
      } finally {
        inFlight = false;
        if (!cancelled) {
          if (silent) setRefreshing(false);
          else setLoading(false);
        }
      }
    }

    void load();

    const intervalId = window.setInterval(() => {
      void load({ silent: true });
    }, REFRESH_MS);

    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchAt.current < REFRESH_MS) return;
      void load({ silent: true });
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Favicon follows the hero lean (tomorrow after regular close; else today).
  useEffect(() => {
    if (!signal || signal.dataMode !== "live") return;
    const heroBias =
      marketClock.phase === "closed" && tomorrowDisplay?.lean
        ? tomorrowDisplay.lean.bias
        : signal.bias;
    applySignalFavicon(heroBias);
  }, [signal, marketClock.phase, tomorrowDisplay]);

  async function lookupQuote(ticker: string) {
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) return;
    setQuoteInput(symbol);
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const q = await fetchStockQuote(symbol);
      setQuoteResult(q);
    } catch (e) {
      setQuoteResult(null);
      setQuoteError(e instanceof Error ? e.message : "Quote lookup failed.");
    } finally {
      setQuoteLoading(false);
    }
  }

  if (!signal) {
    return (
      <div className={`app theme-up${view === "about" ? " app--about" : ""}`}>
        <div className="atmosphere" aria-hidden="true" />
        <header className="topbar">
          <div className="topbar__brand">
            <p className="brand">
              Arrow<span>Beat</span>
            </p>
            <p className="brand-tag">Loading market data…</p>
          </div>
          <AppNav view={view} onNavigate={setView} />
        </header>
        {view === "about" ? (
          <main className="about-main">
            <AboutPage onGoDashboard={() => setView("home")} />
          </main>
        ) : null}
      </div>
    );
  }

  const pillBusy = loading || refreshing;
  const tomorrow = tomorrowDisplay?.lean ?? null;
  const tmrUp = tomorrow?.bias === "up";
  const tmrLeadPct = tomorrow
    ? tmrUp
      ? tomorrow.probabilityHigher
      : tomorrow.probabilityLower
    : null;
  /** After regular close, promote locked next-session lean into the hero. */
  const tomorrowAsPrimary =
    marketClock.phase === "closed" && tomorrow != null && tmrLeadPct != null;

  const primary = tomorrowAsPrimary
    ? {
        bias: tomorrow.bias,
        probabilityHigher: tomorrow.probabilityHigher,
        probabilityLower: tomorrow.probabilityLower,
        confidence: tomorrow.confidence,
        confidenceLabel: tomorrow.confidenceLabel,
        sessionLabel: tomorrow.sessionLabel,
        factors: tomorrow.factors,
        calendarEdge: tomorrow.calendarEdge,
        title: tomorrow.skippedWeekend ? "Next session lean" : "Tomorrow's market bias",
        kicker: tomorrow.kicker,
      }
    : {
        bias: signal.bias,
        probabilityHigher: signal.probabilityHigher,
        probabilityLower: signal.probabilityLower,
        confidence: signal.confidence,
        confidenceLabel: signal.confidenceLabel,
        sessionLabel: signal.sessionLabel,
        factors: signal.factors,
        calendarEdge: signal.calendarEdge,
        title: "Today's market bias",
        kicker: null as string | null,
      };
  const up = primary.bias === "up";
  const leadPct = up ? primary.probabilityHigher : primary.probabilityLower;
  const todayUp = signal.bias === "up";
  const todayLeadPct = todayUp ? signal.probabilityHigher : signal.probabilityLower;

  return (
    <div className={`app ${up ? "theme-up" : "theme-down"}${view === "about" ? " app--about" : ""}`}>
      <div className="atmosphere" aria-hidden="true" />

      <header className="topbar">
        <div className="topbar__brand">
          <button type="button" className="brand brand--btn" onClick={() => setView("home")}>
            Arrow<span>Beat</span>
          </button>
          <p className="brand-tag">
            {view === "about" ? "About" : "Daily market probability"}
          </p>
          {view === "home" ? (
            <p className={`data-pill ${signal.dataMode === "live" ? "is-live" : "is-demo"}`}>
              {pillBusy
                ? "Refreshing…"
                : signal.dataMode === "live"
                  ? "Live · SPY · Mag7 · ES · VIX"
                  : "Demo fallback"}
            </p>
          ) : null}
        </div>
        <AppNav view={view} onNavigate={setView} />
      </header>

      {view === "about" ? (
        <main className="about-main">
          <AboutPage onGoDashboard={() => setView("home")} />
        </main>
      ) : (
      <main>
        {error ? <p className="banner-error">{error}</p> : null}

        <section className="panel panel--quote desk-row desk-row--quote" aria-labelledby="quote-title">
          <div className="quote-top">
            <div className="quote-top__head">
              <h2 id="quote-title">Stock quote</h2>
              <p className="panel-lede">~15m delayed Yahoo free quotes</p>
            </div>
            <form
              className="quote-lookup"
              onSubmit={(e) => {
                e.preventDefault();
                void lookupQuote(quoteInput);
              }}
            >
              <label className="quote-lookup__label" htmlFor="quote-ticker">
                Ticker
              </label>
              <div className="quote-lookup__row">
                <input
                  id="quote-ticker"
                  className="quote-lookup__input"
                  value={quoteInput}
                  onChange={(e) => setQuoteInput(e.target.value.toUpperCase())}
                  placeholder="e.g. SPY or AAPL"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={16}
                />
                <button type="submit" className="quote-lookup__btn" disabled={quoteLoading}>
                  {quoteLoading ? "…" : "Quote"}
                </button>
              </div>
            </form>
            <div className="quote-chips" role="group" aria-label="Quick select">
              {MAG7_SYMBOLS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  className="quote-chip"
                  onClick={() => void lookupQuote(sym)}
                  disabled={quoteLoading}
                >
                  {sym}
                </button>
              ))}
              <button
                type="button"
                className="quote-chip"
                onClick={() => void lookupQuote("SPY")}
                disabled={quoteLoading}
              >
                SPY
              </button>
              <button
                type="button"
                className="quote-chip"
                onClick={() => void lookupQuote("BTC-USD")}
                disabled={quoteLoading}
              >
                BTC
              </button>
            </div>
          </div>
          {quoteError ? <p className="quote-lookup__error">{quoteError}</p> : null}
          {quoteResult ? (
            <div
              className={`quote-result ${
                quoteResult.changePct == null
                  ? ""
                  : quoteResult.changePct >= 0
                    ? "is-up"
                    : "is-down"
              }`}
            >
              <p className="quote-result__symbol">{quoteResult.symbol}</p>
              <p className="quote-result__last">
                {quoteResult.last != null ? quoteResult.last.toFixed(2) : "—"}
              </p>
              <p className="quote-result__chg">
                {quoteResult.change != null
                  ? `${quoteResult.change >= 0 ? "+" : ""}${quoteResult.change.toFixed(2)}`
                  : "—"}{" "}
                (
                {quoteResult.changePct != null
                  ? `${quoteResult.changePct >= 0 ? "+" : ""}${quoteResult.changePct.toFixed(2)}%`
                  : "—"}
                )
              </p>
              <p className="quote-result__meta">
                Prev close{" "}
                {quoteResult.previousClose != null
                  ? quoteResult.previousClose.toFixed(2)
                  : "—"}{" "}
                · {quoteResult.delayNote}
              </p>
            </div>
          ) : null}
        </section>

        <div className="desk-top">
          <div className="desk-stack desk-stack--day">
            {dayBars.length > 1 ? (
              <section className="panel panel--day" aria-labelledby="spy-day-title">
                <h2 id="spy-day-title">S&amp;P 500 today</h2>
                <p className="panel-lede">
                  Free Yahoo 15-minute bars — typically about 15 minutes delayed.
                </p>
                <SpyDayChart bars={dayBars} prevClose={dayPrevClose} />
              </section>
            ) : null}

            {signal.lastSessions.length ? (
              <section className="panel panel--sessions" aria-labelledby="recent-title">
                <h2 id="recent-title">Last 10 trading days</h2>
                <p className="panel-lede">SPY close vs prior close — green up, red down.</p>
                <ol className="session-strip">
                  {signal.lastSessions.map((day) => {
                    const dateLabel = new Intl.DateTimeFormat("en-US", {
                      timeZone: "America/New_York",
                      month: "short",
                      day: "numeric",
                    }).format(new Date(`${day.date}T12:00:00-04:00`));
                    return (
                      <li
                        key={day.date}
                        className={day.bias === "up" ? "is-up" : "is-down"}
                        title={`${day.date}: ${day.changePct >= 0 ? "+" : ""}${day.changePct.toFixed(2)}%`}
                      >
                        <span className="session-day">{day.weekday}</span>
                        <span className="session-date">{dateLabel}</span>
                        <span className="session-arrow" aria-hidden="true">
                          {day.bias === "up" ? "▲" : "▼"}
                        </span>
                        <span className="session-pct">
                          {day.changePct >= 0 ? "+" : ""}
                          {day.changePct.toFixed(1)}%
                        </span>
                        {day.histUpPct != null ? (
                          <span className="session-hist">
                            Hist {day.histUpPct.toFixed(0)}%
                            {day.histRank != null ? ` · #${day.histRank}` : ""}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : null}

            <section className="panel panel--stat" aria-labelledby="decade-title">
              <h2 id="decade-title">Market stat of the day</h2>
              <p className="market-stat">{signal.marketStat}</p>
              <div className="decade">
                <div>
                  <p className="decade-label">Up days (~10y SPY)</p>
                  <p className="decade-value up">{signal.decadeStats.upPct}%</p>
                  <p className="decade-sub">{signal.decadeStats.upDays} days</p>
                </div>
                <div>
                  <p className="decade-label">Down days (~10y SPY)</p>
                  <p className="decade-value down">{signal.decadeStats.downPct}%</p>
                  <p className="decade-sub">{signal.decadeStats.downDays} days</p>
                </div>
              </div>
            </section>
          </div>

          <section className="hero" aria-labelledby="bias-title">
            <div className="hero-head">
              <div className="hero-session">
                <p className="hero-kicker">
                  {primary.kicker ? (
                    <>
                      <span className="hero-kicker__into">{primary.kicker}</span>
                      <span className="hero-kicker__sep" aria-hidden="true">
                        ·
                      </span>
                    </>
                  ) : null}
                  {primary.sessionLabel}
                </p>
                <p
                  className={`market-clock is-${marketClock.phase}`}
                  aria-live="polite"
                  title="US equity regular session (9:30–16:00 ET)"
                >
                  <span className="market-clock__time">{marketClock.timeEt}</span>
                  <span className="market-clock__sep" aria-hidden="true">
                    ·
                  </span>
                  <span className="market-clock__status">{marketClock.statusText}</span>
                </p>
              </div>
              <h1 id="bias-title" className="hero-title">
                {primary.title}
              </h1>
              {tomorrowAsPrimary && tomorrowDisplay ? (
                <p
                  className={`hero-asof${
                    tomorrowDisplay.phase === "preview" ? " is-preview" : ""
                  }`}
                >
                  {tomorrowDisplay.stamp}
                </p>
              ) : null}
            </div>

            <div className="hero-signal">
              <div className="arrow-stage">
                <MarketArrow bias={primary.bias} />
              </div>

              <p className="bias-chip">{up ? "Higher-close lean" : "Lower-close lean"}</p>

              <div className="prob-block">
                <p className="prob-label">
                  Probability of {up ? "higher" : "lower"} close
                </p>
                <p className="prob-value">
                  {leadPct.toFixed(1)}
                  <span>%</span>
                </p>
                <div className="prob-meter" role="presentation">
                  <div
                    className="prob-meter__fill"
                    style={{ width: `${Math.min(92, Math.max(8, leadPct))}%` }}
                  />
                </div>
                <p className="prob-split">
                  Higher {primary.probabilityHigher.toFixed(1)}% · Lower{" "}
                  {primary.probabilityLower.toFixed(1)}%
                </p>
              </div>

              <div
                className="confidence"
                tabIndex={0}
                aria-describedby="confidence-tip"
              >
                <p className="confidence-label">
                  Confidence
                  <span className="confidence-hint" aria-hidden="true">
                    ?
                  </span>
                </p>
                <p className="confidence-stars" aria-label={`${primary.confidence} of 5 stars`}>
                  {stars(primary.confidence)}
                </p>
                <p className="confidence-text">{primary.confidenceLabel}</p>
                <div id="confidence-tip" className="confidence-tip" role="tooltip">
                  {tomorrowAsPrimary ? (
                    <>
                      <p>
                        Confidence is how settled the next-session lean looks — thinner than a live
                        session signal (calendar &amp; history only). Not a guarantee.
                      </p>
                      <p>
                        Stars come from edge (|P(higher close) − 50|) and agreement among the listed
                        next-session factors (weekday, month, day-of-month, cashflow/tax/CPI windows,
                        streaks when they fire).
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        Confidence is how settled today&apos;s lean looks — not a guarantee, and not
                        the same as the probability %.
                      </p>
                      <p>
                        Stars come from two live checks in the scorer:{" "}
                        <strong>edge</strong> (|P(higher close) − 50|), and{" "}
                        <strong>agreement</strong> (how many of today&apos;s listed factors point the
                        same way as the lean — ES, VIX, breadth, seasonality/calendar, streaks, yields,
                        CPI window, and similar items when they fire).
                      </p>
                    </>
                  )}
                  <ul>
                    <li>5★ Very high — edge &gt; 12 pts and ≥5 factors agree</li>
                    <li>4★ High — edge &gt; 8 pts and ≥4 agree</li>
                    <li>3★ Moderate — edge &gt; 5 pts and ≥3 agree</li>
                    <li>2★ Low — edge &gt; 3 pts (agreement not required)</li>
                    <li>1★ Tentative — lean near a coin flip</li>
                  </ul>
                </div>
              </div>

              {tomorrowAsPrimary ? (
                <div
                  className={`tomorrow-lean tomorrow-lean--settled ${todayUp ? "is-up" : "is-down"}`}
                  aria-labelledby="today-close-lean-title"
                >
                  <p className="tomorrow-lean__kicker">Session closed</p>
                  <p id="today-close-lean-title" className="tomorrow-lean__title">
                    Today&apos;s close lean
                  </p>
                  <p className="tomorrow-lean__lede">
                    Settled lean for {signal.sessionLabel} — demoted after the regular close.
                  </p>
                  <div className="tomorrow-lean__row">
                    <span className="tomorrow-lean__arrow" aria-hidden="true">
                      {todayUp ? "▲" : "▼"}
                    </span>
                    <div className="tomorrow-lean__prob">
                      <p className="tomorrow-lean__chip">
                        {todayUp ? "Higher-close lean" : "Lower-close lean"}
                      </p>
                      <p className="tomorrow-lean__value">
                        {todayLeadPct.toFixed(1)}
                        <span>%</span>
                      </p>
                      <p className="tomorrow-lean__split">
                        Higher {signal.probabilityHigher.toFixed(1)}% · Lower{" "}
                        {signal.probabilityLower.toFixed(1)}%
                      </p>
                    </div>
                    <div className="tomorrow-lean__conf">
                      <p className="tomorrow-lean__conf-label">Confidence</p>
                      <p
                        className="tomorrow-lean__stars"
                        aria-label={`${signal.confidence} of 5 stars`}
                      >
                        {stars(signal.confidence)}
                      </p>
                      <p className="tomorrow-lean__conf-text">{signal.confidenceLabel}</p>
                    </div>
                  </div>
                  <p className="tomorrow-lean__session">{signal.sessionLabel}</p>
                </div>
              ) : tomorrowDisplay && tomorrow && tmrLeadPct != null ? (
                <div
                  className={`tomorrow-lean ${tmrUp ? "is-up" : "is-down"}`}
                  aria-labelledby="tomorrow-lean-title"
                >
                  <p className="tomorrow-lean__kicker">{tomorrow.kicker}</p>
                  <p id="tomorrow-lean-title" className="tomorrow-lean__title">
                    {tomorrow.label}
                  </p>
                  <p className="tomorrow-lean__lede">
                    Calendar &amp; historical stats known now — thinner than today&apos;s live
                    signal (no tomorrow quotes yet).
                  </p>
                  <p
                    className={`tomorrow-lean__asof${
                      tomorrowDisplay.phase === "preview" ? " is-preview" : ""
                    }`}
                  >
                    {tomorrowDisplay.stamp}
                  </p>
                  <div className="tomorrow-lean__row">
                    <span className="tomorrow-lean__arrow" aria-hidden="true">
                      {tmrUp ? "▲" : "▼"}
                    </span>
                    <div className="tomorrow-lean__prob">
                      <p className="tomorrow-lean__chip">
                        {tmrUp ? "Higher-close lean" : "Lower-close lean"}
                      </p>
                      <p className="tomorrow-lean__value">
                        {tmrLeadPct.toFixed(1)}
                        <span>%</span>
                      </p>
                      <p className="tomorrow-lean__split">
                        Higher {tomorrow.probabilityHigher.toFixed(1)}% · Lower{" "}
                        {tomorrow.probabilityLower.toFixed(1)}%
                      </p>
                    </div>
                    <div className="tomorrow-lean__conf">
                      <p className="tomorrow-lean__conf-label">Confidence</p>
                      <p
                        className="tomorrow-lean__stars"
                        aria-label={`${tomorrow.confidence} of 5 stars`}
                      >
                        {stars(tomorrow.confidence)}
                      </p>
                      <p className="tomorrow-lean__conf-text">{tomorrow.confidenceLabel}</p>
                    </div>
                  </div>
                  <p className="tomorrow-lean__session">{tomorrow.sessionLabel}</p>
                </div>
              ) : null}
            </div>

            <aside className="hero-rail">
              {primary.calendarEdge ? (
                <div
                  className="cal-edge"
                  aria-label={
                    tomorrowAsPrimary
                      ? "Next session calendar edge versus coin flip"
                      : "Today's calendar edge versus coin flip"
                  }
                >
                  <p className="cal-edge__title">
                    {tomorrowAsPrimary ? "Next session calendar edge" : "Today's calendar edge"}{" "}
                    <span
                      className={
                        (primary.calendarEdge.blendPts ?? 0) >= 0 ? "is-up" : "is-down"
                      }
                    >
                      {primary.calendarEdge.blendPts != null
                        ? `${edgeLabel(primary.calendarEdge.blendPts)} pts vs 50%`
                        : ""}
                    </span>
                  </p>
                  <ul className="cal-edge__list">
                    {primary.calendarEdge.weekday ? (
                      <CalendarEdgeChip slice={primary.calendarEdge.weekday} kind="Weekday" />
                    ) : null}
                    {primary.calendarEdge.month ? (
                      <CalendarEdgeChip slice={primary.calendarEdge.month} kind="Month" />
                    ) : null}
                    {primary.calendarEdge.dayOfMonth ? (
                      <CalendarEdgeChip slice={primary.calendarEdge.dayOfMonth} kind="Day" />
                    ) : null}
                  </ul>
                </div>
              ) : null}

              {signal.quotes ? (
                <div className="hero-quotes">
                  <ul className="quote-strip" aria-label="Latest quotes">
                    <li>
                      <span>SPY</span>
                      <strong>{signal.quotes.spy?.toFixed(2) ?? "—"}</strong>
                    </li>
                    <li>
                      <span>ES</span>
                      <strong>{signal.quotes.es?.toFixed(2) ?? "—"}</strong>
                    </li>
                    <li>
                      <span>VIX</span>
                      <strong>{signal.quotes.vix?.toFixed(2) ?? "—"}</strong>
                    </li>
                    <li>
                      <span>10Y</span>
                      <strong>
                        {signal.quotes.tnx != null ? `${signal.quotes.tnx.toFixed(2)}%` : "—"}
                      </strong>
                    </li>
                  </ul>
                  <ul
                    className="quote-strip quote-strip--inflation"
                    aria-label="Inflation and commodities"
                  >
                    <li>
                      <span>B/E 10Y</span>
                      <strong>
                        {signal.quotes.breakeven10y != null
                          ? `${signal.quotes.breakeven10y.toFixed(2)}%`
                          : "—"}
                      </strong>
                    </li>
                    <li>
                      <span>Real 10Y</span>
                      <strong>
                        {signal.quotes.realYield10y != null
                          ? `${signal.quotes.realYield10y.toFixed(2)}%`
                          : "—"}
                      </strong>
                    </li>
                    <li>
                      <span>Oil</span>
                      <strong>
                        {signal.quotes.oil != null ? `$${signal.quotes.oil.toFixed(0)}` : "—"}
                      </strong>
                    </li>
                    <li>
                      <span>Gold</span>
                      <strong>
                        {signal.quotes.gold != null
                          ? `$${Math.round(signal.quotes.gold).toLocaleString()}`
                          : "—"}
                      </strong>
                    </li>
                  </ul>
                </div>
              ) : null}
            </aside>
          </section>

          <section className="panel panel--factors" aria-labelledby="factors-title">
            <h2 id="factors-title">Why this signal</h2>
            <p className="panel-lede">
              {tomorrowAsPrimary
                ? "Calendar & historical factors for the next session — thinner than a live-session lean (no tomorrow quotes yet)."
                : "Factors from SPY, ES, VIX, breadth, yields, breakevens / real rates, and (when they move) oil & gold — still a probability lean, not a crystal ball."}
            </p>
            <ul className="factor-list">
              {primary.factors.map((f) => {
                const good = f.supports === primary.bias;
                return (
                  <li key={f.id} className={good ? "is-aligned" : "is-contrary"}>
                    <span className="factor-mark" aria-hidden="true">
                      {good ? "✓" : "✗"}
                    </span>
                    <div>
                      <p className="factor-label">{f.label}</p>
                      <p className="factor-detail">{f.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {signal.mag7.length ? (
          <section className="panel panel--mag7 desk-row desk-row--mag7" aria-labelledby="mag7-title">
            <h2 id="mag7-title">Magnificent 7</h2>
            <p className="panel-lede">
              Ranked highest → lowest by P(higher close). Day % vs prior close · ~15m delayed.
            </p>
            <ul className="mag7-grid">
              {signal.mag7.map((row) => {
                const leanUp = row.bias === "up";
                return (
                  <li
                    key={row.symbol}
                    className={`mag7-card ${
                      !row.available ? "is-muted" : leanUp ? "is-up" : "is-down"
                    }`}
                  >
                    <div className="mag7-card__top">
                      <span className="mag7-card__symbol">{row.symbol}</span>
                      {row.available ? (
                        <span className="mag7-card__chev" aria-hidden="true">
                          {leanUp ? "▲" : "▼"}
                        </span>
                      ) : (
                        <span className="mag7-card__chev is-na" aria-hidden="true">
                          —
                        </span>
                      )}
                    </div>
                    <p className="mag7-card__bias">
                      {row.available ? (leanUp ? "Higher" : "Lower") : "n/a"}
                    </p>
                    <p className="mag7-card__prob">
                      {row.available ? (
                        <>
                          {row.probabilityHigher.toFixed(1)}
                          <span>%</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                    <p className="mag7-card__quote">
                      <span>{row.last != null ? row.last.toFixed(2) : "—"}</span>
                      <span
                        className={
                          row.changePct == null
                            ? ""
                            : row.changePct >= 0
                              ? "is-up"
                              : "is-down"
                        }
                      >
                        {row.changePct == null
                          ? "—"
                          : `${row.changePct >= 0 ? "+" : ""}${row.changePct.toFixed(2)}%`}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {signal.alts.length ? (
          <section className="panel panel--alts desk-row desk-row--alts" aria-labelledby="alts-title">
            <h2 id="alts-title">Commodities &amp; crypto</h2>
            <p className="panel-lede">
              Oil, gold, Bitcoin, silver, ETH — compact momentum lean · ~15m delayed.
            </p>
            <ul className="mag7-grid mag7-grid--alts">
              {signal.alts.map((row) => {
                const leanUp = row.bias === "up";
                const price =
                  row.last == null
                    ? "—"
                    : row.id === "btc"
                      ? row.last.toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : row.id === "eth"
                        ? row.last.toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : row.last >= 100
                          ? row.last.toFixed(1)
                          : row.last.toFixed(2);
                return (
                  <li
                    key={row.id}
                    className={`mag7-card ${
                      !row.available ? "is-muted" : leanUp ? "is-up" : "is-down"
                    }`}
                  >
                    <div className="mag7-card__top">
                      <span className="mag7-card__symbol">{row.name}</span>
                      {row.available ? (
                        <span className="mag7-card__chev" aria-hidden="true">
                          {leanUp ? "▲" : "▼"}
                        </span>
                      ) : (
                        <span className="mag7-card__chev is-na" aria-hidden="true">
                          —
                        </span>
                      )}
                    </div>
                    <p className="mag7-card__bias">
                      {row.available ? (leanUp ? "Higher" : "Lower") : "n/a"}
                    </p>
                    <p className="mag7-card__prob">
                      {row.available ? (
                        <>
                          {row.probabilityHigher.toFixed(1)}
                          <span>%</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                    <p className="mag7-card__quote">
                      <span>{price}</span>
                      <span
                        className={
                          row.changePct == null
                            ? ""
                            : row.changePct >= 0
                              ? "is-up"
                              : "is-down"
                        }
                      >
                        {row.changePct == null
                          ? "—"
                          : `${row.changePct >= 0 ? "+" : ""}${row.changePct.toFixed(2)}%`}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <div className="desk-grid desk-grid--ytd desk-row desk-row--ytd">
          {spyBars.length ? (
            <section className="panel panel--ytd" aria-labelledby="spy-chart-title">
              <h2 id="spy-chart-title">S&amp;P 500 this year</h2>
              <p className="panel-lede">SPY daily closes — year to date.</p>
              <SpyYearChart bars={spyBars} year={yearFromIso(signal.asOfDate)} />
            </section>
          ) : null}

          <section className="panel panel--score" aria-labelledby="score-title">
            <h2 id="score-title">Prediction scorecard</h2>
            <p className="panel-lede">
              Live leans saved on this device, graded when SPY&apos;s close vs prior is known. Hit =
              direction correct. Brier = probability calibration (lower better; coin flip ≈ 0.25).
            </p>
            <div className="stat-grid score-grid">
              <div className="stat-card">
                <p className="stat-kicker">Hit rate</p>
                <p className="stat-num">
                  {scorecard.hitRate != null ? `${scorecard.hitRate.toFixed(1)}%` : "—"}
                </p>
                <p className="stat-note">
                  {scorecard.settled
                    ? `${scorecard.hits}/${scorecard.settled} settled`
                    : "No settled days yet"}
                </p>
              </div>
              <div className="stat-card">
                <p className="stat-kicker">Brier score</p>
                <p className="stat-num">
                  {scorecard.brier != null ? scorecard.brier.toFixed(3) : "—"}
                </p>
                <p className="stat-note">vs ~0.25 coin flip</p>
              </div>
            </div>

            {scorecard.pending ? (
              <p className="score-pending">
                Pending {scorecard.pending.date}: lean{" "}
                <strong>{scorecard.pending.bias === "up" ? "higher" : "lower"}</strong> at{" "}
                {scorecard.pending.bias === "up"
                  ? scorecard.pending.probabilityHigher.toFixed(1)
                  : scorecard.pending.probabilityLower.toFixed(1)}
                % — settles after that session&apos;s SPY close.
              </p>
            ) : (
              <p className="score-pending">
                {signal.dataMode === "live"
                  ? "No open prediction — open ArrowBeat on a weekday before the close to log today's lean."
                  : "Scorecard needs live market data to log new predictions."}
              </p>
            )}

            {scorecard.recent.length ? (
              <ol className="score-list" aria-label="Last 10 settled predictions">
                {scorecard.recent.map((row) => {
                  const dateLabel = new Intl.DateTimeFormat("en-US", {
                    timeZone: "America/New_York",
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  }).format(new Date(`${row.date}T12:00:00-04:00`));
                  const verdict =
                    row.outcome === "flat"
                      ? "flat"
                      : row.correct
                        ? "hit"
                        : "miss";
                  // |P(higher) − realized|: realized = 100 if close was higher, else 0.
                  const errorPct =
                    row.outcome === "up" || row.outcome === "down"
                      ? Math.abs(row.probabilityHigher - (row.outcome === "up" ? 100 : 0))
                      : null;
                  return (
                    <li
                      key={row.date}
                      className={
                        verdict === "hit" ? "is-hit" : verdict === "miss" ? "is-miss" : "is-flat"
                      }
                    >
                      <span className="score-list__date">{dateLabel}</span>
                      <span className="score-list__pred">
                        Pred {row.bias === "up" ? "▲" : "▼"}
                      </span>
                      <span className="score-list__act">
                        {row.outcome === "flat"
                          ? "Flat"
                          : `${row.outcome === "up" ? "▲" : "▼"} ${
                              row.changePct != null && row.changePct >= 0 ? "+" : ""
                            }${row.changePct?.toFixed(2) ?? "—"}%`}
                      </span>
                      <span className="score-list__err" title="Absolute error vs P(higher) and outcome">
                        {errorPct != null ? `Err ${errorPct.toFixed(0)}%` : "Err —"}
                      </span>
                      <span className="score-list__verdict">{verdict}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="score-list-empty">No settled days yet — recent hits and misses will show here.</p>
            )}
          </section>
        </div>

        {signal.weekdayOdds.length || signal.monthOdds.length ? (
          <div className="desk-grid desk-grid--pair desk-row desk-row--weekday">
            {signal.weekdayOdds.length ? (
              <div className="desk-stack desk-stack--weekday">
                <section className="panel" aria-labelledby="weekday-title">
                  <h2 id="weekday-title">Weekday odds ranked</h2>
                  <p className="panel-lede">
                    ~10y SPY: how often each weekday closed higher — ranked best historical edge
                    first.
                  </p>
                  <ol className="odds-rank">
                    {signal.weekdayOdds.map((row) => {
                      const leanUp = row.upPct >= 50;
                      const isToday =
                        weekdayIndexForIso(signal.asOfDate) === row.weekdayIndex;
                      return (
                        <li
                          key={row.weekday}
                          className={`${leanUp ? "is-up" : "is-down"}${isToday ? " is-today" : ""}`}
                        >
                          <span className="odds-rank__n">#{row.rank}</span>
                          <div className="odds-rank__body">
                            <p className="odds-rank__name">
                              {row.weekday}
                              {isToday ? <span className="odds-rank__tag"> today</span> : null}
                            </p>
                            <p className="odds-rank__meta">
                              Higher {row.upPct.toFixed(1)}% · Lower {row.downPct.toFixed(1)}% · n=
                              {row.n.toLocaleString()}
                            </p>
                          </div>
                          <div className="odds-rank__stats">
                            <span className="odds-rank__up">{row.upPct.toFixed(1)}%</span>
                            <span className="odds-rank__avg">
                              avg {row.avgMovePct >= 0 ? "+" : ""}
                              {row.avgMovePct.toFixed(2)}%
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
                <SportsBulletinPromo />
              </div>
            ) : null}

            {signal.monthOdds.length ? (
              <section className="panel" aria-labelledby="month-title">
                <h2 id="month-title">Month odds ranked</h2>
                <p className="panel-lede">
                  ~10y SPY by calendar month. Watch the tax window: March run-up into April 15.
                </p>

                {signal.taxSeason ? (
                  <div className="cashflow tax-season">
                    <p className="cashflow__title">Tax season · March → April</p>
                    <div className="cashflow__grid">
                      <div className="cashflow__card is-rent">
                        <p className="cashflow__kicker">March · tax run-up</p>
                        <p className="cashflow__num">
                          {signal.taxSeason.march.upPct.toFixed(1)}%
                        </p>
                        <p className="cashflow__note">
                          higher-close · rank #{signal.taxSeason.march.rank}/12
                        </p>
                        <p className="cashflow__days">
                          avg {signal.taxSeason.march.avgMovePct >= 0 ? "+" : ""}
                          {signal.taxSeason.march.avgMovePct.toFixed(2)}% · n=
                          {signal.taxSeason.march.n.toLocaleString()}
                        </p>
                      </div>
                      <div
                        className={`cashflow__card ${
                          signal.taxSeason.april.upPct >= signal.taxSeason.march.upPct
                            ? "is-payday"
                            : "is-rent"
                        }`}
                      >
                        <p className="cashflow__kicker">April · tax due</p>
                        <p className="cashflow__num">
                          {signal.taxSeason.april.upPct.toFixed(1)}%
                        </p>
                        <p className="cashflow__note">
                          higher-close · rank #{signal.taxSeason.april.rank}/12
                        </p>
                        <p className="cashflow__days">
                          avg {signal.taxSeason.april.avgMovePct >= 0 ? "+" : ""}
                          {signal.taxSeason.april.avgMovePct.toFixed(2)}% · n=
                          {signal.taxSeason.april.n.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <p className="cashflow__spread">
                      March vs April:{" "}
                      <strong>
                        {signal.taxSeason.spreadPts >= 0 ? "+" : ""}
                        {signal.taxSeason.spreadPts.toFixed(1)} pts
                      </strong>{" "}
                      (negative = March softer — the cash-for-taxes story)
                      {signal.taxSeason.todayKind === "march"
                        ? " — you are in the tax run-up month."
                        : signal.taxSeason.todayKind === "april"
                          ? " — you are in tax-deadline month."
                          : "."}{" "}
                      History, not destiny.
                    </p>
                  </div>
                ) : null}

                <ol className="odds-rank">
                  {signal.monthOdds.map((row) => {
                    const leanUp = row.upPct >= 50;
                    const isToday = monthIndexForIso(signal.asOfDate) === row.monthIndex;
                    const taxKind = taxSeasonKindForMonth(row.monthIndex);
                    return (
                      <li
                        key={row.monthIndex}
                        className={`${leanUp ? "is-up" : "is-down"}${isToday ? " is-today" : ""}${
                          taxKind === "march"
                            ? " is-rent"
                            : taxKind === "april"
                              ? " is-payday"
                              : ""
                        }`}
                      >
                        <span className="odds-rank__n">#{row.rank}</span>
                        <div className="odds-rank__body">
                          <p className="odds-rank__name">
                            {row.month}
                            {isToday ? <span className="odds-rank__tag"> now</span> : null}
                            {taxKind === "march" ? (
                              <span className="odds-rank__tag is-rent"> tax run-up</span>
                            ) : null}
                            {taxKind === "april" ? (
                              <span className="odds-rank__tag is-payday"> tax due</span>
                            ) : null}
                          </p>
                          <p className="odds-rank__meta">
                            Higher {row.upPct.toFixed(1)}% · Lower {row.downPct.toFixed(1)}% · n=
                            {row.n.toLocaleString()}
                          </p>
                        </div>
                        <div className="odds-rank__stats">
                          <span className="odds-rank__up">{row.upPct.toFixed(1)}%</span>
                          <span className="odds-rank__avg">
                            avg {row.avgMovePct >= 0 ? "+" : ""}
                            {row.avgMovePct.toFixed(2)}%
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : null}
          </div>
        ) : null}

        {!signal.weekdayOdds.length ? <SportsBulletinPromo /> : null}

        {signal.dayOfMonthOdds.length || signal.cpiWindow?.odds.length ? (
          <div className="desk-grid desk-grid--pair desk-row desk-row--cashflow">
        {signal.dayOfMonthOdds.length ? (
          <section className="panel" aria-labelledby="dom-title">
            <h2 id="dom-title">Day-of-month odds ranked</h2>
            <p className="panel-lede">
              ~10y SPY by calendar day. Watch the paycheck cycle: 1st &amp; 15th vs the last days
              before rent and mortgages hit.
            </p>

            {signal.cashflowCycle ? (
              <div className="cashflow">
                <p className="cashflow__title">Paycheck vs bills</p>
                <div className="cashflow__grid">
                  <div className="cashflow__card is-payday">
                    <p className="cashflow__kicker">Payday · 1st &amp; 15th</p>
                    <p className="cashflow__num">{signal.cashflowCycle.paydayAvgUpPct.toFixed(1)}%</p>
                    <p className="cashflow__note">
                      avg higher-close · best rank #
                      {signal.cashflowCycle.paydayBestRank}
                    </p>
                    <p className="cashflow__days">
                      {signal.cashflowCycle.paydayRows
                        .map((r) => `${r.label} #${r.rank}`)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="cashflow__card is-rent">
                    <p className="cashflow__kicker">Before rent · 28–31</p>
                    <p className="cashflow__num">{signal.cashflowCycle.rentAvgUpPct.toFixed(1)}%</p>
                    <p className="cashflow__note">
                      avg higher-close · weakest rank #
                      {signal.cashflowCycle.rentWorstRank}
                    </p>
                    <p className="cashflow__days">
                      {signal.cashflowCycle.rentRows
                        .map((r) => `${r.label} #${r.rank}`)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <p className="cashflow__spread">
                  Payday window beats late-month by{" "}
                  <strong>
                    {signal.cashflowCycle.spreadPts >= 0 ? "+" : ""}
                    {signal.cashflowCycle.spreadPts.toFixed(1)} pts
                  </strong>{" "}
                  historically
                  {signal.cashflowCycle.todayKind === "payday"
                    ? " — today sits in the payday window."
                    : signal.cashflowCycle.todayKind === "rent"
                      ? " — today sits in the rent-pressure window."
                      : "."}{" "}
                  A liquidity story people tell — not a guarantee.
                </p>
              </div>
            ) : null}

            <ol className="odds-rank odds-rank--compact">
              {signal.dayOfMonthOdds.map((row) => {
                const leanUp = row.upPct >= 50;
                const isToday = dayOfMonthForIso(signal.asOfDate) === row.day;
                const cashKind = cashflowKindForDay(row.day);
                return (
                  <li
                    key={row.day}
                    className={`${leanUp ? "is-up" : "is-down"}${isToday ? " is-today" : ""}${
                      cashKind === "payday" ? " is-payday" : cashKind === "rent" ? " is-rent" : ""
                    }`}
                  >
                    <span className="odds-rank__n">#{row.rank}</span>
                    <div className="odds-rank__body">
                      <p className="odds-rank__name">
                        {row.label}
                        {isToday ? <span className="odds-rank__tag"> today</span> : null}
                        {cashKind === "payday" ? (
                          <span className="odds-rank__tag is-payday"> payday</span>
                        ) : null}
                        {cashKind === "rent" ? (
                          <span className="odds-rank__tag is-rent"> rent due</span>
                        ) : null}
                      </p>
                      <p className="odds-rank__meta">
                        Higher {row.upPct.toFixed(1)}% · Lower {row.downPct.toFixed(1)}% · n=
                        {row.n.toLocaleString()}
                      </p>
                    </div>
                    <div className="odds-rank__stats">
                      <span className="odds-rank__up">{row.upPct.toFixed(1)}%</span>
                      <span className="odds-rank__avg">
                        avg {row.avgMovePct >= 0 ? "+" : ""}
                        {row.avgMovePct.toFixed(2)}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        {signal.cpiWindow?.odds.length ? (
          <section className="panel" aria-labelledby="cpi-title">
            <h2 id="cpi-title">CPI release window odds</h2>
            <p className="panel-lede">
              ~10y SPY around mid-month inflation prints — ranked by historical higher-close rate.
              Proxy: weekday nearest the 12th (not official BLS dates).
            </p>

            <div className="cashflow cpi-window">
              <p className="cashflow__title">Inflation print window</p>
              <div className="cashflow__grid">
                <div
                  className={`cashflow__card ${
                    signal.cpiWindow.windowVsQuietPts >= 0 ? "is-payday" : "is-rent"
                  }`}
                >
                  <p className="cashflow__kicker">Window vs quiet</p>
                  <p className="cashflow__num">
                    {signal.cpiWindow.windowVsQuietPts >= 0 ? "+" : ""}
                    {signal.cpiWindow.windowVsQuietPts.toFixed(1)}
                    <span className="cashflow__unit"> pts</span>
                  </p>
                  <p className="cashflow__note">eve / day / +1 / +2 vs other days</p>
                </div>
                <div
                  className={`cashflow__card ${
                    signal.cpiWindow.todayKind !== "quiet" ? "is-rent" : "is-payday"
                  }`}
                >
                  <p className="cashflow__kicker">Today</p>
                  <p className="cashflow__num cashflow__num--sm">
                    {signal.cpiWindow.odds.find((o) => o.kind === signal.cpiWindow!.todayKind)
                      ?.label ?? "Quiet"}
                  </p>
                  <p className="cashflow__note">
                    Next proxy {signal.cpiWindow.nextCpi ?? "—"}
                  </p>
                </div>
              </div>
              <p className="cashflow__spread">
                CPI weeks are when inflation headlines hit — history can lean either way. Treat the
                ranks as a calendar lens, not a forecast.
              </p>
            </div>

            <ol className="odds-rank">
              {signal.cpiWindow.odds.map((row) => {
                const leanUp = row.upPct >= 50;
                const isToday = signal.cpiWindow!.todayKind === row.kind;
                const isWindow = row.kind !== "quiet";
                return (
                  <li
                    key={row.kind}
                    className={`${leanUp ? "is-up" : "is-down"}${isToday ? " is-today" : ""}${
                      isWindow ? " is-cpi" : ""
                    }`}
                  >
                    <span className="odds-rank__n">#{row.rank}</span>
                    <div className="odds-rank__body">
                      <p className="odds-rank__name">
                        {row.label}
                        {isToday ? <span className="odds-rank__tag"> today</span> : null}
                        {isWindow ? <span className="odds-rank__tag is-cpi"> CPI</span> : null}
                      </p>
                      <p className="odds-rank__meta">
                        Higher {row.upPct.toFixed(1)}% · Lower {row.downPct.toFixed(1)}% · n=
                        {row.n.toLocaleString()}
                      </p>
                    </div>
                    <div className="odds-rank__stats">
                      <span className="odds-rank__up">{row.upPct.toFixed(1)}%</span>
                      <span className="odds-rank__avg">
                        avg {row.avgMovePct >= 0 ? "+" : ""}
                        {row.avgMovePct.toFixed(2)}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
          </div>
        ) : null}

        <div className="desk-grid desk-grid--pair desk-row desk-row--stats">
          <section className="panel" aria-labelledby="history-title">
            <h2 id="history-title">Historical comparison</h2>
            <p className="panel-lede">{signal.historical.sampleLabel}</p>
            <div className="stat-grid">
              <div className="stat-card">
                <p className="stat-kicker">Finished higher</p>
                <p className="stat-num">{signal.historical.winRate.toFixed(1)}%</p>
                <p className="stat-note">n ≈ {signal.historical.n.toLocaleString()}</p>
              </div>
              <div className="stat-card">
                <p className="stat-kicker">Avg. next-day move</p>
                <p className="stat-num">
                  {signal.historical.avgMovePct > 0 ? "+" : ""}
                  {signal.historical.avgMovePct.toFixed(2)}%
                </p>
                <p className="stat-note">SPY sample</p>
              </div>
            </div>
          </section>
        </div>

        <p className="disclaimer">{signal.disclaimer}</p>
      </main>
      )}

      <footer className="footer">
        <p>ArrowBeat · Free Yahoo Finance quotes · Before the opening bell</p>
      </footer>
    </div>
  );
}
